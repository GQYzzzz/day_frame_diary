export type BBox = { x: number; y: number; w: number; h: number };

export type PhotoLayoutNode = {
  type: "photo";
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
  rotate: number;
  zIndex: number;
};

export type BubbleRole = "title" | "diary" | "caption" | "hashtags";

export type BubbleLayoutNode = {
  type: "bubble";
  role: BubbleRole;
  text: string;
  photoIndex?: number;
  x: number;
  y: number;
  w: number;
  zIndex: number;
};

export type StickerLayoutNode = {
  type: "sticker";
  id: string;
  x: number;
  y: number;
  size: number;
  rotate: number;
  zIndex: number;
};

export type LayoutNode = PhotoLayoutNode | BubbleLayoutNode | StickerLayoutNode;

export type ScrapbookLayout = {
  width: number;
  height: number;
  nodes: LayoutNode[];
};
