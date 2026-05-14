"use client";

import { forwardRef } from "react";
import type { DayFrameCopy, StyleId } from "@/lib/types";

const shell: Record<StyleId, string> = {
  xiaohongshu:
    "bg-gradient-to-b from-rose-50 via-white to-white text-zinc-900",
  travel:
    "bg-gradient-to-b from-sky-50 via-white to-emerald-50/50 text-zinc-900",
  literary:
    "bg-gradient-to-b from-amber-50/90 via-white to-stone-50 text-zinc-900",
  minimal: "bg-white text-zinc-900",
  moments:
    "bg-gradient-to-b from-zinc-50 to-white text-zinc-900",
};

type Props = {
  copy: DayFrameCopy;
  photos: string[];
  styleId: StyleId;
};

export const VerticalDiaryTemplate = forwardRef<HTMLDivElement, Props>(
  function VerticalDiaryTemplate({ copy, photos, styleId }, ref) {
    return (
      <div
        ref={ref}
        data-dayframe-export-root
        className={`w-[390px] shrink-0 overflow-hidden rounded-[28px] border border-zinc-200/90 p-8 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.35)] ${shell[styleId]}`}
      >
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400">
          DayFrame
        </p>
        <h1 className="mt-3 text-[22px] font-semibold leading-snug tracking-tight">
          {copy.title}
        </h1>
        <p className="mt-5 whitespace-pre-wrap text-[14px] leading-relaxed text-zinc-700">
          {copy.diary}
        </p>

        <div className="mt-8 flex flex-col gap-8">
          {photos.map((src, index) => (
            <figure key={`${index}-${src.slice(0, 32)}`} className="space-y-3">
              {/* 导出使用 data URL，需使用原生 img */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={`照片 ${index + 1}`}
                className="aspect-[4/5] w-full rounded-2xl object-cover shadow-inner ring-1 ring-black/5"
                draggable={false}
              />
              <figcaption className="text-[13px] leading-relaxed text-zinc-600">
                <span className="font-medium text-zinc-900">
                  图 {index + 1}
                </span>
                <span className="mx-2 text-zinc-300">·</span>
                {copy.captions[index]}
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap gap-2">
          {copy.hashtags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-black/[0.04] px-3 py-1 text-[12px] text-zinc-600 ring-1 ring-black/[0.06]"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    );
  },
);

VerticalDiaryTemplate.displayName = "VerticalDiaryTemplate";
