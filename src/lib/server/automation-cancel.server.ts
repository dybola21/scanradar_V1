import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { uuid } from "../automation-contract";
import {
  cancelContextSchema,
  cancelRequestSchema,
  reconcileRequestSchema,
} from "../automation-cancel-contract";
import { authenticateUser, ownedSearch, rpc, readBody, json, ApiError } from "./automation.server";
import {
  collectEvolutionEvidence,
  executionFinished,
  executionWorkflowId,
  executionIdMatches,
  getExecution,
  readN8nConfig,
  stopExecution,
} from "./n8n-api.server";

export async function getCancelContext(request: Request) {
  const userId = await authenticateUser(request);
  const searchId = uuid.parse(new URL(request.url).searchParams.get("searchId"));
  await ownedSearch(searchId, userId);
  return json(
    cancelContextSchema.parse(
      await rpc("get_automation_cancel_context", { p_search_id: searchId, p_user_id: userId }),
    ),
  );
}

const requestResult = z
  .object({
    success: z.boolean(),
    code: z.string().optional(),
    state: z.string().optional(),
    alreadyFinished: z.boolean().optional(),
    executionId: z.string().nullable().optional(),
  })
  .passthrough();

export async function cancelAutomation(request: Request) {
  const userId = await authenticateUser(request);
  const body = cancelRequestSchema.parse(await readBody(request));
  await ownedSearch(body.searchId, userId);
  // Phase 1 commits the cancellation intent BEFORE any network I/O.
  const requested = requestResult.parse(
    await rpc("request_automation_cancel", {
      p_search_id: body.searchId,
      p_run_id: body.automationRunId,
      p_actor_id: userId,
      p_reason: body.reason ?? null,
    }),
  );
  if (!requested.success)
    return json({ success: false, error: "Rodada não encontrada para esta pesquisa." }, 404);
  if (requested.alreadyFinished)
    return json({ success: true, alreadyFinished: true, state: requested.state, verified: true });

  const executionId = requested.executionId ?? null;
  const config = readN8nConfig();
  const detail: Record<string, unknown> = { executionId };
  let stopped = false;
  let stopSupported = true;

  if (!executionId) {
    // Cancellation committed under the same run lock used by claim, fencing late workers.
    detail["reason"] = "Cancelamento impede qualquer autorização futura desta rodada.";
    stopped = true;
  } else if (!config.ok) {
    detail["reason"] = config.reason;
    detail["missingSecrets"] = config.missing;
  } else {
    try {
      const before = await getExecution(config.config, executionId);
      const workflowId = executionWorkflowId(before.body);
      detail["lookupStatus"] = before.status;
      detail["workflowId"] = workflowId;
      if (before.status === 200 && workflowId === config.config.workflowId && executionIdMatches(before.body, executionId)) {
        await rpc("set_automation_execution_metadata", {
          p_run_id: body.automationRunId,
          p_actor_id: userId,
          p_workflow_id: workflowId,
        });
      }
      if (before.status === 404) {
        detail["reason"] = "Execução não encontrada; isso não comprova encerramento.";
      } else if (before.status !== 200) {
        detail["reason"] = "A API do n8n não confirmou a execução.";
      } else if (workflowId !== config.config.workflowId || !executionIdMatches(before.body, executionId)) {
        detail["reason"] = "A execução pertence a outro workflow; nenhum stop foi enviado.";
      } else if (executionFinished(before.body)) {
        detail["reason"] = "A execução já estava encerrada no n8n.";
        stopped = true;
      } else {
        const stop = await stopExecution(config.config, executionId);
        detail["stopStatus"] = stop.status;
        if ([404, 405, 501].includes(stop.status)) {
          stopSupported = false;
          detail["reason"] = "Esta instância do n8n não aceita parar execuções pela API.";
        } else if (stop.status >= 200 && stop.status < 300) {
          const after = await getExecution(config.config, executionId);
          detail["verifyStatus"] = after.status;
          stopped = after.status === 200 && executionIdMatches(after.body, executionId)
            && executionWorkflowId(after.body) === config.config.workflowId && executionFinished(after.body);
          if (!stopped) detail["reason"] = "O n8n não confirmou o encerramento da execução.";
        } else {
          detail["reason"] = "A API do n8n recusou o pedido de parada.";
        }
      }
    } catch (error) {
      detail["reason"] = "Falha de comunicação com a API do n8n.";
      detail["errorType"] = error instanceof Error ? error.name : "unknown";
    }
  }

  const finalized = z
    .object({ success: z.boolean(), state: z.string().optional(), verified: z.boolean().optional() })
    .passthrough()
    .parse(
      await rpc("finalize_automation_cancel", {
        p_search_id: body.searchId,
        p_run_id: body.automationRunId,
        p_actor_id: userId,
        p_stopped: stopped,
        p_detail: detail,
      }),
    );
  return json({ ...finalized, stopSupported }, finalized.verified === false ? 202 : 200);
}

export async function reconcileAutomation(request: Request) {
  const userId = await authenticateUser(request);
  const body = reconcileRequestSchema.parse(await readBody(request));
  await ownedSearch(body.searchId, userId);
  const config = readN8nConfig();
  if (!config.ok) throw new ApiError(409, config.reason);
  const { data: run, error: runError } = await supabaseAdmin
    .from("automation_runs")
    .select("id,n8n_execution_id,user_id,search_id")
    .eq("id", body.automationRunId)
    .eq("user_id", userId)
    .eq("search_id", body.searchId)
    .maybeSingle();
  if (runError) throw new Error("Database unavailable");
  if (!run) throw new ApiError(404, "Rodada não encontrada para esta pesquisa.");
  if (!run.n8n_execution_id) throw new ApiError(409, "Rodada sem execução confirmada no n8n.");
  const { data: pending, error: pendingError } = await supabaseAdmin
    .from("contact_reservations")
    .select("lead_key,phone_normalized,state")
    .eq("run_id", run.id)
    .in("state", ["sending", "needs_review"]);
  if (pendingError) throw new Error("Database unavailable");
  const execution = await getExecution(config.config, run.n8n_execution_id, true);
  const notes: string[] = [];
  if (execution.status !== 200) {
    throw new ApiError(409, "A API do n8n não retornou os dados desta execução.");
  }
  const workflowId = executionWorkflowId(execution.body);
  if (workflowId !== config.config.workflowId || !executionIdMatches(execution.body, run.n8n_execution_id))
    throw new ApiError(409, "A execução pertence a outro workflow.");
  const evidence = collectEvolutionEvidence(execution.body, { searchId: body.searchId, automationRunId: run.id, executionId: run.n8n_execution_id });
  let confirmed = 0;
  for (const reservation of pending ?? []) {
    if (!reservation.lead_key || !reservation.phone_normalized) continue;
    const match = evidence.find((item) => item.phoneDigits === reservation.phone_normalized);
    if (!match) continue;
    // Only real Evolution receipts confirm a send. Spreadsheet rows never do.
    const result = z
      .object({ success: z.boolean(), code: z.string().optional() })
      .passthrough()
      .parse(
        await rpc("reconcile_automation_send", {
          p_search_id: body.searchId,
          p_run_id: run.id,
          p_actor_id: userId,
          p_lead_key: reservation.lead_key,
          p_status: "enviado",
          p_message_id: match.messageId,
          p_sent_at: null,
          p_evidence: { source: "n8n_execution", executionId: run.n8n_execution_id },
        }),
      );
    if (result.success) confirmed += 1;
    else notes.push(`Contato não confirmado (${result.code ?? "erro"}).`);
  }
  const total = pending?.length ?? 0;
  if (total === 0) notes.push("Nenhum contato pendente de reconciliação nesta rodada.");
  else if (confirmed === 0)
    notes.push("Nenhuma evidência de envio da Evolution foi encontrada nesta execução.");
  return json({
    success: true,
    confirmed,
    reviewed: total,
    pending: total - confirmed,
    notes,
  });
}
