import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ACTIVE_STATES } from '@/lib/automation-contract';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { toast } from 'sonner';

type Attempt={phone:string;business_name:string;state:string;message_text:string|null;message_id:string|null};
type Run={id:string;state:string;n8n_execution_id:string|null;created_at:string;idempotency_key:string;message_test_attempts:Attempt|Attempt[]|null};
type Status={settings:{enabled:boolean;phone:string;business_name:string;city:string}|null;runs:Run[];blocked:boolean};
const labels:Record<string,string>={queued:'Iniciando…',running:'Em execução',cancelling:'Cancelando…',dispatch_unknown:'Requer verificação',needs_reconciliation:'Requer verificação',completed:'Concluído',completed_with_errors:'Concluído com pendências',failed:'Falhou',cancelled:'Cancelado'};
async function api(path:string,init?:RequestInit) {
 const {data}=await supabase.auth.getSession();
 if(!data.session) throw new Error('Faça login para continuar.');
 const headers=new Headers(init?.headers);
 headers.set('Authorization',`Bearer ${data.session.access_token}`);headers.set('Content-Type','application/json');
 const response=await fetch(`/api/message-tests${path}`,{...init,headers,cache:'no-store'});
 const body=await response.json();
 if(!response.ok) throw Object.assign(new Error(body.error||body.reason||'Não foi possível concluir. Consulte o estado antes de tentar novamente.'),{status:response.status});
 return body;
}
export function MessageTestSettings() {
 const [enabled,setEnabled]=useState(false),[phone,setPhone]=useState(''),[name,setName]=useState('Empresa de teste'),[city,setCity]=useState('Rio de Janeiro');
 const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[confirm,setConfirm]=useState(false);
 const flight=useRef(false), key=useRef<string|null>(null), storage=useRef('');
 const query=useQuery<Status>({queryKey:['message-tests'],queryFn:()=>api(''),refetchInterval:q=>q.state.data?.blocked||busy||uncertain?3000:false,refetchOnWindowFocus:true});
 useEffect(()=>{let mounted=true;void supabase.auth.getSession().then(({data})=>{if(!mounted||!data.session)return;storage.current=`scanradar-test:${data.session.user.id}`;key.current=localStorage.getItem(storage.current);setUncertain(Boolean(key.current));});return()=>{mounted=false;};},[]);
 useEffect(()=>{const s=query.data?.settings;if(s){setEnabled(s.enabled);setPhone(s.phone);setName(s.business_name);setCity(s.city);}},[query.data?.settings?.enabled,query.data?.settings?.phone,query.data?.settings?.business_name,query.data?.settings?.city]);
 useEffect(()=>{if(key.current&&query.data?.runs.some(r=>r.idempotency_key===key.current)){localStorage.removeItem(storage.current);key.current=null;setUncertain(false);}},[query.data]);
 const s=query.data?.settings;
 const dirty=enabled!==Boolean(s?.enabled)||phone.replace(/\D/g,'')!==(s?.phone||'')||name!==(s?.business_name||'Empresa de teste')||city!==(s?.city||'Rio de Janeiro');
 const active=query.data?.runs.some(r=>ACTIVE_STATES.includes(r.state));
 async function action(path:string,body:unknown,method='POST'){
  if(flight.current)return;flight.current=true;setBusy(true);
  try{const r=await api(path,{method,body:JSON.stringify(body)});toast.success(r.reason||'Operação registrada.');await query.refetch();}
  catch(e){toast.error(e instanceof Error?e.message:'Falha na operação.');}
  finally{flight.current=false;setBusy(false);}
 }
 async function start(){
  if(flight.current||!storage.current)return;flight.current=true;setBusy(true);setConfirm(false);
  key.current??=crypto.randomUUID();localStorage.setItem(storage.current,key.current);
  try{await api('/start',{method:'POST',headers:{'Idempotency-Key':key.current},body:'{}'});toast.success('Teste solicitado. Acompanhe abaixo.');}
  catch(e){
   if(e && typeof e==='object' && 'status' in e && typeof e.status==='number' && e.status>=400 && e.status<500){localStorage.removeItem(storage.current);key.current=null;}
   toast.error(e instanceof Error?e.message:'Falha ao iniciar.');
  }
  finally{setUncertain(Boolean(key.current));flight.current=false;setBusy(false);await query.refetch();}
 }
 return <section className="space-y-5 rounded-2xl border border-border bg-card p-6 md:p-8">
  <div><h2 className="text-lg font-semibold">Teste de envio de mensagem</h2><p className="text-sm text-muted-foreground">Envie uma mensagem real para seu WhatsApp usando o fluxo de prospecção. Os testes têm histórico próprio e não alteram pesquisas, leads ou planilhas.</p></div>
  {query.isError&&<p role="alert" className="text-destructive">Não foi possível carregar os testes. Confira a atualização do banco e tente novamente.</p>}
  <form className="space-y-4" onSubmit={e=>{e.preventDefault();void action('',{enabled,phone,businessName:name,city},'PUT');}}>
   <label className="flex items-center gap-2"><input type="checkbox" checked={enabled} disabled={busy||active} onChange={e=>setEnabled(e.target.checked)}/>Habilitar testes para um número meu ou autorizado</label>
   <div className="space-y-2"><Label htmlFor="test-phone">Seu WhatsApp de teste</Label><Input id="test-phone" type="tel" placeholder="55 + DDD + número" value={phone} onChange={e=>setPhone(e.target.value)} disabled={busy||active} required maxLength={40}/></div>
   <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="test-name">Nome da empresa fictícia</Label><Input id="test-name" value={name} onChange={e=>setName(e.target.value)} disabled={busy||active} required maxLength={160}/></div><div className="space-y-2"><Label htmlFor="test-city">Cidade para personalizar a mensagem</Label><Input id="test-city" value={city} onChange={e=>setCity(e.target.value)} disabled={busy||active} required maxLength={160}/></div></div>
   <p className="text-xs text-muted-foreground">Usa o texto da oferta salvo na configuração de prospecção e o mesmo modelo de IA do fluxo. Cada teste pode consumir créditos da IA e enviar uma mensagem real.</p>
   <Button type="submit" variant="outline" disabled={busy||active||query.isPending||query.isError||!dirty}>Salvar configuração de teste</Button>
  </form>
  {query.data?.blocked&&<p role="status" className="text-sm text-muted-foreground">A conexão do WhatsApp está ocupada por uma rodada ativa ou aguardando verificação.</p>}
  {dirty&&<p className="text-sm text-muted-foreground">Salve as alterações antes de testar.</p>}
  <div className="flex flex-wrap gap-2">
   <Button disabled={busy||query.isPending||query.isError||!s?.enabled||dirty||query.data?.blocked||uncertain} onClick={()=>setConfirm(true)}>Testar envio</Button>
   <Button variant="outline" disabled={busy} onClick={()=>void query.refetch()}>Atualizar estado</Button>
   {uncertain&&!query.data?.blocked&&<Button variant="outline" disabled={busy} onClick={()=>void start()}>Verificar tentativa anterior</Button>}
  </div>
  {confirm&&<div role="alert" className="rounded-xl border border-border p-4 space-y-3"><p>Enviar uma mensagem real para <strong>+{s?.phone}</strong>, usando a empresa fictícia <strong>{s?.business_name}</strong>?</p><div className="flex gap-2"><Button disabled={busy} onClick={()=>void start()}>Confirmar envio de teste</Button><Button variant="outline" onClick={()=>setConfirm(false)}>Voltar</Button></div></div>}
  {uncertain&&<p className="text-sm text-muted-foreground">Conferindo a tentativa anterior. A verificação reaproveita a mesma tentativa e não cria outro envio se ela já foi registrada.</p>}
  <h3 className="font-semibold">Últimos testes</h3>
  {!query.data?.runs.length&&<p className="text-sm text-muted-foreground">Nenhum teste registrado.</p>}
  {query.data?.runs.map(run=>{const a=Array.isArray(run.message_test_attempts)?run.message_test_attempts[0]:run.message_test_attempts;const running=ACTIVE_STATES.includes(run.state);return <article key={run.id} className="rounded-xl border border-border p-4 space-y-2">
   <div className="flex flex-wrap justify-between gap-2"><strong>{labels[run.state]||run.state}</strong><time className="text-sm text-muted-foreground">{new Date(run.created_at).toLocaleString('pt-BR')}</time></div>
   <p className="text-sm">+{a?.phone} · {a?.business_name}</p>
   <p className="text-sm">Enviados: {a?.state==='sent'?1:0} · Inválidos: {a?.state==='invalid'?1:0} · Em revisão: {a?.state==='needs_review'?1:0}{running&&a?.state==='sending'?' · Enviando agora':''}</p>
   {a?.message_text&&<p className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm">{a.message_text}</p>}
   <p className="text-xs text-muted-foreground break-all">Rodada: {run.id}{run.n8n_execution_id?` · Execução n8n: ${run.n8n_execution_id}`:''}</p>
   <div className="flex flex-wrap gap-2">{running&&<Button variant="outline" disabled={busy} onClick={()=>void action('/cancel',{runId:run.id})}>{run.state==='cancelling'?'Verificar cancelamento':'Cancelar teste'}</Button>}
   {(a?.state==='needs_review'||a?.state==='sending')&&<Button variant="outline" disabled={busy} onClick={()=>void action('/reconcile',{runId:run.id})}>Reconciliar confirmação</Button>}</div>
  </article>;})}
 </section>;
}
