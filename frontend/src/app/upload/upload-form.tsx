"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
  type StyleId,
} from "@/lib/types";

type BusyPhase = "uploading" | "generating" | null;

export function UploadForm() {
  const router = useRouter();
  const [styleId, setStyleId] = useState<StyleId>("moments");
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<BusyPhase>(null);
  const [error, setError] = useState<string | null>(null);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    checkBackendHealth().then((ok) => {
      if (!cancelled) setBackendOk(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
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

    try {
      setPhase("uploading");
      const items = await uploadImages(files);
      const photos = items.map((i) => i.url);
      const filenames = items.map((i) => i.filename);

      setPhase("generating");
      const copy = await generateCopy(styleId, filenames);

      const session = {
        version: 1 as const,
        styleId,
        templateId: DEFAULT_TEMPLATE_ID,
        photos,
        copy,
        createdAt: Date.now(),
      };
      saveDayFrameSession(session);
      try {
        await addHistoryFromSession(session);
      } catch {
        /* 历史保存失败不阻断进入预览 */
      }
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
      {phase ? <ProcessingOverlay phase={phase} /> : null}

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
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="block w-full cursor-pointer text-sm text-zinc-600 file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-800 disabled:opacity-50 dark:text-zinc-300 dark:file:bg-zinc-100 dark:file:text-zinc-900 dark:hover:file:bg-zinc-200"
          />
          <p className="text-xs text-zinc-500">
            已选择 {files.length} 张 · 生成文案约需 2～6 分钟（张数越多越久），请勿关闭页面。
          </p>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="style"
            className="text-sm font-medium text-zinc-800 dark:text-zinc-100"
          >
            风格
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
            模板
          </p>
          <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-300">
            竖版长图（MVP 固定一种）。
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
