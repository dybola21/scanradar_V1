import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
export const getProspectionSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const server = await import("./server/automation.server");
    return server.getProspectionSettings(context.userId);
  });
export const saveProspectionSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      webhookUrl: z.string().optional(),
      headerName: z.string(),
      offerDescription: z.string(),
    }),
  )
  .handler(async ({ data, context }) => {
    const server = await import("./server/automation.server");
    return server.saveProspectionSettings(context.userId, data);
  });
