import io
from pathlib import Path

from PIL import Image

EXT_TO_MIME = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
    "gif": "image/gif",
}

MAX_SIDE = 1024
JPEG_QUALITY = 78
SKIP_REENCODE_BELOW = 350_000


def read_image_for_model(path: Path) -> tuple[bytes, str]:
    raw = path.read_bytes()
    ext = path.suffix.lower().lstrip(".")
    if ext not in EXT_TO_MIME:
        raise ValueError(f"不支持的扩展名: {ext}")
    if len(raw) <= SKIP_REENCODE_BELOW and ext in ("jpg", "jpeg"):
        return raw, "image/jpeg"

    img = Image.open(io.BytesIO(raw))
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    img.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return buf.getvalue(), "image/jpeg"
