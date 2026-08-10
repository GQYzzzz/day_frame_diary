from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.ai_poster_service import AiPosterCandidate, AiPosterGeneration
from app.ai_poster_quality import AiPosterQuality
from app.main import app
from app.seedream_client import (
    SeedreamApiError,
    SeedreamConfigurationError,
    SeedreamTimeoutError,
)

PHOTO_NAME = "11111111-1111-1111-1111-111111111111.jpg"
OUTPUT_NAME = "22222222-2222-2222-2222-222222222222.png"


class AiPosterApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(app)

    def test_lists_client_safe_templates(self) -> None:
        response = self.client.get("/api/v1/ai-posters/templates")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["template_id"], "ai-poster-v1")
        self.assertEqual(body["label"], "AI 创意成片")
        self.assertEqual(
            {item["id"] for item in body["templates"]},
            {"morning-ride", "citywalk"},
        )
        serialized = response.text
        self.assertNotIn("reference_path", serialized)
        self.assertNotIn("prompt_template", serialized)
        self.assertNotIn("/Users/", serialized)

    @patch("app.main.generate_ai_poster_from_uploads")
    def test_generates_one_ai_poster(self, generate_mock) -> None:
        generate_mock.return_value = AiPosterGeneration(
            template_id="ai-poster-v1",
            style_id="literary",
            ai_template_id="citywalk",
            ai_template_label="Citywalk 拼贴",
            template_version="1.1.0",
            aspect_ratio="9:16",
            generated_photos=[f"/api/uploads/{OUTPUT_NAME}"],
            model="doubao-seedream-5-0-pro-260628",
            size="1584x2816",
            generation_duration_ms=1234,
            usage={"generated_images": 1},
            seed=None,
            seed_supported=False,
            request_id="request-123",
            candidates=[
                AiPosterCandidate(
                    id="candidate-1",
                    url=f"/api/uploads/{OUTPUT_NAME}",
                    model="doubao-seedream-5-0-pro-260628",
                    size="1584x2816",
                    generation_duration_ms=1200,
                    generated_at=1_700_000_000_000,
                    usage={"generated_images": 1},
                    seed=None,
                    seed_supported=False,
                    request_id="request-123",
                    quality=AiPosterQuality(
                        width=1584,
                        height=2816,
                        entropy=7.2,
                        luminance_stddev=42.0,
                        perceptual_hash="0123456789abcdef",
                        warnings=[],
                    ),
                ),
            ],
            requested_candidate_count=1,
            warnings=[],
        )
        response = self.client.post(
            "/api/v1/ai-posters/generate",
            json={
                "template_id": "ai-poster-v1",
                "style_id": "literary",
                "additional_prompt": "减少文字，多留白",
                "ai_template_id": "citywalk",
                "filenames": [PHOTO_NAME],
                "candidate_count": 1,
            },
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["generated_photos"], [
            f"/api/uploads/{OUTPUT_NAME}",
        ])
        self.assertEqual(body["generation_duration_ms"], 1234)
        self.assertEqual(body["style_id"], "literary")
        self.assertIsNone(body["seed"])
        self.assertFalse(body["seed_supported"])
        self.assertEqual(body["request_id"], "request-123")
        self.assertEqual(body["candidates"][0]["id"], "candidate-1")
        generate_mock.assert_called_once()
        self.assertEqual(generate_mock.call_args.args[1], [PHOTO_NAME])
        self.assertEqual(generate_mock.call_args.args[2], "citywalk")
        self.assertEqual(generate_mock.call_args.args[3], "literary")
        self.assertEqual(generate_mock.call_args.args[4], "减少文字，多留白")
        self.assertEqual(generate_mock.call_args.args[5], 1)

    def test_serves_template_preview_without_exposing_path(self) -> None:
        response = self.client.get(
            "/api/v1/ai-posters/templates/citywalk/preview",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "image/png")
        self.assertGreater(len(response.content), 1000)
        missing = self.client.get(
            "/api/v1/ai-posters/templates/unknown/preview",
        )
        self.assertEqual(missing.status_code, 404)

    def test_rejects_unknown_template_and_file_path(self) -> None:
        unknown = self.client.post(
            "/api/v1/ai-posters/generate",
            json={
                "ai_template_id": "unknown",
                "filenames": [PHOTO_NAME],
            },
        )
        self.assertEqual(unknown.status_code, 422)

        path = self.client.post(
            "/api/v1/ai-posters/generate",
            json={
                "ai_template_id": "citywalk",
                "filenames": ["../pictures/example_1.jpg"],
            },
        )
        self.assertEqual(path.status_code, 422)

        long_prompt = self.client.post(
            "/api/v1/ai-posters/generate",
            json={
                "ai_template_id": "citywalk",
                "filenames": [PHOTO_NAME],
                "additional_prompt": "太" * 201,
            },
        )
        self.assertEqual(long_prompt.status_code, 422)

        invalid_count = self.client.post(
            "/api/v1/ai-posters/generate",
            json={
                "ai_template_id": "citywalk",
                "filenames": [PHOTO_NAME],
                "candidate_count": 3,
            },
        )
        self.assertEqual(invalid_count.status_code, 422)

    @patch("app.main.generate_ai_poster_from_uploads")
    def test_maps_seedream_errors(self, generate_mock) -> None:
        cases = [
            (
                SeedreamConfigurationError("缺少 API Key"),
                503,
            ),
            (SeedreamTimeoutError("调用超时"), 504),
            (SeedreamApiError("上游失败"), 502),
            (FileNotFoundError(PHOTO_NAME), 404),
        ]
        for error, expected_status in cases:
            with self.subTest(expected_status=expected_status):
                generate_mock.reset_mock()
                generate_mock.side_effect = error
                response = self.client.post(
                    "/api/v1/ai-posters/generate",
                    json={
                        "ai_template_id": "morning-ride",
                        "filenames": [PHOTO_NAME],
                    },
                )
                self.assertEqual(response.status_code, expected_status)


if __name__ == "__main__":
    unittest.main()
