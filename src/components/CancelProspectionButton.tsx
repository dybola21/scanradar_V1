import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cancelContextSchema, type CancelRun } from "@/lib/automation-cancel-contract";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, OctagonX } from "lucide-react";
import { toast } from "sonner";

async function call(path: string, init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Faça login para continuar.");
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session.access_token}`,
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Não foi possível concluir o cancelamento.");
  return body;
}

export function CancelProspectionButton({
  searchId,
  blocked,
  onCancelled,
}: {
  searchId: string;
  blocked: boolean;
  onCancelled: () => void;
}) {
  const queryClient = useQueryClient();
  const [snapshot, setSnapshot] = useState<CancelRun | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const context = useQuery({
    queryKey: ["automation-cancel", searchId],
    enabled: blocked,
    queryFn: async () =>
      cancelContextSchema.parse(
        await call(`/api/automations/cancel?searchId=${encodeURIComponent(searchId)}`),
      ),
    refetchInterval: blocked ? 5000 : false,
    retry: 1,
  });

  async function open() {
    const fresh = await context.refetch();
    if (!fresh.data?.canCancel || !fresh.data.run || fresh.isError) return;
    setSnapshot(fresh.data.run);
    setReason("");
    setError("");
  }
  async function cancel() {
    if (!snapshot || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await call("/api/automations/cancel", {
        method: "POST",
        body: JSON.stringify({
          searchId,
          automationRunId: snapshot.id,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        }),
      });
      if (result.success !== true) throw new Error("Cancelamento não confirmado.");
      setSnapshot(null);
      onCancelled();
      if (result.verified === false)
        toast.warning(
          result.stopSupported === false
            ? "Pedido de parada registrado. A execução para no próximo passo do fluxo; a rodada segue em verificação."
            : "Cancelamento registrado, mas o encerramento não foi confirmado. A rodada permanece em verificação.",
        );
      else
        toast.success(
          result.alreadyFinished
            ? "A rodada já estava encerrada. Estado atualizado."
            : "Rodada cancelada e execução encerrada.",
        );
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel("scanradar-prospection");
        channel.postMessage("cancelled");
        channel.close();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível confirmar o cancelamento.");
    } finally {
      pending.current = false;
      setBusy(false);
      queryClient.invalidateQueries({ queryKey: ["automation-status"] });
      queryClient.invalidateQueries({ queryKey: ["automation-cancel"] });
    }
  }

  if (!blocked && !snapshot) return null;
  return (
    <>
      {blocked && context.data?.canCancel && (
        <Button variant="outline" onClick={open} disabled={context.isFetching || busy}>
          <OctagonX className="size-4" />
          Cancelar rodada
        </Button>
      )}
      {blocked && context.isError && (
        <Button variant="outline" onClick={() => context.refetch()}>
          Recarregar opção de cancelamento
        </Button>
      )}
      <Dialog
        open={Boolean(snapshot)}
        onOpenChange={(value) => {
          if (!value && !busy) setSnapshot(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cancelar esta rodada</DialogTitle>
            <DialogDescription>
              O aplicativo pede a parada da execução no n8n e interrompe novos envios. Envios já
              confirmados continuam registrados.
            </DialogDescription>
          </DialogHeader>
          <p className="break-all text-sm">
            Rodada: {snapshot?.id}
            <br />
            Execução n8n: {snapshot?.executionId || "Sem confirmação de início"}
          </p>
          <div className="space-y-2">
            <Label htmlFor="cancel-reason">Motivo (opcional)</Label>
            <Textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={busy}
              maxLength={1000}
              placeholder="Ex.: lista errada, quero refazer a seleção."
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Contatos que estavam em envio ficam em revisão até haver confirmação real. Se o n8n não
            confirmar o encerramento, a rodada permanece bloqueada em verificação.
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setSnapshot(null)}>
              Voltar
            </Button>
            <Button variant="destructive" onClick={cancel} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}Confirmar cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
