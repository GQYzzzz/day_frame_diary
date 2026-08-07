"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChalkboardLayoutEditor } from "@/components/chalkboard-layout-editor";
import { PhotoAnalysisPanel } from "@/components/photo-analysis-panel";
import { generateCopy } from "@/lib/api-client";
import { exportElementToPng } from "@/lib/export-card";
import { updateCurrentHistoryEntry } from "@/lib/history";
import { loadDayFrameSession, saveDayFrameSession } from "@/lib/session";
import { buildFallbackSketch } from "@/lib/sketch/fallback-sketch";
import { normalizeSketches } from "@/lib/sketch/normalize-sketch";
import { computeChalkboardLayout } from "@/lib/templates/chalkboard/compute-chalkboard-layout";
import { computePolkaLayout } from "@/lib/templates/polka/compute-polka-layout";
import {
  DEFAULT_VERTICAL_BACKGROUND,
  VERTICAL_BACKGROUND_OPTIONS,
} from "@/lib/templates/vertical-backgrounds";
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
  SummaryPlacement,
  TemplateId,
  TemplateLayout,
  VerticalBackground,
} from "@/lib/types";

function styleLabel(id: DayFrameSessionV1["styleId"]) {
  return STYLE_PRESETS.find((s) => s.id === id)?.label ?? id;
}

function formatDuration(durationMs: number | undefined): string | null {
  if (!durationMs || durationMs < 0) return null;
  const seconds = durationMs / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} 秒`;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${minutes} 分 ${remaining} 秒`;
}

function editableSnapshot(value: {
  copy: DayFrameCopy | null;
  layoutSeed: number;
  renderModeOverrides: PhotoRenderModeOverrides;
  layout?: TemplateLayout;
  generationDurationMs?: number;
  summaryPlacement: SummaryPlacement;
  verticalBackground: VerticalBackground;
}): string {
  return JSON.stringify(value);
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

function initialLayoutForSession(
  session: DayFrameSessionV1 | null,
): TemplateLayout | undefined {
  const layout = session?.layout;
  if (!layout || layout.templateId !== session.templateId) return undefined;
  const photoCount = layout.nodes.filter(
    (node) => node.nodeType === "photo",
  ).length;
  return photoCount === session.photos.length ? layout : undefined;
}

export function ResultView() {
  const router = useRouter();
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
  >(() => initialLayoutForSession(session));
  const [renderModeOverrides, setRenderModeOverrides] =
    useState<PhotoRenderModeOverrides>(
      () => session?.renderModeOverrides ?? {},
    );
  const [generationDurationMs, setGenerationDurationMs] = useState<
    number | undefined
  >(() => session?.generationDurationMs);
  const [summaryPlacement, setSummaryPlacement] = useState<SummaryPlacement>(
    () => session?.summaryPlacement ?? "end",
  );
  const [verticalBackground, setVerticalBackground] =
    useState<VerticalBackground>(
      () => session?.verticalBackground ?? DEFAULT_VERTICAL_BACKGROUND,
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
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(
    null,
  );
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    editableSnapshot({
      copy: initialCopyForSession(session),
      layoutSeed: session?.layoutSeed ?? session?.createdAt ?? Date.now(),
      renderModeOverrides: session?.renderModeOverrides ?? {},
      layout: initialLayoutForSession(session),
      generationDurationMs: session?.generationDurationMs,
      summaryPlacement: session?.summaryPlacement ?? "end",
      verticalBackground:
        session?.verticalBackground ?? DEFAULT_VERTICAL_BACKGROUND,
    }),
  );

  const templateEntry = TEMPLATE_REGISTRY[templateId];
  const TemplateComponent = templateEntry.Component;
  const previewWidth = templateEntry.previewWidth;
  const supportsCollageEditing =
    templateId === "chalkboard-collage-v1" ||
    templateId === "polka-scrapbook-v1";
  const generatedCollageLayout = useMemo(() => {
    if (
      !session ||
      !copy ||
      !supportsCollageEditing
    ) {
      return undefined;
    }
    const input = {
      photoCount: session.photos.length,
      analyses: copy.photoAnalyses,
      cutoutAssets: session.cutoutAssets,
      captions: copy.captions,
      renderModeOverrides,
      seed: layoutSeed,
    };
    return templateId === "polka-scrapbook-v1"
      ? computePolkaLayout(input)
      : computeChalkboardLayout(input);
  }, [
    session,
    copy,
    templateId,
    supportsCollageEditing,
    renderModeOverrides,
    layoutSeed,
  ]);
  const activeLayout =
    supportsCollageEditing
      ? layoutOverride ?? generatedCollageLayout
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
  const currentSnapshot = useMemo(
    () =>
      editableSnapshot({
        copy,
        layoutSeed,
        renderModeOverrides,
        layout: layoutOverride,
        generationDurationMs,
        summaryPlacement,
        verticalBackground,
      }),
    [
      copy,
      layoutSeed,
      renderModeOverrides,
      layoutOverride,
      generationDurationMs,
      summaryPlacement,
      verticalBackground,
    ],
  );
  const hasUnsavedChanges = currentSnapshot !== savedSnapshot;
  const dirtyRef = useRef(hasUnsavedChanges);

  const saveChanges = useCallback(() => {
    if (!session || !copy || currentSnapshot === savedSnapshot) return;
    const next: DayFrameSessionV1 = {
      ...session,
      copy,
      templateId,
      photoAnalyses: copy.photoAnalyses,
      layoutSeed,
      renderModeOverrides,
      layout: layoutOverride,
      generationDurationMs,
      summaryPlacement,
      verticalBackground,
    };
    saveDayFrameSession(next);
    updateCurrentHistoryEntry({
      copy,
      templateId,
      layoutSeed,
      renderModeOverrides,
      layout: layoutOverride,
      generationDurationMs,
      summaryPlacement,
      verticalBackground,
    });
    setSavedSnapshot(currentSnapshot);
  }, [
    session,
    copy,
    currentSnapshot,
    savedSnapshot,
    templateId,
    layoutSeed,
    renderModeOverrides,
    layoutOverride,
    generationDurationMs,
    summaryPlacement,
    verticalBackground,
  ]);
  const saveChangesRef = useRef(saveChanges);

  useEffect(() => {
    dirtyRef.current = hasUnsavedChanges;
    saveChangesRef.current = saveChanges;
  }, [hasUnsavedChanges, saveChanges]);

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      event.preventDefault();
    }

    function onPopState() {
      if (!dirtyRef.current) return;
      const shouldSave = window.confirm(
        "当前作品有未保存的修改。点击“确定”保存修改后离开，点击“取消”不保存并离开。",
      );
      if (shouldSave) saveChangesRef.current();
    }

    function onDocumentClick(event: MouseEvent) {
      if (!dirtyRef.current || event.defaultPrevented || event.button !== 0) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const destination = `${url.pathname}${url.search}${url.hash}`;
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (destination === current) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingNavigation(destination);
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("popstate", onPopState);
    document.addEventListener("click", onDocumentClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("click", onDocumentClick, true);
    };
  }, []);

  function finishNavigation(save: boolean) {
    const destination = pendingNavigation;
    if (!destination) return;
    if (save) saveChanges();
    setPendingNavigation(null);
    router.push(destination);
  }

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
    if (supportsCollageEditing && session && copy) {
      const input = {
        photoCount: session.photos.length,
        analyses: copy.photoAnalyses,
        cutoutAssets: session.cutoutAssets,
        captions: copy.captions,
        renderModeOverrides,
        seed: nextSeed,
      };
      setLayoutOverride(
        templateId === "polka-scrapbook-v1"
          ? computePolkaLayout(input)
          : computeChalkboardLayout(input),
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
    const regenerationStartedAt = performance.now();
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
      setGenerationDurationMs(
        Math.round(performance.now() - regenerationStartedAt),
      );
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
            {formatDuration(generationDurationMs) ? (
              <>
                {" · "}
                生成耗时：
                <span className="font-medium">
                  {formatDuration(generationDurationMs)}
                </span>
              </>
            ) : null}
            {" · "}
            <span
              className={
                hasUnsavedChanges
                  ? "font-medium text-amber-600 dark:text-amber-400"
                  : "text-emerald-600 dark:text-emerald-400"
              }
            >
              {hasUnsavedChanges ? "有未保存修改" : "已保存"}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={saveChanges}
            disabled={!hasUnsavedChanges}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-sky-600 px-4 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
          >
            {hasUnsavedChanges ? "保存修改" : "已保存"}
          </button>
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
              editable={supportsCollageEditing}
              selectedPhotoIndex={selectedPhotoIndex}
              onSelectPhoto={setSelectedPhotoIndex}
              onLayoutChange={setLayoutOverride}
              summaryPlacement={summaryPlacement}
              onSummaryPlacementChange={setSummaryPlacement}
              verticalBackground={verticalBackground}
            />
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-5">
          {supportsCollageEditing && copy.photoAnalyses?.length ? (
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
              summaryPlacement={summaryPlacement}
              onSummaryPlacementChange={setSummaryPlacement}
            />
          ) : null}

          {templateId === "vertical-v1" ? (
            <section className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-900/55">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  背景颜色
                </h2>
                <p className="mt-1 text-xs text-zinc-500">
                  选择竖版长图的页面底色，导出图片会保持当前选择。
                </p>
              </div>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                {VERTICAL_BACKGROUND_OPTIONS.map((option) => {
                  const selected = verticalBackground === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setVerticalBackground(option.id)}
                      className={`flex min-w-0 flex-col items-center gap-1.5 rounded-xl border px-1.5 py-2 text-[11px] transition ${
                        selected
                          ? "border-sky-500 bg-sky-50 text-sky-700 ring-2 ring-sky-500/20 dark:bg-sky-950/40 dark:text-sky-300"
                          : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
                      }`}
                      aria-pressed={selected}
                    >
                      <span
                        className="h-7 w-7 rounded-full border border-black/15 shadow-sm"
                        style={{ backgroundColor: option.color }}
                        aria-hidden
                      />
                      <span className="truncate">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
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

          {supportsCollageEditing && copy.photoAnalyses?.length ? (
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

      {pendingNavigation ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="unsaved-dialog-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
            <h2
              id="unsaved-dialog-title"
              className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
            >
              保存本次修改吗？
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              你修改了文字或排版。保存后会更新最后编辑时间，并将作品排到历史记录前面。
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPendingNavigation(null)}
                className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                继续编辑
              </button>
              <button
                type="button"
                onClick={() => finishNavigation(false)}
                className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-zinc-700 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                不保存并离开
              </button>
              <button
                type="button"
                onClick={() => finishNavigation(true)}
                className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-500"
              >
                保存并离开
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
