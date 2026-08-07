import { computeChalkboardLayout } from "@/lib/templates/chalkboard/compute-chalkboard-layout";
import type {
  CutoutAsset,
  PhotoAnalysis,
  PhotoRenderModeOverrides,
  TemplateLayout,
} from "@/lib/types";

export const POLKA_CANVAS_WIDTH = 390;

/**
 * 波点拼贴与黑板手账共享成熟的语义分配和碰撞处理，但保留独立模板契约。
 * 视觉层可据 variantId 选择波点、气泡和贴纸组合，不会污染黑板布局。
 */
export function computePolkaLayout(input: {
  photoCount: number;
  analyses?: PhotoAnalysis[];
  cutoutAssets?: CutoutAsset[];
  captions?: string[];
  renderModeOverrides?: PhotoRenderModeOverrides;
  seed: number;
}): TemplateLayout {
  const base = computeChalkboardLayout(input);
  return {
    ...base,
    templateId: "polka-scrapbook-v1",
    variantId: `polka-${base.variantId}`,
  };
}
