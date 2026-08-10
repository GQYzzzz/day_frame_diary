from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from PIL import Image

from app.ai_poster_quality import (
    AiPosterQualityError,
    candidates_are_too_similar,
    inspect_generated_poster,
    reject_duplicate_inputs,
)


def write_pattern(path: Path, offset: int = 0) -> None:
    image = Image.new("RGB", (90, 160))
    pixels = image.load()
    for y in range(160):
        for x in range(90):
            pixels[x, y] = (
                (x * 11 + offset) % 256,
                (y * 7 + offset) % 256,
                ((x + y) * 5 + offset) % 256,
            )
    image.save(path, format="PNG")


class AiPosterQualityTest(unittest.TestCase):
    def test_rejects_duplicate_inputs_with_different_names(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            first = Path(temp) / "first.jpg"
            second = Path(temp) / "second.jpg"
            first.write_bytes(b"same-image-content")
            second.write_bytes(b"same-image-content")
            with self.assertRaisesRegex(AiPosterQualityError, "照片内容重复"):
                reject_duplicate_inputs([first, second])

    def test_rejects_blank_generated_image(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "blank.png"
            Image.new("RGB", (90, 160), "white").save(path)
            with self.assertRaisesRegex(AiPosterQualityError, "空白或纯色"):
                inspect_generated_poster(path)

    def test_reports_nonstandard_size_and_similarity(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            first = Path(temp) / "first.png"
            second = Path(temp) / "second.png"
            write_pattern(first)
            write_pattern(second)
            left = inspect_generated_poster(first)
            right = inspect_generated_poster(second)
            self.assertTrue(left.warnings)
            self.assertTrue(candidates_are_too_similar(left, right))


if __name__ == "__main__":
    unittest.main()
