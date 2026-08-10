from __future__ import annotations

import unittest
from pathlib import Path

from app.ai_template_config import (
    AI_POSTER_MODE_ID,
    AI_POSTER_MODE_LABEL,
    AI_POSTER_TEMPLATES,
    PICTURES_DIR,
    ai_template_public_metadata,
    get_ai_template,
)
from app.seedream_client import SeedreamError, build_request_payload


class AiTemplateConfigTest(unittest.TestCase):
    def test_mode_and_registered_templates(self) -> None:
        self.assertEqual(AI_POSTER_MODE_ID, "ai-poster-v1")
        self.assertEqual(AI_POSTER_MODE_LABEL, "AI 创意成片")
        self.assertEqual(
            set(AI_POSTER_TEMPLATES),
            {"morning-ride", "citywalk"},
        )

        expected_files = {
            "morning-ride": "example_1.jpg",
            "citywalk": "example_2.png",
        }
        for template_id, filename in expected_files.items():
            template = get_ai_template(template_id)
            self.assertEqual(template.reference_path.name, filename)
            self.assertTrue(template.reference_path.is_relative_to(PICTURES_DIR))
            self.assertEqual(template.version, "1.1.0")
            self.assertEqual(template.aspect_ratio, "9:16")
            self.assertEqual(template.generation.size, "1584x2816")
            self.assertEqual(template.generation.output_format, "png")
            self.assertIn("{user_photo_range}", template.prompt_template)
            self.assertIn("{template_index}", template.prompt_template)

    def test_unknown_id_and_path_are_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "未知 AI 模板"):
            get_ai_template("unknown")
        with self.assertRaisesRegex(ValueError, "未知 AI 模板"):
            get_ai_template("../../pictures/example_1.jpg")

    def test_public_metadata_does_not_expose_server_details(self) -> None:
        metadata = ai_template_public_metadata()
        self.assertEqual(len(metadata), 2)
        for item in metadata:
            self.assertNotIn("reference_path", item)
            self.assertNotIn("prompt_template", item)
            self.assertNotIn("generation", item)
            self.assertTrue(str(item["preview_url"]).startswith("/api/"))

    def test_request_uses_registered_reference_as_last_image(self) -> None:
        user_photo = PICTURES_DIR / "example_1.jpg"
        payload = build_request_payload(
            [user_photo],
            "citywalk",
            include_image_data=False,
        )
        self.assertEqual(
            payload["image"],
            [
                str(user_photo.resolve()),
                str((PICTURES_DIR / "example_2.png").resolve()),
            ],
        )
        self.assertIn("图1是用户照片", payload["prompt"])
        self.assertIn("图2仅是模板参考图", payload["prompt"])
        self.assertIn("不漏图、不重复", payload["prompt"])
        self.assertIn("禁止新增无关人物", payload["prompt"])
        self.assertIn("无法保证像素级一致", payload["prompt"])

    def test_request_does_not_accept_a_template_path(self) -> None:
        with self.assertRaisesRegex(SeedreamError, "未知 AI 模板"):
            build_request_payload(
                [PICTURES_DIR / "example_1.jpg"],
                str(Path("pictures/example_2.png")),
                include_image_data=False,
            )

    def test_prompt_adapts_to_photo_count(self) -> None:
        template = get_ai_template("citywalk")
        expected = {
            1: "仅一张照片时以大主图为核心",
            3: "照片较少时采用一张主图",
            6: "照片适中时采用一至两张主图",
            9: "照片较多时缩小单图",
        }
        for count, marker in expected.items():
            with self.subTest(count=count):
                prompt = template.format_prompt(count)
                self.assertIn(marker, prompt)
                self.assertIn(f"图{count + 1}仅是模板参考图", prompt)

    def test_prompt_uses_selected_text_style(self) -> None:
        prompt = get_ai_template("morning-ride").format_prompt(
            2,
            "minimal",
            "减少装饰，突出主图",
        )
        self.assertIn("文字简洁直接", prompt)
        self.assertIn("用户补充偏好：减少装饰，突出主图", prompt)
        self.assertIn("不得覆盖前述主体保真", prompt)


if __name__ == "__main__":
    unittest.main()
