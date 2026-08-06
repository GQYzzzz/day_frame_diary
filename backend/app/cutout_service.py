"""本地 U²-Net 主体抠图与手账风透明素材生成。"""

import os
import threading
import uuid
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageFilter, ImageOps

from app.schemas import CutoutAssetModel, NormalizedRectModel, PhotoAnalysisModel

BACKEND_DIR = Path(__file__).resolve().parent.parent
MODEL_PATH = BACKEND_DIR / ".models" / "u2net" / "u2net.onnx"
MODEL_INPUT_SIZE = (320, 320)
DEFAULT_MAX_CUTOUTS = 3
DEFAULT_OUTPUT_MAX_SIDE = 2048

_session: ort.InferenceSession | None = None
_session_lock = threading.Lock()
_inference_lock = threading.Lock()


class CutoutError(Exception):
    """单张图片抠图失败，但不应中断整页生成。"""


def _configured_model_path() -> Path:
    raw = os.environ.get("DAYFRAME_CUTOUT_MODEL", "").strip()
    if not raw:
        return MODEL_PATH
    path = Path(raw).expanduser()
    return path.resolve() if path.is_absolute() else (BACKEND_DIR / path).resolve()


def _max_cutouts() -> int:
    raw = os.environ.get("DAYFRAME_MAX_CUTOUTS", str(DEFAULT_MAX_CUTOUTS))
    try:
        return max(0, min(9, int(raw)))
    except ValueError:
        return DEFAULT_MAX_CUTOUTS


def _output_max_side() -> int:
    raw = os.environ.get(
        "DAYFRAME_CUTOUT_MAX_SIDE",
        str(DEFAULT_OUTPUT_MAX_SIDE),
    )
    try:
        return max(512, min(4096, int(raw)))
    except ValueError:
        return DEFAULT_OUTPUT_MAX_SIDE


def _cutout_enabled() -> bool:
    raw = os.environ.get("DAYFRAME_CUTOUT_ENABLED", "true").strip().lower()
    return raw not in {"0", "false", "no", "off"}


def _inference_threads() -> int:
    raw = os.environ.get("DAYFRAME_CUTOUT_THREADS", "2")
    try:
        return max(1, min(8, int(raw)))
    except ValueError:
        return 2


def _get_session() -> ort.InferenceSession:
    global _session
    if _session is not None:
        return _session
    with _session_lock:
        if _session is not None:
            return _session
        model_path = _configured_model_path()
        if not model_path.is_file():
            raise CutoutError(f"抠图模型不存在: {model_path}")
        options = ort.SessionOptions()
        options.intra_op_num_threads = _inference_threads()
        options.inter_op_num_threads = 1
        options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        _session = ort.InferenceSession(
            str(model_path),
            sess_options=options,
            providers=["CPUExecutionProvider"],
        )
    return _session


def _resolve_source(upload_dir: Path, filename: str) -> Path:
    path = (upload_dir / filename).resolve()
    try:
        path.relative_to(upload_dir.resolve())
    except ValueError as e:
        raise CutoutError("非法图片路径") from e
    if not path.is_file():
        raise CutoutError(f"找不到图片: {filename}")
    return path


def _load_working_image(path: Path) -> Image.Image:
    try:
        with Image.open(path) as source:
            image = ImageOps.exif_transpose(source).convert("RGBA")
    except (OSError, ValueError) as e:
        raise CutoutError(f"无法读取图片: {path.name}") from e
    image.thumbnail(
        (_output_max_side(), _output_max_side()),
        Image.Resampling.LANCZOS,
    )
    return image


def _model_input(image: Image.Image) -> np.ndarray:
    rgb = image.convert("RGB").resize(
        MODEL_INPUT_SIZE,
        Image.Resampling.LANCZOS,
    )
    array = np.asarray(rgb, dtype=np.float32) / 255.0
    mean = np.asarray([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.asarray([0.229, 0.224, 0.225], dtype=np.float32)
    normalized = (array - mean) / std
    return np.transpose(normalized, (2, 0, 1))[None, ...]


def _predict_mask(image: Image.Image) -> Image.Image:
    session = _get_session()
    input_meta = session.get_inputs()[0]
    output_name = session.get_outputs()[0].name
    with _inference_lock:
        output = session.run(
            [output_name],
            {input_meta.name: _model_input(image)},
        )[0]
    prediction = np.asarray(output[0, 0], dtype=np.float32)
    low = float(prediction.min())
    high = float(prediction.max())
    if high - low < 1e-6:
        raise CutoutError("模型未识别到可分离主体")
    prediction = (prediction - low) / (high - low)
    mask = Image.fromarray(
        np.clip(prediction * 255.0, 0, 255).astype(np.uint8),
        mode="L",
    )
    mask = mask.resize(image.size, Image.Resampling.LANCZOS)
    return mask.filter(ImageFilter.GaussianBlur(radius=0.7))


def _subject_bounds(mask: Image.Image) -> tuple[int, int, int, int]:
    threshold = mask.point(lambda value: 255 if value >= 24 else 0)
    bounds = threshold.getbbox()
    if bounds is None:
        raise CutoutError("没有检测到有效主体")
    left, top, right, bottom = bounds
    if (right - left) * (bottom - top) < mask.width * mask.height * 0.005:
        raise CutoutError("检测到的主体面积过小")
    return bounds


def _normalized_bounds(
    bounds: tuple[int, int, int, int],
    size: tuple[int, int],
) -> NormalizedRectModel:
    left, top, right, bottom = bounds
    width, height = size
    return NormalizedRectModel(
        x=left / width,
        y=top / height,
        width=(right - left) / width,
        height=(bottom - top) / height,
    )


def _expanded_crop(
    bounds: tuple[int, int, int, int],
    size: tuple[int, int],
) -> tuple[int, int, int, int]:
    left, top, right, bottom = bounds
    width, height = size
    margin = max(4, round(max(right - left, bottom - top) * 0.025))
    return (
        max(0, left - margin),
        max(0, top - margin),
        min(width, right + margin),
        min(height, bottom + margin),
    )


def _styled_cutout(
    image: Image.Image,
    mask: Image.Image,
    bounds: tuple[int, int, int, int],
) -> Image.Image:
    crop = _expanded_crop(bounds, image.size)
    subject = image.crop(crop)
    alpha = mask.crop(crop)
    subject.putalpha(alpha)

    outline_radius = max(3, min(12, round(max(subject.size) * 0.008)))
    padding = outline_radius * 4
    canvas_size = (
        subject.width + padding * 2,
        subject.height + padding * 2,
    )
    center = (padding, padding)

    expanded_alpha = Image.new("L", canvas_size, 0)
    expanded_alpha.paste(alpha, center)
    outline_alpha = expanded_alpha.filter(
        ImageFilter.MaxFilter(outline_radius * 2 + 1),
    )

    shadow_alpha = outline_alpha.filter(
        ImageFilter.GaussianBlur(radius=outline_radius * 1.6),
    )
    shadow_alpha = shadow_alpha.point(lambda value: round(value * 0.42))

    canvas = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    shadow = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    shadow.putalpha(shadow_alpha)
    shadow_offset = max(2, outline_radius // 2)
    shifted_shadow = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    shifted_shadow.alpha_composite(shadow, (shadow_offset, shadow_offset))
    canvas.alpha_composite(shifted_shadow)

    outline = Image.new("RGBA", canvas_size, (249, 246, 238, 0))
    outline.putalpha(outline_alpha)
    canvas.alpha_composite(outline)
    canvas.alpha_composite(subject, center)
    return canvas


def _save_png(upload_dir: Path, image: Image.Image) -> str:
    filename = f"{uuid.uuid4()}.png"
    image.save(upload_dir / filename, format="PNG", optimize=True)
    return filename


def _cutout_one(
    upload_dir: Path,
    filename: str,
    photo_index: int,
) -> CutoutAssetModel:
    image = _load_working_image(_resolve_source(upload_dir, filename))
    mask = _predict_mask(image)
    bounds = _subject_bounds(mask)
    cutout = _styled_cutout(image, mask, bounds)
    cutout_name = _save_png(upload_dir, cutout)
    mask_name = _save_png(upload_dir, mask)
    return CutoutAssetModel(
        photo_index=photo_index,
        status="ready",
        url=f"/api/uploads/{cutout_name}",
        mask_url=f"/api/uploads/{mask_name}",
        subject_bounds=_normalized_bounds(bounds, image.size),
    )


def _selected_indices(
    analyses: list[PhotoAnalysisModel],
) -> set[int]:
    candidates = [
        item
        for item in analyses
        if item.recommended_render == "cutout"
    ]
    role_rank = {"hero": 0, "support": 1, "detail": 2}
    candidates.sort(
        key=lambda item: (
            role_rank.get(item.layout_role, 3),
            -item.importance,
            item.index,
        ),
    )
    return {item.index for item in candidates[: _max_cutouts()]}


def generate_cutout_assets(
    upload_dir: Path,
    filenames: list[str],
    analyses: list[PhotoAnalysisModel],
) -> list[CutoutAssetModel]:
    """为被选中的照片生成透明素材；单张失败时返回 failed 供前端降级。"""
    if len(filenames) != len(analyses):
        raise ValueError("照片数量与分析结果数量不一致")

    selected = _selected_indices(analyses) if _cutout_enabled() else set()
    assets: list[CutoutAssetModel] = []
    for index, filename in enumerate(filenames):
        if index not in selected:
            assets.append(CutoutAssetModel(photo_index=index, status="skipped"))
            continue
        try:
            assets.append(_cutout_one(upload_dir, filename, index))
        except Exception as e:
            assets.append(
                CutoutAssetModel(
                    photo_index=index,
                    status="failed",
                    error=f"{type(e).__name__}: {e}",
                ),
            )
    return assets
