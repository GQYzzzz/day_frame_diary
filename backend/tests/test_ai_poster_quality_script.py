from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from scripts.quality_check_ai_posters import validate_cases


class AiPosterQualityScriptTest(unittest.TestCase):
    def test_accepts_complete_count_and_category_matrix(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            photo_index = 0

            def photos(count: int) -> list[str]:
                nonlocal photo_index
                values: list[str] = []
                for _ in range(count):
                    photo_index += 1
                    path = root / f"photo-{photo_index}.jpg"
                    path.write_bytes(f"unique-{photo_index}".encode())
                    values.append(path.name)
                return values

            cases = [
                {
                    "id": "one",
                    "photos": photos(1),
                    "categories": ["portrait"],
                    "template_id": "citywalk",
                },
                {
                    "id": "three",
                    "photos": photos(3),
                    "categories": ["group", "food"],
                    "template_id": "citywalk",
                },
                {
                    "id": "six",
                    "photos": photos(6),
                    "categories": ["architecture", "night"],
                    "template_id": "morning-ride",
                },
                {
                    "id": "nine",
                    "photos": photos(9),
                    "categories": ["screen"],
                    "template_id": "citywalk",
                },
            ]
            validate_cases(cases, root)

    def test_rejects_incomplete_matrix(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            photo = root / "photo.jpg"
            photo.write_bytes(b"photo")
            with self.assertRaisesRegex(ValueError, "缺少照片数量场景"):
                validate_cases(
                    [{
                        "id": "one",
                        "photos": [photo.name],
                        "categories": ["portrait"],
                        "template_id": "citywalk",
                    }],
                    root,
                )


if __name__ == "__main__":
    unittest.main()
