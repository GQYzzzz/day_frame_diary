# DayFrame 前端（Web）

Next.js（App Router）+ TypeScript + Tailwind。当前 MVP：本地 mock 文案、`sessionStorage` 传数据、浏览器内导出 PNG。

## 本地运行

```bash
cd frontend
npm install
npm run dev
```

浏览器打开终端里提示的地址（一般为 [http://localhost:3000](http://localhost:3000)）。

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
| `upload/upload-form.tsx` | 客户端上传表单：选图（1–9）、选风格；提交时将图片读成 Data URL，写入 mock 文案与 `sessionStorage`，再跳转 `/result`。 |
| `result/page.tsx` | 路由 `/result`：`metadata` + 渲染 `ResultPageClient`（避免在服务端组件里使用 `dynamic(..., { ssr: false })`）。 |
| `result/result-page-client.tsx` | 客户端壳：用 `next/dynamic` 关闭 SSR 懒加载 `ResultView`，带加载占位。 |
| `result/result-view.tsx` | 结果页主体：读取会话；无数据时引导去上传；有数据时展示模板预览、侧栏编辑、导出 PNG。 |
| `history/page.tsx` | 路由 `/history`：历史功能占位说明（后续接登录与后端）。 |

### `src/components/`（可复用 UI）

| 文件 | 作用 |
|------|------|
| `site-header.tsx` | 顶栏：品牌链到首页，导航「新建」「历史」。 |
| `templates/vertical-diary-template.tsx` | 竖版长图模板（`forwardRef`）：按风格换背景；用原生 `<img>` 显示 Data URL 照片；根节点 `ref` 供截图导出。 |

### `src/lib/`（逻辑与契约）

| 文件 | 作用 |
|------|------|
| `types.ts` | TypeScript 类型与常量：风格枚举、会话结构 `DayFrameSessionV1`、文案结构 `DayFrameCopy`、默认模板 id 等。 |
| `session.ts` | `sessionStorage` 读写：保存/读取/清除当前编辑会话。 |
| `mock-copy.ts` | 按风格与照片数量生成假文案，模拟未来 AI 返回结构。 |
| `export-card.ts` | 封装 `html-to-image`：将指定 DOM 节点导出为 PNG 并触发下载。 |

### 根目录配置（与构建相关）

| 文件 | 作用 |
|------|------|
| `package.json` | 依赖与 npm 脚本。 |
| `next.config.ts` | Next.js 配置入口。 |
| `tsconfig.json` | TypeScript 与 `@/*` 路径别名。 |
| `eslint.config.mjs` | ESLint 规则。 |
| `postcss.config.mjs` | PostCSS（接 Tailwind）。 |

### 数据流（一句话）

`upload-form.tsx` 写入会话 → `result-view.tsx` 读出 → `vertical-diary-template.tsx` 排版 → `export-card.ts` 导出图片。

---

## 延伸阅读

- [Next.js 文档](https://nextjs.org/docs)
- 仓库根目录 `docs/PRODUCT_VISION.md`、`docs/ARCHITECTURE.md` 中的产品与整体架构说明
