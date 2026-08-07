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
  - 请求体：`{ "style_id": "moments", "template_id": "vertical-v1", "filenames": ["uuid.jpg", ...] }`（`template_id` 可选：`vertical-v1` | `polka-scrapbook-v1` | `hand-drawn-v1`）  
  - 响应：`{ "copy": { "title", "diary", "captions", "hashtags", "sketches"? } }`（`hand-drawn-v1` 时含每张图的手绘标注坐标）  
- 默认模型：**`gpt-4o-mini`**（可通过环境变量 `OPENAI_MODEL` 覆盖）  
- **第三方 OpenAI 兼容网关**：在 `backend/.env` 设置 **`OPENAI_BASE_URL`**（见 `.env.example`）。  
  - 与官方 Python SDK 一致时，**优先使用** `https://z.apiyihe.org/v1`（SDK 会再请求 `/chat/completions`）。  
  - 若服务商要求只填根域名，可试 `https://z.apiyihe.org`。  
  - **不要**把 `https://z.apiyihe.org/v1/chat/completions` 整条当作 base；若误填，程序会自动去掉末尾 `/chat/completions` 再请求。  
- 系统提示词：仓库根目录 **`prompts/generate_copy_system.md`**
- **手绘模板**（`hand-drawn-v1`）：文案仍用 `gpt-4o-mini`；标注优先调用 **`POST /v1/images/edits`**（默认模型 **`gpt-image-1`**，提示词见 `prompts/sketch_image_edit.md`）。网关不支持时自动回退 SVG 坐标（`generate_hand_drawn_system.md`）。
- 环境变量：`OPENAI_IMAGE_MODEL`、`HAND_DRAWN_USE_IMAGE_API`（见 `.env.example`）
- **生成较慢 / Swagger 一直 Loading**：属正常等待模型；大图会先压缩再发送。若超过 `OPENAI_TIMEOUT`（默认 360s）会返回 **504**；请看运行 uvicorn 的终端是否有报错。

## 黑板手账抠图

`chalkboard-collage-v1` 会根据照片分析结果，最多选择 3 张主体清晰的图片运行本地 BiRefNet 抠图。输出为带透明背景、白色描边和阴影的 PNG；单张抠图失败时会自动退回原始矩形照片。

默认按照片内容自动选择 1024px BiRefNet 模型：

- 人物、合照、检测到人脸，或主体组包含手/手臂：`birefnet-portrait`
- 其他主体：`birefnet-general`

人体相关主体会再使用 `birefnet-general` 复核，并只合并与主蒙版相交的组件。这样可以同时保留“手持物品 + 手 + 前臂”，以及覆盖在人物轮廓上的贴纸等视觉元素，不会把远处误识别的背景并入主体。

两个完整版模型各约 973 MB，首次遇到对应类型时自动下载到 `backend/.models/rembg/`。运行时只保留当前模型的 ONNX session，避免同时占用两份模型内存；人体相关图片会依次运行两个模型，处理时间会相应增加。

模型生成蒙版后会填补有限面积的内部孔洞，并对人物头发、衣服等轮廓做小尺度闭合。处理只修复封闭孔洞和窄缺口，不会填入与画面边缘连通的大块背景。视觉分析中的 `cutout_group` 和 `include_human_parts` 用于保证“手持物品 + 手 + 相连前臂”等主体组合使用人像语义模型整体保留。

模型目录已被 Git 忽略。低资源环境可以切换约 224 MB 的 Lite 版本，但复杂人物轮廓的完整度可能降低：

```env
DAYFRAME_CUTOUT_MODEL=birefnet-general-lite
DAYFRAME_CUTOUT_PORTRAIT_MODEL=birefnet-general-lite
```

可在 `.env` 配置 `DAYFRAME_CUTOUT_ENABLED`、`DAYFRAME_CUTOUT_MODEL`、`DAYFRAME_CUTOUT_PORTRAIT_MODEL`、`DAYFRAME_CUTOUT_MODEL_DIR`、`DAYFRAME_MAX_CUTOUTS`、`DAYFRAME_CUTOUT_MAX_SIDE`、`DAYFRAME_CUTOUT_THREADS`、`DAYFRAME_CUTOUT_BOUNDS_THRESHOLD`、`DAYFRAME_CUTOUT_MAX_HOLE_RATIO` 和 `DAYFRAME_CUTOUT_CLOSING_RADIUS`，默认值见 `.env.example`。

## 与前端联调

1. 终端 A：按上文启动 FastAPI（已配置 `OPENAI_API_KEY`）。  
2. 终端 B：`cd ../frontend && npm run dev`  
3. 前端可复制 `../frontend/.env.local.example` 为 `.env.local`，确认 `NEXT_PUBLIC_API_BASE` 与后端一致。

## 后续

预签名直传对象存储、PostgreSQL、异步任务队列等见仓库根目录 `docs/ARCHITECTURE.md`。
