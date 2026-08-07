"use client";

import { forwardRef } from "react";
import { verticalBackgroundOption } from "@/lib/templates/vertical-backgrounds";
import type {
  DayFrameCopy,
  StyleId,
  VerticalBackground,
} from "@/lib/types";

type Props = {
  copy: DayFrameCopy;
  photos: string[];
  styleId: StyleId;
  layoutSeed?: number;
  verticalBackground?: VerticalBackground;
};

export const VerticalDiaryTemplate = forwardRef<HTMLDivElement, Props>(
  function VerticalDiaryTemplate(
    { copy, photos, verticalBackground },
    ref,
  ) {
    const background = verticalBackgroundOption(verticalBackground);
    const dark = background.dark;
    return (
      <div
        ref={ref}
        data-dayframe-export-root
        data-export-bg={background.color}
        className={`w-[390px] shrink-0 overflow-hidden rounded-[28px] border p-8 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.35)] ${
          dark
            ? "border-white/15 text-zinc-50"
            : "border-black/10 text-zinc-900"
        }`}
        style={{ backgroundColor: background.color }}
      >
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">
          DayFrame
        </p>
        <h1 className="mt-3 text-[22px] font-semibold leading-snug tracking-tight">
          {copy.title}
        </h1>
        <p
          className={`mt-5 whitespace-pre-wrap text-[14px] leading-relaxed ${
            dark ? "text-zinc-300" : "text-zinc-700"
          }`}
        >
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
                className={`h-auto w-full rounded-2xl object-contain shadow-inner ring-1 ${
                  dark
                    ? "bg-white/5 ring-white/10"
                    : "bg-white/25 ring-black/5"
                }`}
                draggable={false}
              />
              <figcaption
                className={`text-[13px] leading-relaxed ${
                  dark ? "text-zinc-400" : "text-zinc-600"
                }`}
              >
                <span
                  className={`font-medium ${
                    dark ? "text-zinc-100" : "text-zinc-900"
                  }`}
                >
                  图 {index + 1}
                </span>
                <span
                  className={`mx-2 ${
                    dark ? "text-zinc-600" : "text-zinc-400"
                  }`}
                >
                  ·
                </span>
                {copy.captions[index]}
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap gap-2">
          {copy.hashtags.map((tag) => (
            <span
              key={tag}
              className={`rounded-full px-3 py-1 text-[12px] ring-1 ${
                dark
                  ? "bg-white/[0.07] text-zinc-300 ring-white/10"
                  : "bg-black/[0.04] text-zinc-600 ring-black/[0.06]"
              }`}
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
