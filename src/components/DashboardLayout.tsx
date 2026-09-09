import { Outlet, Link, useNavigate, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Search,
  History,
  Settings,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  User,
  ChevronUp,
  Activity,
} from "lucide-react";
import { ScanRadarLogo } from "./ScanRadarLogo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useSupabaseSession } from "@/hooks/useSupabaseSession";
import { getIntegrationStatus } from "@/lib/scraper.functions";
import { logScanEvent } from "@/lib/logs.functions";
import { useServerFn } from "@tanstack/react-start";

import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/dashboard" },
  { label: "Nova busca", icon: Search, to: "/search" },
  { label: "Histórico", icon: History, to: "/history" },
  { label: "Logs Técnicos", icon: Activity, to: "/admin/logs" },
  { label: "Configurações", icon: Settings, to: "/settings" },
] as const;

const COLLAPSE_KEY = "scanradar:sidebar-collapsed";

export default function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  const fetchStatus = useServerFn(getIntegrationStatus);
  const logEventFn = useServerFn(logScanEvent);

  const { isAuthenticated } = useSupabaseSession();
  const { data: integration } = useQuery({
    queryKey: ["integration-status"],
    queryFn: () => fetchStatus(),
    staleTime: 60_000,
    enabled: isAuthenticated,
  });

  useEffect(() => {
    setIsCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null));
  }, []);

  const toggleCollapsed = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  };

  const handleLogout = async () => {
    const userEmail = email;
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error(error.message);
    } else {
      await logEventFn({
        data: {
          eventType: 'AUTH_ACTION' as any,
          eventStatus: 'success',
          message: `Usuário deslogado: ${userEmail}`,
          payload: { email: userEmail }
        }
      }).catch(console.error);
      navigate({ to: "/auth" });
    }
  };


  const connectionState = !integration?.configured
    ? { label: "Integração não configurada", tone: "bg-muted-foreground" }
    : integration.is_connected
      ? { label: "Integração conectada", tone: "bg-success" }
      : { label: "Integração pendente de teste", tone: "bg-warning" };

  const NavContent = ({ mobile = false }: { mobile?: boolean }) => {
    const compact = isCollapsed && !mobile;
    return (
      <div className="flex h-full flex-col gap-6 py-4">
        <nav className="flex-1 space-y-1 px-3" aria-label="Navegação principal">
          {navItems.map((item) => {
            const isActive =
              location.pathname === item.to ||
              (item.to === "/history" && location.pathname.startsWith("/results")) ||
              (item.to === "/admin/logs" && location.pathname.startsWith("/admin/logs"));
            const link = (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => mobile && setIsMobileMenuOpen(false)}
                aria-current={isActive ? "page" : undefined}
                aria-label={compact ? item.label : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                  compact && "justify-center px-0",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <item.icon className="size-[18px] shrink-0" />
                {!compact && <span className="truncate">{item.label}</span>}
              </Link>
            );

            if (!compact) return link;
            return (
              <Tooltip key={item.to}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        <div className="mt-auto px-3 pb-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl border border-border p-2 transition-colors hover:bg-secondary/80",
                  compact && "justify-center px-0",
                )}
                aria-label="Menu da conta"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-[13px] font-bold text-primary-foreground shadow-sm">
                  {(email ?? "?").charAt(0).toUpperCase()}
                </div>
                {!compact && (
                  <>
                    <div className="min-w-0 flex-1 text-left">
                      <p className="truncate text-[13px] font-semibold text-foreground">
                        {email?.split("@")[0] || "Usuário"}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {connectionState.label}
                      </p>
                    </div>
                    <ChevronUp className="size-4 shrink-0 text-muted-foreground/60" />
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side={mobile ? "bottom" : "right"} align={mobile ? "center" : "end"} className="w-56 rounded-xl shadow-md">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">Minha Conta</p>
                  <p className="text-xs leading-none text-muted-foreground">{email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="cursor-pointer rounded-lg">
                <Link to="/settings" className="flex w-full items-center gap-2">
                  <Settings className="size-4" />
                  <span>Configurações</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={handleLogout} 
                className="cursor-pointer rounded-lg text-destructive focus:bg-destructive-soft focus:text-destructive"
              >
                <LogOut className="size-4" />
                <span>Sair</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-dvh bg-background">
        <aside
          className={cn(
            "fixed z-40 hidden h-dvh flex-col border-r border-border bg-sidebar transition-[width] duration-200 md:flex",
            isCollapsed ? "w-[72px]" : "w-[240px]",
          )}
        >
          <div
            className={cn(
              "flex h-16 items-center gap-2 border-b border-border px-3",
              isCollapsed && "justify-center px-0",
            )}
          >
            <Link
              to="/dashboard"
              className="flex min-h-11 min-w-0 items-center gap-2.5 rounded-lg px-1"
              aria-label="ScanRadar — ir para o dashboard"
            >
              <ScanRadarLogo 
                size={isCollapsed ? 32 : 30} 
                theme="light" 
                showWordmark={!isCollapsed} 
              />
            </Link>
            {!isCollapsed && (
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleCollapsed}
                className="ml-auto size-9 rounded-lg text-muted-foreground"
                aria-label="Recolher menu lateral"
              >
                <PanelLeftClose className="size-[18px]" />
              </Button>
            )}
          </div>
          {isCollapsed && (
            <div className="flex justify-center py-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleCollapsed}
                className="size-9 rounded-lg text-muted-foreground"
                aria-label="Expandir menu lateral"
              >
                <PanelLeftOpen className="size-[18px]" />
              </Button>
            </div>
          )}
          <NavContent />
        </aside>

        <div
          className={cn("hidden shrink-0 transition-[width] duration-200 md:block", isCollapsed ? "w-[72px]" : "w-[240px]")}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/85 px-4 backdrop-blur md:hidden">
            <Link
              to="/dashboard"
              className="flex min-h-11 min-w-0 items-center gap-2.5"
              aria-label="ScanRadar — ir para o dashboard"
            >
              <ScanRadarLogo size={28} theme="light" />
            </Link>
            <div className="flex shrink-0 items-center gap-2">
              <Button asChild size="icon" className="min-h-11 min-w-11 rounded-xl" aria-label="Nova busca">
                <Link to="/search">
                  <Plus className="size-5" />
                </Link>
              </Button>
              <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" className="min-h-11 min-w-11 rounded-xl" aria-label="Abrir menu">
                    <Menu className="size-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[240px] p-0">
                  <div className="flex h-16 items-center gap-2.5 border-b border-border px-4">
                    <ScanRadarLogo size={28} theme="light" />
                  </div>
                  <NavContent mobile />
                </SheetContent>
              </Sheet>
            </div>
          </header>

          <main className="flex-1">
            <div className="mx-auto w-full max-w-[1320px] px-4 py-6 md:px-8 md:py-8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={location.pathname}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                >
                  <Outlet />
                </motion.div>
              </AnimatePresence>
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
