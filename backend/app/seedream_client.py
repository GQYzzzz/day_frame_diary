"""Seedream image generation client used by the experimental AI template mode."""

from __future__ import annotations

import base64
import http.client
import json
import os
import time
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps

from .ai_template_config import (
    AiPosterTemplate,
    get_ai_template,
)

BACKEND_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BACKEND_DIR / "uploads"

DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"
MAX_USER_PHOTOS = 9
MAX_REFERENCE_IMAGES = 10
SUPPORTED_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


class SeedreamError(RuntimeError):
    """Seedream request or response is invalid."""


class SeedreamConfigurationError(SeedreamError):
    """Server-side Seedream configuration is missing or invalid."""


class SeedreamInputError(SeedreamError):
    """Local request data is invalid."""


class SeedreamApiError(SeedreamError):
    """Seedream rejected the request or returned an invalid response."""


class SeedreamTimeoutError(SeedreamApiError):
    """Seedream did not finish within the configured timeout."""


@dataclass(frozen=True)
class SeedreamResult:
    output_path: Path
    model: str
    template_id: str
    size: str | None
    elapsed_ms: int
    usage: dict[str, Any] | None
    seed: int | None
    request_id: str | None


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"0", "false", "no", "off"}


def _api_key() -> str:
    key = (
        os.environ.get("SEEDREAM_API_KEY")
        or os.environ.get("ARK_API_KEY")
        or ""
    ).strip()
    if not key:
        raise SeedreamConfigurationError(
            "缺少 Seedream API Key，请设置 SEEDREAM_API_KEY 或 ARK_API_KEY",
        )
    return key


def _base_url() -> str:
    raw = os.environ.get("SEEDREAM_BASE_URL", DEFAULT_BASE_URL).strip()
    url = raw.rstrip("/")
    if url.endswith("/images/generations"):
        return url
    return f"{url}/images/generations"


def _timeout_seconds() -> float:
    raw = os.environ.get("SEEDREAM_TIMEOUT", "600").strip()
    try:
        return max(60.0, float(raw))
    except ValueError:
        return 600.0


def _max_input_side() -> int:
    raw = os.environ.get("SEEDREAM_INPUT_MAX_SIDE", "2048").strip()
    try:
        return max(512, min(4096, int(raw)))
    except ValueError:
        return 2048


def _jpeg_quality() -> int:
    raw = os.environ.get("SEEDREAM_INPUT_JPEG_QUALITY", "88").strip()
    try:
        return max(60, min(95, int(raw)))
    except ValueError:
        return 88


def _resolve_image(path: Path) -> Path:
    resolved = path.expanduser().resolve()
    if not resolved.is_file():
        raise SeedreamInputError(f"找不到图片：{path}")
    if resolved.suffix.lower() not in SUPPORTED_IMAGE_SUFFIXES:
        raise SeedreamInputError(f"不支持的图片格式：{resolved.name}")
    try:
        with Image.open(resolved) as image:
            width, height = image.size
            if width <= 14 or height <= 14:
                raise SeedreamInputError(f"图片尺寸过小：{resolved.name}")
            if width * height > 36_000_000:
                raise SeedreamInputError(
                    f"图片总像素超过 3600 万：{resolved.name}",
                )
    except SeedreamInputError:
        raise
    except (OSError, ValueError) as exc:
        raise SeedreamInputError(f"无法读取图片：{resolved.name}") from exc
    if resolved.stat().st_size > 30 * 1024 * 1024:
        raise SeedreamInputError(f"图片超过 30 MB：{resolved.name}")
    return resolved


def _compressed_image_bytes(path: Path) -> bytes:
    """Normalize model input and cap its dimensions before Base64 encoding."""

    try:
        with Image.open(path) as source:
            source.seek(0)
            image = ImageOps.exif_transpose(source).convert("RGB")
            image.thumbnail(
                (_max_input_side(), _max_input_side()),
                Image.Resampling.LANCZOS,
            )
            output = BytesIO()
            image.save(
                output,
                format="JPEG",
                quality=_jpeg_quality(),
                optimize=True,
                progressive=True,
            )
            return output.getvalue()
    except (OSError, ValueError) as exc:
        raise SeedreamInputError(f"无法处理图片：{path.name}") from exc


def _image_data_url(path: Path) -> str:
    encoded = base64.b64encode(_compressed_image_bytes(path)).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


def _resolve_template(template_id: str) -> AiPosterTemplate:
    try:
        return get_ai_template(template_id)
    except (ValueError, FileNotFoundError) as exc:
        raise SeedreamInputError(str(exc)) from exc


def build_request_payload(
    user_photos: list[Path],
    template_id: str,
    *,
    style_id: str = "moments",
    additional_prompt: str = "",
    include_image_data: bool = True,
) -> dict[str, Any]:
    if not 1 <= len(user_photos) <= MAX_USER_PHOTOS:
        raise SeedreamInputError("用户照片数量必须为 1–9 张")

    template = _resolve_template(template_id)
    photos = [_resolve_image(path) for path in user_photos]
    reference = _resolve_image(template.reference_path)
    images = [*photos, reference]
    if len(images) > MAX_REFERENCE_IMAGES:
        raise SeedreamInputError("Seedream 5.0 Pro 最多接收 10 张参考图")

    try:
        prompt = template.format_prompt(
            len(photos),
            style_id,
            additional_prompt,
        )
    except (IndexError, KeyError, ValueError) as exc:
        raise SeedreamConfigurationError("Seedream 提示词模板变量无效") from exc
    if not prompt:
        raise SeedreamConfigurationError("Seedream 提示词不能为空")

    defaults = template.generation
    payload: dict[str, Any] = {
        "model": os.environ.get("SEEDREAM_MODEL", defaults.model).strip(),
        "prompt": prompt,
        "image": (
            [_image_data_url(path) for path in images]
            if include_image_data
            else [str(path) for path in images]
        ),
        "size": os.environ.get("SEEDREAM_SIZE", defaults.size).strip(),
        "output_format": os.environ.get(
            "SEEDREAM_OUTPUT_FORMAT",
            defaults.output_format,
        ).strip(),
        "response_format": defaults.response_format,
        "watermark": _env_bool(
            "SEEDREAM_WATERMARK",
            defaults.watermark,
        ),
    }
    return payload


def _response_error(body: object, status: int) -> SeedreamApiError:
    if isinstance(body, dict):
        error = body.get("error")
        if isinstance(error, dict):
            message = error.get("message") or error.get("code")
            if message:
                return SeedreamApiError(f"Seedream API {status}: {message}")
        detail = body.get("message") or body.get("detail")
        if detail:
            return SeedreamApiError(f"Seedream API {status}: {detail}")
    return SeedreamApiError(f"Seedream API 请求失败，HTTP {status}")


def _decode_response_image(
    body: dict[str, Any],
) -> tuple[bytes, str | None, int | None]:
    data = body.get("data")
    if not isinstance(data, list) or not data:
        raise SeedreamApiError("Seedream 响应没有生成图片")
    first = data[0]
    if not isinstance(first, dict):
        raise SeedreamApiError("Seedream 图片响应格式异常")
    error = first.get("error")
    if error:
        raise SeedreamApiError(f"Seedream 图片生成失败：{error}")
    encoded = first.get("b64_json")
    if not isinstance(encoded, str) or not encoded:
        raise SeedreamApiError("Seedream 未返回 b64_json")
    try:
        image_bytes = base64.b64decode(encoded, validate=True)
    except ValueError as exc:
        raise SeedreamApiError("Seedream 返回了无效的 Base64 图片") from exc
    raw_seed = first.get("seed", body.get("seed"))
    seed = raw_seed if isinstance(raw_seed, int) else None
    return image_bytes, first.get("size"), seed


def _validate_generated_png(image_bytes: bytes) -> tuple[int, int]:
    try:
        with Image.open(BytesIO(image_bytes)) as image:
            image.verify()
            image_format = image.format
        with Image.open(BytesIO(image_bytes)) as image:
            width, height = image.size
    except (OSError, ValueError) as exc:
        raise SeedreamApiError("Seedream 返回的图片文件已损坏") from exc
    if image_format != "PNG":
        raise SeedreamApiError(
            f"Seedream 返回格式为 {image_format or 'unknown'}，预期 PNG",
        )
    if width <= 0 or height <= 0:
        raise SeedreamApiError("Seedream 返回的图片尺寸无效")
    if abs((width / height) - (9 / 16)) > 0.02:
        raise SeedreamApiError(
            f"Seedream 返回尺寸 {width}x{height}，不是 9:16 竖图",
        )
    return width, height


def generate_ai_poster(
    user_photos: list[Path],
    template_id: str,
    output_dir: Path | None = None,
    *,
    style_id: str = "moments",
    additional_prompt: str = "",
) -> SeedreamResult:
    payload = build_request_payload(
        user_photos,
        template_id,
        style_id=style_id,
        additional_prompt=additional_prompt,
    )
    local_request_id = str(uuid.uuid4())
    request = urllib.request.Request(
        _base_url(),
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {_api_key()}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(
            request,
            timeout=_timeout_seconds(),
        ) as response:
            raw = response.read()
            status = response.status
            response_headers = response.headers
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            body = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            body = None
        raise _response_error(body, exc.code) from exc
    except TimeoutError as exc:
        raise SeedreamTimeoutError("Seedream API 调用超时") from exc
    except urllib.error.URLError as exc:
        if isinstance(exc.reason, TimeoutError):
            raise SeedreamTimeoutError("Seedream API 调用超时") from exc
        raise SeedreamApiError(f"无法连接 Seedream API：{exc}") from exc
    except (
        http.client.RemoteDisconnected,
        ConnectionResetError,
        BrokenPipeError,
    ) as exc:
        raise SeedreamApiError(f"Seedream API 连接被远端中断：{exc}") from exc

    try:
        body = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise SeedreamApiError("Seedream API 返回了非 JSON 内容") from exc
    if not isinstance(body, dict):
        raise SeedreamApiError("Seedream API 响应格式异常")
    if status < 200 or status >= 300 or body.get("error"):
        raise _response_error(body, status)

    image_bytes, response_size, seed = _decode_response_image(body)
    width, height = _validate_generated_png(image_bytes)
    size = str(response_size or f"{width}x{height}")
    destination_dir = (output_dir or UPLOAD_DIR).expanduser().resolve()
    destination_dir.mkdir(parents=True, exist_ok=True)
    output_format = str(payload["output_format"]).lower()
    suffix = "png" if output_format == "png" else "jpg"
    output_path = destination_dir / f"{uuid.uuid4()}.{suffix}"
    output_path.write_bytes(image_bytes)
    elapsed_ms = round((time.perf_counter() - started) * 1000)
    usage = body.get("usage")
    request_id = (
        response_headers.get("x-request-id")
        or response_headers.get("x-tt-logid")
        or body.get("request_id")
        or local_request_id
    )
    return SeedreamResult(
        output_path=output_path,
        model=str(body.get("model") or payload["model"]),
        template_id=template_id,
        size=str(size) if size else None,
        elapsed_ms=elapsed_ms,
        usage=usage if isinstance(usage, dict) else None,
        seed=seed,
        request_id=str(request_id),
    )
