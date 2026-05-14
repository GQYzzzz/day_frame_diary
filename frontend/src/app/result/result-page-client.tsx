"use client";

import dynamic from "next/dynamic";

const ResultView = dynamic(
  () => import("./result-view").then((m) => m.ResultView),
  {
    ssr: false,
    loading: () => (
      <div className="mx-auto max-w-lg px-4 py-24 text-center text-sm text-zinc-500">
        加载预览…
      </div>
    ),
  },
);

export function ResultPageClient() {
  return <ResultView />;
}
