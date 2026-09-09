import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrando… — ScanRadar" },
      { name: "description", content: "Finalizando o login no ScanRadar." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Entrando… — ScanRadar" },
      { property: "og:description", content: "Finalizando o login no ScanRadar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Finalizando login…");

  useEffect(() => {
    let active = true;
    let done = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const go = () => {
      if (!active || done) return;
      done = true;
      navigate({ to: "/dashboard", replace: true });
    };

    const validateSession = async (attempt = 0) => {
      if (!active || done) return;

      const { data, error } = await supabase.auth.getUser();
      if (data.user) {
        go();
        return;
      }

      if (attempt < 7) {
        retryTimer = setTimeout(() => void validateSession(attempt + 1), 500);
        return;
      }

      const params = new URLSearchParams(`${window.location.search}&${window.location.hash.slice(1)}`);
      const oauthError = params.get("error_description") ?? params.get("error");
      setMessage(oauthError || error?.message || "Não foi possível concluir o login. Tente novamente.");
      setTimeout(() => {
        if (active) navigate({ to: "/auth", replace: true });
      }, 2500);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) void validateSession();
    });

    // The mobile/PWA redirect can arrive before the auth client finishes
    // exchanging and persisting the callback tokens. getUser() waits for that
    // initialization and verifies the resulting session with the auth server.
    void validateSession();

    return () => {
      active = false;
      sub.subscription.unsubscribe();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [navigate]);

  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center gap-4 bg-[#07111F] text-[#F6F8FB]">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-[#38BDF8] border-t-transparent" />
      <p className="text-sm text-[#9FB1C7]">{message}</p>
    </div>
  );
}
