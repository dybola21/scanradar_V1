import { MessageTestSettings } from "./MessageTestSettings";
import { ProspectionSettings } from "./ProspectionSettings";
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getIntegrationSettings, updateIntegrationSettings, testIntegration } from "@/lib/scraper.functions";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Loader2, Activity, Copy, Check, ShieldCheck, Info } from "lucide-react";
import { PageHeader } from "@/components/ui-kit/PageHeader";
import { cn } from "@/lib/utils";

export default function Settings() {
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getIntegrationSettings);
  const updateSettingsFn = useServerFn(updateIntegrationSettings);
  const testFn = useServerFn(testIntegration);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["n8n-settings"],
    queryFn: () => fetchSettings(),
  });

  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [callbackSecret, setCallbackSecret] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedCallback, setCopiedCallback] = useState(false);

  useEffect(() => {
    if (settings) {
      setWebhookUrl(settings.webhook_url);
      setWebhookSecret("");
    }
  }, [settings]);


  const updateMutation = useMutation({
    mutationFn: (data: { 
      webhook_url: string; 
      webhook_secret?: string | null; 
      integration_name: string;
      rotate_callback_secret?: boolean;
    }) => updateSettingsFn({ data }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["n8n-settings"] });
      queryClient.invalidateQueries({ queryKey: ["integration-status"] });
      toast.success("Configurações salvas.");
      if (result.callbackSecret) {
        setCallbackSecret(result.callbackSecret);
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });


  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      webhook_url: webhookUrl.trim(),
      webhook_secret: webhookSecret || null,
      integration_name: settings?.integration_name || "n8n integration",
    });
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const result = await testFn();
      if (result.success) {
        toast.success("Integração testada com sucesso.");
        queryClient.invalidateQueries({ queryKey: ["n8n-settings"] });
        queryClient.invalidateQueries({ queryKey: ["integration-status"] });
      } else {
        toast.error(result.error ?? "Falha no teste de conexão.");
      }
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setIsTesting(false);
    }
  };

  const copyUrl = async () => {
    if (!webhookUrl) return;
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast.success("URL copiada.");
    setTimeout(() => setCopied(false), 2000);
  };

  const copyCallback = async () => {
    if (!callbackSecret) return;
    await navigator.clipboard.writeText(callbackSecret);
    setCopiedCallback(true);
    toast.success("Segredo copiado.");
    setTimeout(() => setCopiedCallback(false), 2000);
  };

  if (isLoading) {

    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Skeleton className="h-10 w-64 rounded-xl" />
        <Skeleton className="h-[400px] rounded-2xl" />
      </div>
    );
  }

  const connected = Boolean(settings?.is_connected);
  const configured = Boolean(settings?.webhook_url);
  const hasChanges = webhookUrl !== (settings?.webhook_url || "") || webhookSecret.length > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Configurações de Integração"
        description="Conecte sua instância do n8n para realizar as buscas de leads."
      />

      <div
        className={cn(
          "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 rounded-2xl border p-5 shadow-sm transition-colors",
          !configured
            ? "border-border bg-card"
            : connected
              ? "border-success/20 bg-success-soft/30"
              : "border-warning/20 bg-warning-soft/30",
        )}
      >
        <div
          className={cn(
            "grid size-12 shrink-0 place-items-center rounded-xl",
            !configured 
              ? "bg-secondary text-muted-foreground" 
              : connected 
                ? "bg-success/10 text-success" 
                : "bg-warning/10 text-warning",
          )}
        >
          <Activity className="size-6" />
        </div>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-foreground">
            {!configured ? "Webhook não configurado" : connected ? "Integração conectada" : "Aguardando teste de conexão"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {!configured
              ? "Preencha os campos abaixo para habilitar o sistema."
              : connected
                ? "A engine está pronta para processar novas buscas."
                : "A URL foi salva, mas ainda não validamos a conexão."}
          </p>
        </div>
        <Button
          variant="outline"
          className="h-11 shrink-0 rounded-xl px-4"
          onClick={handleTest}
          disabled={isTesting || !configured}
        >
          {isTesting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Activity className="mr-2 size-4" />}
          Testar
        </Button>
      </div>

      <form onSubmit={handleSave} className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
        <div className="space-y-2.5">
          <Label htmlFor="webhook-url" className="text-sm font-semibold text-foreground">
            URL do Webhook (POST)
          </Label>
          <div className="flex gap-2">
            <Input
              id="webhook-url"
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://n8n.seudominio.com/webhook/scanradar"
              className="h-12 min-w-0 flex-1 rounded-xl"
              required
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={copyUrl}
              className="size-12 shrink-0 rounded-xl"
              aria-label="Copiar URL"
              disabled={!webhookUrl}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </Button>
          </div>
          <p className="text-[12px] text-muted-foreground">
            Esta URL será chamada via POST sempre que uma nova busca for iniciada.
          </p>
        </div>

        <div className="space-y-2.5">
          <Label htmlFor="webhook-secret" className="text-sm font-semibold text-foreground">
            Chave de Segurança (X-Webhook-Secret)
          </Label>
          <Input
            id="webhook-secret"
            type="password"
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
            placeholder={settings?.has_secret ? "•••••••••••••••• (Preencha para alterar)" : "Digite a chave de segurança"}
            className="h-12 rounded-xl"
          />
          <div className="flex items-start gap-2 rounded-lg bg-secondary/50 p-3 text-[12px] text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>Recomendamos o uso de uma chave complexa para evitar execuções não autorizadas no seu n8n.</span>
          </div>
        </div>

        <div className="space-y-4 border-t border-border pt-6">
          <div className="space-y-2.5">
            <Label className="text-sm font-semibold text-foreground">
              Segredo de Callback (X-Callback-Secret)
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={callbackSecret ? "text" : "password"}
                  readOnly
                  value={callbackSecret || (settings?.has_callback_secret ? "••••••••••••••••" : "Nenhum segredo gerado")}
                  className="h-12 rounded-xl pr-10"
                />
                {callbackSecret && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={copyCallback}
                    className="absolute right-1 top-1 size-10 rounded-lg"
                  >
                    {copiedCallback ? <Check className="size-4" /> : <Copy className="size-4" />}
                  </Button>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-12 rounded-xl"
                onClick={() => updateMutation.mutate({
                  webhook_url: webhookUrl,
                  integration_name: settings?.integration_name || "n8n integration",
                  rotate_callback_secret: true
                })}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                {settings?.has_callback_secret ? "Rotacionar" : "Gerar Segredo"}
              </Button>
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-primary/5 p-3 text-[12px] text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <div className="space-y-1">
                <p>Este segredo deve ser configurado no header <strong>X-Callback-Secret</strong> do seu callback no n8n.</p>
                {callbackSecret && (
                  <p className="font-semibold text-primary">Copie agora! Por segurança, este segredo não será exibido novamente.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 text-success" />
            Criptografia AES-256 no armazenamento.
          </div>
          <div className="flex gap-3">
            <Button
              type="submit"
              className="h-11 rounded-xl px-8 font-semibold shadow-sm"
              disabled={updateMutation.isPending || !webhookUrl || !hasChanges}
            >
              {updateMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Salvar Configurações
            </Button>
          </div>
        </div>
      </form>
      <ProspectionSettings />
      <MessageTestSettings />
    </div>
  );
}
