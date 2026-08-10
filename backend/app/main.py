import asyncio
import os
import re
import uuid
from pathlib import Path

from typing import Annotated, Any

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import FileResponse
from openai import APITimeoutError, OpenAIError

from app.ai_poster_service import generate_ai_poster_from_uploads
from app.ai_template_config import (
    AI_POSTER_MODE_ID,
    AI_POSTER_MODE_LABEL,
    ai_template_public_metadata,
    get_ai_template,
)
from app.cutout_service import generate_cutout_assets
from app.generate_copy import generate_dayframe_copy
from app.schemas import (
    AiPosterGenerateRequest,
    AiPosterGenerateResponse,
    AiPosterTemplatesResponse,
    GenerateRequest,
)
from app.seedream_client import (
    SeedreamApiError,
    SeedreamConfigurationError,
    SeedreamInputError,
    SeedreamTimeoutError,
)
from app.sketch_image import (
    SketchAnnotateError,
    annotate_sketch_photos,
    create_image_client,
    placeholder_hand_drawn_copy,
)

UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
ALLOWED_TYPES = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/pjpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
}
MAX_FILES = 9
MAX_BYTES_PER_FILE = 12 * 1024 * 1024  # 12 MiB
FILENAME_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z]+$")

UPLOAD_OPENAPI_PATH = "/api/v1/images/upload"

app = FastAPI(title="DayFrame API", version="0.1.0")


def _patch_upload_files_binary(schema: dict[str, Any]) -> None:
    """用 Swagger UI 能识别的 inline schema 覆盖 FastAPI 3.1 的 $ref + contentMediaType。"""
    try:
        post = schema["paths"][UPLOAD_OPENAPI_PATH]["post"]
    except KeyError:
        return
    post["requestBody"] = {
        "required": True,
        "content": {
            "multipart/form-data": {
                "schema": {
                    "type": "object",
                    "required": ["files"],
                    "properties": {
                        "files": {
                            "type": "array",
                            "items": {"type": "string", "format": "binary"},
                            "description": "1–9 张图片；字段名 files，可多次添加文件",
                        },
                    },
                },
                "encoding": {
                    "files": {
                        "contentType": "image/jpeg, image/png, image/webp, image/gif",
                    },
                },
            },
        },
    }


def custom_openapi() -> dict[str, Any]:
    if app.openapi_schema:
        return app.openapi_schema
    openapi_schema = get_openapi(
        title=app.title,
        version=app.version,
        openapi_version=getattr(app, "openapi_version", "3.1.0"),
        routes=app.routes,
    )
    _patch_upload_files_binary(openapi_schema)
    app.openapi_schema = openapi_schema
    return app.openapi_schema


app.openapi = custom_openapi

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:3000",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    load_dotenv(UPLOAD_DIR.parent / ".env")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/uploads/{filename}")
def get_upload(filename: str) -> FileResponse:
    if not FILENAME_RE.match(filename):
        raise HTTPException(status_code=404, detail="Not found")
    path = (UPLOAD_DIR / filename).resolve()
    try:
        path.relative_to(UPLOAD_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=404, detail="Not found")
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(path)


@app.post("/api/v1/images/upload")
async def upload_images(
    files: Annotated[
        list[UploadFile],
        File(
            description="1–9 张图片；字段名 files，可多选同一字段多次提交",
        ),
    ],
) -> dict:
    if not files:
        raise HTTPException(status_code=400, detail="请至少上传 1 个文件")
    if len(files) > MAX_FILES:
        raise HTTPException(
            status_code=400, detail=f"最多上传 {MAX_FILES} 个文件",
        )

    items: list[dict[str, str]] = []

    for upload in files:
        content_type = (upload.content_type or "").split(";")[0].strip().lower()
        ext = ALLOWED_TYPES.get(content_type)
        if not ext:
            raise HTTPException(
                status_code=400,
                detail=f"不支持的类型: {upload.filename} ({content_type or 'unknown'})",
            )

        raw = await upload.read()
        if len(raw) > MAX_BYTES_PER_FILE:
            raise HTTPException(
                status_code=400,
                detail=f"单文件过大: {upload.filename}（上限 {MAX_BYTES_PER_FILE // (1024 * 1024)} MiB）",
            )

        name = f"{uuid.uuid4()}.{ext}"
        dest = UPLOAD_DIR / name
        dest.write_bytes(raw)

        items.append(
            {
                "filename": name,
                # 浏览器走 Next 同源代理，便于预览与导出
                "url": f"/api/uploads/{name}",
            },
        )

    return {"items": items}


@app.get(
    "/api/v1/ai-posters/templates",
    response_model=AiPosterTemplatesResponse,
)
def list_ai_poster_templates() -> dict[str, Any]:
    return {
        "template_id": AI_POSTER_MODE_ID,
        "label": AI_POSTER_MODE_LABEL,
        "templates": ai_template_public_metadata(),
    }


@app.get("/api/v1/ai-posters/templates/{template_id}/preview")
def get_ai_poster_template_preview(template_id: str) -> FileResponse:
    try:
        template = get_ai_template(template_id)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail="Not found") from exc
    return FileResponse(template.reference_path)


@app.post(
    "/api/v1/ai-posters/generate",
    response_model=AiPosterGenerateResponse,
)
async def generate_ai_poster_endpoint(
    req: AiPosterGenerateRequest,
) -> AiPosterGenerateResponse:
    try:
        result = await asyncio.to_thread(
            generate_ai_poster_from_uploads,
            UPLOAD_DIR,
            req.filenames,
            req.ai_template_id,
            req.style_id,
            req.additional_prompt,
            req.candidate_count,
        )
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"找不到已上传文件: {exc.args[0]}，请重新上传",
        ) from exc
    except SeedreamInputError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except SeedreamConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except SeedreamTimeoutError as exc:
        raise HTTPException(
            status_code=504,
            detail=(
                f"{exc}。可减少图片张数、增大 SEEDREAM_TIMEOUT，"
                "或检查火山方舟服务状态。"
            ),
        ) from exc
    except SeedreamApiError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"AI 成片生成失败: {type(exc).__name__}: {exc}",
        ) from exc
    return AiPosterGenerateResponse(
        template_id=result.template_id,
        style_id=result.style_id,
        ai_template_id=result.ai_template_id,
        ai_template_label=result.ai_template_label,
        template_version=result.template_version,
        aspect_ratio=result.aspect_ratio,
        generated_photos=result.generated_photos,
        model=result.model,
        size=result.size,
        generation_duration_ms=result.generation_duration_ms,
        usage=result.usage,
        seed=result.seed,
        seed_supported=result.seed_supported,
        request_id=result.request_id,
        candidates=[
            {
                "id": candidate.id,
                "url": candidate.url,
                "model": candidate.model,
                "size": candidate.size,
                "generation_duration_ms": candidate.generation_duration_ms,
                "generated_at": candidate.generated_at,
                "seed": candidate.seed,
                "seed_supported": candidate.seed_supported,
                "request_id": candidate.request_id,
                "usage": candidate.usage,
                "quality": {
                    "width": candidate.quality.width,
                    "height": candidate.quality.height,
                    "entropy": candidate.quality.entropy,
                    "luminance_stddev": candidate.quality.luminance_stddev,
                    "perceptual_hash": candidate.quality.perceptual_hash,
                    "warnings": candidate.quality.warnings,
                },
            }
            for candidate in result.candidates
        ],
        requested_candidate_count=result.requested_candidate_count,
        warnings=result.warnings,
    )


async def _generate_hand_drawn(req: GenerateRequest) -> dict:
    """手绘模板：仅官方 gpt-image-2 + generate_plog.md，不调 chat、不降级。"""
    if not os.getenv("OPENAI_IMAGE_API_KEY", "").strip():
        raise HTTPException(
            status_code=503,
            detail=(
                "手绘模板需配置 OPENAI_IMAGE_API_KEY（官方 OpenAI Key，"
                "见 backend/.env.example）"
            ),
        )
    client = create_image_client()
    names = await asyncio.to_thread(
        annotate_sketch_photos,
        client,
        UPLOAD_DIR,
        req.filenames,
    )
    copy = placeholder_hand_drawn_copy(len(req.filenames))
    return {
        "copy": copy.model_dump(),
        "annotated_photos": [f"/api/uploads/{n}" for n in names],
        "sketch_render_mode": "image",
    }


@app.post("/api/v1/generate")
async def generate_copy(req: GenerateRequest) -> dict:
    if req.template_id == "hand-drawn-v1":
        try:
            return await _generate_hand_drawn(req)
        except FileNotFoundError as e:
            raise HTTPException(
                status_code=404,
                detail=f"找不到已上传文件: {e.args[0]}，请重新上传",
            ) from e
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except RuntimeError as e:
            if str(e) == "MISSING_IMAGE_API_KEY":
                raise HTTPException(
                    status_code=503,
                    detail="服务器未配置 OPENAI_IMAGE_API_KEY",
                ) from e
            raise HTTPException(status_code=502, detail=str(e)) from e
        except APITimeoutError as e:
            raise HTTPException(
                status_code=504,
                detail=(
                    "gpt-image-2 调用超时。可减少图片张数、增大 OPENAI_IMAGE_TIMEOUT，"
                    "或检查官方 API 网络。"
                ),
            ) from e
        except SketchAnnotateError as e:
            raise HTTPException(
                status_code=502,
                detail=f"gpt-image-2 图像编辑失败: {e!s}",
            ) from e
        except OpenAIError as e:
            raise HTTPException(
                status_code=502,
                detail=f"OpenAI Images API 调用失败: {e!s}",
            ) from e
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"生成失败: {type(e).__name__}: {e}",
            ) from e

    if not os.getenv("OPENAI_API_KEY", "").strip():
        raise HTTPException(
            status_code=503,
            detail="服务器未配置 OPENAI_API_KEY，请在 backend/.env 中设置（参考 .env.example）",
        )
    try:
        copy = await asyncio.to_thread(generate_dayframe_copy, UPLOAD_DIR, req)
    except FileNotFoundError as e:
        raise HTTPException(
            status_code=404,
            detail=f"找不到已上传文件: {e.args[0]}，请重新上传",
        ) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        if str(e) == "MISSING_API_KEY":
            raise HTTPException(
                status_code=503,
                detail="服务器未配置 OPENAI_API_KEY",
            ) from e
        raise HTTPException(status_code=502, detail=str(e)) from e
    except APITimeoutError as e:
        raise HTTPException(
            status_code=504,
            detail=(
                "调用模型超时（默认 360 秒）。可减少图片张数、在 backend/.env 增大 "
                "OPENAI_TIMEOUT，或检查 OPENAI_BASE_URL / 网络与第三方额度。"
            ),
        ) from e
    except OpenAIError as e:
        raise HTTPException(
            status_code=502,
            detail=f"OpenAI 调用失败: {e!s}",
        ) from e
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"生成失败: {type(e).__name__}: {e}",
        ) from e
    result: dict[str, Any] = {"copy": copy.model_dump()}
    if (
        req.template_id in {"chalkboard-collage-v1", "polka-scrapbook-v1"}
        and req.include_cutouts
        and copy.photo_analyses
    ):
        cutout_assets = await asyncio.to_thread(
            generate_cutout_assets,
            UPLOAD_DIR,
            req.filenames,
            copy.photo_analyses,
        )
        result["cutout_assets"] = [
            asset.model_dump() for asset in cutout_assets
        ]
    return result
