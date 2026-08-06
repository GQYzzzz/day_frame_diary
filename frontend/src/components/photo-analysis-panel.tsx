import type {
  PhotoAnalysis,
  PhotoLayoutRole,
  PhotoOrientation,
  PhotoRenderMode,
  PhotoSubjectType,
} from "@/lib/types";

const SUBJECT_LABELS: Record<PhotoSubjectType, string> = {
  portrait: "单人",
  group: "多人",
  food: "食物",
  landscape: "风景/空间",
  object: "物品",
  other: "其他",
};

const ROLE_LABELS: Record<PhotoLayoutRole, string> = {
  hero: "主图",
  support: "辅助图",
  detail: "细节图",
};

const RENDER_LABELS: Record<PhotoRenderMode, string> = {
  frame: "保留原图",
  cutout: "抠图候选",
  hero: "主视觉",
};

const ORIENTATION_LABELS: Record<PhotoOrientation, string> = {
  portrait: "竖图",
  landscape: "横图",
  square: "方图",
};

type Props = {
  analyses: PhotoAnalysis[];
  photos: string[];
};

function capturedAtLabel(value: string | undefined): string {
  if (!value) return "无 EXIF 时间";
  return value.replace("T", " ");
}

export function PhotoAnalysisPanel({ analyses, photos }: Props) {
  return (
    <details className="rounded-xl border border-zinc-200 bg-zinc-50/70 dark:border-zinc-700 dark:bg-zinc-900/50">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-zinc-800 dark:text-zinc-100">
        照片分析结果（{analyses.length} 张）
      </summary>
      <div className="grid gap-3 border-t border-zinc-200 p-4 sm:grid-cols-2 dark:border-zinc-700">
        {analyses.map((analysis) => {
          const photo = photos[analysis.index];
          return (
            <article
              key={analysis.index}
              className="flex gap-3 rounded-lg bg-white p-3 shadow-sm ring-1 ring-black/5 dark:bg-zinc-950 dark:ring-white/10"
            >
              <div className="relative h-24 w-20 shrink-0 overflow-hidden rounded-md bg-zinc-200 dark:bg-zinc-800">
                {photo ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo}
                      alt={`照片 ${analysis.index + 1}`}
                      className="h-full w-full object-cover"
                      draggable={false}
                    />
                    <span
                      className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-rose-500 shadow"
                      style={{
                        left: `${analysis.focalX * 100}%`,
                        top: `${analysis.focalY * 100}%`,
                      }}
                      title="模型判断的视觉中心"
                    />
                  </>
                ) : null}
              </div>

              <div className="min-w-0 flex-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">
                    图 {analysis.index + 1} · {ROLE_LABELS[analysis.layoutRole]}
                  </p>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    重要度 {Math.round(analysis.importance * 100)}
                  </span>
                </div>
                <p className="mt-1 truncate" title={analysis.subjectSummary}>
                  {analysis.subjectSummary || "未识别到明确主体"}
                </p>
                <p>
                  {SUBJECT_LABELS[analysis.subjectType]} ·{" "}
                  {analysis.hasFaces ? "有人脸" : "无人脸"} ·{" "}
                  {RENDER_LABELS[analysis.recommendedRender]}
                </p>
                <p>
                  {analysis.width && analysis.height
                    ? `${analysis.width}×${analysis.height}`
                    : "尺寸未知"}{" "}
                  · {ORIENTATION_LABELS[analysis.orientation]}
                </p>
                <p className="text-zinc-400">
                  {capturedAtLabel(analysis.capturedAt)}
                </p>
              </div>
            </article>
          );
        })}
      </div>
    </details>
  );
}
