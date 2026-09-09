import {beforeEach,expect,test,vi} from "vitest";
const mocks=vi.hoisted(()=>({from:vi.fn(),fetch:vi.fn(),auth:vi.fn(),url:vi.fn(),claimed:false}));
vi.mock("@/integrations/supabase/client.server",()=>({supabaseAdmin:{from:mocks.from}}));
vi.mock("../src/lib/server/automation.server",()=>({authenticateUser:mocks.auth,readBody:(r:Request)=>r.json(),json:(v:unknown,status=200)=>Response.json(v,{status}),ApiError:class extends Error{constructor(public status:number,message:string){super(message);}}}));
vi.mock("../src/lib/server/encryption",()=>({decrypt:()=>"private-test"}));
vi.mock("../src/lib/server/webhook-security",()=>({safeWebhookFetch:mocks.fetch,validateWebhookUrl:mocks.url}));
import {dispatchSearch} from "../src/lib/server/search-dispatch.server";
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
beforeEach(()=>{vi.clearAllMocks();mocks.claimed=false;mocks.auth.mockResolvedValue("owner");mocks.url.mockResolvedValue({valid:true});mocks.fetch.mockResolvedValue(Response.json({accepted:true}));
 mocks.from.mockImplementation((table:string)=>{let updating=false;const q:any={select:()=>q,eq:()=>q,in:()=>q,update:()=>{updating=true;return q;},maybeSingle:async()=>{
  if(table==="n8n_settings")return {data:{webhook_url:"https://n8n.example/webhook/test",webhook_secret:"encrypted",callback_secret_hash:"hash"},error:null};
  if(updating){if(mocks.claimed)return {data:null,error:null};mocks.claimed=true;return {data:{id},error:null};}
  return {data:{id,user_id:"owner",termo:"Dentista",cidade:"Rio",uf:"RJ",status:"queued"},error:null};
 }};return q;});});
function request(){return new Request("https://scan.example/api/public/start-search",{method:"POST",body:JSON.stringify({searchId:id,termo:"FORGED"})});}
test("authentication happens before any privileged query or webhook",async()=>{mocks.auth.mockRejectedValue(new Error("Unauthorized"));await expect(dispatchSearch(request())).rejects.toThrow("Unauthorized");expect(mocks.from).not.toHaveBeenCalled();expect(mocks.fetch).not.toHaveBeenCalled();});
test("two dispatch requests claim once and send only database search parameters",async()=>{await Promise.all([dispatchSearch(request()),dispatchSearch(request())]);expect(mocks.fetch).toHaveBeenCalledTimes(1);const payload=JSON.parse(mocks.fetch.mock.calls[0]![1].body);expect(payload).toMatchObject({searchId:id,termo:"Dentista",cidade:"Rio",uf:"RJ"});});
