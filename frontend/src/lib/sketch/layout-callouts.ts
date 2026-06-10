import type { SketchCallout } from "@/lib/types";

const MIN_LABEL_DIST = 0.14;

function dist(a: SketchCallout, b: SketchCallout): number {
  return Math.hypot(a.labelX - b.labelX, a.labelY - b.labelY);
}

/** 将标签从彼此和 summary 区域推开，减少重叠 */
export function resolveCalloutLayout(
  callouts: SketchCallout[],
  summaryX: number,
  summaryY: number,
  seed: number,
): SketchCallout[] {
  const items = callouts.map((c) => ({ ...c }));
  const nudge = (i: number, dx: number, dy: number) => {
    items[i].labelX = Math.max(0.06, Math.min(0.94, items[i].labelX + dx));
    items[i].labelY = Math.max(0.06, Math.min(0.9, items[i].labelY + dy));
  };

  for (let pass = 0; pass < 24; pass++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const d = dist(items[i], items[j]);
        if (d < MIN_LABEL_DIST) {
          const push = (MIN_LABEL_DIST - d) / 2;
          const ax = items[j].labelX - items[i].labelX || 0.01;
          const ay = items[j].labelY - items[i].labelY || 0.01;
          const len = Math.hypot(ax, ay);
          nudge(i, (-ax / len) * push, (-ay / len) * push);
          nudge(j, (ax / len) * push, (ay / len) * push);
          moved = true;
        }
      }
      const ds = Math.hypot(
        items[i].labelX - summaryX,
        items[i].labelY - summaryY,
      );
      if (ds < MIN_LABEL_DIST + 0.04) {
        nudge(i, 0, -0.05 - (seed % 7) * 0.002);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return items;
}
