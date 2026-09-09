import { createFileRoute } from "@tanstack/react-router";
import SearchPage from "@/components/SearchPage";

export const Route = createFileRoute("/_authenticated/search")({
  component: SearchPage,
  head: () => ({
    meta: [
      { title: "ScanRadar | Nova Busca" },
      { name: "description", content: "Iniciar nova busca de leads" },
    ],
  }),
});
