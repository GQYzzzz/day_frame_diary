type Phase = "uploading" | "generating";

const copy: Record<Phase, { title: string; hint: string }> = {
  uploading: {
    title: "正在上传照片…",
    hint: "通常只需几秒钟。",
  },
  generating: {
    title: "AI 正在识图并写文案…",
    hint: "多图或第三方网关较慢时可能需要 3～6 分钟，请勿关闭页面。",
  },
};

export function ProcessingOverlay({ phase }: { phase: Phase }) {
  const { title, hint } = copy[phase];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 px-6 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-label={title}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-4 text-center">
          <div
            className="h-10 w-10 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100"
            aria-hidden
          />
          <div>
            <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {title}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {hint}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}