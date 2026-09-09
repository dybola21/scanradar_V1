import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  isLoading,
  footer,
}: {
  label: string;
  value: number | string;
  hint?: string | undefined;
  icon: ComponentType<{ className?: string }>;
  tone?: "default" | "opportunity" | "positive";
  isLoading?: boolean;
  footer?: ReactNode;
}) {
  const toneClasses =
    tone === "opportunity"
      ? "bg-warning-soft text-warning"
      : tone === "positive"
        ? "bg-success-soft text-success"
        : "bg-secondary text-secondary-foreground";

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-xs transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm font-medium text-muted-foreground">{label}</p>
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", toneClasses)}>
          <Icon className="size-4" />
        </span>
      </div>
      <div className="mt-3">
        {isLoading ? (
          <Skeleton className="h-9 w-24" />
        ) : (
          <p className="tnum text-[32px] font-semibold leading-none tracking-tight text-foreground">
            {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
          </p>
        )}
      </div>
      {hint ? <p className="mt-2 text-xs text-muted-foreground">{hint}</p> : null}
      {footer}
    </div>
  );
}
