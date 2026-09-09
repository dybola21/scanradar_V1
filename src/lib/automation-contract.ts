import { z } from "zod";

export const SHARED_CONNECTION_KEY = "scanradar-shared-whatsapp";
export const PROSPECTION_SPREADSHEET_ID = "1rsDDI26rMRg_1qeTh7t7IGHwsKwymBUgUCYS2_tsvPQ";
export const DEFAULT_OFFER = "Criação de sites e agentes de automação para empresas.";
export const ACTIVE_STATES = [
  "queued",
  "running",
  "cancelling",
  "dispatch_unknown",
  "needs_reconciliation",
];
export const uuid = z
  .string()
  .uuid()
  .transform((s) => s.toLowerCase());
const leadKey = z.string().min(1).max(1000);
const attemptKey = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_:-]+$/);
export const scopeSchema = z.object({
  // Protocol 3 marker: when the worker sends it, it must be the numeric 3.
  protocolVersion: z.literal(3).optional(),
  searchId: uuid,
  automationRunId: uuid,
  executionId: z.string().trim().min(1).max(200),
});

// Protocol 3: the worker checks before every send and marks the attempt before dispatching it.
export const controlSchema = z.discriminatedUnion("action", [
  scopeSchema.extend({ action: z.literal("check") }),
  scopeSchema.extend({ action: z.literal("claim") }),
  scopeSchema.extend({
    action: z.literal("reserve"),
    lead_key: leadKey,
    telefone: z.string().min(1).max(80),
  }),
  scopeSchema.extend({
    action: z.literal("begin_send"),
    lead_key: leadKey,
    telefone: z.string().min(1).max(80),
    attemptKey,
  }),
  scopeSchema.extend({
    action: z.literal("finish"),
    status: z.enum(["completed", "completed_with_errors", "failed", "cancelled"]),
    stopAcknowledged: z.literal(true),
    receipts: z.array(z.unknown()).max(10000).default([]),
    summary: z.record(z.unknown()).nullable().default(null),
    issues: z.array(z.unknown()).max(10000).default([]),
    message: z.string().max(3000).nullable().optional(),
  }),
]);
export const whatsappSchema = scopeSchema
  .extend({
    lead_key: leadKey,
    telefone: z.string().min(1).max(80),
    status: z.enum(["enviado", "número inválido"]),
    mensagem_enviada: z.boolean(),
    data_envio: z.string().datetime({ offset: true }).nullable().optional(),
    messageText: z.string().max(20000).optional(),
    messageId: z.string().max(500).nullable().optional(),
    attemptKey: attemptKey.nullable().optional(),
  })
  .refine(
    (p) => p.mensagem_enviada === (p.status === "enviado"),
    "Status e mensagem_enviada divergentes",
  );

export const prospectionSchema = z.object({
  schemaVersion: z.literal(2),
  ready: z.boolean(),
  spreadsheetId: z.string().nullable(),
  sheetId: z.number().int().nonnegative().nullable(),
  sheetName: z.string().max(100).nullable(),
  sheetUrl: z.string().nullable(),
  eligibleCount: z.number().int().nonnegative(),
  eligibleLeadKeys: z.array(leadKey).max(10000),
});
export type Prospection = z.infer<typeof prospectionSchema>;
export function validateProspection(
  value: unknown,
  searchId: string,
  keys: Set<string>,
): Prospection {
  const p = prospectionSchema.parse(value);
  if (
    p.eligibleCount !== p.eligibleLeadKeys.length ||
    new Set(p.eligibleLeadKeys).size !== p.eligibleCount ||
    p.eligibleLeadKeys.some((key) => !keys.has(key))
  )
    throw new Error("Lista de prospecção inconsistente");
  if (
    p.ready &&
    (p.spreadsheetId !== PROSPECTION_SPREADSHEET_ID ||
      p.sheetId === null ||
      !p.sheetName?.endsWith(` - ${searchId}`) ||
      p.sheetUrl !==
        `https://docs.google.com/spreadsheets/d/${p.spreadsheetId}/edit#gid=${p.sheetId}`)
  ) {
    throw new Error("Aba de prospecção inválida para esta pesquisa");
  }
  return p;
}
export const statusSchema = z.object({
  ready: z.boolean(),
  configured: z.boolean(),
  availableCount: z.number(),
  blocked: z.boolean(),
  canStart: z.boolean(),
  sheetUrl: z.string().nullable(),
  sheetName: z.string().nullable(),
  reason: z.string().nullable(),
  run: z
    .object({
      id: uuid,
      state: z.string(),
      executionId: z.string().nullable(),
      stale: z.boolean(),
      canCancel: z.boolean().default(false),
      cancelRequestedAt: z.string().nullable().default(null),
      counts: z.object({
        sent: z.number(),
        invalid: z.number(),
        pending: z.number(),
        reserved: z.number(),
        sending: z.number().default(0),
        skipped: z.number(),
      }),
      summary: z.record(z.unknown()).nullable(),
      startedAt: z.string(),
      lastActivityAt: z.string(),
      finishedAt: z.string().nullable(),
    })
    .nullable(),
});
export type AutomationStatus = z.infer<typeof statusSchema>;
