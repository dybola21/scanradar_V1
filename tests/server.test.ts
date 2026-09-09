import { beforeEach, describe, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  auth: vi.fn(),
  fetch: vi.fn(),
  validate: vi.fn(),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: mocks.rpc, from: mocks.from, auth: { getUser: mocks.auth } },
}));
vi.mock("@/lib/server/webhook-security", () => ({
  safeWebhookFetch: mocks.fetch,
  validateWebhookUrl: mocks.validate,
}));
vi.mock("@/lib/server/encryption", () => ({
  decrypt: (v: string) => v,
  encrypt: (v: string) => `encrypted:${v}`,
  verifySecret: (s: string, h: string) => s === h,
}));
import {
  api,
  startAutomation,
  automationControl,
  whatsappStatus,
  getProspectionSettings,
} from "../src/lib/server/automation.server";
import { saveResults } from "../src/lib/server/results.server";
const searchId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const runId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const userId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const webhook = "https://n8n.example.com/webhook/scanradar-prospeccao";
const scope = { searchId, automationRunId: runId, executionId: "184" };
const state = {
  ready: true,
  configured: true,
  availableCount: 1,
  blocked: true,
  canStart: false,
  sheetUrl: null,
  sheetName: null,
  reason: null,
  run: null,
};
let result = "created";
let validAuth = true;
let calls: any[] = [];
function request(path: string, body: any, headers: Record<string, string> = {}) {
  return new Request(`https://scanradar.example${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer user-session",
      "Idempotency-Key": "attempt-0001",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  result = "created";
  validAuth = true;
  mocks.auth.mockImplementation(async () => ({
    data: { user: validAuth ? { id: userId } : null },
    error: null,
  }));
  mocks.from.mockImplementation((table: string) => {
    const filters: Record<string, string> = {};
    const q: any = {
      select: () => q,
      eq: (key: string, value: string) => {
        filters[key] = value;
        return q;
      },
      maybeSingle: async () => {
        if (table === "searches")
          return {
            data:
              filters["user_id"] && filters["user_id"] !== userId
                ? null
                : { id: searchId, user_id: userId, cidade: "Rio", uf: "RJ", status: "completed" },
            error: null,
          };
        return {
          data: {
            prospection_webhook_url: webhook,
            prospection_header_name: "X-Webhook-Secret",
            webhook_secret: "PRIVATE_HEADER",
            callback_secret_hash: "PRIVATE_CALLBACK",
          },
          error: null,
        };
      },
    };
    return q;
  });
  mocks.rpc.mockImplementation(async (name: string, params: any) => {
    calls.push({ name, params });
    if (name === "start_automation_run")
      return { data: { status: result, run: { id: runId } }, error: null };
    if (name === "get_automation_status") return { data: state, error: null };
    if (name === "claim_automation_run_v3")
      return { data: { accepted: false, reason: "denied" }, error: null };
    if (name === "reserve_contact")
      return { data: { allowed: false, reason: "denied" }, error: null };
    return { data: { success: true, automationRunId: runId }, error: null };
  });
  mocks.validate.mockResolvedValue({ valid: true });
  mocks.fetch.mockResolvedValue(new Response(null, { status: 202 }));
});
describe("HTTP orchestration and authentication (database behavior tested separately)", () => {
  test("authenticated start commits RPC before one webhook and sends only IDs", async () => {
    mocks.fetch.mockImplementation(async () => {
      expect(calls[0].name).toBe("start_automation_run");
      return new Response(null, { status: 202 });
    });
    const response = await api(() =>
      startAutomation(request("/api/automations/start", { searchId })),
    );
    expect(response.status).toBe(202);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const init = mocks.fetch.mock.calls[0][1];
    expect(JSON.parse(init.body)).toEqual({ searchId, automationRunId: runId });
    expect(init.headers["X-Webhook-Secret"]).toBe("PRIVATE_HEADER");
    expect(await response.text()).not.toContain("PRIVATE");
  });
  test("same idempotency retry never redispatches", async () => {
    result = "existing";
    await api(() => startAutomation(request("/api/automations/start", { searchId })));
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  test("timeout and n8n 409 invoke guarded update; neither triggers a second delivery", async () => {
    for (const fail of ["timeout", "409"]) {
      mocks.fetch.mockImplementationOnce(async () => {
        if (fail === "timeout") throw new Error("timeout");
        return new Response(null, { status: 409 });
      });
      expect(
        (await api(() => startAutomation(request("/api/automations/start", { searchId })))).status,
      ).toBe(202);
    }
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(calls.filter((x) => x.name === "mark_automation_dispatch_unknown")).toHaveLength(2);
  });
  test("invalid session and injected sheet metadata cannot create runs", async () => {
    validAuth = false;
    expect(
      (await api(() => startAutomation(request("/api/automations/start", { searchId })))).status,
    ).toBe(401);
    validAuth = true;
    expect(
      (
        await api(() =>
          startAutomation(request("/api/automations/start", { searchId, sheetName: "Leads" })),
        )
      ).status,
    ).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  test("callback authentication must succeed before calling privileged RPC", async () => {
    expect(
      (
        await api(() =>
          automationControl(
            request(
              "/api/public/automation-control",
              { ...scope, action: "claim" },
              { "X-Callback-Secret": "wrong" },
            ),
          ),
        )
      ).status,
    ).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  test("business denial is HTTP200 with exact accepted/allowed boolean", async () => {
    const response = await api(() =>
      automationControl(
        request(
          "/api/public/automation-control",
          { ...scope, action: "claim" },
          { "X-Callback-Secret": "PRIVATE_CALLBACK" },
        ),
      ),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).accepted).toBe(false);
  });
  test("phone-only callback rejected and raw message text does not replace boolean", async () => {
    const old = request(
      "/api/public/whatsapp-status",
      { telefone: "5521999991111", status: "enviado", mensagem_enviada: "Oi" },
      { "X-Callback-Secret": "PRIVATE_CALLBACK" },
    );
    expect((await api(() => whatsappStatus(old))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  test("57 research leads remain complete while list contains only32", async () => {
    const leads = Array.from({ length: 57 }, (_, i) => ({
      lead_key: `key-${i}`,
      nome: `Empresa ${i}`,
      telefone: i < 50 ? `55219999${String(i).padStart(4, "0")}` : "",
      website: i < 18 ? "https://example.com" : "",
    }));
    const doc = "1rsDDI26rMRg_1qeTh7t7IGHwsKwymBUgUCYS2_tsvPQ";
    const response = await api(() =>
      saveResults(
        request(
          "/api/public/results",
          {
            searchId,
            status: "completed",
            leads,
            prospection: {
              schemaVersion: 2,
              ready: true,
              spreadsheetId: doc,
              sheetId: 0,
              sheetName: `Dentista - ${searchId}`,
              sheetUrl: `https://docs.google.com/spreadsheets/d/${doc}/edit#gid=0`,
              eligibleCount: 32,
              eligibleLeadKeys: leads.slice(18, 50).map((l) => l.lead_key),
            },
          },
          { "X-Callback-Secret": "PRIVATE_CALLBACK" },
        ),
      ),
    );
    expect(response.status).toBe(200);
    expect(calls[0].name).toBe("complete_search_with_prospection");
    expect(calls[0].params.p_leads).toHaveLength(57);
    expect(calls[0].params.p_prospection.eligibleLeadKeys).toHaveLength(32);
  });
  test("settings response never includes the saved URL or secrets", async () => {
    const settings = JSON.stringify(await getProspectionSettings(userId));
    expect(settings).not.toContain(webhook);
    expect(settings).not.toContain("PRIVATE");
  });
});
