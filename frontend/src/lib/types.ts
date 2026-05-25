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
] as const;

export type TemplateId = (typeof TEMPLATE_PRESETS)[number]["id"];

/** 默认竖版长图：生成后处理更快 */
export const DEFAULT_TEMPLATE_ID: TemplateId = "vertical-v1";

export function templateNeedsEmbeddedPhotos(templateId: TemplateId): boolean {
  return templateId === "polka-scrapbook-v1";
}

/** 与后端 / 产品文档对齐的文案结构（当前由 mock 填充） */
export type DayFrameCopy = {
  title: string;
  diary: string;
  captions: string[];
  hashtags: string[];
};

export type DayFrameSessionV1 = {
  version: 1;
  styleId: StyleId;
  templateId: TemplateId;
  photos: string[];
  copy: DayFrameCopy;
  createdAt: number;
};
