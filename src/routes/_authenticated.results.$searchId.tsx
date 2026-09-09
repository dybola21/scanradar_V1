import { createFileRoute } from "@tanstack/react-router";
import ResultsPage from "@/components/ResultsPage";

export const Route = createFileRoute("/_authenticated/results/$searchId")({
  component: ResultsPage,
  head: () => ({
    meta: [
      { title: "ScanRadar | Resultados" },
      { name: "description", content: "Visualizar leads encontrados" },
    ],
  }),
});
