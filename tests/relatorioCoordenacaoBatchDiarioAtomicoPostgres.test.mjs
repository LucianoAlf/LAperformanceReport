import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

const migrations = new URL('../supabase/migrations/', import.meta.url);
const batchName = 'executar_relatorio_coordenacao_batch_diario_v4';
const cronName = 'relatorio-coordenacao-v4-batch-diario';
const units = [
  '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
  '368d47f5-2d88-4475-bc14-ba084a9a348e',
  '95553e96-971b-4590-a6eb-0201d013c14d',
];
const oldJobs = [
  ...units.flatMap((id) => ['mensal', 'ciclo'].map((p) =>
    'relatorio-coordenacao-v4-unidade-' + id + '-' + p)),
  ...['mensal', 'ciclo'].map((p) => 'relatorio-coordenacao-v4-consolidado-' + p),
];
const keptJobs = [
  'materializar-health-score-professor-v3-diario-unidade-' + units[0],
  'materializar-health-score-professor-v3-ciclo-unidade-' + units[0],
  'health-score-professor-v3-alertas',
  'capturar-relatorio-coordenacao-v2-mensal',
  'relatorio-coordenacao-v4-auditoria',
  'relatorio-coordenacao-v4-unidade-00000000-0000-0000-0000-000000000004-mensal',
];
const windowsDocker = join(process.env.LOCALAPPDATA || '',
  'Programs', 'DockerDesktop', 'resources', 'bin', 'docker.exe');
const dockerExecutable = process.platform === 'win32' && existsSync(windowsDocker)
  ? windowsDocker : 'docker';
const tx = "begin isolation level repeatable read; set local statement_timeout='110s'; " +
  "set local lock_timeout='3s'; set local idle_in_transaction_session_timeout='115s'; ";
const runBatch = tx + 'select public.' + batchName + '(); commit;';
const barrier = '701234567890123';

function docker(args, input) {
  return spawnSync(dockerExecutable, args, {
    input, encoding: 'utf8', timeout: 30_000, maxBuffer: 12 * 1024 * 1024,
  });
}
function args(container, name = 'fixture-control') {
  return ['exec', '-i', '-e', 'PGAPPNAME=' + name, container, 'psql',
    '--no-psqlrc', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose',
    '-U', 'postgres', '-d', 'postgres', '-qAt'];
}
function sql(container, query) {
  const r = docker(args(container), query);
  assert.equal(r.status, 0, r.error?.message || r.stderr || r.stdout);
  return r.stdout.trim();
}
function json(container, query) {
  return JSON.parse(sql(container, query).split(/\r?\n/u).filter(Boolean).at(-1));
}
function error(container, query, code, message) {
  const r = docker(args(container), query);
  assert.notEqual(r.status, 0, 'SQL deveria falhar');
  assert.match(r.stderr, new RegExp('ERROR:\\s+' + code + ':'));
  assert.match(r.stderr, message);
}
function session(container, name) {
  const child = spawn(dockerExecutable, args(container, name), { stdio: 'pipe' });
  const result = { stdout: '', stderr: '', child };
  child.stdout.on('data', (chunk) => { result.stdout += chunk; });
  child.stderr.on('data', (chunk) => { result.stderr += chunk; });
  result.done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => resolve({ ...result, code }));
  });
  child.stdin.on('error', () => {}); // Cleanup may close a failed actor's stdin.
  return result;
}
async function until(check, message) {
  for (let i = 0; i < 100; i += 1) {
    if (check()) return;
    await delay(50);
  }
  assert.fail(message);
}
async function heldLock(container, key, run) {
  const holder = session(container, 'fixture-lock-holder');
  holder.child.stdin.write('select pg_advisory_lock(' + key + "); select 'LOCK_READY';\n");
  try {
    await until(() => holder.stdout.includes('LOCK_READY'), 'Holder nao adquiriu lock');
    await run(holder);
  } finally {
    if (!holder.child.stdin.destroyed) holder.child.stdin.end('\n\\q\n');
    await holder.done;
  }
}
function extract(sqlText, name) {
  const start = sqlText.search(new RegExp(
    '^create or replace function public\\.' + name + '\\s*\\(', 'imu'));
  assert.notEqual(start, -1, 'Funcao ausente: ' + name);
  const open = /\bas\s+(\$[a-zA-Z_0-9]*\$)/iu.exec(sqlText.slice(start));
  assert.ok(open);
  const end = sqlText.indexOf(open[1] + ';', start + open.index + open[0].length);
  assert.notEqual(end, -1);
  return sqlText.slice(start, end + open[1].length + 1);
}
function migration(name) {
  return readFileSync(new URL(name, migrations), 'utf8').replace(/\r\n/gu, '\n');
}
function batchMigration() {
  const names = readdirSync(migrations).filter((name) =>
    /^\d{14}_coordenacao_batch_diario_atomico\.sql$/u.test(name));
  assert.equal(names.length, 1, 'Esperada exatamente uma NOVA migration do batch atomico');
  return migration(names[0]);
}

// Only the expensive HS source/executor is a stub. The new orchestration, existing
// cycle calendar, final-document guard and append-only document materializer are real SQL.
// The local producer models the presence version boundary; its full arithmetic has
// separate coverage in relatorioCoordenacaoPresencaHistoricaPostgres.test.mjs.
const fixture = `
  create schema auth;
  create schema cron;
  create role anon;
  create role authenticated;
  create role service_role;
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  create function public.hash_jsonb_canonico(jsonb) returns text
    language sql immutable as $$ select md5($1::text) $$;
  create table public.unidades(id uuid primary key, ativo boolean not null);
  insert into public.unidades values ${units.map((id) => "('" + id + "',true)").join(',')};
  create table public.fixture_fonte(unidade_id uuid primary key, num integer, den integer);
  insert into public.fixture_fonte values
    ('${units[0]}',10,20), ('${units[1]}',20,40), ('${units[2]}',30,60);
  create table public.fixture_hs(
    id bigserial primary key, unidade_id uuid, competencia date, periodicidade text,
    num integer, den integer
  );
  create table public.fixture_calls(
    id bigserial primary key, unidade_id uuid, competencia date,
    periodicidade text, escopo text,
    statement_budget interval default current_setting('statement_timeout')::interval,
    lock_budget interval default current_setting('lock_timeout')::interval
  );
  create table public.fixture_control(
    ordinal integer primary key, resposta jsonb, divergente boolean default false,
    resposta_forcada jsonb, erro_forcado boolean default false
  );
  create table public.fixture_baselines(
    escopo_chave text, periodicidade text, primary key(escopo_chave,periodicidade)
  );
  create table public.fixture_forcados(
    id bigserial primary key, unidade_id uuid, competencia date, periodicidade text
  );
  create table public.fechamento_mensal_snapshots(
    id uuid primary key default gen_random_uuid(), ano integer, mes integer,
    escopo text, unidade_id uuid, dominio text, versao integer, status text,
    fonte text, payload jsonb, payload_hash text, observacao text,
    capturado_em timestamptz, capturado_por uuid, aprovado_em timestamptz,
    aprovado_por uuid, fechado_em timestamptz, fechado_por uuid
  );
  create unique index fixture_doc_versao on public.fechamento_mensal_snapshots(
    ano,mes,escopo,unidade_id,dominio,versao
  ) nulls not distinct;
  create function public.fixture_imutavel() returns trigger language plpgsql as $$
  begin raise exception 'FIXTURE_IMUTAVEL'; end $$;
  create trigger fixture_doc_imutavel before update or delete
    on public.fechamento_mensal_snapshots for each row execute function public.fixture_imutavel();
  create trigger fixture_hs_imutavel before update or delete
    on public.fixture_hs for each row execute function public.fixture_imutavel();

  create function public.executar_health_score_professor_v3_escopo_diario(
    p_competencia date, p_periodicidade text, p_escopo text, p_unidade_id uuid
  ) returns jsonb language plpgsql as $$
  declare v_n integer; v_d integer; v_ordinal integer; v_control record;
  begin
    if p_competencia <> date_trunc('month',current_date)::date then
      raise exception 'FIXTURE_COMPETENCIA_HS_NAO_CORRENTE';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(format(
      'health-score-professor-v3-diario:%s:%s:%s',
      p_competencia,p_escopo,coalesce(p_unidade_id::text,'rede')),0));
    insert into public.fixture_calls(unidade_id,competencia,periodicidade,escopo)
      values (p_unidade_id,p_competencia,p_periodicidade,p_escopo);
    select count(*) into v_ordinal from public.fixture_calls;
    select * into v_control from public.fixture_control where ordinal=v_ordinal;
    if v_control.resposta->>'status'='baseline_adotado' then
      insert into public.fixture_baselines values(coalesce(p_unidade_id::text,'rede'),p_periodicidade)
        on conflict do nothing;
      if found then return v_control.resposta; end if;
      -- A committed baseline is used by the real executor's next fingerprint
      -- comparison. It is only safe here if forced materialization also committed.
      return v_control.resposta || '{"status":"sem_alteracao"}'::jsonb;
    end if;
    if v_control.resposta is not null then return v_control.resposta; end if;
    select sum(num),sum(den) into v_n,v_d from public.fixture_fonte
      where p_unidade_id is null or unidade_id=p_unidade_id;
    insert into public.fixture_hs(unidade_id,competencia,periodicidade,num,den)
      values(p_unidade_id,p_competencia,p_periodicidade,
        v_n + case when v_control.divergente then 1 else 0 end,v_d);
    if current_setting('fixture.pause',true)='on' and v_ordinal=1 then
      perform pg_advisory_xact_lock(${barrier}::bigint);
    end if;
    return '{"status":"materializado","professores_incompletos":[],
      "professores_configuracao_inconsistente":[]}'::jsonb;
  end $$;
  create function public.materializar_health_score_professor_v3_escopo_diario(
    p_competencia date,p_periodicidade text,p_escopo text,p_unidade_id uuid
  ) returns jsonb language plpgsql as $$
  declare v_n integer; v_d integer; v_id bigint; v_control record;
  begin
    if current_setting('app.health_score_v3_fonte_preparada',true) is distinct from 'off' then
      raise exception 'FIXTURE_REFRESH_FORCADO_DEVE_RELER_FONTE_RR';
    end if;
    select * into v_control from public.fixture_control
      where ordinal=(select count(*) from public.fixture_calls);
    insert into public.fixture_forcados(unidade_id,competencia,periodicidade)
      values(p_unidade_id,p_competencia,p_periodicidade);
    if v_control.erro_forcado then
      raise exception 'FIXTURE_REFRESH_FORCADO_ERRO' using errcode='P0001';
    end if;
    if v_control.resposta_forcada is not null then return v_control.resposta_forcada; end if;
    select sum(num),sum(den) into v_n,v_d from public.fixture_fonte
      where p_unidade_id is null or unidade_id=p_unidade_id;
    insert into public.fixture_hs(unidade_id,competencia,periodicidade,num,den)
      values(p_unidade_id,p_competencia,p_periodicidade,v_n,v_d) returning id into v_id;
    return jsonb_build_object('competencia',p_competencia,'periodicidade',p_periodicidade,
      'escopo',p_escopo,'unidade_id',p_unidade_id,'snapshot_ids',jsonb_build_array(v_id),
      'snapshots_criados',1,'professores_incompletos','[]'::jsonb,
      'professores_configuracao_inconsistente','[]'::jsonb);
  end $$;
  create function public.montar_relatorio_coordenacao_conteudo_v4(
    p_unidade_id uuid,p_ano integer,p_mes integer,p_periodicidade text
  ) returns jsonb language plpgsql stable as $$
  declare v_h public.fixture_hs%rowtype; v_n integer; v_d integer;
  begin
    select * into v_h from public.fixture_hs
      where unidade_id is not distinct from p_unidade_id
        and competencia=date_trunc('month',current_date)::date
        and periodicidade=p_periodicidade order by id desc limit 1;
    select sum(num),sum(den) into v_n,v_d from public.fixture_fonte
      where p_unidade_id is null or unidade_id=p_unidade_id;
    if v_h.id is null or (v_h.num,v_h.den) is distinct from (v_n,v_d) then
      raise exception 'RELATORIO_COORDENACAO_V4_PRESENCA_VERSAO_DIVERGENTE'
        using errcode='22023';
    end if;
    return jsonb_build_object('schema_version',4,'numerador',v_n,'denominador',v_d,
      'hs_id',v_h.id,'ano',p_ano,'mes',p_mes,'periodicidade',p_periodicidade);
  end $$;
  -- Job wrappers are deliberately poisonous: the batch must never reconfigure
  -- HS crons, dispatch alerts/HTTP, or invoke the old per-scope documentary job.
  create function public.executar_health_score_professor_v3_job_escopo(text,uuid)
    returns jsonb language plpgsql as $$ begin raise exception 'SIDE_EFFECT_WRAPPER'; end $$;
  create function public.executar_health_score_professor_v3_job_ciclo_escopo(text,uuid)
    returns jsonb language plpgsql as $$ begin raise exception 'SIDE_EFFECT_WRAPPER'; end $$;
  create function public.executar_relatorio_coordenacao_documento_v4_diario(text,uuid,text)
    returns jsonb language plpgsql as $$ begin raise exception 'OLD_DOC_WRAPPER'; end $$;
  create table cron.job(
    jobid bigserial primary key, jobname text unique not null,
    schedule text not null, command text not null, active boolean default true,
    username text default current_user
  );
  create function cron.schedule(text,text,text) returns bigint language plpgsql as $$
  declare v_id bigint;
  begin
    insert into cron.job(jobname,schedule,command) values($1,$2,$3)
      on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command,
        active=true returning jobid into v_id;
    return v_id;
  end $$;
  create function cron.unschedule(bigint) returns boolean language plpgsql as $$
  begin delete from cron.job where jobid=$1; return found; end $$;
  create function cron.alter_job(
    job_id bigint,schedule text default null,command text default null,
    database text default null,username text default null,active boolean default null
  ) returns void language plpgsql as $$
  begin
    update cron.job j set schedule=coalesce($2,j.schedule),command=coalesce($3,j.command),
      username=coalesce($5,j.username),active=coalesce($6,j.active) where jobid=$1;
  end $$;
  create table cron.job_run_details(jobid bigint,runid bigserial primary key,status text);
  insert into cron.job(jobname,schedule,command) values
    ${[...oldJobs, ...keptJobs].map((name) => "('" + name + "','* * * * *','select 42;')").join(',')};
  insert into cron.job_run_details(jobid,status) select jobid,'succeeded' from cron.job;
`;

function reset(container) {
  sql(container, `
    truncate public.fixture_hs,public.fixture_calls,public.fixture_control,
      public.fixture_baselines,public.fixture_forcados,
      public.fechamento_mensal_snapshots restart identity;
    update public.unidades set ativo=true;
    update public.fixture_fonte set num=case unidade_id
      when '${units[0]}' then 10 when '${units[1]}' then 20 else 30 end;
    update public.fixture_fonte set den=num*2;
  `);
}
function noWrites(container) {
  assert.deepEqual(json(container, `select jsonb_build_array(
    (select count(*) from public.fixture_hs),
    (select count(*) from public.fixture_calls),
    (select count(*) from public.fechamento_mensal_snapshots),
    (select count(*) from public.fixture_baselines),
    (select count(*) from public.fixture_forcados));`), [0, 0, 0, 0, 0]);
}
function totals(container) {
  return json(container, `
    with latest as (
      select distinct on (unidade_id,dominio) * from public.fechamento_mensal_snapshots
      order by unidade_id,dominio,versao desc
    ) select jsonb_agg(jsonb_build_object(
      'dominio',dominio,'num_unidades',num_u,'den_unidades',den_u,
      'num_rede',num_r,'den_rede',den_r
    ) order by dominio) from (
      select dominio,
        sum((payload->>'numerador')::int) filter(where unidade_id is not null) num_u,
        sum((payload->>'denominador')::int) filter(where unidade_id is not null) den_u,
        max((payload->>'numerador')::int) filter(where unidade_id is null) num_r,
        max((payload->>'denominador')::int) filter(where unidade_id is null) den_r
      from latest group by dominio
    ) q;`);
}
function expectTotals(container, n, d) {
  for (const value of totals(container)) {
    assert.equal(value.num_unidades, n);
    assert.equal(value.num_rede, n);
    assert.equal(value.den_unidades, d);
    assert.equal(value.den_rede, d);
  }
}

test('batch diario Coordenacao: PostgreSQL real, RR global, finais e cron limitado',
  { timeout: 120_000 }, async (t) => {
    const newSql = batchMigration(); // Missing implementation must be RED, never skipped.
    if (docker(['info']).status !== 0) {
      t.skip('Docker indisponivel para fixture PostgreSQL');
      return;
    }
    const container = 'la-coord-batch-atomico-' + process.pid + '-' + Date.now();
    const started = docker(['run','--detach','--rm','--name',container,
      '--env','POSTGRES_PASSWORD=postgres','postgres:17-alpine']);
    assert.equal(started.status, 0, started.error?.message || started.stderr || started.stdout);
    try {
      let ready = 0;
      for (let i = 0; i < 60; i += 1) {
        ready = docker(args(container), 'select 1;').status === 0 ? ready + 1 : 0;
        if (ready === 3) break;
        await delay(500);
      }
      assert.equal(ready, 3, 'PostgreSQL nao iniciou de forma estavel');
      sql(container, fixture);
      sql(container, extract(migration('20260719120000_health_score_v3_ciclos_publicacao_parcial.sql'),
        'fn_health_score_v3_periodo'));
      sql(container, extract(migration('20260909040926_relatorio_coordenacao_documento_v4.sql'),
        'materializar_relatorio_coordenacao_documento_v4').replace(
        'function public.materializar_relatorio_coordenacao_documento_v4(',
        'function public.materializar_rel_coord_doc_before_finalidade_20260909('));
      sql(container, extract(migration('20260909054818_relatorio_coordenacao_finalidade_v4.sql'),
        'materializar_relatorio_coordenacao_documento_v4'));
      const untouched = sql(container, `select jsonb_agg(to_jsonb(j) order by jobid)
        from cron.job j where jobname in (${keptJobs.map((n) => "'" + n + "'").join(',')});`);
      const oldConfig = sql(container, `select jsonb_agg(to_jsonb(j)-'active' order by jobid)
        from cron.job j where jobname in (${oldJobs.map((n) => "'" + n + "'").join(',')});`);
      const oldHistory = sql(container, 'select jsonb_agg(to_jsonb(r) order by runid) from cron.job_run_details r;');
      sql(container, newSql); // Entire NEW migration, with local cron API only.

      await t.test('DDL prepara sem ativar; configuracao separada preserva jobs e historico', () => {
        noWrites(container);
        assert.deepEqual(json(container, 'select jsonb_agg(jobname order by jobname) from cron.job where active;'),
          [...oldJobs, ...keptJobs].sort());
        assert.equal(sql(container, `select count(*) from cron.job where jobname='${cronName}';`), '0');
        sql(container, 'select public.configurar_relatorio_coordenacao_documento_v4_cron();');
        const jobs = json(container, 'select jsonb_agg(jobname order by jobname) from cron.job where active;');
        assert.deepEqual(jobs, [...keptJobs, cronName].sort());
        assert.equal(sql(container, `select jsonb_agg(to_jsonb(j) order by jobid)
          from cron.job j where jobname <> '${cronName}' and active;`), untouched);
        assert.equal(sql(container, `select jsonb_agg(to_jsonb(j)-'active' order by jobid)
          from cron.job j where not active;`), oldConfig);
        assert.equal(sql(container, 'select jsonb_agg(to_jsonb(r) order by runid) from cron.job_run_details r;'),
          oldHistory);
        sql(container, 'select public.configurar_relatorio_coordenacao_documento_v4_cron();');
        assert.equal(sql(container, 'select count(*) from cron.job;'), String(oldJobs.length + keptJobs.length + 1));
        assert.equal(sql(container, 'select count(*) from cron.job where not active;'), '8');
        const job = json(container, `select to_jsonb(j) from cron.job j where jobname='${cronName}';`);
        assert.equal(job.schedule, '0 8 * * *');
        assert.match(job.command, /begin\s+isolation\s+level\s+repeatable\s+read/iu);
        assert.match(job.command, /statement_timeout\s*=\s*'110s'/iu);
        assert.match(job.command, /lock_timeout\s*=\s*'3s'/iu);
        assert.match(job.command, /commit\s*;/iu);
        assert.equal(job.username, 'postgres');
        json(container, job.command); // Execute the cron's actual multi-statement command.
        assert.equal(sql(container, 'select count(*) from public.fixture_calls;'), '8');
        assert.equal(sql(container, `select bool_and(statement_budget=interval '110 seconds'
          and lock_budget=interval '3 seconds') from public.fixture_calls;`), 't');
        expectTotals(container, 60, 120);
      });

      await t.test('ACL privada e search_path fixo; authenticated/anon nao executam', () => {
        for (const role of ['anon', 'authenticated']) {
          error(container, tx + 'set local role ' + role + '; select public.' + batchName + '();',
            '42501', /permission denied/u);
        }
        assert.deepEqual(json(container, `select jsonb_build_array(
          has_function_privilege('service_role','public.${batchName}()','execute'),
          has_function_privilege('service_role',
            'public.configurar_relatorio_coordenacao_documento_v4_cron()','execute'),
          (select prosecdef from pg_proc where oid='public.${batchName}()'::regprocedure),
          (select proconfig from pg_proc where oid='public.${batchName}()'::regprocedure));`),
        [true, false, true, ['search_path=public, pg_temp']]);
      });

      await t.test('recusa READ COMMITTED, SERIALIZABLE e timeout ausente/excessivo antes de writes', () => {
        reset(container);
        for (const isolation of ['read committed', 'serializable']) {
          error(container, tx.replace('repeatable read', isolation) + 'select public.' + batchName + '();',
            '25001', /REPEATABLE_READ/u);
          noWrites(container);
        }
        for (const timeout of ['0', '111s', '2min', '1h']) {
          error(container, tx.replace("statement_timeout='110s'", "statement_timeout='" + timeout + "'") +
            'select public.' + batchName + '();', '22023', /TIMEOUT/u);
          noWrites(container);
        }
        error(container, tx.replace("lock_timeout='3s'", "lock_timeout='0'") +
          'select public.' + batchName + '();', '22023', /TIMEOUT/u);
        noWrites(container);
      });

      await t.test('parse interval aceita unidades equivalentes sem perder budget do chamador', () => {
        for (const [setting, seconds] of [['110000ms', 110], ['1min', 60]]) {
          reset(container);
          json(container, runBatch.replace("statement_timeout='110s'", "statement_timeout='" + setting + "'")
            .replace("lock_timeout='3s'", "lock_timeout='3000ms'"));
          assert.equal(sql(container, `select bool_and(statement_budget=make_interval(secs=>${seconds})
            and lock_budget=interval '3 seconds') from public.fixture_calls;`), 't');
        }
      });

      await t.test('oito recortes e competencia HS corrente, mes/ano documental do inicio do ciclo', () => {
        reset(container);
        for (const [day, monthly, cycle] of [
          ['2026-10-15', '2026-10-01', '2026-09-01'],
          ['2027-01-15', '2027-01-01', '2026-12-01'],
          ['2028-02-29', '2028-02-01', '2027-12-01'],
          ['2026-12-31', '2026-12-01', '2026-12-01'],
          ['2027-03-01', '2027-03-01', '2027-03-01'],
        ]) {
          const cuts = json(container, `select jsonb_agg(to_jsonb(r))
            from public.fn_relatorio_coordenacao_recortes_diarios_v4('${day}') r;`);
          assert.equal(cuts.length, 8);
          for (const c of cuts) {
            assert.equal(c.competencia_hs, monthly);
            const expected = c.periodicidade === 'ciclo' ? cycle : monthly;
            assert.equal(c.ano, Number(expected.slice(0, 4)));
            assert.equal(c.mes, Number(expected.slice(5, 7)));
          }
        }
        const result = json(container, tx + 'set local role service_role; select public.' + batchName + '(); commit;');
        assert.equal(result.ok, true);
        assert.equal(result.recortes.length, 8);
        assert.equal(result.atualizados, 8);
        assert.equal(result.preservados, 0);
        assert.equal(sql(container, `select count(distinct (unidade_id,periodicidade))
          from public.fixture_calls where competencia=date_trunc('month',current_date)::date;`), '8');
        expectTotals(container, 60, 120);
      });

      await t.test('universo inesperado nao vira batch parcial', () => {
        reset(container);
        sql(container, `update public.unidades set ativo=false where id='${units[0]}';`);
        error(container, runBatch, '22023', /RECORTES/u);
        noWrites(container);
      });

      for (const [name, response] of [
        ['erro', { status: 'erro', erro: 'fixture' }],
        ['baseline sem diagnosticos', { status: 'baseline_adotado' }],
        ['parcial', { status: 'parcial' }],
        ['iniciada', { status: 'iniciada' }],
        ['sem status', {}],
        ['JSON null', null],
        ['sem_alteracao incompleto', { status: 'sem_alteracao',
          professores_incompletos: [7], professores_configuracao_inconsistente: [] }],
        ['materializado inconsistente', { status: 'materializado',
          professores_incompletos: [], professores_configuracao_inconsistente: [7] }],
        ['diagnosticos ausentes', { status: 'materializado' }],
      ]) {
        await t.test('HS ' + name + ' no ultimo recorte aborta tambem sete docs/HS anteriores', () => {
          reset(container);
          sql(container, `insert into public.fixture_control(ordinal,resposta)
            values(8,'${JSON.stringify(response)}'::jsonb);`);
          error(container, runBatch, '22023', /HS_NAO_CONFIAVEL/u);
          noWrites(container);
        });
      }

      await t.test('sem_alteracao confiavel reutiliza fotografias sem impedir documentos', () => {
        reset(container);
        json(container, runBatch);
        sql(container, `truncate public.fixture_calls restart identity;
          insert into public.fixture_control(ordinal,resposta)
          select i,'{"status":"sem_alteracao","professores_incompletos":[],
            "professores_configuracao_inconsistente":[]}'::jsonb from generate_series(1,8) i;`);
        const result = json(container, runBatch);
        assert.equal(result.atualizados, 8);
        assert.equal(sql(container, 'select count(*) from public.fixture_hs;'), '8');
        assert.equal(sql(container, 'select count(*) from public.fechamento_mensal_snapshots;'), '8');
        expectTotals(container, 60, 120);
      });

      await t.test('baseline valida forca apenas o recorte afetado e nao fica presa no proximo batch', () => {
        reset(container);
        sql(container, `insert into public.fixture_hs(unidade_id,competencia,periodicidade,num,den)
          values(null,date_trunc('month',current_date)::date,'ciclo',1,1);
          insert into public.fixture_control(ordinal,resposta) values(8,
            '{"status":"baseline_adotado","professores_incompletos":[],
              "professores_configuracao_inconsistente":[]}');`);
        const stale = sql(container, 'select to_jsonb(h) from public.fixture_hs h where id=1;');
        const result = json(container, tx +
          "set local app.health_score_v3_fonte_preparada='on'; select public." + batchName + '(); commit;');
        assert.equal(result.atualizados, 8);
        assert.equal(result.recortes.filter((r) => r.hs?.refresh_forcado_apos_baseline).length, 1);
        assert.equal(sql(container, `select count(*) from public.fixture_forcados where unidade_id is null
          and periodicidade='ciclo' and competencia=date_trunc('month',current_date)::date;`), '1');
        assert.equal(sql(container, 'select to_jsonb(h) from public.fixture_hs h where id=1;'), stale);
        expectTotals(container, 60, 120);
        sql(container, 'truncate public.fixture_calls restart identity;');
        const next = json(container, runBatch);
        assert.equal(next.atualizados, 8);
        assert.equal(next.recortes.at(-1).hs.status, 'sem_alteracao');
        assert.equal(sql(container, 'select count(*) from public.fixture_forcados;'), '1');
        expectTotals(container, 60, 120);
      });

      await t.test('erro apos fallback reverte fingerprint/refresh; nova tentativa efetivamente renova', () => {
        reset(container);
        sql(container, `insert into public.fixture_control(ordinal,resposta) values
          (7,'{"status":"baseline_adotado","professores_incompletos":[],
              "professores_configuracao_inconsistente":[]}'),
          (8,'{"status":"erro"}');`);
        error(container, runBatch, '22023', /HS_NAO_CONFIAVEL/u);
        noWrites(container);
        sql(container, 'delete from public.fixture_control where ordinal=8;');
        const result = json(container, runBatch);
        assert.equal(result.recortes.filter((r) => r.hs?.refresh_forcado_apos_baseline).length, 1);
        assert.equal(sql(container, 'select count(*) from public.fixture_baselines;'), '1');
        assert.equal(sql(container, 'select count(*) from public.fixture_forcados;'), '1');
        expectTotals(container, 60, 120);
      });

      for (const [name, response, throws] of [
        ['erro SQL', null, true],
        ['vazio', {}, false],
        ['JSON null', null, false],
        ['zero snapshots', { snapshots_criados: 0, snapshot_ids: [] }, false],
        ['shape invalido', { snapshots_criados: '1', snapshot_ids: 'uuid' }, false],
        ['contagem divergente', { snapshots_criados: 2, snapshot_ids: [1] }, false],
        ['escopo divergente', { escopo: 'unidade' }, false],
        ['unidade divergente', { unidade_id: units[0] }, false],
        ['periodicidade divergente', { periodicidade: 'mensal' }, false],
        ['competencia divergente', { competencia: '2020-01-01' }, false],
        ['status erro com contagem', { status: 'erro' }, false],
        ['incompleto', { snapshots_criados: 1, snapshot_ids: [1],
          professores_incompletos: [7], professores_configuracao_inconsistente: [] }, false],
      ]) {
        await t.test('fallback ' + name + ' jamais e aceito como prova de refresh', () => {
          reset(container);
          // Keep all other metadata valid: each case must exercise its named
          // guard, not accidentally fail on missing scope/date/diagnostics.
          const supplied = response && Object.keys(response).length
            ? `jsonb_build_object('competencia',date_trunc('month',current_date)::date,
                'periodicidade','ciclo','escopo','consolidado','unidade_id',null,
                'snapshots_criados',1,'snapshot_ids','[1]'::jsonb,
                'professores_incompletos','[]'::jsonb,
                'professores_configuracao_inconsistente','[]'::jsonb)
                || '${JSON.stringify(response)}'::jsonb`
            : "'"+ JSON.stringify(response) + "'::jsonb";
          sql(container, `insert into public.fixture_control(ordinal,resposta,resposta_forcada,erro_forcado)
            values(8,'{"status":"baseline_adotado","professores_incompletos":[],
              "professores_configuracao_inconsistente":[]}',
              ${supplied},${throws});`);
          error(container, runBatch, throws ? 'P0001' : '22023',
            throws ? /FIXTURE_REFRESH_FORCADO_ERRO/u : /REFRESH_FORCADO_NAO_CONFIAVEL/u);
          noWrites(container);
        });
      }

      await t.test('guard do produtor continua fatal: divergencia desfaz batch inteiro', () => {
        reset(container);
        sql(container, 'insert into public.fixture_control(ordinal,divergente) values(8,true);');
        error(container, runBatch, '22023', /PRESENCA_VERSAO_DIVERGENTE/u);
        noWrites(container);
      });

      await t.test('aprovado/fechado/retificado preservados byte a byte sem refresh HS', () => {
        reset(container);
        sql(container, `
          insert into public.fechamento_mensal_snapshots(
            ano,mes,escopo,unidade_id,dominio,versao,status,payload,payload_hash
          ) select r.ano,r.mes,r.escopo,r.unidade_id,r.dominio,1,
            case row_number() over(order by r.unidade_id) when 1 then 'aprovado'
              when 2 then 'fechado' else 'retificado' end,
            '{"schema_version":4,"historico":"congelado"}','hash-congelado'
          from public.fn_relatorio_coordenacao_recortes_diarios_v4(current_date) r
          where r.unidade_id is not null and r.periodicidade='mensal';
          insert into public.fixture_hs(unidade_id,competencia,periodicidade,num,den)
            values ('${units[0]}',date_trunc('month',current_date)::date,'mensal',999,999);
        `);
        const before = sql(container, `select jsonb_agg(to_jsonb(s) order by id)
          from public.fechamento_mensal_snapshots s;`);
        const hsBefore = sql(container, 'select to_jsonb(h) from public.fixture_hs h;');
        const result = json(container, runBatch);
        assert.equal(result.preservados, 3);
        assert.equal(result.atualizados, 5);
        assert.equal(sql(container, `select jsonb_agg(to_jsonb(s) order by id)
          from public.fechamento_mensal_snapshots s where status<>'preview';`), before);
        assert.equal(sql(container, 'select to_jsonb(h) from public.fixture_hs h where id=1;'), hsBefore);
        assert.equal(sql(container, `select count(*) from public.fixture_calls
          where unidade_id is not null and periodicidade='mensal';`), '0');
        assert.equal(sql(container, 'select count(*) from public.fixture_calls;'), '5');
        assert.equal(result.recortes.filter((r) => r.documento.finalizado).length, 3);
      });

      await t.test('todos finais: nenhuma chamada HS nem nova versao documental', () => {
        reset(container);
        sql(container, `insert into public.fechamento_mensal_snapshots(
          ano,mes,escopo,unidade_id,dominio,versao,status,payload,payload_hash
        ) select ano,mes,escopo,unidade_id,dominio,1,'retificado',
          '{"schema_version":4}', 'final' from public.fn_relatorio_coordenacao_recortes_diarios_v4(current_date);`);
        const result = json(container, runBatch);
        assert.equal(result.preservados, 8);
        assert.equal(result.atualizados, 0);
        assert.equal(sql(container, 'select count(*) from public.fixture_calls;'), '0');
        assert.equal(sql(container, 'select count(*) from public.fechamento_mensal_snapshots;'), '8');
      });

      await t.test('final legado ou de outra competencia nao impede refresh do recorte aberto', () => {
        reset(container);
        sql(container, `
          insert into public.fechamento_mensal_snapshots(
            ano,mes,escopo,unidade_id,dominio,versao,status,payload,payload_hash
          ) select ano,mes,escopo,unidade_id,dominio,1,'fechado',
            '{"schema_version":3}', 'legado'
            from public.fn_relatorio_coordenacao_recortes_diarios_v4(current_date)
            where unidade_id='${units[0]}' and periodicidade='mensal';
          insert into public.fechamento_mensal_snapshots(
            ano,mes,escopo,unidade_id,dominio,versao,status,payload,payload_hash
          ) select ano-1,mes,escopo,unidade_id,dominio,1,'retificado',
            '{"schema_version":4}', 'ano-anterior'
            from public.fn_relatorio_coordenacao_recortes_diarios_v4(current_date)
            where unidade_id is null;
        `);
        const before = sql(container, `select jsonb_agg(to_jsonb(s) order by id)
          from public.fechamento_mensal_snapshots s;`);
        const result = json(container, runBatch);
        assert.equal(result.preservados, 0);
        assert.equal(result.atualizados, 8);
        assert.equal(sql(container, `select jsonb_agg(to_jsonb(s) order by id)
          from public.fechamento_mensal_snapshots s where status<>'preview';`), before);
        assert.equal(sql(container, 'select count(*) from public.fixture_calls;'), '8');
      });

      await t.test('timeout real do chamador cancela a instrucao e desfaz o primeiro refresh', async () => {
        reset(container);
        await heldLock(container, barrier + '::bigint', async () => {
          error(container, tx.replace("statement_timeout='110s'", "statement_timeout='500ms'") +
            "set local fixture.pause='on'; select public." + batchName + '(); commit;',
          '57014', /statement timeout/u);
          noWrites(container);
        });
      });

      for (const [label, key] of [
        ['batch', "hashtextextended('relatorio-coordenacao-v4-batch-diario',0)"],
        ['HS diario', `hashtextextended(format('health-score-professor-v3-diario:%s:unidade:%s',
          date_trunc('month',current_date)::date,'${units[2]}'),0)`],
        ['documento', `hashtextextended(concat_ws(':','relatorio-coordenacao-v4',
          extract(year from current_date)::int,extract(month from current_date)::int,
          'mensal','consolidado','consolidado'),0)`],
      ]) {
        await t.test('lock concorrente ' + label + ' falha antes de qualquer refresh', async () => {
          reset(container);
          await heldLock(container, key, async () => {
            error(container, runBatch, '55P03', /LOCK/u);
            noWrites(container);
          });
        });
      }

      await t.test('duas conexoes: commit de eventos no meio nao divide unidades/rede nem vaza parcial', async () => {
        reset(container);
        let actor;
        await heldLock(container, barrier + '::bigint', async (writer) => {
          actor = session(container, 'fixture-batch-reader');
          actor.child.stdin.end(tx + "set local fixture.pause='on'; select public." + batchName + '(); commit;');
          try {
            await until(() => sql(container, `select count(*) from pg_stat_activity
              where application_name='fixture-batch-reader' and wait_event_type='Lock';`) === '1',
            'Batch nao alcancou barreira depois do primeiro refresh');
            assert.equal(sql(container, 'select count(*) from public.fixture_hs;'), '0');
            assert.equal(sql(container, 'select count(*) from public.fechamento_mensal_snapshots;'), '0');
            writer.child.stdin.write(`begin; update public.fixture_fonte set num=num+1,den=den+2;
              commit; select pg_advisory_unlock(${barrier}::bigint);\n`);
            const completed = await actor.done;
            assert.equal(completed.code, 0, completed.stderr);
            assert.equal(JSON.parse(completed.stdout.trim()).recortes.length, 8);
            expectTotals(container, 60, 120); // ALL eight use the pre-concurrent-commit source.
            assert.equal(sql(container, 'select sum(num) from public.fixture_fonte;'), '63');
          } finally {
            if (actor.child.exitCode === null) {
              sql(container, `select pg_cancel_backend(pid) from pg_stat_activity
                where application_name='fixture-batch-reader';`);
              await actor.done;
            }
          }
        });
        sql(container, 'truncate public.fixture_calls restart identity;');
        json(container, runBatch);
        expectTotals(container, 63, 126); // The NEXT batch sees the concurrent commit everywhere.
        assert.equal(sql(container, 'select count(*) from public.fechamento_mensal_snapshots;'), '16');
      });
    } finally {
      const stopped = docker(['stop', container]);
      assert.equal(stopped.status, 0, stopped.stderr || stopped.stdout);
    }
  });
