import { describe, expect, test } from "vitest";
import { ACTIVE_STATES, controlSchema, whatsappSchema } from "../src/lib/automation-contract";
import { cancelRequestSchema } from "../src/lib/automation-cancel-contract";
import { readN8nConfig, collectEvolutionEvidence } from "../src/lib/server/n8n-api.server";

const scope = {
  searchId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  automationRunId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  executionId: "191",
};
describe("protocol 3", () => {
  test("cancelling counts as an active run everywhere", () => {
    expect(ACTIVE_STATES).toContain("cancelling");
  });
  test("check and begin_send are part of the control contract", () => {
    expect(controlSchema.safeParse({ ...scope, action: "check" }).success).toBe(true);
    expect(
      controlSchema.safeParse({
        ...scope,
        action: "begin_send",
        lead_key: "key1",
        telefone: "5521999991111",
        attemptKey: "attempt-1",
      }).success,
    ).toBe(true);
    expect(
      controlSchema.safeParse({
        ...scope,
        action: "begin_send",
        lead_key: "key1",
        telefone: "5521999991111",
      }).success,
    ).toBe(false);
  });
  test("status callback carries the attempt key and stays strict", () => {
    const valid = {
      ...scope,
      lead_key: "key1",
      telefone: "5521999991111",
      status: "enviado",
      mensagem_enviada: true,
      attemptKey: "attempt-1",
    };
    expect(whatsappSchema.safeParse(valid).success).toBe(true);
    expect(whatsappSchema.safeParse({ ...valid, attemptKey: "bad key!" }).success).toBe(false);
  });
  test("cancel body never accepts execution or workflow identifiers from the browser", () => {
    expect(
      cancelRequestSchema.safeParse({
        searchId: scope.searchId,
        automationRunId: scope.automationRunId,
      }).success,
    ).toBe(true);
    expect(
      cancelRequestSchema.safeParse({
        searchId: scope.searchId,
        automationRunId: scope.automationRunId,
        executionId: "191",
      }).success,
    ).toBe(false);
  });
  test("n8n config accepts a configurable HTTPS public API host", () => {
    process.env["N8N_API_KEY"] = "test-key";
    process.env["N8N_PROSPECTION_WORKFLOW_ID"] = "test-workflow";
    for (const base of [
      "http://man.noticiasnatela.blog/api/v1",
      "https://user:password@example.com/api/v1",
      "https://man.noticiasnatela.blog/rest",
    ]) {
      process.env["N8N_API_BASE_URL"] = base;
      expect(readN8nConfig().ok).toBe(false);
    }
    process.env["N8N_API_BASE_URL"] = "https://man.noticiasnatela.blog/api/v1";
    expect(readN8nConfig().ok).toBe(true);
    process.env["N8N_API_BASE_URL"] = "https://new-n8n.example.com/api/v1";
    expect(readN8nConfig().ok).toBe(true);
    delete process.env["N8N_API_BASE_URL"];
    expect(readN8nConfig().ok).toBe(false);
  });
  test("only real Evolution receipts are treated as evidence", () => {
    expect(
      collectEvolutionEvidence({id:"191",data:{resultData:{runData:{
        'Contexto da Pesquisa':[{data:{main:[[{json:scope}]]}}],
        'Enviar Mensagem (Evolution API)1':[{data:{main:[[{json:{ key: { remoteJid: "5521999991111@s.whatsapp.net", id: "MSG1", fromMe:true } }}]]}}]
      }}}},scope),
    ).toHaveLength(1);
    expect(collectEvolutionEvidence({ planilha: [{ telefone: "5521999991111" }] },scope)).toHaveLength(0);
  });
});
