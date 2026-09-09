import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: mocks.rpc, from: mocks.from, auth: { getUser: vi.fn() } },
}));
vi.mock("@/lib/server/webhook-security", () => ({
  safeWebhookFetch: vi.fn(),
  validateWebhookUrl: vi.fn(),
}));
vi.mock("@/lib/server/encryption", () => ({
  decrypt: (v: string) => v,
  encrypt: (v: string) => v,
  verifySecret: (s: string, h: string) => s === h,
}));

import { api, automationControl, whatsappStatus } from "../src/lib/server/automation.server";

const searchId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const runId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const userId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const scope = { protocolVersion: 3, searchId, automationRunId: runId, executionId: "196" };

// Rows the adapter must read back; tests mutate these to simulate real persistence outcomes.
const rows = {
  run: {} as Record<string, unknown>,
  reservation: null as Record<string, unknown> | null,
  lead: null as Record<string, unknown> | null,
};

const rpcReturns = (value: unknown) =>
  mocks.rpc.mockImplementation(async () => ({ data: value, error: null }));

function post(path: string, body: unknown) {
  return new Request(`https://scanradar.example${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Callback-Secret": "SECRET" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  rows.run = {
    id: runId,
    search_id: searchId,
    state: "running",
    n8n_execution_id: "196",
    sheet_id: 1519394276,
  };
  rows.reservation = { state: "sending", attempt_key: "attempt-1" };
  rows.lead = { status: "enviado", mensagem_enviada: true };
  mocks.from.mockImplementation((table: string) => {
    const q: Record<string, unknown> = {};
    const chain = () => q;
    Object.assign(q, {
      select: chain,
      eq: chain,
      maybeSingle: async () => {
        if (table === "searches")
          return { data: { id: searchId, user_id: userId, status: "completed" }, error: null };
        if (table === "n8n_settings")
          return { data: { callback_secret_hash: "SECRET" }, error: null };
        if (table === "automation_events") return {data:{event_type:"sent"},error:null};
        if (table === "automation_runs") return { data: rows.run, error: null };
        if (table === "contact_reservations") return { data: rows.reservation, error: null };
        return { data: rows.lead, error: null };
      },
    });
    return q;
  });
});

async function call(path: string, body: unknown) {
  const response = await api(() =>
    path.includes("whatsapp") ? whatsappStatus(post(path, body)) : automationControl(post(path, body)),
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}
const control = (body: unknown) => call("/api/public/automation-control", body);

describe("protocol 3 HTTP adapter over real RPC payloads", () => {
  test("claim completes the legacy RPC payload with protocolVersion and real metadata", async () => {
    rpcReturns({
      accepted: true,
      searchId,
      automationRunId: runId,
      executionId: "196",
      offerDescription: "Oferta real",
      prospection: {
        schemaVersion: 2,
        ready: true,
        spreadsheetId: "1rsDDI26",
        sheetId: 1519394276,
        sheetName: `dentista - ${searchId}`,
        sheetUrl: "https://docs.google.com/spreadsheets/d/1rsDDI26/edit#gid=1519394276",
        eligibleCount: 1,
        eligibleLeadKeys: ["k1"],
      },
    });
    const { status, body } = await control({ ...scope, action: "claim" });
    expect(status).toBe(200);
    expect(body["protocolVersion"]).toBe(3);
    expect(body["accepted"]).toBe(true);
    expect(body["executionId"]).toBe("196");
    expect((body["prospection"] as Record<string, unknown>)["sheetId"]).toBe(1519394276);
    expect(body["offerDescription"]).toBe("Oferta real");
  });

  test("claim is refused when the sheet metadata is incomplete", async () => {
    rpcReturns({
      accepted: true,
      prospection: {
        schemaVersion: 2,
        ready: true,
        spreadsheetId: "1rsDDI26",
        sheetId: null,
        sheetName: "aba",
        sheetUrl: null,
        eligibleCount: 1,
        eligibleLeadKeys: ["k1"],
      },
    });
    const { body } = await control({ ...scope, action: "claim" });
    expect(body["accepted"]).toBe(false);
    expect(body["protocolVersion"]).toBe(3);
  });

  test("claim is refused when the run was not actually bound to the execution", async () => {
    rows.run["state"] = "queued";
    rpcReturns({ accepted: true, prospection: null });
    expect((await control({ ...scope, action: "claim" })).body["accepted"]).toBe(false);
  });

  test("check reports the persisted state and a stop directive while cancelling", async () => {
    rpcReturns({ continue: false, state: "cancelling", cancelRequested: true });
    const { body } = await control({ ...scope, action: "check" });
    expect(body).toMatchObject({
      protocolVersion: 3,
      searchId,
      automationRunId: runId,
      executionId: "196",
      state: "cancelling",
      directive: "stop",
    });
  });

  test("begin_send only authorises when the reservation is really stored as sending", async () => {
    rpcReturns({ allowed: true });
    const payload = {
      ...scope,
      action: "begin_send",
      lead_key: "k1",
      telefone: "5521999991111",
      attemptKey: "attempt-1",
    };
    const ok = await control(payload);
    expect(ok.body).toMatchObject({
      protocolVersion: 3,
      allowed: true,
      lead_key: "k1",
      attemptKey: "attempt-1",
      directive: "continue",
    });
    rows.reservation = { state: "reserved", attempt_key: null };
    const denied = await control(payload);
    expect(denied.body["allowed"]).toBe(false);
    expect(denied.body["reason"]).toBeTruthy();
  });

  test("reserve denial keeps protocol fields and never claims success", async () => {
    rpcReturns({ allowed: false, reason: "Contato já processado no histórico" });
    const { body } = await control({
      ...scope,
      action: "reserve",
      lead_key: "k1",
      telefone: "5521999991111",
    });
    expect(body).toMatchObject({ protocolVersion: 3, allowed: false, directive: "continue" });
    expect(body["reason"]).toBe("Contato já processado no histórico");
  });

  test("legacy finish payload is completed with the real persisted terminal state", async () => {
    rows.run["state"] = "completed_with_errors";
    rpcReturns({ success: true, automationRunId: runId });
    const { status, body } = await control({
      ...scope,
      action: "finish",
      stopAcknowledged: true,
      status: "completed",
      summary: null,
      issues: [],
    });
    expect(status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      protocolVersion: 3,
      automationRunId: runId,
      state: "completed_with_errors",
    });
  });

  test("finish never confirms while the run has no terminal state persisted", async () => {
    rpcReturns({ success: true, automationRunId: runId });
    const { status, body } = await control({
      ...scope,
      action: "finish",
      stopAcknowledged: true,
      status: "completed",
      summary: null,
      issues: [],
    });
    expect(status).toBe(409);
    expect(body["success"]).toBe(false);
    expect(body["state"]).toBe("running");
  });

  test("whatsapp status confirms only after lead and reservation are written", async () => {
    rpcReturns({ success: true });
    rows.reservation = { state: "sent" };
    const payload = {
      ...scope,
      lead_key: "k1",
      telefone: "5521999991111",
      status: "enviado",
      mensagem_enviada: true,
      attemptKey: "attempt-1",
    };
    const ok = await call("/api/public/whatsapp-status", payload);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({
      success: true,
      protocolVersion: 3,
      searchId,
      automationRunId: runId,
      executionId: "196",
      lead_key: "k1",
      persistedStatus: "enviado",
    });
    rows.lead = { status: "pendente", mensagem_enviada: false };
    const bad = await call("/api/public/whatsapp-status", payload);
    expect(bad.status).toBe(409);
    expect(bad.body["success"]).toBe(false);
  });

  test("a non-numeric or wrong protocol version is rejected before any RPC", async () => {
    const { status } = await control({ ...scope, protocolVersion: "3", action: "check" });
    expect(status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
