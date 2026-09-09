import { createFileRoute } from "@tanstack/react-router";
import Dashboard from "@/components/Dashboard";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "ScanRadar | Dashboard" },
      { name: "description", content: "Visão geral do sistema de leads" },
    ],
  }),
});
