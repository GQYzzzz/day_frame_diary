"use client";

import { Caveat } from "next/font/google";
import { forwardRef, useMemo } from "react";
import { SketchOverlay } from "@/components/templates/hand-drawn/sketch-overlay";
import {
  buildFallbackSketch,
  sketchNeedsFallback,
} from "@/lib/sketch/fallback-sketch";
import type { DayFrameCopy, PhotoSketch, SketchRenderMode } from "@/lib/types";

const sketchFont = Caveat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sketch",
});

type Props = {
  copy: DayFrameCopy;
  photos: string[];
  layoutSeed: number;
  sketchRenderMode?: SketchRenderMode;
};

export const HandDrawnDiaryTemplate = forwardRef<HTMLDivElement, Props>(
  function HandDrawnDiaryTemplate(
    { copy, photos, layoutSeed, sketchRenderMode },
    ref,
  ) {
    const useSvgOverlay = sketchRenderMode !== "image";

    const sketches: PhotoSketch[] = useMemo(() => {
      if (!useSvgOverlay) return [];
      const fromApi = copy.sketches;
      return photos.map((_, i) => {
        const sk = fromApi?.[i];
        if (!sketchNeedsFallback(sk)) {
          return sk!;
        }
        return buildFallbackSketch(copy.captions[i] ?? "", i);
      });
    }, [copy.sketches, copy.captions, photos, useSvgOverlay]);

    return (
      <div
        ref={ref}
        data-dayframe-export-root
        data-export-bg="#0f0f0f"
        className={`${sketchFont.variable} w-[390px] shrink-0 overflow-hidden rounded-[28px] bg-[#0f0f0f] shadow-[0_20px_60px_-30px_rgba(0,0,0,0.5)]`}
      >
        <div className="border-b border-white/10 px-6 py-5">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/40">
            DayFrame · Sketch
            {sketchRenderMode === "image" ? " · AI 绘制定图" : useSvgOverlay ? " · 叠加模式" : ""}
          </p>
          <h1 className="mt-2 text-[20px] font-semibold leading-snug text-white/95">
            {copy.title}
          </h1>
        </div>

        <div className="flex flex-col gap-1">
          {photos.map((src, index) => (
            <figure key={`${index}-${src.slice(0, 24)}`} className="relative">
              <div className="relative w-full bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`照片 ${index + 1}`}
                  className="block h-auto w-full object-contain"
                  draggable={false}
                />
                {useSvgOverlay ? (
                  <SketchOverlay
                    sketch={sketches[index]}
                    seed={layoutSeed + index * 997}
                  />
                ) : null}
              </div>
              {copy.captions[index] ? (
                <figcaption className="bg-[#141414] px-5 py-3 text-[13px] leading-relaxed text-white/75">
                  {copy.captions[index]}
                </figcaption>
              ) : null}
            </figure>
          ))}
        </div>

        <div className="space-y-3 border-t border-white/10 px-6 py-5">
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-white/80">
            {copy.diary}
          </p>
          <div className="flex flex-wrap gap-2">
            {copy.hashtags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-white/10 px-3 py-1 text-[11px] text-white/70"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  },
);

HandDrawnDiaryTemplate.displayName = "HandDrawnDiaryTemplate";
