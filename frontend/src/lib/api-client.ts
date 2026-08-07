import { getApiBase } from "@/lib/api";
import { normalizeSketches } from "@/lib/sketch/normalize-sketch";
import type {
  CutoutAsset,
  DayFrameCopy,
  LayoutHint,
  PhotoAnalysis,
  PhotoLayoutRole,
  PhotoOrientation,
  PhotoRenderMode,
  PhotoSubjectType,
  SketchRenderMode,
  StyleId,
  TemplateId,
} from "@/lib/types";

export type GenerateResult = {
  copy: DayFrameCopy;
  annotatedPhotos?: string[];
  sketchRenderMode?: SketchRenderMode;
  cutoutAssets?: CutoutAsset[];
};

const UPLOAD_TIMEOUT_MS = 60_000;
const PHOTO_SUBJECT_TYPES = new Set<PhotoSubjectType>([
  "portrait",
  "group",
  "food",
  "landscape",
  "object",
  "other",
]);
const PHOTO_RENDER_MODES = new Set<PhotoRenderMode>([
  "frame",
  "cutout",
  "hero",
]);
const PHOTO_ORIENTATIONS = new Set<PhotoOrientation>([
  "portrait",
  "landscape",
  "square",
]);
const PHOTO_LAYOUT_ROLES = new Set<PhotoLayoutRole>([
  "hero",
  "support",
  "detail",
]);
const CUTOUT_STATUSES = new Set<CutoutAsset["status"]>([
  "pending",
  "ready",
  "failed",
  "skipped",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeSubjectType(value: unknown): PhotoSubjectType {
  return typeof value === "string" &&
    PHOTO_SUBJECT_TYPES.has(value as PhotoSubjectType)
    ? (value as PhotoSubjectType)
    : "other";
}

function normalizeRenderMode(value: unknown): PhotoRenderMode {
  return typeof value === "string" &&
    PHOTO_RENDER_MODES.has(value as PhotoRenderMode)
    ? (value as PhotoRenderMode)
    : "frame";
}

function normalizeOrientation(value: unknown): PhotoOrientation {
  return typeof value === "string" &&
    PHOTO_ORIENTATIONS.has(value as PhotoOrientation)
    ? (value as PhotoOrientation)
    : "square";
}

function normalizeLayoutRole(value: unknown): PhotoLayoutRole {
  return typeof value === "string" &&
    PHOTO_LAYOUT_ROLES.has(value as PhotoLayoutRole)
    ? (value as PhotoLayoutRole)
    : "detail";
}

function normalizeLayoutHint(value: unknown): LayoutHint | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const aspectRatio = finiteNumber(
    raw.aspectRatio ?? raw.aspect_ratio,
    1,
  );
  return {
    importance: clamp01(finiteNumber(raw.importance, 0.5)),
    subjectType: normalizeSubjectType(
      raw.subjectType ?? raw.subject_type,
    ),
    hasFaces:
      typeof (raw.hasFaces ?? raw.has_faces) === "boolean"
        ? Boolean(raw.hasFaces ?? raw.has_faces)
        : false,
    aspectRatio: aspectRatio > 0 ? aspectRatio : 1,
  };
}

function normalizePhotoAnalysis(
  value: unknown,
  fallbackIndex: number,
): PhotoAnalysis | null {
  const raw = asRecord(value);
  const hint = normalizeLayoutHint(value);
  if (!raw || !hint) return null;

  const width = finiteNumber(raw.width, 0);
  const height = finiteNumber(raw.height, 0);
  const capturedAt = raw.capturedAt ?? raw.captured_at;
  const subjectSummary = raw.subjectSummary ?? raw.subject_summary;
  const cutoutGroup = raw.cutoutGroup ?? raw.cutout_group;
  return {
    ...hint,
    index: Math.max(0, Math.trunc(finiteNumber(raw.index, fallbackIndex))),
    width: width > 0 ? Math.trunc(width) : undefined,
    height: height > 0 ? Math.trunc(height) : undefined,
    orientation: normalizeOrientation(raw.orientation),
    capturedAt:
      typeof capturedAt === "string" && capturedAt ? capturedAt : undefined,
    subjectSummary:
      typeof subjectSummary === "string" ? subjectSummary.slice(0, 120) : "",
    cutoutGroup: Array.isArray(cutoutGroup)
      ? cutoutGroup
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.slice(0, 40))
          .slice(0, 6)
      : [],
    includeHumanParts:
      typeof (raw.includeHumanParts ?? raw.include_human_parts) === "boolean"
        ? Boolean(raw.includeHumanParts ?? raw.include_human_parts)
        : hint.hasFaces || hint.subjectType === "portrait" ||
          hint.subjectType === "group",
    focalX: clamp01(finiteNumber(raw.focalX ?? raw.focal_x, 0.5)),
    focalY: clamp01(finiteNumber(raw.focalY ?? raw.focal_y, 0.5)),
    recommendedRender: normalizeRenderMode(
      raw.recommendedRender ?? raw.recommended_render,
    ),
    layoutRole: normalizeLayoutRole(raw.layoutRole ?? raw.layout_role),
  };
}

function normalizeCutoutAsset(
  value: unknown,
  fallbackIndex: number,
): CutoutAsset | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const photoIndex = finiteNumber(
    raw.photoIndex ?? raw.photo_index,
    fallbackIndex,
  );
  const rawStatus = raw.status;
  const status =
    typeof rawStatus === "string" &&
    CUTOUT_STATUSES.has(rawStatus as CutoutAsset["status"])
      ? (rawStatus as CutoutAsset["status"])
      : "failed";
  const rawBounds = asRecord(raw.subjectBounds ?? raw.subject_bounds);
  const subjectBounds = rawBounds
    ? {
        x: clamp01(finiteNumber(rawBounds.x, 0)),
        y: clamp01(finiteNumber(rawBounds.y, 0)),
        width: clamp01(finiteNumber(rawBounds.width, 0)),
        height: clamp01(finiteNumber(rawBounds.height, 0)),
      }
    : undefined;
  return {
    photoIndex: Math.max(0, Math.trunc(photoIndex)),
    status,
    url: typeof raw.url === "string" ? raw.url : undefined,
    maskUrl:
      typeof (raw.maskUrl ?? raw.mask_url) === "string"
        ? String(raw.maskUrl ?? raw.mask_url)
        : undefined,
    subjectBounds,
    error: typeof raw.error === "string" ? raw.error : undefined,
  };
}

/** 多图 + 第三方网关常需 3～6 分钟；单图实测也曾超过 3 分钟 */
function getGenerateTimeoutMs(): number {
  const raw = process.env.NEXT_PUBLIC_GENERATE_TIMEOUT_MS;
  if (raw) {
    const n = Number.parseInt(raw, 10);
    if (!Number.isNaN(n) && n >= 60_000) return n;
  }
  return 420_000; // 7 分钟
}

export function formatApiError(body: unknown, fallback = "请求失败，请稍后重试。"): string {
  if (!body || typeof body !== "object") return fallback;
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
  return fallback;
}

async function fetchJson<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ ok: true; data: T } | { ok: false; status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, status: res.status, body };
    }
    return { ok: true, data: body as T };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return {
        ok: false,
        status: 408,
        body: { detail: `请求超时（超过 ${Math.round(timeoutMs / 1000)} 秒），请稍后重试。` },
      };
    }
    return {
      ok: false,
      status: 0,
      body: {
        detail:
          "无法连接后端。请确认已启动 FastAPI（backend/README）且 NEXT_PUBLIC_API_BASE 正确。",
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

export type UploadItem = { filename: string; url: string };

export async function checkBackendHealth(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${getApiBase()}/health`, {
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function uploadImages(files: File[]): Promise<UploadItem[]> {
  const formData = new FormData();
  for (const f of files) {
    formData.append("files", f);
  }
  const result = await fetchJson<{ items?: UploadItem[] }>(
    `${getApiBase()}/api/v1/images/upload`,
    { method: "POST", body: formData },
    UPLOAD_TIMEOUT_MS,
  );
  if (!result.ok) {
    throw new Error(formatApiError(result.body, "上传失败。"));
  }
  const items = result.data.items;
  if (!items?.length) {
    throw new Error("服务器未返回图片地址。");
  }
  return items;
}

export async function generateCopy(
  styleId: StyleId,
  filenames: string[],
  templateId: TemplateId,
  options?: { includeCutouts?: boolean },
): Promise<GenerateResult> {
  const result = await fetchJson<{
    copy?: Record<string, unknown>;
    annotated_photos?: string[];
    sketch_render_mode?: string;
    cutout_assets?: unknown[];
  }>(
    `${getApiBase()}/api/v1/generate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        style_id: styleId,
        template_id: templateId,
        filenames,
        include_cutouts: options?.includeCutouts ?? true,
      }),
    },
    getGenerateTimeoutMs(),
  );
  if (!result.ok) {
    throw new Error(formatApiError(result.body, "文案生成失败。"));
  }
  const body = result.data;
  const copyPayload = body.copy;
  if (
    !copyPayload ||
    typeof copyPayload.title !== "string" ||
    typeof copyPayload.diary !== "string" ||
    !Array.isArray(copyPayload.captions) ||
    !Array.isArray(copyPayload.hashtags)
  ) {
    throw new Error("生成接口返回格式异常。");
  }
  const copy: DayFrameCopy = {
    title: String(copyPayload.title),
    diary: String(copyPayload.diary),
    captions: (copyPayload.captions as string[]).slice(0, filenames.length),
    hashtags: copyPayload.hashtags as string[],
  };
  const fallbackCaptions = [
    "这一幕先好好收下",
    "刚好留下眼前这一刻",
    "今天也有值得回看的画面",
    "把当时的瞬间存进今天",
    "这一页还想再多看一会儿",
    "现场的光也一起记住了",
    "属于今天的一小段记忆",
    "回看时还是会想起这一刻",
    "这张也放进今天的故事里",
  ];
  while (copy.captions.length < filenames.length) {
    copy.captions.push(
      fallbackCaptions[copy.captions.length % fallbackCaptions.length],
    );
  }

  const rawHints = copyPayload.layout_hints;
  if (Array.isArray(rawHints) && rawHints.length === filenames.length) {
    const hints = rawHints.map(normalizeLayoutHint);
    if (hints.every((hint): hint is LayoutHint => hint !== null)) {
      copy.layoutHints = hints;
    }
  }

  const rawAnalyses = copyPayload.photo_analyses;
  if (Array.isArray(rawAnalyses) && rawAnalyses.length === filenames.length) {
    const analyses = rawAnalyses.map(normalizePhotoAnalysis);
    if (
      analyses.every(
        (analysis): analysis is PhotoAnalysis => analysis !== null,
      )
    ) {
      copy.photoAnalyses = analyses;
    }
  }

  const mode = body.sketch_render_mode;
  const sketchRenderMode: SketchRenderMode | undefined =
    mode === "image" || mode === "overlay" ? mode : undefined;

  if (templateId === "hand-drawn-v1" && sketchRenderMode !== "image") {
    copy.sketches = normalizeSketches(copyPayload.sketches, filenames.length);
  }

  const annotated = body.annotated_photos;
  const annotatedPhotos =
    Array.isArray(annotated) && annotated.every((u) => typeof u === "string")
      ? annotated
      : undefined;

  const rawCutouts = body.cutout_assets;
  let cutoutAssets: CutoutAsset[] | undefined;
  if (Array.isArray(rawCutouts)) {
    const normalized = rawCutouts.map(normalizeCutoutAsset);
    if (normalized.every((item): item is CutoutAsset => item !== null)) {
      cutoutAssets = normalized;
    }
  }

  return { copy, annotatedPhotos, sketchRenderMode, cutoutAssets };
}
