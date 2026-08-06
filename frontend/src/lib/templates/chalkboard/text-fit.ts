export type FittedText = {
  text: string;
  truncated: boolean;
};

export type TitleFit = FittedText & {
  fontSize: number;
  letterSpacing: string;
};

function characters(text: string): string[] {
  return Array.from(text.trim());
}

export function fitText(text: string, maxCharacters: number): FittedText {
  const chars = characters(text);
  if (chars.length <= maxCharacters) {
    return { text: chars.join(""), truncated: false };
  }
  return {
    text: `${chars.slice(0, Math.max(1, maxCharacters - 1)).join("").trimEnd()}…`,
    truncated: true,
  };
}

export function captionCapacity(width: number): number {
  const usableWidth = Math.max(60, width - 20);
  const charactersPerLine = Math.max(6, Math.floor(usableWidth / 11));
  return Math.max(10, charactersPerLine * 2 - 3);
}

export function fitCaption(text: string, width: number): FittedText {
  return fitText(text, captionCapacity(width));
}

export function captionOverflow(text: string, width: number): number {
  return Math.max(0, characters(text).length - captionCapacity(width));
}

export function fitTitle(text: string): TitleFit {
  const fitted = fitText(text || "今天的小记", 34);
  const length = characters(fitted.text).length;
  if (length <= 10) {
    return {
      ...fitted,
      fontSize: 34,
      letterSpacing: "0.08em",
    };
  }
  if (length <= 18) {
    return {
      ...fitted,
      fontSize: 30,
      letterSpacing: "0.055em",
    };
  }
  if (length <= 26) {
    return {
      ...fitted,
      fontSize: 26,
      letterSpacing: "0.035em",
    };
  }
  return {
    ...fitted,
    fontSize: 23,
    letterSpacing: "0.02em",
  };
}

export function diaryTypography(text: string): {
  fontSize: number;
  lineHeight: number;
} {
  const length = characters(text).length;
  if (length <= 120) return { fontSize: 13, lineHeight: 1.85 };
  if (length <= 220) return { fontSize: 12, lineHeight: 1.78 };
  return { fontSize: 11, lineHeight: 1.72 };
}
