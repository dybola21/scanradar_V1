import { describe, expect, test } from "vitest";
import {
  controlSchema,
  whatsappSchema,
  validateProspection,
  PROSPECTION_SPREADSHEET_ID,
} from "../src/lib/automation-contract";
import { verifySecret, hashSecret } from "../src/lib/server/encryption";
const searchId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const scope = {
  searchId,
  automationRunId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  executionId: "184",
};
const metadata = {
  schemaVersion: 2,
  ready: true,
  spreadsheetId: PROSPECTION_SPREADSHEET_ID,
  sheetId: 0,
  sheetName: `Dentista - ${searchId}`,
  sheetUrl: `https://docs.google.com/spreadsheets/d/${PROSPECTION_SPREADSHEET_ID}/edit#gid=0`,
  eligibleCount: 1,
  eligibleLeadKeys: ["key1"],
};
describe("n8n contracts", () => {
  test("sheet ID zero, full search ID and exact eligible keys", () => {
    expect(validateProspection(metadata, searchId, new Set(["key1"])).sheetId).toBe(0);
    for (const patch of [
      { sheetName: "Leads" },
      { sheetId: null },
      { spreadsheetId: "foreign" },
      { eligibleLeadKeys: ["key2"] },
      { eligibleLeadKeys: ["key1", "key1"], eligibleCount: 2 },
      { eligibleCount: 2 },
      { sheetUrl: "https://attacker.example/sheet" },
    ]) {
      expect(() =>
        validateProspection({ ...metadata, ...patch }, searchId, new Set(["key1"])),
      ).toThrow();
    }
  });
  test("failed provisioning accepts null sheet IDs and zero/partial lists", () => {
    expect(
      validateProspection(
        { ...metadata, ready: false, sheetId: null, sheetUrl: null },
        searchId,
        new Set(["key1"]),
      ).ready,
    ).toBe(false);
  });
  test("all control actions match workflow payloads; full scope is mandatory", () => {
    for (const body of [
      { ...scope, action: "claim" },
      { ...scope, action: "reserve", lead_key: "key1", telefone: "5521999991111" },
      {
        ...scope,
        action: "finish",
        stopAcknowledged: true,
        status: "failed",
        summary: null,
        issues: [{ message: "timeout" }],
        message: "timeout",
      },
    ]) {
      expect(controlSchema.safeParse(body).success).toBe(true);
    }
    expect(controlSchema.safeParse({ ...scope, executionId: null, action: "claim" }).success).toBe(
      false,
    );
  });
  test("WhatsApp status requires real boolean, matching status and scoped identity", () => {
    const valid = {
      ...scope,
      lead_key: "key1",
      telefone: "5521999991111",
      status: "enviado",
      mensagem_enviada: true,
      data_envio: "2026-09-07T12:00:00.000Z",
      messageText: "Oi",
    };
    expect(whatsappSchema.safeParse(valid).success).toBe(true);
    expect(whatsappSchema.safeParse({ ...valid, mensagem_enviada: "false" }).success).toBe(false);
    expect(whatsappSchema.safeParse({ ...valid, mensagem_enviada: false }).success).toBe(false);
    expect(
      whatsappSchema.safeParse({
        telefone: valid.telefone,
        status: "enviado",
        mensagem_enviada: true,
      }).success,
    ).toBe(false);
  });
  test("malformed callback hashes fail closed without throwing", () => {
    expect(verifySecret("test", hashSecret("test"))).toBe(true);
    expect(verifySecret("wrong", hashSecret("test"))).toBe(false);
    expect(verifySecret("test", "bad-hash")).toBe(false);
  });
});
