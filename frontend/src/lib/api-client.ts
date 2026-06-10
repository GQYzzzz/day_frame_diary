import { getApiBase } from "@/lib/api";
import { normalizeSketches } from "@/lib/sketch/normalize-sketch";
import type {
  DayFrameCopy,
  SketchRenderMode,
  StyleId,
  TemplateId,
} from "@/lib/types";

export type GenerateResult = {
  copy: DayFrameCopy;
  annotatedPhotos?: string[];
  sketchRenderMode?: SketchRenderMode;
};

const UPLOAD_TIMEOUT_MS = 60_000;

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
): Promise<GenerateResult> {
  const result = await fetchJson<{
    copy?: Record<string, unknown>;
    annotated_photos?: string[];
    sketch_render_mode?: string;
  }>(
    `${getApiBase()}/api/v1/generate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        style_id: styleId,
        template_id: templateId,
        filenames,
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
  while (copy.captions.length < filenames.length) {
    copy.captions.push(`第 ${copy.captions.length + 1} 张`);
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

  return { copy, annotatedPhotos, sketchRenderMode };
}
