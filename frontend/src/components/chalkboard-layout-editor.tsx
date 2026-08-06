"use client";

import type {
  CutoutAsset,
  PhotoAnalysis,
  PhotoLayoutNode,
} from "@/lib/types";

type Props = {
  photos: string[];
  analyses: PhotoAnalysis[];
  cutoutAssets?: CutoutAsset[];
  selectedPhotoIndex: number | null;
  selectedNode?: PhotoLayoutNode;
  regenerating: boolean;
  canRegenerate: boolean;
  error?: string | null;
  onSelect: (photoIndex: number) => void;
  onSetHero: (photoIndex: number) => void;
  onSetRenderMode: (photoIndex: number, mode: "frame" | "cutout") => void;
  onScale: (factor: number) => void;
  onRotate: (delta: number) => void;
  onResetLayout: () => void;
  onRegenerateCopy: () => void;
};

export function ChalkboardLayoutEditor({
  photos,
  analyses,
  cutoutAssets,
  selectedPhotoIndex,
  selectedNode,
  regenerating,
  canRegenerate,
  error,
  onSelect,
  onSetHero,
  onSetRenderMode,
  onScale,
  onRotate,
  onResetLayout,
  onRegenerateCopy,
}: Props) {
  const selectedAnalysis = analyses.find(
    (item) => item.index === selectedPhotoIndex,
  );
  const selectedCutout = cutoutAssets?.find(
    (item) => item.photoIndex === selectedPhotoIndex,
  );
  const canUseCutout =
    selectedCutout?.status === "ready" && Boolean(selectedCutout.url);

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-900/55">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            排版编辑
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            选择照片后可拖动画布中的素材，并调整层级表现。
          </p>
        </div>
        <button
          type="button"
          onClick={onResetLayout}
          className="shrink-0 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
        >
          重置布局
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {photos.map((photo, index) => {
          const analysis = analyses.find((item) => item.index === index);
          const selected = selectedPhotoIndex === index;
          return (
            <button
              key={`${index}-${photo.slice(0, 28)}`}
              type="button"
              onClick={() => onSelect(index)}
              className={`relative overflow-hidden rounded-lg border-2 bg-zinc-200 text-left ${
                selected
                  ? "border-sky-500 ring-2 ring-sky-500/20"
                  : "border-transparent hover:border-zinc-300 dark:hover:border-zinc-600"
              }`}
              aria-pressed={selected}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo}
                alt={`选择照片 ${index + 1}`}
                className="h-16 w-full object-cover"
                draggable={false}
              />
              <span className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-black/58 px-1.5 py-1 text-[9px] text-white">
                <span>图 {index + 1}</span>
                {analysis?.layoutRole === "hero" ? (
                  <span className="text-amber-300">主图</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      {selectedPhotoIndex !== null && selectedNode ? (
        <div className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-700">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onSetHero(selectedPhotoIndex)}
              disabled={selectedAnalysis?.layoutRole === "hero"}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-45 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
            >
              设为主图
            </button>
            <button
              type="button"
              onClick={() => onSetRenderMode(selectedPhotoIndex, "frame")}
              className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                selectedNode.renderMode === "frame"
                  ? "border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
                  : "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
              }`}
            >
              使用原图
            </button>
            <button
              type="button"
              onClick={() => onSetRenderMode(selectedPhotoIndex, "cutout")}
              disabled={!canUseCutout}
              className={`rounded-lg border px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                selectedNode.renderMode === "cutout"
                  ? "border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
                  : "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
              }`}
            >
              使用抠图
            </button>
          </div>

          {!canUseCutout ? (
            <p className="text-[11px] text-zinc-500">
              该照片没有可用抠图，将继续使用原始照片。
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                缩放
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onScale(0.9)}
                  className="flex-1 rounded-lg border border-zinc-200 bg-white py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => onScale(1.1)}
                  className="flex-1 rounded-lg border border-zinc-200 bg-white py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                >
                  ＋
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                旋转
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onRotate(-3)}
                  className="flex-1 rounded-lg border border-zinc-200 bg-white py-2 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                >
                  左转
                </button>
                <button
                  type="button"
                  onClick={() => onRotate(3)}
                  className="flex-1 rounded-lg border border-zinc-200 bg-white py-2 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                >
                  右转
                </button>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-zinc-400">
            位置 {Math.round(selectedNode.x)}, {Math.round(selectedNode.y)}
            {" · "}
            尺寸 {Math.round(selectedNode.width)} ×{" "}
            {Math.round(selectedNode.height)}
            {" · "}
            旋转 {Math.round(selectedNode.rotation)}°
          </p>
        </div>
      ) : (
        <p className="border-t border-zinc-200 pt-3 text-xs text-zinc-500 dark:border-zinc-700">
          点击缩略图或画布中的照片开始编辑。
        </p>
      )}

      <div className="border-t border-zinc-200 pt-4 dark:border-zinc-700">
        <button
          type="button"
          onClick={onRegenerateCopy}
          disabled={!canRegenerate || regenerating}
          className="w-full rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {regenerating ? "正在重新生成文案…" : "重新生成文案"}
        </button>
        {!canRegenerate ? (
          <p className="mt-2 text-[11px] text-zinc-500">
            当前作品缺少原始上传文件，暂时不能重新调用模型。
          </p>
        ) : null}
        {error ? (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
