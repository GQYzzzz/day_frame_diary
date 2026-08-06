import { boxesCollide } from "@/lib/templates/layout/collision";
import { createRng, rngBetween } from "@/lib/templates/layout/prng";
import { splitDiaryForBubbles } from "@/lib/templates/layout/split-diary";
import type {
  BBox,
  BubbleLayoutNode,
  LayoutNode,
  PhotoLayoutNode,
  ScrapbookLayout,
  StickerLayoutNode,
} from "@/lib/templates/layout-types";
import type { DayFrameCopy } from "@/lib/types";

export const SCRAPBOOK_CANVAS_WIDTH = 390;

const PADDING = 16;
const TOP_RESERVE = 64;
const PHOTO_ASPECT = 0.78;
/** 照片之间不允许重叠（旋转时用 AABB + 间距近似） */
const PHOTO_GAP = 14;
const TWO_PHOTO_VERTICAL_GAP = 52;
/** 双图布局：气泡不得超过此线（仅底部留标签条） */
const TWO_PHOTO_TAG_STRIP = 40;
const PHOTO_PLACE_TRIES = 36;
const BUBBLE_GAP = 8;
const BUBBLE_TAIL_EXTRA = 10;
const BUBBLE_SCAN_STEP_X = 8;
const BUBBLE_SCAN_STEP_Y = 10;

type ComputeInput = {
  photoCount: number;
  copy: DayFrameCopy;
  seed: number;
  canvasWidth?: number;
};

type SearchBounds = { minY: number; maxY: number };

/** 对角布局时气泡优先落区（如双图：右上 / 左下 / 中间） */
type DiagonalZone = "top-right" | "bottom-left" | "center";

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** 照片占画布主体，张数越少越大 */
function photoLongEdge(n: number, canvasWidth: number): number {
  const base =
    canvasWidth * (n <= 2 ? 0.78 : 0.66) / Math.pow(Math.max(n, 1), 0.42);
  return clamp(
    base,
    n === 1 ? 255 : 130,
    n === 1 ? 310 : n <= 2 ? 255 : 195,
  );
}

function estimateBubbleHeight(
  text: string,
  width: number,
  role: BubbleLayoutNode["role"],
): number {
  const charW = role === "hashtags" ? 9 : role === "diary" ? 10 : 11;
  const charsPerLine = Math.max(6, Math.floor(width / charW));
  const lines = Math.ceil(text.length / charsPerLine);
  const maxH = role === "diary" ? 64 : role === "caption" ? 56 : 96;
  return clamp(24 + lines * 14, 26, maxH) + BUBBLE_TAIL_EXTRA;
}

function bubbleWidthForRole(
  role: BubbleLayoutNode["role"],
  canvasWidth: number,
  photoW?: number,
): number {
  switch (role) {
    case "title":
      return clamp(canvasWidth * 0.72, 200, canvasWidth - PADDING * 2 - 16);
    case "caption":
      return clamp((photoW ?? 120) * 0.55, 84, 118);
    case "diary":
      return clamp(canvasWidth * 0.32, 92, 128);
    case "hashtags":
      return canvasWidth - PADDING * 2;
    default:
      return 120;
  }
}

function maxBottom(placed: BBox[]): number {
  let m = TOP_RESERVE;
  for (const p of placed) {
    m = Math.max(m, p.y + p.h);
  }
  return m;
}

function unionBBox(boxes: BBox[]): BBox | null {
  if (boxes.length === 0) return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const b of boxes) {
    x1 = Math.min(x1, b.x);
    y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.w);
    y2 = Math.max(y2, b.y + b.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function clampBubbleBox(
  x: number,
  y: number,
  w: number,
  h: number,
  canvasWidth: number,
): BBox {
  const maxX = canvasWidth - PADDING - w;
  return {
    x: clamp(x, PADDING, Math.max(PADDING, maxX)),
    y: Math.max(PADDING, y),
    w,
    h,
  };
}

function fitsInsideWidth(box: BBox, canvasWidth: number): boolean {
  return (
    box.x >= PADDING && box.x + box.w <= canvasWidth - PADDING + 0.5
  );
}

function fitsPhoto(box: BBox, placedPhotos: BBox[], gap = PHOTO_GAP): boolean {
  for (const p of placedPhotos) {
    if (boxesCollide(box, p, gap)) return false;
  }
  return true;
}

function fitsBubble(
  box: BBox,
  placed: BBox[],
  canvasWidth: number,
  yCeiling?: number,
): boolean {
  if (!fitsInsideWidth(box, canvasWidth)) return false;
  if (yCeiling !== undefined && box.y + box.h > yCeiling + 0.5) return false;
  for (const p of placed) {
    if (boxesCollide(box, p, BUBBLE_GAP)) return false;
  }
  return true;
}

function twoPhotoYCeiling(placedPhotos: BBox[], reserveTags: boolean): number {
  const p1 = placedPhotos[1];
  const strip = reserveTags ? TWO_PHOTO_TAG_STRIP : 12;
  return p1.y + p1.h + strip;
}

function collidesAny(box: BBox, placed: BBox[], gap: number): boolean {
  for (const p of placed) {
    if (boxesCollide(box, p, gap)) return true;
  }
  return false;
}

/**
 * 对角线布局：第 1 张左上，最后 1 张右下，中间张沿对角分布（避免并排）。
 */
function anchorForIndex(
  i: number,
  n: number,
  pw: number,
  ph: number,
  canvasWidth: number,
  rng: () => number,
): { x: number; y: number; rotateHint: number } {
  const usableW = canvasWidth - PADDING * 2 - pw;

  if (n === 1) {
    return {
      x: PADDING + usableW * 0.5 - pw * 0.5 + rngBetween(rng, -6, 6),
      y: TOP_RESERVE + 8 + rngBetween(rng, -6, 8),
      rotateHint: rngBetween(rng, -6, 6),
    };
  }

  if (n === 2) {
    if (i === 0) {
      return {
        x: PADDING + 10,
        y: TOP_RESERVE + 10,
        rotateHint: rngBetween(rng, -7, -3),
      };
    }
    const topPhotoBottom = TOP_RESERVE + 10 + ph;
    return {
      x: canvasWidth - PADDING - pw - 10,
      y: topPhotoBottom + TWO_PHOTO_VERTICAL_GAP,
      rotateHint: rngBetween(rng, 3, 7),
    };
  }

  const t = i / (n - 1);
  const spreadY = ph * 0.52 * (n - 1) + 16;
  return {
    x: PADDING + usableW * t + rngBetween(rng, -8, 8),
    y: TOP_RESERVE + spreadY * t + rngBetween(rng, -6, 10),
    rotateHint: rngBetween(rng, -8, 8) * (i % 2 === 0 ? 1 : -1),
  };
}

/** 双图时：第 i 张图的气泡优先落在其旁边的走廊 */
function zoneBesidePhoto(i: number, n: number): DiagonalZone | undefined {
  if (n !== 2) return undefined;
  return i === 0 ? "top-right" : "bottom-left";
}

/** 多图时默认贴在照片的哪一侧 */
function preferredSideBesidePhoto(
  i: number,
  n: number,
): "right" | "left" | "above" | "below" {
  if (n === 1) return "right";
  if (n === 2) return i === 0 ? "right" : "left";
  return i % 2 === 0 ? "right" : "left";
}

function distributeDiaryToPhotos(chunks: string[], n: number): string[][] {
  const perPhoto: string[][] = Array.from({ length: n }, () => []);
  chunks.forEach((chunk, idx) => {
    perPhoto[idx % n].push(chunk);
  });
  return perPhoto;
}

/** 紧贴某张照片的候选位置（优先于远处走廊扫描） */
function* positionsBesidePhoto(
  photo: BBox,
  canvasWidth: number,
  side: "right" | "left" | "above" | "below",
  bw: number,
  bh: number,
  yCeiling?: number,
): Generator<{ x: number; y: number }> {
  const yMid = photo.y + photo.h * 0.38 - bh * 0.5;
  const yLow = photo.y + photo.h - bh - 8;
  const yHigh = photo.y - bh - 8;

  const candidates: { x: number; y: number }[] = [];

  if (side === "right") {
    candidates.push(
      { x: photo.x + photo.w + 8, y: yMid },
      { x: photo.x + photo.w + 8, y: photo.y + 6 },
      { x: photo.x + photo.w + 8, y: yLow },
      { x: photo.x + photo.w * 0.55, y: yHigh },
    );
  } else if (side === "left") {
    candidates.push(
      { x: photo.x - bw - 10, y: yMid },
      { x: photo.x - bw - 10, y: photo.y + 10 },
      { x: PADDING + 4, y: photo.y + photo.h * 0.3 - bh * 0.5 },
      { x: photo.x - bw - 8, y: yLow },
    );
  } else if (side === "above") {
    candidates.push(
      { x: photo.x + photo.w * 0.2, y: yHigh },
      { x: photo.x + photo.w - bw, y: yHigh },
    );
  } else {
    candidates.push(
      { x: photo.x + 8, y: photo.y + photo.h + 8 },
      { x: photo.x + photo.w - bw, y: photo.y + photo.h + 6 },
    );
  }

  for (const c of candidates) {
    if (yCeiling !== undefined && c.y + bh > yCeiling) continue;
    if (c.x + bw > canvasWidth - PADDING || c.x < PADDING) continue;
    yield c;
  }
}

function tryPlacePhoto(
  i: number,
  n: number,
  pw: number,
  ph: number,
  canvasWidth: number,
  placedPhotos: BBox[],
  rng: () => number,
): PhotoLayoutNode {
  const base = anchorForIndex(i, n, pw, ph, canvasWidth, rng);

  if (n === 2) {
    let x = base.x;
    let y = base.y;
    if (i === 1 && placedPhotos[0]) {
      const p0 = placedPhotos[0];
      y = Math.max(base.y, p0.y + p0.h + TWO_PHOTO_VERTICAL_GAP);
      x = canvasWidth - PADDING - pw - 10;
    }
    const box: BBox = { x, y, w: pw, h: ph };
    if (!fitsPhoto(box, placedPhotos)) {
      y =
        (placedPhotos[0]?.y ?? TOP_RESERVE) +
        (placedPhotos[0]?.h ?? ph) +
        TWO_PHOTO_VERTICAL_GAP +
        8;
    }
    return {
      type: "photo",
      index: i,
      x: clamp(x, PADDING, canvasWidth - PADDING - pw),
      y: Math.max(TOP_RESERVE, y),
      w: pw,
      h: ph,
      rotate: base.rotateHint,
      zIndex: 10 + i * 2,
    };
  }

  let best: PhotoLayoutNode = {
    type: "photo",
    index: i,
    x: clamp(base.x, PADDING, canvasWidth - PADDING - pw),
    y: Math.max(TOP_RESERVE - 8, base.y),
    w: pw,
    h: ph,
    rotate: base.rotateHint,
    zIndex: 10 + i * 2,
  };

  for (let t = 0; t < PHOTO_PLACE_TRIES; t++) {
    const jitter = t * 3;
    const x = clamp(
      base.x + rngBetween(rng, -jitter, jitter),
      PADDING,
      canvasWidth - PADDING - pw,
    );
    const y = Math.max(TOP_RESERVE - 8, base.y + rngBetween(rng, -jitter, jitter));
    const rotate = base.rotateHint + rngBetween(rng, -4, 4);
    const box: BBox = { x, y, w: pw, h: ph };
    if (fitsPhoto(box, placedPhotos)) {
      best = {
        type: "photo",
        index: i,
        x,
        y,
        w: pw,
        h: ph,
        rotate,
        zIndex: 10 + i * 2,
      };
      break;
    }
  }

  return best;
}

/** 双图：气泡只能落在照片之间的走廊，不进入底部「拉长区」 */
function twoPhotoCorridors(
  placedPhotos: BBox[],
  canvasWidth: number,
  yCeiling: number,
  maxBubbleH: number,
): {
  topRight: SearchBounds & { xMin: number; xMax: number };
  bottomLeft: SearchBounds & { xMin: number; xMax: number };
  center: SearchBounds & { xMin: number; xMax: number };
} | null {
  if (placedPhotos.length < 2) return null;
  const p0 = placedPhotos[0];
  const p1 = placedPhotos[1];
  const gapTop = p0.y + p0.h + BUBBLE_GAP;
  const gapBottom = p1.y - BUBBLE_GAP;
  const bubbleCeiling = yCeiling - TWO_PHOTO_TAG_STRIP;

  return {
    topRight: {
      minY: TOP_RESERVE,
      maxY: Math.min(Math.max(gapTop, TOP_RESERVE + 36), bubbleCeiling - maxBubbleH),
      xMin: p0.x + p0.w + BUBBLE_GAP,
      xMax: canvasWidth - PADDING,
    },
    bottomLeft: {
      minY: gapTop,
      maxY: Math.min(gapBottom, bubbleCeiling) - maxBubbleH,
      xMin: PADDING,
      xMax: Math.max(PADDING + 36, Math.min(p1.x, p0.x) - BUBBLE_GAP),
    },
    center: {
      minY: gapTop,
      maxY: Math.min(gapBottom, bubbleCeiling) - maxBubbleH,
      xMin: PADDING + 8,
      xMax: canvasWidth - PADDING,
    },
  };
}

function* scanCorridor(
  corridor: SearchBounds & { xMin: number; xMax: number },
  bw: number,
): Generator<{ x: number; y: number }> {
  const xMax = Math.max(corridor.xMin, corridor.xMax - bw);
  const yEnd = corridor.maxY;
  if (yEnd <= corridor.minY) return;
  for (let y = corridor.minY; y <= yEnd; y += BUBBLE_SCAN_STEP_Y) {
    for (let x = corridor.xMin; x <= xMax; x += BUBBLE_SCAN_STEP_X) {
      yield { x, y };
    }
  }
}

function* diagonalZonePositions(
  canvasWidth: number,
  zone: DiagonalZone,
  placedPhotos: BBox[],
  bw: number,
  bh: number,
  rng: () => number,
  yCeiling: number,
): Generator<{ x: number; y: number }> {
  const corridors = twoPhotoCorridors(
    placedPhotos,
    canvasWidth,
    yCeiling,
    bh,
  );
  if (!corridors) return;

  const p0 = placedPhotos[0];
  const p1 = placedPhotos[1];
  const presets: { x: number; y: number }[] = [];

  if (zone === "top-right") {
    yield* positionsBesidePhoto(p0, canvasWidth, "right", bw, bh, yCeiling);
    presets.push(
      { x: p0.x + p0.w + 10, y: p0.y + 6 },
      { x: p0.x + p0.w + 14, y: p0.y - bh - 8 },
    );
    yield* scanCorridor(corridors.topRight, bw);
  } else if (zone === "bottom-left") {
    yield* positionsBesidePhoto(p1, canvasWidth, "left", bw, bh, yCeiling);
    presets.push(
      { x: p1.x - bw - 12, y: p1.y + 14 },
      { x: PADDING + 6, y: p1.y + p1.h * 0.35 - bh * 0.5 },
    );
    yield* scanCorridor(corridors.bottomLeft, bw);
  } else {
    const c = corridors.center;
    presets.push(
      {
        x: (p0.x + p1.x + p1.w) / 2 - bw / 2,
        y: (p0.y + p0.h + p1.y) / 2 - bh / 2,
      },
      { x: c.xMin + 12, y: c.minY + 8 },
      { x: c.xMax - bw - 12, y: c.maxY - bh - 16 },
    );
    yield* scanCorridor(corridors.center, bw);
  }

  const order = presets.map((_, i) => i).sort(() => rng() - 0.5);
  for (const i of order) {
    yield presets[i];
  }
}

function* bubbleCandidatePositions(
  canvasWidth: number,
  bw: number,
  bh: number,
  near: BBox | undefined,
  rng: () => number,
  opts: {
    zone?: DiagonalZone;
    placedPhotos?: BBox[];
    yCeiling?: number;
    photoIndex?: number;
    cluster?: BBox;
  },
): Generator<{ x: number; y: number }> {
  const { zone, placedPhotos, yCeiling, photoIndex, cluster } = opts;
  const nPhotos = placedPhotos?.length ?? 0;

  if (near) {
    const side =
      photoIndex !== undefined && photoIndex >= 0 && nPhotos > 0
        ? preferredSideBesidePhoto(photoIndex, nPhotos)
        : "right";
    yield* positionsBesidePhoto(near, canvasWidth, side, bw, bh, yCeiling);
    const offsets = [
      { x: near.x + near.w + 6, y: near.y + near.h * 0.35 - bh * 0.5 },
      { x: near.x - bw - 8, y: near.y + 10 },
      { x: near.x + near.w - bw - 4, y: near.y - bh - 6 },
      { x: near.x + 8, y: near.y + near.h - bh - 4 },
    ];
    for (const pos of offsets) {
      if (yCeiling === undefined || pos.y + bh <= yCeiling) yield pos;
    }
  }

  const zoneOnly =
    zone && placedPhotos && placedPhotos.length >= 2 && yCeiling !== undefined;
  if (zoneOnly) {
    yield* diagonalZonePositions(
      canvasWidth,
      zone,
      placedPhotos,
      bw,
      bh,
      rng,
      yCeiling,
    );
    return;
  }

  if (cluster) {
    yield {
      x: cluster.x + cluster.w + 6,
      y: cluster.y + cluster.h * 0.3,
    };
  }

  if (near) return;

  const yEnd = yCeiling ?? TOP_RESERVE + 320;
  const maxX = canvasWidth - PADDING - bw;
  for (let y = TOP_RESERVE; y <= yEnd - bh; y += BUBBLE_SCAN_STEP_Y) {
    for (let x = PADDING; x <= maxX; x += BUBBLE_SCAN_STEP_X) {
      yield { x, y };
    }
  }
}

function tryPlaceBubble(
  text: string,
  role: BubbleLayoutNode["role"],
  placed: BBox[],
  canvasWidth: number,
  zIndex: number,
  rng: () => number,
  opts: {
    near?: BBox;
    cluster?: BBox;
    photoIndex?: number;
    zone?: DiagonalZone;
    placedPhotos?: BBox[];
    yCeiling?: number;
  },
): BubbleLayoutNode | null {
  const baseW = bubbleWidthForRole(role, canvasWidth, opts.near?.w);
  const widths =
    opts.zone && opts.placedPhotos?.length === 2
      ? [baseW, baseW - 14, baseW - 28].map((w) =>
          Math.max(72, Math.min(w, canvasWidth - PADDING * 2 - 12)),
        )
      : [baseW];

  const zoneOnly =
    opts.zone &&
    opts.placedPhotos &&
    opts.placedPhotos.length >= 2 &&
    opts.yCeiling !== undefined;

  if (role === "title") {
    for (const w of widths) {
      const h = estimateBubbleHeight(text, w, role);
      const centered = clampBubbleBox(
        (canvasWidth - w) / 2,
        14,
        w,
        h,
        canvasWidth,
      );
      if (fitsBubble(centered, placed, canvasWidth, opts.yCeiling)) {
        return {
          type: "bubble",
          role,
          text,
          photoIndex: opts.photoIndex,
          x: centered.x,
          y: centered.y,
          w: centered.w,
          zIndex,
        };
      }
    }
  }

  for (const w of widths) {
    const h = estimateBubbleHeight(text, w, role);
    for (let round = 0; round < (zoneOnly ? 12 : 8); round++) {
      for (const pos of bubbleCandidatePositions(canvasWidth, w, h, opts.near, rng, {
        zone: opts.zone,
        placedPhotos: opts.placedPhotos,
        yCeiling: opts.yCeiling,
        photoIndex: opts.photoIndex,
        cluster: zoneOnly ? undefined : opts.cluster,
      })) {
        const box = clampBubbleBox(pos.x, pos.y, w, h, canvasWidth);
        if (fitsBubble(box, placed, canvasWidth, opts.yCeiling)) {
          return {
            type: "bubble",
            role,
            text,
            photoIndex: opts.photoIndex,
            x: box.x,
            y: box.y,
            w: box.w,
            zIndex,
          };
        }
      }
    }

    if (zoneOnly && opts.placedPhotos && opts.yCeiling !== undefined) {
      const order: DiagonalZone[] = ["top-right", "bottom-left", "center"];
      for (const z of order) {
        for (const pos of diagonalZonePositions(
          canvasWidth,
          z,
          opts.placedPhotos,
          w,
          h,
          rng,
          opts.yCeiling,
        )) {
          const box = clampBubbleBox(pos.x, pos.y, w, h, canvasWidth);
          if (fitsBubble(box, placed, canvasWidth, opts.yCeiling)) {
            return {
              type: "bubble",
              role,
              text,
              photoIndex: opts.photoIndex,
              x: box.x,
              y: box.y,
              w: box.w,
              zIndex,
            };
          }
        }
      }
    }
  }

  if (zoneOnly) return null;

  const w = widths[0];
  const h = estimateBubbleHeight(text, w, role);
  let fallbackY = maxBottom(placed) + BUBBLE_GAP;
  for (let i = 0; i < 12; i++) {
    const box = clampBubbleBox(PADDING, fallbackY, w, h, canvasWidth);
    if (fitsBubble(box, placed, canvasWidth, opts.yCeiling)) {
      return {
        type: "bubble",
        role,
        text,
        photoIndex: opts.photoIndex,
        x: box.x,
        y: box.y,
        w: box.w,
        zIndex,
      };
    }
    fallbackY += h * 0.35 + BUBBLE_GAP;
  }

  return null;
}

function pushBubble(
  bubble: BubbleLayoutNode | null,
  text: string,
  role: BubbleLayoutNode["role"],
  placed: BBox[],
  nodes: LayoutNode[],
): void {
  if (!bubble) return;
  nodes.push(bubble);
  placed.push({
    x: bubble.x,
    y: bubble.y,
    w: bubble.w,
    h: estimateBubbleHeight(text, bubble.w, role),
  });
}

function stickerNodes(
  n: number,
  canvasWidth: number,
  placed: BBox[],
  cluster: BBox | null,
  seed: number,
  yCeiling?: number,
): StickerLayoutNode[] {
  const rng = createRng(seed + 404);
  const stickers: StickerLayoutNode[] = [];
  const count = clamp(1 + Math.floor(n / 4), 1, 3);
  const ids = ["star-pink", "star-white", "tape", "heart", "spark"];
  const band = cluster ?? {
    x: PADDING,
    y: TOP_RESERVE,
    w: canvasWidth - PADDING * 2,
    h: 200,
  };

  for (let i = 0; i < count; i++) {
    const size = rngBetween(rng, 16, 22);
    const box: BBox = { x: 0, y: 0, w: size, h: size };
    for (let t = 0; t < 30; t++) {
      const x = rngBetween(rng, band.x, band.x + band.w - size);
      const yMax =
        yCeiling !== undefined
          ? Math.min(band.y + band.h, yCeiling) - size - 6
          : band.y + band.h - size;
      const y = rngBetween(rng, band.y, Math.max(band.y, yMax));
      box.x = x;
      box.y = y;
      if (!collidesAny(box, placed, 4)) {
        placed.push({ ...box });
        stickers.push({
          type: "sticker",
          id: ids[i % ids.length],
          x,
          y,
          size,
          rotate: rngBetween(rng, -25, 25),
          zIndex: 80 + i,
        });
        break;
      }
    }
  }

  return stickers;
}

export function computeScrapbookLayout(input: ComputeInput): ScrapbookLayout {
  const canvasWidth = input.canvasWidth ?? SCRAPBOOK_CANVAS_WIDTH;
  const n = clamp(input.photoCount, 1, 9);
  const rng = createRng(input.seed);
  const pw = photoLongEdge(n, canvasWidth);
  const ph = pw / PHOTO_ASPECT;

  const nodes: LayoutNode[] = [];
  const placedPhotos: BBox[] = [];
  const placed: BBox[] = [];
  let zBubble = 30;

  const tags = input.copy.hashtags
    .map((t) => (t.startsWith("#") ? t : `#${t}`))
    .join(" ")
    .trim();
  const hasTags = Boolean(tags);

  for (let i = 0; i < n; i++) {
    const photo = tryPlacePhoto(i, n, pw, ph, canvasWidth, placedPhotos, rng);
    const pbox: BBox = { x: photo.x, y: photo.y, w: photo.w, h: photo.h };
    placedPhotos.push(pbox);
    placed.push(pbox);
    nodes.push(photo);
  }

  const yCeiling =
    n === 2 && placedPhotos.length >= 2
      ? twoPhotoYCeiling(placedPhotos, hasTags)
      : undefined;

  const maxDiaryChunks = n === 2 ? 4 : clamp(n + 2, 3, 8);
  const diaryChunks = splitDiaryForBubbles(input.copy.diary, maxDiaryChunks);
  const diaryPerPhoto = distributeDiaryToPhotos(diaryChunks, n);

  if (input.copy.title.trim()) {
    const titleText = input.copy.title.trim();
    pushBubble(
      tryPlaceBubble(titleText, "title", placed, canvasWidth, zBubble++, rng, {
        yCeiling,
        placedPhotos: n === 2 ? placedPhotos : undefined,
      }),
      titleText,
      "title",
      placed,
      nodes,
    );
  }

  for (let i = 0; i < n; i++) {
    const pbox = placedPhotos[i];
    const caption = (input.copy.captions[i] ?? "").trim();
    if (caption) {
      pushBubble(
        tryPlaceBubble(caption, "caption", placed, canvasWidth, zBubble++, rng, {
          near: pbox,
          photoIndex: i,
          zone: zoneBesidePhoto(i, n),
          placedPhotos: n === 2 ? placedPhotos : undefined,
          yCeiling,
        }),
        caption,
        "caption",
        placed,
        nodes,
      );
    }

    for (const text of diaryPerPhoto[i]) {
      pushBubble(
        tryPlaceBubble(text, "diary", placed, canvasWidth, zBubble++, rng, {
          near: pbox,
          photoIndex: i,
          zone: zoneBesidePhoto(i, n),
          placedPhotos: n === 2 ? placedPhotos : undefined,
          yCeiling,
        }),
        text,
        "diary",
        placed,
        nodes,
      );
    }
  }

  const cluster = unionBBox(placedPhotos);

  if (hasTags) {
    if (n === 2 && placedPhotos.length >= 2 && yCeiling !== undefined) {
      const p1 = placedPhotos[1];
      const tw = canvasWidth - PADDING * 2;
      const th = estimateBubbleHeight(tags, tw, "hashtags");
      const ty = Math.min(p1.y + p1.h + 8, yCeiling - th - 4);
      pushBubble(
        {
          type: "bubble",
          role: "hashtags",
          text: tags,
          x: PADDING,
          y: Math.max(p1.y + p1.h + 4, ty),
          w: tw,
          zIndex: zBubble++,
        },
        tags,
        "hashtags",
        placed,
        nodes,
      );
    } else {
      pushBubble(
        tryPlaceBubble(tags, "hashtags", placed, canvasWidth, zBubble++, rng, {
          yCeiling,
        }),
        tags,
        "hashtags",
        placed,
        nodes,
      );
    }
  }

  nodes.push(
    ...stickerNodes(n, canvasWidth, placed, cluster, input.seed, yCeiling),
  );

  const height =
    yCeiling !== undefined
      ? Math.ceil(yCeiling + PADDING + 12)
      : Math.ceil(maxBottom(placed) + PADDING + 40);

  return {
    width: canvasWidth,
    height,
    nodes: nodes.sort((a, b) => {
      const za = "zIndex" in a ? a.zIndex : 0;
      const zb = "zIndex" in b ? b.zIndex : 0;
      return za - zb;
    }),
  };
}
