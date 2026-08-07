"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChalkboardLayoutEditor } from "@/components/chalkboard-layout-editor";
import { PhotoAnalysisPanel } from "@/components/photo-analysis-panel";
import { generateCopy } from "@/lib/api-client";
import { exportElementToPng } from "@/lib/export-card";
import { updateCurrentHistoryEntry } from "@/lib/history";
import { loadDayFrameSession, saveDayFrameSession } from "@/lib/session";
import { buildFallbackSketch } from "@/lib/sketch/fallback-sketch";
import { normalizeSketches } from "@/lib/sketch/normalize-sketch";
import { computeChalkboardLayout } from "@/lib/templates/chalkboard/compute-chalkboard-layout";
import {
  normalizeTemplateId,
  TEMPLATE_REGISTRY,
  templateLabel,
} from "@/lib/templates/registry";
import { STYLE_PRESETS } from "@/lib/types";
import type {
  DayFrameCopy,
  DayFrameSessionV1,
  PhotoAnalysis,
  PhotoLayoutNode,
  PhotoRenderModeOverrides,
  PhotoSketch,
  TemplateId,
  TemplateLayout,
} from "@/lib/types";

function styleLabel(id: DayFrameSessionV1["styleId"]) {
  return STYLE_PRESETS.find((s) => s.id === id)?.label ?? id;
}

function analysesWithHero(
  analyses: PhotoAnalysis[],
  heroIndex: number,
): PhotoAnalysis[] {
  const supportCount = analyses.length <= 1 ? 0 : analyses.length <= 4 ? 1 : 2;
  const others = analyses
    .filter((item) => item.index !== heroIndex)
    .sort((a, b) => b.importance - a.importance);
  const supportIndexes = new Set(
    others.slice(0, supportCount).map((item) => item.index),
  );
  return analyses.map((item) => ({
    ...item,
    importance: item.index === heroIndex ? 1 : item.importance,
    layoutRole:
      item.index === heroIndex
        ? "hero"
        : supportIndexes.has(item.index)
          ? "support"
          : "detail",
  }));
}

function layoutWithUpdatedNode(
  layout: TemplateLayout,
  photoIndex: number,
  update: (node: PhotoLayoutNode) => PhotoLayoutNode,
): TemplateLayout {
  const nodes = layout.nodes.map((node) =>
    node.nodeType === "photo" && node.photoIndex === photoIndex
      ? update(node)
      : node,
  );
  const bottom = Math.max(...nodes.map((node) => node.y + node.height));
  return {
    ...layout,
    nodes,
    canvasHeight: Math.max(layout.canvasHeight, Math.ceil(bottom + 16)),
  };
}

function initialCopyForSession(
  session: DayFrameSessionV1 | null,
): DayFrameCopy | null {
  if (!session) return null;
  const copy = session.copy;
  if (session.templateId !== "hand-drawn-v1") return copy;
  const count = session.photos.length;
  const hasSketches =
    copy.sketches &&
    copy.sketches.length === count &&
    copy.sketches.some((sketch) => sketch.callouts.length > 0 || sketch.summary);
  if (hasSketches) return copy;
  const sketches =
    copy.sketches && copy.sketches.length > 0
      ? normalizeSketches(copy.sketches, count)
      : session.photos.map((_, index) =>
          buildFallbackSketch(copy.captions[index] ?? "", index),
        );
  return { ...copy, sketches };
}

export function ResultView() {
  const cardRef = useRef<HTMLDivElement>(null);
  const session = useMemo(() => loadDayFrameSession(), []);
  const [copy, setCopy] = useState<DayFrameCopy | null>(
    () => initialCopyForSession(session),
  );
  const [templateId] = useState<TemplateId>(() =>
    normalizeTemplateId(session?.templateId),
  );
  const [layoutSeed, setLayoutSeed] = useState(
    () => session?.layoutSeed ?? session?.createdAt ?? Date.now(),
  );
  const [layoutOverride, setLayoutOverride] = useState<
    TemplateLayout | undefined
  >(() => session?.layout);
  const [renderModeOverrides, setRenderModeOverrides] =
    useState<PhotoRenderModeOverrides>(
      () => session?.renderModeOverrides ?? {},
    );
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(
    null,
  );
  const [hashtagsText, setHashtagsText] = useState(
    () => session?.copy?.hashtags.join(" ") ?? "",
  );
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [regeneratingCopy, setRegeneratingCopy] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);

  const templateEntry = TEMPLATE_REGISTRY[templateId];
  const TemplateComponent = templateEntry.Component;
  const previewWidth = templateEntry.previewWidth;
  const generatedChalkboardLayout = useMemo(() => {
    if (
      !session ||
      !copy ||
      templateId !== "chalkboard-collage-v1"
    ) {
      return undefined;
    }
    return computeChalkboardLayout({
      photoCount: session.photos.length,
      analyses: copy.photoAnalyses,
      cutoutAssets: session.cutoutAssets,
      captions: copy.captions,
      renderModeOverrides,
      seed: layoutSeed,
    });
  }, [session, copy, templateId, renderModeOverrides, layoutSeed]);
  const activeLayout =
    templateId === "chalkboard-collage-v1"
      ? layoutOverride ?? generatedChalkboardLayout
      : undefined;
  const selectedNode = activeLayout?.nodes.find(
    (node): node is PhotoLayoutNode =>
      node.nodeType === "photo" &&
      node.photoIndex === selectedPhotoIndex,
  );
  const regenerateFilenames = useMemo(() => {
    if (!session) return [];
    if (session.uploadedFilenames?.length === session.photos.length) {
      return session.uploadedFilenames;
    }
    const derived = session.photos.map((photo) => {
      const match = /\/api\/uploads\/([^/?#]+)/.exec(photo);
      return match?.[1] ?? "";
    });
    return derived.every(Boolean) ? derived : [];
  }, [session]);

  useEffect(() => {
    if (!session || !copy) return;
    const next: DayFrameSessionV1 = {
      ...session,
      copy,
      templateId,
      photoAnalyses: copy.photoAnalyses,
      layoutSeed,
      renderModeOverrides,
      layout: layoutOverride,
    };
    saveDayFrameSession(next);
    updateCurrentHistoryEntry({
      copy,
      templateId,
      layoutSeed,
      renderModeOverrides,
      layout: layoutOverride,
    });
  }, [
    session,
    copy,
    templateId,
    layoutSeed,
    renderModeOverrides,
    layoutOverride,
  ]);

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

  function onRelayout() {
    const nextSeed = layoutSeed + 1;
    setLayoutSeed(nextSeed);
    setSelectedPhotoIndex(null);
    if (
      templateId === "chalkboard-collage-v1" &&
      session &&
      copy
    ) {
      setLayoutOverride(
        computeChalkboardLayout({
          photoCount: session.photos.length,
          analyses: copy.photoAnalyses,
          cutoutAssets: session.cutoutAssets,
          captions: copy.captions,
          renderModeOverrides,
          seed: nextSeed,
        }),
      );
      return;
    }
    setLayoutOverride(undefined);
  }

  function onResetLayout() {
    setLayoutOverride(undefined);
    setSelectedPhotoIndex(null);
  }

  function onSetHero(photoIndex: number) {
    setCopy((current) => {
      if (!current?.photoAnalyses) return current;
      return {
        ...current,
        photoAnalyses: analysesWithHero(current.photoAnalyses, photoIndex),
      };
    });
    setLayoutOverride(undefined);
    setSelectedPhotoIndex(photoIndex);
  }

  function onSetRenderMode(
    photoIndex: number,
    mode: "frame" | "cutout",
  ) {
    if (!activeLayout) return;
    if (mode === "cutout") {
      const asset = session?.cutoutAssets?.find(
        (item) => item.photoIndex === photoIndex,
      );
      if (asset?.status !== "ready" || !asset.url) return;
    }
    setRenderModeOverrides((current) => ({
      ...current,
      [photoIndex]: mode,
    }));
    setLayoutOverride(undefined);
  }

  function onScaleSelected(factor: number) {
    if (!activeLayout || selectedPhotoIndex === null) return;
    setLayoutOverride(
      layoutWithUpdatedNode(activeLayout, selectedPhotoIndex, (node) => {
        const minFactor = Math.max(80 / node.width, 90 / node.height);
        const maxFactor = Math.min(
          (activeLayout.canvasWidth - 16) / node.width,
          480 / node.height,
        );
        const applied = Math.max(
          minFactor,
          Math.min(maxFactor, factor),
        );
        const width = node.width * applied;
        const height = node.height * applied;
        const centerX = node.x + node.width / 2;
        const centerY = node.y + node.height / 2;
        return {
          ...node,
          x: Math.max(
            4,
            Math.min(
              activeLayout.canvasWidth - width - 4,
              centerX - width / 2,
            ),
          ),
          y: Math.max(0, centerY - height / 2),
          width,
          height,
        };
      }),
    );
  }

  function onRotateSelected(delta: number) {
    if (!activeLayout || selectedPhotoIndex === null) return;
    setLayoutOverride(
      layoutWithUpdatedNode(activeLayout, selectedPhotoIndex, (node) => ({
        ...node,
        rotation: Math.max(-18, Math.min(18, node.rotation + delta)),
      })),
    );
  }

  async function onRegenerateCopy() {
    if (
      !session ||
      !copy ||
      regenerateFilenames.length !== session.photos.length
    ) {
      return;
    }
    setEditorError(null);
    setRegeneratingCopy(true);
    try {
      const generated = await generateCopy(
        session.styleId,
        regenerateFilenames,
        templateId,
        { includeCutouts: false },
      );
      const analyses = copy.photoAnalyses ?? generated.copy.photoAnalyses;
      const layoutHints = copy.layoutHints ?? generated.copy.layoutHints;
      const nextCopy: DayFrameCopy = {
        ...generated.copy,
        photoAnalyses: analyses,
        layoutHints,
      };
      setCopy(nextCopy);
      setHashtagsText(nextCopy.hashtags.join(" "));
    } catch (error) {
      setEditorError(
        error instanceof Error ? error.message : "重新生成文案失败，请稍后重试。",
      );
    } finally {
      setRegeneratingCopy(false);
    }
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
            模板：<span className="font-medium">{templateLabel(templateId)}</span>
            {session.sketchRenderMode === "image" ? (
              <>
                {" · "}
                <span className="text-emerald-600 dark:text-emerald-400">AI 绘制定图</span>
              </>
            ) : session.sketchRenderMode === "overlay" ? (
              <>
                {" · "}
                <span className="text-amber-600 dark:text-amber-400">SVG 叠加</span>
              </>
            ) : null}
            {" · "}
            {session.photos.length} 张图
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
          {templateId === "polka-scrapbook-v1" ||
          templateId === "chalkboard-collage-v1" ? (
            <button
              type="button"
              onClick={onRelayout}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              重新排版
            </button>
          ) : null}
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

      <p className="mb-6 text-xs text-zinc-500">
        模板在上传页已选定。若要换一种版式，请{" "}
        <Link href="/upload" className="font-medium text-zinc-700 underline dark:text-zinc-300">
          重新上传
        </Link>
        并选择其他模板。
      </p>

      <div className="flex flex-col gap-10 lg:flex-row lg:items-start">
        <div className="flex justify-center lg:self-start">
          <div
            className="shrink-0 max-h-[min(72dvh,calc(100dvh-14rem))] overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] lg:max-h-[calc(100dvh-7rem)]"
            style={{ width: previewWidth }}
            aria-label="排版预览，可在区域内上下滑动"
          >
            <TemplateComponent
              ref={cardRef}
              copy={copy}
              photos={session.photos}
              styleId={session.styleId}
              layoutSeed={layoutSeed}
              sketchRenderMode={session.sketchRenderMode}
              cutoutAssets={session.cutoutAssets}
              layout={activeLayout}
              renderModeOverrides={renderModeOverrides}
              editable={templateId === "chalkboard-collage-v1"}
              selectedPhotoIndex={selectedPhotoIndex}
              onSelectPhoto={setSelectedPhotoIndex}
              onLayoutChange={setLayoutOverride}
            />
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-5">
          {templateId === "chalkboard-collage-v1" &&
          copy.photoAnalyses?.length ? (
            <ChalkboardLayoutEditor
              photos={session.photos}
              analyses={copy.photoAnalyses}
              cutoutAssets={session.cutoutAssets}
              selectedPhotoIndex={selectedPhotoIndex}
              selectedNode={selectedNode}
              regenerating={regeneratingCopy}
              canRegenerate={
                regenerateFilenames.length === session.photos.length
              }
              error={editorError}
              onSelect={setSelectedPhotoIndex}
              onSetHero={onSetHero}
              onSetRenderMode={onSetRenderMode}
              onScale={onScaleSelected}
              onRotate={onRotateSelected}
              onResetLayout={onResetLayout}
              onRegenerateCopy={onRegenerateCopy}
            />
          ) : null}

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

          {templateId === "chalkboard-collage-v1" &&
          copy.photoAnalyses?.length ? (
            <PhotoAnalysisPanel
              analyses={copy.photoAnalyses}
              photos={session.photos}
            />
          ) : null}

          {templateId === "hand-drawn-v1" &&
          session.sketchRenderMode === "overlay" ? (
            <div className="space-y-4 rounded-xl border border-zinc-200/80 bg-zinc-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                手绘英文标注（图上白字）
              </p>
              {session.photos.map((_, index) => {
                const sketch = copy.sketches?.[index];
                if (!sketch) return null;
                return (
                  <div key={`sk-${index}`} className="space-y-2 border-t border-zinc-200/60 pt-3 first:border-0 first:pt-0 dark:border-zinc-700">
                    <p className="text-xs font-medium text-zinc-500">图 {index + 1}</p>
                    <label className="text-xs text-zinc-500">总结 summary</label>
                    <input
                      value={sketch.summary}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCopy((c) => {
                          if (!c) return c;
                          const sketches = [...(c.sketches ?? [])];
                          const cur: PhotoSketch = sketches[index] ?? {
                            callouts: [],
                            summary: "",
                            summaryX: 0.78,
                            summaryY: 0.9,
                          };
                          sketches[index] = { ...cur, summary: v };
                          return { ...c, sketches };
                        });
                      }}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    />
                    {sketch.callouts.map((co, ci) => (
                      <div key={ci} className="space-y-1">
                        <label className="text-xs text-zinc-400">
                          {co.subject || `标注 ${ci + 1}`}
                        </label>
                        <input
                          value={co.text}
                          onChange={(e) => {
                            const v = e.target.value;
                            setCopy((c) => {
                              if (!c) return c;
                              const sketches = [...(c.sketches ?? [])];
                              const cur = sketches[index];
                              if (!cur) return c;
                              const callouts = [...cur.callouts];
                              callouts[ci] = { ...callouts[ci], text: v };
                              sketches[index] = { ...cur, callouts };
                              return { ...c, sketches };
                            });
                          }}
                          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                        />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="space-y-3">
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
              每张图的说明{templateId === "hand-drawn-v1" ? "（图下中文）" : ""}
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
