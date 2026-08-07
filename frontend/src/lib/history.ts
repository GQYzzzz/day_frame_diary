import { normalizeTemplateId } from "@/lib/templates/registry";
import { saveDayFrameSession } from "@/lib/session";
import {
  templateNeedsEmbeddedPhotos,
  type DayFrameCopy,
  type DayFrameSessionV1,
  type CutoutAsset,
  type PhotoRenderModeOverrides,
  type SummaryPlacement,
  type StyleId,
  type TemplateLayout,
  type TemplateId,
  type VerticalBackground,
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
  uploadedFilenames?: string[];
  copy: DayFrameCopy;
  createdAt: number;
  cutoutAssets?: CutoutAsset[];
  layoutSeed?: number;
  renderModeOverrides?: PhotoRenderModeOverrides;
  layout?: TemplateLayout;
  generationDurationMs?: number;
  summaryPlacement?: SummaryPlacement;
  verticalBackground?: VerticalBackground;
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

function writeWithEviction(entries: HistoryEntryV1[]): HistoryEntryV1[] {
  let next = entries.slice(0, MAX_ENTRIES);
  while (next.length > 0) {
    try {
      writeRaw(next);
      return next;
    } catch {
      next = next.slice(0, -1);
    }
  }
  return [];
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

async function persistCutoutAssets(
  assets: CutoutAsset[] | undefined,
): Promise<CutoutAsset[] | undefined> {
  if (!assets) return undefined;
  return Promise.all(
    assets.map(async (asset) => ({
      ...asset,
      url: asset.url ? await urlToDataUrl(asset.url) : undefined,
      maskUrl: undefined,
    })),
  );
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

/** 新建一条历史；手账模板会内嵌照片与抠图，保证后续可恢复编辑。 */
export async function addHistoryFromSession(
  session: DayFrameSessionV1,
): Promise<string> {
  const id = newId();
  const entry: HistoryEntryV1 = {
    version: 1,
    id,
    savedAt: Date.now(),
    styleId: session.styleId,
    templateId: session.templateId,
    photos: [...session.photos],
    uploadedFilenames: session.uploadedFilenames,
    copy: session.copy,
    createdAt: session.createdAt,
    cutoutAssets: session.cutoutAssets,
    layoutSeed: session.layoutSeed,
    renderModeOverrides: session.renderModeOverrides,
    layout: session.layout,
    generationDurationMs: session.generationDurationMs,
    summaryPlacement: session.summaryPlacement,
    verticalBackground: session.verticalBackground,
  };

  writeWithEviction([entry, ...readRaw()]);
  setCurrentHistoryId(id);

  if (templateNeedsEmbeddedPhotos(session.templateId)) {
    try {
      const photos = await persistPhotosAsDataUrls(session.photos);
      const cutoutAssets =
        session.templateId === "chalkboard-collage-v1" ||
        session.templateId === "polka-scrapbook-v1"
          ? await persistCutoutAssets(session.cutoutAssets)
          : session.cutoutAssets;
      const entries = readRaw();
      const index = entries.findIndex((item) => item.id === id);
      if (index >= 0) {
        const enriched = {
          ...entries[index],
          photos,
          cutoutAssets,
        };
        const withoutCurrent = entries.filter((item) => item.id !== id);
        const written = writeWithEviction([enriched, ...withoutCurrent]);
        if (!written.some((item) => item.id === id)) {
          writeWithEviction([entry, ...withoutCurrent]);
        }
      }
    } catch {
      // 后端 URL 仍可用于恢复；内嵌失败不应丢失整条历史。
    }
  }

  return id;
}

/** 更新当前正在编辑的历史条目（结果页改字 / 换模板时） */
export function updateCurrentHistoryEntry(patch: {
  copy?: DayFrameCopy;
  templateId?: TemplateId;
  layoutSeed?: number;
  renderModeOverrides?: PhotoRenderModeOverrides;
  layout?: TemplateLayout;
  generationDurationMs?: number;
  summaryPlacement?: SummaryPlacement;
  verticalBackground?: VerticalBackground;
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
    writeWithEviction(entries);
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
    uploadedFilenames: entry.uploadedFilenames,
    copy: entry.copy,
    createdAt: entry.createdAt,
    cutoutAssets: entry.cutoutAssets,
    layoutSeed: entry.layoutSeed,
    renderModeOverrides: entry.renderModeOverrides,
    layout: entry.layout,
    generationDurationMs: entry.generationDurationMs,
    summaryPlacement: entry.summaryPlacement,
    verticalBackground: entry.verticalBackground,
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
