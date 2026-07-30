"use client";

import { forwardRef, useMemo } from "react";
import type { TemplateRenderProps } from "@/lib/templates/registry";
import { computeRowPack } from "@/lib/templates/layout/row-pack";

export const ImageCollageTemplate = forwardRef<
  HTMLDivElement,
  TemplateRenderProps
>(function ImageCollageTemplate({ copy, photos }, ref) {
  const layout = useMemo(
    () =>
      computeRowPack(
        photos.length,
        copy.captions,
        copy.layoutHints?.map((h) => ({
          importance: h.importance,
          hasFaces: h.hasFaces,
          aspectRatio: h.aspectRatio,
        })),
      ),
    [photos.length, copy.captions, copy.layoutHints],
  );

  return (
    <div
      ref={ref}
      data-dayframe-export-root
      data-export-bg="#f5f0eb"
      className="relative shrink-0 overflow-hidden"
      style={{
        width: layout.canvasWidth,
        height: layout.canvasHeight,
        backgroundColor: "#f5f0eb",
      }}
    >
      {layout.rows.map((row, ri) => (
        <div key={`row-${ri}`}>
          {row.photos.map((photo) => (
            <div
              key={`photo-${photo.index}`}
              className="absolute overflow-hidden rounded-lg bg-zinc-100 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.2)]"
              style={{
                left: photo.x,
                top: photo.y,
                width: photo.w,
                height: photo.h,
                transform: `rotate(${photo.rotate}deg)`,
                zIndex: 10 + photo.index,
              }}
            >
              <img
                src={photos[photo.index]}
                alt={`照片 ${photo.index + 1}`}
                className="h-full w-full object-contain"
                draggable={false}
              />
            </div>
          ))}
          {row.bubbles.map((bubble, bi) => (
            <div
              key={`bubble-${ri}-${bi}`}
              className="absolute rounded-xl border border-zinc-300 bg-white/95 px-2.5 py-1.5 text-[11px] leading-snug text-zinc-800 shadow-[1px_2px_0_rgba(0,0,0,0.08)]"
              style={{
                left: bubble.x,
                top: bubble.y,
                width: bubble.w,
                zIndex: 50 + ri * 10 + bi,
              }}
            >
              <p className="whitespace-pre-wrap break-words">{bubble.text}</p>
              <span
                className="absolute -bottom-1.5 left-4 h-2.5 w-2.5 rotate-45 border-b border-r border-zinc-300 bg-white"
                aria-hidden
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
});
