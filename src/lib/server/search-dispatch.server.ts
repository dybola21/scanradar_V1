import {z} from "zod";
import {supabaseAdmin} from "@/integrations/supabase/client.server";
import {authenticateUser, readBody, json, ApiError} from "./automation.server";
import {decrypt} from "./encryption";
import {safeWebhookFetch, validateWebhookUrl} from "./webhook-security";
import {assertDispatchEnabled} from "./dispatch-policy";

export async function dispatchSearch(request: Request) {
  const userId = await authenticateUser(request);
  assertDispatchEnabled();
  const {searchId} = z.object({searchId: z.string().uuid()}).parse(await readBody(request));
  const {data: search, error} = await supabaseAdmin.from("searches").select("*").eq("id",searchId).eq("user_id",userId).maybeSingle();
  if (error) throw new Error("Database unavailable");
  if (!search) throw new ApiError(404,"Pesquisa não encontrada.");
  const {data: settings,error: se} = await supabaseAdmin.from("n8n_settings").select("webhook_url,webhook_secret,callback_secret_hash").eq("user_id",userId).maybeSingle();
  if (se) throw new Error("Database unavailable");
  if (!settings?.webhook_url || !settings.webhook_secret || !settings.callback_secret_hash) throw new ApiError(409,"Configure a integração e o segredo de callback.");
  const url = settings.webhook_url;
  if (!(await validateWebhookUrl(url)).valid) throw new ApiError(400,"Webhook inválido.");
  const secret = decrypt(settings.webhook_secret);
  // Atomic claim: only one caller dispatches, and callbacks cannot be overwritten by a late acknowledgement.
  const {data: claimed,error: ce} = await supabaseAdmin.from("searches").update({status:"processing"}).eq("id",searchId).eq("user_id",userId).in("status",["pending","queued"]).select("id").maybeSingle();
  if (ce) throw new Error("Database unavailable");
  if (!claimed) return json({success:true,repeated:true,searchId,status:search.status},202);
  let acknowledged = false;
  try {
    const response = await safeWebhookFetch(url,{method:"POST",headers:{"Content-Type":"application/json","X-Webhook-Secret":secret,"X-Idempotency-Key":searchId},body:JSON.stringify({requestType:"search",searchId,termo:search.termo,cidade:search.cidade,uf:search.uf})});
    acknowledged = response.ok;
    await response.body?.cancel();
  } catch { /* Never dispatch again on ambiguous transport failure. */ }
  if (!acknowledged) {
    const {error: ue} = await supabaseAdmin.from("searches").update({status:"delivery_unknown"}).eq("id",searchId).eq("status","processing");
    if (ue) throw new Error("Database unavailable");
  }
  return json({success:true,searchId,status:acknowledged?"processing":"delivery_unknown"},202);
}
