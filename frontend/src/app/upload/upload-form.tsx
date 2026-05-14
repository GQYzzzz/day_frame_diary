"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getApiBase } from "@/lib/api";
import { buildMockCopy } from "@/lib/mock-copy";
import { saveDayFrameSession } from "@/lib/session";
import {
  DEFAULT_TEMPLATE_ID,
  STYLE_PRESETS,
  type StyleId,
} from "@/lib/types";

function formatUploadError(body: unknown): string {
  if (!body || typeof body !== "object") return "上传失败，请稍后重试。";
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) =>
        typeof d === "object" && d && "msg" in d
          ? String((d as { msg: string }).msg)
          : JSON.stringify(d),
      )
      .join("；");
  }
  return "上传失败，请稍后重试。";
}

export function UploadForm() {
  const router = useRouter();
  const [styleId, setStyleId] = useState<StyleId>("moments");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setBusy(true);
    try {
      const formData = new FormData();
      for (const f of files) {
        formData.append("files", f);
      }
      const res = await fetch(`${getApiBase()}/api/v1/images/upload`, {
        method: "POST",
        body: formData,
      });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(formatUploadError(body));
      }
      const items = (body as { items?: { url: string }[] }).items;
      if (!items?.length) {
        throw new Error("服务器未返回图片地址。");
      }
      const photos = items.map((i) => i.url);
      const copy = buildMockCopy(styleId, photos.length);
      saveDayFrameSession({
        version: 1,
        styleId,
        templateId: DEFAULT_TEMPLATE_ID,
        photos,
        copy,
        createdAt: Date.now(),
      });
      router.push("/result");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "上传失败，请确认后端已启动（见 backend/README）。",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-8">
      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
          照片（1–9 张）
        </label>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="block w-full cursor-pointer text-sm text-zinc-600 file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-800 dark:text-zinc-300 dark:file:bg-zinc-100 dark:file:text-zinc-900 dark:hover:file:bg-zinc-200"
        />
        <p className="text-xs text-zinc-500">
          已选择 {files.length} 张 · 图片会上传到本地 FastAPI；文案仍为 mock，后续接 AI。
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
          onChange={(e) => setStyleId(e.target.value as StyleId)}
          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-500"
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
          竖版长图（MVP 固定一种）。后续可在此切换多模板。
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
          disabled={busy}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-zinc-900 px-6 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {busy ? "处理中…" : "生成预览"}
        </button>
        <Link
          href="/"
          className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-200 px-6 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          返回首页
        </Link>
      </div>
    </form>
  );
}
