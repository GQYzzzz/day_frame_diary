# DayFrame — AI 图文生活记录

> Frame Your Day — 基于 AI 的图文生活记录 Web 应用：上传照片、识别内容、生成日记文案、套用模板排版，导出高清长图，便于朋友圈、小红书等平台分享。

## 当前状态

- **文档与目录**：产品与架构说明见 `docs/`。
- **前端**：`frontend/` Next.js：上传后调后端 **生成文案**；结果页编辑与导出 PNG；**历史作品**存本机 `localStorage`（会话为 `sessionStorage`，机制见 `frontend/README.md`）；`/api/uploads/*` 代理到后端。
- **后端**：`backend/` FastAPI：上传、`POST /api/v1/generate`（**OpenAI gpt-4o-mini**，读 `prompts/generate_copy_system.md`）、本机 `uploads/`。需配置 `OPENAI_API_KEY`，见 `backend/.env.example`。

## 文档导航

| 文档 | 说明 |
|------|------|
| [docs/PRODUCT_VISION.md](docs/PRODUCT_VISION.md) | 产品愿景、核心流程、MVP 范围、技术选型（来自你的初步想法整理） |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 推荐模块划分、语言/结构、各层调用哪些工具与服务 |

## 仓库目录概览

```
day_frame_diary/
├── docs/              # 产品与架构文档
├── frontend/          # Web 前端（计划：Next.js）
├── backend/           # API 与业务服务（计划：FastAPI）
└── prompts/           # AI 提示词与模板（与代码分离，便于迭代）
```

各子目录内有 `README.md` 说明该部分将来放什么、不负责什么。

## 许可

待定（可在确定开源协议后补充 `LICENSE`）。
