"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { VerticalDiaryTemplate } from "@/components/templates/vertical-diary-template";
import { exportElementToPng } from "@/lib/export-card";
import { updateCurrentHistoryCopy } from "@/lib/history";
import { loadDayFrameSession, saveDayFrameSession } from "@/lib/session";
import { STYLE_PRESETS } from "@/lib/types";
import type { DayFrameCopy, DayFrameSessionV1 } from "@/lib/types";

function styleLabel(id: DayFrameSessionV1["styleId"]) {
  return STYLE_PRESETS.find((s) => s.id === id)?.label ?? id;
}

export function ResultView() {
  const cardRef = useRef<HTMLDivElement>(null);
  const session = useMemo(() => loadDayFrameSession(), []);
  const [copy, setCopy] = useState<DayFrameCopy | null>(
    () => session?.copy ?? null,
  );
  const [hashtagsText, setHashtagsText] = useState(
    () => session?.copy?.hashtags.join(" ") ?? "",
  );
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !copy) return;
    const next = { ...session, copy };
    saveDayFrameSession(next);
    updateCurrentHistoryCopy(copy);
  }, [session, copy]);

  if (!session || !copy) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          还没有可预览的内容
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
          请先在「上传」页选择照片并生成预览；生成成功后才会进入本页。
        </p>
        <Link
          href="/upload"
          className="mt-8 inline-flex h-11 items-center justify-center rounded-xl bg-zinc-900 px-6 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          去上传
        </Link>
      </div>
    );
  }

  function applyHashtagsFromText(text: string) {
    const tags = text
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);
    setCopy((c) => (c ? { ...c, hashtags: tags } : c));
  }

  async function onExport() {
    if (!cardRef.current) return;
    setExportError(null);
    setExporting(true);
    try {
      await exportElementToPng(
        cardRef.current,
        `DayFrame-${new Date().toISOString().slice(0, 10)}.png`,
      );
    } catch {
      setExportError("导出失败，请重试或更换浏览器。");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            预览
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            排版结果
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            风格：<span className="font-medium">{styleLabel(session.styleId)}</span>
            {" · "}
            模板：竖版长图
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onExport}
            disabled={exporting}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            {exporting ? "导出中…" : "导出 PNG"}
          </button>
          <Link
            href="/upload"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            重新上传
          </Link>
        </div>
      </div>

      {exportError ? (
        <p className="mb-6 text-sm text-red-600 dark:text-red-400" role="alert">
          {exportError}
        </p>
      ) : null}

      <div className="flex flex-col gap-10 lg:flex-row lg:items-start">
        <div className="flex justify-center lg:self-start">
          <div
            className="w-[390px] shrink-0 max-h-[min(72dvh,calc(100dvh-14rem))] overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] lg:max-h-[calc(100dvh-7rem)]"
            aria-label="排版预览，可在区域内上下滑动"
          >
            <VerticalDiaryTemplate
              ref={cardRef}
              copy={copy}
              photos={session.photos}
              styleId={session.styleId}
            />
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
              标题
            </label>
            <input
              value={copy.title}
              onChange={(e) =>
                setCopy((c) => (c ? { ...c, title: e.target.value } : c))
              }
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
              日记正文
            </label>
            <textarea
              value={copy.diary}
              onChange={(e) =>
                setCopy((c) => (c ? { ...c, diary: e.target.value } : c))
              }
              rows={8}
              className="w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm leading-relaxed text-zinc-900 shadow-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
              话题 / 标签（用空格分隔）
            </label>
            <input
              value={hashtagsText}
              onChange={(e) => {
                setHashtagsText(e.target.value);
                applyHashtagsFromText(e.target.value);
              }}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
            />
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
              每张图的说明
            </p>
            <div className="space-y-3">
              {session.photos.map((_, index) => (
                <div key={index} className="space-y-1">
                  <label className="text-xs text-zinc-500">图 {index + 1}</label>
                  <textarea
                    value={copy.captions[index] ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCopy((c) => {
                        if (!c) return c;
                        const caps = [...c.captions];
                        caps[index] = v;
                        return { ...c, captions: caps };
                      });
                    }}
                    rows={2}
                    className="w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm leading-relaxed text-zinc-900 shadow-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
