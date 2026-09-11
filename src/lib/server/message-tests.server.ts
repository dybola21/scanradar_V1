import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { ApiError, authenticateUser, json, readBody, rpc, assertProspectionUrl } from './automation.server';
import { decrypt, verifySecret } from './encryption';
import { assertDispatchEnabled, assertNotPreview } from './dispatch-policy';
import { safeWebhookFetch, validateWebhookUrl } from './webhook-security';
import { ACTIVE_STATES, SHARED_CONNECTION_KEY, uuid, whatsappSchema } from '../automation-contract';
import { collectEvolutionEvidence, executionFinished, executionIdMatches, executionWorkflowId, getExecution, readN8nConfig, stopExecution } from './n8n-api.server';
const db = supabaseAdmin as SupabaseClient;
const settingsSchema = z.object({
  enabled: z.boolean(),
  phone: z.string().max(40).transform(v => v.replace(/\D/g, '')).refine(v => /^55\d{10,11}$/.test(v), 'Use 55, DDD e número.'),
  businessName: z.string().trim().min(1).max(160), city: z.string().trim().min(1).max(160),
}).strict();
const keySchema = z.string().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/);
const runSchema = z.object({runId: uuid}).strict();
const resultSchema = z.object({success:z.boolean(),reason:z.string().optional()}).passthrough();

export async function messageTestsGet(request: Request) {
  const userId = await authenticateUser(request);
  const [settings, runs, busy] = await Promise.all([
    db.from('message_test_settings').select('enabled,phone,business_name,city').eq('user_id',userId).maybeSingle(),
    db.from('automation_runs').select('id,state,n8n_execution_id,created_at,finished_at,idempotency_key,issues,message_test_attempts(phone,business_name,state,message_text,message_id,sent_at)')
      .eq('mode','test').eq('user_id',userId).order('created_at',{ascending:false}).limit(10),
    db.from('automation_runs').select('id').eq('connection_key',SHARED_CONNECTION_KEY).in('state',ACTIVE_STATES).limit(1),
  ]);
  if(settings.error||runs.error||busy.error) throw new Error('Database unavailable');
  // Never expose another user's run ID, execution or recipient.
  return json({settings:settings.data,runs:runs.data,blocked:Boolean(busy.data?.length)});
}
export async function messageTestsSave(request: Request) {
  const userId=await authenticateUser(request);
  const b=settingsSchema.parse(await readBody(request));
  const r=resultSchema.parse(await rpc('save_message_test_settings',{p_user_id:userId,p_enabled:b.enabled,p_phone:b.phone,p_name:b.businessName,p_city:b.city}));
  return json(r,r.success?200:409);
}
export async function messageTestsStart(request: Request) {
  const userId=await authenticateUser(request);
  assertDispatchEnabled();
  // The browser cannot choose a recipient or business data in the dispatch request.
  z.object({}).strict().parse(await readBody(request));
  const key=keySchema.parse(request.headers.get('idempotency-key'));
  const {data:s,error}=await db.from('n8n_settings').select('prospection_webhook_url,prospection_header_name,webhook_secret,callback_secret_hash').eq('user_id',userId).maybeSingle();
  if(error) throw new Error('Database unavailable');
  if(!s?.prospection_webhook_url||!s.webhook_secret||!s.callback_secret_hash) throw new ApiError(409,'Configure a integração de prospecção e o segredo de callback.');
  const url=decrypt(s.prospection_webhook_url), secret=decrypt(s.webhook_secret);
  const header=z.string().regex(/^X-[A-Za-z0-9-]{1,80}$/i).parse(s.prospection_header_name||'X-Webhook-Secret');
  assertProspectionUrl(url);
  if(!(await validateWebhookUrl(url)).valid) throw new ApiError(400,'Webhook inválido.');
  const r=z.object({status:z.string(),runId:uuid.optional()}).parse(await rpc('start_message_test',{p_user_id:userId,p_key:key}));
  if(!r.runId) return json({success:false,error:r.status==='conflict'?'A conexão do WhatsApp está ocupada. Aguarde o encerramento da rodada.':'Salve e habilite o número de teste antes de enviar.'},409);
  if(r.status==='created') {
    let uncertain=true;
    try {
      const response=await safeWebhookFetch(url,{method:'POST',headers:{'Content-Type':'application/json',[header]:secret},body:JSON.stringify({searchId:r.runId,automationRunId:r.runId})});
      uncertain=response.status!==202;
      await response.body?.cancel();
    } catch { /* Only the first committed creator dispatches. Never retry automatically. */ }
    if(uncertain) await rpc('mark_automation_dispatch_unknown',{p_run_id:r.runId,p_user_id:userId});
  }
  return json({success:true,runId:r.runId,repeated:r.status==='existing'},202);
}

// Called before commercial callbacks. Only equal UUIDs can be the standalone test scope.
export async function authenticateTestCallback(request:Request, body:{searchId:string;automationRunId:string}):Promise<boolean> {
  if(body.searchId!==body.automationRunId) return false;
  const {data:run,error}=await db.from('automation_runs').select('user_id').eq('id',body.automationRunId).eq('mode','test').maybeSingle();
  if(error) throw new Error('Database unavailable');
  if(!run) return false;
  const {data:s,error:se}=await db.from('n8n_settings').select('callback_secret_hash').eq('user_id',run.user_id).maybeSingle();
  if(se) throw new Error('Database unavailable');
  const secret=request.headers.get('x-callback-secret');
  if(!secret||!s?.callback_secret_hash||!verifySecret(secret,s.callback_secret_hash)) throw new ApiError(401,'Callback não autorizado.');
  return true;
}

export async function messageTestsCancel(request:Request) {
  const userId=await authenticateUser(request);
  assertNotPreview();
  const {runId}=runSchema.parse(await readBody(request));
  await ownedTest(runId,userId);
  const r=z.object({success:z.boolean(),state:z.string(),executionId:z.string().nullable(),verified:z.boolean()}).parse(await rpc('cancel_message_test',{p_user_id:userId,p_run_id:runId,p_confirmed:false}));
  if(r.verified) return json(r);
  const config=readN8nConfig();
  let confirmed=false;
  if(config.ok&&r.executionId) {
    try {
      const matches=(x:{status:number;body:unknown})=>x.status===200&&executionIdMatches(x.body,r.executionId!)&&executionWorkflowId(x.body)===config.config.workflowId;
      const before=await getExecution(config.config,r.executionId);
      if(matches(before)) {
        confirmed=executionFinished(before.body);
        if(!confirmed) {
          await stopExecution(config.config,r.executionId);
          const after=await getExecution(config.config,r.executionId);
          confirmed=matches(after)&&executionFinished(after.body);
        }
      }
    } catch { /* Cooperative stop remains fenced in the database. */ }
  }
  if(confirmed) return json(await rpc('cancel_message_test',{p_user_id:userId,p_run_id:runId,p_confirmed:true}));
  return json({...r,reason:'Cancelamento solicitado. Aguardando confirmação de parada do n8n; consulte novamente em alguns segundos.'},202);
}
async function ownedTest(runId:string,userId:string) {
  const {data,error}=await db.from('automation_runs').select('id,n8n_execution_id,state').eq('id',runId).eq('user_id',userId).eq('mode','test').maybeSingle();
  if(error) throw new Error('Database unavailable');
  if(!data) throw new ApiError(404,'Teste não encontrado.');
  return data;
}
export async function messageTestsReconcile(request:Request) {
  const userId=await authenticateUser(request);
  assertNotPreview();
  const {runId}=runSchema.parse(await readBody(request));
  const run=await ownedTest(runId,userId);
  if(!run.n8n_execution_id) throw new ApiError(409,'Teste sem execução autorizada. Use Cancelar para encerrar.');
  const cfg=readN8nConfig();
  if(!cfg.ok) throw new ApiError(409,cfg.reason);
  const execution=await getExecution(cfg.config,run.n8n_execution_id,true);
  if(execution.status!==200||!executionIdMatches(execution.body,run.n8n_execution_id)||executionWorkflowId(execution.body)!==cfg.config.workflowId)
    throw new ApiError(409,'Não foi possível confirmar a execução no workflow configurado.');
  const {data:a,error}=await db.from('message_test_attempts').select('phone,attempt_key,state').eq('run_id',runId).eq('user_id',userId).single();
  if(error) throw new Error('Database unavailable');
  const proof=collectEvolutionEvidence(execution.body,{searchId:runId,automationRunId:runId,executionId:run.n8n_execution_id}).find(e=>e.phoneDigits===a.phone);
  if(!proof||!a.attempt_key) return json({success:true,confirmed:false,reason:'Nenhum comprovante de envio encontrado. Nenhuma mensagem foi reenviada.'});
  const b=whatsappSchema.parse({protocolVersion:3,searchId:runId,automationRunId:runId,executionId:run.n8n_execution_id,lead_key:`test:${runId}`,telefone:a.phone,status:'enviado',mensagem_enviada:true,messageId:proof.messageId,attemptKey:a.attempt_key});
  await rpc('message_test_receipt',{p_run_id:runId,p_body:b});
  return json({success:true,confirmed:true});
}
