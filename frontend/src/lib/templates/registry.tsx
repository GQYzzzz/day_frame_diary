"use client";

import type { ComponentType, Ref } from "react";
import { AiPosterTemplate } from "@/components/templates/ai-poster-template";
import { ChalkboardCollageTemplate } from "@/components/templates/chalkboard/chalkboard-collage-template";
import { HandDrawnDiaryTemplate } from "@/components/templates/hand-drawn/hand-drawn-diary-template";
import { ImageCollageTemplate } from "@/components/templates/image-collage-template";
import { PolkaScrapbookTemplate } from "@/components/templates/scrapbook/polka-scrapbook-template";
import { VerticalDiaryTemplate } from "@/components/templates/vertical-diary-template";
import {
  DEFAULT_TEMPLATE_ID,
  type ChalkboardBackground,
  type CutoutAsset,
  type DayFrameCopy,
  type PolkaBackground,
  type PhotoRenderModeOverrides,
  type SketchRenderMode,
  type StyleId,
  type SummaryPlacement,
  type TemplateId,
  type TemplateLayout,
  type VerticalBackground,
} from "@/lib/types";

export type TemplateRenderProps = {
  copy: DayFrameCopy;
  photos: string[];
  styleId: StyleId;
  layoutSeed: number;
  sketchRenderMode?: SketchRenderMode;
  cutoutAssets?: CutoutAsset[];
  layout?: TemplateLayout;
  renderModeOverrides?: PhotoRenderModeOverrides;
  editable?: boolean;
  selectedPhotoIndex?: number | null;
  onSelectPhoto?: (photoIndex: number) => void;
  onLayoutChange?: (layout: TemplateLayout) => void;
  summaryPlacement?: SummaryPlacement;
  onSummaryPlacementChange?: (placement: SummaryPlacement) => void;
  verticalBackground?: VerticalBackground;
  chalkboardBackground?: ChalkboardBackground;
  polkaBackground?: PolkaBackground;
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
    exportBackground: "#c8c6c2",
    Component: PolkaScrapbookTemplate,
  },
  "ai-poster-v1": {
    id: "ai-poster-v1",
    label: "AI 创意成片",
    previewWidth: 390,
    exportBackground: "#111715",
    Component: AiPosterTemplate,
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
  "chalkboard-collage-v1": {
    id: "chalkboard-collage-v1",
    label: "复古手账",
    previewWidth: 390,
    exportBackground: "#111715",
    Component: ChalkboardCollageTemplate,
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
