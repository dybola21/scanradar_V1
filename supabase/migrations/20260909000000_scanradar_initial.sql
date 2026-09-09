-- ScanRadar independente: instalar UMA VEZ em um projeto Supabase vazio.
BEGIN;
DO $$ BEGIN IF to_regclass('public.searches') IS NOT NULL THEN RAISE EXCEPTION 'Instalação inicial exige banco vazio. Não execute sobre uma instalação existente.'; END IF; END $$;
-- 20260906075204_39edf747-24c2-482d-ab71-53bc7a7f7ca3.sql
DO $$ BEGIN
    CREATE TYPE public.app_role AS ENUM ('admin', 'user');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

DO $$ BEGIN
    CREATE POLICY "Users can view their own roles"
    ON public.user_roles
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.n8n_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    webhook_url TEXT,
    webhook_secret TEXT,
    integration_name TEXT DEFAULT 'n8n integration',
    is_connected BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_tested_at TIMESTAMP WITH TIME ZONE,
    last_test_error TEXT,
    callback_secret_hash TEXT
);

GRANT SELECT, INSERT, UPDATE ON public.n8n_settings TO authenticated;
GRANT ALL ON public.n8n_settings TO service_role;

ALTER TABLE public.n8n_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "Users can manage their own settings"
    ON public.n8n_settings
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.searches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    request_id UUID NOT NULL,
    termo TEXT NOT NULL,
    cidade TEXT NOT NULL,
    uf TEXT NOT NULL,
    sheet_name TEXT,
    sheet_url TEXT,
    status TEXT DEFAULT 'pending',
    total_leads INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.searches DROP CONSTRAINT IF EXISTS searches_status_check;
ALTER TABLE public.searches
ADD CONSTRAINT searches_status_check
CHECK (status IN ('pending', 'queued', 'processing', 'completed', 'failed', 'delivery_unknown'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.searches TO authenticated;
GRANT ALL ON public.searches TO service_role;

ALTER TABLE public.searches ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "Users can view their own searches"
    ON public.searches
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE POLICY "Users can insert their own searches"
    ON public.searches
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE POLICY "Users can update their own searches"
    ON public.searches
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE POLICY "Users can delete their own searches"
    ON public.searches
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    search_id UUID REFERENCES public.searches(id) ON DELETE CASCADE NOT NULL,
    nome TEXT,
    telefone TEXT,
    bairro TEXT,
    cidade TEXT,
    uf TEXT,
    website TEXT,
    email TEXT,
    email2 TEXT,
    lead_key TEXT,
    place_id TEXT,
    endereco TEXT,
    contacted BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'pendente',
    mensagem_enviada BOOLEAN NOT NULL DEFAULT false,
    data_envio TIMESTAMPTZ,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'leads_search_id_lead_key_key'
    ) THEN
        ALTER TABLE public.leads
        ADD CONSTRAINT leads_search_id_lead_key_key UNIQUE (search_id, lead_key);
    END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select own leads" ON public.leads;
CREATE POLICY "Users can select own leads"
  ON public.leads FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.searches
      WHERE searches.id = leads.search_id
        AND searches.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert leads to their own searches" ON public.leads;
CREATE POLICY "Users can insert leads to their own searches"
  ON public.leads FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.searches
      WHERE searches.id = leads.search_id
        AND searches.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own leads contacted" ON public.leads;
CREATE POLICY "Users can update own leads contacted"
  ON public.leads FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.searches
      WHERE searches.id = leads.search_id
        AND searches.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.searches
      WHERE searches.id = leads.search_id
        AND searches.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete own leads" ON public.leads;
CREATE POLICY "Users can delete own leads"
  ON public.leads FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.searches
      WHERE searches.id = leads.search_id
        AND searches.user_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS public.scan_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    search_id UUID REFERENCES public.searches(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    event_status TEXT NOT NULL,
    message TEXT,
    payload JSONB,
    error_message TEXT,
    http_status INTEGER,
    duration_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scan_logs TO authenticated;
GRANT ALL ON public.scan_logs TO service_role;

ALTER TABLE public.scan_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "Users can view logs of their own searches"
    ON public.scan_logs
    FOR SELECT
    TO authenticated
    USING (
        search_id IS NULL
        OR EXISTS (
            SELECT 1 FROM public.searches
            WHERE searches.id = scan_logs.search_id
            AND searches.user_id = auth.uid()
        )
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE POLICY "Users can insert logs for their own searches"
    ON public.scan_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (
        search_id IS NULL
        OR EXISTS (
            SELECT 1 FROM public.searches
            WHERE searches.id = scan_logs.search_id
            AND searches.user_id = auth.uid()
        )
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE POLICY "Users can delete logs of their own searches"
    ON public.scan_logs
    FOR DELETE
    TO authenticated
    USING (
        search_id IS NULL
        OR EXISTS (
            SELECT 1 FROM public.searches
            WHERE searches.id = scan_logs.search_id
            AND searches.user_id = auth.uid()
        )
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE OR REPLACE FUNCTION public.complete_search_with_leads(
    p_search_id UUID,
    p_status TEXT,
    p_total_leads INTEGER,
    p_leads JSONB,
    p_sheet_name TEXT DEFAULT NULL,
    p_sheet_url TEXT DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.searches
    SET
        status = p_status,
        total_leads = p_total_leads,
        sheet_name = p_sheet_name,
        sheet_url = p_sheet_url,
        error_message = p_error_message,
        completed_at = CASE WHEN p_status IN ('completed', 'failed') THEN now() ELSE completed_at END
    WHERE id = p_search_id;

    IF p_status = 'completed' AND p_leads IS NOT NULL AND jsonb_array_length(p_leads) > 0 THEN
        INSERT INTO public.leads (
            search_id,
            nome,
            telefone,
            bairro,
            cidade,
            uf,
            website,
            email,
            email2,
            lead_key,
            place_id,
            endereco
        )
        SELECT
            p_search_id,
            (l->>'nome')::TEXT,
            (l->>'telefone')::TEXT,
            (l->>'bairro')::TEXT,
            (l->>'cidade')::TEXT,
            (l->>'uf')::TEXT,
            (l->>'website')::TEXT,
            (l->>'email')::TEXT,
            (l->>'email2')::TEXT,
            (l->>'lead_key')::TEXT,
            (l->>'place_id')::TEXT,
            (l->>'endereco')::TEXT
        FROM jsonb_array_elements(p_leads) AS l
        ON CONFLICT (search_id, lead_key) DO UPDATE SET
            nome = EXCLUDED.nome,
            telefone = EXCLUDED.telefone,
            bairro = EXCLUDED.bairro,
            cidade = EXCLUDED.cidade,
            uf = EXCLUDED.uf,
            website = EXCLUDED.website,
            email = EXCLUDED.email,
            email2 = EXCLUDED.email2,
            place_id = EXCLUDED.place_id,
            endereco = EXCLUDED.endereco;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

REVOKE ALL ON FUNCTION public.complete_search_with_leads(UUID, TEXT, INTEGER, JSONB, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_search_with_leads(UUID, TEXT, INTEGER, JSONB, TEXT, TEXT, TEXT) TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'searches'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.searches;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'leads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
  END IF;
END $$;

-- 20260907175539_63b750b2-9b0a-40a8-9d5b-ad5fdf6108b2.sql
-- 1. Settings columns
ALTER TABLE public.n8n_settings
  ADD COLUMN IF NOT EXISTS prospection_webhook_url text,
  ADD COLUMN IF NOT EXISTS prospection_header_name text DEFAULT 'X-Webhook-Secret',
  ADD COLUMN IF NOT EXISTS offer_description text DEFAULT 'Criação de sites e agentes de automação para empresas.',
  ADD COLUMN IF NOT EXISTS evolution_connection_key text;

-- 2. Prospection sheet per search
CREATE TABLE IF NOT EXISTS public.search_prospection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id uuid NOT NULL UNIQUE REFERENCES public.searches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  schema_version integer NOT NULL DEFAULT 2,
  ready boolean NOT NULL DEFAULT false,
  spreadsheet_id text,
  sheet_id integer,
  sheet_name text,
  sheet_url text,
  eligible_count integer NOT NULL DEFAULT 0,
  eligible_lead_keys text[] NOT NULL DEFAULT '{}',
  integration_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT search_prospection_sheet_id_nonneg CHECK (sheet_id IS NULL OR sheet_id >= 0)
);

GRANT SELECT ON public.search_prospection TO authenticated;
GRANT ALL ON public.search_prospection TO service_role;
ALTER TABLE public.search_prospection ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own prospection" ON public.search_prospection
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 3. Automation runs
CREATE TABLE IF NOT EXISTS public.automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id uuid NOT NULL REFERENCES public.searches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  connection_key text NOT NULL,
  state text NOT NULL DEFAULT 'queued',
  n8n_execution_id text,
  idempotency_key text NOT NULL,
  sheet_spreadsheet_id text,
  sheet_id integer,
  sheet_name text,
  sheet_url text,
  eligible_lead_keys text[] NOT NULL DEFAULT '{}',
  summary jsonb,
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancel_evidence text,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_runs_state_check CHECK (state IN (
    'queued','running','dispatch_unknown','needs_reconciliation',
    'completed','completed_with_errors','failed','cancelled'
  ))
);

GRANT SELECT ON public.automation_runs TO authenticated;
GRANT ALL ON public.automation_runs TO service_role;
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own runs" ON public.automation_runs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE UNIQUE INDEX IF NOT EXISTS automation_runs_active_connection_uidx
  ON public.automation_runs (connection_key)
  WHERE state IN ('queued','running','dispatch_unknown','needs_reconciliation');

CREATE UNIQUE INDEX IF NOT EXISTS automation_runs_idempotency_uidx
  ON public.automation_runs (user_id, idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS automation_runs_execution_uidx
  ON public.automation_runs (n8n_execution_id)
  WHERE n8n_execution_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS automation_runs_search_idx ON public.automation_runs (search_id, created_at DESC);

-- 4. Contact reservations
CREATE TABLE IF NOT EXISTS public.contact_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_key text NOT NULL,
  phone_normalized text NOT NULL,
  run_id uuid REFERENCES public.automation_runs(id) ON DELETE SET NULL,
  search_id uuid REFERENCES public.searches(id) ON DELETE SET NULL,
  lead_key text,
  lead_id uuid,
  user_id uuid,
  state text NOT NULL DEFAULT 'reserved',
  message_text text,
  message_id text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_reservations_state_check CHECK (state IN ('reserved','sent','invalid','needs_review')),
  CONSTRAINT contact_reservations_unique UNIQUE (connection_key, phone_normalized)
);

GRANT SELECT ON public.contact_reservations TO authenticated;
GRANT ALL ON public.contact_reservations TO service_role;
ALTER TABLE public.contact_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own reservations" ON public.contact_reservations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 5. Automation events
CREATE TABLE IF NOT EXISTS public.automation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.automation_runs(id) ON DELETE CASCADE,
  search_id uuid,
  lead_key text NOT NULL DEFAULT '',
  event_type text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_events_unique UNIQUE (run_id, lead_key, event_type)
);

GRANT SELECT ON public.automation_events TO authenticated;
GRANT ALL ON public.automation_events TO service_role;
ALTER TABLE public.automation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own run events" ON public.automation_events
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.automation_runs r WHERE r.id = automation_events.run_id AND r.user_id = auth.uid()
  ));

-- 6. Helpers
CREATE OR REPLACE FUNCTION public.normalize_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE d text;
BEGIN
  IF p_phone IS NULL THEN RETURN NULL; END IF;
  d := regexp_replace(p_phone, '[^0-9]', '', 'g');
  IF d = '' THEN RETURN NULL; END IF;
  IF length(d) IN (10, 11) THEN
    d := '55' || d;
  END IF;
  RETURN d;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS search_prospection_touch ON public.search_prospection;
CREATE TRIGGER search_prospection_touch BEFORE UPDATE ON public.search_prospection
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS automation_runs_touch ON public.automation_runs;
CREATE TRIGGER automation_runs_touch BEFORE UPDATE ON public.automation_runs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS contact_reservations_touch ON public.contact_reservations;
CREATE TRIGGER contact_reservations_touch BEFORE UPDATE ON public.contact_reservations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 7. Store prospection block idempotently
CREATE OR REPLACE FUNCTION public.upsert_search_prospection(
  p_search_id uuid,
  p_user_id uuid,
  p_ready boolean,
  p_spreadsheet_id text,
  p_sheet_id integer,
  p_sheet_name text,
  p_sheet_url text,
  p_eligible_count integer,
  p_eligible_lead_keys text[],
  p_integration_errors jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing public.search_prospection%ROWTYPE;
  has_active boolean;
BEGIN
  SELECT * INTO existing FROM public.search_prospection
    WHERE search_id = p_search_id FOR UPDATE;

  IF FOUND THEN
    SELECT EXISTS (
      SELECT 1 FROM public.automation_runs r
      WHERE r.search_id = p_search_id
        AND r.state IN ('queued','running','dispatch_unknown','needs_reconciliation')
    ) INTO has_active;

    IF has_active THEN
      RETURN jsonb_build_object('updated', false, 'reason', 'active_run');
    END IF;

    IF existing.ready AND NOT p_ready THEN
      RETURN jsonb_build_object('updated', false, 'reason', 'would_downgrade_ready');
    END IF;

    UPDATE public.search_prospection SET
      user_id = p_user_id,
      schema_version = 2,
      ready = p_ready,
      spreadsheet_id = p_spreadsheet_id,
      sheet_id = p_sheet_id,
      sheet_name = p_sheet_name,
      sheet_url = p_sheet_url,
      eligible_count = COALESCE(p_eligible_count, 0),
      eligible_lead_keys = COALESCE(p_eligible_lead_keys, '{}'),
      integration_errors = COALESCE(p_integration_errors, '[]'::jsonb)
    WHERE search_id = p_search_id;

    RETURN jsonb_build_object('updated', true);
  END IF;

  INSERT INTO public.search_prospection (
    search_id, user_id, schema_version, ready, spreadsheet_id, sheet_id,
    sheet_name, sheet_url, eligible_count, eligible_lead_keys, integration_errors
  ) VALUES (
    p_search_id, p_user_id, 2, p_ready, p_spreadsheet_id, p_sheet_id,
    p_sheet_name, p_sheet_url, COALESCE(p_eligible_count, 0),
    COALESCE(p_eligible_lead_keys, '{}'), COALESCE(p_integration_errors, '[]'::jsonb)
  );

  RETURN jsonb_build_object('updated', true);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_search_prospection(uuid, uuid, boolean, text, integer, text, text, integer, text[], jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_search_prospection(uuid, uuid, boolean, text, integer, text, text, integer, text[], jsonb) TO service_role;

-- 8. Start (claim) a run atomically
CREATE OR REPLACE FUNCTION public.start_automation_run(
  p_search_id uuid,
  p_user_id uuid,
  p_connection_key text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prosp public.search_prospection%ROWTYPE;
  existing public.automation_runs%ROWTYPE;
  active public.automation_runs%ROWTYPE;
  new_run public.automation_runs%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_connection_key, 0));

  SELECT * INTO existing FROM public.automation_runs
    WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'existing', 'run', to_jsonb(existing));
  END IF;

  SELECT * INTO active FROM public.automation_runs
    WHERE connection_key = p_connection_key
      AND state IN ('queued','running','dispatch_unknown','needs_reconciliation')
    LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'status', 'conflict',
      'run', jsonb_build_object(
        'id', active.id,
        'search_id', active.search_id,
        'state', active.state,
        'same_user', active.user_id = p_user_id,
        'started_at', active.started_at
      )
    );
  END IF;

  SELECT * INTO prosp FROM public.search_prospection WHERE search_id = p_search_id;
  IF NOT FOUND OR NOT prosp.ready OR prosp.schema_version <> 2 THEN
    RETURN jsonb_build_object('status', 'not_ready');
  END IF;
  IF prosp.user_id <> p_user_id THEN
    RETURN jsonb_build_object('status', 'forbidden');
  END IF;
  IF coalesce(array_length(prosp.eligible_lead_keys, 1), 0) = 0 THEN
    RETURN jsonb_build_object('status', 'empty');
  END IF;

  INSERT INTO public.automation_runs (
    search_id, user_id, connection_key, state, idempotency_key,
    sheet_spreadsheet_id, sheet_id, sheet_name, sheet_url, eligible_lead_keys
  ) VALUES (
    p_search_id, p_user_id, p_connection_key, 'queued', p_idempotency_key,
    prosp.spreadsheet_id, prosp.sheet_id, prosp.sheet_name, prosp.sheet_url, prosp.eligible_lead_keys
  ) RETURNING * INTO new_run;

  INSERT INTO public.automation_events (run_id, search_id, lead_key, event_type, detail)
    VALUES (new_run.id, p_search_id, '', 'run_created', jsonb_build_object('state', 'queued'))
    ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('status', 'created', 'run', to_jsonb(new_run));
END;
$$;

REVOKE ALL ON FUNCTION public.start_automation_run(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_automation_run(uuid, uuid, text, text) TO service_role;

-- 9. Claim by n8n worker
CREATE OR REPLACE FUNCTION public.claim_automation_run(
  p_search_id uuid,
  p_run_id uuid,
  p_execution_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  run public.automation_runs%ROWTYPE;
  prosp public.search_prospection%ROWTYPE;
  offer text;
BEGIN
  SELECT * INTO run FROM public.automation_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND OR run.search_id <> p_search_id THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'Execução não encontrada para esta pesquisa');
  END IF;

  IF run.state IN ('completed','completed_with_errors','failed','cancelled') THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'Execução já encerrada');
  END IF;

  IF run.n8n_execution_id IS NOT NULL AND run.n8n_execution_id <> p_execution_id THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'Execução já vinculada a outro worker');
  END IF;

  IF run.state = 'needs_reconciliation' AND run.n8n_execution_id IS NULL THEN
    RETURN jsonb_build_object('accepted', false, 'reason', 'Execução aguarda reconciliação');
  END IF;

  UPDATE public.automation_runs SET
    state = 'running',
    n8n_execution_id = p_execution_id,
    last_activity_at = now()
  WHERE id = p_run_id
  RETURNING * INTO run;

  INSERT INTO public.automation_events (run_id, search_id, lead_key, event_type, detail)
    VALUES (p_run_id, p_search_id, '', 'run_claimed', jsonb_build_object('executionId', p_execution_id))
    ON CONFLICT DO NOTHING;

  SELECT * INTO prosp FROM public.search_prospection WHERE search_id = p_search_id;
  SELECT COALESCE(offer_description, 'Criação de sites e agentes de automação para empresas.')
    INTO offer FROM public.n8n_settings WHERE user_id = run.user_id;

  RETURN jsonb_build_object(
    'accepted', true,
    'searchId', p_search_id,
    'automationRunId', p_run_id,
    'executionId', p_execution_id,
    'prospection', jsonb_build_object(
      'schemaVersion', 2,
      'ready', true,
      'spreadsheetId', run.sheet_spreadsheet_id,
      'sheetId', run.sheet_id,
      'sheetName', run.sheet_name,
      'sheetUrl', run.sheet_url,
      'eligibleCount', COALESCE(array_length(run.eligible_lead_keys, 1), 0),
      'eligibleLeadKeys', to_jsonb(run.eligible_lead_keys)
    ),
    'offerDescription', COALESCE(offer, 'Criação de sites e agentes de automação para empresas.')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_automation_run(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_automation_run(uuid, uuid, text) TO service_role;

-- 10. Reserve a contact
CREATE OR REPLACE FUNCTION public.reserve_contact(
  p_search_id uuid,
  p_run_id uuid,
  p_execution_id text,
  p_lead_key text,
  p_phone text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  run public.automation_runs%ROWTYPE;
  lead public.leads%ROWTYPE;
  res public.contact_reservations%ROWTYPE;
  phone text;
BEGIN
  SELECT * INTO run FROM public.automation_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND OR run.search_id <> p_search_id THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Fora do escopo');
  END IF;
  IF run.state <> 'running' OR run.n8n_execution_id IS DISTINCT FROM p_execution_id THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Execução não autorizada');
  END IF;
  IF NOT (p_lead_key = ANY (run.eligible_lead_keys)) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Lead fora da lista autorizada');
  END IF;

  SELECT * INTO lead FROM public.leads
    WHERE search_id = p_search_id AND lead_key = p_lead_key LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Lead não encontrado');
  END IF;

  phone := public.normalize_phone(p_phone);
  IF phone IS NULL OR phone <> public.normalize_phone(lead.telefone) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Telefone divergente');
  END IF;

  IF lead.mensagem_enviada OR lead.status IN ('enviado', 'número inválido') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Já contatado');
  END IF;

  SELECT * INTO res FROM public.contact_reservations
    WHERE connection_key = run.connection_key AND phone_normalized = phone FOR UPDATE;

  IF FOUND THEN
    IF res.state = 'reserved' AND res.run_id = p_run_id AND res.lead_key = p_lead_key THEN
      RETURN jsonb_build_object('allowed', true);
    END IF;
    RETURN jsonb_build_object('allowed', false, 'reason',
      CASE res.state
        WHEN 'sent' THEN 'Já contatado'
        WHEN 'invalid' THEN 'Número inválido'
        WHEN 'needs_review' THEN 'Bloqueado para revisão'
        ELSE 'Reservado por outra execução'
      END);
  END IF;

  INSERT INTO public.contact_reservations (
    connection_key, phone_normalized, run_id, search_id, lead_key, lead_id, user_id, state
  ) VALUES (
    run.connection_key, phone, p_run_id, p_search_id, p_lead_key, lead.id, run.user_id, 'reserved'
  );

  INSERT INTO public.automation_events (run_id, search_id, lead_key, event_type, detail)
    VALUES (p_run_id, p_search_id, p_lead_key, 'reserved', '{}'::jsonb)
    ON CONFLICT DO NOTHING;

  UPDATE public.automation_runs SET last_activity_at = now() WHERE id = p_run_id;

  RETURN jsonb_build_object('allowed', true);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_contact(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_contact(uuid, uuid, text, text, text) TO service_role;

-- 11. Apply whatsapp status callback
CREATE OR REPLACE FUNCTION public.apply_whatsapp_status(
  p_search_id uuid,
  p_run_id uuid,
  p_execution_id text,
  p_lead_key text,
  p_phone text,
  p_status text,
  p_mensagem_enviada boolean,
  p_data_envio timestamptz,
  p_message_text text,
  p_message_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  run public.automation_runs%ROWTYPE;
  lead public.leads%ROWTYPE;
  phone text;
BEGIN
  SELECT * INTO run FROM public.automation_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND OR run.search_id <> p_search_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'scope');
  END IF;
  IF run.n8n_execution_id IS DISTINCT FROM p_execution_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'execution');
  END IF;

  SELECT * INTO lead FROM public.leads
    WHERE search_id = p_search_id AND lead_key = p_lead_key LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'lead');
  END IF;

  phone := public.normalize_phone(COALESCE(p_phone, lead.telefone));

  -- never downgrade a confirmed send
  IF lead.status = 'enviado' AND p_status <> 'enviado' THEN
    RETURN jsonb_build_object('success', true, 'skipped', true);
  END IF;

  UPDATE public.leads SET
    status = p_status,
    mensagem_enviada = COALESCE(p_mensagem_enviada, mensagem_enviada),
    data_envio = COALESCE(p_data_envio, data_envio),
    contacted = CASE WHEN p_status = 'enviado' THEN true ELSE contacted END
  WHERE id = lead.id;

  UPDATE public.contact_reservations SET
    state = CASE WHEN p_status = 'enviado' THEN 'sent'
                 WHEN p_status = 'número inválido' THEN 'invalid'
                 ELSE state END,
    message_text = COALESCE(p_message_text, message_text),
    message_id = COALESCE(p_message_id, message_id),
    sent_at = COALESCE(p_data_envio, sent_at),
    run_id = COALESCE(run_id, p_run_id),
    lead_key = COALESCE(lead_key, p_lead_key),
    search_id = COALESCE(search_id, p_search_id)
  WHERE connection_key = run.connection_key AND phone_normalized = phone;

  INSERT INTO public.automation_events (run_id, search_id, lead_key, event_type, detail)
    VALUES (p_run_id, p_search_id, p_lead_key,
      CASE WHEN p_status = 'enviado' THEN 'sent' ELSE 'invalid' END,
      jsonb_build_object('messageId', p_message_id))
    ON CONFLICT DO NOTHING;

  UPDATE public.automation_runs SET last_activity_at = now() WHERE id = p_run_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_whatsapp_status(uuid, uuid, text, text, text, text, boolean, timestamptz, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_whatsapp_status(uuid, uuid, text, text, text, text, boolean, timestamptz, text, text) TO service_role;

-- 12. Finish a run
CREATE OR REPLACE FUNCTION public.finish_automation_run(
  p_search_id uuid,
  p_run_id uuid,
  p_execution_id text,
  p_status text,
  p_summary jsonb,
  p_issues jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  run public.automation_runs%ROWTYPE;
BEGIN
  SELECT * INTO run FROM public.automation_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND OR run.search_id <> p_search_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'scope');
  END IF;
  IF run.n8n_execution_id IS DISTINCT FROM p_execution_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'execution');
  END IF;

  IF run.state IN ('completed','completed_with_errors','failed','cancelled') THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true);
  END IF;

  UPDATE public.automation_runs SET
    state = p_status,
    summary = COALESCE(p_summary, summary),
    issues = COALESCE(p_issues, issues),
    finished_at = now(),
    last_activity_at = now()
  WHERE id = p_run_id;

  UPDATE public.contact_reservations SET state = 'needs_review'
    WHERE run_id = p_run_id AND state = 'reserved';

  INSERT INTO public.automation_events (run_id, search_id, lead_key, event_type, detail)
    VALUES (p_run_id, p_search_id, '', 'run_finished', jsonb_build_object('status', p_status))
    ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.finish_automation_run(uuid, uuid, text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_automation_run(uuid, uuid, text, text, jsonb, jsonb) TO service_role;

-- 20260908000000_complete_prospection_control.sql
-- Completes the exported 20260907175539 migration. No credentials or production data.
-- One fixed logical connection: changing a user's settings cannot bypass the global lock.
-- Do not introduce a second lock namespace if an older deployment has an active run.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.automation_runs WHERE connection_key<>'scanradar-shared-whatsapp'
  AND state IN ('queued','running','dispatch_unknown','needs_reconciliation')) THEN
  RAISE EXCEPTION 'Reconcilie as execuções antigas no n8n antes de aplicar a conexão compartilhada.';
 END IF;
END $$;

ALTER TABLE public.automation_runs ADD COLUMN IF NOT EXISTS offer_description text;
CREATE OR REPLACE FUNCTION public.prospection_connection_key() RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT 'scanradar-shared-whatsapp'::text $$;

CREATE OR REPLACE FUNCTION public.normalize_phone(p_phone text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE d text;
BEGIN
 d := regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g');
 IF left(d,2)='00' THEN d:=substr(d,3); END IF;
 IF length(d) IN (10,11) THEN d:='55'||d; END IF;
 IF d !~ '^55[1-9][0-9]{9,10}$' THEN RETURN NULL; END IF;
 RETURN d;
END $$;

CREATE INDEX IF NOT EXISTS leads_normalized_phone_idx ON public.leads(public.normalize_phone(telefone));

-- Called only by trusted server RPCs. A reservation is permanent until explicitly reconciled.
CREATE OR REPLACE FUNCTION public.prospection_candidates(p_search_id uuid, p_keys text[])
RETURNS TABLE(lead_key text, phone text) LANGUAGE sql STABLE SET search_path = '' AS $$
 SELECT DISTINCT ON (public.normalize_phone(l.telefone)) l.lead_key, public.normalize_phone(l.telefone)
 FROM public.leads l
 WHERE l.search_id=p_search_id AND l.lead_key=ANY(p_keys)
 AND public.normalize_phone(l.telefone) IS NOT NULL
 AND NOT EXISTS (
   SELECT 1 FROM public.contact_reservations c
   WHERE c.connection_key=public.prospection_connection_key()
   AND c.phone_normalized=public.normalize_phone(l.telefone)
 )
 AND NOT EXISTS (
   SELECT 1 FROM public.leads h WHERE public.normalize_phone(h.telefone)=public.normalize_phone(l.telefone)
   AND (coalesce(h.mensagem_enviada,false) OR coalesce(h.contacted,false)
     OR lower(coalesce(h.status,'')) IN ('enviado','sent','número inválido','numero invalido','em processamento','needs_review'))
 )
 ORDER BY public.normalize_phone(l.telefone),l.lead_key
$$;

CREATE OR REPLACE FUNCTION public.upsert_search_prospection(
 p_search_id uuid,p_user_id uuid,p_ready boolean,p_spreadsheet_id text,p_sheet_id integer,
 p_sheet_name text,p_sheet_url text,p_eligible_count integer,p_eligible_lead_keys text[],p_integration_errors jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE old public.search_prospection%ROWTYPE;
BEGIN
 -- The search row serializes callbacks, starts and deletion even before the first sheet exists.
 PERFORM 1 FROM public.searches WHERE id=p_search_id AND user_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid search owner'; END IF;
 IF p_ready IS NULL OR p_eligible_count IS DISTINCT FROM cardinality(p_eligible_lead_keys)
 OR EXISTS(SELECT 1 FROM unnest(p_eligible_lead_keys) k WHERE k IS NULL OR trim(k)='')
 OR cardinality(p_eligible_lead_keys)<>(SELECT count(DISTINCT k) FROM unnest(p_eligible_lead_keys) k)
 THEN RAISE EXCEPTION 'Invalid prospection list'; END IF;
 IF p_ready AND (p_spreadsheet_id IS DISTINCT FROM '1rsDDI26rMRg_1qeTh7t7IGHwsKwymBUgUCYS2_tsvPQ'
 OR p_sheet_id IS NULL OR p_sheet_id<0 OR p_sheet_name IS NULL
 OR right(p_sheet_name,39)<>' - '||p_search_id::text OR length(p_sheet_name)>100
 OR p_sheet_url IS DISTINCT FROM 'https://docs.google.com/spreadsheets/d/'||p_spreadsheet_id||'/edit#gid='||p_sheet_id::text)
 THEN RAISE EXCEPTION 'Invalid sheet metadata'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_eligible_lead_keys) k WHERE NOT EXISTS
  (SELECT 1 FROM public.leads l WHERE l.search_id=p_search_id AND l.lead_key=k))
 THEN RAISE EXCEPTION 'Unknown eligible lead'; END IF;
 IF EXISTS(SELECT 1 FROM public.automation_runs WHERE search_id=p_search_id
  AND state IN ('queued','running','dispatch_unknown','needs_reconciliation'))
 THEN RETURN jsonb_build_object('updated',false,'reason','active_run'); END IF;
 SELECT * INTO old FROM public.search_prospection WHERE search_id=p_search_id FOR UPDATE;
 IF FOUND AND old.ready AND NOT p_ready THEN
  RETURN jsonb_build_object('updated',false,'reason','would_downgrade_ready'); END IF;
 -- Once ready, callbacks may repeat the same snapshot but cannot replace it.
 IF old.ready AND (old.spreadsheet_id IS DISTINCT FROM p_spreadsheet_id
  OR old.sheet_id IS DISTINCT FROM p_sheet_id OR old.sheet_name IS DISTINCT FROM p_sheet_name
  OR NOT (old.eligible_lead_keys @> p_eligible_lead_keys AND old.eligible_lead_keys <@ p_eligible_lead_keys))
 THEN RETURN jsonb_build_object('updated',false,'reason','immutable_ready_snapshot'); END IF;
 INSERT INTO public.search_prospection(search_id,user_id,schema_version,ready,spreadsheet_id,sheet_id,sheet_name,
 sheet_url,eligible_count,eligible_lead_keys,integration_errors)
 VALUES(p_search_id,p_user_id,2,p_ready,p_spreadsheet_id,p_sheet_id,p_sheet_name,p_sheet_url,
 p_eligible_count,p_eligible_lead_keys,coalesce(p_integration_errors,'[]'::jsonb))
 ON CONFLICT(search_id) DO UPDATE SET ready=excluded.ready,spreadsheet_id=excluded.spreadsheet_id,
 sheet_id=excluded.sheet_id,sheet_name=excluded.sheet_name,sheet_url=excluded.sheet_url,
 eligible_count=excluded.eligible_count,eligible_lead_keys=excluded.eligible_lead_keys,integration_errors=excluded.integration_errors;
 RETURN jsonb_build_object('updated',true);
END $$;

-- Persist the complete research and its list in one transaction; never overwrite a ready result.
CREATE OR REPLACE FUNCTION public.complete_search_with_prospection(p_search_id uuid,p_user_id uuid,
 p_status text,p_leads jsonb,p_sheet_name text,p_sheet_url text,p_message text,p_prospection jsonb,p_errors jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE keys text[]; result jsonb;
BEGIN
 PERFORM 1 FROM public.searches WHERE id=p_search_id AND user_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid search owner'; END IF;
 IF EXISTS(SELECT 1 FROM public.search_prospection WHERE search_id=p_search_id AND ready)
 OR EXISTS(SELECT 1 FROM public.automation_runs WHERE search_id=p_search_id) THEN
  RETURN jsonb_build_object('success',true,'repeated',true);
 END IF;
 PERFORM public.complete_search_with_leads(p_search_id,p_status,jsonb_array_length(p_leads),p_leads,p_sheet_name,p_sheet_url,p_message);
 IF p_prospection IS NOT NULL AND p_prospection<>'null'::jsonb THEN
  SELECT coalesce(array_agg(value),'{}'::text[]) INTO keys
   FROM jsonb_array_elements_text(p_prospection->'eligibleLeadKeys');
  result:=public.upsert_search_prospection(p_search_id,p_user_id,(p_prospection->>'ready')::boolean,
   p_prospection->>'spreadsheetId',(p_prospection->>'sheetId')::integer,p_prospection->>'sheetName',
   p_prospection->>'sheetUrl',(p_prospection->>'eligibleCount')::integer,keys,p_errors);
 END IF;
 RETURN jsonb_build_object('success',true,'prospection',result);
END $$;

CREATE OR REPLACE FUNCTION public.start_automation_run(p_search_id uuid,p_user_id uuid,p_connection_key text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p public.search_prospection%ROWTYPE; r public.automation_runs%ROWTYPE; available integer; offer text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(public.prospection_connection_key(),0));
 IF p_connection_key IS DISTINCT FROM public.prospection_connection_key() OR length(trim(p_idempotency_key)) NOT BETWEEN 8 AND 128 THEN
  RETURN jsonb_build_object('status','forbidden'); END IF;
 PERFORM 1 FROM public.searches WHERE id=p_search_id AND user_id=p_user_id AND status='completed' FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','forbidden'); END IF;
 SELECT * INTO r FROM public.automation_runs WHERE user_id=p_user_id AND idempotency_key=p_idempotency_key;
 IF FOUND THEN
  IF r.search_id<>p_search_id THEN RETURN jsonb_build_object('status','idempotency_conflict'); END IF;
  RETURN jsonb_build_object('status','existing','run',to_jsonb(r));
 END IF;
 IF EXISTS(SELECT 1 FROM public.automation_runs WHERE connection_key=public.prospection_connection_key()
  AND state IN ('queued','running','dispatch_unknown','needs_reconciliation')) THEN
  RETURN jsonb_build_object('status','conflict'); END IF;
 SELECT * INTO p FROM public.search_prospection WHERE search_id=p_search_id AND user_id=p_user_id FOR UPDATE;
 IF NOT FOUND OR NOT p.ready OR p.schema_version<>2 THEN RETURN jsonb_build_object('status','not_ready'); END IF;
 SELECT count(*) INTO available FROM public.prospection_candidates(p_search_id,p.eligible_lead_keys);
 IF available=0 THEN RETURN jsonb_build_object('status','empty'); END IF;
 SELECT coalesce(nullif(trim(offer_description),''),'Criação de sites e agentes de automação para empresas.')
 INTO offer FROM public.n8n_settings WHERE user_id=p_user_id;
 INSERT INTO public.automation_runs(search_id,user_id,connection_key,state,idempotency_key,
 sheet_spreadsheet_id,sheet_id,sheet_name,sheet_url,eligible_lead_keys,offer_description)
 VALUES(p_search_id,p_user_id,public.prospection_connection_key(),'queued',p_idempotency_key,
 p.spreadsheet_id,p.sheet_id,p.sheet_name,p.sheet_url,p.eligible_lead_keys,offer) RETURNING * INTO r;
 INSERT INTO public.automation_events(run_id,search_id,event_type) VALUES(r.id,p_search_id,'run_created');
 RETURN jsonb_build_object('status','created','run',to_jsonb(r));
END $$;

CREATE OR REPLACE FUNCTION public.claim_automation_run(p_search_id uuid,p_run_id uuid,p_execution_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.automation_runs%ROWTYPE;
BEGIN
 SELECT * INTO r FROM public.automation_runs WHERE id=p_run_id FOR UPDATE;
 IF NOT FOUND OR r.search_id<>p_search_id OR nullif(trim(p_execution_id),'') IS NULL
 OR r.state NOT IN ('queued','dispatch_unknown','running')
 OR (r.n8n_execution_id IS NOT NULL AND r.n8n_execution_id<>p_execution_id)
 THEN RETURN jsonb_build_object('accepted',false,'reason','Execução não autorizada'); END IF;
 IF EXISTS(SELECT 1 FROM public.automation_runs WHERE n8n_execution_id=p_execution_id AND id<>p_run_id)
 THEN RETURN jsonb_build_object('accepted',false,'reason','Worker já vinculado'); END IF;
 UPDATE public.automation_runs SET state='running',n8n_execution_id=p_execution_id,last_activity_at=now() WHERE id=p_run_id;
 INSERT INTO public.automation_events(run_id,search_id,event_type) VALUES(p_run_id,p_search_id,'run_claimed') ON CONFLICT DO NOTHING;
 RETURN jsonb_build_object('accepted',true,'searchId',p_search_id,'automationRunId',p_run_id,'executionId',p_execution_id,
 'prospection',jsonb_build_object('schemaVersion',2,'ready',true,'spreadsheetId',r.sheet_spreadsheet_id,
 'sheetId',r.sheet_id,'sheetName',r.sheet_name,'sheetUrl',r.sheet_url,
 'eligibleCount',cardinality(r.eligible_lead_keys),'eligibleLeadKeys',to_jsonb(r.eligible_lead_keys)),
 'offerDescription',coalesce(r.offer_description,'Criação de sites e agentes de automação para empresas.'));
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('accepted',false,'reason','Worker já vinculado');
END $$;

CREATE OR REPLACE FUNCTION public.reserve_contact(p_search_id uuid,p_run_id uuid,p_execution_id text,p_lead_key text,p_phone text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.automation_runs%ROWTYPE; l public.leads%ROWTYPE; c public.contact_reservations%ROWTYPE; phone text; reason text;
BEGIN
 SELECT * INTO r FROM public.automation_runs WHERE id=p_run_id FOR UPDATE;
 IF NOT FOUND OR r.search_id<>p_search_id OR r.state<>'running' OR r.n8n_execution_id IS DISTINCT FROM p_execution_id
 OR p_execution_id IS NULL OR p_lead_key IS NULL OR NOT (p_lead_key=ANY(r.eligible_lead_keys))
 THEN RETURN jsonb_build_object('allowed',false,'reason','Execução ou lead fora do escopo'); END IF;
 SELECT * INTO l FROM public.leads WHERE search_id=p_search_id AND lead_key=p_lead_key;
 phone:=public.normalize_phone(p_phone);
 IF NOT FOUND OR phone IS NULL OR phone IS DISTINCT FROM public.normalize_phone(l.telefone)
 THEN RETURN jsonb_build_object('allowed',false,'reason','Telefone divergente'); END IF;
 SELECT * INTO c FROM public.contact_reservations WHERE connection_key=r.connection_key AND phone_normalized=phone FOR UPDATE;
 IF FOUND THEN
  IF c.state='reserved' AND c.run_id=p_run_id AND c.search_id=p_search_id AND c.lead_key=p_lead_key THEN
   UPDATE public.automation_runs SET last_activity_at=now() WHERE id=p_run_id;
   RETURN jsonb_build_object('allowed',true);
  END IF;
  reason:='Contato já reservado, processado ou aguardando revisão';
 ELSE
  IF EXISTS(SELECT 1 FROM public.leads h WHERE public.normalize_phone(h.telefone)=phone
   AND (coalesce(h.mensagem_enviada,false) OR coalesce(h.contacted,false)
    OR lower(coalesce(h.status,'')) IN ('enviado','sent','número inválido','numero invalido','em processamento','needs_review')))
  THEN reason:='Contato já processado no histórico'; END IF;
 END IF;
 IF reason IS NOT NULL THEN
  INSERT INTO public.automation_events(run_id,search_id,lead_key,event_type,detail)
  VALUES(p_run_id,p_search_id,p_lead_key,'skipped',jsonb_build_object('reason',reason)) ON CONFLICT DO NOTHING;
  UPDATE public.automation_runs SET last_activity_at=now() WHERE id=p_run_id;
  RETURN jsonb_build_object('allowed',false,'reason',reason);
 END IF;
 INSERT INTO public.contact_reservations(connection_key,phone_normalized,run_id,search_id,lead_key,lead_id,user_id,state)
 VALUES(r.connection_key,phone,p_run_id,p_search_id,p_lead_key,l.id,r.user_id,'reserved');
 INSERT INTO public.automation_events(run_id,search_id,lead_key,event_type) VALUES(p_run_id,p_search_id,p_lead_key,'reserved') ON CONFLICT DO NOTHING;
 UPDATE public.automation_runs SET last_activity_at=now() WHERE id=p_run_id;
 RETURN jsonb_build_object('allowed',true);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('allowed',false,'reason','Contato reservado');
END $$;

CREATE OR REPLACE FUNCTION public.apply_whatsapp_status(p_search_id uuid,p_run_id uuid,p_execution_id text,p_lead_key text,
 p_phone text,p_status text,p_mensagem_enviada boolean,p_data_envio timestamptz,p_message_text text,p_message_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.automation_runs%ROWTYPE; l public.leads%ROWTYPE; c public.contact_reservations%ROWTYPE; phone text;
BEGIN
 SELECT * INTO r FROM public.automation_runs WHERE id=p_run_id FOR UPDATE;
 IF NOT FOUND OR r.search_id<>p_search_id OR r.n8n_execution_id IS DISTINCT FROM p_execution_id
 OR p_execution_id IS NULL OR p_lead_key IS NULL OR NOT (p_lead_key=ANY(r.eligible_lead_keys))
 OR r.state IN ('queued','cancelled') THEN RETURN jsonb_build_object('success',false,'reason','scope'); END IF;
 IF p_status NOT IN ('enviado','número inválido') OR p_status IS NULL
 OR p_mensagem_enviada IS DISTINCT FROM (p_status='enviado') THEN
  RETURN jsonb_build_object('success',false,'reason','status'); END IF;
 SELECT * INTO l FROM public.leads WHERE search_id=p_search_id AND lead_key=p_lead_key FOR UPDATE;
 phone:=public.normalize_phone(p_phone);
 IF NOT FOUND OR phone IS NULL OR phone IS DISTINCT FROM public.normalize_phone(l.telefone)
 THEN RETURN jsonb_build_object('success',false,'reason','phone'); END IF;
 SELECT * INTO c FROM public.contact_reservations WHERE connection_key=r.connection_key AND phone_normalized=phone FOR UPDATE;
 IF NOT FOUND OR c.run_id IS DISTINCT FROM p_run_id OR c.search_id IS DISTINCT FROM p_search_id OR c.lead_key IS DISTINCT FROM p_lead_key
 THEN RETURN jsonb_build_object('success',false,'reason','reservation'); END IF;
 -- Confirmed send dominates any later invalid callback, including a retry after finish.
 IF c.state='sent' OR coalesce(l.mensagem_enviada,false) OR l.status='enviado' THEN
  RETURN jsonb_build_object('success',true,'idempotent',true);
 END IF;
 UPDATE public.leads SET status=p_status,mensagem_enviada=p_mensagem_enviada,
 data_envio=CASE WHEN p_status='enviado' THEN coalesce(data_envio,p_data_envio,now()) ELSE data_envio END,
 contacted=CASE WHEN p_status='enviado' THEN true ELSE contacted END WHERE id=l.id;
 UPDATE public.contact_reservations SET state=CASE WHEN p_status='enviado' THEN 'sent' ELSE 'invalid' END,
 message_text=coalesce(message_text,p_message_text),message_id=coalesce(message_id,p_message_id),
 sent_at=CASE WHEN p_status='enviado' THEN coalesce(sent_at,p_data_envio,now()) ELSE sent_at END WHERE id=c.id;
 INSERT INTO public.automation_events(run_id,search_id,lead_key,event_type)
 VALUES(p_run_id,p_search_id,p_lead_key,CASE WHEN p_status='enviado' THEN 'sent' ELSE 'invalid' END) ON CONFLICT DO NOTHING;
 UPDATE public.automation_runs SET last_activity_at=now() WHERE id=p_run_id;
 RETURN jsonb_build_object('success',true);
END $$;

CREATE OR REPLACE FUNCTION public.finish_automation_run(p_search_id uuid,p_run_id uuid,p_execution_id text,p_status text,p_summary jsonb,p_issues jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.automation_runs%ROWTYPE; unresolved integer; final_state text;
BEGIN
 SELECT * INTO r FROM public.automation_runs WHERE id=p_run_id FOR UPDATE;
 IF NOT FOUND OR r.search_id<>p_search_id OR p_execution_id IS NULL OR r.n8n_execution_id IS DISTINCT FROM p_execution_id
 OR p_status IS NULL OR p_status NOT IN ('completed','completed_with_errors','failed') THEN
  RETURN jsonb_build_object('success',false,'reason','scope'); END IF;
 IF r.state IN ('completed','completed_with_errors','failed','cancelled') THEN
  RETURN jsonb_build_object('success',true,'automationRunId',p_run_id,'idempotent',true); END IF;
 UPDATE public.contact_reservations SET state='needs_review' WHERE run_id=p_run_id AND state='reserved';
 GET DIAGNOSTICS unresolved=ROW_COUNT;
 final_state:=CASE WHEN unresolved>0 AND p_status='completed' THEN 'completed_with_errors' ELSE p_status END;
 UPDATE public.automation_runs SET state=final_state,summary=p_summary,issues=coalesce(p_issues,'[]'::jsonb),
 finished_at=now(),last_activity_at=now() WHERE id=p_run_id;
 INSERT INTO public.automation_events(run_id,search_id,event_type,detail)
 VALUES(p_run_id,p_search_id,'run_finished',jsonb_build_object('state',final_state)) ON CONFLICT DO NOTHING;
 RETURN jsonb_build_object('success',true,'automationRunId',p_run_id);
END $$;

-- This cannot regress running/finished to dispatch_unknown if a callback won the race.
CREATE OR REPLACE FUNCTION public.mark_automation_dispatch_unknown(p_run_id uuid,p_user_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
 UPDATE public.automation_runs SET state='dispatch_unknown',last_activity_at=now()
 WHERE id=p_run_id AND user_id=p_user_id AND state='queued' AND n8n_execution_id IS NULL
$$;

CREATE OR REPLACE FUNCTION public.get_automation_status(p_search_id uuid,p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p public.search_prospection%ROWTYPE; r public.automation_runs%ROWTYPE; available integer:=0; blocked boolean;
 counts jsonb; configured boolean; is_ready boolean; stale boolean;
BEGIN
 PERFORM 1 FROM public.searches WHERE id=p_search_id AND user_id=p_user_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Search not found'; END IF;
 SELECT * INTO p FROM public.search_prospection WHERE search_id=p_search_id AND user_id=p_user_id;
 is_ready:=coalesce(p.ready AND p.schema_version=2,false);
 SELECT EXISTS(SELECT 1 FROM public.n8n_settings WHERE user_id=p_user_id AND nullif(prospection_webhook_url,'') IS NOT NULL
  AND nullif(webhook_secret,'') IS NOT NULL AND nullif(callback_secret_hash,'') IS NOT NULL) INTO configured;
 IF is_ready THEN SELECT count(*) INTO available FROM public.prospection_candidates(p_search_id,p.eligible_lead_keys); END IF;
 SELECT * INTO r FROM public.automation_runs WHERE search_id=p_search_id AND user_id=p_user_id ORDER BY created_at DESC LIMIT 1;
 SELECT EXISTS(SELECT 1 FROM public.automation_runs WHERE connection_key=public.prospection_connection_key()
  AND state IN ('queued','running','dispatch_unknown','needs_reconciliation')) INTO blocked;
 stale:=coalesce(r.state IN ('queued','running','dispatch_unknown','needs_reconciliation') AND r.last_activity_at<now()-interval '10 minutes',false);
 SELECT jsonb_build_object('sent',count(*) FILTER(WHERE state='sent'),
 'invalid',count(*) FILTER(WHERE state='invalid'),'pending',count(*) FILTER(WHERE state='needs_review'),
 'reserved',count(*) FILTER(WHERE state='reserved'),
 'skipped',(SELECT count(*) FROM public.automation_events WHERE run_id=r.id AND event_type='skipped'))
 INTO counts FROM public.contact_reservations WHERE run_id=r.id;
 RETURN jsonb_build_object('ready',is_ready,'configured',configured,'availableCount',available,
 'blocked',blocked,'canStart',is_ready AND configured AND available>0 AND NOT blocked,
 'sheetUrl',p.sheet_url,'sheetName',p.sheet_name,
 'reason',CASE WHEN blocked THEN 'A conexão de WhatsApp possui uma execução ativa ou aguardando verificação.'
  WHEN NOT is_ready THEN 'Esta pesquisa ainda não possui uma lista individual de prospecção. Faça uma nova pesquisa para prepará-la.'
  WHEN NOT configured THEN 'Configure a integração de prospecção.' WHEN available=0 THEN 'Nenhum contato elegível para prospecção.' ELSE NULL END,
 'run',CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('id',r.id,'state',r.state,'executionId',r.n8n_execution_id,
 'stale',stale,'counts',counts,'summary',r.summary,'startedAt',r.started_at,'lastActivityAt',r.last_activity_at,'finishedAt',r.finished_at) END);
END $$;

-- Deleting a search cannot erase the lock while n8n may still be sending.
CREATE OR REPLACE FUNCTION public.guard_active_prospection_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE sid uuid;
BEGIN
 IF TG_TABLE_NAME='searches' THEN sid:=OLD.id; ELSE sid:=OLD.search_id; END IF;
 IF EXISTS(SELECT 1 FROM public.automation_runs WHERE search_id=sid
  AND state IN ('queued','running','dispatch_unknown','needs_reconciliation')) THEN
  RAISE EXCEPTION 'A pesquisa possui prospecção ativa. Confirme o encerramento no n8n antes de excluir.';
 END IF;
 RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS guard_active_prospection_delete ON public.searches;
CREATE TRIGGER guard_active_prospection_delete BEFORE DELETE ON public.searches FOR EACH ROW EXECUTE FUNCTION public.guard_active_prospection_delete();
DROP TRIGGER IF EXISTS guard_active_prospection_delete ON public.leads;
CREATE TRIGGER guard_active_prospection_delete BEFORE DELETE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.guard_active_prospection_delete();

-- The browser can still mark manual contacts; authoritative identifiers/statuses are server-owned.
REVOKE INSERT,UPDATE ON public.leads FROM authenticated;
GRANT UPDATE(contacted) ON public.leads TO authenticated;

-- Privileged functions are never directly callable with the public/anon key or a user's JWT.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('prospection_candidates','upsert_search_prospection','complete_search_with_prospection','complete_search_with_leads',
 'start_automation_run','claim_automation_run','reserve_contact','apply_whatsapp_status','finish_automation_run',
 'mark_automation_dispatch_unknown','get_automation_status','guard_active_prospection_delete')
 LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;


-- 20260908034643_91ee43f1-1828-4ecf-bb8f-5b3e2b27d98b.sql
ALTER TABLE public.automation_runs DROP CONSTRAINT IF EXISTS automation_runs_state_check;
ALTER TABLE public.automation_runs ADD CONSTRAINT automation_runs_state_check CHECK (state = ANY (ARRAY['queued','running','cancelling','dispatch_unknown','needs_reconciliation','completed','completed_with_errors','failed','cancelled']));
ALTER TABLE public.automation_runs
 ADD COLUMN IF NOT EXISTS cancel_requested_at timestamptz,
 ADD COLUMN IF NOT EXISTS cancel_requested_by uuid,
 ADD COLUMN IF NOT EXISTS n8n_workflow_id text,
 ADD COLUMN IF NOT EXISTS cancel_detail jsonb;

ALTER TABLE public.contact_reservations DROP CONSTRAINT IF EXISTS contact_reservations_state_check;
ALTER TABLE public.contact_reservations ADD CONSTRAINT contact_reservations_state_check CHECK (state = ANY (ARRAY['reserved','sending','sent','invalid','needs_review']));
ALTER TABLE public.contact_reservations
 ADD COLUMN IF NOT EXISTS send_started_at timestamptz,
 ADD COLUMN IF NOT EXISTS attempt_key text;

CREATE OR REPLACE FUNCTION public.prospection_active_states() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
 SELECT ARRAY['queued','running','cancelling','dispatch_unknown','needs_reconciliation']::text[] $$;

CREATE OR REPLACE FUNCTION public.guard_active_prospection_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE sid uuid;
BEGIN
 IF TG_TABLE_NAME='searches' THEN sid:=OLD.id; ELSE sid:=OLD.search_id; END IF;
 IF EXISTS(SELECT 1 FROM public.automation_runs WHERE search_id=sid
  AND state = ANY(public.prospection_active_states())) THEN
  RAISE EXCEPTION 'A pesquisa possui prospecção ativa. Cancele a rodada antes de excluir.';
 END IF;
 RETURN OLD;
END $$;

CREATE OR REPLACE FUNCTION public.start_automation_run(p_search_id uuid, p_user_id uuid, p_connection_key text, p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p public.search_prospection%ROWTYPE; r public.automation_runs%ROWTYPE; available integer; offer text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(public.prospection_connection_key(),0));
 IF p_connection_key IS DISTINCT FROM public.prospection_connection_key() OR length(trim(p_idempotency_key)) NOT BETWEEN 8 AND 128 THEN
  RETURN jsonb_build_object('status','forbidden'); END IF;
 PERFORM 1 FROM public.searches WHERE id=p_search_id AND user_id=p_user_id AND status='completed' FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','forbidden'); END IF;
 SELECT * INTO r FROM public.automation_runs WHERE user_id=p_user_id AND idempotency_key=p_idempotency_key;
 IF FOUND THEN
  IF r.search_id<>p_search_id THEN RETURN jsonb_build_object('status','idempotency_conflict'); END IF;
  RETURN jsonb_build_object('status','existing','run',to_jsonb(r));
 END IF;
 IF EXISTS(SELECT 1 FROM public.automation_runs WHERE connection_key=public.prospection_connection_key()
  AND state = ANY(public.prospection_active_states())) THEN
  RETURN jsonb_build_object('status','conflict'); END IF;
 SELECT * INTO p FROM public.search_prospection WHERE search_id=p_search_id AND user_id=p_user_id FOR UPDATE;
 IF NOT FOUND OR NOT p.ready OR p.schema_version<>2 THEN RETURN jsonb_build_object('status','not_ready'); END IF;
 SELECT count(*) INTO available FROM public.prospection_candidates(p_search_id,p.eligible_lead_keys);
 IF available=0 THEN RETURN jsonb_build_object('status','empty'); END IF;
 SELECT coalesce(nullif(trim(offer_description),''),'Criação de sites e agentes de automação para empresas.')
 INTO offer FROM public.n8n_settings WHERE user_id=p_user_id;
 INSERT INTO public.automation_runs(search_id,user_id,connection_key,state,idempotency_key,
 sheet_spreadsheet_id,sheet_id,sheet_name,sheet_url,eligible_lead_keys,offer_description)
 VALUES(p_search_id,p_user_id,public.prospection_connection_key(),'queued',p_idempotency_key,
 p.spreadsheet_id,p.sheet_id,p.sheet_name,p.sheet_url,p.eligible_lead_keys,offer) RETURNING * INTO r;
 INSERT INTO public.automation_events(run_id,search_id,event_type) VALUES(r.id,p_search_id,'run_created');
 RETURN jsonb_build_object('status','created','run',to_jsonb(r));
END $$;

CREATE OR REPLACE FUNCTION public.get_automation_status(p_search_id uuid, p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p public.search_prospection%ROWTYPE; r public.automation_runs%ROWTYPE; available integer:=0; blocked boolean;
 counts jsonb; configured boolean; is_ready boolean; stale boolean;
BEGIN
 PERFORM 1 FROM public.searches WHERE id=p_search_id AND user_id=p_user_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Search not found'; END IF;
 SELECT * INTO p FROM public.search_prospection WHERE search_id=p_search_id AND user_id=p_user_id;
 is_ready:=coalesce(p.ready AND p.schema_version=2,false);
 SELECT EXISTS(SELECT 1 FROM public.n8n_settings WHERE user_id=p_user_id AND nullif(prospection_webhook_url,'') IS NOT NULL
  AND nullif(webhook_secret,'') IS NOT NULL AND nullif(callback_secret_hash,'') IS NOT NULL) INTO configured;
 IF is_ready THEN SELECT count(*) INTO available FROM public.prospection_candidates(p_search_id,p.eligible_lead_keys); END IF;
 SELECT * INTO r FROM public.automation_runs WHERE search_id=p_search_id AND user_id=p_user_id ORDER BY created_at DESC LIMIT 1;
 SELECT EXISTS(SELECT 1 FROM public.automation_runs WHERE connection_key=public.prospection_connection_key()
  AND state = ANY(public.prospection_active_states())) INTO blocked;
 stale:=coalesce(r.state = ANY(public.prospection_active_states()) AND r.last_activity_at<now()-interval '10 minutes',false);
 SELECT jsonb_build_object('sent',count(*) FILTER(WHERE state='sent'),
 'invalid',count(*) FILTER(WHERE state='invalid'),'pending',count(*) FILTER(WHERE state='needs_review'),
 'reserved',count(*) FILTER(WHERE state IN ('reserved','sending')),
 'sending',count(*) FILTER(WHERE state='sending'),
 'skipped',(SELECT count(*) FROM public.automation_events WHERE run_id=r.id AND event_type='skipped'))
 INTO counts FROM public.contact_reservations WHERE run_id=r.id;
 RETURN jsonb_build_object('ready',is_ready,'configured',configured,'availableCount',available,
 'blocked',blocked,'canStart',is_ready AND configured AND available>0 AND NOT blocked,
 'sheetUrl',p.sheet_url,'sheetName',p.sheet_name,
 'reason',CASE WHEN blocked THEN 'A conexão de WhatsApp possui uma rodada ativa ou aguardando verificação.'
  WHEN NOT is_ready THEN 'Esta pesquisa ainda não possui uma lista individual de prospecção. Faça uma nova pesquisa para prepará-la.'
  WHEN NOT configured THEN 'Configure a integração de prospecção.' WHEN available=0 THEN 'Nenhum contato elegível para prospecção.' ELSE NULL END,
 'run',CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('id',r.id,'state',r.state,'executionId',r.n8n_execution_id,
 'stale',stale,'counts',counts,'summary',r.summary,'startedAt',r.started_at,'lastActivityAt',r.last_activity_at,
 'finishedAt',r.finished_at,'cancelRequestedAt',r.cancel_requested_at,
 'canCancel',(r.state = ANY(public.prospection_active_states()))) END);
END $$;

-- Worker poll: cooperative cancellation. No side effects other than the activity timestamp.
CREATE OR REPLACE FUNCTION public.check_automation_run(p_search_id uuid, p_run_id uuid, p_execution_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.automation_runs%ROWTYPE;
BEGIN
 SELECT * INTO r FROM public.automation_runs WHERE id=p_run_id FOR UPDATE;
 IF NOT FOUND OR r.search_id<>p_search_id OR p_execution_id IS NULL
 OR r.n8n_execution_id IS DISTINCT FROM p_execution_id THEN
  RETURN jsonb_build_object('continue',false,'reason','scope'); END IF;
 UPDATE public.automation_runs SET last_activity_at=now() WHERE id=p_run_id;
 RETURN jsonb_build_object('continue',r.state='running','state',r.state,
  'cancelRequested',r.state='cancelling');
END $$;

-- A send only becomes "sending" here; nothing is counted as sent without a real status callback.
CREATE OR REPLACE FUNCTION public.begin_send(p_search_id uuid, p_run_id uuid, p_execution_id text, p_lead_key text, p_phone text, p_attempt_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.automation_runs%ROWTYPE; l public.leads%ROWTYPE; c public.contact_reservations%ROWTYPE; phone text; att text;
BEGIN
 att := nullif(trim(coalesce(p_attempt_key,'')),'');
 IF att IS NULL OR length(att)>200 THEN RETURN jsonb_build_object('allowed',false,'reason','attempt_key'); END IF;
 SELECT * INTO r FROM public.automation_runs WHERE id=p_run_id FOR UPDATE;
 IF NOT FOUND OR r.search_id<>p_search_id OR p_execution_id IS NULL
 OR r.n8n_execution_id IS DISTINCT FROM p_execution_id OR p_lead_key IS NULL
 OR NOT (p_lead_key = ANY(r.eligible_lead_keys))
 THEN RETURN jsonb_build_object('allowed',false,'reason','scope'); END IF;
 IF r.state='cancelling' THEN RETURN jsonb_build_object('allowed',false,'reason','cancelled','cancelRequested',true); END IF;
 IF r.state<>'running' THEN RETURN jsonb_build_object('allowed',false,'reason','state'); END IF;
 SELECT * INTO l FROM public.leads WHERE search_id=p_search_id AND lead_key=p_lead_key;
 phone:=public.normalize_phone(p_phone);
 IF NOT FOUND OR phone IS NULL OR phone IS DISTINCT FROM public.normalize_phone(l.telefone)
 THEN RETURN jsonb_build_object('allowed',false,'reason','phone'); END IF;
 SELECT * INTO c FROM public.contact_reservations WHERE connection_key=r.connection_key AND phone_normalized=phone FOR UPDATE;
 IF NOT FOUND OR c.run_id IS DISTINCT FROM p_run_id OR c.search_id IS DISTINCT FROM p_search_id
 OR c.lead_key IS DISTINCT FROM p_lead_key
 THEN RETURN jsonb_build_object('allowed',false,'reason','reservation'); END IF;
 IF c.state IN ('sent','invalid') THEN RETURN jsonb_build_object('allowed',false,'reason','already_resolved','state',c.state); END IF;
 IF c.state='sending' THEN
  IF c.attempt_key = att THEN
   UPDATE public.automation_runs SET last_activity_at=now() WHERE id=p_run_id;
   RETURN jsonb_build_object('allowed',true,'idempotent',true);
  END IF;
  RETURN jsonb_build_object('allowed',false,'reason','send_in_progress');
 END IF;
 IF c.state<>'reserved' THEN RETURN jsonb_build_object('allowed',false,'reason','state','state',c.state); END IF;
 UPDATE public.contact_reservations SET state='sending',send_started_at=now(),attempt_key=att,updated_at=now() WHERE id=c.id;
 INSERT INTO public.automation_events(run_id,search_id,lead_key,event_type,detail)
 VALUES(p_run_id,p_search_id,p_lead_key,'send_started',jsonb_build_object('attemptKey',att)) ON CONFLICT DO NOTHING;
 UPDATE public.automation_runs SET last_activity_at=now() WHERE id=p_run_id;
 RETURN jsonb_build_object('allowed',true);
END $$;

-- Late callbacks stay safe: a cancelled or cancelling run still records the truth of a real send.
CREATE OR REPLACE FUNCTION public.apply_whatsapp_status(p_search_id uuid, p_run_id uuid, p_execution_id text, p_lead_key text, p_phone text, p_status text, p_mensagem_enviada boolean, p_data_envio timestamptz, p_message_text text, p_message_id text, p_attempt_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.automation_runs%ROWTYPE; l public.leads%ROWTYPE; c public.contact_reservations%ROWTYPE; phone text; att text;
BEGIN
 att := nullif(trim(coalesce(p_attempt_key,'')),'');
 SELECT * INTO r FROM public.automation_runs WHERE id=p_run_id FOR UPDATE;
 IF NOT FOUND OR r.search_id<>p_search_id OR r.n8n_execution_id IS DISTINCT FROM p_execution_id
 OR p_execution_id IS NULL OR p_lead_key IS NULL OR NOT (p_lead_key=ANY(r.eligible_lead_keys))
 OR r.state='queued' THEN RETURN jsonb_build_object('success',false,'reason','scope'); END IF;
 IF p_status NOT IN ('enviado','número inválido') OR p_status IS NULL
 OR p_mensagem_enviada IS DISTINCT FROM (p_status='enviado') THEN
  RETURN jsonb_build_object('success',false,'reason','status'); END IF;
 SELECT * INTO l FROM public.leads WHERE search_id=p_search_id AND lead_key=p_lead_key FOR UPDATE;
 phone:=public.normalize_phone(p_phone);
 IF NOT FOUND OR phone IS NULL OR phone IS DISTINCT FROM public.normalize_phone(l.telefone)
 THEN RETURN jsonb_build_object('success',false,'reason','phone'); END IF;
 SELECT * INTO c FROM public.contact_reservations WHERE connection_key=r.connection_key AND phone_normalized=phone FOR UPDATE;
 IF NOT FOUND OR c.run_id IS DISTINCT FROM p_run_id OR c.search_id IS DISTINCT FROM p_search_id OR c.lead_key IS DISTINCT FROM p_lead_key
 THEN RETURN jsonb_build_object('success',false,'reason','reservation'); END IF;
 IF att IS NOT NULL AND c.attempt_key IS NOT NULL AND c.attempt_key <> att
 THEN RETURN jsonb_build_object('success',false,'reason','attempt_key'); END IF;
 IF c.state IN ('sent','invalid') THEN
  RETURN jsonb_build_object('success',true,'idempotent',true,'state',c.state);
 END IF;
 UPDATE public.leads SET status=p_status,mensagem_enviada=p_mensagem_enviada,
 data_envio=CASE WHEN p_status='enviado' THEN coalesce(data_envio,p_data_envio,now()) ELSE data_envio END,
 contacted=CASE WHEN p_status='enviado' THEN true ELSE contacted END WHERE id=l.id;
 UPDATE public.contact_reservations SET state=CASE WHEN p_status='enviado' THEN 'sent' ELSE 'invalid' END,
 message_text=coalesce(message_text,p_message_text),message_id=coalesce(message_id,p_message_id),
 attempt_key=coalesce(attempt_key,att),
 sent_at=CASE WHEN p_status='enviado' THEN coalesce(sent_at,p_data_envio,now()) ELSE sent_at END,
 updated_at=now() WHERE id=c.id;
 INSERT INTO public.automation_events(run_id,search_id,lead_key,event_type)
 VALUES(p_run_id,p_search_id,p_lead_key,CASE WHEN p_status='enviado' THEN 'sent' ELSE 'invalid' END) ON CONFLICT DO NOTHING;
 UPDATE public.automation_runs SET last_activity_at=now() WHERE id=p_run_id;
 RETURN jsonb_build_object('success',true);
END $$;

CREATE OR REPLACE FUNCTION public.get_automation_cancel_context(p_search_id uuid, p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.automation_runs%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.searches WHERE id=p_search_id AND user_id=p_user_id)
 THEN RETURN jsonb_build_object('canCancel',false,'run',NULL); END IF;
 SELECT * INTO r FROM public.automation_runs WHERE search_id=p_search_id AND user_id=p_user_id
 AND state = ANY(public.prospection_active_states()) ORDER BY created_at DESC LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('canCancel',false,'run',NULL); END IF;
 RETURN jsonb_build_object('canCancel',true,'run',jsonb_build_object('id',r.id,'state',r.state,
  'executionId',r.n8n_execution_id,'lastActivityAt',r.last_activity_at,'cancelRequestedAt',r.cancel_requested_at));
END $$;

-- Phase 1 of cancellation: commits the intent before any network call. Only the run owner.
CREATE OR REPLACE FUNCTION public.request_automation_cancel(p_search_id uuid, p_run_id uuid, p_actor_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.automation_runs%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(public.prospection_connection_key(),0));
 SELECT * INTO r FROM public.automation_runs WHERE id=p_run_id FOR UPDATE;
 IF NOT FOUND OR r.search_id<>p_search_id OR r.user_id<>p_actor_id
 OR NOT EXISTS(SELECT 1 FROM public.searches WHERE id=p_search_id AND user_id=p_actor_id)
 THEN RETURN jsonb_build_object('success',false,'code','not_found'); END IF;
 IF NOT (r.state = ANY(public.prospection_active_states())) THEN
  RETURN jsonb_build_object('success',true,'alreadyFinished',true,'automationRunId',r.id,'state',r.state);
 END IF;
 UPDATE public.automation_runs SET state='cancelling',cancel_requested_at=coalesce(cancel_requested_at,now()),
 cancel_requested_by=p_actor_id,cancel_evidence=nullif(trim(coalesce(p_reason,'')),''),
 last_activity_at=now(),updated_at=now() WHERE id=r.id;
 INSERT INTO public.automation_events(run_id,search_id,lead_key,event_type,detail)
 VALUES(r.id,r.search_id,'','cancel_requested',jsonb_build_object('actorId',p_actor_id,
 'previousState',r.state,'reason',nullif(trim(coalesce(p_reason,'')),''))) ON CONFLICT DO NOTHING;
 RETURN jsonb_build_object('success',true,'automationRunId',r.id,'state','cancelling',
 'executionId',r.n8n_execution_id,'workflowId',r.n8n_workflow_id,'previousState',r.state);
END $$;

-- Phase 2: only a verified stop releases the shared lock. Otherwise the run needs verification.
CREATE OR REPLACE FUNCTION public.finalize_automation_cancel(p_search_id uuid, p_run_id uuid, p_actor_id uuid, p_stopped boolean, p_detail jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.automation_runs%ROWTYPE; held integer:=0;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(public.prospection_connection_key(),0));
 SELECT * INTO r FROM public.automation_runs WHERE id=p_run_id FOR UPDATE;
 IF NOT FOUND OR r.search_id<>p_search_id OR r.user_id<>p_actor_id
 THEN RETURN jsonb_build_object('success',false,'code','not_found'); END IF;
 IF r.state IN ('completed','completed_with_errors','failed','cancelled') THEN
  RETURN jsonb_build_object('success',true,'alreadyFinished',true,'automationRunId',r.id,'state',r.state);
 END IF;
 IF p_stopped IS DISTINCT FROM true THEN
  UPDATE public.automation_runs SET state='needs_reconciliation',cancel_detail=coalesce(p_detail,'{}'::jsonb),
  last_activity_at=now(),updated_at=now() WHERE id=r.id;
  INSERT INTO public.automation_events(run_id,search_id,lead_key,event_type,detail)
  VALUES(r.id,r.search_id,'','cancel_unverified',coalesce(p_detail,'{}'::jsonb)) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('success',true,'verified',false,'automationRunId',r.id,'state','needs_reconciliation');
 END IF;
 UPDATE public.contact_reservations SET state='needs_review',updated_at=now()
 WHERE run_id=r.id AND state IN ('reserved','sending');
 GET DIAGNOSTICS held=ROW_COUNT;
 UPDATE public.automation_runs SET state='cancelled',cancelled_at=now(),cancelled_by=p_actor_id,
 cancel_detail=coalesce(p_detail,'{}'::jsonb),finished_at=now(),last_activity_at=now(),updated_at=now()
 WHERE id=r.id;
 INSERT INTO public.automation_events(run_id,search_id,lead_key,event_type,detail)
 VALUES(r.id,r.search_id,'','cancel_confirmed',coalesce(p_detail,'{}'::jsonb)
  || jsonb_build_object('actorId',p_actor_id,'contactsHeldForReview',held)) ON CONFLICT DO NOTHING;
 RETURN jsonb_build_object('success',true,'verified',true,'automationRunId',r.id,'state','cancelled',
 'contactsHeldForReview',held);
END $$;

CREATE OR REPLACE FUNCTION public.set_automation_execution_metadata(p_run_id uuid, p_actor_id uuid, p_workflow_id text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
 UPDATE public.automation_runs SET n8n_workflow_id=nullif(trim(coalesce(p_workflow_id,'')),''),updated_at=now()
 WHERE id=p_run_id AND user_id=p_actor_id
$$;

-- Reconciliation of the owner's own run. Requires real Evolution evidence; never invents a send.
CREATE OR REPLACE FUNCTION public.reconcile_automation_send(p_search_id uuid, p_run_id uuid, p_actor_id uuid, p_lead_key text, p_status text, p_message_id text, p_sent_at timestamptz, p_evidence jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.automation_runs%ROWTYPE; c public.contact_reservations%ROWTYPE; l public.leads%ROWTYPE;
BEGIN
 SELECT * INTO r FROM public.automation_runs WHERE id=p_run_id FOR UPDATE;
 IF NOT FOUND OR r.search_id<>p_search_id OR r.user_id<>p_actor_id
 OR NOT EXISTS(SELECT 1 FROM public.searches WHERE id=p_search_id AND user_id=p_actor_id)
 THEN RETURN jsonb_build_object('success',false,'code','not_found'); END IF;
 IF p_status NOT IN ('enviado','número inválido') THEN RETURN jsonb_build_object('success',false,'code','status'); END IF;
 IF p_status='enviado' AND (nullif(trim(coalesce(p_message_id,'')),'') IS NULL OR p_evidence IS NULL OR p_evidence='{}'::jsonb)
 THEN RETURN jsonb_build_object('success',false,'code','evidence_required'); END IF;
 SELECT * INTO c FROM public.contact_reservations WHERE run_id=p_run_id AND lead_key=p_lead_key FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'code','not_found'); END IF;
 IF c.state IN ('sent','invalid') THEN RETURN jsonb_build_object('success',true,'idempotent',true,'state',c.state); END IF;
 IF c.state NOT IN ('sending','needs_review') THEN RETURN jsonb_build_object('success',false,'code','state'); END IF;
 SELECT * INTO l FROM public.leads WHERE search_id=p_search_id AND lead_key=p_lead_key FOR UPDATE;
 IF FOUND THEN
  UPDATE public.leads SET status=p_status,mensagem_enviada=(p_status='enviado'),
  data_envio=CASE WHEN p_status='enviado' THEN coalesce(data_envio,p_sent_at,now()) ELSE data_envio END,
  contacted=CASE WHEN p_status='enviado' THEN true ELSE contacted END WHERE id=l.id;
 END IF;
 UPDATE public.contact_reservations SET state=CASE WHEN p_status='enviado' THEN 'sent' ELSE 'invalid' END,
 message_id=coalesce(message_id,nullif(trim(coalesce(p_message_id,'')),'')),
 sent_at=CASE WHEN p_status='enviado' THEN coalesce(sent_at,p_sent_at,now()) ELSE sent_at END,
 updated_at=now() WHERE id=c.id;
 INSERT INTO public.automation_events(run_id,search_id,lead_key,event_type,detail)
 VALUES(p_run_id,p_search_id,p_lead_key,'reconciled',jsonb_build_object('actorId',p_actor_id,
 'status',p_status,'messageId',nullif(trim(coalesce(p_message_id,'')),''),'evidence',coalesce(p_evidence,'{}'::jsonb)))
 ON CONFLICT DO NOTHING;
 RETURN jsonb_build_object('success',true,'state',CASE WHEN p_status='enviado' THEN 'sent' ELSE 'invalid' END);
END $$;

-- The old privileged release flow is removed, not merely hidden in the interface.
DROP FUNCTION IF EXISTS public.admin_release_automation_run(uuid,uuid,uuid,boolean,text,timestamptz,text);
DROP FUNCTION IF EXISTS public.get_automation_release_context(uuid,uuid);

REVOKE ALL ON FUNCTION public.prospection_active_states() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_automation_run(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.begin_send(uuid,uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_whatsapp_status(uuid,uuid,text,text,text,text,boolean,timestamptz,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_automation_cancel_context(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_automation_cancel(uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_automation_cancel(uuid,uuid,uuid,boolean,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_automation_execution_metadata(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_automation_send(uuid,uuid,uuid,text,text,text,timestamptz,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prospection_active_states() TO service_role;
GRANT EXECUTE ON FUNCTION public.check_automation_run(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.begin_send(uuid,uuid,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_whatsapp_status(uuid,uuid,text,text,text,text,boolean,timestamptz,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_automation_cancel_context(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_automation_cancel(uuid,uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_automation_cancel(uuid,uuid,uuid,boolean,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_automation_execution_metadata(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_automation_send(uuid,uuid,uuid,text,text,text,timestamptz,jsonb) TO service_role;

-- 20260908042530_f828dd90-5d02-4bf9-af0c-7354fbee0b74.sql
DROP FUNCTION IF EXISTS public.apply_whatsapp_status(uuid, uuid, text, text, text, text, boolean, timestamptz, text, text);

-- 20260908150000_finish_protocol3.sql
-- Implementação final de encerramento e confirmação do protocolo 3.

ALTER TABLE public.automation_runs ADD COLUMN IF NOT EXISTS protocol_version integer;
ALTER TABLE public.automation_runs ADD COLUMN IF NOT EXISTS stop_acknowledged_at timestamptz;
DROP INDEX IF EXISTS public.automation_runs_active_connection_uidx;
CREATE UNIQUE INDEX automation_runs_active_connection_uidx ON public.automation_runs(connection_key)
 WHERE state IN ('queued','running','cancelling','dispatch_unknown','needs_reconciliation');

CREATE OR REPLACE FUNCTION public.claim_automation_run_v3(p_search_id uuid,p_run_id uuid,p_execution_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.automation_runs%ROWTYPE; reply jsonb;
BEGIN
 SELECT * INTO r FROM public.automation_runs WHERE id=p_run_id FOR UPDATE;
 IF NOT FOUND OR r.search_id<>p_search_id OR r.cancel_requested_at IS NOT NULL
 OR r.state NOT IN ('queued','running','dispatch_unknown') THEN
  RETURN jsonb_build_object('accepted',false,'reason','scope_or_cancelled'); END IF;
 IF r.sheet_spreadsheet_id IS NULL OR r.sheet_id IS NULL OR r.sheet_id<0
 OR nullif(trim(r.sheet_name),'') IS NULL OR coalesce(cardinality(r.eligible_lead_keys),0)=0 THEN
  RETURN jsonb_build_object('accepted',false,'reason','metadata'); END IF;
 reply:=public.claim_automation_run(p_search_id,p_run_id,p_execution_id);
 IF reply->>'accepted'='true' THEN
  UPDATE public.automation_runs SET protocol_version=3 WHERE id=p_run_id;
 END IF;
 RETURN reply;
END $$;

CREATE OR REPLACE FUNCTION public.apply_whatsapp_status(p_search_id uuid,p_run_id uuid,p_execution_id text,p_lead_key text,
 p_phone text,p_status text,p_mensagem_enviada boolean,p_data_envio timestamptz,p_message_text text,p_message_id text,p_attempt_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.automation_runs%ROWTYPE; l public.leads%ROWTYPE; c public.contact_reservations%ROWTYPE;
 phone text; final_status text; mid text;
BEGIN
 SELECT * INTO r FROM public.automation_runs WHERE id=p_run_id FOR UPDATE;
 IF NOT FOUND OR r.search_id<>p_search_id OR nullif(p_execution_id,'') IS NULL OR r.n8n_execution_id IS DISTINCT FROM p_execution_id
 OR p_lead_key IS NULL OR NOT(p_lead_key=ANY(r.eligible_lead_keys)) OR r.state='queued' THEN
  RETURN jsonb_build_object('success',false,'reason','scope'); END IF;
 IF p_status IS NULL OR p_status NOT IN ('enviado','número inválido') OR p_mensagem_enviada IS DISTINCT FROM (p_status='enviado') THEN
  RETURN jsonb_build_object('success',false,'reason','status'); END IF;
 SELECT * INTO l FROM public.leads WHERE search_id=p_search_id AND lead_key=p_lead_key FOR UPDATE;
 phone:=public.normalize_phone(p_phone);
 IF NOT FOUND OR phone IS NULL OR phone IS DISTINCT FROM public.normalize_phone(l.telefone) THEN
  RETURN jsonb_build_object('success',false,'reason','phone'); END IF;
 SELECT * INTO c FROM public.contact_reservations WHERE connection_key=r.connection_key AND phone_normalized=phone FOR UPDATE;
 IF NOT FOUND OR c.run_id IS DISTINCT FROM p_run_id OR c.search_id IS DISTINCT FROM p_search_id OR c.lead_key IS DISTINCT FROM p_lead_key THEN
  RETURN jsonb_build_object('success',false,'reason','reservation'); END IF;
 IF p_attempt_key IS NOT NULL AND c.attempt_key IS DISTINCT FROM p_attempt_key THEN
  RETURN jsonb_build_object('success',false,'reason','attempt_key'); END IF;
 mid:=nullif(trim(coalesce(p_message_id,'')),'');
 IF p_status='enviado' AND r.protocol_version=3 AND (mid IS NULL OR c.send_started_at IS NULL) AND c.state<>'sent' THEN
  RETURN jsonb_build_object('success',false,'reason','send_evidence'); END IF;
 IF c.message_id IS NOT NULL AND mid IS NOT NULL AND c.message_id<>mid THEN
  RETURN jsonb_build_object('success',false,'reason','message_id_conflict'); END IF;
 -- A confirmed send wins, and repairs inconsistent projections instead of returning early.
 final_status:=CASE WHEN c.state='sent' OR coalesce(l.mensagem_enviada,false) OR l.status='enviado' THEN 'enviado' ELSE p_status END;
 UPDATE public.leads SET status=final_status,mensagem_enviada=(final_status='enviado'),
  data_envio=CASE WHEN final_status='enviado' THEN coalesce(data_envio,p_data_envio,c.sent_at,now()) ELSE data_envio END,
  contacted=CASE WHEN final_status='enviado' THEN true ELSE contacted END WHERE id=l.id;
 UPDATE public.contact_reservations SET state=CASE WHEN final_status='enviado' THEN 'sent' ELSE 'invalid' END,
  message_id=coalesce(message_id,mid),message_text=coalesce(message_text,p_message_text),
  sent_at=CASE WHEN final_status='enviado' THEN coalesce(sent_at,p_data_envio,l.data_envio,now()) ELSE sent_at END,updated_at=now() WHERE id=c.id;
 INSERT INTO public.automation_events(run_id,search_id,lead_key,event_type)
 VALUES(p_run_id,p_search_id,p_lead_key,CASE WHEN final_status='enviado' THEN 'sent' ELSE 'invalid' END) ON CONFLICT DO NOTHING;
 UPDATE public.automation_runs SET last_activity_at=now() WHERE id=p_run_id;
 RETURN jsonb_build_object('success',true,'persistedStatus',final_status);
END $$;

-- Called only after worker acknowledgement or a verified API stop. Never from a timer.
CREATE OR REPLACE FUNCTION public.resolve_stopped_reservations(p_run_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE version integer; held integer;
BEGIN
 SELECT protocol_version INTO version FROM public.automation_runs WHERE id=p_run_id FOR UPDATE;
 IF version=3 THEN
  INSERT INTO public.automation_events(run_id,search_id,lead_key,event_type,detail)
  SELECT run_id,search_id,lead_key,'released_before_send',jsonb_build_object('phone',phone_normalized)
  FROM public.contact_reservations WHERE run_id=p_run_id AND state='reserved' AND send_started_at IS NULL
  ON CONFLICT DO NOTHING;
  DELETE FROM public.contact_reservations WHERE run_id=p_run_id AND state='reserved' AND send_started_at IS NULL;
 END IF;
 UPDATE public.contact_reservations SET state='needs_review',updated_at=now() WHERE run_id=p_run_id AND state IN ('reserved','sending');
 SELECT count(*)::integer INTO held FROM public.contact_reservations WHERE run_id=p_run_id AND state='needs_review';
 RETURN held;
END $$;

CREATE OR REPLACE FUNCTION public.finish_automation_run_v3(p_search_id uuid,p_run_id uuid,p_execution_id text,p_status text,
 p_summary jsonb,p_issues jsonb,p_receipts jsonb,p_stop_acknowledged boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.automation_runs%ROWTYPE; receipt jsonb; applied jsonb; held integer; final_state text;
BEGIN
 SELECT * INTO r FROM public.automation_runs WHERE id=p_run_id FOR UPDATE;
 IF NOT FOUND OR r.search_id<>p_search_id OR nullif(p_execution_id,'') IS NULL OR r.n8n_execution_id IS DISTINCT FROM p_execution_id
 OR p_stop_acknowledged IS DISTINCT FROM true OR p_status IS NULL OR p_status NOT IN ('completed','completed_with_errors','failed','cancelled') THEN
  RETURN jsonb_build_object('success',false,'reason','scope_or_ack'); END IF;
 IF p_status='cancelled' AND r.cancel_requested_at IS NULL AND r.state<>'cancelled' THEN
  RETURN jsonb_build_object('success',false,'reason','cancel_not_requested'); END IF;
 IF jsonb_typeof(p_receipts) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid receipts'; END IF;
 FOR receipt IN SELECT value FROM jsonb_array_elements(p_receipts) LOOP
  IF receipt->>'searchId' IS DISTINCT FROM p_search_id::text OR receipt->>'automationRunId' IS DISTINCT FROM p_run_id::text
  OR receipt->>'executionId' IS DISTINCT FROM p_execution_id THEN RAISE EXCEPTION 'Receipt scope mismatch'; END IF;
  applied:=public.apply_whatsapp_status(p_search_id,p_run_id,p_execution_id,receipt->>'lead_key',receipt->>'telefone',
   receipt->>'status',(receipt->>'mensagem_enviada')::boolean,(receipt->>'data_envio')::timestamptz,
   receipt->>'messageText',receipt->>'messageId',receipt->>'attemptKey');
  IF applied->>'success' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Receipt rejected: %',applied->>'reason'; END IF;
 END LOOP;
 IF r.state IN ('completed','completed_with_errors','failed','cancelled') THEN
  RETURN jsonb_build_object('success',true,'automationRunId',r.id,'state',r.state,'idempotent',true); END IF;
 held:=public.resolve_stopped_reservations(p_run_id);
 final_state:=CASE WHEN r.cancel_requested_at IS NOT NULL THEN 'cancelled'
  WHEN p_status='completed' AND held>0 THEN 'completed_with_errors' ELSE p_status END;
 UPDATE public.automation_runs SET state=final_state,summary=p_summary,issues=coalesce(p_issues,'[]'::jsonb),
  stop_acknowledged_at=now(),finished_at=now(),last_activity_at=now(),updated_at=now(),
  cancelled_at=CASE WHEN final_state='cancelled' THEN coalesce(cancelled_at,now()) ELSE cancelled_at END,
  cancelled_by=CASE WHEN final_state='cancelled' THEN cancel_requested_by ELSE cancelled_by END WHERE id=p_run_id;
 INSERT INTO public.automation_events(run_id,search_id,lead_key,event_type,detail)
 VALUES(p_run_id,p_search_id,'','run_finished',jsonb_build_object('state',final_state,'workerAcknowledged',true)) ON CONFLICT DO NOTHING;
 RETURN jsonb_build_object('success',true,'automationRunId',p_run_id,'state',final_state);
END $$;

CREATE OR REPLACE FUNCTION public.finalize_automation_cancel(p_search_id uuid,p_run_id uuid,p_actor_id uuid,p_stopped boolean,p_detail jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.automation_runs%ROWTYPE; held integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(public.prospection_connection_key(),0));
 SELECT * INTO r FROM public.automation_runs WHERE id=p_run_id FOR UPDATE;
 IF NOT FOUND OR r.search_id<>p_search_id OR r.user_id<>p_actor_id THEN
  RETURN jsonb_build_object('success',false,'code','not_found'); END IF;
 IF r.state IN ('completed','completed_with_errors','failed','cancelled') THEN
  RETURN jsonb_build_object('success',true,'alreadyFinished',true,'verified',true,'state',r.state); END IF;
 IF r.cancel_requested_at IS NULL THEN RETURN jsonb_build_object('success',false,'code','cancel_not_requested'); END IF;
 IF p_stopped IS DISTINCT FROM true THEN
  UPDATE public.automation_runs SET state='cancelling',cancel_detail=coalesce(p_detail,'{}'::jsonb),updated_at=now() WHERE id=r.id;
  RETURN jsonb_build_object('success',true,'verified',false,'state','cancelling'); END IF;
 -- Prevent stale verification of another worker from finalizing this run.
 IF r.n8n_execution_id IS DISTINCT FROM (p_detail->>'executionId') THEN
  RETURN jsonb_build_object('success',false,'code','execution_changed'); END IF;
 held:=public.resolve_stopped_reservations(p_run_id);
 UPDATE public.automation_runs SET state='cancelled',cancelled_at=now(),cancelled_by=p_actor_id,
  cancel_detail=p_detail,stop_acknowledged_at=now(),finished_at=now(),last_activity_at=now(),updated_at=now() WHERE id=r.id;
 INSERT INTO public.automation_events(run_id,search_id,lead_key,event_type,detail)
 VALUES(r.id,r.search_id,'','cancel_confirmed',coalesce(p_detail,'{}'::jsonb)) ON CONFLICT DO NOTHING;
 RETURN jsonb_build_object('success',true,'verified',true,'state','cancelled','contactsHeldForReview',held);
END $$;

-- Guard metadata even when a row is being cancelled. The prior upsert contains
-- the same immutable-ready validation; this trigger covers every write path.
CREATE OR REPLACE FUNCTION public.guard_active_prospection_metadata() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.automation_runs WHERE search_id=OLD.search_id AND state=ANY(public.prospection_active_states()))
 AND (NEW.spreadsheet_id,NEW.sheet_id,NEW.sheet_name,NEW.eligible_lead_keys,NEW.ready)
 IS DISTINCT FROM (OLD.spreadsheet_id,OLD.sheet_id,OLD.sheet_name,OLD.eligible_lead_keys,OLD.ready) THEN
  RAISE EXCEPTION 'Active prospection snapshot cannot change'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_active_prospection_metadata BEFORE UPDATE ON public.search_prospection FOR EACH ROW EXECUTE FUNCTION public.guard_active_prospection_metadata();

CREATE OR REPLACE FUNCTION public.reconcile_automation_send(p_search_id uuid,p_run_id uuid,p_actor_id uuid,p_lead_key text,
 p_status text,p_message_id text,p_sent_at timestamptz,p_evidence jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.automation_runs%ROWTYPE; c public.contact_reservations%ROWTYPE; reply jsonb;
BEGIN
 SELECT * INTO r FROM public.automation_runs WHERE id=p_run_id FOR UPDATE;
 IF NOT FOUND OR r.search_id<>p_search_id OR r.user_id<>p_actor_id THEN
  RETURN jsonb_build_object('success',false,'code','not_found'); END IF;
 IF p_status IS DISTINCT FROM 'enviado' OR nullif(trim(p_message_id),'') IS NULL
 OR p_evidence->>'source' IS DISTINCT FROM 'n8n_execution' OR p_evidence->>'executionId' IS DISTINCT FROM r.n8n_execution_id THEN
  RETURN jsonb_build_object('success',false,'code','evidence_required'); END IF;
 SELECT * INTO c FROM public.contact_reservations WHERE run_id=p_run_id AND search_id=p_search_id AND lead_key=p_lead_key;
 IF NOT FOUND OR c.state NOT IN ('sending','needs_review','sent') THEN RETURN jsonb_build_object('success',false,'code','state'); END IF;
 reply:=public.apply_whatsapp_status(p_search_id,p_run_id,r.n8n_execution_id,p_lead_key,c.phone_normalized,
  'enviado',true,p_sent_at,NULL,p_message_id,c.attempt_key);
 IF reply->>'success'='true' THEN
  INSERT INTO public.automation_events(run_id,search_id,lead_key,event_type,detail)
  VALUES(p_run_id,p_search_id,p_lead_key,'reconciled',jsonb_build_object('actorId',p_actor_id,'evidence',p_evidence,'messageId',p_message_id)) ON CONFLICT DO NOTHING;
 END IF;
 RETURN reply;
END $$;

DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('claim_automation_run_v3','apply_whatsapp_status','resolve_stopped_reservations',
 'finish_automation_run_v3','finalize_automation_cancel','guard_active_prospection_metadata','reconcile_automation_send') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;

-- Ajustes de acesso da instalação independente.
ALTER TABLE public.scan_logs ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid();
DROP POLICY IF EXISTS "Users can view logs of their own searches" ON public.scan_logs;
DROP POLICY IF EXISTS "Users can insert logs for their own searches" ON public.scan_logs;
DROP POLICY IF EXISTS "Users can delete logs of their own searches" ON public.scan_logs;
CREATE POLICY scan_logs_owner_read ON public.scan_logs FOR SELECT TO authenticated USING
 (user_id=auth.uid() OR EXISTS(SELECT 1 FROM public.searches s WHERE s.id=search_id AND s.user_id=auth.uid()));
CREATE POLICY scan_logs_owner_insert ON public.scan_logs FOR INSERT TO authenticated WITH CHECK
 (user_id=auth.uid() AND (search_id IS NULL OR EXISTS(SELECT 1 FROM public.searches s WHERE s.id=search_id AND s.user_id=auth.uid())));
CREATE POLICY scan_logs_owner_delete ON public.scan_logs FOR DELETE TO authenticated USING
 (user_id=auth.uid() OR EXISTS(SELECT 1 FROM public.searches s WHERE s.id=search_id AND s.user_id=auth.uid()));
REVOKE ALL ON public.n8n_settings FROM anon,authenticated;
GRANT ALL ON public.n8n_settings TO service_role;
REVOKE UPDATE ON public.searches FROM authenticated;
REVOKE UPDATE ON public.scan_logs FROM authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.leads FROM authenticated;
GRANT UPDATE(contacted) ON public.leads TO authenticated;
CREATE INDEX IF NOT EXISTS searches_user_created_idx ON public.searches(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS scan_logs_user_created_idx ON public.scan_logs(user_id,created_at DESC);
COMMIT;
