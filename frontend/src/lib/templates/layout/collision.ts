import type { BBox } from "@/lib/templates/layout-types";

export function bboxArea(b: BBox): number {
  return b.w * b.h;
}

export function bboxOverlapArea(a: BBox, b: BBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  if (x2 <= x1 || y2 <= y1) return 0;
  return (x2 - x1) * (y2 - y1);
}

/** 重叠面积占较小框的比例 */
export function overlapRatio(a: BBox, b: BBox): number {
  const inter = bboxOverlapArea(a, b);
  if (inter <= 0) return 0;
  return inter / Math.min(bboxArea(a), bboxArea(b));
}

export function inflate(b: BBox, pad: number): BBox {
  return { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
}

/** 两框是否有任意面积重叠（含 margin 间隙） */
export function boxesCollide(a: BBox, b: BBox, gap = 0): boolean {
  const pa = inflate(a, gap);
  const pb = inflate(b, gap);
  return bboxOverlapArea(pa, pb) > 0;
}
