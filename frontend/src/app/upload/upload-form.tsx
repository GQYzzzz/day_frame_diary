"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ProcessingOverlay } from "@/components/processing-overlay";
import {
  checkBackendHealth,
  generateCopy,
  uploadImages,
} from "@/lib/api-client";
import { addHistoryFromSession } from "@/lib/history";
import { saveDayFrameSession } from "@/lib/session";
import {
  DEFAULT_TEMPLATE_ID,
  STYLE_PRESETS,
  TEMPLATE_PRESETS,
  type StyleId,
  type TemplateId,
} from "@/lib/types";

type BusyPhase = "uploading" | "generating" | "annotating" | null;

export function UploadForm() {
  const router = useRouter();
  const [styleId, setStyleId] = useState<StyleId>("moments");
  const [templateId, setTemplateId] = useState<TemplateId>(DEFAULT_TEMPLATE_ID);
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<BusyPhase>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const filePreviews = useMemo(
    () =>
      files.map((file) => ({
        file,
        url: URL.createObjectURL(file),
      })),
    [files],
  );

  useEffect(() => {
    let cancelled = false;
    checkBackendHealth().then((ok) => {
      if (!cancelled) setBackendOk(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      filePreviews.forEach((item) => URL.revokeObjectURL(item.url));
    },
    [filePreviews],
  );

  function onFilesSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (selected.length === 0) return;
    if (files.length + selected.length > 9) {
      setFileError(
        `最多只能选择 9 张照片。当前已有 ${files.length} 张，本次选择了 ${selected.length} 张。`,
      );
      return;
    }
    setFiles((current) => [...current, ...selected]);
    setFileError(null);
    setError(null);
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setFileError(null);
  }

  async function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (files.length < 1) {
      setError("请至少选择 1 张照片。");
      return;
    }
    if (files.length > 9) {
      setError("最多选择 9 张照片。");
      return;
    }

    const generationStartedAt = performance.now();
    try {
      setPhase("uploading");
      const items = await uploadImages(files);
      const photos = items.map((i) => i.url);
      const filenames = items.map((i) => i.filename);

      setPhase("generating");
      const {
        copy,
        annotatedPhotos,
        sketchRenderMode,
        cutoutAssets,
      } = await generateCopy(styleId, filenames, templateId);

      const displayPhotos = annotatedPhotos ?? photos;
      const session = {
        version: 1 as const,
        styleId,
        templateId,
        photos: displayPhotos,
        uploadedFilenames: filenames,
        originalPhotos: annotatedPhotos ? photos : undefined,
        sketchRenderMode:
          templateId === "hand-drawn-v1" ? sketchRenderMode : undefined,
        copy,
        photoAnalyses: copy.photoAnalyses,
        cutoutAssets,
        createdAt: Date.now(),
        generationDurationMs: Math.round(
          performance.now() - generationStartedAt,
        ),
        summaryPlacement: "end" as const,
        verticalBackground: "white" as const,
        chalkboardBackground: "default" as const,
        polkaBackground: "default" as const,
      };
      saveDayFrameSession(session);
      // 历史需把每张图转成 data URL 再写 localStorage，可能耗时数分钟；
      // 勿阻塞「生成」遮罩，否则会让人以为模型还在跑。
      void addHistoryFromSession(session).catch(() => {});
      router.push("/result");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "处理失败，请确认后端已启动（见 backend/README）。",
      );
    } finally {
      setPhase(null);
    }
  }

  const busy = phase !== null;

  return (
    <>
      {phase ? (
        <ProcessingOverlay phase={phase} templateId={templateId} />
      ) : null}

      <form onSubmit={onSubmit} className="mt-8 space-y-8">
        {backendOk === false ? (
          <p
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
            role="status"
          >
            未检测到后端服务。请先在 <code className="text-xs">backend/</code>{" "}
            启动 FastAPI（<code className="text-xs">uvicorn app.main:app --reload</code>
            ），并确认 <code className="text-xs">NEXT_PUBLIC_API_BASE</code> 指向
            http://127.0.0.1:8000。
          </p>
        ) : null}

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
            照片（1–9 张）
          </label>
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={busy}
            onChange={onFilesSelected}
            className="block w-full cursor-pointer text-sm text-zinc-600 file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-800 disabled:opacity-50 dark:text-zinc-300 dark:file:bg-zinc-100 dark:file:text-zinc-900 dark:hover:file:bg-zinc-200"
          />
          <p className="text-xs text-zinc-500">
            已选择 {files.length}/9 张 · 可以多次打开选择框继续添加
          </p>
          {fileError ? (
            <p className="text-xs text-red-600 dark:text-red-400" role="alert">
              {fileError}
            </p>
          ) : null}
          {filePreviews.length > 0 ? (
            <div className="grid grid-cols-3 gap-3 pt-2 sm:grid-cols-5">
              {filePreviews.map(({ file, url }, index) => (
                <figure
                  key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                  className="group relative overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`已选择照片 ${index + 1}`}
                    className="aspect-square w-full object-cover"
                  />
                  <figcaption className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/60 px-2 py-1 text-[10px] text-white">
                    <span>图 {index + 1}</span>
                    <span className="truncate opacity-75">{file.name}</span>
                  </figcaption>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => removeFile(index)}
                    className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-sm leading-none text-white shadow hover:bg-red-600 disabled:opacity-50"
                    aria-label={`删除照片 ${index + 1}`}
                    title="删除这张照片"
                  >
                    ×
                  </button>
                </figure>
              ))}
            </div>
          ) : null}
          <p className="text-xs text-zinc-500">
            生成文案约需 2～6 分钟（张数越多越久），请勿关闭页面。
          </p>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="style"
            className="text-sm font-medium text-zinc-800 dark:text-zinc-100"
          >
            文字风格
          </label>
          <select
            id="style"
            value={styleId}
            disabled={busy}
            onChange={(e) => setStyleId(e.target.value as StyleId)}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-sm outline-none focus:border-zinc-400 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-500"
          >
            {STYLE_PRESETS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
            排版模板
          </p>
          <div className="flex flex-wrap gap-2">
            {TEMPLATE_PRESETS.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={busy}
                onClick={() => setTemplateId(t.id)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                  templateId === t.id
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-zinc-500">
            {templateId === "vertical-v1"
              ? "竖版长图：标题 + 正文 + 照片纵向排列，生成与保存较快，适合日常长图。"
              : templateId === "polka-scrapbook-v1"
                ? "波点拼贴：自动选择主图与抠图，使用暖灰波点纸、错落相框、手写气泡和韩系涂鸦装饰。"
                : templateId === "hand-drawn-v1"
                  ? "手绘标注：一次 gpt-4o-mini 看图并返回 JSON（英文标注+轮廓坐标），前端绘制白线边框；通常 1～2 分钟。可选开启图像编辑见 backend/.env。"
                  : templateId === "image-collage-v1"
                    ? "图片拼接：双列交错排列，每张照片配一个说明气泡；按内容重要度自动调整画布。"
                    : "复古手账：自动选择主图与抠图，使用自适应拼贴、手写字、纸胶带和多种复古纸张背景。"}
          </p>
        </div>

        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="submit"
            disabled={busy || backendOk === false}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-zinc-900 px-6 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            {phase === "uploading"
              ? "上传中…"
              : phase === "generating"
                ? "生成中…"
                : "生成预览"}
          </button>
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-200 px-6 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            返回首页
          </Link>
        </div>
      </form>
    </>
  );
}
