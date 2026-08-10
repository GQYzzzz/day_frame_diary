#!/usr/bin/env python3
"""Minimal Seedream multi-image test for DayFrame's built-in AI templates."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.ai_template_config import (  # noqa: E402
    AI_POSTER_MODE_ID,
    AI_POSTER_MODE_LABEL,
    AI_POSTER_TEMPLATES,
    get_ai_template,
)
from app.seedream_client import (  # noqa: E402
    SeedreamError,
    build_request_payload,
    generate_ai_poster,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "使用用户照片和项目内置参考图调用 Seedream 5.0 Pro，"
            "生成一张 9:16 AI 手账测试图。"
        ),
    )
    parser.add_argument(
        "photos",
        nargs="+",
        type=Path,
        help="1–9 张用户照片路径；不要传模板图",
    )
    parser.add_argument(
        "--template",
        choices=tuple(AI_POSTER_TEMPLATES),
        default="citywalk",
        help="内置模板 ID，默认 citywalk",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=BACKEND_DIR / "uploads",
        help="生成图片保存目录，默认 backend/uploads",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="仅校验输入并打印请求摘要，不调用 API、不产生费用",
    )
    return parser.parse_args()


def request_summary(args: argparse.Namespace) -> dict[str, object]:
    template = get_ai_template(args.template)
    payload = build_request_payload(
        args.photos,
        args.template,
        include_image_data=False,
    )
    images = payload.pop("image")
    return {
        "mode_id": AI_POSTER_MODE_ID,
        "mode_label": AI_POSTER_MODE_LABEL,
        "endpoint": "SEEDREAM_BASE_URL + /images/generations",
        "template_id": args.template,
        "template_label": template.label,
        "template_version": template.version,
        "aspect_ratio": template.aspect_ratio,
        "model": payload["model"],
        "size": payload["size"],
        "output_format": payload["output_format"],
        "watermark": payload["watermark"],
        "input_order": [
            *[
                {"role": f"user_photo_{index + 1}", "path": path}
                for index, path in enumerate(images[:-1])
            ],
            {"role": "style_reference_last", "path": images[-1]},
        ],
        "prompt": payload["prompt"],
    }


def main() -> int:
    load_dotenv(BACKEND_DIR / ".env")
    args = parse_args()
    try:
        summary = request_summary(args)
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        if args.dry_run:
            print("\nDry run 完成：未调用 Seedream API。")
            return 0

        print("\n正在调用 Seedream，生成过程可能需要数分钟……")
        result = generate_ai_poster(
            args.photos,
            args.template,
            args.output_dir,
        )
    except SeedreamError as exc:
        print(f"\nSeedream 测试失败：{exc}", file=sys.stderr)
        return 1

    print("\n生成成功")
    print(f"文件：{result.output_path}")
    print(f"模板：{result.template_id}")
    print(f"模型：{result.model}")
    print(f"尺寸：{result.size or '响应未提供'}")
    print(f"耗时：{result.elapsed_ms / 1000:.1f} 秒")
    print(f"请求 ID：{result.request_id or '响应未提供'}")
    print(f"随机种子：{result.seed if result.seed is not None else '官方接口不支持'}")
    if result.usage:
        print(
            "用量："
            + json.dumps(result.usage, ensure_ascii=False, separators=(",", ":")),
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
