import { assertNotPreview } from "./dispatch-policy";
// Private n8n Public API client. Every value comes from server secrets; the browser never
// supplies base URLs, execution IDs, workflow IDs or keys. Only GET and POST /stop are used —
// never DELETE and never the internal /rest endpoints.


export type N8nConfig = { base: string; key: string; workflowId: string };
export type N8nConfigResult =
  | { ok: true; config: N8nConfig }
  | { ok: false; missing: string[]; reason: string };

export function readN8nConfig(): N8nConfigResult {
  const base = process.env["N8N_API_BASE_URL"]?.trim();
  const key = process.env["N8N_API_KEY"]?.trim();
  const workflowId = process.env["N8N_PROSPECTION_WORKFLOW_ID"]?.trim();
  const missing = [
    ...(base ? [] : ["N8N_API_BASE_URL"]),
    ...(key ? [] : ["N8N_API_KEY"]),
    ...(workflowId ? [] : ["N8N_PROSPECTION_WORKFLOW_ID"]),
  ];
  if (!base || !key || !workflowId)
    return { ok: false, missing, reason: "Credenciais da API do n8n não configuradas." };
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return { ok: false, missing: [], reason: "Endereço da API do n8n inválido." };
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/api\/v\d+\/?$/.test(url.pathname)
  )
    return {
      ok: false,
      missing: [],
      reason: "Use uma URL privada de configuração do servidor no formato https://seu-n8n/api/v1.",
    };
  return {
    ok: true,
    config: { base: url.toString().replace(/\/$/, ""), key, workflowId },
  };
}

async function call(config: N8nConfig, path: string, method: "GET" | "POST") {
  assertNotPreview();
  if (!/^\/executions\/[A-Za-z0-9_-]{1,200}(\/stop)?$/.test(path.split("?")[0] ?? ""))
    throw new Error("Rota da API do n8n não permitida.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${config.base}${path}`, {
      method,
      redirect: "manual",
      signal: controller.signal,
      headers: { "X-N8N-API-KEY": config.key, Accept: "application/json" },
    });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return { status: response.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getExecution(config: N8nConfig, executionId: string, includeData = false) {
  return call(
    config,
    `/executions/${encodeURIComponent(executionId)}${includeData ? "?includeData=true" : ""}`,
    "GET",
  );
}
export async function stopExecution(config: N8nConfig, executionId: string) {
  return call(config, `/executions/${encodeURIComponent(executionId)}/stop`, "POST");
}

function pick(value: unknown, key: string): unknown {
  return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}
export function executionFinished(body: unknown): boolean {
  const status = pick(body, "status");
  return typeof status === "string" && ["canceled", "crashed", "error", "success"].includes(status);
}
export function executionIdMatches(body: unknown, expected: string): boolean {
  return String(pick(body, "id") ?? "") === expected;
}
export function executionWorkflowId(body: unknown): string | null {
  const id = pick(body, "workflowId") ?? pick(pick(body, "workflowData"), "id");
  return typeof id === "string" || typeof id === "number" ? String(id) : null;
}

export type EvolutionEvidence = { phoneDigits: string; messageId: string; raw: unknown };
// Only genuine Evolution send receipts count: a message key with remoteJid and id.
function collectReceipts(value: unknown, out: EvolutionEvidence[]) {
  if (!value || typeof value !== "object") return out;
  // Only the response itself (or its documented HTTP/data envelope), never
  // quoted messages or arbitrary nested keys inside message contents.
  const envelope = value as Record<string, unknown>;
  const body = envelope['body'] ?? envelope;
  const candidate = pick(body,'data') ?? body;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return out;
  const record = candidate as Record<string, unknown>;
  const key = record["key"];
  if (key && typeof key === "object") {
    const jid = (key as Record<string, unknown>)["remoteJid"];
    const id = (key as Record<string, unknown>)["id"];
    if (typeof jid === "string" && typeof id === "string" && id.length > 0
      && (key as Record<string, unknown>)["fromMe"] === true
      && !["ERROR","FAILED"].includes(String(record["status"]).toUpperCase())) {
      const digits = jid.match(/^(55\d{10,11})@(s\.whatsapp\.net|c\.us)$/)?.[1];
      if (digits) out.push({ phoneDigits: digits, messageId: id, raw: record });
    }
  }
  return out;
}

export function collectEvolutionEvidence(value: unknown, expected: { searchId: string; automationRunId: string; executionId: string }): EvolutionEvidence[] {
  if (!executionIdMatches(value, expected.executionId)) return [];
  const runData = pick(pick(pick(value,"data"),"resultData"),"runData");
  if (!runData || typeof runData !== 'object') return [];
  const entries = Object.entries(runData);
  const contexts = entries.filter(([name])=>/^Contexto da Pesquisa\d*$/.test(name));
  const jsonItems = (runs: unknown): unknown[] => Array.isArray(runs) ? runs.flatMap(run=>{
    const main=pick(pick(run,"data"),"main");
    return Array.isArray(main) ? main.flatMap(port=>Array.isArray(port)?port.map(item=>pick(item,"json")):[]) : [];
  }) : [];
  if (!contexts.some(([,runs])=>jsonItems(runs).some(ctx=>pick(ctx,"searchId")===expected.searchId
    && pick(ctx,"automationRunId")===expected.automationRunId && String(pick(ctx,"executionId"))===expected.executionId))) return [];
  const out: EvolutionEvidence[]=[];
  for (const [name,runs] of entries) if (/^Enviar Mensagem \(Evolution API\)\d*$/.test(name)) {
    for (const data of jsonItems(runs)) collectReceipts(data,out);
  }
  return out;
}
