import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-3xl flex-col justify-center px-4 py-16">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">
        Frame Your Day
      </p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl">
        DayFrame
      </h1>
      <p className="mt-5 max-w-xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-300">
        Web 版 AI 图文日记：上传照片、选择风格与模板，生成文案并自动排版，导出高清长图，便于朋友圈、小红书等平台分享。
      </p>
      <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
        上传照片后由 AI 生成文案，在浏览器内预览排版并导出高清长图。使用前请启动本地后端服务。
      </p>
      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/upload"
          className="inline-flex h-12 items-center justify-center rounded-xl bg-zinc-900 px-8 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          开始记录
        </Link>
        <Link
          href="/history"
          className="inline-flex h-12 items-center justify-center rounded-xl border border-zinc-200 px-8 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900"
        >
          历史作品
        </Link>
      </div>
    </div>
  );
}
