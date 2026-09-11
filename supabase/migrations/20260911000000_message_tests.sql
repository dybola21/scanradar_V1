-- Incremental: execute once on an existing ScanRadar database. No production history is erased.
BEGIN;
ALTER TABLE public.automation_runs ADD COLUMN mode text NOT NULL DEFAULT 'production'
 CHECK (mode IN ('production','test'));
ALTER TABLE public.automation_runs ALTER COLUMN search_id DROP NOT NULL;
ALTER TABLE public.automation_runs ADD CONSTRAINT automation_run_scope CHECK
 ((mode='production' AND search_id IS NOT NULL) OR (mode='test' AND search_id IS NULL));

CREATE TABLE public.message_test_settings (
 user_id uuid PRIMARY KEY, enabled boolean NOT NULL DEFAULT false,
 phone text NOT NULL CHECK (phone ~ '^55[0-9]{10,11}$'),
 business_name text NOT NULL CHECK (length(business_name) BETWEEN 1 AND 160),
 city text NOT NULL CHECK (length(city) BETWEEN 1 AND 160),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.message_test_attempts (
 run_id uuid PRIMARY KEY REFERENCES public.automation_runs(id),
 user_id uuid NOT NULL, phone text NOT NULL CHECK (phone ~ '^55[0-9]{10,11}$'),
 business_name text NOT NULL, city text NOT NULL, offer_description text NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','reserved','sending','sent','invalid','needs_review')),
 attempt_key text, message_id text, message_text text, sent_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.message_test_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_test_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.message_test_settings,public.message_test_attempts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.message_test_settings,public.message_test_attempts TO authenticated;
GRANT ALL ON public.message_test_settings,public.message_test_attempts TO service_role;
CREATE POLICY message_test_settings_owner ON public.message_test_settings FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY message_test_attempts_owner ON public.message_test_attempts FOR SELECT TO authenticated USING(user_id=auth.uid());

CREATE FUNCTION public.save_message_test_settings(p_user_id uuid,p_enabled boolean,p_phone text,p_name text,p_city text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('message-test:'||p_user_id::text));
 IF EXISTS(SELECT 1 FROM public.automation_runs WHERE user_id=p_user_id AND mode='test' AND state=ANY(public.prospection_active_states())) THEN
  RETURN jsonb_build_object('success',false,'reason','Encerre o teste ativo antes de alterar a configuração.'); END IF;
 INSERT INTO public.message_test_settings(user_id,enabled,phone,business_name,city)
 VALUES(p_user_id,p_enabled,public.normalize_phone(p_phone),trim(p_name),trim(p_city))
 ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled,phone=excluded.phone,business_name=excluded.business_name,city=excluded.city,updated_at=now();
 RETURN jsonb_build_object('success',true);
END $$;

CREATE FUNCTION public.start_message_test(p_user_id uuid,p_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg public.message_test_settings%ROWTYPE; r public.automation_runs%ROWTYPE; offer text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('message-test:'||p_user_id::text));
 SELECT * INTO r FROM public.automation_runs WHERE user_id=p_user_id AND idempotency_key=p_key;
 IF FOUND THEN
  IF r.mode<>'test' THEN RETURN jsonb_build_object('status','idempotency_conflict'); END IF;
  RETURN jsonb_build_object('status','existing','runId',r.id); END IF;
 IF length(p_key)<8 OR length(p_key)>128 THEN RAISE EXCEPTION 'Invalid key'; END IF;
 SELECT * INTO cfg FROM public.message_test_settings WHERE user_id=p_user_id;
 IF NOT FOUND OR NOT cfg.enabled THEN RETURN jsonb_build_object('status','not_configured'); END IF;
 SELECT offer_description INTO offer FROM public.n8n_settings WHERE user_id=p_user_id;
 BEGIN
  INSERT INTO public.automation_runs(user_id,search_id,mode,connection_key,idempotency_key,protocol_version)
  VALUES(p_user_id,NULL,'test',public.prospection_connection_key(),p_key,3) RETURNING * INTO r;
 EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('status','conflict'); END;
 INSERT INTO public.message_test_attempts(run_id,user_id,phone,business_name,city,offer_description)
 VALUES(r.id,p_user_id,cfg.phone,cfg.business_name,cfg.city,coalesce(nullif(offer,''),'Criação de sites e agentes de automação para empresas.'));
 INSERT INTO public.automation_events(run_id,lead_key,event_type,detail) VALUES(r.id,'','run_created','{"mode":"test"}');
 RETURN jsonb_build_object('status','created','runId',r.id);
END $$;

-- Callbacks use searchId=runId only for a test. No synthetic search or commercial lead is created.
CREATE FUNCTION public.message_test_receipt(p_run_id uuid,p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.automation_runs%ROWTYPE; a public.message_test_attempts%ROWTYPE; sent boolean; final_status text;
BEGIN
 SELECT * INTO r FROM public.automation_runs WHERE id=p_run_id AND mode='test' FOR UPDATE;
 IF NOT FOUND OR p_body->>'searchId' IS DISTINCT FROM r.id::text OR p_body->>'automationRunId' IS DISTINCT FROM r.id::text
 OR r.n8n_execution_id IS NULL OR p_body->>'executionId' IS DISTINCT FROM r.n8n_execution_id THEN RAISE EXCEPTION 'Test receipt scope mismatch'; END IF;
 SELECT * INTO a FROM public.message_test_attempts WHERE run_id=r.id FOR UPDATE;
 IF p_body->>'lead_key' IS DISTINCT FROM 'test:'||r.id::text OR public.normalize_phone(p_body->>'telefone') IS DISTINCT FROM a.phone THEN
  RAISE EXCEPTION 'Test contact mismatch'; END IF;
 sent:=p_body->>'status'='enviado';
 IF p_body->>'status' NOT IN ('enviado','número inválido') OR (p_body->>'mensagem_enviada')::boolean IS DISTINCT FROM sent THEN RAISE EXCEPTION 'Invalid test status'; END IF;
 IF a.state NOT IN ('reserved','sending','needs_review','sent','invalid') THEN RAISE EXCEPTION 'No test reservation'; END IF;
 IF sent AND (a.attempt_key IS NULL OR p_body->>'attemptKey' IS DISTINCT FROM a.attempt_key OR nullif(trim(p_body->>'messageId'),'') IS NULL) THEN
  RAISE EXCEPTION 'Test send evidence missing'; END IF;
 IF sent AND a.state NOT IN ('sending','needs_review','sent') THEN RAISE EXCEPTION 'Test was not sending'; END IF;
 IF a.state='sent' AND sent AND a.message_id IS DISTINCT FROM p_body->>'messageId' THEN RAISE EXCEPTION 'Conflicting test receipt'; END IF;
 -- Sent wins over delayed invalid callbacks. No commercial lead/reservation is touched.
 final_status:=CASE WHEN sent OR a.state='sent' THEN 'enviado' ELSE 'número inválido' END;
 UPDATE public.message_test_attempts SET state=CASE WHEN final_status='enviado' THEN 'sent' ELSE 'invalid' END,
 message_id=CASE WHEN sent THEN p_body->>'messageId' ELSE message_id END,
 message_text=CASE WHEN sent THEN p_body->>'messageText' ELSE message_text END,
 sent_at=CASE WHEN sent THEN coalesce(sent_at,(p_body->>'data_envio')::timestamptz,now()) ELSE sent_at END WHERE run_id=r.id;
 INSERT INTO public.automation_events(run_id,lead_key,event_type,detail)
 VALUES(r.id,'test:'||r.id::text,CASE WHEN final_status='enviado' THEN 'sent' ELSE 'invalid' END,jsonb_build_object('mode','test'))
 ON CONFLICT DO NOTHING;
 UPDATE public.automation_runs SET last_activity_at=now() WHERE id=r.id;
 RETURN jsonb_build_object('protocolVersion',3,'success',true,'searchId',r.id,'automationRunId',r.id,'executionId',r.n8n_execution_id,'lead_key','test:'||r.id::text,'persistedStatus',final_status);
END $$;

CREATE FUNCTION public.message_test_control(p_run_id uuid,p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.automation_runs%ROWTYPE; a public.message_test_attempts%ROWTYPE; base jsonb; act text:=p_body->>'action'; receipt jsonb; ok boolean:=false; terminal text;
BEGIN
 SELECT * INTO r FROM public.automation_runs WHERE id=p_run_id AND mode='test' FOR UPDATE;
 IF NOT FOUND OR p_body->>'searchId' IS DISTINCT FROM r.id::text OR p_body->>'automationRunId' IS DISTINCT FROM r.id::text
 OR nullif(p_body->>'executionId','') IS NULL THEN RAISE EXCEPTION 'Test scope mismatch'; END IF;
 SELECT * INTO a FROM public.message_test_attempts WHERE run_id=r.id FOR UPDATE;
 base:=jsonb_build_object('protocolVersion',3,'searchId',r.id,'automationRunId',r.id,'executionId',p_body->>'executionId');
 IF act='claim' THEN
  IF r.state NOT IN ('queued','dispatch_unknown') OR r.cancel_requested_at IS NOT NULL OR r.n8n_execution_id IS NOT NULL THEN
   RETURN base||jsonb_build_object('accepted',false,'reason','already_claimed_or_stopped'); END IF;
  BEGIN
   UPDATE public.automation_runs SET state='running',n8n_execution_id=p_body->>'executionId',last_activity_at=now() WHERE id=r.id;
  EXCEPTION WHEN unique_violation THEN RETURN base||jsonb_build_object('accepted',false,'reason','execution_conflict'); END;
  INSERT INTO public.automation_events(run_id,lead_key,event_type,detail) VALUES(r.id,'','run_claimed','{"mode":"test"}') ON CONFLICT DO NOTHING;
  RETURN base||jsonb_build_object('accepted',true,'mode','test','testProtocolVersion',1,'offerDescription',a.offer_description,
   'testLead',jsonb_build_object('Search ID',r.id,'Lead Key','test:'||r.id::text,'Nome',a.business_name,'Telefone',a.phone,'Cidade',a.city,'Website','','Status','pendente'));
 END IF;
 IF r.n8n_execution_id IS NULL OR r.n8n_execution_id IS DISTINCT FROM p_body->>'executionId' THEN
  RETURN base||jsonb_build_object('allowed',false,'success',false,'state',null,'directive','stop','reason','execution_scope'); END IF;
 base:=base||jsonb_build_object('state',r.state,'directive',CASE WHEN r.state='running' THEN 'continue' ELSE 'stop' END);
 IF act='check' THEN RETURN base||jsonb_build_object('cancelRequested',r.cancel_requested_at IS NOT NULL); END IF;
 IF act IN ('reserve','begin_send') THEN
  IF r.state='running' AND p_body->>'lead_key'='test:'||r.id::text AND public.normalize_phone(p_body->>'telefone')=a.phone THEN
   IF act='reserve' AND a.state='pending' THEN
    UPDATE public.message_test_attempts SET state='reserved' WHERE run_id=r.id; ok:=true;
   ELSIF act='begin_send' AND a.state='reserved' AND nullif(trim(p_body->>'attemptKey'),'') IS NOT NULL THEN
    UPDATE public.message_test_attempts SET state='sending',attempt_key=p_body->>'attemptKey' WHERE run_id=r.id; ok:=true;
   END IF;
  END IF;
  RETURN base||jsonb_build_object('allowed',ok,'reason',CASE WHEN ok THEN NULL ELSE 'already_authorized_or_scope' END,'lead_key','test:'||r.id::text,'attemptKey',CASE WHEN ok AND act='begin_send' THEN p_body->>'attemptKey' ELSE NULL END);
 END IF;
 IF act<>'finish' OR p_body->>'stopAcknowledged' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Stop acknowledgement required'; END IF;
 IF r.state IN ('completed','completed_with_errors','failed','cancelled') THEN
  -- Late receipts remain useful even after an acknowledged stop.
  FOR receipt IN SELECT value FROM jsonb_array_elements(coalesce(p_body->'receipts','[]')) LOOP PERFORM public.message_test_receipt(r.id,receipt); END LOOP;
  RETURN base||jsonb_build_object('success',true,'idempotent',true); END IF;
 FOR receipt IN SELECT value FROM jsonb_array_elements(coalesce(p_body->'receipts','[]')) LOOP PERFORM public.message_test_receipt(r.id,receipt); END LOOP;
 SELECT * INTO a FROM public.message_test_attempts WHERE run_id=r.id;
 IF a.state='sending' THEN UPDATE public.message_test_attempts SET state='needs_review' WHERE run_id=r.id; END IF;
 terminal:=CASE WHEN r.cancel_requested_at IS NOT NULL THEN 'cancelled'
 WHEN p_body->>'status'='failed' THEN 'failed'
 WHEN a.state IN ('sent','invalid') THEN 'completed' ELSE 'completed_with_errors' END;
 UPDATE public.automation_runs SET state=terminal,finished_at=now(),stop_acknowledged_at=now(),last_activity_at=now(),
 summary=p_body->'summary',issues=coalesce(p_body->'issues','[]') WHERE id=r.id;
 INSERT INTO public.automation_events(run_id,lead_key,event_type,detail) VALUES(r.id,'','run_finished',jsonb_build_object('mode','test','state',terminal)) ON CONFLICT DO NOTHING;
 RETURN base||jsonb_build_object('success',true,'state',terminal,'directive','stop');
END $$;

CREATE FUNCTION public.cancel_message_test(p_user_id uuid,p_run_id uuid,p_confirmed boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.automation_runs%ROWTYPE;
BEGIN
 SELECT * INTO r FROM public.automation_runs WHERE id=p_run_id AND user_id=p_user_id AND mode='test' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Test not found'; END IF;
 IF r.state=ANY(public.prospection_active_states()) THEN
  IF p_confirmed OR r.n8n_execution_id IS NULL THEN
   UPDATE public.message_test_attempts SET state='needs_review' WHERE run_id=r.id AND state='sending';
   UPDATE public.automation_runs SET state='cancelled',cancel_requested_at=coalesce(cancel_requested_at,now()),cancel_requested_by=p_user_id,
    finished_at=now(),stop_acknowledged_at=now(),last_activity_at=now() WHERE id=r.id;
  ELSE
   UPDATE public.automation_runs SET state='cancelling',cancel_requested_at=coalesce(cancel_requested_at,now()),cancel_requested_by=p_user_id,last_activity_at=now() WHERE id=r.id;
  END IF;
 END IF;
 SELECT * INTO r FROM public.automation_runs WHERE id=p_run_id;
 RETURN jsonb_build_object('success',true,'state',r.state,'executionId',r.n8n_execution_id,'verified',NOT(r.state=ANY(public.prospection_active_states())));
END $$;

DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('save_message_test_settings','start_message_test','message_test_receipt','message_test_control','cancel_message_test') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.sig);
 END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
