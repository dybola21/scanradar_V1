import { z } from "zod";

export const leadSchema = z.object({
  id: z.string(),
  search_id: z.string(),
  nome: z.string().nullable(),
  telefone: z.string().nullable(),
  bairro: z.string().nullable(),
  cidade: z.string().nullable(),
  uf: z.string().nullable(),
  website: z.string().nullable(),
  email: z.string().nullable(),
  email2: z.string().nullable(),
  created_at: z.string(),
  contacted: z.boolean().nullable().optional(),
  status: z.string().nullable().optional(),
  mensagem_enviada: z.boolean().nullable().optional(),
  data_envio: z.string().nullable().optional(),
});

export const searchSchema = z.object({
  termo: z.string().min(1, "Termo é obrigatório"),
  cidade: z.string().min(1, "Cidade é obrigatória"),
  uf: z.string().length(2, "UF deve ter 2 caracteres"),
});

export const searchRecordSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  request_id: z.string(),
  termo: z.string(),
  cidade: z.string(),
  uf: z.string(),
  status: z.enum(["pending", "queued", "processing", "completed", "failed", "delivery_unknown"]),
  total_leads: z.number().nullable(),
  sheet_name: z.string().nullable(),
  sheet_url: z.string().nullable(),
  error_message: z.string().nullable(),
  created_at: z.string(),
  completed_at: z.string().nullable(),
});

// For n8n response validation
export const scraperResponseSchema = z.object({
  resultado: z.object({
    totalLeads: z.number(),
    leads: z.array(z.record(z.any())),
  }),
  googleSheet: z.object({
    name: z.string(),
    url: z.string().url(),
  }).optional(),
});

export type LeadRecord = z.infer<typeof leadSchema>;
export type SearchRecord = z.infer<typeof searchRecordSchema>;
export type SearchInput = z.infer<typeof searchSchema>;
