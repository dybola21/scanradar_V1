-- Incremental fix: serialize test and production starts on the shared WhatsApp connection.
BEGIN;
CREATE OR REPLACE FUNCTION public.start_message_test(p_user_id uuid,p_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg public.message_test_settings%ROWTYPE; r public.automation_runs%ROWTYPE; offer text;
BEGIN
 -- Serialize test starts with production starts on the SAME shared WhatsApp connection.
 PERFORM pg_advisory_xact_lock(hashtextextended(public.prospection_connection_key(),0));
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

DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='start_message_test' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.sig);
 END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
