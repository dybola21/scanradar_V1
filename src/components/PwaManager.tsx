import { useEffect, useState } from "react";
import { Download, X, Share } from "lucide-react";
import { Button } from "@/components/ui/button";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "scanradar:pwa-prompt-dismissed";

export default function PwaManager() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = async () => {
      if (import.meta.env.DEV) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        const hadRegistration = registrations.length > 0;
        await Promise.all(registrations.map((registration) => registration.unregister()));

        if ("caches" in window) {
          const cacheNames = await caches.keys();
          await Promise.all(
            cacheNames
              .filter((name) => name.startsWith("scanradar-"))
              .map((name) => caches.delete(name)),
          );
        }

        if (hadRegistration && !sessionStorage.getItem("scanradar:dev-cache-reset")) {
          sessionStorage.setItem("scanradar:dev-cache-reset", "1");
          window.location.reload();
        }
        return;
      }

      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((registration) => registration.update())
        .catch(() => undefined);
    };
    if (document.readyState === "complete") void register();
    else window.addEventListener("load", () => void register(), { once: true });
  }, []);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) === "1") return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as InstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|Android/.test(ua);
    if (isIos && isSafari) {
      setShowIosHint(true);
      setVisible(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-2xl border border-border bg-card p-4 shadow-xl md:left-auto md:right-4 md:mx-0">
      <div className="flex items-start gap-3">
        <img src="/icons/icon-192.png" alt="" width={40} height={40} className="size-10 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Instalar o ScanRadar</p>
          {showIosHint && !deferred ? (
            <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              Toque em <Share className="inline size-3.5" /> Compartilhar e depois em
              &quot;Adicionar à Tela de Início&quot;.
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Adicione o app à tela inicial e use como um aplicativo nativo.
            </p>
          )}
          {!showIosHint && (
            <Button size="sm" className="mt-3 rounded-xl" onClick={install}>
              <Download className="size-4" />
              Instalar app
            </Button>
          )}
        </div>
        <button
          onClick={dismiss}
          aria-label="Dispensar convite de instalação"
          className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
