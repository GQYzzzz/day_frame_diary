"use client";

import { forwardRef, useMemo } from "react";
import { ScrapbookSticker } from "@/components/templates/scrapbook/sticker";
import { SpeechBubble } from "@/components/templates/scrapbook/speech-bubble";
import {
  computeScrapbookLayout,
  SCRAPBOOK_CANVAS_WIDTH,
} from "@/lib/templates/layout/compute-scrapbook-layout";
import type { LayoutNode } from "@/lib/templates/layout-types";
import type { DayFrameCopy } from "@/lib/types";

type Props = {
  copy: DayFrameCopy;
  photos: string[];
  layoutSeed: number;
};

function renderNode(node: LayoutNode, photos: string[]) {
  if (node.type === "photo") {
    const src = photos[node.index];
    if (!src) return null;
    return (
      <div
        key={`photo-${node.index}`}
        className="absolute"
        style={{
          left: node.x,
          top: node.y,
          width: node.w,
          zIndex: node.zIndex,
          transform: `rotate(${node.rotate}deg)`,
        }}
      >
        <div
          className="overflow-hidden rounded-lg border-[3px] border-white bg-white shadow-[0_8px_24px_-6px_rgba(0,0,0,0.35)] ring-1 ring-black/10"
          style={{ width: node.w, height: node.h }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={`照片 ${node.index + 1}`}
            className="h-full w-full object-cover"
            draggable={false}
          />
        </div>
      </div>
    );
  }

  if (node.type === "bubble") {
    return (
      <div
        key={`bubble-${node.role}-${node.x}-${node.y}-${node.text.slice(0, 8)}`}
        className="absolute"
        style={{
          left: node.x,
          top: node.y,
          zIndex: node.zIndex,
        }}
      >
        <SpeechBubble role={node.role} text={node.text} width={node.w} />
      </div>
    );
  }

  return (
    <div
      key={`sticker-${node.id}-${node.x}`}
      className="pointer-events-none absolute"
      style={{ left: node.x, top: node.y, zIndex: node.zIndex }}
    >
      <ScrapbookSticker id={node.id} size={node.size} rotate={node.rotate} />
    </div>
  );
}

export const PolkaScrapbookTemplate = forwardRef<HTMLDivElement, Props>(
  function PolkaScrapbookTemplate({ copy, photos, layoutSeed }, ref) {
    const layout = useMemo(
      () =>
        computeScrapbookLayout({
          photoCount: photos.length,
          copy,
          seed: layoutSeed,
          canvasWidth: SCRAPBOOK_CANVAS_WIDTH,
        }),
      [photos.length, copy, layoutSeed],
    );

    return (
      <div
        ref={ref}
        data-dayframe-export-root
        data-export-bg="#d4d0cb"
        className="relative shrink-0 overflow-hidden shadow-[0_20px_60px_-30px_rgba(0,0,0,0.35)]"
        style={{
          width: layout.width,
          height: layout.height,
          backgroundColor: "#d4d0cb",
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.92) 2px, transparent 2px)",
          backgroundSize: "14px 14px",
        }}
      >
        <div
          className="pointer-events-none absolute right-6 top-16 opacity-20"
          aria-hidden
        >
          <span className="text-6xl text-white">♡</span>
        </div>

        {layout.nodes.map((node) => renderNode(node, photos))}
      </div>
    );
  },
);

PolkaScrapbookTemplate.displayName = "PolkaScrapbookTemplate";
