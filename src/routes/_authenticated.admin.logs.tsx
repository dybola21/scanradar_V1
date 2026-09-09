import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { clearAllLogs } from '@/lib/logs.functions';
import { useServerFn } from '@tanstack/react-start';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Terminal, 
  Search, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  ArrowRight,
  Filter,
  Activity,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export const Route = createFileRoute('/_authenticated/admin/logs')({
  component: AdminLogsPage,
});

interface ScanLog {
  id: string;
  search_id: string;
  event_type: string;
  event_status: 'success' | 'failed' | 'warning' | 'started';
  message: string;
  payload: any;
  error_message: string | null;
  http_status: number | null;
  duration_ms: number | null;
  created_at: string;
}

function AdminLogsPage() {
  const [searchFilter, setSearchFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();
  const clearLogsFn = useServerFn(clearAllLogs);

  const { data: logs, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['admin-scan-logs', searchFilter, typeFilter],
    queryFn: async () => {
      let query = supabase
        .from('scan_logs' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (searchFilter) {
        query = query.eq('search_id', searchFilter);
      }
      if (typeFilter !== 'all') {
        query = query.eq('event_type', typeFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data as any) as ScanLog[];
    },
    refetchInterval: 5000,
  });

  useEffect(() => {
    const channel = supabase
      .channel('admin-logs-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'scan_logs' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['admin-scan-logs'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const handleClearLogs = async () => {
    if (!confirm('Tem certeza que deseja apagar todos os logs? Esta ação não pode ser desfeita.')) return;
    
    try {
      await clearLogsFn();
      
      toast.success('Logs limpos com sucesso');
      toast.success('Logs limpos com sucesso');
      refetch();
    } catch (err) {
      toast.error('Erro ao limpar logs');
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedLogs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle2 className="size-4 text-success" />;
      case 'failed': return <AlertCircle className="size-4 text-destructive" />;
      case 'warning': return <AlertCircle className="size-4 text-warning" />;
      default: return <Activity className="size-4 text-primary" />;
    }
  };

  const getEventBadge = (type: string) => {
    const labels: Record<string, string> = {
      SEARCH_CREATED: 'Busca Criada',
      SEARCH_DELETED: 'Busca Excluída',
      LEADS_DELETED: 'Leads Removidos',
      LOGS_CLEARED: 'Logs Limpos',
      SETTINGS_UPDATED: 'Ajuste Config',
      INTEGRATION_TESTED: 'Teste Conexão',
      FLOW_STARTED: 'Início Fluxo',
      START_SEARCH_ENTERED: 'Entrada Backend',
      AUTH_SUCCESS: 'Auth OK',
      AUTH_ERROR: 'Erro Auth',
      AUTH_ACTION: 'Ação Auth',
      SEARCH_INSERT_SUCCESS: 'Insert OK',
      SEARCH_INSERT_ERROR: 'Erro Insert',
      N8N_REQUEST_ATTEMPT: 'Tentativa n8n',
      N8N_REQUEST_SENT: 'Enviado n8n',
      N8N_RESPONSE_RECEIVED: 'Retorno n8n',
      N8N_TIMEOUT: 'Timeout',
      N8N_ERROR: 'Erro n8n',
      CALLBACK_RECEIVED: 'Callback',
      CALLBACK_VALIDATED: 'Auth Callback',
      RESULTS_SAVED: 'Persistência',
      FRONTEND_ERROR: 'Erro Frontend',
      SYSTEM_ERROR: 'Erro Sistema'

    };
    return <Badge variant="outline" className="font-mono text-[10px] uppercase">{labels[type] || type}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Terminal className="size-8 text-primary" />
          <PageHeader 
            title="Logs de Execução" 
            description="Monitoramento em tempo real da integração técnica"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()} 
            disabled={isRefetching}
            className="rounded-lg h-9"
          >
            <RefreshCw className={cn("size-3.5 mr-2", isRefetching && "animate-spin")} />
            Atualizar
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleClearLogs}
            className="rounded-lg h-9 text-destructive hover:bg-destructive/5 hover:text-destructive"
          >
            <Trash2 className="size-3.5 mr-2" />
            Limpar tudo
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-end bg-card p-4 rounded-xl border border-border shadow-sm">
        <div className="space-y-1.5 flex-1 min-w-[240px]">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Search className="size-3" /> Filtrar por ID da Busca
          </label>
          <input 
            type="text"
            placeholder="UUID da busca..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
          />
        </div>
        
        <div className="space-y-1.5 w-48">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Filter className="size-3" /> Tipo de Evento
          </label>
          <select 
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all appearance-none cursor-pointer"
          >
            <option value="all">Todos eventos</option>
            <option value="N8N_REQUEST_SENT">Pedidos n8n</option>
            <option value="CALLBACK_RECEIVED">Callbacks</option>
            <option value="SEARCH_CREATED">Novas Buscas</option>
            <option value="SETTINGS_UPDATED">Ajustes Config</option>
            <option value="SYSTEM_ERROR">Apenas Erros</option>

          </select>
        </div>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground animate-pulse">
            <Activity className="size-8 mb-2 animate-spin" />
            <p>Carregando trilha de execução...</p>
          </div>
        ) : logs?.length === 0 ? (
          <Card className="p-12 text-center border-dashed">
            <Terminal className="size-12 mx-auto mb-4 text-muted-foreground/20" />
            <p className="text-muted-foreground font-medium">Nenhum log encontrado para os filtros aplicados.</p>
          </Card>
        ) : (
          logs?.map((log) => (
            <div 
              key={log.id} 
              className={cn(
                "group relative bg-card rounded-xl border border-border transition-all hover:shadow-md overflow-hidden",
                log.event_status === 'failed' && "border-destructive/30 shadow-[0_0_15px_rgba(239,68,68,0.05)]"
              )}
            >
              <div 
                className="flex items-start gap-4 p-4 cursor-pointer select-none"
                onClick={() => toggleExpand(log.id)}
              >
                <div className="mt-1 shrink-0">
                  {getStatusIcon(log.event_status)}
                </div>
                
                <div className="flex-1 min-w-0 grid md:grid-cols-[1fr_auto] gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-foreground tracking-tight">
                        {log.message}
                      </span>
                      {getEventBadge(log.event_type)}
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground font-mono">
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" />
                        {format(new Date(log.created_at), "HH:mm:ss.SSS 'em' dd/MM", { locale: ptBR })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Search className="size-3" />
                        ID: {log.search_id ? `${log.search_id.slice(0, 8)}...` : 'N/A (Excluída)'}
                      </span>
                      {log.http_status && (
                        <span className={cn(
                          "px-1.5 py-0.5 rounded",
                          log.http_status >= 400 ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"
                        )}>
                          HTTP {log.http_status}
                        </span>
                      )}
                      {log.duration_ms && (
                        <span className="text-primary/70">{log.duration_ms}ms</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 md:mt-0 mt-2">
                    {expandedLogs.has(log.id) ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
                  </div>
                </div>
              </div>

              {expandedLogs.has(log.id) && (
                <div className="px-4 pb-4 space-y-4 border-t border-border/50 bg-muted/30 animate-in fade-in slide-in-from-top-1 duration-200">
                  {log.error_message && (
                    <div className="mt-4 p-3 rounded-lg bg-destructive/5 border border-destructive/20 text-xs font-mono text-destructive overflow-auto max-h-40">
                      <div className="font-bold mb-1 uppercase tracking-wider flex items-center gap-1.5">
                        <AlertCircle className="size-3" /> Error Details:
                      </div>
                      {log.error_message}
                    </div>
                  )}

                  {log.payload && (
                    <div className="mt-2 space-y-2">
                      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                        <ArrowRight className="size-3" /> Payload (Sanitized)
                      </div>
                      <pre className="p-4 rounded-lg bg-slate-950 text-[11px] text-slate-300 font-mono overflow-auto max-h-96 leading-relaxed shadow-inner border border-white/5">
                        {JSON.stringify(log.payload, null, 2)}
                      </pre>
                    </div>
                  )}

                  {!log.payload && !log.error_message && (
                    <div className="text-center py-4 text-xs text-muted-foreground italic">
                      Nenhum detalhe adicional disponível para este evento.
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
      
      <div className="flex justify-between items-center text-[10px] text-muted-foreground uppercase tracking-widest px-2">
        <span>Últimos 100 eventos</span>
        <span className="flex items-center gap-2">
          <div className="size-2 rounded-full bg-success animate-pulse" />
          Conexão Live
        </span>
      </div>
    </div>
  );
}
