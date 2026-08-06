"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  clearAllHistory,
  deleteHistoryEntry,
  formatHistoryDate,
  listHistoryEntries,
  openHistoryEntry,
  type HistoryEntryV1,
} from "@/lib/history";
import { STYLE_PRESETS } from "@/lib/types";

function styleLabel(id: HistoryEntryV1["styleId"]) {
  return STYLE_PRESETS.find((s) => s.id === id)?.label ?? id;
}

export function HistoryView() {
  const router = useRouter();
  const [entries, setEntries] = useState<HistoryEntryV1[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(() => {
    setEntries(listHistoryEntries());
    setLoaded(true);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(refresh, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  function onOpen(id: string) {
    if (openHistoryEntry(id)) {
      router.push("/result");
    }
  }

  function onDelete(id: string) {
    if (!confirm("确定删除这条历史记录？")) return;
    deleteHistoryEntry(id);
    refresh();
  }

  function onClearAll() {
    if (!confirm("确定清空全部历史记录？此操作不可恢复。")) return;
    clearAllHistory();
    refresh();
  }

  if (!loaded) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center text-sm text-zinc-500">
        加载中…
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          历史作品
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
          还没有保存的记录。完成一次「上传 → 生成预览」后会自动出现在这里（保存在本机
          localStorage，最多 30 条）。
        </p>
        <Link
          href="/upload"
          className="mt-8 inline-flex h-11 items-center justify-center rounded-xl bg-zinc-900 px-6 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          新建一条
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            历史作品
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            共 {entries.length} 条 · 保存在本机浏览器，清除站点数据后会丢失
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/upload"
            className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            新建
          </Link>
          <button
            type="button"
            onClick={onClearAll}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            清空全部
          </button>
        </div>
      </div>

      <ul className="mt-8 space-y-4">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="flex gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="h-20 w-16 shrink-0 overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-900">
              {entry.photos[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={entry.photos[0]}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {entry.copy.title || "未命名"}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {styleLabel(entry.styleId)} · {entry.photos.length} 张 ·{" "}
                {formatHistoryDate(entry.savedAt)}
              </p>
              <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                {entry.copy.diary}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onOpen(entry.id)}
                  className="inline-flex h-8 items-center justify-center rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                >
                  打开编辑
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(entry.id)}
                  className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-200 px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                >
                  删除
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
