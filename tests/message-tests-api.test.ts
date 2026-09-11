import { beforeEach, expect, test, vi } from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),getUser:vi.fn(),send:vi.fn(),getExecution:vi.fn(),stop:vi.fn()}));
vi.mock('@/integrations/supabase/client.server',()=>({supabaseAdmin:{rpc:mocks.rpc,from:mocks.from,auth:{getUser:mocks.getUser}}}));
vi.mock('@/lib/server/encryption',()=>({decrypt:(s:string)=>s,verifySecret:(a:string,b:string)=>a===b}));
vi.mock('@/lib/server/webhook-security',()=>({safeWebhookFetch:mocks.send,validateWebhookUrl:async()=>({valid:true})}));
vi.mock('@/lib/server/n8n-api.server',()=>({readN8nConfig:()=>({ok:true,config:{workflowId:'flow'}}),getExecution:mocks.getExecution,stopExecution:mocks.stop,executionFinished:(b:any)=>b.status==='success',executionWorkflowId:(b:any)=>b.workflowId,executionIdMatches:(b:any,id:string)=>b.id===id,collectEvolutionEvidence:()=>[]}));
import { api, automationControl } from '../src/lib/server/automation.server';
import { messageTestsStart, messageTestsCancel } from '../src/lib/server/message-tests.server';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',user='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function request(body:unknown,callback=false){return new Request('https://test.invalid/api/message-tests/start',{method:'POST',headers:{Authorization:'Bearer token','Idempotency-Key':'test-key-0001','X-Callback-Secret':callback?'secret':'wrong'},body:JSON.stringify(body)});}
beforeEach(()=>{
 vi.clearAllMocks();mocks.getUser.mockResolvedValue({data:{user:{id:user}},error:null});
 mocks.from.mockImplementation((table:string)=>{
  const result=table==='n8n_settings'?{prospection_webhook_url:'https://example.org/webhook/prospeccao',webhook_secret:'secret',callback_secret_hash:'secret'}:{id,user_id:user,n8n_execution_id:'202',state:'running'};
  const chain:any={select:()=>chain,eq:()=>chain,maybeSingle:async()=>({data:result,error:null})};return chain;
 });
 mocks.send.mockResolvedValue(new Response(null,{status:202}));
 mocks.rpc.mockImplementation(async(name:string)=>({data:name==='start_message_test'?{status:'created',runId:id}:{success:true,state:'cancelling',verified:false,executionId:'202'},error:null}));
});
test('only the creator dispatches; destination cannot come from browser',async()=>{
 expect((await api(()=>messageTestsStart(request({phone:'5521999991111'})))).status).toBe(400);
 expect(mocks.send).not.toHaveBeenCalled();
 expect((await messageTestsStart(request({}))).status).toBe(202);
 expect(JSON.parse(mocks.send.mock.calls[0]![1].body)).toEqual({searchId:id,automationRunId:id});
 mocks.rpc.mockResolvedValue({data:{status:'existing',runId:id},error:null});
 await messageTestsStart(request({}));expect(mocks.send).toHaveBeenCalledTimes(1);
});
test('ambiguous dispatch keeps persisted run and never automatically resends',async()=>{
 mocks.send.mockRejectedValue(new Error('timeout'));await messageTestsStart(request({}));
 expect(mocks.rpc).toHaveBeenCalledWith('mark_automation_dispatch_unknown',{p_run_id:id,p_user_id:user});
 expect(mocks.send).toHaveBeenCalledTimes(1);
});
test('callback secret validated before test control mutation',async()=>{
 const b={action:'claim',searchId:id,automationRunId:id,executionId:'202',protocolVersion:3};
 expect((await api(()=>automationControl(request(b)))).status).toBe(401);expect(mocks.rpc).not.toHaveBeenCalled();
 await automationControl(request(b,true));expect(mocks.rpc).toHaveBeenCalledWith('message_test_control',{p_run_id:id,p_body:b});
});
test('cancellation intent commits before stop; wrong workflow cannot be stopped or unlock',async()=>{
 mocks.getExecution.mockResolvedValue({status:200,body:{id:'202',workflowId:'foreign',status:'running'}});
 await messageTestsCancel(request({runId:id}));
 expect(mocks.stop).not.toHaveBeenCalled();expect(mocks.rpc).toHaveBeenCalledTimes(1);
 expect(mocks.rpc).toHaveBeenCalledWith('cancel_message_test',{p_user_id:user,p_run_id:id,p_confirmed:false});
 mocks.getExecution.mockResolvedValueOnce({status:200,body:{id:'202',workflowId:'flow',status:'running'}}).mockResolvedValueOnce({status:200,body:{id:'202',workflowId:'flow',status:'success'}});
 await messageTestsCancel(request({runId:id}));
 expect(mocks.stop).toHaveBeenCalledTimes(1);
 expect(mocks.rpc).toHaveBeenLastCalledWith('cancel_message_test',{p_user_id:user,p_run_id:id,p_confirmed:true});
});
