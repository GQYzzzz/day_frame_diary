import type {
  CutoutAsset,
  PhotoAnalysis,
  PhotoLayoutNode,
  PhotoRenderModeOverrides,
  PhotoSubjectType,
  TemplateLayout,
} from "@/lib/types";

export const CHALKBOARD_CANVAS_WIDTH = 390;

const PADDING = 16;
const NODE_GAP = 12;
const CAPTION_HEIGHT = 38;
const MAX_CUTOUT_OVERLAP = 0.28;
const MAX_FRAME_OVERLAP = 0.015;

type SlotRole = "hero" | "support" | "detail";

type LayoutSlot = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  role: SlotRole;
  targetImportance: number;
  overlapFriendly?: boolean;
  preferredSubjects?: PhotoSubjectType[];
};

type LayoutVariant = {
  id: string;
  slots: LayoutSlot[];
};

type PhotoCandidate = {
  index: number;
  importance: number;
  aspectRatio: number;
  captionLength: number;
  subjectType: PhotoSubjectType;
  role: SlotRole;
  hasFaces: boolean;
  hasCutout: boolean;
};

type Box = { x: number; y: number; width: number; height: number };

function slot(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  role: SlotRole,
  rotation: number,
  targetImportance: number,
  options?: Pick<LayoutSlot, "overlapFriendly" | "preferredSubjects">,
): LayoutSlot {
  return {
    id,
    x,
    y,
    width,
    height,
    role,
    rotation,
    targetImportance,
    ...options,
  };
}

function onePhotoVariants(): [LayoutVariant, LayoutVariant] {
  return [
    {
      id: "solo-center",
      slots: [
        slot("hero", 38, 8, 314, 330, "hero", -1, 0.95, {
          preferredSubjects: ["portrait", "group", "landscape", "object"],
        }),
      ],
    },
    {
      id: "solo-editorial",
      slots: [
        slot("hero", 24, 18, 300, 352, "hero", -3, 0.95, {
          overlapFriendly: true,
          preferredSubjects: ["portrait", "object", "food"],
        }),
      ],
    },
  ];
}

function twoPhotoVariants(): [LayoutVariant, LayoutVariant] {
  return [
    {
      id: "duo-diagonal",
      slots: [
        slot("hero", 18, 4, 238, 262, "hero", -2, 0.9, {
          preferredSubjects: ["landscape", "group", "portrait"],
        }),
        slot("support", 162, 230, 210, 232, "support", 3, 0.65, {
          overlapFriendly: true,
          preferredSubjects: ["portrait", "object", "food"],
        }),
      ],
    },
    {
      id: "duo-counterpoint",
      slots: [
        slot("hero", 132, 2, 240, 264, "hero", 2, 0.9, {
          preferredSubjects: ["portrait", "object", "landscape"],
        }),
        slot("support", 18, 232, 212, 230, "support", -3, 0.65, {
          overlapFriendly: true,
          preferredSubjects: ["portrait", "food", "object"],
        }),
      ],
    },
  ];
}

function threePhotoVariants(): [LayoutVariant, LayoutVariant] {
  return [
    {
      id: "trio-hero-top",
      slots: [
        slot("hero", 22, 0, 346, 270, "hero", -1, 0.92, {
          preferredSubjects: ["landscape", "group", "food"],
        }),
        slot("support", 18, 282, 170, 210, "support", -3, 0.67, {
          preferredSubjects: ["portrait", "object"],
        }),
        slot("detail", 202, 286, 170, 210, "detail", 3, 0.48, {
          preferredSubjects: ["portrait", "food", "object"],
        }),
      ],
    },
    {
      id: "trio-hero-side",
      slots: [
        slot("hero", 14, 8, 230, 344, "hero", -2, 0.92, {
          preferredSubjects: ["portrait", "group", "object"],
        }),
        slot("support", 238, 28, 140, 176, "support", 3, 0.67, {
          overlapFriendly: true,
          preferredSubjects: ["portrait", "object", "food"],
        }),
        slot("detail", 222, 218, 154, 188, "detail", -2, 0.48, {
          overlapFriendly: true,
          preferredSubjects: ["landscape", "food", "object"],
        }),
      ],
    },
  ];
}

function mediumPhotoVariants(count: number): [LayoutVariant, LayoutVariant] {
  const mosaic = [
    slot("hero", 18, 0, 236, 282, "hero", -2, 0.92, {
      preferredSubjects: ["portrait", "group", "landscape"],
    }),
    slot("support-a", 238, 28, 140, 180, "support", 3, 0.72, {
      overlapFriendly: true,
      preferredSubjects: ["portrait", "object", "food"],
    }),
    slot("support-b", 210, 220, 164, 194, "support", -2, 0.64, {
      overlapFriendly: true,
      preferredSubjects: ["landscape", "food", "object"],
    }),
    slot("detail-a", 18, 302, 178, 204, "detail", 2, 0.48, {
      preferredSubjects: ["portrait", "object", "food"],
    }),
    slot("detail-b", 202, 430, 170, 196, "detail", -3, 0.42, {
      preferredSubjects: ["landscape", "food", "object"],
    }),
    slot("detail-c", 18, 530, 176, 198, "detail", 2, 0.38, {
      preferredSubjects: ["portrait", "object", "other"],
    }),
  ];
  const zigzag = [
    slot("hero", 112, 0, 262, 270, "hero", 2, 0.92, {
      preferredSubjects: ["landscape", "group", "food"],
    }),
    slot("support-a", 18, 180, 176, 214, "support", -3, 0.72, {
      overlapFriendly: true,
      preferredSubjects: ["portrait", "object"],
    }),
    slot("support-b", 198, 286, 174, 206, "support", 2, 0.64, {
      preferredSubjects: ["portrait", "food", "object"],
    }),
    slot("detail-a", 20, 410, 182, 204, "detail", -2, 0.48, {
      preferredSubjects: ["landscape", "food", "object"],
    }),
    slot("detail-b", 190, 526, 182, 204, "detail", 3, 0.42, {
      preferredSubjects: ["portrait", "object", "food"],
    }),
    slot("detail-c", 18, 648, 174, 198, "detail", -2, 0.38, {
      preferredSubjects: ["portrait", "object", "other"],
    }),
  ];
  return [
    { id: "mosaic-staggered", slots: mosaic.slice(0, count) },
    { id: "story-zigzag", slots: zigzag.slice(0, count) },
  ];
}

function largePhotoVariants(count: number): [LayoutVariant, LayoutVariant] {
  const dense = [
    slot("hero", 16, 0, 240, 252, "hero", -2, 0.94, {
      preferredSubjects: ["group", "landscape", "portrait"],
    }),
    slot("support-a", 246, 18, 128, 172, "support", 3, 0.72, {
      overlapFriendly: true,
      preferredSubjects: ["portrait", "object"],
    }),
    slot("support-b", 224, 198, 150, 184, "support", -2, 0.66, {
      overlapFriendly: true,
      preferredSubjects: ["food", "object", "landscape"],
    }),
    slot("detail-a", 16, 270, 170, 190, "detail", 2, 0.52),
    slot("detail-b", 198, 398, 176, 190, "detail", -3, 0.48),
    slot("detail-c", 18, 486, 166, 186, "detail", 2, 0.44),
    slot("detail-d", 196, 604, 178, 190, "detail", -2, 0.4),
    slot("detail-e", 18, 694, 166, 186, "detail", 3, 0.36),
    slot("detail-f", 198, 812, 176, 190, "detail", -2, 0.34),
  ];
  const timeline = [
    slot("hero", 96, 0, 278, 262, "hero", 2, 0.94, {
      preferredSubjects: ["landscape", "group", "food"],
    }),
    slot("support-a", 18, 214, 162, 194, "support", -3, 0.72, {
      overlapFriendly: true,
      preferredSubjects: ["portrait", "object"],
    }),
    slot("support-b", 198, 282, 174, 194, "support", 2, 0.66, {
      preferredSubjects: ["portrait", "food", "object"],
    }),
    slot("detail-a", 20, 420, 180, 194, "detail", -2, 0.52),
    slot("detail-b", 192, 536, 180, 194, "detail", 3, 0.48),
    slot("detail-c", 18, 652, 166, 188, "detail", -2, 0.44),
    slot("detail-d", 204, 764, 168, 188, "detail", 2, 0.4),
    slot("detail-e", 18, 876, 176, 188, "detail", -3, 0.36),
    slot("detail-f", 196, 988, 176, 188, "detail", 2, 0.34),
  ];
  return [
    { id: "dense-collage", slots: dense.slice(0, count) },
    { id: "timeline-flow", slots: timeline.slice(0, count) },
  ];
}

export function chalkboardVariantsForCount(
  count: number,
): [LayoutVariant, LayoutVariant] {
  if (count <= 1) return onePhotoVariants();
  if (count === 2) return twoPhotoVariants();
  if (count === 3) return threePhotoVariants();
  if (count <= 6) return mediumPhotoVariants(count);
  return largePhotoVariants(count);
}

function fallbackAnalysis(index: number, count: number): PhotoAnalysis {
  return {
    index,
    importance: index === 0 ? 0.9 : Math.max(0.3, 0.7 - index * 0.05),
    subjectType: "other",
    hasFaces: false,
    aspectRatio: 1,
    orientation: "square",
    subjectSummary: "",
    focalX: 0.5,
    focalY: 0.5,
    recommendedRender: "frame",
    layoutRole:
      index === 0 ? "hero" : index < Math.min(3, count) ? "support" : "detail",
  };
}

function candidateAspect(
  analysis: PhotoAnalysis,
  cutout: CutoutAsset | undefined,
): number {
  if (
    cutout?.status === "ready" &&
    cutout.subjectBounds &&
    analysis.width &&
    analysis.height
  ) {
    const width = cutout.subjectBounds.width * analysis.width;
    const height = cutout.subjectBounds.height * analysis.height;
    if (width > 0 && height > 0) return width / height;
  }
  return Math.max(0.2, Math.min(5, analysis.aspectRatio || 1));
}

function photoCandidates(
  count: number,
  analyses: PhotoAnalysis[] | undefined,
  cutoutAssets: CutoutAsset[] | undefined,
  captions: string[] | undefined,
  renderModeOverrides: PhotoRenderModeOverrides | undefined,
): PhotoCandidate[] {
  const analysisByIndex = new Map(
    analyses?.map((analysis) => [analysis.index, analysis]),
  );
  const cutoutByIndex = new Map(
    cutoutAssets?.map((asset) => [asset.photoIndex, asset]),
  );
  return Array.from({ length: count }, (_, index) => {
    const analysis = analysisByIndex.get(index) ?? fallbackAnalysis(index, count);
    const cutout = cutoutByIndex.get(index);
    const hasReadyCutout =
      cutout?.status === "ready" && Boolean(cutout.url);
    return {
      index,
      importance: analysis.importance,
      aspectRatio: candidateAspect(analysis, cutout),
      captionLength: Array.from(captions?.[index]?.trim() ?? "").length,
      subjectType: analysis.subjectType,
      role: analysis.layoutRole,
      hasFaces: analysis.hasFaces,
      hasCutout:
        hasReadyCutout && renderModeOverrides?.[index] !== "frame",
    };
  });
}

function assignmentCost(photo: PhotoCandidate, slotItem: LayoutSlot): number {
  const rolePenalty =
    photo.role === slotItem.role
      ? 0
      : photo.role === "hero" || slotItem.role === "hero"
        ? 7
        : 1.4;
  const imageHeight = Math.max(1, slotItem.height - CAPTION_HEIGHT);
  const slotAspect = slotItem.width / imageHeight;
  const aspectPenalty =
    Math.abs(Math.log(photo.aspectRatio / slotAspect)) *
    (photo.hasCutout ? 0.35 : 1.2);
  const importancePenalty =
    Math.abs(photo.importance - slotItem.targetImportance) * 2.5;
  const subjectPenalty = slotItem.preferredSubjects?.includes(photo.subjectType)
    ? -0.35
    : 0.12;
  const overlapPenalty =
    slotItem.overlapFriendly && !photo.hasCutout ? 0.55 : 0;
  const cutoutBonus =
    slotItem.overlapFriendly && photo.hasCutout ? -0.5 : 0;
  const captionCapacity =
    Math.max(6, Math.floor(Math.max(60, slotItem.width - 20) / 11)) * 2 - 3;
  const captionPenalty =
    Math.max(0, photo.captionLength - captionCapacity) * 0.18;
  return (
    rolePenalty +
    aspectPenalty +
    importancePenalty +
    subjectPenalty +
    overlapPenalty +
    cutoutBonus +
    captionPenalty
  );
}

function assignPhotos(
  photos: PhotoCandidate[],
  slots: LayoutSlot[],
): PhotoCandidate[] {
  const memo = new Map<string, { cost: number; assignment: PhotoCandidate[] }>();

  function solve(
    slotIndex: number,
    usedMask: number,
  ): { cost: number; assignment: PhotoCandidate[] } {
    if (slotIndex === slots.length) return { cost: 0, assignment: [] };
    const key = `${slotIndex}:${usedMask}`;
    const cached = memo.get(key);
    if (cached) return cached;

    let best = { cost: Number.POSITIVE_INFINITY, assignment: [] as PhotoCandidate[] };
    for (let photoIndex = 0; photoIndex < photos.length; photoIndex++) {
      if ((usedMask & (1 << photoIndex)) !== 0) continue;
      const tail = solve(slotIndex + 1, usedMask | (1 << photoIndex));
      const cost = assignmentCost(photos[photoIndex], slots[slotIndex]) + tail.cost;
      if (cost < best.cost) {
        best = {
          cost,
          assignment: [photos[photoIndex], ...tail.assignment],
        };
      }
    }
    memo.set(key, best);
    return best;
  }

  return solve(0, 0).assignment;
}

function asBox(node: PhotoLayoutNode): Box {
  return {
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  };
}

function boxArea(box: Box): number {
  return box.width * box.height;
}

function overlapRatio(a: Box, b: Box): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= left || bottom <= top) return 0;
  return ((right - left) * (bottom - top)) / Math.min(boxArea(a), boxArea(b));
}

function allowedOverlap(a: PhotoLayoutNode, b: PhotoLayoutNode): number {
  return a.renderMode === "cutout" || b.renderMode === "cutout"
    ? MAX_CUTOUT_OVERLAP
    : MAX_FRAME_OVERLAP;
}

function clampNodeX(node: PhotoLayoutNode): PhotoLayoutNode {
  return {
    ...node,
    x: Math.max(
      PADDING,
      Math.min(node.x, CHALKBOARD_CANVAS_WIDTH - PADDING - node.width),
    ),
    y: Math.max(0, node.y),
  };
}

function resolveCollisions(nodes: PhotoLayoutNode[]): PhotoLayoutNode[] {
  const placed: PhotoLayoutNode[] = [];
  for (const original of nodes) {
    let node = clampNodeX(original);
    for (let attempt = 0; attempt < 64; attempt++) {
      const conflicts = placed.filter(
        (other) =>
          overlapRatio(asBox(node), asBox(other)) >
          allowedOverlap(node, other),
      );
      if (conflicts.length === 0) break;
      node = {
        ...node,
        y:
          Math.max(...conflicts.map((item) => item.y + item.height)) +
          NODE_GAP,
      };
    }
    const unresolved = placed.some(
      (other) =>
        overlapRatio(asBox(node), asBox(other)) >
        allowedOverlap(node, other),
    );
    if (unresolved) {
      node = {
        ...node,
        y:
          Math.max(0, ...placed.map((item) => item.y + item.height)) +
          NODE_GAP,
      };
    }
    placed.push(node);
  }
  return placed;
}

function variantIndex(seed: number): 0 | 1 {
  return Math.abs(Math.trunc(seed)) % 2 === 0 ? 0 : 1;
}

function buildVariantLayout(
  variant: LayoutVariant,
  photos: PhotoCandidate[],
): { nodes: PhotoLayoutNode[]; canvasHeight: number; textOverflow: number } {
  const assigned = assignPhotos(photos, variant.slots);
  const rawNodes = variant.slots.map((slotItem, index): PhotoLayoutNode => {
    const photo = assigned[index];
    return {
      id: `${variant.id}-${slotItem.id}`,
      nodeType: "photo",
      photoIndex: photo.index,
      renderMode: photo.hasCutout ? "cutout" : "frame",
      x: slotItem.x,
      y: slotItem.y,
      width: slotItem.width,
      height: slotItem.height,
      rotation: photo.hasFaces ? 0 : slotItem.rotation,
      zIndex: photo.hasCutout ? 40 + index : 10 + index,
    };
  });
  const nodes = resolveCollisions(rawNodes);
  const photoByIndex = new Map(photos.map((photo) => [photo.index, photo]));
  const textOverflow = nodes.reduce((total, node) => {
    const photo = photoByIndex.get(node.photoIndex);
    if (!photo) return total;
    const capacity =
      Math.max(6, Math.floor(Math.max(60, node.width - 20) / 11)) * 2 - 3;
    return total + Math.max(0, photo.captionLength - capacity);
  }, 0);
  return {
    nodes,
    canvasHeight:
      Math.max(...nodes.map((node) => node.y + node.height)) + PADDING,
    textOverflow,
  };
}

export function computeChalkboardLayout(input: {
  photoCount: number;
  analyses?: PhotoAnalysis[];
  cutoutAssets?: CutoutAsset[];
  captions?: string[];
  renderModeOverrides?: PhotoRenderModeOverrides;
  seed: number;
}): TemplateLayout {
  const count = Math.max(1, Math.min(9, Math.trunc(input.photoCount)));
  const variants = chalkboardVariantsForCount(count);
  const preferredIndex = variantIndex(input.seed);
  const photos = photoCandidates(
    count,
    input.analyses,
    input.cutoutAssets,
    input.captions,
    input.renderModeOverrides,
  );
  const preferred = buildVariantLayout(variants[preferredIndex], photos);
  const alternateIndex = preferredIndex === 0 ? 1 : 0;
  const alternate = buildVariantLayout(variants[alternateIndex], photos);
  const useAlternate = alternate.textOverflow < preferred.textOverflow;
  const selected = useAlternate ? alternate : preferred;
  const selectedVariant = variants[useAlternate ? alternateIndex : preferredIndex];

  return {
    version: 1,
    templateId: "chalkboard-collage-v1",
    variantId: selectedVariant.id,
    canvasWidth: CHALKBOARD_CANVAS_WIDTH,
    canvasHeight: Math.ceil(selected.canvasHeight),
    nodes: selected.nodes,
  };
}

export function validateChalkboardLayout(layout: TemplateLayout): string[] {
  const photoNodes = layout.nodes.filter(
    (node): node is PhotoLayoutNode => node.nodeType === "photo",
  );
  const errors: string[] = [];
  for (const node of photoNodes) {
    if (
      node.x < PADDING ||
      node.x + node.width > layout.canvasWidth - PADDING + 0.5
    ) {
      errors.push(`${node.id}: horizontal overflow`);
    }
    if (node.y < 0 || node.y + node.height > layout.canvasHeight + 0.5) {
      errors.push(`${node.id}: vertical overflow`);
    }
  }
  for (let i = 0; i < photoNodes.length; i++) {
    for (let j = i + 1; j < photoNodes.length; j++) {
      const ratio = overlapRatio(asBox(photoNodes[i]), asBox(photoNodes[j]));
      if (ratio > allowedOverlap(photoNodes[i], photoNodes[j]) + 1e-6) {
        errors.push(
          `${photoNodes[i].id}/${photoNodes[j].id}: overlap ${ratio.toFixed(3)}`,
        );
      }
    }
  }
  return errors;
}
