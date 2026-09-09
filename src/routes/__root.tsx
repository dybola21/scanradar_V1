import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import PwaManager from "@/components/PwaManager";
import { Target, AlertCircle } from "lucide-react";

import appCss from "../styles.css?url";


function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F9FC] px-4 selection:bg-primary/20 selection:text-primary">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,oklch(var(--primary)/0.03),transparent_40%)] pointer-events-none" />
      <div className="max-w-md text-center relative z-10">
        <div className="mb-8 flex justify-center">
          <div className="p-4 rounded-3xl bg-primary/10 text-primary">
            <Target className="h-12 w-12" />
          </div>
        </div>
        <h1 className="text-8xl font-black tracking-tighter text-foreground leading-none">404</h1>
        <h2 className="mt-4 text-2xl font-black tracking-tight text-foreground">Destino Não Encontrado</h2>
        <p className="mt-3 text-sm text-muted-foreground font-medium">
          A coordenada que você está procurando não existe em nossa rede ou foi movida para uma nova zona.
        </p>
        <div className="mt-8">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-2xl bg-primary px-8 py-4 text-base font-black text-primary-foreground transition-all hover:scale-[1.05] active:scale-[0.95] shadow-xl shadow-primary/20"
          >
            Voltar ao Radar
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {

  const router = useRouter();
  useEffect(() => {
    console.error("[ScanRadar] Falha na interface", {type: error.name});
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F9FC] px-4 selection:bg-primary/20 selection:text-primary">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,oklch(var(--primary)/0.03),transparent_40%)] pointer-events-none" />
      <div className="max-w-md text-center relative z-10">
        <div className="mb-8 flex justify-center">
          <div className="p-4 rounded-3xl bg-destructive/10 text-destructive">
            <AlertCircle className="h-12 w-12" />
          </div>
        </div>
        <h1 className="text-2xl font-black tracking-tight text-foreground">
          Falha na Engine do Radar
        </h1>
        <p className="mt-3 text-sm text-muted-foreground font-medium leading-relaxed">
          Ocorreu um erro inesperado no processamento dos dados. Tente reiniciar a interface ou contate o suporte.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-2xl bg-primary px-8 py-4 text-base font-black text-primary-foreground transition-all hover:scale-[1.05] active:scale-[0.95] shadow-xl shadow-primary/20"
          >
            Reiniciar Engine
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-2xl border border-border/50 bg-card px-8 py-4 text-base font-black text-foreground transition-all hover:bg-muted"
          >
            Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ScanRadar" },
      { name: "description", content: "Sistema inteligente de geração de leads via Google Maps" },
      { name: "author", content: "ScanRadar" },
      { property: "og:title", content: "ScanRadar" },
      { property: "og:description", content: "Sistema inteligente de geração de leads via Google Maps" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#07111F" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "ScanRadar" },
      { name: "application-name", content: "ScanRadar" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster position="top-right" richColors closeButton />
      <PwaManager />
    </QueryClientProvider>
  );
}
