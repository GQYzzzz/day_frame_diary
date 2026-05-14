import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "历史作品",
};

export default function HistoryPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        历史作品
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
        这里将展示你已保存的作品列表（需登录与后端存储）。当前 MVP 仅使用浏览器会话，关闭标签页后可在「上传 → 生成预览」重新创建。
      </p>
      <Link
        href="/upload"
        className="mt-8 inline-flex h-11 items-center justify-center rounded-xl bg-zinc-900 px-6 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        新建一条
      </Link>
    </div>
  );
}
