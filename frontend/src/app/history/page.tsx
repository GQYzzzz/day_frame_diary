import type { Metadata } from "next";
import { HistoryView } from "@/app/history/history-view";

export const metadata: Metadata = {
  title: "历史作品",
};

export default function HistoryPage() {
  return <HistoryView />;
}
