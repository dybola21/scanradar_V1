import {beforeEach,describe,expect,test,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),auth:vi.fn(),get:vi.fn(),stop:vi.fn()}));
vi.mock('@/integrations/supabase/client.server',()=>({supabaseAdmin:{rpc:m.rpc,from:m.from,auth:{getUser:m.auth}}}));
vi.mock('@/lib/server/n8n-api.server',async(importOriginal)=>{
 const original=await importOriginal<typeof import('../src/lib/server/n8n-api.server')>();
 return {...original,readN8nConfig:()=>({ok:true,config:{base:'https://n8n.example/api/v1',key:'private-test',workflowId:'workflow-1'}}),getExecution:m.get,stopExecution:m.stop};
});
import {api} from '../src/lib/server/automation.server';
import {cancelAutomation} from '../src/lib/server/automation-cancel.server';
import {executionFinished} from '../src/lib/server/n8n-api.server';
const user='11111111-1111-4111-8111-111111111111',search='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',run='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
beforeEach(()=>{
 vi.clearAllMocks();m.auth.mockResolvedValue({data:{user:{id:user}},error:null});
 m.from.mockImplementation(()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{id:search,user_id:user},error:null})};return q;});
 m.rpc.mockImplementation(async(name:string,p:Record<string,unknown>)=>({error:null,data:name==='request_automation_cancel'?{success:true,executionId:'196',state:'cancelling'}:name==='finalize_automation_cancel'?{success:true,state:p.p_stopped?'cancelled':'cancelling',verified:p.p_stopped}:{}}));
 m.get.mockResolvedValue({status:200,body:{id:'196',workflowId:'workflow-1',status:'running'}});
 m.stop.mockResolvedValue({status:200,body:{}});
});
async function cancel(){return api(()=>cancelAutomation(new Request('https://app.example/api/automations/cancel',{method:'POST',headers:{Authorization:'Bearer user-session','Content-Type':'application/json'},body:JSON.stringify({searchId:search,automationRunId:run})})));}
describe('Verified cancellation integration',()=>{
 test('404 is not proof of stop and never calls stop',async()=>{m.get.mockResolvedValue({status:404,body:null});const r=await cancel();expect(r.status).toBe(202);expect((await r.json()).verified).toBe(false);expect(m.stop).not.toHaveBeenCalled();});
 test('foreign or missing workflow/id does not authorize stop',async()=>{for(const body of [{id:'196',workflowId:'other',status:'running'},{id:'196',status:'running'},{id:'999',workflowId:'workflow-1',status:'success'}]){m.get.mockResolvedValue({status:200,body});expect((await (await cancel()).json()).verified).toBe(false);}expect(m.stop).not.toHaveBeenCalled();});
 test('stop accepted but execution still running retains lock',async()=>{const r=await cancel();expect(r.status).toBe(202);expect((await r.json()).verified).toBe(false);expect(m.stop).toHaveBeenCalledOnce();});
 test('cancel commits before API call; exact verified terminal execution releases',async()=>{
  m.get.mockImplementationOnce(async()=>{expect(m.rpc.mock.calls[0]?.[0]).toBe('request_automation_cancel');return {status:200,body:{id:'196',workflowId:'workflow-1',status:'running'}};});
  m.get.mockResolvedValueOnce({status:200,body:{id:'196',workflowId:'workflow-1',status:'canceled'}});
  const r=await cancel();expect(r.status).toBe(200);expect((await r.json()).verified).toBe(true);
 });
 test('failed verification lookup is not terminal',async()=>{m.get.mockResolvedValueOnce({status:200,body:{id:'196',workflowId:'workflow-1',status:'running'}}).mockResolvedValueOnce({status:404,body:null});expect((await (await cancel()).json()).verified).toBe(false);});
 test('terminal state required, contradictory timestamps do not stop running worker',()=>{expect(executionFinished({status:'running',finished:true,stoppedAt:'2026-09-08'})).toBe(false);expect(executionFinished({status:'success'})).toBe(true);});
 test('authentication or ownership denial cannot stop n8n',async()=>{m.auth.mockResolvedValueOnce({data:{user:null},error:null});expect((await cancel()).status).toBe(401);m.rpc.mockResolvedValueOnce({data:{success:false,code:'not_found'},error:null});expect((await cancel()).status).toBe(404);expect(m.get).not.toHaveBeenCalled();});
});
