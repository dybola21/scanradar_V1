import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSearchHistory, deleteSearch } from "@/lib/scraper.functions";
import { Link } from "@tanstack/react-router";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Search, History, Trash2, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui-kit/PageHeader";
import { EmptyState } from "@/components/ui-kit/EmptyState";
import { SearchStatusBadge } from "@/components/ui-kit/Badges";
import { cn } from "@/lib/utils";

const STATUS_FILTERS = [
  { value: "all", label: "Todas" },
  { value: "completed", label: "Concluídas" },
  { value: "processing", label: "Em execução" },
  { value: "failed", label: "Falhas" },
] as const;

const PAGE_SIZE = 10;

export default function HistoryPage() {
  const queryClient = useQueryClient();
  const fetchHistory = useServerFn(getSearchHistory);
  const deleteFn = useServerFn(deleteSearch);

  const { data: searches, isLoading } = useQuery({
    queryKey: ["search-history"],
    queryFn: () => fetchHistory(),
  });

  const [term, setTerm] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; termo: string } | null>(null);

  const removeMutation = useMutation({
    mutationFn: (searchId: string) => deleteFn({ data: { searchId } }),
    onSuccess: () => {
      toast.success("Busca removida.");
      queryClient.invalidateQueries({ queryKey: ["search-history"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => setPendingDelete(null),
  });

  const filtered = useMemo(() => {
    const query = term.trim().toLowerCase();
    return (searches ?? []).filter((s) => {
      const matchesText =
        !query || s.termo.toLowerCase().includes(query) || s.cidade.toLowerCase().includes(query);
      const matchesStatus = status === "all" || s.status === status;
      return matchesText && matchesStatus;
    });
  }, [searches, term, status]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Histórico"
        title="Buscas realizadas"
        description="Consulte, reabra ou remova extrações anteriores."
        actions={
          <Button asChild className="min-h-11 rounded-xl px-5">
            <Link to="/search">
              <Search className="size-4" />
              Nova busca
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:flex sm:items-center sm:justify-between">
        <div className="relative min-w-0 sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              setPage(0);
            }}
            placeholder="Buscar por nicho ou cidade"
            aria-label="Buscar no histórico"
            className="h-11 rounded-xl pl-9"
          />
        </div>
        <div role="group" aria-label="Filtrar por status" className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => {
                setStatus(filter.value);
                setPage(0);
              }}
              aria-pressed={status === filter.value}
              className={cn(
                "min-h-9 rounded-lg px-3 text-xs font-medium transition-colors",
                status === filter.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {isLoading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={History}
            title={searches?.length ? "Nenhum resultado para os filtros" : "Nenhuma busca registrada"}
            description={
              searches?.length
                ? "Ajuste o texto ou o status selecionado."
                : "Inicie sua primeira extração para preencher o histórico."
            }
            action={
              searches?.length ? (
                <Button
                  variant="outline"
                  className="min-h-11 rounded-xl"
                  onClick={() => {
                    setTerm("");
                    setStatus("all");
                  }}
                >
                  Limpar filtros
                </Button>
              ) : (
                <Button asChild className="min-h-11 rounded-xl">
                  <Link to="/search">Nova busca</Link>
                </Button>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-10 px-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nicho</TableHead>
                  <TableHead className="h-10 px-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Localização</TableHead>
                  <TableHead className="h-10 px-5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Leads</TableHead>
                  <TableHead className="h-10 px-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Data</TableHead>
                  <TableHead className="h-10 px-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                  <TableHead className="h-10 px-5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((search) => (
                  <TableRow key={search.id} className="group">
                    <TableCell className="max-w-[220px] px-5 py-3">
                      <p className="truncate text-sm font-medium capitalize text-foreground">{search.termo}</p>
                    </TableCell>
                    <TableCell className="px-5 py-3 text-sm text-muted-foreground">
                      {search.cidade} · {search.uf}
                    </TableCell>
                    <TableCell className="tnum px-5 py-3 text-right text-sm font-medium">
                      {search.total_leads ?? 0}
                    </TableCell>
                    <TableCell className="px-5 py-3 text-sm text-muted-foreground">
                      {new Date(search.created_at).toLocaleDateString("pt-BR")}{" "}
                      <span className="text-xs">
                        {new Date(search.created_at).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </TableCell>
                    <TableCell className="px-5 py-3">
                      <SearchStatusBadge status={search.status} />
                    </TableCell>
                    <TableCell className="px-5 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Excluir busca ${search.termo}`}
                          onClick={() => setPendingDelete({ id: search.id, termo: search.termo })}
                          className="size-9 rounded-lg text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                        <Button asChild variant="outline" size="sm" className="min-h-9 rounded-lg">
                          <Link to="/results/$searchId" params={{ searchId: search.id }}>
                            Resultados
                            <ArrowRight className="size-3.5" />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {filtered.length > PAGE_SIZE ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Página {currentPage + 1} de {pageCount} · {filtered.length} buscas
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              className="size-10 rounded-xl"
              aria-label="Página anterior"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-10 rounded-xl"
              aria-label="Próxima página"
              disabled={currentPage >= pageCount - 1}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent className="max-w-[400px] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl">Excluir esta busca?</AlertDialogTitle>
            <AlertDialogDescription className="text-[15px]">
              A busca “{pendingDelete?.termo}” e todos os leads associados serão removidos permanentemente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11 rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => pendingDelete && removeMutation.mutate(pendingDelete.id)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
