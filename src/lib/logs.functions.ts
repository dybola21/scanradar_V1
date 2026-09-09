import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const eventTypeSchema = z.enum([
  'FLOW_STARTED',
  'START_SEARCH_ENTERED',
  'AUTH_SUCCESS',
  'AUTH_ERROR',
  'SEARCH_INSERT_SUCCESS',
  'SEARCH_INSERT_ERROR',
  'N8N_REQUEST_ATTEMPT',
  'SEARCH_CREATED', 
  'SEARCH_DELETED',
  'LEADS_DELETED',
  'LOGS_CLEARED',
  'SETTINGS_UPDATED',
  'INTEGRATION_TESTED',
  'N8N_REQUEST_SENT', 
  'N8N_RESPONSE_RECEIVED', 
  'N8N_TIMEOUT',
  'N8N_ERROR', 
  'CALLBACK_RECEIVED', 
  'CALLBACK_VALIDATED', 
  'RESULTS_SAVED', 
  'RESULTS_FETCHED', 
  'FRONTEND_ERROR', 
  'SYSTEM_ERROR',
  'AUTH_ACTION'

]);

const eventStatusSchema = z.enum(['started', 'success', 'failed', 'warning']);

export const logScanEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({
    searchId: z.string().uuid().optional(),
    eventType: eventTypeSchema,
    eventStatus: eventStatusSchema,
    message: z.string().optional(),
    payload: z.any().optional(),
    errorMessage: z.string().optional(),
    httpStatus: z.number().optional(),
    durationMs: z.number().optional(),
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { 
      searchId, 
      eventType, 
      eventStatus, 
      message, 
      payload, 
      errorMessage, 
      httpStatus, 
      durationMs 
    } = data;

    // Sanitization: Remove secrets and tokens
    let sanitizedPayload = null;
    if (payload) {
      try {
        sanitizedPayload = JSON.parse(JSON.stringify(payload));
        const sensitiveKeys = ['x-callback-secret', 'X-Webhook-Secret', 'Authorization', 'token', 'secret', 'password', 'key'];
        
        const sanitize = (obj: any) => {
          if (!obj || typeof obj !== 'object') return;
          for (const key in obj) {
            if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
              obj[key] = '[REDACTED]';
            } else if (typeof obj[key] === 'object') {
              sanitize(obj[key]);
            }
          }
        };
        sanitize(sanitizedPayload);
      } catch (e) {
        console.warn("[Logs] Failed to sanitize payload:", e);
        sanitizedPayload = { error: "Failed to sanitize payload" };
      }
    }

    const { error } = await supabase
      .from("scan_logs" as any)
      .insert({
        search_id: searchId,
        user_id: context.userId,
        event_type: eventType,
        event_status: eventStatus,
        message,
        payload: sanitizedPayload,
        error_message: errorMessage,
        http_status: httpStatus,
        duration_ms: durationMs,
      } as any);

    if (error) {
      console.error("[Logs] Failed to persist log:", error);
      return { success: false };
    }

    return { success: true };
  });

export const clearAllLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;

    // A política RLS garante que o usuário só delete logs de suas próprias buscas.
    // Como a tabela scan_logs não tem user_id direto, a política usa um subquery na tabela searches.
    const { error } = await supabase
      .from("scan_logs" as any)
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all matching RLS

    if (error) throw error;
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    await supabaseAdmin.from("scan_logs").insert({
      user_id: context.userId,
      event_type: 'LOGS_CLEARED' as any,
      event_status: 'success',
      message: 'Seus logs foram limpos',
    });
    
    return { success: true };


  });
