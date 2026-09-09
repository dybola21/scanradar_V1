import { createFileRoute } from "@tanstack/react-router";
import AuthPage from "@/components/AuthPage";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — ScanRadar" },
      { name: "description", content: "Acesse o ScanRadar para encontrar e organizar oportunidades comerciais." },
      { property: "og:title", content: "Entrar — ScanRadar" },
      { property: "og:description", content: "Acesse o ScanRadar para encontrar e organizar oportunidades comerciais." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});
