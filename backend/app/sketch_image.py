"""OpenAI Images API：在原图上叠加手绘标注（gpt-image-1 系列）。"""

import base64
import io
import json
import os
import uuid
from pathlib import Path

from openai import OpenAI, OpenAIError
from PIL import Image

PROMPTS_DIR = Path(__file__).resolve().parents[2] / "prompts"
MAX_EDIT_SIDE = 1536


class SketchAnnotateError(Exception):
    """图像编辑不可用或失败，应回退到前端 SVG 叠加。"""


def _load_edit_prompt() -> str:
    path = PROMPTS_DIR / "sketch_image_edit.md"
    if path.is_file():
        return path.read_text(encoding="utf-8").strip()
    return (
        "Add thin white hand-drawn English labels and loose outlines on this photo. "
        "Keep the photo unchanged. No overlapping text."
    )


def _image_model() -> str:
    return (os.environ.get("OPENAI_IMAGE_MODEL") or "gpt-image-1").strip()


def image_edit_enabled() -> bool:
    """默认关闭：第三方网关多不支持 /images/edits，且极慢。开启需官方 Images API。"""
    raw = (os.environ.get("HAND_DRAWN_USE_IMAGE_API") or "false").strip().lower()
    return raw in ("1", "true", "yes", "on")


def _sketch_edit_enabled() -> bool:
    return image_edit_enabled()


def _prepare_png_bytes(path: Path) -> bytes:
    raw = path.read_bytes()
    img = Image.open(io.BytesIO(raw))
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGB")
    elif img.mode == "RGBA":
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        img = bg
    img.thumbnail((MAX_EDIT_SIDE, MAX_EDIT_SIDE), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _save_edited_bytes(upload_dir: Path, data: bytes) -> str:
    name = f"{uuid.uuid4()}.png"
    dest = upload_dir / name
    dest.write_bytes(data)
    return name


def annotate_one_photo(client: OpenAI, upload_dir: Path, filename: str) -> str:
    path = (upload_dir / filename).resolve()
    try:
        path.relative_to(upload_dir.resolve())
    except ValueError as e:
        raise ValueError("非法路径") from e
    if not path.is_file():
        raise FileNotFoundError(filename)

    png_bytes = _prepare_png_bytes(path)
    prompt = _load_edit_prompt()
    model = _image_model()

    kwargs: dict = {
        "model": model,
        "image": ("source.png", png_bytes, "image/png"),
        "prompt": prompt,
        "quality": "high",
    }
    if model.startswith("gpt-image-1") and model != "gpt-image-1-mini":
        kwargs["input_fidelity"] = "high"

    try:
        resp = client.images.edit(**kwargs)
    except TypeError:
        kwargs.pop("input_fidelity", None)
        resp = client.images.edit(**kwargs)
    except json.JSONDecodeError as e:
        raise SketchAnnotateError(
            "图像编辑接口返回非 JSON（中转网关可能不支持 /v1/images/edits）。"
        ) from e

    data_list = getattr(resp, "data", None) or []
    if not data_list:
        raise SketchAnnotateError("图像编辑返回为空")

    item = data_list[0]
    b64 = getattr(item, "b64_json", None)
    if not b64:
        url = getattr(item, "url", None)
        if not url:
            raise SketchAnnotateError("图像编辑未返回 b64_json 或 url")
        import urllib.request

        with urllib.request.urlopen(url, timeout=120) as r:
            out_bytes = r.read()
    else:
        out_bytes = base64.b64decode(b64)

    return _save_edited_bytes(upload_dir, out_bytes)


def annotate_sketch_photos(
    client: OpenAI,
    upload_dir: Path,
    filenames: list[str],
) -> list[str]:
    if not _sketch_edit_enabled():
        raise SketchAnnotateError("HAND_DRAWN_USE_IMAGE_API 已关闭")

    out: list[str] = []
    errors: list[str] = []
    for name in filenames:
        try:
            out.append(annotate_one_photo(client, upload_dir, name))
        except (
            OpenAIError,
            OSError,
            ValueError,
            SketchAnnotateError,
            json.JSONDecodeError,
        ) as e:
            errors.append(f"{name}: {e!s}")

    if errors:
        raise SketchAnnotateError(
            "部分或全部手绘标注图生成失败（网关可能不支持 gpt-image-1 /images/edits）。"
            f" 详情: {'; '.join(errors[:3])}",
        )
    return out
