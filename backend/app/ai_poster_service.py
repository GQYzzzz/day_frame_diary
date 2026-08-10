"""Application service for generating one Seedream AI poster from uploads."""

from __future__ import annotations

import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .ai_poster_quality import (
    AiPosterQuality,
    AiPosterQualityError,
    candidates_are_too_similar,
    inspect_generated_poster,
    reject_duplicate_inputs,
)
from .ai_template_config import AI_POSTER_MODE_ID, get_ai_template
from .seedream_client import (
    SeedreamApiError,
    SeedreamInputError,
    generate_ai_poster,
)

_UPLOADED_FILENAME_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-"
    r"[0-9a-f]{12}\.(?:jpg|jpeg|png|webp|gif)$",
)


@dataclass(frozen=True)
class AiPosterCandidate:
    id: str
    url: str
    model: str
    size: str | None
    generation_duration_ms: int
    generated_at: int
    usage: dict[str, Any] | None
    seed: int | None
    seed_supported: bool
    request_id: str | None
    quality: AiPosterQuality


@dataclass(frozen=True)
class AiPosterGeneration:
    template_id: str
    style_id: str
    ai_template_id: str
    ai_template_label: str
    template_version: str
    aspect_ratio: str
    generated_photos: list[str]
    model: str
    size: str | None
    generation_duration_ms: int
    usage: dict[str, Any] | None
    seed: int | None
    seed_supported: bool
    request_id: str | None
    candidates: list[AiPosterCandidate]
    requested_candidate_count: int
    warnings: list[str]


def _resolve_uploaded_photos(
    upload_dir: Path,
    filenames: list[str],
) -> list[Path]:
    if not 1 <= len(filenames) <= 9:
        raise SeedreamInputError("用户照片数量必须为 1–9 张")

    trusted_dir = upload_dir.resolve()
    photos: list[Path] = []
    for filename in filenames:
        if not _UPLOADED_FILENAME_RE.fullmatch(filename):
            raise SeedreamInputError(f"非法文件名：{filename}")
        path = (trusted_dir / filename).resolve()
        if not path.is_relative_to(trusted_dir):
            raise SeedreamInputError("非法上传文件路径")
        if not path.is_file():
            raise FileNotFoundError(filename)
        photos.append(path)
    return photos


def generate_ai_poster_from_uploads(
    upload_dir: Path,
    filenames: list[str],
    ai_template_id: str,
    style_id: str = "moments",
    additional_prompt: str = "",
    candidate_count: int = 2,
) -> AiPosterGeneration:
    if candidate_count not in {1, 2}:
        raise SeedreamInputError("AI 候选数量必须为 1 或 2")
    template = get_ai_template(ai_template_id)
    photos = _resolve_uploaded_photos(upload_dir, filenames)
    try:
        reject_duplicate_inputs(photos)
    except AiPosterQualityError as exc:
        raise SeedreamInputError(str(exc)) from exc
    trusted_dir = upload_dir.resolve()
    started = time.perf_counter()

    def generate_one() -> AiPosterCandidate:
        result = generate_ai_poster(
            photos,
            template.id,
            output_dir=upload_dir,
            style_id=style_id,
            additional_prompt=additional_prompt,
        )
        output_path = result.output_path.resolve()
        if not output_path.is_relative_to(trusted_dir):
            raise RuntimeError("AI 成片输出路径不在上传目录中")
        if not output_path.is_file():
            raise RuntimeError("Seedream 未保存有效的 AI 成片文件")
        try:
            quality = inspect_generated_poster(output_path)
        except AiPosterQualityError as exc:
            output_path.unlink(missing_ok=True)
            raise SeedreamApiError(str(exc)) from exc
        return AiPosterCandidate(
            id=str(uuid.uuid4()),
            url=f"/api/uploads/{output_path.name}",
            model=result.model,
            size=result.size,
            generation_duration_ms=result.elapsed_ms,
            generated_at=int(time.time() * 1000),
            usage=result.usage,
            seed=result.seed,
            seed_supported=False,
            request_id=result.request_id,
            quality=quality,
        )

    candidates: list[AiPosterCandidate] = []
    errors: list[Exception] = []
    with ThreadPoolExecutor(max_workers=candidate_count) as executor:
        futures = [executor.submit(generate_one) for _ in range(candidate_count)]
        for future in as_completed(futures):
            try:
                candidates.append(future.result())
            except Exception as exc:
                errors.append(exc)

    if not candidates:
        raise errors[0]
    candidates.sort(key=lambda item: item.generated_at)
    elapsed_ms = round((time.perf_counter() - started) * 1000)
    first = candidates[0]
    warnings = (
        [f"{len(errors)} 个候选生成失败，已保留成功结果"]
        if errors
        else []
    )
    for candidate in candidates:
        warnings.extend(candidate.quality.warnings)
    if (
        len(candidates) == 2
        and candidates_are_too_similar(
            candidates[0].quality,
            candidates[1].quality,
        )
    ):
        warnings.append("两个候选画面高度相似，建议重新生成以获得更多差异")

    return AiPosterGeneration(
        template_id=AI_POSTER_MODE_ID,
        style_id=style_id,
        ai_template_id=template.id,
        ai_template_label=template.label,
        template_version=template.version,
        aspect_ratio=template.aspect_ratio,
        generated_photos=[item.url for item in candidates],
        model=first.model,
        size=first.size,
        generation_duration_ms=elapsed_ms,
        usage=first.usage,
        seed=first.seed,
        seed_supported=False,
        request_id=first.request_id,
        candidates=candidates,
        requested_candidate_count=candidate_count,
        warnings=warnings,
    )
