import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    // Durante o retorno do OAuth a URL carrega tokens/códigos; nesse caso
    // encaminhamos para o callback público que aguarda a sessão ser gravada.
    if (typeof window !== "undefined") {
      const hash = window.location.hash ?? "";
      const search = window.location.search ?? "";
      const isOAuthReturn =
        hash.includes("access_token") ||
        hash.includes("refresh_token") ||
        /[?&](code|token_hash|error_description)=/.test(search);
      if (isOAuthReturn) {
        throw redirect({ to: "/auth/callback" });
      }
    }
    throw redirect({ to: "/dashboard" });
  },
});
