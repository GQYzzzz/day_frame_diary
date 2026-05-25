import { normalizeTemplateId } from "@/lib/templates/registry";
import { saveDayFrameSession } from "@/lib/session";
import {
  templateNeedsEmbeddedPhotos,
  type DayFrameCopy,
  type DayFrameSessionV1,
  type StyleId,
  type TemplateId,
} from "@/lib/types";

export const HISTORY_STORAGE_KEY = "dayframe:history:v1";
export const HISTORY_CURRENT_ID_KEY = "dayframe:history:current-id";

const MAX_ENTRIES = 30;

export type HistoryEntryV1 = {
  version: 1;
  id: string;
  savedAt: number;
  styleId: StyleId;
  templateId: DayFrameSessionV1["templateId"];
  photos: string[];
  copy: DayFrameCopy;
  createdAt: number;
};

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function readRaw(): HistoryEntryV1[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as HistoryEntryV1[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e) =>
        e?.version === 1 &&
        typeof e.id === "string" &&
        Array.isArray(e.photos) &&
        e.copy &&
        typeof e.copy.title === "string",
    );
  } catch {
    return [];
  }
}

function writeRaw(entries: HistoryEntryV1[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries));
}

async function urlToDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`无法读取图片：${url}`);
  }
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function persistPhotosAsDataUrls(photos: string[]): Promise<string[]> {
  return Promise.all(photos.map((url) => urlToDataUrl(url)));
}

export function listHistoryEntries(): HistoryEntryV1[] {
  return readRaw().sort((a, b) => b.savedAt - a.savedAt);
}

export function getHistoryEntry(id: string): HistoryEntryV1 | null {
  return readRaw().find((e) => e.id === id) ?? null;
}

export function getCurrentHistoryId(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(HISTORY_CURRENT_ID_KEY);
}

export function setCurrentHistoryId(id: string | null): void {
  if (typeof window === "undefined") return;
  if (id) {
    sessionStorage.setItem(HISTORY_CURRENT_ID_KEY, id);
  } else {
    sessionStorage.removeItem(HISTORY_CURRENT_ID_KEY);
  }
}

/** 新建一条历史（波点拼贴会内嵌照片；竖版长图仅保存 URL，写入更快） */
export async function addHistoryFromSession(
  session: DayFrameSessionV1,
): Promise<string> {
  const photos = templateNeedsEmbeddedPhotos(session.templateId)
    ? await persistPhotosAsDataUrls(session.photos)
    : [...session.photos];
  const id = newId();
  const entry: HistoryEntryV1 = {
    version: 1,
    id,
    savedAt: Date.now(),
    styleId: session.styleId,
    templateId: session.templateId,
    photos,
    copy: session.copy,
    createdAt: session.createdAt,
  };

  let entries = readRaw();
  entries.unshift(entry);
  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(0, MAX_ENTRIES);
  }

  try {
    writeRaw(entries);
  } catch {
    entries = entries.slice(0, Math.max(5, Math.floor(entries.length / 2)));
    writeRaw(entries);
  }

  setCurrentHistoryId(id);
  return id;
}

/** 更新当前正在编辑的历史条目（结果页改字 / 换模板时） */
export function updateCurrentHistoryEntry(patch: {
  copy?: DayFrameCopy;
  templateId?: TemplateId;
}): void {
  const id = getCurrentHistoryId();
  if (!id) return;
  const entries = readRaw();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx < 0) return;
  entries[idx] = {
    ...entries[idx],
    ...patch,
    savedAt: Date.now(),
  };
  try {
    writeRaw(entries);
  } catch {
    /* 存储满时静默跳过，避免打断编辑 */
  }
}

/** @deprecated 使用 updateCurrentHistoryEntry */
export function updateCurrentHistoryCopy(copy: DayFrameCopy): void {
  updateCurrentHistoryEntry({ copy });
}

export function deleteHistoryEntry(id: string): void {
  const entries = readRaw().filter((e) => e.id !== id);
  writeRaw(entries);
  if (getCurrentHistoryId() === id) {
    setCurrentHistoryId(null);
  }
}

export function clearAllHistory(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(HISTORY_STORAGE_KEY);
  setCurrentHistoryId(null);
}

export function openHistoryEntry(id: string): boolean {
  const entry = getHistoryEntry(id);
  if (!entry) return false;

  const session: DayFrameSessionV1 = {
    version: 1,
    styleId: entry.styleId,
    templateId: normalizeTemplateId(entry.templateId as string | undefined),
    photos: entry.photos,
    copy: entry.copy,
    createdAt: entry.createdAt,
  };
  saveDayFrameSession(session);
  setCurrentHistoryId(id);
  return true;
}

export function formatHistoryDate(ts: number): string {
  return new Date(ts).toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
