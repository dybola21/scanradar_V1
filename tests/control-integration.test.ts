import { beforeAll, afterAll, describe, expect, test, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const mocks=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn()}));
vi.mock('@/integrations/supabase/client.server',()=>({supabaseAdmin:{rpc:mocks.rpc,from:mocks.from,auth:{getUser:vi.fn()}}}));
vi.mock('@/lib/server/encryption',()=>({verifySecret:(a:string,b:string)=>a===b,decrypt:(x:string)=>x,encrypt:(x:string)=>x}));
import { api, automationControl, whatsappStatus } from '../src/lib/server/automation.server';

const pg=new PGlite();
const user='11111111-1111-4111-8111-111111111111', search='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const doc='1rsDDI26rMRg_1qeTh7t7IGHwsKwymBUgUCYS2_tsvPQ';
async function query(sql:string,args:unknown[]=[]){return (await pg.query(sql,args)).rows as Record<string,any>[];}
async function rpc(name:string,params:Record<string,unknown>){
  if(!/^[a-z_][a-z0-9_]*$/.test(name))throw Error('Invalid function');
  const keys=Object.keys(params);if(keys.some(k=>!/^p_[a-z_]+$/.test(k)))throw Error('Invalid argument');
  const values=keys.map(k=>k==='p_eligible_lead_keys'?params[k]:params[k] !== null && typeof params[k]==='object'?JSON.stringify(params[k]):params[k]);
  return (await query(`select public.${name}(${keys.map((k,i)=>`${k}=>$${i+1}`).join(',')}) as result`,values))[0]!.result;
}
beforeAll(async()=>{
  await pg.exec(await readFile('tests/fixtures.sql','utf8'));
  await pg.exec(await readFile('supabase/migrations/20260909000000_scanradar_initial.sql','utf8'));
  await query("INSERT INTO public.searches(id,user_id,request_id,termo,cidade,uf,status) VALUES($1,$2,gen_random_uuid(),'Dentista','Rio','RJ','completed')",[search,user]);
  await query("INSERT INTO public.n8n_settings(user_id,callback_secret_hash) VALUES($1,'test-secret')",[user]);
  await query("INSERT INTO public.leads(search_id,lead_key,telefone) VALUES($1,'a1','5521999991111'),($1,'a2','5521999992222')",[search]);
  await rpc('upsert_search_prospection',{p_search_id:search,p_user_id:user,p_ready:true,p_spreadsheet_id:doc,p_sheet_id:0,p_sheet_name:'Teste - '+search,p_sheet_url:`https://docs.google.com/spreadsheets/d/${doc}/edit#gid=0`,p_eligible_count:2,p_eligible_lead_keys:['a1','a2'],p_integration_errors:[]});
  mocks.rpc.mockImplementation(async(name:string,params:Record<string,unknown>)=>{
    try{return {data:await rpc(name,params),error:null};}catch(e){return {data:null,error:{code:'TEST_SQL',message:String(e)}};}
  });
  mocks.from.mockImplementation((table:string)=>{
    if(!['searches','n8n_settings','automation_runs','contact_reservations','leads','automation_events'].includes(table))throw Error('Unexpected table');
    const where:Record<string,unknown>={};
    const q={select:()=>q,eq:(key:string,v:unknown)=>{if(!/^[a-z_]+$/.test(key))throw Error('Invalid field');where[key]=v;return q;},maybeSingle:async()=>{
      const keys=Object.keys(where);
      const rows=await query(`SELECT * FROM public.${table} WHERE ${keys.map((k,i)=>`${k}=$${i+1}`).join(' AND ')}`,Object.values(where));
      return {data:rows[0]??null,error:rows.length>1?{code:'MULTIPLE'}:null};
    }};return q;
  });
});
afterAll(async()=>pg.close());
async function control(body:Record<string,unknown>,whatsapp=false){
 const request=new Request('https://app.example/api/public/'+(whatsapp?'whatsapp-status':'automation-control'),{method:'POST',headers:{'Content-Type':'application/json','X-Callback-Secret':'test-secret'},body:JSON.stringify(body)});
 const response=await api(()=>whatsapp?whatsappStatus(request):automationControl(request));
 return {status:response.status,body:await response.json()};
}
describe('Actual SQL through HTTP adapter, no mocked RPC payloads',()=>{
 test('claim → reserve → begin_send → callback → cancellation/finish matches the n8n contract',async()=>{
   const {run}=await rpc('start_automation_run',{p_search_id:search,p_user_id:user,p_connection_key:'scanradar-shared-whatsapp',p_idempotency_key:'attempt-http-1'});
   const scope={protocolVersion:3,searchId:search,automationRunId:run.id,executionId:'196'};
   const claimed=await control({...scope,action:'claim'});
   expect(claimed.body).toMatchObject({...scope,accepted:true,prospection:{sheetId:0,eligibleCount:2,eligibleLeadKeys:['a1','a2']}});
   expect((await control({...scope,action:'check'})).body).toMatchObject({...scope,state:'running',directive:'continue'});
   expect((await control({...scope,action:'reserve',lead_key:'a1',telefone:'5521999991111'})).body.allowed).toBe(true);
   expect((await control({...scope,action:'begin_send',lead_key:'a1',telefone:'5521999991111',attemptKey:'196:a1'})).body).toMatchObject({allowed:true,attemptKey:'196:a1',lead_key:'a1'});
   const receipt={...scope,lead_key:'a1',telefone:'5521999991111',status:'enviado',mensagem_enviada:true,messageId:'real-test-id',data_envio:'2026-09-08T02:00:00Z',messageText:'Test receipt'};
   const sent=await control(receipt,true);
   expect(sent.status).toBe(200);expect(sent.body).toMatchObject({...scope,success:true,lead_key:'a1',persistedStatus:'enviado'});
   expect((await control(receipt,true)).body.success).toBe(true);
   expect((await control({...receipt,status:'número inválido',mensagem_enviada:false},true)).body.persistedStatus).toBe('enviado');
   await rpc('request_automation_cancel',{p_search_id:search,p_run_id:run.id,p_actor_id:user,p_reason:null});
   expect((await control({...scope,action:'check'})).body).toMatchObject({state:'cancelling',directive:'stop'});
   const done=await control({...scope,action:'finish',status:'cancelled',stopAcknowledged:true,receipts:[receipt],issues:[],summary:null});
   expect(done.status).toBe(200);expect(done.body).toMatchObject({...scope,success:true,state:'cancelled'});
   const counts=await rpc('get_automation_status',{p_search_id:search,p_user_id:user});
   expect(counts.run.counts.sent).toBe(1);expect(counts.run.counts.pending).toBe(0);expect(counts.blocked).toBe(false);
 });
});
