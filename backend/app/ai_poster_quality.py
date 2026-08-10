"""Deterministic quality checks for Seedream inputs and generated posters."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageStat

EXPECTED_SIZE = (1584, 2816)
MIN_ENTROPY = 2.0
MIN_LUMINANCE_STDDEV = 8.0
SIMILAR_CANDIDATE_HASH_DISTANCE = 4


class AiPosterQualityError(ValueError):
    """An input or generated image is not usable."""


@dataclass(frozen=True)
class AiPosterQuality:
    width: int
    height: int
    entropy: float
    luminance_stddev: float
    perceptual_hash: str
    warnings: list[str]


def reject_duplicate_inputs(paths: list[Path]) -> None:
    seen: dict[str, str] = {}
    for path in paths:
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        previous = seen.get(digest)
        if previous:
            raise AiPosterQualityError(
                f"照片内容重复：{previous} 与 {path.name}",
            )
        seen[digest] = path.name


def _difference_hash(image: Image.Image) -> str:
    grayscale = image.convert("L").resize((9, 8), Image.Resampling.LANCZOS)
    if hasattr(grayscale, "get_flattened_data"):
        pixels = list(grayscale.get_flattened_data())
    else:
        pixels = list(grayscale.getdata())
    bits: list[str] = []
    for row in range(8):
        offset = row * 9
        bits.extend(
            "1" if pixels[offset + column] > pixels[offset + column + 1] else "0"
            for column in range(8)
        )
    return f"{int(''.join(bits), 2):016x}"


def inspect_generated_poster(path: Path) -> AiPosterQuality:
    try:
        with Image.open(path) as image:
            image.load()
            width, height = image.size
            grayscale = image.convert("L")
            entropy = float(grayscale.entropy())
            luminance_stddev = float(ImageStat.Stat(grayscale).stddev[0])
            perceptual_hash = _difference_hash(image)
    except (OSError, ValueError) as exc:
        raise AiPosterQualityError(f"无法读取生成图片：{path.name}") from exc

    if entropy < MIN_ENTROPY or luminance_stddev < MIN_LUMINANCE_STDDEV:
        raise AiPosterQualityError(
            "生成图片接近空白或纯色，已拒绝保存为候选",
        )

    warnings: list[str] = []
    if (width, height) != EXPECTED_SIZE:
        warnings.append(
            f"输出尺寸为 {width}x{height}，不是标准 2K 竖图 "
            f"{EXPECTED_SIZE[0]}x{EXPECTED_SIZE[1]}",
        )
    return AiPosterQuality(
        width=width,
        height=height,
        entropy=round(entropy, 3),
        luminance_stddev=round(luminance_stddev, 3),
        perceptual_hash=perceptual_hash,
        warnings=warnings,
    )


def hash_distance(left: str, right: str) -> int:
    return (int(left, 16) ^ int(right, 16)).bit_count()


def candidates_are_too_similar(
    left: AiPosterQuality,
    right: AiPosterQuality,
) -> bool:
    return (
        hash_distance(left.perceptual_hash, right.perceptual_hash)
        <= SIMILAR_CANDIDATE_HASH_DISTANCE
    )
