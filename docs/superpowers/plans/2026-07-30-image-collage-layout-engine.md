# Image Collage — Content-Aware Layout Engine 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让图片拼接模板（`image-collage-v1`）按 AI 输出的语义 layout_hints 进行行式排版，替代当前死板的双列固定布局

**Architecture:**
- 后端：gpt-4o-mini 看图后额外输出 `layout_hints`（每张图的 importance / subject_type / has_faces / aspect_ratio），通过 Pydantic 模型传递给前端
- 前端：纯前端的 row-packing 引擎接收 layout_hints，按重要性排序 + 贪心跳行算法计算坐标，每张照片配一个 caption 气泡
- AI 不做坐标预测，只输出语义；坐标由确定性算法计算

**Tech Stack:** Python FastAPI / OpenAI gpt-4o-mini / Next.js TypeScript

## Global Constraints

- 后端已有 vision 管道在 `backend/app/generate_copy.py`，`layout_hints` 作为额外字段追加，不改现有流程
- 前端已有模板组件结构（`image-collage-template.tsx`），布局引擎拆出独立文件
- 气泡逻辑复用现有方案：围绕照片随机候选 + 碰撞检测
- 不新增 npm/python 依赖
- 前端最大支持 9 张（受后端 `max_length=9` 限制），引擎设计上可扩展

---

### Task 1: 后端 — 新增 collage 系统提示词 + schema + 解析

**Files:**
- Create: `prompts/generate_collage_system.md`
- Modify: `backend/app/schemas.py` (追加 LayoutHintModel，更新 DayFrameCopyModel)
- Modify: `backend/app/generate_copy.py` (按 template_id 加载不同 prompt，解析 layout_hints)

**Interfaces:**
- Consumes: 现有 `GenerateRequest`（含 `template_id: "image-collage-v1"`）
- Produces: `DayFrameCopyModel` 增加可选字段 `layout_hints: list[LayoutHintModel] | None`

- [ ] **Step 1: 创建 prompts/generate_collage_system.md**

```markdown
你是 DayFrame 图文日记助手。用户会提供若干张生活照片（按顺序）和一种文风。你需要同时理解图片内容，并生成适合社交平台分享的中文文案。

## 输出格式（严格遵守）

只输出一个 JSON 对象，不要 Markdown 代码围栏，不要多余说明。字段如下：

- `title`：string，标题，简短有力，可含适当标点。
- `diary`：string，正文，可含换行 `\n`，语气贴合所选风格，总长度建议 120–400 字。
- `captions`：string 数组，**长度必须等于图片张数**，第 i 项对应第 i+1 张图的一两句说明。
- `hashtags`：string 数组，3–8 个话题标签；每项建议以 `#` 开头。
- `layout_hints`：数组，**长度必须等于图片张数**。第 i 项描述第 i+1 张图的空间信息：
  - `importance`：0–1 的浮点数，这张图在排版时应占多大空间（0.5=普通，>0.7=重要，>0.9=视觉重心）
  - `subject_type`：string，主体类型，可选值 portrait | group | food | landscape | object | other
  - `has_faces`：boolean，是否含人脸
  - `aspect_ratio`：浮点数，图片的宽高比（width/height），尽量精确

## 风格说明（用户会传 style_id）

- `xiaohongshu`：种草感、分段清晰、适度 emoji 或符号、偏年轻化。
- `travel`：路上感、风景与心情、略具体但不流水账。
- `literary`：克制、意象、少堆砌网络热词。
- `minimal`：短句为主，留白感，少形容词。
- `moments`：像发朋友圈，真诚、生活化、不过分营销。

## 禁止

编造图中明显不存在的人物关系或地点名称；不确定时用笼统但真实的表达。不要输出 JSON 以外的任何字符。
```

- [ ] **Step 2: 修改 backend/app/schemas.py**

在 `DayFrameCopyModel` 上方追加：

```python
class LayoutHintModel(BaseModel):
    importance: float = 0.5
    subject_type: str = "other"
    has_faces: bool = False
    aspect_ratio: float = 1.0

    @field_validator("importance")
    @classmethod
    def clamp_importance(cls, v: float) -> float:
        return max(0.0, min(1.0, float(v)))
```

在 `DayFrameCopyModel` 追加字段：

```python
class DayFrameCopyModel(BaseModel):
    title: str
    diary: str
    captions: list[str]
    hashtags: list[str]
    sketches: list[PhotoSketchModel] | None = None
    layout_hints: list[LayoutHintModel] | None = None
```

- [ ] **Step 3: 修改 backend/app/generate_copy.py**

修改 `_load_system_prompt`，当 template_id 为 `image-collage-v1` 时加载 collage 专用提示词：

```python
def _load_system_prompt(template_id: str) -> str:
    if template_id == "image-collage-v1":
        path = PROMPTS_DIR / "generate_collage_system.md"
    else:
        path = PROMPTS_DIR / "generate_copy_system.md"
    fallback = "你是图文助手，只输出 JSON：title, diary, captions, hashtags。"
    if not path.is_file():
        return fallback
    return path.read_text(encoding="utf-8")
```

在 `generate_dayframe_copy` 函数返回前，从解析后的 data 中提取 `layout_hints` 并放入 `DayFrameCopyModel`：

```python
# 在已有 _normalize_sketches 调用附近追加
layout_hints_raw = data.get("layout_hints")
layout_hints: list[LayoutHintModel] | None = None
if isinstance(layout_hints_raw, list) and len(layout_hints_raw) == n:
    hints = []
    for item in layout_hints_raw:
        if isinstance(item, dict):
            try:
                hints.append(LayoutHintModel.model_validate(item))
            except ValidationError:
                hints.append(LayoutHintModel())
        else:
            hints.append(LayoutHintModel())
    if len(hints) == n:
        layout_hints = hints

return DayFrameCopyModel(
    title=copy.title,
    diary=copy.diary,
    captions=caps,
    hashtags=copy.hashtags,
    sketches=sketches,
    layout_hints=layout_hints,
)
```

在文件顶部 import 中加入 `LayoutHintModel`：

```python
from app.schemas import (
    DayFrameCopyModel,
    GenerateRequest,
    LayoutHintModel,
    PhotoSketchModel,
    SketchCalloutModel,
)
```

- [ ] **Step 4: 验证后端启动与 schema**

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

访问 `http://127.0.0.1:8000/docs` 确认 `POST /api/v1/generate` 的 schema 中包含 `layout_hints` 字段。

- [ ] **Step 5: Commit**

```bash
git add prompts/generate_collage_system.md backend/app/schemas.py backend/app/generate_copy.py
git commit -m "feat(backend): add layout_hints for image-collage-v1 template"
```

---

### Task 2: 前端 — 更新类型定义 + API 客户端

**Files:**
- Modify: `frontend/src/lib/types.ts` (追加 LayoutHint 类型，更新 DayFrameCopy)
- Modify: `frontend/src/lib/api-client.ts` (解析 layout_hints)

**Interfaces:**
- Consumes: `DayFrameCopy` 新增 `layout_hints` 字段
- Produces: `generateCopy()` 返回的 `copy` 中携带 `layout_hints`

- [ ] **Step 1: 修改 frontend/src/lib/types.ts**

在 `SketchDecoration` 类型附近（或文件末尾）追加：

```typescript
export type LayoutHint = {
  importance: number;
  subjectType: "portrait" | "group" | "food" | "landscape" | "object" | "other";
  hasFaces: boolean;
  aspectRatio: number;
};
```

在 `DayFrameCopy` 中追加字段：

```typescript
export type DayFrameCopy = {
  title: string;
  diary: string;
  captions: string[];
  hashtags: string[];
  sketches?: PhotoSketch[];
  layoutHints?: LayoutHint[];
};
```

- [ ] **Step 2: 修改 frontend/src/lib/api-client.ts**

在 `generateCopy` 函数的 `copy` 对象构造中追加 `layoutHints`：

```typescript
const copy: DayFrameCopy = {
  title: String(copyPayload.title),
  diary: String(copyPayload.diary),
  captions: (copyPayload.captions as string[]).slice(0, filenames.length),
  hashtags: copyPayload.hashtags as string[],
};

const rawHints = copyPayload.layout_hints;
if (Array.isArray(rawHints) && rawHints.length === filenames.length) {
  copy.layoutHints = rawHints as LayoutHint[];
}
```

在文件 import 中加入 `LayoutHint`：

```typescript
import type {
  DayFrameCopy,
  LayoutHint,
  SketchRenderMode,
  StyleId,
  TemplateId,
} from "@/lib/types";
```

- [ ] **Step 3: 验证类型检查**

```bash
cd frontend
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api-client.ts
git commit -m "feat(frontend): add LayoutHint types and API parsing"
```

---

### Task 3: 前端 — 实现 row-packing 布局引擎

**Files:**
- Create: `frontend/src/lib/templates/layout/row-pack.ts`

**Interfaces:**
- Consumes: `LayoutHint[]`, photo count, canvas width
- Produces: `RowPackResult` (包含每行照片坐标、气泡坐标、画布高度)

- [ ] **Step 1: 创建 frontend/src/lib/templates/layout/row-pack.ts**

```typescript
/* ───────────────────────────────────────────
   Content-Aware Row-Packing Layout Engine
   ───────────────────────────────────────────
   AI 输出 layout_hints（语义信息），
   引擎据此用贪心跳行算法计算精确坐标。
   AI 不碰坐标，引擎不碰语义。          */

export type PackedPhoto = {
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
  rotate: number;
  aspectRatio: number;
};

export type PackedBubble = {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type PackedRow = {
  photos: PackedPhoto[];
  bubbles: PackedBubble[];
};

export type RowPackResult = {
  rows: PackedRow[];
  canvasWidth: number;
  canvasHeight: number;
};

export type LayoutHint = {
  importance: number;
  hasFaces: boolean;
  aspectRatio: number;
};

export const PACK_DEFAULTS = {
  canvasWidth: 390,
  padding: 16,
  rowGap: 16,
  photoGap: 8,
  minRowPhotos: 1,
  maxRowPhotos: 4,
  rowFillThreshold: 0.82,
  rowHeightMin: 60,
  rowHeightMax: 320,
  bubbleGap: 6,
} as const;

/* 碰撞检测（AABB + gap） */
function boxesCollide(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  gap = 0,
): boolean {
  return (
    a.x - gap < b.x + b.w &&
    a.x + a.w + gap > b.x &&
    a.y - gap < b.y + b.h &&
    a.y + a.h + gap > b.y
  );
}

/* 气泡尺寸估算 */
function estimateBubbleSize(text: string): { w: number; h: number } {
  const charsPerLine = 14;
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  return {
    w: Math.min(Math.max(text.length * 7 + 20, 72), 140),
    h: Math.max(lines * 16 + 16, 32),
  };
}

/* 在照片周围尝试放置气泡 */
function placeBubble(
  text: string,
  photo: { x: number; y: number; w: number; h: number },
  placed: { x: number; y: number; w: number; h: number }[],
  canvasWidth: number,
  seed: number,
): PackedBubble | null {
  const { w, h } = estimateBubbleSize(text);
  if (w <= 0 || h <= 0) return null;

  const gap = PACK_DEFAULTS.bubbleGap;
  const pad = PACK_DEFAULTS.padding;

  const candidates = [
    { x: photo.x + photo.w + gap, y: photo.y },
    { x: photo.x - w - gap, y: photo.y },
    { x: photo.x + photo.w / 2 - w / 2, y: photo.y - h - gap },
    { x: photo.x + photo.w / 2 - w / 2, y: photo.y + photo.h + gap },
    { x: photo.x + photo.w - w - gap, y: photo.y - h - gap },
    { x: photo.x + gap, y: photo.y + photo.h + gap },
  ];

  const clamped = candidates.map((c) => ({
    x: Math.max(pad, Math.min(c.x, canvasWidth - pad - w)),
    y: Math.max(pad, c.y),
    w,
    h,
  }));

  let s = (seed + 7) >>> 0;
  const rng = () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  const order = clamped.map((_, i) => i).sort(() => rng() - 0.5);

  for (const idx of order) {
    const box = clamped[idx];
    if (box.x + box.w > canvasWidth - pad) continue;
    let hit = false;
    for (const p of placed) {
      if (boxesCollide(box, p, gap)) { hit = true; break; }
    }
    if (!hit) return { ...box, text };
  }
  return null;
}

/** 照片微旋转（含人脸的不旋转） */
function photoRotation(index: number, hasFaces: boolean): number {
  if (hasFaces) return 0;
  return ((index * 7 + 3) % 9) - 4;
}

/**
 * 主入口：根据照片数量和 layout_hints 计算排版。
 *
 * 策略：
 * 1. 按 importance 降序排列照片索引
 * 2. 贪心跳行：从最重要开始，逐个加入直到宽度填满阈值
 * 3. 每行高度由该行照片的 aspectRatio 总和决定
 */
export function computeRowPack(
  count: number,
  captions: string[],
  hints: LayoutHint[] | undefined,
  options?: Partial<typeof PACK_DEFAULTS>,
): RowPackResult {
  const opts = { ...PACK_DEFAULTS, ...options };
  const { canvasWidth, padding, rowGap, photoGap, rowFillThreshold,
          rowHeightMin, rowHeightMax } = opts;

  if (count === 0) return { rows: [], canvasWidth, canvasHeight: 0 };

  /* 为每张照片准备 hints */
  const photoHints: LayoutHint[] = [];
  for (let i = 0; i < count; i++) {
    if (hints && i < hints.length) {
      photoHints.push({
        importance: hints[i].importance ?? 0.5,
        hasFaces: hints[i].hasFaces ?? false,
        aspectRatio: hints[i].aspectRatio ?? 1.0,
      });
    } else {
      photoHints.push({ importance: 0.5, hasFaces: false, aspectRatio: 1.0 });
    }
  }

  /* 按 importance 降序排列的索引 */
  const sortedIndices = photoHints
    .map((h, i) => ({ idx: i, imp: h.importance }))
    .sort((a, b) => b.imp - a.imp)
    .map((x) => x.idx);

  const rows: PackedRow[] = [];
  const usedBBoxes: { x: number; y: number; w: number; h: number }[] = [];

  let cursor = 0;
  let currentY = padding;

  while (cursor < count) {
    const rowIndices: number[] = [];
    let sumAspect = 0;
    let totalImportance = 0;

    /* 贪心收集：尽可能填满行宽 */
    for (let j = cursor; j < count; j++) {
      const idx = sortedIndices[j];
      const hint = photoHints[idx];
      const testSum = sumAspect + hint.aspectRatio;
      if (rowIndices.length > 0 && testSum * rowHeightMin > canvasWidth * rowFillThreshold) {
        break;
      }
      rowIndices.push(idx);
      sumAspect += hint.aspectRatio;
      totalImportance += hint.importance;
      if (rowIndices.length >= opts.maxRowPhotos) break;
    }

    /* 计算行高 */
    const idealHeight = sumAspect > 0 ? canvasWidth / sumAspect : 200;
    const rowHeight = Math.max(rowHeightMin, Math.min(idealHeight, rowHeightMax));

    /* 放置照片 */
    const placedPhotos: PackedPhoto[] = [];
    const bubbles: PackedBubble[] = [];
    const rowBBoxes: { x: number; y: number; w: number; h: number }[] = [];

    let photoX = padding;
    for (const idx of rowIndices) {
      const hint = photoHints[idx];
      const pw = Math.round(rowHeight * hint.aspectRatio);
      const ph = Math.round(rowHeight);
      const rotate = photoRotation(idx, hint.hasFaces);

      const pbox = { x: photoX, y: currentY, w: pw, h: ph };
      placedPhotos.push({ index: idx, x: photoX, y: currentY, w: pw, h: ph, rotate, aspectRatio: hint.aspectRatio });
      rowBBoxes.push(pbox);
      usedBBoxes.push(pbox);

      photoX += pw + photoGap;

      /* 气泡 */
      const caption = (captions[idx] ?? "").trim();
      if (caption) {
        const bubble = placeBubble(caption, pbox, [...usedBBoxes, ...rowBBoxes], canvasWidth, idx);
        if (bubble) {
          usedBBoxes.push(bubble);
          rowBBoxes.push(bubble);
          bubbles.push(bubble);
        }
      }
    }

    rows.push({ photos: placedPhotos, bubbles });
    currentY += Math.round(rowHeight + rowGap);
    cursor += rowIndices.length;
  }

  return {
    rows,
    canvasWidth,
    canvasHeight: Math.ceil(currentY - rowGap + padding),
  };
}
```

- [ ] **Step 2: 验证类型检查**

```bash
cd frontend
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/templates/layout/row-pack.ts
git commit -m "feat(frontend): add row-packing layout engine"
```

---

### Task 4: 前端 — 更新 ImageCollageTemplate 使用新引擎

**Files:**
- Modify: `frontend/src/components/templates/image-collage-template.tsx`

**Interfaces:**
- Consumes: `computeRowPack()` from `row-pack.ts`, `copy.layoutHints` from session
- Produces: 渲染后的模板 DOM，可导出 PNG

- [ ] **Step 1: 重写 image-collage-template.tsx**

```typescript
"use client";

import { forwardRef, useMemo } from "react";
import type { TemplateRenderProps } from "@/lib/templates/registry";
import { computeRowPack } from "@/lib/templates/layout/row-pack";

export const ImageCollageTemplate = forwardRef<
  HTMLDivElement,
  TemplateRenderProps
>(function ImageCollageTemplate({ copy, photos }, ref) {
  const layout = useMemo(
    () =>
      computeRowPack(
        photos.length,
        copy.captions,
        copy.layoutHints?.map((h) => ({
          importance: h.importance,
          hasFaces: h.hasFaces,
          aspectRatio: h.aspectRatio,
        })),
      ),
    [photos.length, copy.captions, copy.layoutHints],
  );

  return (
    <div
      ref={ref}
      data-dayframe-export-root
      data-export-bg="#f5f0eb"
      className="relative shrink-0 overflow-hidden"
      style={{
        width: layout.canvasWidth,
        height: layout.canvasHeight,
        backgroundColor: "#f5f0eb",
      }}
    >
      {layout.rows.map((row, ri) => (
        <div key={`row-${ri}`}>
          {row.photos.map((photo) => (
            <div
              key={`photo-${photo.index}`}
              className="absolute overflow-hidden rounded-lg bg-white shadow-[0_4px_12px_-4px_rgba(0,0,0,0.2)]"
              style={{
                left: photo.x,
                top: photo.y,
                width: photo.w,
                height: photo.h,
                transform: `rotate(${photo.rotate}deg)`,
                zIndex: 10 + photo.index,
              }}
            >
              <img
                src={photos[photo.index]}
                alt={`照片 ${photo.index + 1}`}
                className="h-full w-full object-cover"
                draggable={false}
              />
            </div>
          ))}
          {row.bubbles.map((bubble, bi) => (
            <div
              key={`bubble-${ri}-${bi}`}
              className="absolute rounded-xl border border-zinc-300 bg-white/95 px-2.5 py-1.5 text-[11px] leading-snug text-zinc-800 shadow-[1px_2px_0_rgba(0,0,0,0.08)]"
              style={{
                left: bubble.x,
                top: bubble.y,
                width: bubble.w,
                zIndex: 50 + ri * 10 + bi,
              }}
            >
              <p className="whitespace-pre-wrap break-words">{bubble.text}</p>
              <span
                className="absolute -bottom-1.5 left-4 h-2.5 w-2.5 rotate-45 border-b border-r border-zinc-300 bg-white"
                aria-hidden
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
});
```

- [ ] **Step 2: 验证类型检查和 lint**

```bash
cd frontend
npx tsc --noEmit
npm run lint 2>&1 | grep "image-collage-template"
```

应只留 `<img>` 的 warning（全仓库一致，可忽略）。

- [ ] **Step 3: 重启前后端验证全流程**

```bash
# 终端 A: 前端
cd frontend && npm run dev

# 终端 B: 后端
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

上传 3-5 张照片，选"图片拼接"模板，确认：
- 后端返回 200（含 `layout_hints`）
- 结果页按行排版，重要的照片占更大空间
- 气泡在照片周围
- 导出 PNG 正常

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/templates/image-collage-template.tsx
git commit -m "feat(frontend): integrate row-pack engine into ImageCollageTemplate"
```
