import re
import uuid
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

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

app = FastAPI(title="DayFrame API", version="0.1.0")

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
async def upload_images(files: list[UploadFile] = File(...)) -> dict:
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
