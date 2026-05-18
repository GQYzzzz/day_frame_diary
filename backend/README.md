# DayFrame Backend

**FastAPI**：健康检查、图片上传（本机 `uploads/`）、**OpenAI gpt-4o-mini 文案生成**、静态读取。

## 环境

- Python **3.11+**
- [OpenAI API Key](https://platform.openai.com/api-keys)（用于文案生成）

## 安装与启动

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# 编辑 .env：填入 OPENAI_API_KEY；使用第三方中转时再填 OPENAI_BASE_URL（见文件内注释）
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

启动时会自动加载 **`backend/.env`**（`python-dotenv`）。**勿将 `.env` 提交到 git。**

若 `pip install` 出现 **Read timed out**，多试几次；仍失败可换你网络可达的 **PyPI 镜像**（`-i <镜像 URL>`）。

- 健康检查：<http://127.0.0.1:8000/health>
- OpenAPI 文档：<http://127.0.0.1:8000/docs>

## 上传 API

- `POST /api/v1/images/upload`  
  - `multipart/form-data`，字段名 **`files`**，可多个（1–9 张）  
  - 响应：`{ "items": [ { "filename": "...", "url": "/api/uploads/..." } ] }`  
  - `url` 为前端同源路径，由 Next.js 反向代理到本服务 `/uploads/...`（便于预览与导出）

限制：单文件 ≤ 12 MiB；类型 `image/jpeg|png|webp|gif`。

在 `/docs` 测试上传：应出现 **文件选择**（`array` + `items.format: binary`）。修改后请**重启 uvicorn** 并**硬刷新** `/docs`。

## 文案生成 API（OpenAI）

- `POST /api/v1/generate`  
  - `Content-Type: application/json`  
  - 请求体：`{ "style_id": "moments", "filenames": ["uuid.jpg", ...] }`（`style_id` 与前端一致；`filenames` 须为上传接口返回的文件名）  
  - 响应：`{ "copy": { "title", "diary", "captions", "hashtags" } }`  
- 默认模型：**`gpt-4o-mini`**（可通过环境变量 `OPENAI_MODEL` 覆盖）  
- **第三方 OpenAI 兼容网关**：在 `backend/.env` 设置 **`OPENAI_BASE_URL`**（见 `.env.example`）。  
  - 与官方 Python SDK 一致时，**优先使用** `https://z.apiyihe.org/v1`（SDK 会再请求 `/chat/completions`）。  
  - 若服务商要求只填根域名，可试 `https://z.apiyihe.org`。  
  - **不要**把 `https://z.apiyihe.org/v1/chat/completions` 整条当作 base；若误填，程序会自动去掉末尾 `/chat/completions` 再请求。  
- 系统提示词文件：仓库根目录 **`prompts/generate_copy_system.md`**
- **生成较慢 / Swagger 一直 Loading**：属正常等待模型；大图会先压缩再发送。若超过 `OPENAI_TIMEOUT`（默认 360s）会返回 **504**；请看运行 uvicorn 的终端是否有报错。

## 与前端联调

1. 终端 A：按上文启动 FastAPI（已配置 `OPENAI_API_KEY`）。  
2. 终端 B：`cd ../frontend && npm run dev`  
3. 前端可复制 `../frontend/.env.local.example` 为 `.env.local`，确认 `NEXT_PUBLIC_API_BASE` 与后端一致。

## 后续

预签名直传对象存储、PostgreSQL、异步任务队列等见仓库根目录 `docs/ARCHITECTURE.md`。
