export const STYLE_PRESETS = [
  { id: "xiaohongshu", label: "小红书" },
  { id: "travel", label: "旅行日记" },
  { id: "literary", label: "文艺" },
  { id: "minimal", label: "简洁" },
  { id: "moments", label: "朋友圈" },
] as const;

export type StyleId = (typeof STYLE_PRESETS)[number]["id"];

export const TEMPLATE_PRESETS = [
  { id: "vertical-v1", label: "竖版长图" },
  { id: "polka-scrapbook-v1", label: "波点拼贴" },
  { id: "hand-drawn-v1", label: "手绘标注" },
  { id: "image-collage-v1", label: "图片拼接" },
  { id: "chalkboard-collage-v1", label: "黑板手账" },
] as const;

export type TemplateId = (typeof TEMPLATE_PRESETS)[number]["id"];

/** 默认竖版长图：生成后处理更快 */
export const DEFAULT_TEMPLATE_ID: TemplateId = "vertical-v1";

export function templateNeedsEmbeddedPhotos(templateId: TemplateId): boolean {
  return (
    templateId === "polka-scrapbook-v1" ||
    templateId === "hand-drawn-v1" ||
    templateId === "chalkboard-collage-v1"
  );
}

export type PhotoSubjectType =
  | "portrait"
  | "group"
  | "food"
  | "landscape"
  | "object"
  | "other";

export type PhotoRenderMode = "frame" | "cutout" | "hero";
export type EditablePhotoRenderMode = "frame" | "cutout";
export type PhotoRenderModeOverrides = Record<number, EditablePhotoRenderMode>;
export type SummaryPlacement = "start" | "end";
export type PhotoOrientation = "portrait" | "landscape" | "square";
export type PhotoLayoutRole = "hero" | "support" | "detail";

export type LayoutHint = {
  importance: number;
  subjectType: PhotoSubjectType;
  hasFaces: boolean;
  aspectRatio: number;
};

export type PhotoAnalysis = LayoutHint & {
  index: number;
  width?: number;
  height?: number;
  orientation: PhotoOrientation;
  capturedAt?: string;
  subjectSummary: string;
  cutoutGroup: string[];
  includeHumanParts: boolean;
  focalX: number;
  focalY: number;
  recommendedRender: PhotoRenderMode;
  layoutRole: PhotoLayoutRole;
};

export type NormalizedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CutoutAsset = {
  photoIndex: number;
  status: "pending" | "ready" | "failed" | "skipped";
  url?: string;
  maskUrl?: string;
  subjectBounds?: NormalizedRect;
  error?: string;
};

type LayoutNodeBase = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
};

export type PhotoLayoutNode = LayoutNodeBase & {
  nodeType: "photo";
  photoIndex: number;
  renderMode: PhotoRenderMode;
};

export type TextLayoutNode = LayoutNodeBase & {
  nodeType: "text";
  textRole: "title" | "diary" | "caption" | "footer";
  photoIndex?: number;
};

export type DecorationLayoutNode = LayoutNodeBase & {
  nodeType: "decoration";
  decorationId: string;
};

export type LayoutNode =
  | PhotoLayoutNode
  | TextLayoutNode
  | DecorationLayoutNode;

export type TemplateLayout = {
  version: 1;
  templateId: TemplateId;
  variantId: string;
  canvasWidth: number;
  canvasHeight: number;
  nodes: LayoutNode[];
};

export type SketchDecoration = "heart" | "sparkle" | "steam" | "smile" | "star";

export type SketchOutlinePoint = { x: number; y: number };

export type SketchCallout = {
  subject: string;
  text: string;
  targetX: number;
  targetY: number;
  targetW: number;
  targetH: number;
  labelX: number;
  labelY: number;
  /** 沿物体外缘顺时针的一圈点（0–1），用于轮廓描边，非椭圆 */
  outline?: SketchOutlinePoint[];
  decoration?: SketchDecoration;
};

export type PhotoSketch = {
  callouts: SketchCallout[];
  summary: string;
  summaryX: number;
  summaryY: number;
};

/** 与后端 / 产品文档对齐的文案结构 */
export type DayFrameCopy = {
  title: string;
  diary: string;
  captions: string[];
  hashtags: string[];
  /** 手绘模板：每张图的英文标注与坐标 */
  sketches?: PhotoSketch[];
  layoutHints?: LayoutHint[];
  photoAnalyses?: PhotoAnalysis[];
};

/** 手绘：image=OpenAI 直接出标注图；overlay=前端 SVG 回退 */
export type SketchRenderMode = "image" | "overlay";

export type DayFrameSessionV1 = {
  version: 1;
  styleId: StyleId;
  templateId: TemplateId;
  photos: string[];
  uploadedFilenames?: string[];
  copy: DayFrameCopy;
  createdAt: number;
  /** 手绘 image 模式下的原图 URL（未标注） */
  originalPhotos?: string[];
  sketchRenderMode?: SketchRenderMode;
  photoAnalyses?: PhotoAnalysis[];
  cutoutAssets?: CutoutAsset[];
  layoutSeed?: number;
  renderModeOverrides?: PhotoRenderModeOverrides;
  layout?: TemplateLayout;
  generationDurationMs?: number;
  summaryPlacement?: SummaryPlacement;
};
