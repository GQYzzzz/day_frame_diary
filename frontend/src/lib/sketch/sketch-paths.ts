/** 手绘风 SVG 路径（viewBox 0–100；outline 点为 0–1 归一化） */

export type NormPoint = { x: number; y: number };

export function mulberry32(seed: number) {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function jitter(rand: () => number, amp: number): number {
  return (rand() - 0.5) * 2 * amp;
}

/** 沿轮廓点绘制一笔画闭合路径（轻微抖动，贴合物体外形） */
export function handDrawnContourPath(
  points: NormPoint[],
  seed: number,
  scale = 100,
): string {
  if (points.length < 3) return "";

  const rand = mulberry32(seed);
  const pts = points.map((p) => ({
    x: p.x * scale + jitter(rand, 0.25),
    y: p.y * scale + jitter(rand, 0.25),
  }));

  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const mx = (prev.x + curr.x) / 2;
    const my = (prev.y + curr.y) / 2;
    d += ` Q ${prev.x.toFixed(2)} ${prev.y.toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)}`;
  }
  const last = pts[pts.length - 1];
  const first = pts[0];
  const mx = (last.x + first.x) / 2;
  const my = (last.y + first.y) / 2;
  d += ` Q ${last.x.toFixed(2)} ${last.y.toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)} Z`;
  return d;
}

/** 引导线接到轮廓上离标签最近的点 */
export function nearestPointOnContour(
  points: NormPoint[],
  labelX: number,
  labelY: number,
  scale = 100,
): { x: number; y: number } {
  if (!points.length) return { x: labelX, y: labelY };
  let best = points[0];
  let bestD = Infinity;
  for (const p of points) {
    const px = p.x * scale;
    const py = p.y * scale;
    const d = (px - labelX) ** 2 + (py - labelY) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return { x: best.x * scale, y: best.y * scale };
}

export function connectorPath(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  seed: number,
  useDashed = false,
): { d: string; dashed: boolean } {
  const rand = mulberry32(seed + 17);
  const mx = (fromX + toX) / 2 + jitter(rand, 4);
  const my = (fromY + toY) / 2 + jitter(rand, 4);
  const d = `M ${fromX.toFixed(2)} ${fromY.toFixed(2)} Q ${mx.toFixed(2)} ${my.toFixed(2)} ${toX.toFixed(2)} ${toY.toFixed(2)}`;
  return { d, dashed: useDashed };
}

export function labelAnchorEdge(
  lx: number,
  ly: number,
  tx: number,
  ty: number,
): { x: number; y: number } {
  const dx = tx - lx;
  const dy = ty - ly;
  const len = Math.hypot(dx, dy) || 1;
  const pad = 2;
  return {
    x: lx + (dx / len) * pad,
    y: ly + (dy / len) * pad,
  };
}
