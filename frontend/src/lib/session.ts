import type { DayFrameSessionV1 } from "@/lib/types";

export const DAYFRAME_SESSION_KEY = "dayframe:session:v1";

export function saveDayFrameSession(data: DayFrameSessionV1): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(DAYFRAME_SESSION_KEY, JSON.stringify(data));
}

export function loadDayFrameSession(): DayFrameSessionV1 | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(DAYFRAME_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DayFrameSessionV1;
    if (parsed?.version !== 1 || !Array.isArray(parsed.photos)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearDayFrameSession(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(DAYFRAME_SESSION_KEY);
}
