import { z } from "zod";
import { uuid } from "./automation-contract";

export const cancelRunSchema = z.object({
  id: uuid,
  state: z.string(),
  executionId: z.string().nullable(),
  lastActivityAt: z.string().datetime({ offset: true }),
  cancelRequestedAt: z.string().datetime({ offset: true }).nullable(),
});
export const cancelContextSchema = z.object({
  canCancel: z.boolean(),
  run: cancelRunSchema.nullable(),
});
// The browser never supplies execution IDs, workflow IDs or n8n URLs.
export const cancelRequestSchema = z
  .object({
    searchId: uuid,
    automationRunId: uuid,
    reason: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();
export const cancelResultSchema = z.object({
  success: z.boolean(),
  state: z.string().optional(),
  verified: z.boolean().optional(),
  alreadyFinished: z.boolean().optional(),
  stopSupported: z.boolean().optional(),
  contactsHeldForReview: z.number().optional(),
  error: z.string().optional(),
});
export const reconcileRequestSchema = z
  .object({ searchId: uuid, automationRunId: uuid })
  .strict();
export const reconcileResultSchema = z.object({
  success: z.boolean(),
  confirmed: z.number(),
  reviewed: z.number(),
  pending: z.number(),
  notes: z.array(z.string()),
});
export type CancelRun = z.infer<typeof cancelRunSchema>;
