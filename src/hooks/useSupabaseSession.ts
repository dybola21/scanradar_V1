import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Tracks whether a Supabase session is available in the browser.
 * Server functions protected by `requireSupabaseAuth` must only be called
 * once this returns `true`, otherwise the RPC goes out without a bearer
 * token and fails with "Unauthorized: No authorization header provided".
 */
export function useSupabaseSession() {
  const [isReady, setIsReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setHasSession(Boolean(data.session?.access_token));
      setIsReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setHasSession(Boolean(session?.access_token));
      setIsReady(true);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { isReady, hasSession, isAuthenticated: isReady && hasSession };
}
