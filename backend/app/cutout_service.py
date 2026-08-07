"""本地 BiRefNet 主体抠图与手账风透明素材生成。"""

import os
import threading
import uuid
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageFilter, ImageOps
from rembg import new_session, remove
from scipy import ndimage

from app.schemas import CutoutAssetModel, NormalizedRectModel, PhotoAnalysisModel

BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_MODEL_NAME = "birefnet-general"
DEFAULT_PORTRAIT_MODEL_NAME = "birefnet-portrait"
DEFAULT_MODEL_DIR = BACKEND_DIR / ".models" / "rembg"
SUPPORTED_MODELS = {
    "birefnet-general-lite",
    "birefnet-general",
    "birefnet-portrait",
}
DEFAULT_MAX_CUTOUTS = 3
DEFAULT_OUTPUT_MAX_SIDE = 2048
HUMAN_PART_MARKERS = (
    "人物",
    "人像",
    "全身",
    "半身",
    "头发",
    "头部",
    "脸",
    "手持",
    "手臂",
    "前臂",
    "手腕",
    "双手",
    "握",
)
FRAME_ONLY_MARKERS = (
    "舞台",
    "演唱会",
    "音乐节",
    "观众席",
    "全景",
    "夜景",
    "街景",
    "城市景观",
    "室内空间",
    "大屏",
    "屏幕画面",
    "电影画面",
    "拼图",
    "合成图",
    "stage",
    "concert",
    "audience",
    "cityscape",
    "collage",
)
MIN_FOREGROUND_RATIO = 0.005
MIN_LARGEST_COMPONENT_SHARE = 0.45

_session: object | None = None
_session_model_name: str | None = None
_session_lock = threading.Lock()
_inference_lock = threading.Lock()


class CutoutError(Exception):
    """单张图片抠图失败，但不应中断整页生成。"""


def _configured_model_name() -> str:
    name = os.environ.get(
        "DAYFRAME_CUTOUT_MODEL",
        DEFAULT_MODEL_NAME,
    ).strip()
    if name not in SUPPORTED_MODELS:
        supported = ", ".join(sorted(SUPPORTED_MODELS))
        raise CutoutError(f"不支持的抠图模型 {name!r}，可选: {supported}")
    return name


def _configured_portrait_model_name() -> str:
    name = os.environ.get(
        "DAYFRAME_CUTOUT_PORTRAIT_MODEL",
        DEFAULT_PORTRAIT_MODEL_NAME,
    ).strip()
    if name not in SUPPORTED_MODELS:
        supported = ", ".join(sorted(SUPPORTED_MODELS))
        raise CutoutError(f"不支持的人像抠图模型 {name!r}，可选: {supported}")
    return name


def _model_name_for_analysis(analysis: PhotoAnalysisModel) -> str:
    if _has_human_parts(analysis):
        return _configured_portrait_model_name()
    return _configured_model_name()


def _configured_model_dir() -> Path:
    raw = os.environ.get("DAYFRAME_CUTOUT_MODEL_DIR", "").strip()
    if not raw:
        return DEFAULT_MODEL_DIR
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


def _mask_bounds_threshold() -> int:
    raw = os.environ.get("DAYFRAME_CUTOUT_BOUNDS_THRESHOLD", "8")
    try:
        return max(1, min(128, int(raw)))
    except ValueError:
        return 8


def _hole_area_ratio() -> float:
    raw = os.environ.get("DAYFRAME_CUTOUT_MAX_HOLE_RATIO", "0.001")
    try:
        return max(0.0, min(0.05, float(raw)))
    except ValueError:
        return 0.001


def _closing_radius(image_size: tuple[int, int]) -> int:
    raw = os.environ.get("DAYFRAME_CUTOUT_CLOSING_RADIUS", "")
    if raw:
        try:
            return max(0, min(24, int(raw)))
        except ValueError:
            pass
    return max(2, min(10, round(max(image_size) * 0.003)))


def _get_session(model_name: str) -> object:
    global _session, _session_model_name
    if _session is not None and _session_model_name == model_name:
        return _session
    with _session_lock:
        if _session is not None and _session_model_name == model_name:
            return _session
        model_dir = _configured_model_dir()
        model_dir.mkdir(parents=True, exist_ok=True)
        os.environ["U2NET_HOME"] = str(model_dir)
        options = ort.SessionOptions()
        options.intra_op_num_threads = _inference_threads()
        options.inter_op_num_threads = 1
        options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        _session = new_session(
            model_name,
            sess_opts=options,
            providers=["CPUExecutionProvider"],
        )
        _session_model_name = model_name
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


def _predict_mask(image: Image.Image, model_name: str) -> Image.Image:
    session = _get_session(model_name)
    with _inference_lock:
        result = remove(
            image.convert("RGB"),
            session=session,
            only_mask=True,
            post_process_mask=False,
    )
    if not isinstance(result, Image.Image):
        raise CutoutError("抠图模型未返回有效蒙版")
    mask = result.convert("L")
    if mask.size != image.size:
        mask = mask.resize(image.size, Image.Resampling.LANCZOS)
    extrema = mask.getextrema()
    if not extrema or extrema[1] - extrema[0] < 2:
        raise CutoutError("模型未识别到可分离主体")
    return mask.filter(ImageFilter.GaussianBlur(radius=0.45))


def _has_human_parts(analysis: PhotoAnalysisModel) -> bool:
    semantic_text = " ".join(
        [analysis.subject_summary, *analysis.cutout_group],
    )
    return (
        analysis.include_human_parts
        or analysis.has_faces
        or analysis.subject_type in {"portrait", "group"}
        or any(marker in semantic_text for marker in HUMAN_PART_MARKERS)
    )


def _is_cutout_candidate(analysis: PhotoAnalysisModel) -> bool:
    if analysis.recommended_render != "cutout":
        return False
    if analysis.subject_type == "landscape":
        return False
    semantic_text = " ".join(
        [analysis.subject_summary, *analysis.cutout_group],
    ).lower()
    return not any(marker in semantic_text for marker in FRAME_ONLY_MARKERS)


def _merge_related_masks(
    primary: Image.Image,
    secondary: Image.Image,
) -> Image.Image:
    """只合并与主蒙版相交的次模型组件，排除远处误识别背景。"""
    primary_array = np.asarray(primary, dtype=np.uint8)
    secondary_array = np.asarray(secondary, dtype=np.uint8)
    primary_core = primary_array >= 32
    secondary_candidate = secondary_array >= 8
    labels, count = ndimage.label(secondary_candidate)
    if count == 0:
        return primary

    touching_labels = np.unique(labels[primary_core])
    touching_labels = touching_labels[touching_labels != 0]
    if touching_labels.size == 0:
        return primary

    related = np.isin(labels, touching_labels)
    output = primary_array.copy()
    output[related] = np.maximum(
        output[related],
        secondary_array[related],
    )
    return Image.fromarray(output, mode="L")


def _predict_group_mask(
    image: Image.Image,
    analysis: PhotoAnalysisModel,
) -> Image.Image:
    primary_model = _model_name_for_analysis(analysis)
    primary = _predict_mask(image, primary_model)
    if not _has_human_parts(analysis):
        return primary

    general_model = _configured_model_name()
    if general_model == primary_model:
        return primary
    secondary = _predict_mask(image, general_model)
    return _merge_related_masks(primary, secondary)


def _fill_small_mask_holes(mask: Image.Image) -> Image.Image:
    """填补主体内部的小孔洞，不处理与画面边界连通的真实背景。"""
    threshold = 96
    foreground = np.asarray(mask, dtype=np.uint8) >= threshold
    holes = ndimage.binary_fill_holes(foreground) & ~foreground
    if not holes.any():
        return mask

    height, width = foreground.shape
    max_area = round(width * height * _hole_area_ratio())
    labels, count = ndimage.label(holes)
    if count == 0:
        return mask
    areas = np.bincount(labels.ravel())
    fill_labels = np.flatnonzero((areas <= max_area) & (areas > 0))
    fill_labels = fill_labels[fill_labels != 0]
    if fill_labels.size == 0:
        return mask

    output = np.asarray(mask, dtype=np.uint8).copy()
    output[np.isin(labels, fill_labels)] = 255
    return Image.fromarray(output, mode="L")


def _close_narrow_gaps(mask: Image.Image) -> Image.Image:
    """闭合头发、衣服轮廓上的窄缺口，保留肢体之间的大块镂空。"""
    radius = _closing_radius(mask.size)
    if radius <= 0:
        return mask
    kernel = radius * 2 + 1
    closed = mask.filter(ImageFilter.MaxFilter(kernel))
    closed = closed.filter(ImageFilter.MinFilter(kernel))
    return Image.fromarray(
        np.maximum(
            np.asarray(mask, dtype=np.uint8),
            np.asarray(closed, dtype=np.uint8),
        ),
        mode="L",
    )


def _refine_mask(
    mask: Image.Image,
    analysis: PhotoAnalysisModel,
) -> Image.Image:
    refined = _fill_small_mask_holes(mask)
    if (
        analysis.include_human_parts
        or analysis.has_faces
        or analysis.subject_type in {"portrait", "group"}
    ):
        refined = _close_narrow_gaps(refined)
    return refined.filter(ImageFilter.GaussianBlur(radius=0.35))


def _validate_mask_quality(mask: Image.Image) -> None:
    """拒绝仅识别到文字或零碎高光的蒙版，交由前端回退原图。"""
    foreground = np.asarray(mask, dtype=np.uint8) >= _mask_bounds_threshold()
    foreground_area = int(foreground.sum())
    image_area = foreground.size
    if foreground_area < image_area * MIN_FOREGROUND_RATIO:
        raise CutoutError("有效主体面积过小，已回退原图")

    labels, count = ndimage.label(foreground)
    if count <= 1:
        return
    areas = np.bincount(labels.ravel())[1:]
    largest_share = float(areas.max()) / foreground_area
    if largest_share < MIN_LARGEST_COMPONENT_SHARE:
        raise CutoutError("主体蒙版过于零碎，已回退原图")


def _subject_bounds(mask: Image.Image) -> tuple[int, int, int, int]:
    minimum_alpha = _mask_bounds_threshold()
    threshold = mask.point(
        lambda value: 255 if value >= minimum_alpha else 0,
    )
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
    analysis: PhotoAnalysisModel,
) -> CutoutAssetModel:
    image = _load_working_image(_resolve_source(upload_dir, filename))
    mask = _predict_group_mask(image, analysis)
    mask = _refine_mask(mask, analysis)
    _validate_mask_quality(mask)
    bounds = _subject_bounds(mask)
    cutout = _styled_cutout(image, mask, bounds)
    cutout_name = _save_png(upload_dir, cutout)
    mask_name = _save_png(upload_dir, mask)
    return CutoutAssetModel(
        photo_index=analysis.index,
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
        if _is_cutout_candidate(item)
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
            assets.append(_cutout_one(upload_dir, filename, analyses[index]))
        except Exception as e:
            assets.append(
                CutoutAssetModel(
                    photo_index=index,
                    status="failed",
                    error=f"{type(e).__name__}: {e}",
                ),
            )
    return assets
