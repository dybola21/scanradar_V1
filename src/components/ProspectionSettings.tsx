import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getProspectionSettings, saveProspectionSettings } from "@/lib/automation.functions";
import { DEFAULT_OFFER } from "@/lib/automation-contract";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
export function ProspectionSettings() {
  const queryClient = useQueryClient();
  const getSettings = useServerFn(getProspectionSettings);
  const saveSettings = useServerFn(saveProspectionSettings);
  const query = useQuery({ queryKey: ["prospection-settings"], queryFn: () => getSettings() });
  const [url, setUrl] = useState("");
  const [headerName, setHeaderName] = useState("X-Webhook-Secret");
  const [offer, setOffer] = useState(DEFAULT_OFFER);
  useEffect(() => {
    if (query.data) {
      setHeaderName(query.data.headerName);
      setOffer(query.data.offerDescription);
    }
  }, [query.data]);
  const save = useMutation({
    mutationFn: () =>
      saveSettings({
        data: {
          webhookUrl: url.trim(),
          headerName: headerName.trim(),
          offerDescription: offer.trim(),
        },
      }),
    onSuccess: () => {
      setUrl("");
      toast.success("Prospecção configurada.");
      queryClient.invalidateQueries({ queryKey: ["prospection-settings"] });
      queryClient.invalidateQueries({ queryKey: ["automation-status"] });
    },
    onError: () =>
      toast.error("Não foi possível salvar. Confira a URL de produção e o nome do header."),
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
      className="space-y-5 rounded-2xl border border-border bg-card p-6 md:p-8"
    >
      <div>
        <h2 className="text-lg font-semibold">Prospecção por resultado</h2>
        <p className="text-sm text-muted-foreground">
          Envios iniciados pelo botão da pesquisa, usando a conexão compartilhada do WhatsApp.
        </p>
      </div>
      {query.isError && (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar a configuração. Confira se a migration de prospecção foi
          aplicada.
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor="prospection-url">URL de produção do fluxo de prospecção</Label>
        <Input
          id="prospection-url"
          type="url"
          autoComplete="off"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={
            query.data?.hasWebhook
              ? "URL salva. Preencha somente para alterar."
              : "https://seu-n8n/webhook/scanradar-prospeccao"
          }
        />
        <p className="text-xs text-muted-foreground">
          A URL é armazenada no servidor e não é exibida novamente.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="prospection-header">Nome do header de autenticação</Label>
        <Input
          id="prospection-header"
          value={headerName}
          onChange={(e) => setHeaderName(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Usa a mesma chave de segurança da integração do scraper, configurada acima.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="prospection-offer">Texto da oferta</Label>
        <Textarea
          id="prospection-offer"
          value={offer}
          onChange={(e) => setOffer(e.target.value)}
          maxLength={3000}
          rows={3}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="prospection-connection">Conexão de WhatsApp compartilhada</Label>
        <Input
          id="prospection-connection"
          value={query.data?.connectionKey || "scanradar-shared-whatsapp"}
          readOnly
        />
        <p className="text-xs text-muted-foreground">
          Identificação fixa no servidor. Todas as pesquisas compartilham o bloqueio de uma rodada
          por vez.
        </p>
      </div>
      {query.data && (!query.data.hasHeaderSecret || !query.data.hasCallbackSecret) && (
        <p className="text-sm text-muted-foreground">
          Configure também a chave de segurança e o segredo de callback na integração acima.
        </p>
      )}
      <Button
        type="submit"
        disabled={
          save.isPending ||
          query.isPending ||
          query.isError ||
          !offer.trim() ||
          !headerName.trim() ||
          (!query.data?.hasWebhook && !url.trim())
        }
      >
        {save.isPending && <Loader2 className="size-4 animate-spin" />}Salvar prospecção
      </Button>
    </form>
  );
}
