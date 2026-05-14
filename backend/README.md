# DayFrame Backend

**FastAPI**：健康检查、图片上传（本机 `uploads/`）、静态读取。

## 环境

- Python **3.11+**

## 安装与启动

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

若 `pip install` 出现 **Read timed out**，多试几次；仍失败可换你网络可达的 **PyPI 镜像**（`-i <镜像 URL>`）。

- 健康检查：<http://127.0.0.1:8000/health>
- OpenAPI 文档：<http://127.0.0.1:8000/docs>

## 上传 API

- `POST /api/v1/images/upload`  
  - `multipart/form-data`，字段名 **`files`**，可多个（1–9 张）  
  - 响应：`{ "items": [ { "filename": "...", "url": "/api/uploads/..." } ] }`  
  - `url` 为前端同源路径，由 Next.js 反向代理到本服务 `/uploads/...`（便于预览与导出）

限制：单文件 ≤ 12 MiB；类型 `image/jpeg|png|webp|gif`。

## 与前端联调

1. 终端 A：按上文启动 FastAPI。  
2. 终端 B：`cd ../frontend && npm run dev`  
3. 前端可复制 `../frontend/.env.local.example` 为 `.env.local`，确认 `NEXT_PUBLIC_API_BASE` 与后端一致。

## 后续

预签名直传对象存储、PostgreSQL、Vision/LLM 等见仓库根目录 `docs/ARCHITECTURE.md`。
