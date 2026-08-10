from __future__ import annotations

import base64
import http.client
import json
import os
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from app.ai_template_config import PICTURES_DIR
from app.seedream_client import (
    SeedreamApiError,
    _compressed_image_bytes,
    build_request_payload,
    generate_ai_poster,
)


def _png_bytes(width: int = 900, height: int = 1600) -> bytes:
    output = BytesIO()
    Image.new("RGB", (width, height), "#26352f").save(output, format="PNG")
    return output.getvalue()


class _FakeResponse:
    status = 200
    headers = {"x-request-id": "ark-request-123"}

    def __init__(self, body: dict) -> None:
        self._raw = json.dumps(body).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *args) -> None:
        del args
        return None

    def read(self) -> bytes:
        return self._raw


class SeedreamClientTest(unittest.TestCase):
    def test_builds_requests_for_1_3_6_9_photos(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            photos: list[Path] = []
            for index in range(9):
                path = Path(temp) / f"photo-{index}.png"
                Image.new(
                    "RGB",
                    (64 + index, 80 + index),
                    (20 + index, 40, 60),
                ).save(path)
                photos.append(path)
            for count in (1, 3, 6, 9):
                with self.subTest(count=count):
                    payload = build_request_payload(
                        photos[:count],
                        "citywalk",
                        include_image_data=False,
                    )
                    self.assertEqual(len(payload["image"]), count + 1)
                    self.assertIn(
                        f"图{count + 1}仅是模板参考图",
                        payload["prompt"],
                    )

    def test_large_input_is_normalized_and_compressed(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "large.png"
            Image.new("RGBA", (3200, 2400), (20, 80, 120, 128)).save(path)
            with patch.dict(
                os.environ,
                {
                    "SEEDREAM_INPUT_MAX_SIDE": "1024",
                    "SEEDREAM_INPUT_JPEG_QUALITY": "82",
                },
            ):
                compressed = _compressed_image_bytes(path)

            self.assertLess(len(compressed), path.stat().st_size)
            with Image.open(BytesIO(compressed)) as image:
                self.assertEqual(image.format, "JPEG")
                self.assertLessEqual(max(image.size), 1024)
                self.assertEqual(image.mode, "RGB")

    def test_mocked_seedream_request_saves_valid_png(self) -> None:
        generated = _png_bytes()
        response = _FakeResponse(
            {
                "model": "doubao-seedream-5-0-pro-260628",
                "data": [{"b64_json": base64.b64encode(generated).decode()}],
                "usage": {"generated_images": 1},
            },
        )
        captured: dict[str, object] = {}

        def fake_urlopen(request, timeout):
            captured["payload"] = json.loads(request.data.decode("utf-8"))
            captured["timeout"] = timeout
            return response

        with tempfile.TemporaryDirectory() as temp, patch.dict(
            os.environ,
            {"SEEDREAM_API_KEY": "test-key"},
        ), patch("urllib.request.urlopen", side_effect=fake_urlopen):
            result = generate_ai_poster(
                [PICTURES_DIR / "example_1.jpg"],
                "citywalk",
                Path(temp),
            )
            self.assertTrue(result.output_path.is_file())
            self.assertEqual(result.size, "900x1600")
            self.assertEqual(result.request_id, "ark-request-123")
            self.assertIsNone(result.seed)
            with Image.open(result.output_path) as image:
                self.assertEqual(image.format, "PNG")
                self.assertEqual(image.size, (900, 1600))

        payload = captured["payload"]
        self.assertEqual(payload["size"], "1584x2816")
        self.assertEqual(payload["output_format"], "png")
        self.assertEqual(len(payload["image"]), 2)
        self.assertTrue(
            all(
                value.startswith("data:image/jpeg;base64,")
                for value in payload["image"]
            ),
        )
        self.assertNotIn("seed", payload)
        self.assertIn("图1是用户照片", payload["prompt"])
        self.assertIn("图2仅是模板参考图", payload["prompt"])

    def test_remote_disconnect_is_reported_as_upstream_error(self) -> None:
        with tempfile.TemporaryDirectory() as temp, patch.dict(
            os.environ,
            {"SEEDREAM_API_KEY": "test-key"},
        ), patch(
            "urllib.request.urlopen",
            side_effect=http.client.RemoteDisconnected("closed"),
        ):
            with self.assertRaisesRegex(
                SeedreamApiError,
                "连接被远端中断",
            ):
                generate_ai_poster(
                    [PICTURES_DIR / "example_1.jpg"],
                    "citywalk",
                    Path(temp),
                )


if __name__ == "__main__":
    unittest.main()
