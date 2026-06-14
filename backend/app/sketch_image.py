"""OpenAI 官方 Images API：gpt-image-2 + generate_plog.md 手绘 PLOG 定图。"""

import base64
import json
import os
import uuid
from pathlib import Path

from openai import OpenAI, OpenAIError

from app.schemas import DayFrameCopyModel

PROMPTS_DIR = Path(__file__).resolve().parents[2] / "prompts"
IMAGE_MODEL = "gpt-image-2"

_EXT_TO_MIME = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
    "gif": "image/gif",
}


class SketchAnnotateError(Exception):
    """gpt-image-2 图像编辑失败。"""


def openai_image_base_url() -> str:
    raw = (os.environ.get("OPENAI_IMAGE_BASE_URL") or "https://api.openai.com/v1").strip()
    u = raw.rstrip("/")
    if u.endswith("/chat/completions"):
        u = u[: -len("/chat/completions")].rstrip("/")
    if not u.endswith("/v1"):
        u = f"{u}/v1"
    return u


def openai_image_timeout_seconds() -> float:
    raw = os.environ.get("OPENAI_IMAGE_TIMEOUT", os.environ.get("OPENAI_TIMEOUT", "360")).strip()
    try:
        return max(60.0, float(raw))
    except ValueError:
        return 360.0


def require_image_api_key() -> str:
    key = (os.environ.get("OPENAI_IMAGE_API_KEY") or "").strip()
    if not key:
        raise RuntimeError("MISSING_IMAGE_API_KEY")
    return key


def create_image_client() -> OpenAI:
    return OpenAI(
        api_key=require_image_api_key(),
        base_url=openai_image_base_url(),
        timeout=openai_image_timeout_seconds(),
        max_retries=1,
    )


def placeholder_hand_drawn_copy(photo_count: int) -> DayFrameCopyModel:
    """手绘模板不调 chat 模型，返回可编辑的占位文案。"""
    return DayFrameCopyModel(
        title="今日随拍",
        diary="",
        captions=[f"第 {i + 1} 张" for i in range(photo_count)],
        hashtags=["#生活记录", "#日常", "#DayFrame"],
        sketches=None,
    )


def _load_edit_prompt() -> str:
    path = PROMPTS_DIR / "generate_plog.md"
    if path.is_file():
        return path.read_text(encoding="utf-8").strip()
    return (
        "Transform this photo into a premium scrapbook-style PLOG page. "
        "Add hand-drawn white doodle annotations in Simplified Chinese. "
        "Preserve the original photo composition."
    )


def _image_edit_kwargs(prompt: str) -> dict:
    quality = (os.environ.get("OPENAI_IMAGE_QUALITY") or "low").strip()
    size = (os.environ.get("OPENAI_IMAGE_SIZE") or "1024x1024").strip()
    return {
        "model": IMAGE_MODEL,
        "prompt": prompt,
        "n": 1,
        "size": size,
        "quality": quality,
    }


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

    ext = path.suffix.lower().lstrip(".")
    mime = _EXT_TO_MIME.get(ext)
    if not mime:
        raise ValueError(f"不支持的扩展名: {ext}")

    prompt = _load_edit_prompt()
    kwargs = _image_edit_kwargs(prompt)

    with path.open("rb") as image_file:
        try:
            resp = client.images.edit(image=image_file, **kwargs)
        except json.JSONDecodeError as e:
            raise SketchAnnotateError(
                "图像编辑接口返回非 JSON，请确认 OPENAI_IMAGE_BASE_URL 为官方 API。"
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
    out: list[str] = []
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
            raise SketchAnnotateError(f"{name}: {e!s}") from e
    return out
