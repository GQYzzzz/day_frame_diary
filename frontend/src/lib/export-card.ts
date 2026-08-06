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

async function waitForImages(node: HTMLElement): Promise<void> {
  const images = Array.from(node.querySelectorAll("img"));
  await Promise.all(
    images.map(async (image) => {
      if (image.complete && image.naturalWidth > 0) return;
      await Promise.race([
        image.decode().catch(() => undefined),
        new Promise<void>((resolve) => window.setTimeout(resolve, 8_000)),
      ]);
    }),
  );
}

function exportPixelRatio(node: HTMLElement): number {
  const maxPixels = 16_000_000;
  const area = Math.max(1, node.scrollWidth * node.scrollHeight);
  return Math.max(1, Math.min(2, Math.sqrt(maxPixels / area)));
}

export async function exportElementToPng(
  node: HTMLElement,
  filename: string,
): Promise<void> {
  if (typeof document !== "undefined" && document.fonts?.ready) {
    await document.fonts.ready;
  }
  await waitForImages(node);

  const dataUrl = await toPng(node, {
    pixelRatio: exportPixelRatio(node),
    cacheBust: true,
    backgroundColor: exportBackgroundColor(node),
    filter: (domNode) =>
      !(
        domNode instanceof HTMLElement &&
        domNode.dataset.dayframeEditorUi === "true"
      ),
  });
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename.replace(/[^\w.\-]+/g, "_");
  link.click();
}
