/* ───────────────────────────────────────────
   Content-Aware Row-Packing Layout Engine
   ───────────────────────────────────────────
   AI 输出 layout_hints（语义信息），
   引擎据此用贪心跳行算法计算精确坐标。
   AI 不碰坐标，引擎不碰语义。          */

import { boxesCollide } from "@/lib/templates/layout/collision";
import { createRng } from "@/lib/templates/layout/prng";

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

/* 气泡尺寸估算 */
function estimateBubbleSize(text: string): { w: number; h: number } {
  const charsPerLine = 14;
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  return {
    w: Math.min(Math.max(text.length * 7 + 20, 72), 140),
    h: Math.max(lines * 16 + 16, 32),
  };
}

/* Fisher-Yates 洗牌 */
function shuffleIndices(n: number, seed: number): number[] {
  const rng = createRng(seed + 7);
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
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

  for (const idx of shuffleIndices(clamped.length, seed)) {
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
      if (rowIndices.length >= opts.maxRowPhotos) break;
    }

    /* 计算行高 */
    const idealHeight = sumAspect > 0 ? canvasWidth / sumAspect : 200;
    const rowHeight = Math.max(rowHeightMin, Math.min(idealHeight, rowHeightMax));

    /* 放置照片 */
    const placedPhotos: PackedPhoto[] = [];
    const bubbles: PackedBubble[] = [];

    let photoX = padding;
    for (const idx of rowIndices) {
      const hint = photoHints[idx];
      const pw = Math.round(rowHeight * hint.aspectRatio);
      const ph = Math.round(rowHeight);
      const rotate = photoRotation(idx, hint.hasFaces);

      const pbox = { x: photoX, y: currentY, w: pw, h: ph };
      placedPhotos.push({ index: idx, x: photoX, y: currentY, w: pw, h: ph, rotate, aspectRatio: hint.aspectRatio });
      usedBBoxes.push(pbox);

      photoX += pw + photoGap;

      /* 气泡 */
      const caption = (captions[idx] ?? "").trim();
      if (caption) {
        const bubble = placeBubble(caption, pbox, usedBBoxes, canvasWidth, idx);
        if (bubble) {
          usedBBoxes.push(bubble);
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
