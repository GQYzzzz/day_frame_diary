import io
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageOps

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
EXIF_ORIENTATION_TAG = 274
EXIF_DATETIME_TAGS = (36867, 36868, 306)


@dataclass(frozen=True)
class PhotoMetadata:
    index: int
    width: int
    height: int
    aspect_ratio: float
    orientation: str
    captured_at: str | None


def _parse_exif_datetime(exif: Image.Exif) -> str | None:
    for tag in EXIF_DATETIME_TAGS:
        raw = exif.get(tag)
        if not isinstance(raw, str):
            continue
        value = raw.strip().strip("\x00")
        try:
            return datetime.strptime(value[:19], "%Y:%m:%d %H:%M:%S").isoformat()
        except ValueError:
            continue
    return None


def _orientation_for_size(width: int, height: int) -> str:
    ratio = width / height
    if ratio > 1.05:
        return "landscape"
    if ratio < 0.95:
        return "portrait"
    return "square"


def inspect_image(path: Path, index: int) -> PhotoMetadata:
    """读取照片显示方向下的尺寸与拍摄时间，不修改源文件。"""
    try:
        with Image.open(path) as source:
            exif = source.getexif()
            captured_at = _parse_exif_datetime(exif)
            displayed = ImageOps.exif_transpose(source)
            width, height = displayed.size
    except (OSError, ValueError) as e:
        raise ValueError(f"无法读取图片: {path.name}") from e

    if width <= 0 or height <= 0:
        raise ValueError(f"图片尺寸无效: {path.name}")
    return PhotoMetadata(
        index=index,
        width=width,
        height=height,
        aspect_ratio=round(width / height, 6),
        orientation=_orientation_for_size(width, height),
        captured_at=captured_at,
    )


def read_image_for_model(path: Path) -> tuple[bytes, str]:
    raw = path.read_bytes()
    ext = path.suffix.lower().lstrip(".")
    if ext not in EXT_TO_MIME:
        raise ValueError(f"不支持的扩展名: {ext}")

    try:
        with Image.open(io.BytesIO(raw)) as source:
            exif_orientation = source.getexif().get(EXIF_ORIENTATION_TAG, 1)
            if (
                len(raw) <= SKIP_REENCODE_BELOW
                and ext in ("jpg", "jpeg")
                and exif_orientation in (None, 1)
            ):
                return raw, "image/jpeg"

            img = ImageOps.exif_transpose(source)
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")
            img.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    except (OSError, ValueError) as e:
        raise ValueError(f"无法读取图片: {path.name}") from e
    return buf.getvalue(), "image/jpeg"
