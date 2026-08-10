#!/usr/bin/env python3
"""Run a reproducible Seedream quality matrix and write JSON/Markdown reports."""

from __future__ import annotations

import argparse
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.ai_poster_quality import (  # noqa: E402
    candidates_are_too_similar,
    inspect_generated_poster,
    reject_duplicate_inputs,
)
from app.ai_template_config import AI_POSTER_TEMPLATES  # noqa: E402
from app.seedream_client import generate_ai_poster  # noqa: E402

REQUIRED_COUNTS = {1, 3, 6, 9}
REQUIRED_CATEGORIES = {
    "portrait",
    "group",
    "food",
    "architecture",
    "night",
    "screen",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="验证 AI 成片质量测试集；默认不调用 API。",
    )
    parser.add_argument("manifest", type=Path, help="质量测试集 JSON")
    parser.add_argument(
        "--execute",
        action="store_true",
        help="真实调用 Seedream 并生成报告，会产生费用",
    )
    parser.add_argument(
        "--confirm-cost",
        default="",
        help="执行真实调用时必须填写 YES",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=BACKEND_DIR / "quality_reports",
    )
    return parser.parse_args()


def load_manifest(path: Path) -> list[dict[str, Any]]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    cases = raw.get("cases") if isinstance(raw, dict) else None
    if not isinstance(cases, list) or not cases:
        raise ValueError("manifest 必须包含非空 cases 数组")
    return [case for case in cases if isinstance(case, dict)]


def validate_cases(cases: list[dict[str, Any]], manifest_dir: Path) -> None:
    counts: set[int] = set()
    categories: set[str] = set()
    ids: set[str] = set()
    errors: list[str] = []
    for index, case in enumerate(cases):
        case_id = str(case.get("id") or "").strip()
        photos = case.get("photos")
        case_categories = case.get("categories")
        template_id = case.get("template_id", "citywalk")
        if not case_id or case_id in ids:
            errors.append(f"case[{index}] id 缺失或重复")
        ids.add(case_id)
        if not isinstance(photos, list) or not 1 <= len(photos) <= 9:
            errors.append(f"{case_id}: photos 必须为 1–9 项")
            continue
        counts.add(len(photos))
        if not isinstance(case_categories, list) or not case_categories:
            errors.append(f"{case_id}: categories 不能为空")
        else:
            categories.update(str(item) for item in case_categories)
        if template_id not in AI_POSTER_TEMPLATES:
            errors.append(f"{case_id}: 未知 template_id {template_id}")
        resolved: list[Path] = []
        for value in photos:
            path = Path(str(value)).expanduser()
            if not path.is_absolute():
                path = manifest_dir / path
            path = path.resolve()
            if not path.is_file():
                errors.append(f"{case_id}: 找不到照片 {path}")
            else:
                resolved.append(path)
        if len(resolved) == len(photos):
            try:
                reject_duplicate_inputs(resolved)
            except ValueError as exc:
                errors.append(f"{case_id}: {exc}")

    missing_counts = REQUIRED_COUNTS - counts
    missing_categories = REQUIRED_CATEGORIES - categories
    if missing_counts:
        errors.append(f"缺少照片数量场景：{sorted(missing_counts)}")
    if missing_categories:
        errors.append(f"缺少内容类别：{sorted(missing_categories)}")
    if errors:
        raise ValueError("\n".join(f"- {item}" for item in errors))


def resolve_photos(case: dict[str, Any], manifest_dir: Path) -> list[Path]:
    result: list[Path] = []
    for value in case["photos"]:
        path = Path(str(value)).expanduser()
        result.append((path if path.is_absolute() else manifest_dir / path).resolve())
    return result


def run_case(
    case: dict[str, Any],
    manifest_dir: Path,
    output_dir: Path,
) -> dict[str, Any]:
    photos = resolve_photos(case, manifest_dir)
    template_id = str(case.get("template_id", "citywalk"))
    style_id = str(case.get("style_id", "moments"))
    additional_prompt = str(case.get("additional_prompt", ""))

    def generate_one() -> dict[str, Any]:
        result = generate_ai_poster(
            photos,
            template_id,
            output_dir,
            style_id=style_id,
            additional_prompt=additional_prompt,
        )
        quality = inspect_generated_poster(result.output_path)
        return {
            "path": str(result.output_path),
            "model": result.model,
            "size": result.size,
            "request_id": result.request_id,
            "seed": result.seed,
            "duration_ms": result.elapsed_ms,
            "quality": {
                "width": quality.width,
                "height": quality.height,
                "entropy": quality.entropy,
                "luminance_stddev": quality.luminance_stddev,
                "perceptual_hash": quality.perceptual_hash,
                "warnings": quality.warnings,
            },
            "_quality": quality,
        }

    with ThreadPoolExecutor(max_workers=2) as executor:
        candidates = list(executor.map(lambda _: generate_one(), range(2)))
    too_similar = candidates_are_too_similar(
        candidates[0].pop("_quality"),
        candidates[1].pop("_quality"),
    )
    return {
        "id": case["id"],
        "photo_count": len(photos),
        "categories": case["categories"],
        "template_id": template_id,
        "style_id": style_id,
        "additional_prompt": additional_prompt,
        "candidates_too_similar": too_similar,
        "candidates": candidates,
        "manual_review": {
            "all_input_photos_present_once": None,
            "no_unrelated_people_photos_or_brands": None,
            "identity_clothing_objects_preserved": None,
            "architecture_reasonably_preserved": None,
            "chinese_text_readable_and_correct": None,
            "notes": "",
        },
    }


def markdown_report(report: dict[str, Any]) -> str:
    lines = [
        "# Seedream AI 成片质量报告",
        "",
        f"- 生成时间：{report['generated_at']}",
        f"- 用例数：{len(report['cases'])}",
        "- 人工检查：将 `[ ]` 攑为 `[x]`，并填写备注。",
        "",
    ]
    for case in report["cases"]:
        lines.extend([
            f"## {case['id']}",
            "",
            f"- 照片数：{case['photo_count']}",
            f"- 类别：{', '.join(case['categories'])}",
            f"- 模板：{case['template_id']}",
            f"- 候选过度相似：{'是' if case['candidates_too_similar'] else '否'}",
            "- [ ] 每张输入照片恰好出现一次，无漏图或重复",
            "- [ ] 没有无关人物、照片、品牌或 Logo",
            "- [ ] 人物身份、服装、食物和关键物品基本保持",
            "- [ ] 建筑结构没有明显错误重绘",
            "- [ ] 中文标题和图注清晰、无明显乱码错字",
            "- 备注：",
            "",
        ])
        for index, candidate in enumerate(case["candidates"], start=1):
            lines.append(f"  - 候选 {index}：`{candidate['path']}`")
        lines.append("")
    return "\n".join(lines)


def main() -> int:
    load_dotenv(BACKEND_DIR / ".env")
    args = parse_args()
    manifest = args.manifest.expanduser().resolve()
    try:
        cases = load_manifest(manifest)
        validate_cases(cases, manifest.parent)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"质量测试集无效：\n{exc}", file=sys.stderr)
        return 1

    print(
        f"测试集有效：{len(cases)} 个用例，覆盖照片数量 "
        f"{sorted(REQUIRED_COUNTS)} 和全部内容类别。",
    )
    if not args.execute:
        print("Dry run 完成：未调用 Seedream。")
        return 0
    if args.confirm_cost != "YES":
        print(
            "真实测试会为每个用例调用 Seedream 2 次；"
            "请同时传入 --execute --confirm-cost YES。",
            file=sys.stderr,
        )
        return 2

    output_dir = args.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    results = [
        run_case(case, manifest.parent, output_dir)
        for case in cases
    ]
    stamp = time.strftime("%Y%m%d-%H%M%S")
    report = {
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "manifest": str(manifest),
        "cases": results,
    }
    json_path = output_dir / f"quality-report-{stamp}.json"
    markdown_path = output_dir / f"quality-report-{stamp}.md"
    json_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    markdown_path.write_text(markdown_report(report), encoding="utf-8")
    print(f"JSON 报告：{json_path}")
    print(f"人工检查表：{markdown_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
