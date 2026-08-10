"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateAiPoster, listAiPosterTemplates } from "@/lib/api-client";
import { updateCurrentHistoryEntry } from "@/lib/history";
import { saveDayFrameSession } from "@/lib/session";
import { STYLE_PRESETS } from "@/lib/types";
import type {
  AiPosterCandidate,
  AiPosterMetadata,
  AiPosterTemplateId,
  AiPosterTemplateMetadata,
  AiPosterVersion,
  DayFrameSessionV1,
} from "@/lib/types";

const MAX_AI_POSTER_VERSIONS = 8;

function newId(): string {
  return crypto.randomUUID();
}

function formatDuration(durationMs: number | undefined): string {
  if (!durationMs) return "未知";
  const seconds = durationMs / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${Math.round(seconds % 60)} 秒`;
}

function normalizeVersions(
  session: DayFrameSessionV1,
  metadata: AiPosterMetadata,
): AiPosterVersion[] {
  if (metadata.versions?.length) return metadata.versions;
  const candidate: AiPosterCandidate = {
    id: metadata.selectedCandidateId ?? newId(),
    photoUrl: session.photos[0] ?? "",
    aiTemplateId: metadata.aiTemplateId,
    aiTemplateLabel: metadata.aiTemplateLabel,
    templateVersion: metadata.templateVersion,
    styleId: session.styleId,
    additionalPrompt: metadata.additionalPrompt,
    model: metadata.model,
    size: metadata.size,
    seed: metadata.seed,
    seedSupported: metadata.seedSupported,
    requestId: metadata.requestId,
    usage: metadata.usage,
    generationDurationMs: session.generationDurationMs ?? 0,
    generatedAt: session.createdAt,
    sourcePhotos: metadata.sourcePhotos,
    prompt: metadata.additionalPrompt,
  };
  return [{
    id: metadata.activeVersionId ?? newId(),
    createdAt: session.createdAt,
    aiTemplateId: metadata.aiTemplateId,
    aiTemplateLabel: metadata.aiTemplateLabel,
    styleId: session.styleId,
    additionalPrompt: metadata.additionalPrompt,
    candidates: [candidate],
    selectedCandidateId: candidate.id,
  }];
}

function selectedCandidate(
  versions: AiPosterVersion[],
  versionId: string,
  candidateId: string,
): AiPosterCandidate | undefined {
  const version = versions.find((item) => item.id === versionId);
  return (
    version?.candidates.find((item) => item.id === candidateId) ??
    version?.candidates[0]
  );
}

function snapshot(
  versions: AiPosterVersion[],
  activeVersionId: string,
  selectedCandidateId: string,
): string {
  return JSON.stringify({ versions, activeVersionId, selectedCandidateId });
}

async function downloadImage(url: string, filename: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("读取生成图片失败");
  const objectUrl = URL.createObjectURL(await response.blob());
  try {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function AiPosterResultView({
  session,
}: {
  session: DayFrameSessionV1;
}) {
  const router = useRouter();
  const initialMetadata = useMemo<AiPosterMetadata>(
    () => ({
      aiTemplateId: session.aiPoster?.aiTemplateId ?? "citywalk",
      aiTemplateLabel: session.aiPoster?.aiTemplateLabel ?? "Citywalk 拼贴",
      templateVersion: session.aiPoster?.templateVersion ?? "unknown",
      aspectRatio: session.aiPoster?.aspectRatio ?? "9:16",
      model: session.aiPoster?.model ?? "unknown",
      size: session.aiPoster?.size,
      seed: session.aiPoster?.seed,
      seedSupported: session.aiPoster?.seedSupported ?? false,
      requestId: session.aiPoster?.requestId,
      usage: session.aiPoster?.usage,
      sourcePhotos: session.aiPoster?.sourcePhotos ?? [],
      additionalPrompt: session.aiPoster?.additionalPrompt ?? "",
      versions: session.aiPoster?.versions,
      activeVersionId: session.aiPoster?.activeVersionId,
      selectedCandidateId: session.aiPoster?.selectedCandidateId,
      warnings: session.aiPoster?.warnings,
    }),
    [session],
  );
  const initialVersions = useMemo(
    () => normalizeVersions(session, initialMetadata),
    [initialMetadata, session],
  );
  const initialVersionId =
    initialMetadata.activeVersionId ?? initialVersions[0].id;
  const initialCandidateId =
    initialMetadata.selectedCandidateId ??
    initialVersions.find((item) => item.id === initialVersionId)
      ?.selectedCandidateId ??
    initialVersions[0].candidates[0].id;

  const [versions, setVersions] = useState(initialVersions);
  const [activeVersionId, setActiveVersionId] = useState(initialVersionId);
  const [selectedCandidateId, setSelectedCandidateId] =
    useState(initialCandidateId);
  const activeVersion =
    versions.find((item) => item.id === activeVersionId) ?? versions[0];
  const candidate = selectedCandidate(
    versions,
    activeVersionId,
    selectedCandidateId,
  );
  const [selectedTemplateId, setSelectedTemplateId] =
    useState<AiPosterTemplateId>(activeVersion.aiTemplateId);
  const [additionalPrompt, setAdditionalPrompt] = useState(
    activeVersion.additionalPrompt,
  );
  const [templates, setTemplates] = useState<AiPosterTemplateMetadata[]>([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(
    initialMetadata.warnings?.join("；") ?? null,
  );
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(
    null,
  );
  const initialSnapshot = useMemo(
    () => snapshot(initialVersions, initialVersionId, initialCandidateId),
    [initialCandidateId, initialVersionId, initialVersions],
  );
  const [savedSnapshot, setSavedSnapshot] = useState(initialSnapshot);
  const currentSnapshot = useMemo(
    () => snapshot(versions, activeVersionId, selectedCandidateId),
    [activeVersionId, selectedCandidateId, versions],
  );
  const hasUnsavedChanges = currentSnapshot !== savedSnapshot;
  const dirtyRef = useRef(hasUnsavedChanges);

  useEffect(() => {
    let cancelled = false;
    listAiPosterTemplates()
      .then((items) => {
        if (!cancelled) setTemplates(items);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(
            reason instanceof Error ? reason.message : "无法读取 AI 模板。",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setTemplatesLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const saveChanges = useCallback(() => {
    const current = selectedCandidate(
      versions,
      activeVersionId,
      selectedCandidateId,
    );
    if (!current) return;
    const metadata: AiPosterMetadata = {
      aiTemplateId: current.aiTemplateId,
      aiTemplateLabel: current.aiTemplateLabel,
      templateVersion: current.templateVersion,
      aspectRatio: "9:16",
      model: current.model,
      size: current.size,
      seed: current.seed,
      seedSupported: current.seedSupported,
      requestId: current.requestId,
      usage: current.usage,
      sourcePhotos: initialMetadata.sourcePhotos,
      additionalPrompt: current.additionalPrompt,
      versions,
      activeVersionId,
      selectedCandidateId: current.id,
      warnings: warning ? [warning] : [],
    };
    const copy = { ...session.copy, title: current.aiTemplateLabel };
    const next: DayFrameSessionV1 = {
      ...session,
      photos: [current.photoUrl],
      copy,
      generationDurationMs: current.generationDurationMs,
      aiPoster: metadata,
    };
    saveDayFrameSession(next);
    updateCurrentHistoryEntry({
      photos: [current.photoUrl],
      copy,
      generationDurationMs: current.generationDurationMs,
      aiPoster: metadata,
    });
    setSavedSnapshot(snapshot(versions, activeVersionId, current.id));
  }, [
    activeVersionId,
    initialMetadata.sourcePhotos,
    selectedCandidateId,
    session,
    versions,
    warning,
  ]);
  const saveRef = useRef(saveChanges);

  useEffect(() => {
    dirtyRef.current = hasUnsavedChanges;
    saveRef.current = saveChanges;
  }, [hasUnsavedChanges, saveChanges]);

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      event.preventDefault();
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
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingNavigation(`${url.pathname}${url.search}${url.hash}`);
    }
    function onPopState() {
      if (!dirtyRef.current) return;
      if (window.confirm("当前候选选择尚未保存，是否保存后离开？")) {
        saveRef.current();
      }
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

  function chooseVersion(version: AiPosterVersion) {
    setActiveVersionId(version.id);
    setSelectedCandidateId(version.selectedCandidateId);
    setSelectedTemplateId(version.aiTemplateId);
    setAdditionalPrompt(version.additionalPrompt);
  }

  function chooseCandidate(candidateId: string) {
    setSelectedCandidateId(candidateId);
    setVersions((current) =>
      current.map((version) =>
        version.id === activeVersionId
          ? { ...version, selectedCandidateId: candidateId }
          : version,
      ),
    );
  }

  async function regenerate() {
    const filenames = session.uploadedFilenames ?? [];
    if (
      filenames.length === 0 ||
      filenames.length !== initialMetadata.sourcePhotos.length
    ) {
      setError("原始上传文件已不可用，请重新上传照片后再生成。");
      return;
    }
    setError(null);
    setWarning(null);
    setRegenerating(true);
    try {
      const generated = await generateAiPoster(
        session.styleId,
        filenames,
        selectedTemplateId,
        additionalPrompt,
        2,
      );
      const candidates = generated.candidates.map((item) => ({
        ...item,
        sourcePhotos: initialMetadata.sourcePhotos,
        prompt: additionalPrompt,
      }));
      const first = candidates[0];
      const version: AiPosterVersion = {
        id: newId(),
        createdAt: Date.now(),
        aiTemplateId: first.aiTemplateId,
        aiTemplateLabel: first.aiTemplateLabel,
        styleId: session.styleId,
        additionalPrompt,
        candidates,
        selectedCandidateId: first.id,
      };
      setVersions((current) =>
        [...current, version].slice(-MAX_AI_POSTER_VERSIONS),
      );
      setActiveVersionId(version.id);
      setSelectedCandidateId(first.id);
      if (generated.warnings.length) {
        setWarning(generated.warnings.join("；"));
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "重新生成失败，请稍后重试。",
      );
    } finally {
      setRegenerating(false);
    }
  }

  async function download() {
    if (!candidate) return;
    setError(null);
    setDownloading(true);
    try {
      await downloadImage(
        candidate.photoUrl,
        `DayFrame-AI-${new Date().toISOString().slice(0, 10)}.png`,
      );
    } catch {
      setError("下载失败，请重试或检查后端图片是否仍可访问。");
    } finally {
      setDownloading(false);
    }
  }

  function finishNavigation(save: boolean) {
    if (!pendingNavigation) return;
    if (save) saveChanges();
    const destination = pendingNavigation;
    setPendingNavigation(null);
    router.push(destination);
  }

  const styleLabel =
    STYLE_PRESETS.find((item) => item.id === session.styleId)?.label ??
    session.styleId;
  const activeTemplate = templates.find(
    (item) => item.id === selectedTemplateId,
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      {regenerating ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/55 px-6 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-busy="true">
          <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-2xl dark:bg-zinc-950">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
            <p className="mt-4 font-semibold">正在并行生成 2 张候选…</p>
            <p className="mt-2 text-sm text-zinc-500">旧版本会保留，通常需要 2～5 分钟。</p>
          </div>
        </div>
      ) : null}

      <header className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">AI 创意成片</p>
          <h1 className="mt-1 text-2xl font-semibold">候选与版本</h1>
          <p className="mt-2 text-sm text-zinc-500">
            {candidate?.aiTemplateLabel} · {styleLabel} · {candidate?.size ?? "9:16"} ·{" "}
            {formatDuration(candidate?.generationDurationMs)} ·{" "}
            <span className={hasUnsavedChanges ? "text-amber-600" : "text-emerald-600"}>
              {hasUnsavedChanges ? "有未保存修改" : "已保存"}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={saveChanges} disabled={!hasUnsavedChanges} className="h-10 rounded-xl bg-sky-600 px-4 text-sm font-medium text-white disabled:bg-zinc-200 disabled:text-zinc-500">
            {hasUnsavedChanges ? "设为最终版本并保存" : "已保存"}
          </button>
          <button type="button" onClick={download} disabled={downloading || !candidate} className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
            {downloading ? "下载中…" : "下载 PNG"}
          </button>
          <Link href="/upload" className="inline-flex h-10 items-center rounded-xl border border-zinc-200 px-4 text-sm">重新上传</Link>
        </div>
      </header>

      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p> : null}
      {warning ? <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">{warning}</p> : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(320px,560px)_1fr] lg:items-start">
        <section className="space-y-4">
          <div className="flex justify-center rounded-3xl bg-zinc-100 p-3 dark:bg-zinc-900">
            {candidate ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={candidate.photoUrl} alt="当前选择的 AI 手账候选" className="block max-h-[72dvh] w-auto max-w-full rounded-2xl object-contain shadow-xl" />
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {activeVersion.candidates.map((item, index) => (
              <button key={item.id} type="button" onClick={() => chooseCandidate(item.id)} className={`overflow-hidden rounded-xl border p-2 text-left ${candidate?.id === item.id ? "border-sky-500 ring-2 ring-sky-500/20" : "border-zinc-200 dark:border-zinc-700"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.photoUrl} alt={`候选 ${index + 1}`} className="aspect-[9/12] w-full rounded-lg object-cover object-top" />
                <span className="mt-2 block text-xs font-medium">{candidate?.id === item.id ? "当前选择" : `候选 ${index + 1}`}</span>
              </button>
            ))}
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
            <h2 className="font-semibold">版本记录</h2>
            <div className="mt-3 space-y-2">
              {[...versions].reverse().map((version, reverseIndex) => (
                <button key={version.id} type="button" onClick={() => chooseVersion(version)} className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left text-sm ${version.id === activeVersionId ? "border-sky-500 bg-sky-50 dark:bg-sky-950/20" : "border-zinc-200 dark:border-zinc-700"}`}>
                  <span>
                    版本 {versions.length - reverseIndex} · {version.aiTemplateLabel}
                    <small className="ml-2 text-zinc-400">{version.candidates.length} 个候选</small>
                  </span>
                  <time className="text-xs text-zinc-400">{new Date(version.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
            <h2 className="font-semibold">生成新版本</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {(templatesLoaded ? templates : []).map((template) => (
                <button key={template.id} type="button" onClick={() => setSelectedTemplateId(template.id)} className={`overflow-hidden rounded-xl border text-left ${selectedTemplateId === template.id ? "border-zinc-900 ring-2 ring-zinc-900/15 dark:border-white" : "border-zinc-200 dark:border-zinc-700"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={template.previewUrl} alt={`${template.label}模板`} className="aspect-[9/10] w-full object-cover object-top" />
                  <span className="block px-3 py-2 text-xs font-medium">{template.label}</span>
                </button>
              ))}
            </div>
            <textarea value={additionalPrompt} maxLength={200} rows={3} onChange={(event) => setAdditionalPrompt(event.target.value)} placeholder="补充要求，例如：减少文字，多留白" className="mt-4 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950" />
            <div className="mt-1 text-right text-xs text-zinc-400">{additionalPrompt.length}/200</div>
            <button type="button" onClick={regenerate} className="mt-3 h-11 w-full rounded-xl bg-zinc-900 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">并行生成 2 张新候选</button>
            <p className="mt-2 text-xs text-zinc-400">本操作会产生两次 Seedream 调用费用。</p>
          </section>

          <section className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
            <h2 className="font-semibold">原始照片</h2>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {initialMetadata.sourcePhotos.map((source, index) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={`${source.slice(0, 40)}-${index}`} src={source} alt={`原始照片 ${index + 1}`} className="aspect-square rounded-lg object-cover" />
              ))}
            </div>
          </section>

          <section className="rounded-2xl bg-zinc-50 p-5 text-xs text-zinc-500 dark:bg-zinc-900/70">
            <p>{activeTemplate?.disclaimer ?? "AI 成片可能改变画面细节。"}</p>
            <dl className="mt-3 grid grid-cols-[72px_1fr] gap-y-1">
              <dt>模型</dt><dd className="break-all">{candidate?.model}</dd>
              <dt>请求 ID</dt><dd className="break-all">{candidate?.requestId ?? "未返回"}</dd>
              <dt>随机种子</dt><dd>{candidate?.seedSupported ? candidate.seed ?? "未返回" : "官方接口不支持"}</dd>
              <dt>自动质检</dt>
              <dd>
                {candidate?.quality
                  ? `${candidate.quality.width}x${candidate.quality.height} · 熵 ${candidate.quality.entropy} · ${
                      candidate.quality.warnings.length
                        ? candidate.quality.warnings.join("；")
                        : "通过"
                    }`
                  : "旧版本无诊断数据"}
              </dd>
            </dl>
          </section>
        </aside>
      </div>

      {pendingNavigation ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 px-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900">
            <h2 className="font-semibold">保存候选与版本修改吗？</h2>
            <p className="mt-2 text-sm text-zinc-500">保存后会更新最终候选和历史版本。</p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setPendingNavigation(null)} className="rounded-xl border px-4 py-2.5 text-sm">继续编辑</button>
              <button type="button" onClick={() => finishNavigation(false)} className="rounded-xl border px-4 py-2.5 text-sm text-red-600">不保存并离开</button>
              <button type="button" onClick={() => finishNavigation(true)} className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-medium text-white">保存并离开</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
