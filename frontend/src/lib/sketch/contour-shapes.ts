import type { SketchCallout } from "@/lib/types";

export type NormPoint = { x: number; y: number };

function clamp01(n: number): number {
  return Math.max(0.02, Math.min(0.98, n));
}

/** 沿 bbox 采样一圈点（可拉成长条 / 扁圆，模拟餐盘、刀叉等） */
function sampleBlobContour(
  cx: number,
  cy: number,
  w: number,
  h: number,
  aspect: "wide" | "tall" | "round" | "irregular",
  count: number,
  wobble = 0.06,
): NormPoint[] {
  const hw = w / 2;
  const hh = h / 2;
  const pts: NormPoint[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2;
    let rx = hw;
    let ry = hh;
    if (aspect === "wide") rx *= 1.15;
    if (aspect === "tall") ry *= 1.2;
    if (aspect === "irregular") {
      rx *= 1 + Math.sin(t * 3) * wobble;
      ry *= 1 + Math.cos(t * 2) * wobble;
    }
    pts.push({
      x: clamp01(cx + Math.cos(t) * rx),
      y: clamp01(cy + Math.sin(t) * ry),
    });
  }
  return pts;
}

/** 细长物件（刀叉、杯柄）用折线轮廓 */
function utensilContour(cx: number, cy: number, w: number, h: number): NormPoint[] {
  const hw = w / 2;
  const hh = h / 2;
  return [
    { x: cx - hw * 0.35, y: cy - hh },
    { x: cx + hw * 0.4, y: cy - hh * 0.85 },
    { x: cx + hw, y: cy - hh * 0.2 },
    { x: cx + hw * 0.9, y: cy + hh * 0.35 },
    { x: cx + hw * 0.25, y: cy + hh },
    { x: cx - hw * 0.5, y: cy + hh * 0.75 },
    { x: cx - hw, y: cy },
    { x: cx - hw * 0.6, y: cy - hh * 0.5 },
  ].map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) }));
}

/** 画框 / 标牌类矩形圆角轮廓 */
function frameContour(cx: number, cy: number, w: number, h: number): NormPoint[] {
  const hw = w / 2;
  const hh = h / 2;
  const inset = 0.12;
  return [
    { x: cx - hw, y: cy - hh + hh * inset },
    { x: cx - hw + hw * inset, y: cy - hh },
    { x: cx + hw - hw * inset, y: cy - hh },
    { x: cx + hw, y: cy - hh + hh * inset },
    { x: cx + hw, y: cy + hh - hh * inset },
    { x: cx + hw - hw * inset, y: cy + hh },
    { x: cx - hw + hw * inset, y: cy + hh },
    { x: cx - hw, y: cy + hh - hh * inset },
  ].map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) }));
}

const TALL_RE =
  /knife|fork|spoon|utensil|glass|stem|bottle|pen|brush|column|tower/i;
const WIDE_RE = /plate|dish|bowl|steak|food|pizza|tray|table|sign|banner/i;
const FRAME_RE = /frame|portrait|painting|art|building|facade|window|door|sign|museum/i;
const ROUND_RE = /cup|mug|pot|sauce|wine|glass|ball|flower|face|clock/i;

export function resolveCalloutOutline(c: SketchCallout): NormPoint[] {
  if (c.outline && c.outline.length >= 4) {
    return c.outline.map((p) => ({
      x: clamp01(p.x),
      y: clamp01(p.y),
    }));
  }

  const sub = c.subject.toLowerCase();
  const cx = c.targetX;
  const cy = c.targetY;
  const w = Math.max(0.1, c.targetW);
  const h = Math.max(0.08, c.targetH);

  if (TALL_RE.test(sub) && h > w * 1.1) {
    return utensilContour(cx, cy, w, h);
  }
  if (FRAME_RE.test(sub)) {
    return frameContour(cx, cy, w, h);
  }
  if (WIDE_RE.test(sub) && w > h * 1.15) {
    return sampleBlobContour(cx, cy, w, h, "wide", 14, 0.05);
  }
  if (ROUND_RE.test(sub)) {
    return sampleBlobContour(cx, cy, w, h, "round", 16, 0.04);
  }
  const aspect =
    w > h * 1.25 ? "wide" : h > w * 1.25 ? "tall" : "irregular";
  return sampleBlobContour(cx, cy, w, h, aspect, 12, 0.07);
}
