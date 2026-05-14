# DayFrame — AI 图文生活记录

> Frame Your Day — 基于 AI 的图文生活记录 Web 应用：上传照片、识别内容、生成日记文案、套用模板排版，导出高清长图，便于朋友圈、小红书等平台分享。

## 当前状态

- **文档与目录**：产品与架构说明见 `docs/`。
- **前端**：`frontend/` 已初始化 Next.js（Web），包含首页、上传、预览导出、历史占位；文案为本地 mock，支持浏览器内导出 PNG。后端仍为占位。

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
