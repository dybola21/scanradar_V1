import { beforeAll, beforeEach, afterAll, describe, expect, test } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import postgres from "postgres";

// TEST_DATABASE_URL must point at a disposable empty PostgreSQL database.
// PGlite executes the SAME migrations/functions without a cloud account. Separate-session
// concurrency tests are enabled only for native PostgreSQL, never mislabeled as PGlite tests.
const externalUrl = process.env["TEST_DATABASE_URL"];
const external = externalUrl ? postgres(externalUrl, { max: 12, onnotice: () => {} }) : null;
const setupExternal = externalUrl
  ? postgres(externalUrl, { max: 1, onnotice: () => {} })
  : null;
let pg: PGlite;
const uid = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const connection = "scanradar-shared-whatsapp";
const doc = "1rsDDI26rMRg_1qeTh7t7IGHwsKwymBUgUCYS2_tsvPQ";
async function query(sql: string, params: any[] = []): Promise<any[]> {
  return external ? [...(await external.unsafe(sql, params))] : (await pg.query(sql, params)).rows;
}
async function exec(sql: string) {
  if (external) await external.unsafe(sql);
  else await pg.exec(sql);
}
// SET ROLE and the JWT claim are session state. Keep permission checks on one
// physical connection, then reset that SAME connection before returning it to
// the pool. Ordinary tests still use the pool (max: 12) for real concurrency.
async function withAuthenticatedSession(
  owner: string,
  check: (sessionQuery: typeof query) => Promise<void>,
) {
  const session = external ? await external.reserve() : null;
  const sessionQuery: typeof query = async (sql, params = []) =>
    session ? [...(await session.unsafe(sql, params))] : query(sql, params);
  try {
    await sessionQuery("SET ROLE authenticated");
    await sessionQuery("SELECT set_config('request.jwt.claim.sub',$1,false)", [owner]);
    expect((await sessionQuery("SELECT current_user AS role, auth.uid() AS uid"))[0]).toEqual({
      role: "authenticated", uid: owner,
    });
    await check(sessionQuery);
  } finally {
    try {
      await sessionQuery("RESET ROLE");
      await sessionQuery("RESET request.jwt.claim.sub");
    } finally {
      session?.release();
    }
  }
}
async function rpc(name: string, args: any[], runQuery: typeof query = query) {
  // JSON fixtures are already serialized strings. A direct ::jsonb parameter
  // makes postgres.js apply JSON.stringify again after describing the query,
  // so [] becomes a JSON string instead of an array. Bind it as text first,
  // then let PostgreSQL parse that text as jsonb. SQL null stays SQL null.
  const jsonbPositions: Record<string, readonly number[]> = {
    message_test_control: [1],
    message_test_receipt: [1],
    upsert_search_prospection: [9],
    finish_automation_run_v3: [4, 5, 6],
    finalize_automation_cancel: [4],
    reconcile_automation_send: [7],
    complete_search_with_prospection: [3, 7, 8],
  };
  const jsonb = new Set(jsonbPositions[name] ?? []);
  return (
    await runQuery(
      `select public.${name}(${args
        .map((_, i) => (jsonb.has(i) ? `$${i + 1}::text::jsonb` : `$${i + 1}`))
        .join(",")}) as result`,
      args,
    )
  )[0].result;
}
async function list(search = a, keys = ["a1", "a2"], ready = true) {
  return rpc("upsert_search_prospection", [
    search,
    search === a ? uid : other,
    ready,
    doc,
    ready ? 0 : null,
    `Dentista - ${search}`,
    ready ? `https://docs.google.com/spreadsheets/d/${doc}/edit#gid=0` : null,
    keys.length,
    keys,
    "[]",
  ]);
}
async function start(search = a, key = "attempt-0001", owner = uid) {
  return rpc("start_automation_run", [search, owner, connection, key]);
}
async function claim(id: string, search = a, worker = "184") {
  return rpc("claim_automation_run_v3", [search, id, worker]);
}
async function reserve(
  id: string,
  key = "a1",
  phone = "5521999991111",
  worker = "184",
  search = a,
) {
  return rpc("reserve_contact", [search, id, worker, key, phone]);
}
async function finish(id: string, state = "completed", worker = "184", search = a) {
  return rpc("finish_automation_run_v3", [search, id, worker, state, null, "[]", "[]", true]);
}
async function callback(
  id: string,
  key = "a1",
  phone = "5521999991111",
  sent = true,
  search = a,
  worker = "184",
) {
  if(sent) await rpc("begin_send", [search,id,worker,key,phone,worker+":"+key]);
  return rpc("apply_whatsapp_status", [
    search,
    id,
    worker,
    key,
    phone,
    sent ? "enviado" : "número inválido",
    sent,
    sent ? "2026-09-07T12:00:00Z" : null,
    sent ? "Mensagem teste" : null,
    sent ? "msg-test" : null,
  ]);
}
beforeAll(async () => {
  if (external && process.env["ALLOW_TEST_DATABASE_RESET"] !== "yes")
    throw new Error("Set ALLOW_TEST_DATABASE_RESET=yes only for a disposable test database.");
  if (!external) pg = new PGlite();
  if (setupExternal) {
    await setupExternal.unsafe(await readFile("tests/fixtures.sql", "utf8"));
    await setupExternal.unsafe(
      await readFile("supabase/migrations/20260909000000_scanradar_initial.sql", "utf8"),
    );
  } else {
    await pg.exec(await readFile("tests/fixtures.sql", "utf8"));
    await pg.exec(
      await readFile("supabase/migrations/20260909000000_scanradar_initial.sql", "utf8"),
    );
  }
  for (const file of (await readdir('supabase/migrations')).sort().filter(f => f.endsWith('.sql') && f !== '20260909000000_scanradar_initial.sql')) {
    const sql = await readFile(`supabase/migrations/${file}`, 'utf8');
    if (setupExternal) await setupExternal.unsafe(sql); else await pg.exec(sql);
  }
});
beforeEach(async () => {
  await exec("TRUNCATE public.user_roles,public.message_test_settings");
  await query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'admin')", [uid]);
  await exec(
    "TRUNCATE public.searches,public.leads,public.n8n_settings,public.automation_runs,public.search_prospection,public.contact_reservations,public.automation_events CASCADE",
  );
  await query("INSERT INTO public.searches(id,user_id,request_id,termo,cidade,uf,status) VALUES($1,$2,gen_random_uuid(),'Dentista','Rio','RJ','completed'),($3,$4,gen_random_uuid(),'Dentista','Rio','RJ','completed')", [a, uid, b, other]);
  await query(
    "INSERT INTO public.n8n_settings(user_id,prospection_webhook_url,webhook_secret,callback_secret_hash) VALUES($1,'encrypted-test','test','test'),($2,'encrypted-test','test','test')",
    [uid, other],
  );
  await query(
    "INSERT INTO public.leads(search_id,lead_key,telefone) VALUES($1,'a1','+55 21 99999-1111'),($1,'a2','+55 21 99999-2222'),($2,'b1','+55 21 99999-1111'),($2,'b2','+55 21 99999-3333')",
    [a, b],
  );
  await list();
  await list(b, ["b1", "b2"]);
});
afterAll(async () => {
  if (external) await external.end();
  if (setupExternal) await setupExternal.end();
  else await pg?.close();
});

describe("Actual PostgreSQL migrations and RPC contracts", () => {
  test("owner cancellation keeps lock until worker acknowledgement and releases never-started v3 contacts", async () => {
    const {run}=await start(); await claim(run.id); await reserve(run.id);
    expect((await rpc('request_automation_cancel',[a,run.id,other,null])).success).toBe(false);
    await rpc('request_automation_cancel',[a,run.id,uid,null]);
    await rpc('finalize_automation_cancel',[a,run.id,uid,false,JSON.stringify({executionId:'184'})]);
    expect((await rpc('get_automation_status',[a,uid])).run.state).toBe('cancelling');
    expect((await start(b,'blocked-attempt',other)).status).toBe('conflict');
    expect((await rpc('begin_send',[a,run.id,'184','a1','5521999991111','184:a1'])).allowed).toBe(false);
    expect((await finish(run.id,'cancelled')).state).toBe('cancelled');
    const state=await rpc('get_automation_status',[a,uid]);
    expect(state.blocked).toBe(false); expect(state.availableCount).toBe(2); expect(state.run.counts.pending).toBe(0);
  });
  test("finish replays sent receipt atomically, duplicates stay idempotent and late callbacks repair cancelled runs",async()=>{
    const {run}=await start();await claim(run.id);await reserve(run.id);
    await rpc('begin_send',[a,run.id,'184','a1','5521999991111','184:a1']);
    const receipt={searchId:a,automationRunId:run.id,executionId:'184',lead_key:'a1',telefone:'5521999991111',status:'enviado',mensagem_enviada:true,messageId:'msg-test',messageText:'Teste',data_envio:'2026-09-08T01:00:00Z'};
    await rpc('request_automation_cancel',[a,run.id,uid,null]);
    const done=await rpc('finish_automation_run_v3',[a,run.id,'184','cancelled',null,'[]',JSON.stringify([receipt]),true]);
    expect(done.state).toBe('cancelled');expect((await rpc('get_automation_status',[a,uid])).run.counts.sent).toBe(1);
    await callback(run.id);expect((await rpc('get_automation_status',[a,uid])).run.counts.sent).toBe(1);
    expect((await query("SELECT count(*)::int n FROM public.automation_events WHERE run_id=$1 AND event_type='sent'",[run.id]))[0].n).toBe(1);
  });
  test("invalid receipt rolls back finish and no acknowledgement cannot release a run",async()=>{
    const {run}=await start();await claim(run.id);
    expect((await rpc('finish_automation_run_v3',[a,run.id,'184','completed',null,'[]','[]',false])).success).toBe(false);
    await expect(rpc('finish_automation_run_v3',[a,run.id,'184','completed',null,'[]',JSON.stringify([{searchId:b}]),true])).rejects.toThrow(/scope mismatch/);
    expect((await rpc('get_automation_status',[a,uid])).blocked).toBe(true);
  });
  test("cancelling is protected by unique index and removed admin function stays unavailable",async()=>{
    const {run}=await start();await claim(run.id);await rpc('request_automation_cancel',[a,run.id,uid,null]);
    await expect(query("INSERT INTO public.automation_runs(search_id,user_id,connection_key,state,idempotency_key) VALUES($1,$2,$3,'queued','direct-other')",[b,other,connection])).rejects.toThrow(/duplicate key/);
    expect((await query("SELECT to_regprocedure('public.admin_release_automation_run(uuid,uuid,uuid,boolean,text,timestamptz,text)') AS f"))[0].f).toBe(null);
  });
  test.skipIf(!external)("independent sessions serialize cancellation against begin_send",async()=>{
    const {run}=await start();await claim(run.id);await reserve(run.id);
    const [cancel,send]=await Promise.all([rpc('request_automation_cancel',[a,run.id,uid,null]),rpc('begin_send',[a,run.id,'184','a1','5521999991111','184:a1'])]);
    expect(cancel.success).toBe(true);
    expect((await rpc('get_automation_status',[a,uid])).blocked).toBe(true);
    expect((await rpc('begin_send',[a,run.id,'184','a1','5521999991111','184:a1'])).allowed).toBe(false);
    expect(typeof send.allowed).toBe('boolean');
  });
  test("scope and same idempotency key; fixed connection cannot be bypassed", async () => {
    const first = await start();
    expect(first.status).toBe("created");
    expect((await start()).run.id).toBe(first.run.id);
    expect((await start(b, "attempt-0001", uid)).status).toBe("forbidden");
    expect((await start(b, "attempt-0002", other)).status).toBe("conflict");
    expect(
      (await rpc("start_automation_run", [b, other, "another-instance", "attempt-0003"])).status,
    ).toBe("forbidden");
    const exposed = await rpc("get_automation_status", [b, other]);
    expect(exposed.blocked).toBe(true);
    expect(exposed.run).toBe(null);
    expect(JSON.stringify(exposed)).not.toContain(first.run.id);
  });
  test("claim accepts exactly one worker and uses immutable sheet snapshot", async () => {
    const { run } = await start();
    const c = await claim(run.id);
    expect(c.accepted).toBe(true);
    expect(c.prospection.sheetName).toBe(`Dentista - ${a}`);
    expect(c.prospection.sheetId).toBe(0);
    expect((await claim(run.id)).accepted).toBe(true);
    expect((await claim(run.id, a, "185")).accepted).toBe(false);
    expect((await claim(run.id, b)).accepted).toBe(false);
    expect((await list(a, ["a1"], false)).reason).toBe("active_run");
  });
  test("foreign lead/phone/run cannot reserve or update; repeated callback is idempotent", async () => {
    const { run } = await start();
    await claim(run.id);
    expect((await reserve(run.id, "b1")).allowed).toBe(false);
    expect((await reserve(run.id, "a1", "5521999993333")).allowed).toBe(false);
    expect((await reserve(run.id, "a1", "5521999991111", "other-worker")).allowed).toBe(false);
    expect((await callback(run.id)).success).toBe(false); // No reservation.
    expect((await reserve(run.id)).allowed).toBe(true);
    expect((await reserve(run.id)).allowed).toBe(true);
    expect((await callback(run.id, "a1", "5521999993333")).success).toBe(false);
    expect((await callback(run.id)).success).toBe(true);
    expect((await callback(run.id)).success).toBe(true);
    await callback(run.id, "a1", "5521999991111", false);
    const status = await rpc("get_automation_status", [a, uid]);
    expect(status.run.counts.sent).toBe(1);
    expect(status.run.counts.invalid).toBe(0);
    const target = (
      await query(
        "SELECT status,mensagem_enviada FROM public.leads WHERE search_id=$1 AND lead_key='b1'",
        [b],
      )
    )[0];
    expect(target.mensagem_enviada).toBe(false);
  });
  test("finish exact response, late finish cannot release B, no re-open by late claim", async () => {
    const { run } = await start();
    await claim(run.id);
    await reserve(run.id);
    await callback(run.id);
    expect(await finish(run.id)).toMatchObject({ success: true, automationRunId: run.id });
    expect((await claim(run.id)).accepted).toBe(false);
    const next = await start(b, "attempt-next", other);
    expect(next.status).toBe("created");
    await claim(next.run.id, b, "185");
    expect((await reserve(next.run.id, "b1", "5521999991111", "185", b)).allowed).toBe(false);
    await finish(run.id);
    expect((await rpc("get_automation_status", [b, other])).blocked).toBe(true);
  });
  test("reconciliation requires worker evidence and updates the same send ledger and counters", async () => {
    const {run}=await start(); await claim(run.id); await reserve(run.id);
    await rpc('begin_send',[a,run.id,'184','a1','5521999991111','184:a1']);
    await finish(run.id,'failed');
    const args=[a,run.id,uid,'a1','enviado','REC-1',null];
    expect((await rpc('reconcile_automation_send',[...args,JSON.stringify({source:'n8n_execution',executionId:'wrong'})])).success).toBe(false);
    const evidence=JSON.stringify({source:'n8n_execution',executionId:'184'});
    expect((await rpc('reconcile_automation_send',[...args,evidence])).success).toBe(true);
    expect((await rpc('reconcile_automation_send',[...args,evidence])).success).toBe(true);
    const status=await rpc('get_automation_status',[a,uid]);
    expect(status.run.state).toBe('failed'); expect(status.run.counts.sent).toBe(1);
    expect(status.run.counts.pending).toBe(0);
    expect((await query("SELECT count(*)::int as n FROM public.automation_events WHERE run_id=$1 AND event_type='sent'",[run.id]))[0].n).toBe(1);
  });
  test("lost callback retains contact in needs_review; late scoped callback reconciles without reopening", async () => {
    const { run } = await start();
    await claim(run.id);
    await reserve(run.id);
    await rpc("begin_send", [a,run.id,"184","a1","5521999991111","184:a1"]);
    await finish(run.id, "completed_with_errors");
    let state = await rpc("get_automation_status", [a, uid]);
    expect(state.run.counts.pending).toBe(1);
    expect(state.blocked).toBe(false);
    expect(state.availableCount).toBe(1);
    await callback(run.id);
    state = await rpc("get_automation_status", [a, uid]);
    expect(state.run.state).toBe("completed_with_errors");
    expect(state.run.counts.sent).toBe(1);
    expect(state.run.counts.pending).toBe(0);
  });
  test("timeout does not regress running or completed; abandoned queued keeps lock", async () => {
    const { run } = await start();
    await rpc("mark_automation_dispatch_unknown", [run.id, uid]);
    expect((await rpc("get_automation_status", [a, uid])).run.state).toBe("dispatch_unknown");
    expect((await start(b, "attempt-other", other)).status).toBe("conflict");
    await claim(run.id);
    await rpc("mark_automation_dispatch_unknown", [run.id, uid]);
    expect((await rpc("get_automation_status", [a, uid])).run.state).toBe("running");
    await finish(run.id);
    await rpc("mark_automation_dispatch_unknown", [run.id, uid]);
    expect((await rpc("get_automation_status", [a, uid])).run.state).toBe("completed");
  });
  test("worker interruption, stale state and deletion never release lock", async () => {
    const { run } = await start();
    await claim(run.id);
    await reserve(run.id);
    await query(
      "UPDATE public.automation_runs SET last_activity_at=now()-interval '1 hour' WHERE id=$1",
      [run.id],
    );
    const state = await rpc("get_automation_status", [a, uid]);
    expect(state.run.stale).toBe(true);
    expect(state.blocked).toBe(true);
    await expect(query("DELETE FROM public.searches WHERE id=$1", [a])).rejects.toThrow(
      /prospecção ativa/,
    );
    await expect(query("DELETE FROM public.leads WHERE search_id=$1", [a])).rejects.toThrow(
      /prospecção ativa/,
    );
    expect((await start(b, "attempt-other", other)).status).toBe("conflict");
  });
  test("legacy contact history applies globally and available counts reflect it", async () => {
    await query(
      "UPDATE public.leads SET mensagem_enviada=true,status='enviado' WHERE search_id=$1 AND lead_key='b1'",
      [b],
    );
    expect((await rpc("get_automation_status", [a, uid])).availableCount).toBe(1);
    const { run } = await start();
    await claim(run.id);
    expect((await reserve(run.id)).allowed).toBe(false);
  });
  test("empty and unprepared lists cannot start; failed provisioning accepts null IDs", async () => {
    await exec("TRUNCATE public.search_prospection");
    await list(a, [], false);
    expect((await start()).status).toBe("not_ready");
    await list(a, [], true);
    expect((await start()).status).toBe("empty");
  });
  test("ready list cannot downgrade or change identities and duplicate callbacks preserve sent status", async () => {
    expect((await list(a, ["a1"], false)).reason).toBe("would_downgrade_ready");
    expect((await list(a, ["a1"], true)).reason).toBe("immutable_ready_snapshot");
    const { run } = await start();
    await claim(run.id);
    await reserve(run.id);
    await callback(run.id);
    await finish(run.id);
    const result = await rpc("complete_search_with_prospection", [
      a,
      uid,
      "failed",
      "[]",
      null,
      null,
      "late",
      null,
      "[]",
    ]);
    expect(result.repeated).toBe(true);
    expect(
      (await query("SELECT status FROM public.leads WHERE search_id=$1 AND lead_key='a1'", [a]))[0]
        .status,
    ).toBe("enviado");
  });
  test("result callback inserts complete leads and sheet atomically; invalid metadata rolls back", async () => {
    const c = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    await query("INSERT INTO public.searches(id,user_id,request_id,termo,cidade,uf,status) VALUES($1,$2,gen_random_uuid(),'Dentista','Rio','RJ','completed')", [c, uid]);
    const leads = JSON.stringify([{ lead_key: "c1", nome: "Teste", telefone: "5521999996666" }]);
    const p = {
      schemaVersion: 2,
      ready: true,
      spreadsheetId: doc,
      sheetId: 0,
      sheetName: `Teste - ${c}`,
      sheetUrl: `https://docs.google.com/spreadsheets/d/${doc}/edit#gid=0`,
      eligibleCount: 1,
      eligibleLeadKeys: ["wrong"],
    };
    await expect(
      rpc("complete_search_with_prospection", [
        c,
        uid,
        "completed",
        leads,
        null,
        null,
        null,
        JSON.stringify(p),
        "[]",
      ]),
    ).rejects.toThrow(/Unknown eligible/);
    expect(
      (await query("SELECT count(*)::int as n FROM public.leads WHERE search_id=$1", [c]))[0].n,
    ).toBe(0);
    p.eligibleLeadKeys = ["c1"];
    expect(
      (
        await rpc("complete_search_with_prospection", [
          c,
          uid,
          "completed",
          leads,
          null,
          null,
          null,
          JSON.stringify(p),
          "[]",
        ])
      ).success,
    ).toBe(true);
  });
  test("privileged RPCs deny anon/authenticated, RLS hides other owner, browser cannot change authoritative status", async () => {
    const session = external ? await external.reserve() : null;
    const roleQuery = async (sql: string, args: any[] = []) =>
      session ? [...(await session.unsafe(sql, args))] : query(sql, args);
    try {
      await roleQuery("SET ROLE authenticated");
      await roleQuery("SELECT set_config('request.jwt.claim.sub',$1,false)", [uid]);
      expect(
        (await roleQuery("SELECT search_id FROM public.search_prospection")).map(
          (x) => x.search_id,
        ),
      ).toEqual([a]);
      await expect(
        roleQuery("SELECT public.start_automation_run($1,$2,$3,$4)", [
          a,
          uid,
          connection,
          "attempt-role",
        ]),
      ).rejects.toThrow(/permission denied/);
      await expect(
        roleQuery("UPDATE public.leads SET status='enviado' WHERE search_id=$1", [a]),
      ).rejects.toThrow(/permission denied/);
      await roleQuery("RESET ROLE");
      await roleQuery("SET ROLE anon");
      await expect(
        roleQuery("SELECT public.claim_automation_run($1,$2,$3)", [
          a,
          "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          "184",
        ]),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await roleQuery("RESET ROLE");
      if (session) session.release();
    }
  });
  test.skipIf(!external)(
    "separate PostgreSQL connections: simultaneous clicks/workers and snapshot locking",
    async () => {
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) => start(a, `attempt-concurrent-${i}`)),
      );
      expect(results.filter((x) => x.status === "created")).toHaveLength(1);
      expect(results.filter((x) => x.status === "conflict")).toHaveLength(7);
      const run = results.find((x) => x.status === "created").run;
      const claims = await Promise.all(
        Array.from({ length: 8 }, (_, i) => claim(run.id, a, `worker-${i}`)),
      );
      expect(claims.filter((x) => x.accepted)).toHaveLength(1);
      const worker = claims.find((x) => x.accepted).executionId;
      const reservations = await Promise.all(
        Array.from({ length: 8 }, () => reserve(run.id, "a1", "5521999991111", worker)),
      );
      expect(reservations.every((x) => x.allowed)).toBe(true);
      expect((await query("SELECT count(*)::int as n FROM public.contact_reservations"))[0].n).toBe(
        1,
      );
    },
  );
});


describe("Fresh installation permissions",()=>{
 test("browser roles cannot read integration secrets, reset searches, or forge sent status",async()=>{
  const [row]=await query(`SELECT has_table_privilege('authenticated','public.n8n_settings','SELECT') settings_read,
   has_table_privilege('anon','public.n8n_settings','SELECT') anon_read,
   has_column_privilege('authenticated','public.searches','status','UPDATE') reset_search,
   has_column_privilege('authenticated','public.leads','status','UPDATE') forge_status,
   has_column_privilege('authenticated','public.leads','contacted','UPDATE') mark_contacted`);
  expect(row).toEqual({settings_read:false,anon_read:false,reset_search:false,forge_status:false,mark_contacted:true});
 });
 test("unscoped logs are private to their owner",async()=>{
  await query("INSERT INTO public.scan_logs(user_id,event_type,event_status) VALUES($1,'TEST','success'),($2,'TEST','success'),(NULL,'TEST','success')",[uid,other]);
  const session=external?await external.reserve():null;
  const roleQuery=async(sql:string,args:any[]=[])=>session?[...await session.unsafe(sql,args)]:query(sql,args);
  await roleQuery("SET ROLE authenticated");
  try{await roleQuery("SELECT set_config('request.jwt.claim.sub',$1,false)",[uid]);const rows=await roleQuery("SELECT user_id FROM public.scan_logs WHERE event_type='TEST'");expect(rows).toEqual([{user_id:uid}]);}
  finally{await roleQuery("RESET ROLE");session?.release();}
 });
});


describe("Standalone settings message tests", () => {
  const testPhone = '5521999991111';
  const configure = (owner = uid, phone = testPhone) => rpc('save_message_test_settings', [owner, true, phone, 'Empresa fictícia', 'Rio']);
  const testStart = (key = 'test-attempt-001', owner = uid) => rpc('start_message_test', [owner, key]);
  const control = (id: string, action: string, extra: Record<string, unknown> = {}) => rpc('message_test_control', [id, JSON.stringify({protocolVersion:3,searchId:id,automationRunId:id,executionId:'test-worker',action,...extra})]);
  const receipt = (id:string, extra: Record<string,unknown> = {}) => ({protocolVersion:3,searchId:id,automationRunId:id,executionId:'test-worker',lead_key:'test:'+id,telefone:testPhone,status:'enviado',mensagem_enviada:true,attemptKey:'test-attempt',messageId:'provider-receipt',messageText:'Olá, teste!',...extra});
  const send = async (id:string) => {
    expect((await control(id,'claim')).accepted).toBe(true);
    expect((await control(id,'reserve',{lead_key:'test:'+id,telefone:testPhone})).allowed).toBe(true);
    expect((await control(id,'begin_send',{lead_key:'test:'+id,telefone:testPhone,attemptKey:'test-attempt'})).allowed).toBe(true);
  };
  const done = (id:string, receipts:unknown[] = []) => control(id,'finish',{status:'completed',stopAcknowledged:true,receipts});
  test('disabled is rejected; snapshots config; repeated start never creates a second run; shared production lock',async()=>{
    expect((await testStart()).status).toBe('not_configured');
    await configure();const r=await testStart();expect(r.status).toBe('created');
    expect((await testStart()).runId).toBe(r.runId);
    expect((await testStart('test-attempt-002')).status).toBe('conflict');
    expect((await start()).status).toBe('conflict');
    expect((await configure(uid,'5521999993333')).success).toBe(false);
    const claimed=await control(r.runId,'claim');
    expect(claimed.testLead.Telefone).toBe(testPhone);expect(claimed.mode).toBe('test');
    expect((await control(r.runId,'claim',{executionId:'other-worker'})).accepted).toBe(false);
  });
  test('production run blocks test and uses the same global unique index',async()=>{
    await configure();await start();expect((await testStart()).status).toBe('conflict');
  });
  test('send, duplicate receipt and retest preserve commercial records and historical tests',async()=>{
    await configure();const r=await testStart();await send(r.runId);
    expect((await control(r.runId,'begin_send',{lead_key:'test:'+r.runId,telefone:testPhone,attemptKey:'test-attempt'})).allowed).toBe(false);
    await rpc('message_test_receipt',[r.runId,JSON.stringify(receipt(r.runId))]);
    await rpc('message_test_receipt',[r.runId,JSON.stringify(receipt(r.runId))]);
    expect((await done(r.runId)).state).toBe('completed');
    expect((await query("select count(*)::int n from public.automation_events where run_id=$1 and event_type='sent'",[r.runId]))[0].n).toBe(1);
    expect((await query("select count(*)::int n from public.contact_reservations"))[0].n).toBe(0);
    expect((await query("select count(*)::int n from public.leads where mensagem_enviada=true"))[0].n).toBe(0);
    expect((await testStart('test-attempt-002')).status).toBe('created');
    expect((await query("select count(*)::int n from public.message_test_attempts"))[0].n).toBe(2);
  });
  test('phone, lead, execution, attempt and receipt evidence are fenced',async()=>{
    await configure();const r=await testStart();await control(r.runId,'claim');
    expect((await control(r.runId,'reserve',{lead_key:'a1',telefone:testPhone})).allowed).toBe(false);
    expect((await control(r.runId,'reserve',{lead_key:'test:'+r.runId,telefone:'5521999993333'})).allowed).toBe(false);
    expect((await control(r.runId,'reserve',{lead_key:'test:'+r.runId,telefone:testPhone,executionId:'foreign'})).allowed).toBe(false);
    await control(r.runId,'reserve',{lead_key:'test:'+r.runId,telefone:testPhone});
    await expect(rpc('message_test_receipt',[r.runId,JSON.stringify(receipt(r.runId))])).rejects.toThrow();
    await control(r.runId,'begin_send',{lead_key:'test:'+r.runId,telefone:testPhone,attemptKey:'test-attempt'});
    for(const diff of [{attemptKey:'foreign'},{messageId:''},{telefone:'5521999993333'},{searchId:a}]) {
      await expect(rpc('message_test_receipt',[r.runId,JSON.stringify(receipt(r.runId,diff))])).rejects.toThrow();
    }
  });
  test('cancel before claim fences late workers; cancel after claim holds lock until stop acknowledgement',async()=>{
    await configure();const r=await testStart();
    await expect(rpc('cancel_message_test',[other,r.runId,false])).rejects.toThrow();
    expect((await rpc('cancel_message_test',[uid,r.runId,false])).verified).toBe(true);
    expect((await control(r.runId,'claim')).accepted).toBe(false);
    const next=await testStart('test-attempt-002');await control(next.runId,'claim');
    expect((await rpc('cancel_message_test',[uid,next.runId,false])).verified).toBe(false);
    expect((await control(next.runId,'check')).directive).toBe('stop');
    expect((await testStart('test-attempt-003')).status).toBe('conflict');
    expect((await done(next.runId)).state).toBe('cancelled');
    expect((await testStart('test-attempt-003')).status).toBe('created');
  });
  test('uncertain send is reviewable, late receipts are accepted without reopening; invalid finish rolls back',async()=>{
    await configure();const r=await testStart();await send(r.runId);
    await expect(done(r.runId,[receipt(r.runId,{searchId:a})])).rejects.toThrow();
    expect((await control(r.runId,'check')).state).toBe('running');
    expect((await done(r.runId)).state).toBe('completed_with_errors');
    expect((await query('select state from public.message_test_attempts where run_id=$1',[r.runId]))[0].state).toBe('needs_review');
    await rpc('message_test_receipt',[r.runId,JSON.stringify(receipt(r.runId))]);
    expect((await control(r.runId,'check')).state).toBe('completed_with_errors');
    expect((await query('select state from public.message_test_attempts where run_id=$1',[r.runId]))[0].state).toBe('sent');
    await rpc('message_test_receipt',[r.runId,JSON.stringify(receipt(r.runId,{status:'número inválido',mensagem_enviada:false}))]);
    expect((await query('select state from public.message_test_attempts where run_id=$1',[r.runId]))[0].state).toBe('sent');
  });
  test('authenticated browser cannot write settings, create tests or confirm cancellation through SQL', async () => {
    await withAuthenticatedSession(uid, async (sessionQuery) => {
      await expect(rpc('save_message_test_settings', [uid, true, testPhone, 'Empresa fictícia', 'Rio'], sessionQuery))
        .rejects.toThrow(/permission denied/);
      await expect(rpc('start_message_test', [uid, 'test-role-attempt'], sessionQuery))
        .rejects.toThrow(/permission denied/);
      await expect(rpc('cancel_message_test', [uid, a, true], sessionQuery))
        .rejects.toThrow(/permission denied/);
      await expect(sessionQuery("INSERT INTO public.message_test_settings(user_id,phone,business_name,city) VALUES($1,$2,'X','Y')", [uid, testPhone]))
        .rejects.toThrow(/permission denied/);
    });
  });
  test('test history and settings are visible only to the owner under RLS', async () => {
    await configure();
    const r = await testStart();
    await withAuthenticatedSession(uid, async (sessionQuery) => {
      expect((await sessionQuery('SELECT user_id FROM public.message_test_settings'))).toEqual([{user_id:uid}]);
      expect((await sessionQuery('SELECT run_id FROM public.message_test_attempts'))).toEqual([{run_id:r.runId}]);
      expect((await sessionQuery('SELECT id FROM public.automation_runs WHERE id=$1', [r.runId]))).toEqual([{id:r.runId}]);
    });
    await withAuthenticatedSession(other, async (sessionQuery) => {
      expect((await sessionQuery('SELECT * FROM public.message_test_settings')).length).toBe(0);
      expect((await sessionQuery('SELECT * FROM public.message_test_attempts')).length).toBe(0);
      expect((await sessionQuery('SELECT * FROM public.automation_runs WHERE id=$1', [r.runId])).length).toBe(0);
    });
  });
  test.skipIf(!external)('native concurrent test starts serialize; test and production compete for one connection',async()=>{
    await configure();
    const replies=await Promise.all([testStart('test-concurrent-01'),testStart('test-concurrent-01')]);
    expect(replies.map(r=>r.status).sort()).toEqual(['created','existing']);
    expect(replies[0].runId).toBe(replies[1].runId);
    await rpc('cancel_message_test',[uid,replies[0].runId,false]);
    const mixed=await Promise.all([testStart('test-concurrent-02'),start()]);
    expect(mixed.map(r=>r.status).sort()).toEqual(['conflict','created']);
  });

});
