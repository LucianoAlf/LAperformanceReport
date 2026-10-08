import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// Pedido do Alf via Alfredo (08/10): refresh diário das faturas abertas e
// vencidas + valor_hoje com origem_juros ('emusys_hoje' quando o espelho foi
// relido hoje, senão 'formula_unidade') + vigia de divergência Emusys x fórmula.
// Roda a migration real num Postgres descartável (Docker) com stubs mínimos
// para cron/fila/snapshot e confere os casos pedidos + rollback.

const root = process.cwd();
const migracao = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '20261008160000_faturas_vencidas_juros_emusys.sql'),
  'utf8',
);
const rollback = fs.readFileSync(
  path.join(root, 'supabase', 'rollbacks', '20261008160000_faturas_vencidas_juros_emusys_ROLLBACK.sql'),
  'utf8',
);
const migracaoEncargos = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '20261007200000_financeiro_encargos_unidade.sql'),
  'utf8',
);

const BARRA = '11111111-1111-1111-1111-111111111111';
const CG = '22222222-2222-2222-2222-222222222222';

// A migration recria os 4 chamadores canônicos (que dependem de dezenas de
// objetos reais) — num Postgres limpo o CREATE compila porque plpgsql resolve
// identificadores só na execução. Os stubs abaixo cobrem o que a migration e
// os testes EXECUTAM de fato.
function bootstrapSql() {
  return `
    create role anon;
    create role authenticated;
    create role service_role;
    create role mila_acesso_restrito;
    create role fabio_agent;
    create role lia_acesso_restrito;

    create schema if not exists auth;
    create function auth.role() returns text language sql stable as $$ select 'service_role' $$;

    create schema if not exists cron;
    create table cron.job (jobid serial primary key, jobname text unique, schedule text, command text);
    create function cron.schedule(job_name text, schedule text, command text)
      returns bigint language plpgsql as $f$
    begin
      insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
      on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
      returning jobid into job_name;
      return 1;
    end $f$;
    create function cron.unschedule(job_name text) returns boolean language plpgsql as $f$
    begin delete from cron.job where jobname = job_name; return true; end $f$;

    create table public.unidades (id uuid primary key, codigo text);
    insert into public.unidades values ('${BARRA}', 'BARRA'), ('${CG}', 'CG');

    create table public.emusys_faturas (
      id uuid primary key default gen_random_uuid(),
      unidade_id uuid not null,
      unidade_codigo text,
      emusys_fatura_id bigint not null,
      emusys_matricula_id bigint,
      emusys_contrato_id bigint,
      emusys_student_id bigint,
      descricao text,
      status text,
      data_vencimento date,
      data_pagamento date,
      competencia date,
      valor_original numeric,
      valor_pago numeric,
      juros_e_multa numeric,
      desconto_aplicado numeric,
      desconto_fixo numeric,
      desconto_condicional numeric,
      payload jsonb,
      synced_at timestamptz,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      unique (unidade_id, emusys_fatura_id)
    );

    create table public.sync_runs (
      id uuid primary key default gen_random_uuid(),
      run_type text default 'live',
      status text default 'succeeded',
      competencia date not null,
      snapshot_complete boolean default true,
      unidades_concluidas int default 3,
      completed_at timestamptz default now(),
      stale_after timestamptz default now(),
      units_summary jsonb default '{}'::jsonb
    );
    create table public.sync_run_items (
      id uuid primary key default gen_random_uuid(),
      run_id uuid,
      competencia date,
      unidade_id uuid,
      unidade_codigo text,
      emusys_fatura_id bigint,
      status text,
      data_vencimento date,
      source_missing boolean default false
    );
    create table public.financeiro_sync_queue (
      id uuid primary key default gen_random_uuid(),
      competencia date unique,
      status text default 'pending',
      priority int,
      trigger_source text,
      requested_by text,
      next_attempt_at timestamptz default now()
    );
    -- stub mínimo da RPC que o backlog chama para enfileirar
    create function public.enqueue_financeiro_sync_competencias(
      p_competencias date[], p_trigger_source text, p_requested_by text default null, p_priority int default 300
    ) returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $f$
    begin
      insert into public.financeiro_sync_queue (competencia, status, priority, trigger_source, requested_by)
      select c, 'pending', p_priority, p_trigger_source, p_requested_by from unnest(p_competencias) c
      on conflict (competencia) do nothing;
      return jsonb_build_object('enfileiradas', cardinality(p_competencias));
    end $f$;
  `;
}

function docker(args, input, timeout = 120_000) {
  return spawnSync('docker', args, { input, encoding: 'utf8', timeout, maxBuffer: 10 * 1024 * 1024 });
}
function psql(container, sql) {
  return docker(['exec', '-i', container, 'psql', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-At'], sql);
}
async function withPostgres(t, callback) {
  const probe = docker(['version', '--format', '{{.Server.Version}}'], undefined, 5_000);
  if (probe.status !== 0 || probe.error) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }
  const name = `la-vencidas-${process.pid}-${Date.now()}`.toLowerCase();
  const started = docker(['run', '--rm', '--name', name, '-e', 'POSTGRES_PASSWORD=postgres', '-d', 'postgres:17-alpine']);
  assert.equal(started.status, 0, started.stderr || started.stdout);
  try {
    for (let i = 0; i < 30; i += 1) {
      const ready = docker(['exec', name, 'pg_isready', '-U', 'postgres'], undefined, 5_000);
      if (ready.status === 0) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    return await callback((sql) => psql(name, sql));
  } finally {
    docker(['stop', name], undefined, 15_000);
  }
}

function item(unidadeId, faturaId, vencimento, juros, extra = {}) {
  return {
    unidade_id: unidadeId,
    unidade_codigo: unidadeId === CG ? 'cg' : 'barra',
    emusys_fatura_id: faturaId,
    emusys_matricula_id: null,
    emusys_contrato_id: null,
    emusys_student_id: null,
    descricao: 'Parcela teste',
    status: 'aberta',
    data_vencimento: vencimento,
    data_pagamento: null,
    competencia: `${vencimento.slice(0, 7)}-01`,
    valor_original: 470,
    valor_pago: null,
    juros_e_multa: juros,
    desconto_aplicado: 0,
    desconto_fixo: 0,
    desconto_condicional: 0,
    payload: {},
    ...extra,
  };
}

const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const ontem = (() => { const d = new Date(`${hoje}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();
const anteOntem = (() => { const d = new Date(`${hoje}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 2); return d.toISOString().slice(0, 10); })();

test('publish upserta espelho, registra run e vigia detecta divergencia', async () => {
  await withPostgres(test, (run) => {
    let r = run(bootstrapSql());
    assert.equal(r.status, 0, r.stderr);
    // aplica primeiro a migration de encargos (#612) — dependência do pedido
    r = run(migracaoEncargos);
    assert.equal(r.status, 0, r.stderr);
    r = run(migracao);
    assert.equal(r.status, 0, r.stderr);

    const itens = [
      // Barra 1%: 470 * 0.02 + 470 * 0.01 * 3/30 = 9.40 + 0.47 = 9.87 — mando 9.87 (bate)
      item(BARRA, 1001, anteOntem, 9.87),
      // CG 1.5%: 470 * 0.02 + 470 * 0.015 * 3/30 = 9.40 + 0.705 = 10.11 — mando 15.00 (diverge)
      item(CG, 2001, anteOntem, 15.00),
      // vencida com juros 0 no Emusys vs fórmula > 0 — também diverge (sinal de taxa desligada)
      item(CG, 2002, anteOntem, 0),
      // não vencida: não entra na vigia
      item(CG, 2003, '2099-01-10', 0, { status: 'aberta' }),
      // paga: não entra
      item(CG, 2004, anteOntem, 9.00, { status: 'paga' }),
    ];
    const payload = JSON.stringify(itens).replace(/'/g, "''");
    r = run(`select public.publish_faturas_vencidas_sync('${payload}'::jsonb, 'teste', 'teste')`);
    assert.equal(r.status, 0, r.stderr);

    const espelho = run(`select jsonb_agg(row_to_json(f)) from (select emusys_fatura_id, juros_e_multa, synced_at::date s from public.emusys_faturas order by 1) f`).stdout.trim();
    const rows = JSON.parse(espelho || '[]');
    assert.equal(rows.length, 5);
    assert.equal(rows.every((x) => x.s === hoje), true);

    const runRow = JSON.parse(run(`select row_to_json(r) from public.financeiro_faturas_vencidas_runs order by started_at desc limit 1`).stdout.trim());
    assert.equal(runRow.status, 'succeeded');
    assert.equal(runRow.itens_recebidos, 5);
    assert.equal(runRow.itens_atualizados, 5);
    // divergências: fatura 2001 (15.00 vs 10.11) e 2002 (0 vs 10.11)
    assert.equal(runRow.divergencias, 2);

    const div = JSON.parse(run(`select jsonb_agg(row_to_json(d)) from (select emusys_fatura_id, juros_emusys, juros_formula, diferenca from public.financeiro_juros_divergencias order by 1) d`).stdout.trim() || '[]');
    assert.equal(div.length, 2);
    const d2001 = div.find((x) => x.emusys_fatura_id === 2001);
    assert.ok(Math.abs(d2001.juros_emusys - 15) < 0.001);
    assert.ok(Math.abs(d2001.juros_formula - 10.11) < 0.001);
  });
});

test('origem_juros: espelho de hoje manda o Emusys; antigo, zero ou paga caem na formula', async () => {
  await withPostgres(test, (run) => {
    let r = run(bootstrapSql());
    assert.equal(r.status, 0, r.stderr);
    r = run(migracaoEncargos);
    assert.equal(r.status, 0, r.stderr);
    r = run(migracao);
    assert.equal(r.status, 0, r.stderr);

    const q = (args) => JSON.parse(run(`select public.calcular_valores_fatura_financeiro_v1(${args})`).stdout.trim());
    // CG 470, vencida anteontem (3 dias): formula = 9.40 + 0.705 -> 10.11 -> total 480.11
    // espelho relido hoje com juros>0 -> emusys_hoje
    let c = q(`470,0,0,'${anteOntem}','aberta','${hoje}','${CG}',12.34,now()`);
    assert.equal(c.origem_juros, 'emusys_hoje');
    assert.equal(c.juros_emusys, 12.34);
    assert.ok(Math.abs(c.valor_hoje - 482.34) < 0.001);
    assert.equal(c.multa, null);
    // espelho antigo -> fórmula
    c = q(`470,0,0,'${anteOntem}','aberta','${hoje}','${CG}',12.34,now() - interval '2 days'`);
    assert.equal(c.origem_juros, 'formula_unidade');
    assert.equal(c.juros_emusys, null);
    assert.ok(Math.abs(c.valor_hoje - 480.11) < 0.001);
    // sync de hoje mas juros zero -> fórmula
    c = q(`470,0,0,'${anteOntem}','aberta','${hoje}','${CG}',0,now()`);
    assert.equal(c.origem_juros, 'formula_unidade');
    // as_of no passado -> Emusys de hoje NÃO vale para data retroativa
    c = q(`470,0,0,'${anteOntem}','aberta','2020-01-01','${CG}',12.34,now()`);
    assert.equal(c.origem_juros, 'formula_unidade');
    // em dia -> sem mudança
    c = q(`470,0,50,'2099-01-10','aberta','${hoje}','${CG}',null,null`);
    assert.equal(c.multa, 0);
    assert.equal(c.valor_hoje, 420);
    // paga -> sem mudança
    c = q(`470,0,0,'${anteOntem}','paga','${hoje}','${CG}',12.34,now()`);
    assert.equal(c.valor_hoje, null);
  });
});

test('backlog so enfileira competencias <= mes corrente com atraso real, limitado a 24', async () => {
  await withPostgres(test, (run) => {
    let r = run(bootstrapSql());
    assert.equal(r.status, 0, r.stderr);
    r = run(migracaoEncargos);
    assert.equal(r.status, 0, r.stderr);
    r = run(migracao);
    assert.equal(r.status, 0, r.stderr);

    // 30 competências candidatas: 27 futuras com 'aberta' NÃO vencida (não
    // devem entrar) + 3 passadas com atraso real. Antes do fix a união estourava
    // o limite de 24 e a fila morria — por isso as vencidas ficaram velhas.
    const mesAtual = hoje.slice(0, 7);
    const seeds = [];
    for (let m = -3; m < 27; m += 1) {
      const d = new Date(`${hoje}T12:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + m, 1);
      const comp = d.toISOString().slice(0, 10);
      const vencida = m <= 0 ? `'${anteOntem}'` : `'2099-01-15'`;
      seeds.push(`insert into public.sync_runs (competencia) values ('${comp}') returning id;`);
    }
    for (const s of seeds) {
      r = run(s);
      assert.equal(r.status, 0, r.stderr);
      const rid = r.stdout.trim();
      const comp = r.stdout && run(`select competencia from public.sync_runs where id='${rid}'`).stdout.trim();
      const mes = comp.slice(0, 7);
      const passado = mes <= mesAtual;
      run(`insert into public.sync_run_items (run_id, competencia, status, data_vencimento) values ('${rid}', '${comp}', 'aberta', ${passado ? `'${anteOntem}'` : `'2099-01-15'`})`);
    }
    r = run(`select public.enqueue_financeiro_sync_backlog('teste', 'teste')`);
    assert.equal(r.status, 0, r.stderr);
    const jobs = JSON.parse(run(`select jsonb_agg(competencia order by competencia) from public.financeiro_sync_queue where trigger_source='teste'`).stdout.trim() || '[]');
    assert.ok(jobs.length <= 24);
    assert.ok(jobs.every((c) => c <= `${mesAtual}-01`));
  });
});

test('rollback desfaz tudo: calcular 7-arg, tabelas e cron removidos', async () => {
  await withPostgres(test, (run) => {
    let r = run(bootstrapSql());
    assert.equal(r.status, 0, r.stderr);
    r = run(migracaoEncargos);
    assert.equal(r.status, 0, r.stderr);
    r = run(migracao);
    assert.equal(r.status, 0, r.stderr);
    r = run(rollback);
    assert.equal(r.status, 0, r.stderr);

    const sig = run(`select p.oid::regprocedure::text from pg_proc p where proname='calcular_valores_fatura_financeiro_v1'`).stdout.trim();
    assert.match(sig, /numeric,numeric,numeric,date,text,date,uuid\)$/);
    const t = run(`select count(*) from information_schema.tables where table_name in ('financeiro_faturas_vencidas_runs','financeiro_juros_divergencias')`).stdout.trim();
    assert.equal(t, '0');
    const j = run(`select count(*) from cron.job where jobname='faturas-vencidas-sync-diario'`).stdout.trim();
    assert.equal(j, '0');
    // função restaurada sem origem_juros
    const c = JSON.parse(run(`select public.calcular_valores_fatura_financeiro_v1(470,0,0,'${ontem}','aberta','${hoje}','${CG}')`).stdout.trim());
    assert.equal(c.origem_juros, undefined);
  });
});
