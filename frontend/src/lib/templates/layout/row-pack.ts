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
  canvasHeightMin: 500,
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

/* 在照片周围尝试放置气泡（caption），支持略微重叠 */
function placeBubble(
  text: string,
  photo: { x: number; y: number; w: number; h: number },
  obstacles: { x: number; y: number; w: number; h: number }[],
  canvasWidth: number,
  seed: number,
): PackedBubble | null {
  const { w, h } = estimateBubbleSize(text);
  if (w <= 0 || h <= 0) return null;

  const gap = PACK_DEFAULTS.bubbleGap;
  const pad = PACK_DEFAULTS.padding;
  const overlap = 6;

  const outerCandidates = [
    { x: photo.x + photo.w + gap, y: photo.y },
    { x: photo.x - w - gap, y: photo.y },
    { x: photo.x + photo.w / 2 - w / 2, y: photo.y - h - gap },
    { x: photo.x + photo.w / 2 - w / 2, y: photo.y + photo.h + gap },
    { x: photo.x + photo.w - w - gap, y: photo.y - h - gap },
    { x: photo.x + gap, y: photo.y + photo.h + gap },
  ];

  const overlapCandidates = [
    { x: photo.x + photo.w - w + overlap, y: photo.y + overlap },
    { x: photo.x + overlap, y: photo.y + photo.h - h - overlap },
    { x: photo.x + photo.w - w / 2 - overlap, y: photo.y + overlap },
    { x: photo.x + overlap, y: photo.y + overlap },
  ];

  const candidates = [...outerCandidates, ...overlapCandidates];

  for (const idx of shuffleIndices(candidates.length, seed)) {
    const c = candidates[idx];
    const box = {
      x: Math.max(pad, Math.min(c.x, canvasWidth - pad - w)),
      y: Math.max(pad, c.y),
      w, h,
    };
    if (box.x + box.w > canvasWidth - pad) continue;
    let hit = false;
    for (const p of obstacles) {
      if (boxesCollide(box, p, 0)) { hit = true; break; }
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
 * 3. ≤7 张时画布高度固定，行高由画布高度反推以铺满画布
 * 4. >7 张时画布延伸，行高由照片 aspectRatio 决定
 */
export function computeRowPack(
  count: number,
  captions: string[],
  hints: LayoutHint[] | undefined,
  options?: Partial<typeof PACK_DEFAULTS>,
): RowPackResult {
  const opts = { ...PACK_DEFAULTS, ...options };
  const { canvasWidth, padding, rowGap, photoGap, rowFillThreshold,
          rowHeightMin, rowHeightMax, canvasHeightMin } = opts;

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

  let cursor = 0;
  let currentY = padding;

  /* 统一贪心分组：按重要度排序，逐行分配 */
  const rowGroups: number[][] = [];
  while (cursor < count) {
    const group: number[] = [];
    let sumAspect = 0;
    let groupMaxImp = 0;
    for (let j = cursor; j < count; j++) {
      const idx = sortedIndices[j];
      const hint = photoHints[idx];
      const testSum = sumAspect + hint.aspectRatio;
      if (group.length > 0 && testSum * rowHeightMin > canvasWidth * rowFillThreshold) break;
      const newMaxImp = Math.max(groupMaxImp, hint.importance);
      const maxInRow = newMaxImp > 0.7 ? 2 : 3;
      if (group.length >= maxInRow) break;
      group.push(idx);
      sumAspect += hint.aspectRatio;
      groupMaxImp = newMaxImp;
    }
    rowGroups.push(group);
    cursor += group.length;
  }

  const compact = rowGroups.length <= 3;

  /* 计算每行的行高 */
  let rowHeights: number[];
  if (compact) {
    /* ≤7 张：固定画布高度，行高取整铺满 */
    const totalPhotoH = canvasHeightMin - padding * 2 - rowGap * (rowGroups.length - 1);
    let baseH = Math.max(rowHeightMin, totalPhotoH / rowGroups.length);
    rowHeights = rowGroups.map(() => baseH);
    /* 第 1 轮：如果某行照片总宽超过可用宽度，缩小该行行高 */
    for (let ri = 0; ri < rowGroups.length; ri++) {
      const group = rowGroups[ri];
      const gapTotal = photoGap * (group.length - 1);
      const availW = canvasWidth - padding * 2 - gapTotal;
      const totalPhotoW = group.reduce((s, idx) => s + rowHeights[ri] * photoHints[idx].aspectRatio, 0);
      if (totalPhotoW > availW) {
        const scale = availW / totalPhotoW;
        rowHeights[ri] = Math.max(rowHeightMin, rowHeights[ri] * scale);
      }
    }
    /* 第 2 轮：把第 1 轮未用完的垂直空间匀给没有溢出的行 */
    const usedV = rowHeights.reduce((s, h) => s + h, 0) + rowGap * (rowGroups.length - 1);
    const leftover = totalPhotoH - usedV;
    if (leftover > 4) {
      const adjustable = rowGroups.map((_, ri) => ri).filter((ri) => {
        const group = rowGroups[ri];
        const testH = rowHeights[ri] + leftover;
        const w = group.reduce((s, idx) => s + testH * photoHints[idx].aspectRatio, 0);
        const availW = canvasWidth - padding * 2 - photoGap * (group.length - 1);
        return w <= availW + 1;
      });
      if (adjustable.length > 0) {
        const extra = Math.floor(leftover / adjustable.length);
        for (const ri of adjustable) rowHeights[ri] += extra;
      }
    }
  } else {
    /* >7 张：行高由 aspectRatio 总和决定（延伸画布） */
    rowHeights = rowGroups.map((group) => {
      const sumAspect = group.reduce((s, idx) => s + photoHints[idx].aspectRatio, 0);
      const gapTotal = photoGap * (group.length - 1);
      const availW = canvasWidth - padding * 2 - gapTotal;
      const idealH = sumAspect > 0 ? availW / sumAspect : 200;
      return Math.max(rowHeightMin, Math.min(idealH, rowHeightMax));
    });
  }

  /* 第 1 轮：放置所有照片，收集全部照片位置 */
  const allPhotoBoxes: { idx: number; box: { x: number; y: number; w: number; h: number } }[] = [];
  for (let ri = 0; ri < rowGroups.length; ri++) {
    const group = rowGroups[ri];
    const rowHeight = rowHeights[ri];
    const placedPhotos: PackedPhoto[] = [];

    const photoWidths = group.map((idx) => Math.round(rowHeight * photoHints[idx].aspectRatio));
    const totalContentW = photoWidths.reduce((s, w) => s + w, 0) + photoGap * (group.length - 1);
    const availW = canvasWidth - padding * 2;
    let photoX: number;
    if (group.length === 1) {
      photoX = Math.round((canvasWidth - photoWidths[0]) / 2);
    } else if (compact && totalContentW < availW) {
      const sidePad = padding + Math.round((availW - totalContentW) / 2);
      photoX = sidePad;
    } else {
      photoX = padding;
    }

    for (let pi = 0; pi < group.length; pi++) {
      const idx = group[pi];
      const pw = photoWidths[pi];
      const ph = Math.round(rowHeight);
      const rotate = photoRotation(idx, photoHints[idx].hasFaces);
      const box = { x: photoX, y: currentY, w: pw, h: ph };

      placedPhotos.push({ index: idx, x: photoX, y: currentY, w: pw, h: ph, rotate, aspectRatio: photoHints[idx].aspectRatio });
      allPhotoBoxes.push({ idx, box });

      photoX += pw + photoGap;
    }

    rows.push({ photos: placedPhotos, bubbles: [] });
    currentY += Math.round(rowHeight + rowGap);
  }

  /* 第 2 轮：为每张照片放置气泡（已知全部照片位置，避免跨行重叠） */
  const allBBoxes = allPhotoBoxes.map((p) => p.box);
  for (let ri = 0; ri < rows.length; ri++) {
    const bubbles: PackedBubble[] = [];
    for (const photo of rows[ri].photos) {
      const caption = (captions[photo.index] ?? "").trim();
      if (!caption) continue;
      const photoBox = { x: photo.x, y: photo.y, w: photo.w, h: photo.h };
      /* 已知全部照片位置，但排除自己的照片（允许略微重叠） */
      const others = allBBoxes.filter(
        (b) => !(b.x === photoBox.x && b.y === photoBox.y && b.w === photoBox.w && b.h === photoBox.h),
      );
      const bubble = placeBubble(caption, photoBox, others, canvasWidth, photo.index);
      if (bubble) {
        allBBoxes.push(bubble);
        bubbles.push(bubble);
      }
    }
    rows[ri] = { ...rows[ri], bubbles };
  }

  return {
    rows,
    canvasWidth,
    canvasHeight: compact ? canvasHeightMin : Math.ceil(currentY - rowGap + padding),
  };
}
