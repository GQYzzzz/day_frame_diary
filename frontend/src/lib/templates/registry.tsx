"use client";

import type { ComponentType, Ref } from "react";
import { HandDrawnDiaryTemplate } from "@/components/templates/hand-drawn/hand-drawn-diary-template";
import { ImageCollageTemplate } from "@/components/templates/image-collage-template";
import { PolkaScrapbookTemplate } from "@/components/templates/scrapbook/polka-scrapbook-template";
import { VerticalDiaryTemplate } from "@/components/templates/vertical-diary-template";
import {
  DEFAULT_TEMPLATE_ID,
  type DayFrameCopy,
  type SketchRenderMode,
  type StyleId,
  type TemplateId,
} from "@/lib/types";

export type TemplateRenderProps = {
  copy: DayFrameCopy;
  photos: string[];
  styleId: StyleId;
  layoutSeed: number;
  sketchRenderMode?: SketchRenderMode;
};

type TemplateEntry = {
  id: TemplateId;
  label: string;
  previewWidth: number;
  exportBackground: string;
  Component: ComponentType<TemplateRenderProps & { ref?: Ref<HTMLDivElement> }>;
};

export const TEMPLATE_REGISTRY: Record<TemplateId, TemplateEntry> = {
  "vertical-v1": {
    id: "vertical-v1",
    label: "竖版长图",
    previewWidth: 390,
    exportBackground: "#ffffff",
    Component: VerticalDiaryTemplate,
  },
  "polka-scrapbook-v1": {
    id: "polka-scrapbook-v1",
    label: "波点拼贴",
    previewWidth: 390,
    exportBackground: "#d4d0cb",
    Component: PolkaScrapbookTemplate,
  },
  "hand-drawn-v1": {
    id: "hand-drawn-v1",
    label: "手绘标注",
    previewWidth: 390,
    exportBackground: "#0f0f0f",
    Component: HandDrawnDiaryTemplate,
  },
  "image-collage-v1": {
    id: "image-collage-v1",
    label: "图片拼接",
    previewWidth: 390,
    exportBackground: "#ffffff",
    Component: ImageCollageTemplate,
  },
};

export function templateLabel(id: TemplateId): string {
  return TEMPLATE_REGISTRY[id]?.label ?? id;
}

export function normalizeTemplateId(id: string | undefined): TemplateId {
  if (id && id in TEMPLATE_REGISTRY) {
    return id as TemplateId;
  }
  return DEFAULT_TEMPLATE_ID;
}
