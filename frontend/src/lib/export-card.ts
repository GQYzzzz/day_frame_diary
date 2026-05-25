import { toPng } from "html-to-image";

function exportBackgroundColor(node: HTMLElement): string {
  const attr = node.dataset.exportBg;
  if (attr) return attr;
  const bg = getComputedStyle(node).backgroundColor;
  if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
    return bg;
  }
  return "#ffffff";
}

export async function exportElementToPng(
  node: HTMLElement,
  filename: string,
): Promise<void> {
  if (typeof document !== "undefined" && document.fonts?.ready) {
    await document.fonts.ready;
  }

  const dataUrl = await toPng(node, {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: exportBackgroundColor(node),
  });
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename.replace(/[^\w.\-]+/g, "_");
  link.click();
}
