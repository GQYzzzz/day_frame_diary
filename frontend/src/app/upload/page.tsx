import type { Metadata } from "next";
import { UploadForm } from "./upload-form";

export const metadata: Metadata = {
  title: "上传照片",
};

export default function UploadPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
        Step 1
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        上传照片
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
        选择 1–9 张照片与一种风格。生成后可在下一页微调文字并导出 PNG。
      </p>
      <UploadForm />
    </div>
  );
}
