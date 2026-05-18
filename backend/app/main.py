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

from app.generate_copy import generate_dayframe_copy
from app.schemas import GenerateRequest

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


@app.post("/api/v1/generate")
async def generate_copy(req: GenerateRequest) -> dict:
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
    return {"copy": copy.model_dump()}
