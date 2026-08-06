# DayFrame 前端（Web）

Next.js（App Router）+ TypeScript + Tailwind。上传走 **FastAPI** 生成文案；**`sessionStorage`** 保存当前编辑会话；**`localStorage`** 保存历史作品列表；浏览器内导出 PNG。

## 本地运行

需**同时**启动后端（见 `../backend/README.md`）与本前端。

```bash
cd frontend
cp .env.local.example .env.local   # 可按需改 API 地址
npm install
npm run dev
```

`next.config.ts` 将 **`/api/uploads/*`** 代理到后端 **`/uploads/*`**，与 `localhost:3000` 同源，便于预览与导出。

其他常用命令：`npm run build`（生产构建）、`npm run lint`（ESLint）。

---

## 代码文件在做什么

### `src/app/`（页面与路由）

| 文件 | 作用 |
|------|------|
| `layout.tsx` | 全站布局：`<html lang="zh-CN">`、字体与全局样式、站点 `metadata`，并在所有页面挂载顶栏与 `<main>`。 |
| `globals.css` | 全局样式：Tailwind 入口、浅色/深色下的 CSS 变量。 |
| `page.tsx` | 路由 `/`：产品介绍与跳转到上传、历史。 |
| `upload/page.tsx` | 路由 `/upload`：页面说明与嵌入 `UploadForm`；可在此写 `metadata`。 |
| `upload/upload-form.tsx` | 选图、选风格、**选排版模板**（竖版 / 波点 / 手绘标注）；上传 + 生成文案后按所选模板写入会话并跳转 `/result`。 |
| `result/page.tsx` | 路由 `/result`：`metadata` + 渲染 `ResultPageClient`（避免在服务端组件里使用 `dynamic(..., { ssr: false })`）。 |
| `result/result-page-client.tsx` | 客户端壳：用 `next/dynamic` 关闭 SSR 懒加载 `ResultView`，带加载占位。 |
| `result/result-view.tsx` | 结果页：展示上传时选定的模板、波点可「重新排版」、编辑文案、导出 PNG。 |
| `history/page.tsx` | 路由 `/history`：服务端壳 + `metadata`。 |
| `history/history-view.tsx` | 历史列表：缩略图、标题、风格、时间；打开编辑、单条删除、清空全部。 |
| `templates/scrapbook/polka-scrapbook-template.tsx` | **波点拼贴**模版：调用布局引擎，错位摆图 + 气泡穿插。 |
| `lib/templates/layout/compute-scrapbook-layout.ts` | 1～9 张图的拼贴布局引擎（种子随机、碰撞、日记切段）。 |
| `lib/templates/registry.tsx` | 模版注册表与 `templateId` 切换。 |

### `src/components/`（可复用 UI）

| 文件 | 作用 |
|------|------|
| `site-header.tsx` | 顶栏：品牌链到首页，导航「新建」「历史」。 |
| `templates/vertical-diary-template.tsx` | 竖版长图模板（`forwardRef`）：按风格换背景；用原生 `<img>` 显示 **Data URL 或同源 `/api/uploads/...` URL**；根节点 `ref` 供截图导出。 |

### `src/lib/`（逻辑与契约）

| 文件 | 作用 |
|------|------|
| `api.ts` | `getApiBase()`：读取 `NEXT_PUBLIC_API_BASE`（默认 `http://127.0.0.1:8000`）。 |
| `api-client.ts` | 上传、生成文案、健康检查等 `fetch` 封装与超时。 |
| `types.ts` | TypeScript 类型与常量：风格枚举、会话结构 `DayFrameSessionV1`、文案结构 `DayFrameCopy`、默认模板 id 等。 |
| `session.ts` | **`sessionStorage`**：当前编辑会话的保存/读取/清除（见下文）。 |
| `history.ts` | **`localStorage`**：历史作品列表的增删改查、打开到会话、容量与条数策略（见下文）。 |
| `mock-copy.ts` | 按风格生成假文案（开发/离线用；正式流程走后端 generate）。 |
| `export-card.ts` | 封装 `html-to-image`：将指定 DOM 节点导出为 PNG 并触发下载。 |

### 根目录配置（与构建相关）

| 文件 | 作用 |
|------|------|
| `package.json` | 依赖与 npm 脚本。 |
| `next.config.ts` | Next 配置：**`rewrites`** 将 `/api/uploads/:path*` 转到后端静态路径，便于 `<img src="/api/uploads/...">` 同源加载。 |
| `tsconfig.json` | TypeScript 与 `@/*` 路径别名。 |
| `eslint.config.mjs` | ESLint 规则。 |
| `postcss.config.mjs` | PostCSS（接 Tailwind）。 |

### 数据流（一句话）

`upload-form.tsx` → 后端上传 → 后端生成文案 → `sessionStorage` 会话 + `localStorage` 历史 → `result-view.tsx`（改字同步两处）→ 按 `templateId` 渲染模版 → `export-card.ts` 导出图片；`/history` 可从历史重新载入会话并进入 `/result`。

### 手绘标注模版（`hand-drawn-v1`）

- **推荐路径（`sketch_render_mode: image`）**：后端用 **`gpt-image-1` + `/v1/images/edits`** 在原图上直接绘制白线标注（接近 ChatGPT「图上手绘」），前端只展示生成后的图片，无 SVG 圈。
- **回退路径（`overlay`）**：网关不支持图像编辑时，用 mini 输出坐标 + 前端 SVG（已做标签防重叠、椭圆描边）。
- 文案仍由 `gpt-4o-mini` 生成；中文 `captions` 在图下。结果页显示 **AI 绘制定图** 或 **SVG 叠加** 标签。
- 需官方或支持 Images API 的 `OPENAI_BASE_URL`；第三方仅 chat 中转时常只能走 overlay。

### 波点拼贴模版（`polka-scrapbook-v1`）

- 默认模版；支持 **1～9 张** 图：引擎按张数缩放尺寸、之字形锚点 + 随机偏移/旋转，轻微叠压。
- 文案：`title` 顶栏气泡；每张图 `captions[i]`；`diary` 切段后在摆图过程中穿插；`hashtags` 底部。
- **重新排版**：换 `layoutSeed` 重算坐标（同一条作品可多种排法）。
- 画布高度随内容变长；导出背景为波点灰 `#d4d0cb`。

---


## 浏览器存储（会话与历史）

前端用两层存储，职责不同：

| 存储 | 键名 | 内容 | 生命周期 |
|------|------|------|----------|
| `sessionStorage` | `dayframe:session:v1` | 当前这一稿：`photos`、`copy`、`styleId`、`templateId`、`createdAt` | **关闭标签页即丢失** |
| `sessionStorage` | `dayframe:history:current-id` | 当前编辑对应的历史条目 id（用于结果页改字回写） | 同上 |
| `localStorage` | `dayframe:history:v1` | 历史作品数组 `HistoryEntryV1[]`（最多 **30** 条） | **关浏览器不丢**（同域名、未清站点数据时） |

实现见 `src/lib/session.ts`、`src/lib/history.ts`。

### 何时写入历史

1. **上传并生成成功**（`upload-form.tsx`）：先 `saveDayFrameSession`，再 `addHistoryFromSession`。
2. 保存历史时先同步写入轻量 URL 记录并建立历史 id，再在**后台**把 `/api/uploads/...` 转为 data URL；即使图片内嵌失败，作品也不会整条丢失。
3. **结果页编辑**（`result-view.tsx`）：若存在 `dayframe:history:current-id`，会同步文案、排版 seed、手工布局和原图/抠图选择。
4. 历史写入失败（例如容量满）**不会阻断**进入 `/result` 预览。

### 何时会清空或减少历史

**整库清空（列表变为空）**

- 用户在 `/history` 点击 **「清空全部」** 并确认 → `clearAllHistory()` 删除 `dayframe:history:v1`，并清除 `dayframe:history:current-id`。
- 用户在浏览器或系统中 **清除本站数据**（Cookie / 网站数据 / Application → Clear storage）。
- **无痕/隐私模式**：关闭该模式下的所有窗口后，该会话的 `localStorage` 会消失。
- **换源访问**：例如 `http://localhost:3000` 与 `http://127.0.0.1:3000` 的 `localStorage` 互不相通；换浏览器、换设备亦无历史。

**不会整库清空的情况**

- 仅关闭标签页或浏览器（普通模式）。
- 后端重启或删除 `backend/uploads/` 文件（历史内已存 data URL 时一般仍可打开）。
- 再次上传新建作品（会 **新增** 一条历史，不会删掉旧列表）。

**只删部分条目**

- 用户在 `/history` 对某条点 **「删除」** → 只移除该 id；若删的是当前 `current-id`，会清空 `dayframe:history:current-id`（不影响其余历史）。
- **超过 30 条**：新作品保存时只保留最新的 30 条，更早的自动丢弃（不是清空全部）。
- **写入 `localStorage` 抛错**（常见为配额约 5MB 已满）：按时间从旧到新逐条淘汰，优先保留当前作品；如果图片 data URL 仍过大，则回退为后端 URL 的轻量记录。

### 从历史打开作品

`/history` → **「打开编辑」** → `openHistoryEntry(id)`：把该条写入 `sessionStorage` 会话并设置 `current-id` → 跳转 `/result`。

### 限制与后续

- 历史仅存于 **本机浏览器**，无账号同步；清除站点数据即不可恢复。
- 多张大图 data URL 易触达 `localStorage` 上限；需要跨设备或更大容量时可改为 IndexedDB / 后端对象存储（见根目录 `docs/` 产品规划）。

---

## 延伸阅读

- [Next.js 文档](https://nextjs.org/docs)
- 仓库根目录 `docs/PRODUCT_VISION.md`、`docs/ARCHITECTURE.md` 中的产品与整体架构说明
