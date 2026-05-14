import { toPng } from "html-to-image";

export async function exportElementToPng(
  node: HTMLElement,
  filename: string,
): Promise<void> {
  const dataUrl = await toPng(node, {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: "#ffffff",
  });
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename.replace(/[^\w.\-]+/g, "_");
  link.click();
}
