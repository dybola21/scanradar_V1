import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { searchSchema, scraperResponseSchema } from "./schemas";
import { buildPresenceDistribution, opportunityScore } from "./lead-insights";
import { classifyWebsiteUrl } from "./website-utils";
import { encrypt, decrypt, generateCallbackSecret, hashSecret } from "./server/encryption";
import { safeWebhookFetch } from "./server/webhook-security";
import { serverLogScanEvent } from "./logs.server";

export const getIntegrationSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await (await import("@/integrations/supabase/client.server")).supabaseAdmin
      .from("n8n_settings")
      .select("webhook_url, webhook_secret, integration_name, is_connected, updated_at, callback_secret_hash")
      .eq("user_id", userId)
      .single();

    if (error && error.code !== "PGRST116") throw error;

    return {
      webhook_url: data?.webhook_url || "",
      webhook_secret: data?.webhook_secret ? "••••••••••••••••" : "",
      has_secret: Boolean(data?.webhook_secret),
      has_callback_secret: Boolean(data?.callback_secret_hash),
      integration_name: data?.integration_name || "n8n integration",
      is_connected: data?.is_connected || false,
      updated_at: data?.updated_at ?? null,
    };
  });


export const getIntegrationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await (await import("@/integrations/supabase/client.server")).supabaseAdmin
      .from("n8n_settings")
      .select("webhook_url, is_connected, integration_name")
      .eq("user_id", userId)
      .single();

    if (error && error.code !== "PGRST116") throw error;

    return {
      configured: Boolean(data?.webhook_url),
      is_connected: Boolean(data?.is_connected),
      integration_name: data?.integration_name || "n8n integration",
    };
  });



export const updateIntegrationSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      webhook_url: z.string().url("URL inválida"),
      webhook_secret: z.string().nullable().optional(),
      integration_name: z.string().min(1),
      rotate_callback_secret: z.boolean().optional(),
    })
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { webhook_url, webhook_secret, integration_name, rotate_callback_secret } = data;

    const updateData: any = {
      webhook_url,
      integration_name,
      updated_at: new Date().toISOString(),
    };

    let newCallbackSecret: string | null = null;

    if (rotate_callback_secret) {
      newCallbackSecret = generateCallbackSecret();
      updateData.callback_secret_hash = hashSecret(newCallbackSecret);
    }

    if (webhook_secret) {
      updateData.webhook_secret = encrypt(webhook_secret);
    }

    const { error } = await (await import("@/integrations/supabase/client.server")).supabaseAdmin
      .from("n8n_settings")
      .upsert(
        {
          user_id: userId,
          ...updateData,
        },
        { onConflict: 'user_id' }
      );

    if (error) throw error;

    await serverLogScanEvent({
      userId,
      eventType: 'SETTINGS_UPDATED',
      eventStatus: 'success',
      message: `Configurações do n8n atualizadas${rotate_callback_secret ? ' (Segredo de callback rotacionado)' : ''}`,
      payload: { 
        webhook_url, 
        integration_name,
        has_secret: !!webhook_secret,
        rotated_callback: !!rotate_callback_secret
      }
    });

    return { success: true, callbackSecret: newCallbackSecret };

  });


export const testIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: settings, error: settingsError } = await (await import("@/integrations/supabase/client.server")).supabaseAdmin
      .from("n8n_settings")
      .select("webhook_url, webhook_secret")
      .eq("user_id", userId)
      .single();

    if (settingsError || !settings?.webhook_url) {
      return { success: false, error: "Integração não configurada" };
    }

    const webhookUrl = settings.webhook_url!;

    try {
      const secret = settings.webhook_secret ? decrypt(settings.webhook_secret) : "";
      
      const response = await safeWebhookFetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-Webhook-Secret": secret,
        },
        body: JSON.stringify({ 
          requestType: "connection_test", 
          test: true 
        }),
      });

      if (response.status === 200 || response.status === 204) {
        await (await import("@/integrations/supabase/client.server")).supabaseAdmin
          .from("n8n_settings")
          .update({ is_connected: true })
          .eq("user_id", userId);
        await serverLogScanEvent({
      userId,
          eventType: 'INTEGRATION_TESTED',
          eventStatus: 'success',
          message: 'Teste de integração com n8n concluído com sucesso',
          payload: { webhookUrl }
        });
        return { success: true };

      } else if (response.status === 401 || response.status === 403) {
        await serverLogScanEvent({
      userId,
          eventType: 'INTEGRATION_TESTED',
          eventStatus: 'failed',
          httpStatus: response.status,
          message: 'Teste de integração falhou: Chave recusada (401/403)'
        });
        return {

          success: false,
          error: "A chave de segurança foi recusada.",
        };
      } else {
        return {
          success: false,
          error: `O n8n retornou erro: ${response.status}`,
        };
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message?.includes('timeout')) {
        await serverLogScanEvent({
      userId,
          eventType: 'INTEGRATION_TESTED',
          eventStatus: 'failed',
          message: 'Teste de integração falhou: Timeout'
        });
        return { success: false, error: "O n8n não respondeu dentro do tempo esperado." };

      }
      return { success: false, error: "Erro ao conectar com o n8n" };
    }
  });

export const startSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(searchSchema)
  .handler(async ({ data, context }) => {
    try {
      const { supabase, userId } = context;
      
      await serverLogScanEvent({
      userId,
        eventType: 'START_SEARCH_ENTERED',
        eventStatus: 'started',
        message: 'Função startSearch iniciada no servidor',
        payload: { ...data, userId }
      });

      await serverLogScanEvent({
      userId,
        eventType: 'AUTH_SUCCESS',
        eventStatus: 'success',
        message: 'Autenticação validada com sucesso',
        payload: { userId }
      });

      console.log(`[Scraper] startSearch BEGIN - User: ${userId}`, data);

    const termo = data.termo.trim();
    const cidade = data.cidade.trim();
    const uf = data.uf.toUpperCase();

    if (!termo || !cidade || !uf) {
      throw new Error("Preencha nicho, cidade e estado.");
    }

    // Check for ongoing identical searches
    const { data: ongoing } = await supabase
      .from("searches")
      .select("id, status")
      .eq("user_id", userId)
      .eq("termo", termo)
      .eq("cidade", cidade)
      .eq("uf", uf)
      .in("status", ["pending", "queued", "processing"])
      .limit(1)
      .maybeSingle();

    if (ongoing) {
      return { success: true, searchId: ongoing.id, status: ongoing.status, repeated: true };
    }

    let settings;
    try {
      const { data, error: settingsError } = await (await import("@/integrations/supabase/client.server")).supabaseAdmin
        .from("n8n_settings")
        .select("webhook_url, webhook_secret")
        .eq("user_id", userId)
        .single();

      if (settingsError || !data?.webhook_url) {
        throw new Error(settingsError?.message || "Integração n8n não configurada no banco de dados.");
      }
      settings = data;
    } catch (configError: any) {
      await serverLogScanEvent({
      userId,
        eventType: 'SYSTEM_ERROR',
        eventStatus: 'failed',
        errorMessage: String(configError.message || configError),
        message: 'Falha ao recuperar configurações do n8n',
        payload: { userId }
      });
      console.error("[Scraper] n8n configuration error:", configError);
      throw configError;
    }


    const requestId = crypto.randomUUID();

    const { data: searchRecord, error: searchError } = await supabase
      .from("searches")
      .insert({
        user_id: userId,
        request_id: requestId,
        termo,
        cidade,
        uf,
        status: "queued",
      })
      .select()
      .single();

    if (searchError) {
      await serverLogScanEvent({
      userId,
        eventType: 'SEARCH_INSERT_ERROR',
        eventStatus: 'failed',
        errorMessage: String(searchError.message || searchError),
        message: 'Erro ao inserir busca no banco de dados',
        payload: { error: searchError }
      });
      console.error("[Scraper] Database insert error:", searchError);
      throw searchError;
    }

    await serverLogScanEvent({
      userId,
      searchId: searchRecord.id,
      eventType: 'SEARCH_INSERT_SUCCESS',
      eventStatus: 'success',
      message: 'Busca inserida no banco de dados',
      payload: { searchId: searchRecord.id }
    });

    await serverLogScanEvent({
      userId,
      searchId: searchRecord.id,
      eventType: 'SEARCH_CREATED',
      eventStatus: 'success',
      message: `Busca criada no banco de dados: ${termo} em ${cidade}/${uf}`,
      payload: { termo, cidade, uf, userId }
    });

    try {
      console.log(`[Scraper] startSearch - DB Record ready: ${searchRecord.id}. Delegating to API route.`);

      // Legacy support: We still return success here, but the actual dispatch 
      // should now be handled by the frontend calling /api/public/start-search
      // or we can trigger it from here if needed. 
      // User requested "Substituir a arquitetura", and wants the frontend to call the API.
      // So this server function will now only handle the DB creation part.

      return { 
        success: true, 
        searchId: searchRecord.id, 
        status: "queued",
        repeated: false 
      };
    } catch (err: any) {
      console.error("[Scraper] Legacy block error (should not be reached):", err);
      return { 
        success: false, 
        searchId: searchRecord.id, 
        status: "failed",
        error: String(err)
      };
    }
  } catch (globalError: any) {
    console.error("[Scraper] startSearch GLOBAL ERROR:", globalError);
    
    await serverLogScanEvent({
      userId: context.userId,
      eventType: 'SYSTEM_ERROR',
      eventStatus: 'failed',
      errorMessage: String(globalError.message || globalError),
      message: 'Erro inesperado na função startSearch (DB setup)',
      payload: { errorName: globalError.name, stack: globalError.stack }
    });
    
    throw globalError;
  }
});


export const checkSearchStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ searchId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: search } = await supabase
      .from("searches")
      .select("status")
      .eq("id", data.searchId)
      .eq("user_id", userId)
      .single();
    
    return search;
  });


export const getSearchHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("searches")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data;
  });

export const getSearchDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ searchId: z.string() }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { searchId } = data;

    const { data: search, error: searchError } = await supabase
      .from("searches")
      .select("*")
      .eq("id", searchId)
      .eq("user_id", userId)
      .maybeSingle();

    if (searchError) throw searchError;
    if (!search) return { search: null, leads: [] };


    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select("*")
      .eq("search_id", searchId);

    if (leadsError) throw leadsError;

    return { search, leads };
  });

export const toggleLeadContacted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ leadId: z.string().uuid(), contacted: z.boolean() }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { leadId, contacted } = data;

    // Verify the lead belongs to a search owned by the user
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, search_id")
      .eq("id", leadId)
      .maybeSingle();

    if (leadError) throw leadError;
    if (!lead) throw new Error("Lead não encontrado");

    const { data: owned, error: ownedError } = await supabase
      .from("searches")
      .select("id")
      .eq("id", lead.search_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (ownedError || !owned) throw new Error("Lead não encontrado");

    const { error } = await supabase
      .from("leads")
      .update({ contacted })
      .eq("id", leadId);

    if (error) throw error;

    await serverLogScanEvent({
      userId,
      searchId: lead.search_id,
      eventType: 'AUTH_ACTION',
      eventStatus: 'success',
      message: `Lead marcado como ${contacted ? 'contatado' : 'não contatado'}`,
      payload: { leadId, contacted }
    });

    return { success: true, leadId, contacted };
  });

export const deleteSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ searchId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: owned, error: ownedError } = await supabase
      .from("searches")
      .select("id")
      .eq("id", data.searchId)
      .eq("user_id", userId)
      .maybeSingle();

    if (ownedError || !owned) throw new Error("Busca não encontrada");

    // Deletar leads associados (leads são dados de resultado que devem sumir com a busca)
    // A exclusão em cascata acontece apenas depois da verificação da trava no banco.
    
    // Deletar a busca
    // Como alteramos a FK para ON DELETE SET NULL, os registros em scan_logs permanecerão
    // mas com search_id = NULL.
    const { error } = await supabase
      .from("searches")
      .delete()
      .eq("id", data.searchId)
      .eq("user_id", userId);

    if (error) throw error;

    // Registrar log de exclusão (sem search_id vinculado, mas com info no payload)
    await serverLogScanEvent({
      userId,
      eventType: 'SEARCH_DELETED',
      eventStatus: 'success',
      message: 'Busca excluída pelo usuário (Logs preservados)',
      payload: { 
        deletedSearchId: data.searchId,
        deletedBy: userId,
        timestamp: new Date().toISOString()
      }
    });

    return { success: true };

  });

export const getDashboardStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({ days: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(0)]).default(30) }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { days } = data;

    const since =
      days === 0
        ? null
        : new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    let searchQuery = supabase
      .from("searches")
      .select("id, total_leads, status, created_at, termo, cidade, uf")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (since) searchQuery = searchQuery.gte("created_at", since);

    const { data: searches, error: searchesError } = await searchQuery;
    if (searchesError) throw searchesError;

    const rows = searches ?? [];
    const searchIds = rows.map((s) => s.id);

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const searchesToday = rows.filter((s) => s.created_at >= startOfToday).length;

    const base = {
      totalSearches: rows.length,
      completedSearches: rows.filter((s) => s.status === "completed").length,
      runningSearches: rows.filter((s) => s.status === "processing" || s.status === "pending").length,
      failedSearches: rows.filter((s) => s.status === "failed").length,
      searchesToday,
      recentSearches: rows.slice(0, 6),
    };

    if (searchIds.length === 0) {
      return {
        ...base,
        totalLeads: 0,
        leadsToday: 0,
        leadsWithEmail: 0,
        leadsWithPhone: 0,
        leadsWithoutWebsite: 0,
        leadsWithWebsite: 0,
        opportunityRate: 0,
        distribution: [],
        priorityOpportunities: [],
      };
    }

    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select("id, nome, telefone, email, email2, website, cidade, uf, search_id, created_at")
      .in("search_id", searchIds)
      .limit(5000);

    if (leadsError) throw leadsError;

    const leadRows = leads ?? [];
    const totalLeads = leadRows.length;
    const leadsWithEmail = leadRows.filter((l) => Boolean(l.email || l.email2)).length;
    const leadsWithPhone = leadRows.filter((l) => Boolean(l.telefone)).length;

    const classified = leadRows.map((l) => ({ lead: l, c: classifyWebsiteUrl(l.website) }));
    const leadsWithoutWebsite = classified.filter((x) => x.c.hasOwnWebsite === false).length;
    const leadsWithWebsite = classified.filter((x) => x.c.hasOwnWebsite === true).length;

    const todaySearchIds = new Set(rows.filter((s) => s.created_at >= startOfToday).map((s) => s.id));
    const leadsToday = leadRows.filter((l) => todaySearchIds.has(l.search_id)).length;

    const priorityOpportunities = classified
      .filter((x) => x.c.hasOwnWebsite === false)
      .sort((a, b) => {
        const byScore = opportunityScore(a.c.type) - opportunityScore(b.c.type);
        if (byScore !== 0) return byScore;
        const contactA = (a.lead.telefone ? 1 : 0) + (a.lead.email || a.lead.email2 ? 1 : 0);
        const contactB = (b.lead.telefone ? 1 : 0) + (b.lead.email || b.lead.email2 ? 1 : 0);
        return contactB - contactA;
      })
      .slice(0, 6)
      .map((x) => ({
        id: x.lead.id,
        nome: x.lead.nome,
        telefone: x.lead.telefone,
        email: x.lead.email || x.lead.email2,
        cidade: x.lead.cidade,
        uf: x.lead.uf,
        searchId: x.lead.search_id,
        presenceType: x.c.type,
        presenceLabel: x.c.label,
      }));

    return {
      ...base,
      totalLeads,
      leadsToday,
      leadsWithEmail,
      leadsWithPhone,
      leadsWithoutWebsite,
      leadsWithWebsite,
      opportunityRate: totalLeads ? Math.round((leadsWithoutWebsite / totalLeads) * 100) : 0,
      distribution: buildPresenceDistribution(leadRows.map((l) => l.website)),
      priorityOpportunities,
    };
  });

