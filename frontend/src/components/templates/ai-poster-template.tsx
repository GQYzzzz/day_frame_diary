"use client";

import { forwardRef } from "react";
import type { TemplateRenderProps } from "@/lib/templates/registry";

export const AiPosterTemplate = forwardRef<
  HTMLDivElement,
  TemplateRenderProps
>(function AiPosterTemplate({ photos }, ref) {
  const generatedPhoto = photos[0];

  return (
    <div
      ref={ref}
      className="w-full overflow-hidden bg-zinc-950"
      style={{ aspectRatio: "9 / 16" }}
    >
      {generatedPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={generatedPhoto}
          alt="AI 创意成片"
          className="block h-full w-full object-contain"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-white/70">
          暂无 AI 成片
        </div>
      )}
    </div>
  );
});
