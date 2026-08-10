import type {
  ChalkboardBackground,
  PolkaBackground,
  VerticalBackground,
} from "@/lib/types";

export type BackgroundOption<T extends string> = {
  id: T;
  label: string;
  color: string;
  light?: boolean;
  dotColor?: string;
  backgroundImage?: string;
  texture?: "vintage" | "crumpled";
};

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

export const DEFAULT_CHALKBOARD_BACKGROUND: ChalkboardBackground = "default";

export const CHALKBOARD_BACKGROUND_OPTIONS: ReadonlyArray<
  BackgroundOption<ChalkboardBackground>
> = [
  { id: "default", label: "墨绿色", color: "#111715" },
  { id: "black", label: "黑色", color: "#090a09" },
  { id: "dark-gray", label: "深灰色", color: "#292b2a" },
  { id: "dark-brown", label: "深棕色", color: "#33251f" },
  { id: "dark-blue", label: "深蓝色", color: "#17263a" },
  {
    id: "pale-yellow",
    label: "浅黄色",
    color: "#f4e9b9",
    light: true,
  },
  {
    id: "vintage-gray",
    label: "暮灰渐变",
    color: "#7c7973",
    backgroundImage:
      "linear-gradient(180deg, #77746f 0%, #99968f 35%, #c3c1ba 68%, #e8e8e3 100%)",
    texture: "vintage",
  },
  {
    id: "vintage-red",
    label: "酒红渐变",
    color: "#7c1d1e",
    backgroundImage:
      "linear-gradient(180deg, #78191b 0%, #9d4b46 38%, #c59386 70%, #e6e2dc 100%)",
    texture: "vintage",
  },
  {
    id: "vintage-green",
    label: "墨绿渐变",
    color: "#073f33",
    backgroundImage:
      "linear-gradient(180deg, #073d32 0%, #286254 38%, #78a096 70%, #e7e9e5 100%)",
    texture: "vintage",
  },
  {
    id: "crumpled-paper",
    label: "揉皱白纸",
    color: "#eeeeec",
    backgroundImage:
      "linear-gradient(132deg, transparent 0 28%, rgba(120,120,116,.08) 29%, rgba(255,255,255,.3) 31%, transparent 34%), linear-gradient(38deg, transparent 0 43%, rgba(120,120,116,.07) 45%, rgba(255,255,255,.26) 47%, transparent 50%), linear-gradient(160deg, transparent 0 62%, rgba(130,130,126,.06) 64%, rgba(255,255,255,.3) 66%, transparent 69%)",
    texture: "crumpled",
    light: true,
  },
];

export function chalkboardBackgroundOption(
  id: ChalkboardBackground | undefined,
) {
  return (
    CHALKBOARD_BACKGROUND_OPTIONS.find((option) => option.id === id) ??
    CHALKBOARD_BACKGROUND_OPTIONS[0]
  );
}

export const DEFAULT_POLKA_BACKGROUND: PolkaBackground = "default";

export const POLKA_BACKGROUND_OPTIONS: ReadonlyArray<
  BackgroundOption<PolkaBackground>
> = [
  {
    id: "default",
    label: "暖灰色",
    color: "#c8c6c2",
    dotColor: "rgba(255,255,255,0.94)",
  },
  {
    id: "pale-blue",
    label: "浅蓝色",
    color: "#eef8ff",
    dotColor: "#c9d8e4",
  },
  {
    id: "pale-green",
    label: "浅绿色",
    color: "#f8fcf4",
    dotColor: "#dce4dc",
  },
  {
    id: "pale-pink",
    label: "浅粉色",
    color: "#fff0fb",
    dotColor: "rgba(255,255,255,0.92)",
  },
];

export function normalizePolkaBackground(
  id: PolkaBackground | string | undefined,
): PolkaBackground {
  if (id === "pale-blue" || id === "pale-green" || id === "pale-pink") {
    return id;
  }
  if (id === "pink") return "pale-pink";
  if (id === "mint") return "pale-green";
  if (id === "yellow") return "pale-blue";
  return DEFAULT_POLKA_BACKGROUND;
}

export function polkaBackgroundOption(
  id: PolkaBackground | string | undefined,
) {
  const normalized = normalizePolkaBackground(id);
  return (
    POLKA_BACKGROUND_OPTIONS.find((option) => option.id === normalized) ??
    POLKA_BACKGROUND_OPTIONS[0]
  );
}
