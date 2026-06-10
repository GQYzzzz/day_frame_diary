import { resolveCalloutOutline } from "@/lib/sketch/contour-shapes";
import type { PhotoSketch, SketchCallout } from "@/lib/types";

/** 六组锚点：人物 / 建筑 / 天空 / 地面 / 标牌 / 氛围 */
const ANCHORS: Array<{
  subject: string;
  labelX: number;
  labelY: number;
  targetX: number;
  targetY: number;
  targetW: number;
  targetH: number;
  deco?: SketchCallout["decoration"];
}> = [
  {
    subject: "person",
    labelX: 0.1,
    labelY: 0.55,
    targetX: 0.42,
    targetY: 0.58,
    targetW: 0.2,
    targetH: 0.42,
    deco: "smile",
  },
  {
    subject: "building",
    labelX: 0.72,
    labelY: 0.2,
    targetX: 0.52,
    targetY: 0.28,
    targetW: 0.55,
    targetH: 0.32,
    deco: "sparkle",
  },
  {
    subject: "sign",
    labelX: 0.14,
    labelY: 0.32,
    targetX: 0.58,
    targetY: 0.48,
    targetW: 0.38,
    targetH: 0.14,
  },
  {
    subject: "sky",
    labelX: 0.78,
    labelY: 0.12,
    targetX: 0.5,
    targetY: 0.12,
    targetW: 0.7,
    targetH: 0.18,
    deco: "sparkle",
  },
  {
    subject: "grass",
    labelX: 0.18,
    labelY: 0.82,
    targetX: 0.5,
    targetY: 0.88,
    targetW: 0.85,
    targetH: 0.12,
  },
  {
    subject: "moment",
    labelX: 0.7,
    labelY: 0.75,
    targetX: 0.35,
    targetY: 0.4,
    targetW: 0.3,
    targetH: 0.35,
    deco: "heart",
  },
];

const EN_SNIPPETS = [
  "Such a good vibe here ♡",
  "Love this view :)",
  "Perfect day for a walk",
  "Iconic spot, must visit",
  "Sky so clear today",
  "Feels calm and happy",
];

export function buildFallbackSketch(
  caption: string,
  index: number,
): PhotoSketch {
  const lines = caption
    .split(/[。！？\n,.]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const callouts: SketchCallout[] = ANCHORS.map((a, i) => {
    const cn = lines[i] ?? lines[0] ?? "";
    const en =
      EN_SNIPPETS[(i + index) % EN_SNIPPETS.length] +
      (cn ? ` — ${cn.slice(0, 20)}` : "");
    const base: SketchCallout = {
      subject: a.subject,
      text: `${en} ♡`.slice(0, 52),
      targetX: a.targetX,
      targetY: a.targetY,
      targetW: a.targetW,
      targetH: a.targetH,
      labelX: a.labelX,
      labelY: a.labelY,
      decoration: a.deco,
    };
    return { ...base, outline: resolveCalloutOutline(base) };
  });

  return {
    callouts,
    summary: lines[0]
      ? `${lines[0].slice(0, 40)} :)` 
      : "A little moment worth keeping ♡",
    summaryX: 0.76,
    summaryY: 0.9,
  };
}

export function sketchNeedsFallback(sk: PhotoSketch | undefined): boolean {
  if (!sk) return true;
  return sk.callouts.length < 3;
}
