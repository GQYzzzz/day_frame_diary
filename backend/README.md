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

## 复古手账抠图

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

## Seedream AI 创意成片实验

模板模式固定为 `ai-poster-v1`，显示名称为“AI 创意成片”。当前已接入 FastAPI，前端入口将在下一阶段实现。

内置模板由 `app/ai_template_config.py` 的后端白名单统一管理：

- `morning-ride`：北京骑行手账，内部读取 `pictures/example_1.jpg`
- `citywalk`：Citywalk 拼贴，内部读取 `pictures/example_2.png`

每项配置包含固定参考图、专属提示词、配置版本、`9:16` 比例、重绘提示和默认 Seedream 参数。提示词根据 1、2–3、4–6、7–9 张照片调整布局密度，并明确区分用户照片与最后一张模板参考图。调用方只能提交 `morning-ride` 或 `citywalk`，不能提交文件路径；模板路径和完整提示词也不会出现在面向客户端的元数据中。

在 `.env` 配置火山方舟 API Key：

```env
SEEDREAM_API_KEY=你的方舟 API Key
SEEDREAM_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
SEEDREAM_MODEL=doubao-seedream-5-0-pro-260628
SEEDREAM_SIZE=1584x2816
SEEDREAM_OUTPUT_FORMAT=png
SEEDREAM_WATERMARK=false
SEEDREAM_TIMEOUT=600
SEEDREAM_INPUT_MAX_SIDE=2048
SEEDREAM_INPUT_JPEG_QUALITY=88
```

先执行 dry-run，不调用 API：

```bash
cd backend
source .venv/bin/activate
python scripts/test_seedream.py \
  --template citywalk \
  --dry-run \
  /绝对路径/用户照片1.jpg /绝对路径/用户照片2.jpg
```

确认打印的输入顺序中，用户照片在前、`style_reference_last` 在最后，再执行真实生成：

```bash
python scripts/test_seedream.py \
  --template citywalk \
  /绝对路径/用户照片1.jpg /绝对路径/用户照片2.jpg
```

用户照片会先纠正 EXIF 方向、转换为 RGB JPEG 并压缩最长边，再与内置模板一起编码为 Data URL。结果经过 PNG 完整性和 `9:16` 比例校验后，以 UUID 文件名保存到 `backend/uploads/`。脚本接受 1–9 张用户照片，并自动追加所选内置模板；不会要求用户传模板图。

### AI 成片 API

获取可选内置风格：

```http
GET /api/v1/ai-posters/templates
```

响应中的 `preview_url` 可用于展示模板缩略图；它是受白名单保护的 API URL，不包含后端文件路径。模板预览也可直接通过 `GET /api/v1/ai-posters/templates/{template_id}/preview` 获取。

上传用户照片后，使用返回的 UUID 文件名生成 AI 成片：

```http
POST /api/v1/ai-posters/generate
Content-Type: application/json

{
  "template_id": "ai-poster-v1",
  "style_id": "moments",
  "ai_template_id": "citywalk",
  "additional_prompt": "减少文字，多留白，突出主图",
  "candidate_count": 2,
  "filenames": [
    "11111111-1111-1111-1111-111111111111.jpg",
    "22222222-2222-2222-2222-222222222222.png"
  ]
}
```

成功响应：

```json
{
  "template_id": "ai-poster-v1",
  "style_id": "moments",
  "ai_template_id": "citywalk",
  "ai_template_label": "Citywalk 拼贴",
  "template_version": "1.1.0",
  "aspect_ratio": "9:16",
  "generated_photos": [
    "/api/uploads/33333333-3333-3333-3333-333333333333.png",
    "/api/uploads/44444444-4444-4444-4444-444444444444.png"
  ],
  "candidates": [
    {
      "id": "候选 UUID",
      "url": "/api/uploads/33333333-3333-3333-3333-333333333333.png",
      "model": "doubao-seedream-5-0-pro-260628",
      "size": "1584x2816",
      "generation_duration_ms": 120000,
      "generated_at": 1786350000000,
      "seed": null,
      "seed_supported": false,
      "request_id": "ark-request-id",
      "usage": null
    }
  ],
  "requested_candidate_count": 2,
  "warnings": [],
  "model": "doubao-seedream-5-0-pro-260628",
  "size": "1584x2816",
  "generation_duration_ms": 120000,
  "usage": null,
  "seed": null,
  "seed_supported": false,
  "request_id": "ark-request-id-or-local-uuid"
}
```

`additional_prompt` 可选，最多 200 字。它只会追加到内置提示词末尾，不能覆盖主体保真、模板隔离、禁增内容和输出尺寸约束。

`candidate_count` 只能为 `1` 或 `2`，默认 `2`。两个候选通过两次 Seedream 请求并行生成，因此会产生两次模型调用费用。若其中一个候选失败，接口会返回成功候选并在 `warnings` 中说明；只有全部失败时才返回错误。前端将每次生成记录为一个版本，并保存每个候选的图片、模板、提示词、模型、请求 ID、可空 seed 和生成时间。

火山方舟 Seedream 5.0 Pro 当前官方接口不支持指定随机种子，所以 `seed_supported` 固定为 `false`，`seed` 通常为 `null`；如果上游未来返回 seed，服务会原样透传。`request_id` 优先使用火山方舟请求 ID，否则使用本地 UUID。

接口只接受上传 API 返回的 UUID 文件名和内置风格 ID。非法输入返回 `400/422`，上传文件不存在返回 `404`，服务端未配置 Seedream 返回 `503`，模型超时返回 `504`，其他上游错误返回 `502`。失败时不会返回成图 URL，也不会创建前端历史记录。

### AI 成片质量保护

自动保护包括：

- 1–9 张数量与 UUID 文件名校验。
- 不同文件名但内容完全相同的照片会在调用模型前拒绝。
- 输入图统一纠正方向、压缩并编码，内置模板始终放在最后。
- 输出必须是可读取的 PNG 和 `9:16` 竖图。
- 接近空白或纯色的输出会删除并判定为无效候选。
- 非标准 `1584x2816` 尺寸会写入候选警告。
- 两个候选感知哈希过于接近时会提示重新生成。
- 单候选失败时保留另一张成功结果；全部失败才返回错误。
- API 失败不会创建历史；结果页重生成失败也不会覆盖已有版本。

自动测试：

```bash
cd backend
source .venv/bin/activate
python -m unittest discover -s tests -p 'test_*.py' -v
```

真实内容质量测试需要准备人物、合照、食物、建筑、夜景和屏幕原始照片。配置和执行方式见 `quality_cases/README.md`。测试脚本默认只验证测试集；只有同时传入 `--execute --confirm-cost YES` 才会调用 Seedream。它会覆盖 1、3、6、9 张照片，为每个用例生成两个候选，并输出 JSON 诊断及 Markdown 人工检查表。

## 后续

预签名直传对象存储、PostgreSQL、异步任务队列等见仓库根目录 `docs/ARCHITECTURE.md`。
