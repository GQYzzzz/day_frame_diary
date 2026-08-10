from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from app.ai_poster_service import (
    _resolve_uploaded_photos,
    generate_ai_poster_from_uploads,
)
from app.seedream_client import SeedreamInputError
from app.seedream_client import SeedreamResult


def write_textured_png(path: Path, tone: int = 0) -> None:
    image = Image.new("RGB", (90, 160))
    pixels = image.load()
    for y in range(160):
        for x in range(90):
            pixels[x, y] = (
                (x * 7 + tone) % 256,
                (y * 5 + tone) % 256,
                ((x + y) * 3 + tone) % 256,
            )
    image.save(path, format="PNG")


class AiPosterServiceTest(unittest.TestCase):
    @patch("app.ai_poster_service.generate_ai_poster")
    def test_resolves_upload_and_returns_public_url(self, generate_mock) -> None:
        with tempfile.TemporaryDirectory() as temp:
            upload_dir = Path(temp)
            source_name = "11111111-1111-1111-1111-111111111111.jpg"
            output_name = "22222222-2222-2222-2222-222222222222.png"
            (upload_dir / source_name).write_bytes(b"uploaded")
            output_path = upload_dir / output_name
            write_textured_png(output_path)
            generate_mock.side_effect = [
                SeedreamResult(
                    output_path=output_path,
                    model="seedream-test",
                    template_id="citywalk",
                    size="1584x2816",
                    elapsed_ms=2500,
                    usage=None,
                    seed=None,
                    request_id="request-123",
                ),
            ]

            result = generate_ai_poster_from_uploads(
                upload_dir,
                [source_name],
                "citywalk",
                "travel",
                "暖色调",
                1,
            )

            self.assertEqual(
                result.generated_photos,
                [f"/api/uploads/{output_name}"],
            )
            self.assertEqual(result.template_id, "ai-poster-v1")
            self.assertEqual(result.style_id, "travel")
            self.assertIsNone(result.seed)
            self.assertFalse(result.seed_supported)
            self.assertEqual(result.request_id, "request-123")
            self.assertEqual(len(result.candidates), 1)
            self.assertEqual(result.requested_candidate_count, 1)
            generate_mock.assert_called_once()
            self.assertEqual(
                generate_mock.call_args.kwargs["additional_prompt"],
                "暖色调",
            )

    @patch("app.ai_poster_service.generate_ai_poster")
    def test_keeps_successful_candidate_when_one_fails(
        self,
        generate_mock,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp:
            upload_dir = Path(temp)
            source_name = "11111111-1111-1111-1111-111111111111.jpg"
            output_name = "22222222-2222-2222-2222-222222222222.png"
            (upload_dir / source_name).write_bytes(b"uploaded")
            output_path = upload_dir / output_name
            write_textured_png(output_path)
            generate_mock.side_effect = [
                RuntimeError("upstream failed"),
                SeedreamResult(
                    output_path=output_path,
                    model="seedream-test",
                    template_id="citywalk",
                    size="1584x2816",
                    elapsed_ms=2000,
                    usage=None,
                    seed=None,
                    request_id="request-ok",
                ),
            ]
            result = generate_ai_poster_from_uploads(
                upload_dir,
                [source_name],
                "citywalk",
                candidate_count=2,
            )
            self.assertEqual(len(result.candidates), 1)
            self.assertTrue(
                any("候选生成失败" in warning for warning in result.warnings),
            )

    def test_missing_upload_is_rejected_before_model_call(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(FileNotFoundError):
                generate_ai_poster_from_uploads(
                    Path(temp),
                    ["11111111-1111-1111-1111-111111111111.jpg"],
                    "morning-ride",
                )

    def test_accepts_supported_photo_count_matrix(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            upload_dir = Path(temp)
            names: list[str] = []
            for index in range(9):
                name = (
                    f"00000000-0000-0000-0000-{index + 1:012d}.jpg"
                )
                (upload_dir / name).write_bytes(f"photo-{index}".encode())
                names.append(name)
            for count in (1, 3, 6, 9):
                with self.subTest(count=count):
                    resolved = _resolve_uploaded_photos(
                        upload_dir,
                        names[:count],
                    )
                    self.assertEqual(len(resolved), count)

    @patch("app.ai_poster_service.generate_ai_poster")
    def test_rejects_duplicate_photo_content_before_generation(
        self,
        generate_mock,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp:
            upload_dir = Path(temp)
            names = [
                "11111111-1111-1111-1111-111111111111.jpg",
                "22222222-2222-2222-2222-222222222222.jpg",
            ]
            for name in names:
                (upload_dir / name).write_bytes(b"same-content")
            with self.assertRaisesRegex(SeedreamInputError, "照片内容重复"):
                generate_ai_poster_from_uploads(
                    upload_dir,
                    names,
                    "citywalk",
                    candidate_count=1,
                )
            generate_mock.assert_not_called()


if __name__ == "__main__":
    unittest.main()
