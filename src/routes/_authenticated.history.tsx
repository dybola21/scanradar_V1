import { createFileRoute } from "@tanstack/react-router";
import HistoryPage from "@/components/HistoryPage";

export const Route = createFileRoute("/_authenticated/history")({
  component: HistoryPage,
  head: () => ({
    meta: [
      { title: "ScanRadar | Histórico" },
      { name: "description", content: "Histórico de buscas de leads" },
    ],
  }),
});
