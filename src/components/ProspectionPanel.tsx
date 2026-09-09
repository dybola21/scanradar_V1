import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ACTIVE_STATES, statusSchema } from "@/lib/automation-contract";
import { Button } from "@/components/ui/button";
import { ExternalLink, Loader2, Play, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { CancelProspectionButton } from "./CancelProspectionButton";

async function api(path: string, init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Faça login para continuar.");
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${data.session.access_token}`);
  headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const body: unknown = await response.json();
  return { response, body };
}
const stateLabels: Record<string, string> = {
  queued: "Iniciando…",
  running: "Em execução",
  cancelling: "Cancelando…",
  dispatch_unknown: "Requer verificação",
  needs_reconciliation: "Requer verificação",
  completed: "Concluída",
  completed_with_errors: "Concluída com pendências",
  failed: "Concluída com pendências",
  cancelled: "Cancelada",
};
export function ProspectionPanel({ searchId }: { searchId: string }) {
  const queryClient = useQueryClient();
  const [starting, setStarting] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const attempt = useRef<string | null>(null);
  const inFlight = useRef(false);
  const storageKey = `prospection-attempt:${searchId}`;
  const query = useQuery({
    queryKey: ["automation-status", searchId],
    queryFn: async () => {
      const { response, body } = await api(
        `/api/automations/status?searchId=${encodeURIComponent(searchId)}`,
      );
      if (!response.ok) throw new Error("Não foi possível consultar a prospecção.");
      return statusSchema.parse(body);
    },
    refetchInterval: (q) => (q.state.data?.blocked || starting || uncertain ? 3000 : false),
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const status = query.data;
  const run = status?.run;
  const active = Boolean(run && ACTIVE_STATES.includes(run.state));
  useEffect(() => {
    attempt.current = sessionStorage.getItem(storageKey);
    setUncertain(Boolean(attempt.current));
  }, [storageKey]);
  useEffect(() => {
    if (run) queryClient.invalidateQueries({ queryKey: ["search-details", searchId] });
  }, [run?.id, run?.state, run?.counts.sent, run?.counts.invalid, searchId, queryClient]);
  // Other tabs update immediately; no execution is ever triggered by this effect.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("scanradar-prospection");
    channel.onmessage = () => {
      queryClient.invalidateQueries({ queryKey: ["automation-status"] });
    };
    return () => channel.close();
  }, [queryClient]);
  async function start() {
    if (inFlight.current || !status?.canStart) return;
    inFlight.current = true;
    setStarting(true);
    if (!attempt.current) attempt.current = crypto.randomUUID();
    sessionStorage.setItem(storageKey, attempt.current);
    try {
      const { response, body } = await api("/api/automations/start", {
        method: "POST",
        headers: { "Idempotency-Key": attempt.current },
        body: JSON.stringify({ searchId }),
      });
      if (!response.ok) {
        if (response.status < 500) {
          sessionStorage.removeItem(storageKey);
          attempt.current = null;
          setUncertain(false);
        }
        const message =
          body && typeof body === "object" && "error" in body
            ? String(body.error)
            : "Falha ao iniciar.";
        throw new Error(message);
      }
      const next = statusSchema.parse(body);
      queryClient.setQueryData(["automation-status", searchId], next);
      sessionStorage.removeItem(storageKey);
      attempt.current = null;
      setUncertain(false);
      toast.info(
        next.run && ACTIVE_STATES.includes(next.run.state)
          ? "Solicitação registrada. Acompanhe o progresso."
          : "Estado da rodada atualizado.",
      );
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel("scanradar-prospection");
        channel.postMessage("updated");
        channel.close();
      }
    } catch (error) {
      if (attempt.current) setUncertain(true);
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível confirmar o início. Consulte o estado.",
      );
    } finally {
      inFlight.current = false;
      setStarting(false);
      queryClient.invalidateQueries({ queryKey: ["automation-status"] });
    }
  }
  // Reconciliation never resends: it only confirms sends that have real Evolution evidence.
  async function reconcile() {
    if (!run || reconciling) return;
    setReconciling(true);
    try {
      const { response, body } = await api("/api/automations/reconcile", {
        method: "POST",
        body: JSON.stringify({ searchId, automationRunId: run.id }),
      });
      const message =
        body && typeof body === "object"
          ? String(
              "error" in body
                ? body.error
                : "confirmed" in body
                  ? `${body.confirmed} de ${"reviewed" in body ? body.reviewed : "?"} contatos confirmados com evidência real.`
                  : "",
            )
          : "";
      if (!response.ok) throw new Error(message || "Não foi possível reconciliar.");
      toast.info(message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível reconciliar.");
    } finally {
      setReconciling(false);
      queryClient.invalidateQueries({ queryKey: ["automation-status"] });
    }
  }
  const label = starting
    ? "Iniciando…"
    : active
      ? run?.stale
        ? "Requer verificação"
        : stateLabels[run!.state]
      : "Executar prospecção";
  return (
    <section
      aria-label="Prospecção deste resultado"
      className="space-y-3 rounded-2xl border border-border bg-card p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Prospecção deste resultado</h2>
          <p className="text-sm text-muted-foreground">
            {status
              ? `${status.availableCount} contatos disponíveis para esta rodada`
              : "Consultando disponibilidade…"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CancelProspectionButton
            searchId={searchId}
            blocked={Boolean(status?.blocked)}
            onCancelled={() => {
              sessionStorage.removeItem(storageKey);
              attempt.current = null;
              setUncertain(false);
              queryClient.invalidateQueries({ queryKey: ["automation-status"] });
            }}
          />
          {status?.sheetUrl && (
            <Button asChild variant="outline">
              <a href={status.sheetUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-4" />
                Planilha de prospecção
              </a>
            </Button>
          )}
          <Button
            onClick={start}
            disabled={!status?.canStart || starting || query.isError || query.isLoading}
          >
            {starting || (active && run?.state === "running") ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            {uncertain && status?.canStart ? "Consultar tentativa anterior" : label}
          </Button>
        </div>
      </div>
      <div aria-live="polite" className="space-y-2 text-sm">
        {query.isError && (
          <p className="text-destructive">
            Não foi possível consultar o estado. Os envios permanecem bloqueados nesta tela.
          </p>
        )}
        {status?.reason && <p className="text-muted-foreground">{status.reason}</p>}
        {uncertain && !active && (
          <p>
            O início anterior não foi confirmado. Uma nova consulta reutiliza a mesma tentativa, sem
            duplicar a rodada.
          </p>
        )}
        {run && (
          <>
            <p className="font-medium">
              {run.stale ? "Requer verificação" : stateLabels[run.state] || run.state}
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-muted-foreground">
              <span>Enviados: {run.counts.sent}</span>
              <span>Inválidos: {run.counts.invalid}</span>
              <span>Ignorados: {run.counts.skipped}</span>
              <span>Em revisão: {run.counts.pending}</span>
              {run.counts.reserved > 0 && <span>Em processamento: {run.counts.reserved}</span>}
              {run.counts.sending > 0 && <span>Enviando agora: {run.counts.sending}</span>}
            </div>
            {run.counts.pending > 0 && (
              <Button variant="outline" size="sm" disabled={reconciling} onClick={reconcile}>
                {reconciling ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCcw className="size-4" />
                )}
                Reconciliar pendências com o n8n
              </Button>
            )}
            <p className="break-all text-xs text-muted-foreground">
              Rodada: {run.id}
              {run.executionId ? ` · Execução n8n: ${run.executionId}` : ""}
            </p>
            {(run.stale || ["dispatch_unknown", "needs_reconciliation"].includes(run.state)) && (
              <p>
                Confirme o encerramento no n8n antes de liberar outra rodada. O bloqueio é mantido
                para evitar envios duplicados.
              </p>
            )}
          </>
        )}
      </div>
      {(query.isError || uncertain || run?.stale) && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCcw className="size-4" />
          Atualizar estado
        </Button>
      )}
    </section>
  );
}
