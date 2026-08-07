import type { VerticalBackground } from "@/lib/types";

export const DEFAULT_VERTICAL_BACKGROUND: VerticalBackground = "white";

export const VERTICAL_BACKGROUND_OPTIONS: ReadonlyArray<{
  id: VerticalBackground;
  label: string;
  color: string;
  dark: boolean;
}> = [
  { id: "white", label: "白色", color: "#ffffff", dark: false },
  { id: "pale-yellow", label: "淡黄色", color: "#fff6d8", dark: false },
  { id: "pale-pink", label: "浅粉色", color: "#fdecef", dark: false },
  { id: "pale-blue", label: "浅蓝色", color: "#eaf5fc", dark: false },
  { id: "gray", label: "灰色", color: "#e4e4e1", dark: false },
  { id: "light-brown", label: "浅棕色", color: "#e7d5bf", dark: false },
  { id: "black", label: "黑色", color: "#171717", dark: true },
];

export function verticalBackgroundOption(id: VerticalBackground | undefined) {
  return (
    VERTICAL_BACKGROUND_OPTIONS.find((option) => option.id === id) ??
    VERTICAL_BACKGROUND_OPTIONS[0]
  );
}
