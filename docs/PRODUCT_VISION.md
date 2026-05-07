# DayFrame — 产品愿景与初步方案

本文档内容由项目初期的 Word 文档整理而来，作为产品与研发的共同基准。

---

## 定位

**AI 图文生活记录 / 朋友圈小红书内容生成工具**

---

## 核心流程

1. 上传照片  
2. AI 识别照片内容  
3. 生成文案  
4. 选择模板  
5. 自动排版  
6. 导出图片 / 长图 / PDF  
7. 分享到朋友圈 / 小红书 / Instagram 等  

---

## 第一版（MVP）范围

1. 上传 **3–9** 张照片  
2. 选择风格：**小红书 / 旅行日记 / 文艺 / 简洁 / 朋友圈**  
3. AI 生成 **标题 + 日记正文 + 每张图的 caption**  
4. 套用模板排版  
5. 导出 **高清图片或长图**  

---

## 技术模块（粗粒度）

### 后端侧能力

- 图片上传  
- 图片存储  
- EXIF 信息提取  
- Vision 模型识别图片  
- LLM 生成文案  
- 模板排版所需结构化数据  
- 导出图片（若放在服务端）  
- 用户历史作品（后续）  

### AI 与基础设施（候选）

- **大模型**：GPT-4o / GPT-4.1 / Gemini 2.5 / Claude 等  
- **对象存储**：Cloudflare R2 / AWS S3 / Supabase Storage  
- **数据库**：PostgreSQL  

### 排版与导出（候选）

- **纯前端导出**：html-to-image、dom-to-image、Canvas  
- **服务端导出**：Playwright 截图、Puppeteer 截图  

### 前端

- 先做 **网页**，后续再考虑 App  
- **四个页面**：首页 → 上传照片 → 生成结果 → 历史作品  

---

## 推荐落地步骤

1. 确定产品形态（网页端 AI 图文日记生成器）  
2. 画 MVP 页面（上述 4 页）  
3. 做前端上传与模板预览  
4. 做后端上传链路：上传 → 存储 → 返回 URL → 保存作品草稿  
5. 接入 Vision 模型  
6. 对每张图产出结构化结果（示例 JSON 如下）  
7. 接入 LLM 生成全文案（示例 JSON 如下）  
8. 将文案填入模板（模版本质为前端组件，接收 `photos + title + diary + captions`）  
9. 导出 PNG / 长图  
10. 登录与历史记录（MVP 早期可不做登录，用本地缓存）  

### 图片分析结果示例（结构化）

```json
{
  "scene": "cafe",
  "objects": ["coffee", "dessert", "table"],
  "mood": "cozy",
  "caption_hint": "afternoon coffee with friends"
}
```

### 文案生成结果示例（结构化）

```json
{
  "title": "...",
  "diary": "...",
  "captions": ["...", "..."],
  "hashtags": ["..."]
}
```

---

## 技术栈倾向（前期）

| 层级 | 选型 |
|------|------|
| 前端 | Next.js |
| AI / API 后端 | Python FastAPI |
| 数据库 | PostgreSQL（或通过 Supabase 托管） |
| 存储 | Cloudflare R2 / Supabase Storage |

---

## 演进设想（用户量增大后）

- 前端仍为 **Next.js**  
- **主后端**：Spring Boot（承接账户、订单、作品 CRUD 等）  
- **Python AI 服务**：独立服务，专门对接 LLM / Vision  
- 数据与存储：**PostgreSQL + S3/R2**  

---

## 典型 Web 使用流程（前期）

上传照片 → 选择模板 → 选择文风 → 生成 → **编辑文字** → 导出图片  

---

## 早期文件夹设想（与仓库对齐）

```
project/
├── frontend/    # Next.js
├── backend/     # FastAPI
├── prompts/
└── docs/
```

仓库已采用 `docs/` 命名，与上述 `docs` 一致。
