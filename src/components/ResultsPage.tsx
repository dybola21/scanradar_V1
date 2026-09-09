import { ProspectionPanel } from "./ProspectionPanel";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSearchDetails, checkSearchStatus, deleteSearch, toggleLeadContacted } from "@/lib/scraper.functions";
import { logScanEvent } from "@/lib/logs.functions";
import { useParams, Link, useNavigate } from "@tanstack/react-router";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Download,
  ExternalLink,
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Search,
  AlertCircle,
  Copy,
  X,
  RefreshCcw,
  Loader2,
  Clock,
  AlertTriangle,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { exportToCSV, exportToExcel } from "@/lib/export-utils";
import { toast } from "sonner";
import { classifyWebsiteUrl } from "@/lib/website-utils";
import { PageHeader } from "@/components/ui-kit/PageHeader";
import { EmptyState } from "@/components/ui-kit/EmptyState";
import { PresenceBadge, SearchStatusBadge, WhatsAppStatusBadge } from "@/components/ui-kit/Badges";
import { StatCard } from "@/components/ui-kit/StatCard";
import { opportunityScore, PRESENCE_LABEL, PRESENCE_ORDER } from "@/lib/lead-insights";
import { Target, Users, Globe, HelpCircle, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export default function ResultsPage() {
  const { searchId } = useParams({ from: "/_authenticated/results/$searchId" });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fetchDetails = useServerFn(getSearchDetails);
  const checkStatusFn = useServerFn(checkSearchStatus);
  const deleteSearchFn = useServerFn(deleteSearch);
  const logEventFn = useServerFn(logScanEvent);
  const toggleContactedFn = useServerFn(toggleLeadContacted);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [presenceFilter, setPresenceFilter] = useState("all");
  const [contactedFilter, setContactedFilter] = useState("all");
  const [whatsappFilter, setWhatsappFilter] = useState("all");
  const [sortBy, setSortBy] = useState("opportunity");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isReconciling, setIsReconciling] = useState(false);


  const { data, isLoading } = useQuery({
    queryKey: ["search-details", searchId],
    queryFn: () => fetchDetails({ data: { searchId } }),
    // Only poll as fallback if terminal state not reached and realtime might have failed
    refetchInterval: (q) => {
      const status = q.state.data?.search?.status;
      return (status && !["completed", "failed"].includes(status)) ? 10000 : false;
    },
  });

  useEffect(() => {
    if (!searchId) return;

    const channel = supabase
      .channel(`search_updates_${searchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'searches',
          filter: `id=eq.${searchId}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["search-details", searchId] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leads',
          filter: `search_id=eq.${searchId}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["search-details", searchId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [searchId, queryClient]);

  const handleReconcile = async () => {
    setIsReconciling(true);
    try {
      await logEventFn({
        data: {
          searchId,
          eventType: 'SYSTEM_ERROR',
          eventStatus: 'started',
          message: 'Usuário solicitou reconciliação manual de status'
        }
      });

      const status = await checkStatusFn({ data: { searchId } });
      
      if (status?.status === 'completed' || status?.status === 'failed') {
        queryClient.invalidateQueries({ queryKey: ["search-details", searchId] });
        toast.success("Status atualizado.");
        
        await logEventFn({
          data: {
            searchId,
            eventType: 'RESULTS_SAVED',
            eventStatus: 'success',
            message: `Status reconciliado manualmente para: ${status.status}`
          }
        });
      } else {
        toast.info("A extração ainda está sendo processada pelo n8n.");
      }
    } catch (err) {
      toast.error("Erro ao verificar status.");
      await logEventFn({
        data: {
          searchId,
          eventType: 'SYSTEM_ERROR',
          eventStatus: 'failed',
          errorMessage: String(err),
          message: 'Erro durante reconciliação manual'
        }
      });
    } finally {
      setIsReconciling(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteSearchFn({ data: { searchId } });
      toast.success("Busca excluída com sucesso.");
      navigate({ to: "/history" });
    } catch (err) {
      toast.error("Erro ao excluir busca.");
      console.error(err);
    }
  };


  const search = data?.search;
  const leads = data?.leads ?? [];

  const classified = useMemo(
    () => leads.map((lead) => ({ ...lead, classification: classifyWebsiteUrl(lead.website) })),
    [leads],
  );

  const stats = useMemo(() => {
    const total = classified.length;
    return {
      total,
      noOwn: classified.filter((l) => l.classification.hasOwnWebsite === false).length,
      withOwn: classified.filter((l) => l.classification.hasOwnWebsite === true).length,
      indeterminate: classified.filter((l) => l.classification.hasOwnWebsite === null).length,
      sent: classified.filter((l) => l.status === "enviado").length,
    };
  }, [classified]);

  // Opções reais do filtro: apenas os status presentes nos leads desta busca.
  const presenceOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const lead of classified) {
      counts.set(lead.classification.type, (counts.get(lead.classification.type) ?? 0) + 1);
    }
    return PRESENCE_ORDER.filter((type) => (counts.get(type) ?? 0) > 0).map((type) => ({
      type,
      label: PRESENCE_LABEL[type],
      count: counts.get(type) ?? 0,
    }));
  }, [classified]);

  // Se o filtro selecionado não existe mais nos resultados, volta para "all".
  useEffect(() => {
    if (presenceFilter === "all") return;
    if (presenceFilter === "no_own_site" && stats.noOwn > 0) return;
    if (presenceFilter === "with_own_site" && stats.withOwn > 0) return;
    if (presenceOptions.some((o) => o.type === presenceFilter)) return;
    setPresenceFilter("all");
  }, [presenceFilter, presenceOptions, stats.noOwn, stats.withOwn]);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    const rows = classified.filter((lead) => {
      const matchesText =
        !text ||
        (lead.nome ?? "").toLowerCase().includes(text) ||
        (lead.cidade ?? "").toLowerCase().includes(text) ||
        (lead.telefone ?? "").toLowerCase().includes(text);
      const matchesPresence =
        presenceFilter === "all" ||
        (presenceFilter === "no_own_site" && lead.classification.hasOwnWebsite === false) ||
        (presenceFilter === "with_own_site" && lead.classification.hasOwnWebsite === true) ||
        lead.classification.type === presenceFilter;
      const matchesContacted =
        contactedFilter === "all" ||
        (contactedFilter === "contacted" && Boolean(lead.contacted)) ||
        (contactedFilter === "not_contacted" && !lead.contacted);
      const leadStatus =
        lead.status === "enviado" || lead.status === "número inválido" ? lead.status : "pendente";
      const matchesWhatsapp = whatsappFilter === "all" || leadStatus === whatsappFilter;
      return matchesText && matchesPresence && matchesContacted && matchesWhatsapp;
    });

    return rows.sort((a, b) => {
      if (sortBy === "opportunity") {
        return opportunityScore(a.classification.type) - opportunityScore(b.classification.type);
      }
      if (sortBy === "name") return (a.nome ?? "").localeCompare(b.nome ?? "");
      if (sortBy === "contact") {
        const score = (l: typeof a) => (l.telefone ? 2 : 0) + (l.email || l.email2 ? 1 : 0);
        return score(b) - score(a);
      }
      return 0;
    });
  }, [classified, presenceFilter, contactedFilter, whatsappFilter, sortBy, query]);

  const selectedLeads = filtered.filter((lead) => selected.has(lead.id));
  const allVisibleSelected = filtered.length > 0 && filtered.every((lead) => selected.has(lead.id));

  const toggleAll = () => {
    setSelected((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        filtered.forEach((lead) => next.delete(lead.id));
        return next;
      }
      return new Set([...prev, ...filtered.map((lead) => lead.id)]);
    });
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportRows = selectedLeads.length ? selectedLeads : filtered;
  const fileBase = search ? `leads-${search.termo}-${search.cidade}` : "leads";

  const handleExportCSV = () => {
    if (!exportRows.length) return;
    exportToCSV(exportRows, `${fileBase}.csv`);
    toast.success(`${exportRows.length} leads exportados em CSV.`);
  };

  const handleExportExcel = () => {
    if (!exportRows.length) return;
    exportToExcel(exportRows, `${fileBase}.xlsx`);
    toast.success(`${exportRows.length} leads exportados em Excel.`);
  };

  const copyContacts = async () => {
    const rows = selectedLeads.length ? selectedLeads : filtered;
    const segmento = search?.termo ?? "";
    const headers = ["Nome", "Telefone", "Email", "Cidade", "Segmento"];
    const separator = ["---", "---", "---", "---", "---"];
    const lines = rows.map((l) => {
      const cidade = l.cidade || search?.cidade || "";
      const uf = l.uf || search?.uf || "";
      const cidadeUf = cidade && uf ? `${cidade} - ${uf}` : cidade || uf;
      return [l.nome ?? "", l.telefone ?? "", l.email || l.email2 || "", cidadeUf, segmento]
        .map((c) => String(c).replace(/\|/g, "\\|"))
        .join(" | ");
    });
    const table = [headers.join(" | "), separator.join(" | "), ...lines].join("\n");
    await navigator.clipboard.writeText(table);
    toast.success(`${rows.length} contatos copiados.`);
  };

  const handleToggleContacted = async (leadId: string, current: boolean) => {
    const next = !current;
    setTogglingId(leadId);
    // Otimista: atualiza o cache imediatamente
    queryClient.setQueryData(["search-details", searchId], (old: any) => {
      if (!old) return old;
      return {
        ...old,
        leads: old.leads.map((l: any) => (l.id === leadId ? { ...l, contacted: next } : l)),
      };
    });
    try {
      await toggleContactedFn({ data: { leadId, contacted: next } });
      toast.success(next ? "Marcado como contatado." : "Marcado como não contatado.");
    } catch (err) {
      // Reverte em caso de erro
      queryClient.setQueryData(["search-details", searchId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          leads: old.leads.map((l: any) => (l.id === leadId ? { ...l, contacted: current } : l)),
        };
      });
      toast.error("Erro ao atualizar status de contato.");
      console.error(err);
    } finally {
      setTogglingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72 rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    );
  }

  if (!search) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Busca não encontrada"
        description="Ela pode ter sido removida ou pertence a outra conta."
        action={
          <Button asChild className="min-h-11 rounded-xl">
            <Link to="/history">Voltar ao histórico</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      {search.status === "processing" && (
        <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 animate-pulse">
          <Clock className="size-5 text-primary" />
          <div className="flex-1">
            <p className="text-sm font-medium text-primary">Extração em andamento...</p>
            <p className="text-xs text-primary/70">Os leads aparecerão aqui automaticamente conforme forem detectados.</p>
          </div>
        </div>
      )}

      {search.status === "delivery_unknown" && (
        <div className="flex items-center gap-3 rounded-xl border border-warning/20 bg-warning/5 p-4">
          <AlertTriangle className="size-5 text-warning" />
          <div className="flex-1">
            <p className="text-sm font-medium text-warning">Status de entrega desconhecido</p>
            <p className="text-xs text-warning/70">O n8n não confirmou o recebimento da busca. Clique em "Verificar processamento" para reconciliar.</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button asChild variant="outline" size="icon" className="size-10 shrink-0 rounded-xl" aria-label="Voltar ao histórico">
          <Link to="/history">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <PageHeader
          className="min-w-0 flex-1"
          eyebrow={`${search.cidade} · ${search.uf} · ${new Date(search.created_at).toLocaleDateString("pt-BR")}`}
          title={search.termo}
          actions={
            <>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="min-h-11 rounded-xl text-destructive hover:bg-destructive/5 hover:text-destructive">
                    <Trash2 className="size-4" />
                    Excluir
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação excluirá permanentemente todos os leads e logs técnicos associados a esta busca. Esta ação não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <SearchStatusBadge status={search.status} />
              {search.status === "delivery_unknown" && (
                <Button 
                  variant="outline" 
                  className="min-h-11 rounded-xl border-warning/50 text-warning" 
                  onClick={handleReconcile}
                  disabled={isReconciling}
                >
                  {isReconciling ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCcw className="mr-2 size-4" />}
                  Verificar processamento
                </Button>
              )}
              <Button variant="outline" className="min-h-11 rounded-xl" onClick={handleExportCSV} disabled={!exportRows.length}>
                <Download className="size-4" />
                CSV
              </Button>
              <Button variant="outline" className="min-h-11 rounded-xl" onClick={handleExportExcel} disabled={!exportRows.length}>
                <Download className="size-4" />
                Excel
              </Button>
              {search.sheet_url ? (
                <Button asChild className="min-h-11 rounded-xl">
                  <a href={search.sheet_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-4" />
                    Planilha
                  </a>
                </Button>
              ) : null}

            </>
          }
        />
      </div>

      <ProspectionPanel key={searchId} searchId={searchId} />

      <section aria-label="Resumo do resultado" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Leads extraídos" value={stats.total} icon={Users} />
        <StatCard
          label="Sem site próprio"
          value={stats.noOwn}
          hint={stats.total ? `${Math.round((stats.noOwn / stats.total) * 100)}% da lista` : undefined}
          icon={Target}
          tone="opportunity"
        />
        <StatCard label="Com site próprio" value={stats.withOwn} icon={Globe} tone="positive" />
        <StatCard label="Inconclusivos" value={stats.indeterminate} icon={HelpCircle} />
        <StatCard
          label="Mensagens enviadas"
          value={stats.sent}
          hint={stats.total ? `${Math.round((stats.sent / stats.total) * 100)}% da lista` : undefined}
          icon={MessageCircle}
          tone="positive"
        />
      </section>

      <div className="grid gap-3 lg:flex lg:items-center lg:justify-between">
        <div className="relative min-w-0 lg:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar empresa, cidade ou telefone"
            aria-label="Buscar leads"
            className="h-11 rounded-xl pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="min-w-0 space-y-1">
            <label htmlFor="contacted-filter" className="text-xs font-medium text-muted-foreground">
              Contato
            </label>
            <Select value={contactedFilter} onValueChange={setContactedFilter}>
              <SelectTrigger id="contacted-filter" className="h-11 w-48 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="not_contacted">Não contatados</SelectItem>
                <SelectItem value="contacted">Já contatados</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-1">
            <label htmlFor="whatsapp-filter" className="text-xs font-medium text-muted-foreground">
              Status WhatsApp
            </label>
            <Select value={whatsappFilter} onValueChange={setWhatsappFilter}>
              <SelectTrigger id="whatsapp-filter" className="h-11 w-48 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="enviado">Enviado</SelectItem>
                <SelectItem value="número inválido">Número inválido</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-1">
            <label htmlFor="presence-filter" className="text-xs font-medium text-muted-foreground">
              Presença digital
            </label>
            <Select value={presenceFilter} onValueChange={setPresenceFilter}>
              <SelectTrigger id="presence-filter" className="h-11 w-56 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">Todos os leads</SelectItem>
                {stats.noOwn > 0 && (
                  <SelectItem value="no_own_site">Sem site próprio ({stats.noOwn})</SelectItem>
                )}
                {stats.withOwn > 0 && (
                  <SelectItem value="with_own_site">Com site próprio ({stats.withOwn})</SelectItem>
                )}
                {presenceOptions.map((option) => (
                  <SelectItem key={option.type} value={option.type}>
                    {option.label} ({option.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-1">
            <label htmlFor="sort-by" className="text-xs font-medium text-muted-foreground">
              Ordenar por
            </label>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger id="sort-by" className="h-11 w-52 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="opportunity">Potencial comercial</SelectItem>
                <SelectItem value="contact">Contatos disponíveis</SelectItem>
                <SelectItem value="name">Nome da empresa</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {selected.size > 0 ? (
        <div className="sticky top-2 z-20 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-md">
          <p className="min-w-0 truncate text-sm font-medium">{selected.size} leads selecionados</p>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button variant="outline" size="sm" className="min-h-9 rounded-lg" onClick={copyContacts}>
              <Copy className="size-3.5" />
              Copiar contatos
            </Button>
            <Button variant="outline" size="sm" className="min-h-9 rounded-lg" onClick={handleExportCSV}>
              <Download className="size-3.5" />
              Exportar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="min-h-9 rounded-lg"
              onClick={() => setSelected(new Set())}
            >
              <X className="size-3.5" />
              Limpar
            </Button>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Nenhum lead com esses filtros"
            description="Ajuste a busca textual ou o filtro de presença digital."
            action={
              <Button
                variant="outline"
                className="min-h-11 rounded-xl"
                onClick={() => {
                  setQuery("");
                  setPresenceFilter("all");
                  setWhatsappFilter("all");
                }}
              >
                Limpar filtros
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10 px-4">
                    <Checkbox
                      checked={allVisibleSelected}
                      onCheckedChange={toggleAll}
                      aria-label="Selecionar todos os leads visíveis"
                    />
                  </TableHead>
                  <TableHead className="px-4 text-xs font-medium text-muted-foreground">Empresa</TableHead>
                  <TableHead className="px-4 text-xs font-medium text-muted-foreground">Contato</TableHead>
                  <TableHead className="px-4 text-xs font-medium text-muted-foreground">Presença digital</TableHead>
                  <TableHead className="px-4 text-xs font-medium text-muted-foreground">Status WhatsApp</TableHead>
                  <TableHead className="px-4 text-right text-xs font-medium text-muted-foreground">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((lead) => (
                  <TableRow
                    key={lead.id}
                    className={cn(
                      selected.has(lead.id) && "bg-secondary/60",
                      lead.contacted && "bg-success-soft/40",
                    )}
                  >
                    <TableCell className="px-4 py-3">
                      <Checkbox
                        checked={selected.has(lead.id)}
                        onCheckedChange={() => toggleOne(lead.id)}
                        aria-label={`Selecionar ${lead.nome ?? "lead"}`}
                      />
                    </TableCell>
                    <TableCell className="max-w-[260px] px-4 py-3">
                      <div className="flex items-center gap-2">
                        {lead.contacted && (
                          <span
                            title="Já contatado"
                            className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground"
                          >
                            <CheckCircle2 className="size-3.5" />
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{lead.nome ?? "Sem nome"}</p>
                          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                            <MapPin className="size-3 shrink-0" />
                            {lead.endereco || [lead.bairro, lead.cidade, lead.uf].filter(Boolean).join(", ") || "—"}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[240px] px-4 py-3">
                      <div className="space-y-0.5 text-sm">
                        {lead.telefone ? (
                          <a
                            href={`tel:${lead.telefone.replace(/\D/g, "")}`}
                            className="flex items-center gap-1.5 text-foreground hover:underline"
                          >
                            <Phone className="size-3.5 shrink-0 text-muted-foreground" />
                            {lead.telefone}
                          </a>
                        ) : null}
                        {lead.email || lead.email2 ? (
                          <a
                            href={`mailto:${lead.email || lead.email2}`}
                            className="flex items-center gap-1.5 truncate text-xs text-muted-foreground hover:underline"
                          >
                            <Mail className="size-3.5 shrink-0" />
                            <span className="truncate">{lead.email || lead.email2}</span>
                          </a>
                        ) : null}
                        {!lead.telefone && !lead.email && !lead.email2 ? (
                          <span className="text-xs text-muted-foreground">Sem contato</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <PresenceBadge type={lead.classification.type} label={lead.classification.label} />
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <WhatsAppStatusBadge status={lead.status} dataEnvio={lead.data_envio} />
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleToggleContacted(lead.id, Boolean(lead.contacted))}
                          disabled={togglingId === lead.id}
                          aria-label={lead.contacted ? "Desmarcar como contatado" : "Marcar como contatado"}
                          title={lead.contacted ? "Já contatado (clique para desmarcar)" : "Marcar como contatado"}
                          className={cn(
                            "size-9 rounded-lg",
                            lead.contacted
                              ? "bg-success text-success-foreground hover:bg-success/90"
                              : "text-muted-foreground hover:bg-success-soft hover:text-success",
                          )}
                        >
                          {togglingId === lead.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="size-4" />
                          )}
                        </Button>
                        {lead.telefone ? (
                          lead.status === "enviado" ? (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="secondary" size="sm" className="min-h-9 rounded-lg">
                                  Já contatado
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Lead já contatado</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Este lead já foi contatado
                                    {lead.data_envio
                                      ? ` em ${new Date(lead.data_envio).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`
                                      : ""}
                                    . Deseja abrir o WhatsApp mesmo assim?
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() =>
                                      window.open(
                                        `https://wa.me/55${lead.telefone!.replace(/\D/g, "")}`,
                                        "_blank",
                                        "noopener,noreferrer",
                                      )
                                    }
                                  >
                                    Abrir WhatsApp
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          ) : (
                            <Button asChild variant="outline" size="sm" className="min-h-9 rounded-lg">
                              <a
                                href={`https://wa.me/55${lead.telefone.replace(/\D/g, "")}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                WhatsApp
                              </a>
                            </Button>
                          )
                        ) : null}
                        {lead.classification.normalizedUrl ? (
                          <Button
                            asChild
                            variant="ghost"
                            size="icon"
                            className="size-9 rounded-lg"
                            aria-label={`Abrir link de ${lead.nome ?? "lead"}`}
                          >
                            <a href={lead.classification.normalizedUrl} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="size-4" />
                            </a>
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Mostrando {filtered.length} de {stats.total} leads.
      </p>
    </div>
  );
}
