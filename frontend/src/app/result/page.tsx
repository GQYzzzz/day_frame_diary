import type { Metadata } from "next";
import { ResultPageClient } from "./result-page-client";

export const metadata: Metadata = {
  title: "预览与导出",
};

export default function ResultPage() {
  return <ResultPageClient />;
}
