import { cn } from "@/lib/utils";
import { PRESENCE_LABEL, PRESENCE_TONE, type PresenceType } from "@/lib/lead-insights";

export function PresenceBadge({
  type,
  label,
  className,
}: {
  type: PresenceType;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium",
        PRESENCE_TONE[type],
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current opacity-70" />
      {label ?? PRESENCE_LABEL[type]}
    </span>
  );
}

function formatDataEnvio(dataEnvio?: string | null): string | null {
  if (!dataEnvio) return null;
  const d = new Date(dataEnvio);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function WhatsAppStatusBadge({
  status,
  dataEnvio,
  className,
}: {
  status?: string | null;
  dataEnvio?: string | null;
  className?: string;
}) {
  const key = status === "enviado" || status === "número inválido" ? status : "pendente";
  const meta =
    key === "enviado"
      ? { label: "Enviado", tone: "bg-success-soft text-success" }
      : key === "número inválido"
        ? { label: "Número inválido", tone: "bg-destructive-soft text-destructive" }
        : { label: "Pendente", tone: "bg-muted text-muted-foreground" };
  const formatted = formatDataEnvio(dataEnvio);
  const title =
    key === "enviado"
      ? formatted
        ? `Enviado em ${formatted}`
        : "Mensagem enviada"
      : undefined;
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium",
        meta.tone,
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current opacity-70" />
      {meta.label}
    </span>
  );
}

const STATUS_MAP: Record<string, { label: string; tone: string }> = {
  completed: { label: "Concluída", tone: "bg-success-soft text-success" },
  processing: { label: "Em execução", tone: "bg-info-soft text-info" },
  queued: { label: "Aguardando", tone: "bg-info-soft/50 text-info" },
  pending: { label: "Na fila", tone: "bg-muted text-muted-foreground" },
  failed: { label: "Falhou", tone: "bg-destructive-soft text-destructive" },
  delivery_unknown: { label: "Incerto", tone: "bg-warning-soft text-warning" },
};


export function SearchStatusBadge({ status, className }: { status?: string | null; className?: string }) {
  const key = status ?? "pending";
  const meta = STATUS_MAP[key] ?? { label: key, tone: "bg-muted text-muted-foreground" };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium",
        meta.tone,
        className,
      )}
    >
      <span
        aria-hidden
        className={cn("size-1.5 rounded-full bg-current", key === "processing" && "animate-pulse")}
      />
      {meta.label}
    </span>
  );
}
