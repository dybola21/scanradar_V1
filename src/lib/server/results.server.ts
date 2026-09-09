import { z } from "zod";
import { authenticateCallback, readBody, rpc, json, ApiError } from "./automation.server";
import { uuid, validateProspection } from "../automation-contract";

const text = z.union([z.string(), z.number()]).transform(String).nullable().optional();
const resultSchema = z.object({
  searchId: uuid,
  status: z.enum(["completed", "failed"]).default("completed"),
  leads: z
    .array(
      z.object({
        lead_key: text,
        place_id: text,
        name: text,
        nome: text,
        phone: text,
        telefone: text,
        address: text,
        endereco: text,
        website: text,
        bairro: text,
        cidade: text,
        uf: text,
        email: text,
        email2: text,
      }),
    )
    .max(10000)
    .default([]),
  sheetName: z.string().nullable().optional(),
  sheetUrl: z.string().url().nullable().optional(),
  message: z.string().max(10000).nullable().optional(),
  prospection: z.unknown().optional(),
  integrationErrors: z.array(z.unknown()).max(10000).default([]),
});
export async function saveResults(request: Request) {
  const body = resultSchema.parse(await readBody(request));
  const search = await authenticateCallback(request, body.searchId);
  const keys = new Set<string>();
  const leads = body.leads
    .map((lead) => {
      const nome = lead.name || lead.nome || "N/A";
      const telefone = lead.phone || lead.telefone || "";
      const lead_key =
        lead.lead_key ||
        `key_${body.searchId}_${nome}_${telefone}`.replace(/\s+/g, "_").toLowerCase();
      return {
        lead_key,
        nome,
        telefone,
        place_id: lead.place_id ?? null,
        endereco: lead.address || lead.endereco || null,
        website: lead.website ?? null,
        bairro: lead.bairro ?? null,
        cidade: lead.cidade || search.cidade,
        uf: lead.uf || search.uf,
        email: lead.email ?? null,
        email2: lead.email2 ?? null,
      };
    })
    .filter((lead) => {
      if (keys.has(lead.lead_key)) return false;
      keys.add(lead.lead_key);
      return true;
    });
  // Do not deduplicate by phone/place/name here: the sheet uses the exact canonical lead_key.
  // Different canonical leads may share a phone; the reservation ledger handles that separately.
  let prospection = null;
  if (body.prospection !== undefined && body.prospection !== null) {
    try {
      prospection = validateProspection(body.prospection, body.searchId, keys);
    } catch {
      throw new ApiError(400, "Metadados da lista individual de prospecção inválidos.");
    }
    if (body.status !== "completed" && prospection.ready)
      throw new ApiError(400, "Pesquisa incompleta não pode liberar prospecção.");
  }
  const result = await rpc("complete_search_with_prospection", {
    p_search_id: body.searchId,
    p_user_id: search.user_id,
    p_status: body.status,
    p_leads: leads,
    p_sheet_name: body.sheetName ?? null,
    p_sheet_url: body.sheetUrl ?? null,
    p_message: body.message ?? null,
    p_prospection: prospection,
    p_errors: body.integrationErrors,
  });
  return json({
    ...z.object({ success: z.boolean() }).passthrough().parse(result),
    scanId: body.searchId,
  });
}
