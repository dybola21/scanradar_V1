import { authenticateTestCallback } from "./message-tests.server";
import { assertDispatchEnabled } from "./dispatch-policy";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decrypt, encrypt, verifySecret } from "./encryption";
import { safeWebhookFetch, validateWebhookUrl } from "./webhook-security";
import {
  controlSchema,
  whatsappSchema,
  uuid,
  statusSchema,
  SHARED_CONNECTION_KEY,
  DEFAULT_OFFER,
} from "../automation-contract";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
export async function api(handler: () => Promise<Response>) {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof ApiError)
      return json({ success: false, error: error.message }, error.status);
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return json({ success: false, error: "Dados inválidos." }, 400);
    // No request payloads, URLs, bearer tokens or callback secrets in logs or responses.
    console.error("[Prospection] Server operation failed", {
      type: error instanceof Error ? error.name : "unknown",
    });
    return json(
      {
        success: false,
        error: "Não foi possível concluir a operação. Consulte o estado antes de tentar novamente.",
      },
      500,
    );
  }
}
export async function readBody(request: Request): Promise<unknown> {
  // Enforce the actual streamed size (Content-Length is optional/untrusted).
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "Corpo ausente.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 5 * 1024 * 1024) {
        await reader.cancel();
        throw new ApiError(413, "Corpo muito grande.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export async function rpc(name: string, params: Record<string, unknown>): Promise<unknown> {
  // The export's generated types predate the completing migration. RPC results are validated at the boundary.
  const { data, error } = await (supabaseAdmin as SupabaseClient).rpc(name, params);
  if (error) throw new Error(`Database operation failed: ${error.code}`);
  return data;
}
export async function authenticateUser(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new ApiError(401, "Faça login para continuar.");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new ApiError(401, "Sessão inválida.");
  return data.user.id;
}
export async function ownedSearch(searchId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("searches")
    .select("id,user_id,cidade,uf,status")
    .eq("id", searchId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Database unavailable");
  if (!data) throw new ApiError(404, "Pesquisa não encontrada.");
  return data;
}
export async function authenticateCallback(request: Request, searchId: string) {
  const secret = request.headers.get("x-callback-secret");
  if (!secret) throw new ApiError(401, "Callback não autorizado.");
  const { data: search, error } = await supabaseAdmin
    .from("searches")
    .select("id,user_id,cidade,uf,status")
    .eq("id", searchId)
    .maybeSingle();
  if (error) throw new Error("Database unavailable");
  if (!search) throw new ApiError(401, "Callback não autorizado.");
  const { data: settings, error: se } = await supabaseAdmin
    .from("n8n_settings")
    .select("callback_secret_hash")
    .eq("user_id", search.user_id)
    .maybeSingle();
  if (se) throw new Error("Database unavailable");
  if (!settings?.callback_secret_hash || !verifySecret(secret, settings.callback_secret_hash))
    throw new ApiError(401, "Callback não autorizado.");
  return search;
}
export async function getStatus(searchId: string, userId: string) {
  await ownedSearch(searchId, userId);
  return statusSchema.parse(
    await rpc("get_automation_status", { p_search_id: searchId, p_user_id: userId }),
  );
}
const startSchema = z.object({ searchId: uuid }).strict();
export async function startAutomation(request: Request) {
  const userId = await authenticateUser(request);
  assertDispatchEnabled();
  const { searchId } = startSchema.parse(await readBody(request));
  const key = z
    .string()
    .min(8)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/)
    .parse(request.headers.get("idempotency-key"));
  await ownedSearch(searchId, userId);
  const { data: settings, error } = await supabaseAdmin
    .from("n8n_settings")
    .select("prospection_webhook_url,prospection_header_name,webhook_secret,callback_secret_hash")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Database unavailable");
  if (
    !settings?.prospection_webhook_url ||
    !settings.webhook_secret ||
    !settings.callback_secret_hash
  )
    throw new ApiError(409, "Configure a integração de prospecção.");
  const url = decrypt(settings.prospection_webhook_url);
  const secret = decrypt(settings.webhook_secret);
  const header = headerSchema.parse(settings.prospection_header_name || "X-Webhook-Secret");
  assertProspectionUrl(url);
  const validated = await validateWebhookUrl(url);
  if (!validated.valid) throw new ApiError(400, "Endereço do fluxo de prospecção inválido.");
  const result = z
    .object({ status: z.string(), run: z.object({ id: uuid }).passthrough().optional() })
    .parse(
      await rpc("start_automation_run", {
        p_search_id: searchId,
        p_user_id: userId,
        p_connection_key: SHARED_CONNECTION_KEY,
        p_idempotency_key: key,
      }),
    );
  if (!["created", "existing"].includes(result.status)) {
    const messages: Record<string, string> = {
      conflict: "Outra prospecção está ativa nesta conexão.",
      empty: "Nenhum contato elegível para prospecção.",
      not_ready: "Esta pesquisa ainda não possui lista individual.",
      idempotency_conflict: "Esta tentativa pertence a outra pesquisa.",
    };
    return json(
      {
        success: false,
        error: messages[result.status] || "Pesquisa não autorizada.",
        ...(await getStatus(searchId, userId)),
      },
      409,
    );
  }
  if (!result.run) throw new Error("Missing run");
  // The start RPC has committed. Only its creator dispatches; repeated clicks never send the webhook again.
  if (result.status === "created") {
    let uncertain = true;
    try {
      const response = await safeWebhookFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", [header]: secret },
        body: JSON.stringify({ searchId, automationRunId: result.run.id }),
      });
      uncertain = response.status !== 202;
      // No response body is necessary: the worker writes its authoritative state through claim/finish.
      await response.body?.cancel();
    } catch {
      /* Delivery may have succeeded: do not redispatch or free the lock. */
    }
    if (uncertain)
      await rpc("mark_automation_dispatch_unknown", { p_run_id: result.run.id, p_user_id: userId });
  }
  return json(
    {
      success: true,
      repeated: result.status === "existing",
      ...(await getStatus(searchId, userId)),
    },
    202,
  );
}
// Protocol 3 response adapter. The transactional RPCs return minimal legacy payloads
// (e.g. {success,automationRunId}); every field the worker contract requires is rebuilt here
// from the persisted row, never from the requested status or from constants.
export const PROTOCOL_VERSION = 3;
const TERMINAL = ["completed", "completed_with_errors", "failed", "cancelled"] as const;

async function readRun(runId: string) {
  const { data, error } = await supabaseAdmin
    .from("automation_runs")
    .select("id,search_id,state,n8n_execution_id")
    .eq("id", runId)
    .maybeSingle();
  if (error) throw new Error("Database unavailable");
  return data;
}
function directiveFor(state: string | null | undefined) {
  return state === "running" ? "continue" : "stop";
}
function scope(body: { searchId: string; automationRunId: string; executionId: string }) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    searchId: body.searchId,
    automationRunId: body.automationRunId,
    executionId: String(body.executionId),
  };
}
const prospectionOut = z.object({
  schemaVersion: z.literal(2),
  ready: z.literal(true),
  spreadsheetId: z.string().min(1),
  sheetId: z.number().int().nonnegative(),
  sheetName: z.string().min(1),
  sheetUrl: z.string().min(1).nullable(),
  eligibleCount: z.number().int().positive(),
  eligibleLeadKeys: z.array(z.string().min(1)).nonempty(),
}).refine(p => p.eligibleCount === p.eligibleLeadKeys.length && new Set(p.eligibleLeadKeys).size === p.eligibleCount);
const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export async function automationControl(request: Request) {
  const body = controlSchema.parse(await readBody(request));
  if (await authenticateTestCallback(request, body)) {
    if (body.action === "finish") body.receipts = body.receipts.map(r => whatsappSchema.parse(r));
    return json(await rpc("message_test_control", { p_run_id: body.automationRunId, p_body: body }));
  }
  await authenticateCallback(request, body.searchId);
  const base = scope(body);
  const common = {
    p_search_id: body.searchId,
    p_run_id: body.automationRunId,
    p_execution_id: body.executionId,
  };

  if (body.action === "claim") {
    const result = asRecord(await rpc("claim_automation_run_v3", common));
    if (result["accepted"] !== true)
      return json({ ...base, accepted: false, reason: String(result["reason"] ?? "denied") });
    const run = await readRun(body.automationRunId);
    if (!run || run.search_id !== body.searchId || run.state !== "running" || run.n8n_execution_id !== body.executionId)
      return json({ ...base, accepted: false, reason: "Vínculo da execução não confirmado" });
    const prospection = prospectionOut.safeParse(result["prospection"]);
    if (!prospection.success)
      return json({
        ...base,
        accepted: false,
        reason: "Metadados da aba de prospecção incompletos",
      });
    const offer = result["offerDescription"];
    return json({
      ...base,
      accepted: true,
      offerDescription: typeof offer === "string" && offer.trim() ? offer : DEFAULT_OFFER,
      prospection: prospection.data,
    });
  }

  if (body.action === "check") {
    const result = asRecord(await rpc("check_automation_run", common));
    const state = typeof result["state"] === "string" ? (result["state"] as string) : null;
    if (state === null)
      return json({
        ...base,
        state: null,
        directive: "stop",
        reason: String(result["reason"] ?? "scope"),
      });
    return json({
      ...base,
      state,
      directive: directiveFor(state),
      cancelRequested: state === "cancelling",
    });
  }

  if (body.action === "reserve" || body.action === "begin_send") {
    const result = asRecord(
      body.action === "reserve"
        ? await rpc("reserve_contact", {
            ...common,
            p_lead_key: body.lead_key,
            p_phone: body.telefone,
          })
        : await rpc("begin_send", {
            ...common,
            p_lead_key: body.lead_key,
            p_phone: body.telefone,
            p_attempt_key: body.attemptKey,
          }),
    );
    const run = await readRun(body.automationRunId);
    const state = run?.state ?? null;
    const allowed = result["allowed"] === true;
    const reservationConfirmed =
      body.action === "reserve" ||
      (await (async () => {
        const { data } = await supabaseAdmin
          .from("contact_reservations")
          .select("state,attempt_key")
          .eq("run_id", body.automationRunId)
          .eq("lead_key", body.lead_key)
          .maybeSingle();
        return data?.state === "sending" && data.attempt_key === body.attemptKey;
      })());
    const ok = allowed && reservationConfirmed && run?.search_id === body.searchId && run?.n8n_execution_id === body.executionId && state === "running";
    return json({
      ...base,
      state,
      directive: directiveFor(state),
      allowed: ok,
      ...(ok
        ? body.action === "begin_send"
          ? { lead_key: body.lead_key, attemptKey: body.attemptKey }
          : { lead_key: body.lead_key }
        : {
            reason: String(
              result["reason"] ?? (reservationConfirmed ? "denied" : "reserva não gravada"),
            ),
          }),
    });
  }

  // finish: the persisted terminal state is authoritative, never the requested status.
  const receipts = body.receipts.map(receipt => whatsappSchema.parse(receipt));
  if (receipts.some(r => r.searchId !== body.searchId || r.automationRunId !== body.automationRunId || r.executionId !== body.executionId))
    throw new ApiError(400, "Comprovante fora do escopo da rodada.");
  const result = asRecord(
    await rpc("finish_automation_run_v3", {
      ...common,
      p_status: body.status,
      p_summary: body.summary,
      p_issues: body.issues,
      p_receipts: receipts,
      p_stop_acknowledged: body.stopAcknowledged,
    }),
  );
  const run = await readRun(body.automationRunId);
  const state = run?.state ?? null;
  if (result["success"] !== true || run?.search_id !== body.searchId || run?.n8n_execution_id !== body.executionId || !state || !TERMINAL.includes(state as (typeof TERMINAL)[number]))
    return json(
      {
        ...base,
        success: false,
        state,
        reason: String(result["reason"] ?? "Estado final não persistido"),
      },
      409,
    );
  return json({
    ...base,
    success: true,
    state,
    ...(result["idempotent"] === true ? { idempotent: true } : {}),
  });
}
export async function whatsappStatus(request: Request) {
  // Legacy phone-only callbacks are rejected explicitly: they cannot mutate a v2 run.
  const body = whatsappSchema.parse(await readBody(request));
  if (await authenticateTestCallback(request, body))
    return json(await rpc("message_test_receipt", { p_run_id: body.automationRunId, p_body: body }));
  await authenticateCallback(request, body.searchId);
  const result = asRecord(
    await rpc("apply_whatsapp_status", {
      p_search_id: body.searchId,
      p_run_id: body.automationRunId,
      p_execution_id: body.executionId,
      p_lead_key: body.lead_key,
      p_phone: body.telefone,
      p_status: body.status,
      p_mensagem_enviada: body.mensagem_enviada,
      p_data_envio: body.data_envio ?? null,
      p_message_text: body.messageText ?? null,
      p_message_id: body.messageId ?? null,
      p_attempt_key: body.attemptKey ?? null,
    }),
  );
  const base = { ...scope(body), lead_key: body.lead_key };
  if (result["success"] !== true)
    return json({ ...base, success: false, reason: String(result["reason"] ?? "denied") }, 409);
  const [{ data: lead, error: leadError }, { data: reservation, error: reservationError }] = await Promise.all([
    supabaseAdmin
      .from("leads")
      .select("status,mensagem_enviada")
      .eq("search_id", body.searchId)
      .eq("lead_key", body.lead_key)
      .maybeSingle(),
    supabaseAdmin
      .from("contact_reservations")
      .select("state")
      .eq("run_id", body.automationRunId)
      .eq("lead_key", body.lead_key)
      .maybeSingle(),
  ]);
  if (leadError || reservationError) throw new Error("Database unavailable");
  const persistedStatus = lead?.status ?? null;
  const expected = persistedStatus === "enviado" ? "sent" : "invalid";
  const sentWins = persistedStatus === "enviado" && lead?.mensagem_enviada === true;
  const { data: event, error: eventError } = await supabaseAdmin.from("automation_events")
    .select("event_type").eq("run_id", body.automationRunId).eq("lead_key", body.lead_key).eq("event_type", expected).maybeSingle();
  if (eventError) throw new Error("Database unavailable");
  if ((!sentWins && persistedStatus !== body.status) || reservation?.state !== expected || !event)
    return json({ ...base, success: false, reason: "Gravação não confirmada" }, 409);
  return json({ ...base, success: true, persistedStatus });
}

const headerSchema = z.string().regex(/^X-[A-Za-z0-9-]{1,80}$/i);
export function assertProspectionUrl(value: string) {
  // Any legitimate HTTPS Production webhook URL is accepted; no fixed path suffix is required.
  const u = new URL(value);
  if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash)
    throw new ApiError(400, "Use a Production URL HTTPS do webhook, sem parâmetros.");
  if (!/\/webhook\//.test(u.pathname) || /\/webhook-test\//.test(u.pathname))
    throw new ApiError(400, "O endereço informado não parece ser um webhook do n8n.");
}
export const settingsSchema = z.object({
  webhookUrl: z.string().max(2000).optional(),
  headerName: headerSchema,
  offerDescription: z.string().trim().min(1).max(3000),
});
export async function getProspectionSettings(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("n8n_settings")
    .select(
      "prospection_webhook_url,prospection_header_name,offer_description,webhook_secret,callback_secret_hash",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Database unavailable");
  return {
    hasWebhook: Boolean(data?.prospection_webhook_url),
    hasHeaderSecret: Boolean(data?.webhook_secret),
    hasCallbackSecret: Boolean(data?.callback_secret_hash),
    headerName: data?.prospection_header_name || "X-Webhook-Secret",
    offerDescription: data?.offer_description || DEFAULT_OFFER,
    connectionKey: SHARED_CONNECTION_KEY,
  };
}
export async function saveProspectionSettings(userId: string, input: unknown) {
  const data = settingsSchema.parse(input);
  const update: Record<string, string> = {
    prospection_header_name: data.headerName,
    offer_description: data.offerDescription,
    evolution_connection_key: SHARED_CONNECTION_KEY,
  };
  if (data.webhookUrl?.trim()) {
    const url = data.webhookUrl.trim();
    assertProspectionUrl(url);
    const validation = await validateWebhookUrl(url);
    if (!validation.valid) throw new ApiError(400, "Endereço do webhook inválido.");
    update["prospection_webhook_url"] = encrypt(url);
  }
  const { error } = await supabaseAdmin
    .from("n8n_settings")
    .upsert({ user_id: userId, ...update }, { onConflict: "user_id" });
  if (error) throw new Error("Não foi possível salvar a integração.");
  return { success: true };
}
