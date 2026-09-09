import { createFileRoute } from "@tanstack/react-router";
import SettingsPage from "@/components/SettingsPage";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
  head: () => ({
    meta: [
      { title: "ScanRadar | Configurações" },
      { name: "description", content: "Gerenciar integrações e conta" },
    ],
  }),
});
