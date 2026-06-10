import type {
  PhotoSketch,
  SketchCallout,
  SketchDecoration,
} from "@/lib/types";

const DECOS = new Set<SketchDecoration>([
  "heart",
  "sparkle",
  "steam",
  "smile",
  "star",
]);

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function normalizeOutline(raw: unknown): SketchCallout["outline"] {
  if (!Array.isArray(raw)) return undefined;
  const pts = raw
    .map((p) => {
      if (!p || typeof p !== "object") return null;
      const o = p as Record<string, unknown>;
      const x = Number(o.x ?? o[0]);
      const y = Number(o.y ?? o[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { x: clamp01(x), y: clamp01(y) };
    })
    .filter((p): p is { x: number; y: number } => p !== null);
  return pts.length >= 4 ? pts : undefined;
}

function normalizeCallout(raw: Record<string, unknown>): SketchCallout {
  const deco = raw.decoration;
  return {
    subject: String(raw.subject ?? "detail"),
    text: String(raw.text ?? "nice ♡"),
    targetX: clamp01(Number(raw.target_x ?? raw.targetX ?? 0.5)),
    targetY: clamp01(Number(raw.target_y ?? raw.targetY ?? 0.5)),
    targetW: clamp01(Number(raw.target_w ?? raw.targetW ?? 0.2)),
    targetH: clamp01(Number(raw.target_h ?? raw.targetH ?? 0.15)),
    labelX: clamp01(Number(raw.label_x ?? raw.labelX ?? 0.15)),
    labelY: clamp01(Number(raw.label_y ?? raw.labelY ?? 0.15)),
    outline: normalizeOutline(raw.outline),
    decoration:
      typeof deco === "string" && DECOS.has(deco as SketchDecoration)
        ? (deco as SketchDecoration)
        : undefined,
  };
}

export function normalizePhotoSketch(raw: unknown): PhotoSketch {
  const o =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const calloutsRaw = Array.isArray(o.callouts) ? o.callouts : [];
  const callouts = calloutsRaw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map(normalizeCallout);
  return {
    callouts,
    summary: String(o.summary ?? ""),
    summaryX: clamp01(Number(o.summary_x ?? o.summaryX ?? 0.78)),
    summaryY: clamp01(Number(o.summary_y ?? o.summaryY ?? 0.9)),
  };
}

export function normalizeSketches(
  raw: unknown,
  photoCount: number,
): PhotoSketch[] {
  const list = Array.isArray(raw) ? raw : [];
  const out = list.slice(0, photoCount).map(normalizePhotoSketch);
  while (out.length < photoCount) {
    out.push({
      callouts: [],
      summary: "A little moment ♡",
      summaryX: 0.78,
      summaryY: 0.9,
    });
  }
  return out;
}
