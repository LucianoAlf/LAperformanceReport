import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPaths = [
  '20260816003732_inadimplencia_canonica_frescor.sql',
  '20260816004257_inadimplencia_canonica_dedupe_global.sql',
  '20260816013502_inadimplencia_canonica_quarentena_identidade.sql',
  '20260816013512_financeiro_faturas_relatorios_canonicos.sql',
  '20260816020631_inadimplencia_canonica_vencimento_estrito.sql',
  '20260816115755_inadimplencia_canonica_ignora_competencia_futura.sql',
  '20260816125329_inadimplencia_canonica_ativos_janela_tres.sql',
  '20260816150000_inadimplencia_canonica_liberacao_parcial_v3.sql',
].map((name) => path.join(root, 'supabase', 'migrations', name));
const V3_MIGRATION = migrationPaths.at(-1);
const UNIT_A = '11111111-1111-1111-1111-111111111111';
const UNIT_B = '22222222-2222-2222-2222-222222222222';
const AUTH_UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function docker(args, input, timeout = 120_000) {
  return spawnSync('docker', args, { input, encoding: 'utf8', timeout, maxBuffer: 10 * 1024 * 1024 });
}

function psql(container, sql) {
  return docker(['exec', '-i', container, 'psql', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-At'], sql);
}

function assertPsql(result, label) {
  assert.equal(result.status, 0, `${label}: ${result.stderr || result.stdout || result.error?.message || 'sem saida'}`);
}

function jsonFrom(result, label) {
  assertPsql(result, label);
  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  assert.ok(lines.length, `${label}: psql nao retornou JSON`);
  return JSON.parse(lines.at(-1));
}

function seed(container, sql, label) {
  assertPsql(psql(container, sql), label);
}

async function waitForPostgres(container) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const logs = docker(['logs', container]);
    if (/ready for start up/u.test(`${logs.stdout}\n${logs.stderr}`) && psql(container, 'select 1;').status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('PostgreSQL de teste nao iniciou a tempo');
}

function dockerIsAvailable() {
  const result = docker(['version', '--format', '{{.Server.Version}}'], undefined, 5_000);
  return result.status === 0 && !result.error && Boolean(result.stdout?.trim());
}

function assertV3Exists() {
  assert.equal(fs.existsSync(V3_MIGRATION), true, `migration canonica v3 ausente: ${V3_MIGRATION}`);
}

function assertAuthorizationFailure(result, label) {
  assert.notEqual(result.status, 0, `${label}: chamada deveria falhar`);
  assert.match(`${result.stderr}\n${result.stdout}`, /42501|permission denied|not authorized|nao autorizado|autorizad/i, label);
}

function callAs(container, role, unitId, asOfDate, authUnitId = UNIT_A) {
  return psql(container, `
    set role ${role};
    set app.test_role = '${role}';
    set app.test_uid = '${AUTH_UID}';
    set app.test_unidade_id = '${authUnitId}';
    select public.get_inadimplencia_canonica('${unitId}'::uuid, date '${asOfDate}')::text;
  `);
}

function callAllAs(container, role, asOfDate) {
  return psql(container, `
    set role ${role};
    set app.test_role = '${role}';
    set app.test_uid = '${AUTH_UID}';
    set app.test_unidade_id = '${UNIT_A}';
    select public.get_inadimplencia_canonica(null, date '${asOfDate}')::text;
  `);
}

function callFinanceAs(container, role, unitId, asOfDate) {
  const [year, month] = asOfDate.split('-').map(Number);
  return psql(container, `
    set role ${role};
    set app.test_role = '${role}';
    set app.test_uid = '${AUTH_UID}';
    set app.test_unidade_id = '${unitId}';
    select public.get_financeiro_faturas_emusys('${unitId}'::uuid, ${year}, ${month})::text;
  `);
}

const fixtureSchema = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema auth;

  create table public.unidades (id uuid primary key, nome text not null, ativo boolean not null default true);
  create table public.tipos_matricula (id bigint primary key, conta_como_pagante boolean not null default false, entra_ticket_medio boolean not null default false);
  create table public.cursos (id bigint primary key, is_projeto_banda boolean not null default false);
  create table public.alunos (
    id bigint primary key,
    unidade_id uuid not null references public.unidades(id),
    emusys_student_id text,
    emusys_matricula_id text,
    nome text,
    whatsapp text,
    telefone text,
    status text,
    updated_at timestamptz not null default now(),
    arquivado_em timestamptz,
    tipo_matricula_id bigint references public.tipos_matricula(id),
    curso_id bigint references public.cursos(id),
    is_segundo_curso boolean,
    data_saida date
  );
  create table public.emusys_matriculas_estado_atual (
    unidade_id uuid not null references public.unidades(id),
    emusys_matricula_id text not null,
    aluno_id bigint,
    status_local_resolvido text not null,
    sincronizado_em timestamptz not null,
    primary key (unidade_id, emusys_matricula_id)
  );
  create view public.vw_alunos_estado_operacional_v131 as
  select a.id as aluno_id,
    a.unidade_id,
    a.emusys_matricula_id,
    case
      when e.emusys_matricula_id is not null then lower(trim(e.status_local_resolvido)) = 'ativo'
      else lower(trim(a.status)) = 'ativo'
    end as entra_financeiro_ativo
  from public.alunos a
  left join public.emusys_matriculas_estado_atual e
    on e.unidade_id = a.unidade_id
   and e.emusys_matricula_id = a.emusys_matricula_id
  ;
  create table public.sync_runs (
    id uuid primary key, competencia date not null, run_type text not null, status text not null,
    snapshot_complete boolean not null, unidades_concluidas integer not null, completed_at timestamptz, stale_after timestamptz not null,
    constraint sync_runs_competencia_primeiro_dia_chk check (competencia = date_trunc('month', competencia)::date),
    constraint sync_runs_run_type_chk check (run_type in ('live', 'baseline')),
    constraint sync_runs_status_chk check (status in ('running', 'succeeded', 'failed')),
    constraint sync_runs_unidades_chk check (unidades_concluidas between 0 and 3),
    constraint sync_runs_frescor_chk check (
      snapshot_complete = false
      or (
        run_type = 'live'
        and status = 'succeeded'
        and completed_at is not null
        and unidades_concluidas = 3
      )
    )
  );
  create table public.sync_run_items (
    id uuid primary key default gen_random_uuid(),
    canonical_fatura_id uuid not null, unidade_id uuid not null references public.unidades(id), unidade_codigo text not null,
    competencia date not null, run_id uuid not null references public.sync_runs(id), emusys_fatura_id bigint not null,
    emusys_matricula_id bigint, emusys_contrato_id bigint, emusys_student_id bigint, descricao text not null default '',
    status text not null default 'desconhecido', data_vencimento date not null, data_pagamento date, valor_original numeric(12, 2) not null,
    valor_pago numeric(12, 2), desconto_aplicado numeric(12, 2) not null default 0,
    desconto_fixo numeric(12, 2) not null default 0, desconto_condicional numeric(12, 2) not null default 0, juros_e_multa numeric(12, 2) not null default 0,
    source_missing boolean not null default false, source_missing_reason text, source_missing_detected_at timestamptz,
    payload jsonb not null default '{}'::jsonb,
    constraint sync_run_items_identidade_uniq unique (run_id, competencia, unidade_id, emusys_fatura_id),
    constraint sync_run_items_competencia_primeiro_dia_chk check (competencia = date_trunc('month', competencia)::date),
    constraint sync_run_items_status_chk check (status in ('aberta', 'paga', 'cancelada', 'desconhecido', '')),
    constraint sync_run_items_missing_reason_chk check (
      (source_missing = false and source_missing_reason is null)
      or (source_missing = true and nullif(btrim(source_missing_reason), '') is not null)
    )
  );
  create function auth.role() returns text language sql stable as $$
    select coalesce(nullif(current_setting('app.test_role', true), ''), current_user::text);
  $$;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('app.test_uid', true), '')::uuid;
  $$;
  create function public.is_admin() returns boolean language sql stable as $$
    select coalesce(nullif(current_setting('app.test_admin', true), '')::boolean, false);
  $$;
  create function public.get_user_unidade_ids() returns setof uuid language sql stable as $$
    select u.id from public.unidades u where u.id = nullif(current_setting('app.test_unidade_id', true), '')::uuid;
  $$;
  insert into public.unidades (id, nome, ativo) values
    ('${UNIT_A}', 'Campo Grande', true), ('${UNIT_B}', 'Recreio', true);
`;

async function withContainer(t, callback) {
  if (!dockerIsAvailable()) {
    t.skip('Docker indisponivel para fixture PostgreSQL descartavel');
    return;
  }
  const container = `la-inadimplencia-v3-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const started = docker(['run', '--rm', '--name', container, '-e', 'POSTGRES_PASSWORD=postgres', '-d', 'postgres:17-alpine']);
  assert.equal(started.status, 0, started.stderr || started.stdout);
  try {
    await waitForPostgres(container);
    await callback(container);
  } finally {
    docker(['rm', '--force', container]);
  }
}

async function withCanonicalFixture(t, callback) {
  assertV3Exists();
  await withContainer(t, async (container) => {
    const migration = migrationPaths.map((migrationPath) => fs.readFileSync(migrationPath, 'utf8')).join('\n');
    seed(container, `${fixtureSchema}\n${migration}`, 'fixture operacional + migrations canonicas');
    const date = psql(container, "select (now() at time zone 'America/Sao_Paulo')::date::text;");
    assertPsql(date, 'data de referencia da fixture');
    await callback(container, date.stdout.trim());
  });
}

function insertAluno(container, id, unitId, matricula, options = {}) {
  const status = options.status ?? 'ativo';
  const student = options.student ?? null;
  const name = options.name ?? `Aluno ${id}`;
  const archived = options.archived ? 'now()' : 'null';
  const exited = options.exited ? "current_date" : 'null';
  seed(container, `
    insert into public.alunos (id, unidade_id, emusys_matricula_id, emusys_student_id, nome, whatsapp, telefone, status, arquivado_em, data_saida, curso_id, updated_at)
    values (${id}, '${unitId}', ${matricula === null ? 'null' : `'${matricula}'`}, ${student === null ? 'null' : `'${student}'`}, '${name}', '551199${id}', '1199${id}', '${status}', ${archived}, ${exited}, ${options.course ?? 'null'}, now() + interval '${options.updatedOffset ?? 0} seconds');
  `, `aluno ${id}`);
}

function insertOperationalState(container, unitId, matricula, alunoId, status) {
  seed(container, `
    insert into public.emusys_matriculas_estado_atual (unidade_id, emusys_matricula_id, aluno_id, status_local_resolvido, sincronizado_em)
    values ('${unitId}', '${matricula}', ${alunoId}, '${status}', now());
  `, `estado operacional ${unitId}/${matricula}`);
}

function seedRun(container, id, competencia, stale = false) {
  seed(container, `
    insert into public.sync_runs (id, competencia, run_type, status, snapshot_complete, unidades_concluidas, completed_at, stale_after)
    values ('${id}', ${competencia}, 'live', 'succeeded', true, 3, now(), now() ${stale ? "- interval '1 minute'" : "+ interval '1 hour'"});
  `, `run ${id}`);
}

function invoice(id, unitId, runId, competencia, matricula, options = {}) {
  const matriculaNumero = matricula === null ? null : Number(matricula);
  const status = options.status ?? 'aberta';
  const sourceMissing = options.sourceMissing ?? false;
  const student = options.student ?? (matriculaNumero === null ? null : matriculaNumero + 10_000);
  const fatura = options.fatura ?? (matriculaNumero === null ? null : matriculaNumero + 1_000);
  const contrato = matriculaNumero === null ? null : matriculaNumero + 2_000;
  const due = options.due ?? "current_date - 3";
  return `
    ('${id}', '${unitId}', '${unitId === UNIT_A ? 'CG' : 'REC'}', ${competencia}, '${runId}',
      ${fatura === null ? 'null' : fatura}, ${matriculaNumero === null ? 'null' : matriculaNumero}, ${contrato === null ? 'null' : contrato}, ${student === null ? 'null' : student},
      '${options.description ?? `Fatura ${id.slice(-4)}`}', '${status}', ${due}, ${status === 'paga' ? due : 'null'}, ${options.value ?? 100}, ${options.valorPago ?? (status === 'paga' ? options.value ?? 100 : 'null')}, 0, ${options.jurosFonte ?? 0},
      ${sourceMissing}, ${sourceMissing ? `'${options.reason ?? 'nao retornada pela origem'}'` : 'null'}, ${sourceMissing ? 'now()' : 'null'}, ${options.payload ?? "'{}'::jsonb"})`;
}

function insertInvoices(container, values, label) {
  seed(container, `
    insert into public.sync_run_items (
      canonical_fatura_id, unidade_id, unidade_codigo, competencia, run_id, emusys_fatura_id,
      emusys_matricula_id, emusys_contrato_id, emusys_student_id, descricao, status,
      data_vencimento, data_pagamento, valor_original, valor_pago, desconto_condicional, juros_e_multa,
      source_missing, source_missing_reason, source_missing_detected_at, payload
    ) values ${values.join(',')};
  `, label);
}

test('fixture operacional v3 prova tipos e constraints reais antes das migrations canonicas', { timeout: 90_000 }, async (t) => {
  await withContainer(t, async (container) => {
    seed(container, fixtureSchema, 'schema operacional minimo');
    const schemaEvidence = jsonFrom(psql(container, `
      select jsonb_build_object(
        'item_id_type', (
          select data_type from information_schema.columns
          where table_schema = 'public' and table_name = 'sync_run_items' and column_name = 'id'
        ),
        'stale_after_nullable', (
          select is_nullable from information_schema.columns
          where table_schema = 'public' and table_name = 'sync_runs' and column_name = 'stale_after'
        ),
        'constraints', (
          select jsonb_agg(conname order by conname)
          from pg_constraint
          where conrelid in ('public.sync_runs'::regclass, 'public.sync_run_items'::regclass)
        )
      )::text;
    `), 'fidelidade estrutural da fixture sem IF NOT EXISTS');
    assert.equal(schemaEvidence.item_id_type, 'uuid');
    assert.equal(schemaEvidence.stale_after_nullable, 'NO');
    assert.equal(schemaEvidence.constraints.includes('sync_runs_frescor_chk'), true);
    assert.equal(schemaEvidence.constraints.includes('sync_run_items_identidade_uniq'), true);
    assert.equal(schemaEvidence.constraints.includes('sync_run_items_status_chk'), true);

    const nullStaleAfter = psql(container, `
      insert into public.sync_runs (
        id, competencia, run_type, status, snapshot_complete, unidades_concluidas, completed_at, stale_after
      ) values (
        'ffffffff-0000-0000-0000-000000000001', date_trunc('month', current_date)::date,
        'live', 'running', false, 0, null, null
      );
    `);
    assert.notEqual(nullStaleAfter.status, 0, 'stale_after nulo deve ser rejeitado pela fixture');
    assert.match(nullStaleAfter.stderr, /stale_after.*not-null|null value.*stale_after/i);

    const completeWithoutCompletedAt = psql(container, `
      insert into public.sync_runs (
        id, competencia, run_type, status, snapshot_complete, unidades_concluidas, completed_at, stale_after
      ) values (
        'ffffffff-0000-0000-0000-000000000002', date_trunc('month', current_date)::date,
        'live', 'succeeded', true, 3, null, now() + interval '1 hour'
      );
    `);
    assert.notEqual(completeWithoutCompletedAt.status, 0, 'snapshot completo sem completed_at deve ser rejeitado');
    assert.match(completeWithoutCompletedAt.stderr, /sync_runs_frescor_chk|check constraint/i);

    insertAluno(container, 1, UNIT_A, '100', { status: 'ativo' });
    insertAluno(container, 2, UNIT_A, '200', { status: 'ativo' });
    insertAluno(container, 3, UNIT_A, '200', { status: 'ativo', updatedOffset: -1 });
    insertOperationalState(container, UNIT_A, '100', 1, 'trancado');
    const rows = jsonFrom(psql(container, `
      select coalesce(jsonb_agg(jsonb_build_object('aluno_id', aluno_id, 'matricula', emusys_matricula_id, 'ativo', entra_financeiro_ativo) order by aluno_id), '[]'::jsonb)::text
      from public.vw_alunos_estado_operacional_v131;
    `), 'leitura da view operacional da fixture');
    assert.deepEqual(rows, [
      { aluno_id: 1, matricula: '100', ativo: false },
      { aluno_id: 2, matricula: '200', ativo: true },
      { aluno_id: 3, matricula: '200', ativo: true },
    ]);
    const syntheticNameColumn = psql(container, 'select i.aluno_nome from public.sync_run_items i;');
    assert.notEqual(syntheticNameColumn.status, 0, 'fixture nao pode aceitar coluna sintetica de nome');
    assert.match(syntheticNameColumn.stderr, /aluno_nome.*does not exist|column.*aluno_nome/i);
  });
});

test('v3 libera somente faturas confirmadas quando a reconciliacao parcial e fresca', { timeout: 90_000 }, async (t) => {
  await withCanonicalFixture(t, async (container, asOfDate) => {
    const month = `date_trunc('month', date '${asOfDate}')::date`;
    insertAluno(container, 101, UNIT_A, '2101');
    insertAluno(container, 102, UNIT_A, '2102');
    insertAluno(container, 103, UNIT_A, '2103');
    const run = '00000000-0000-0000-0000-000000000101';
    seedRun(container, run, month);
    const F1 = '10000000-0000-0000-0000-000000000101';
    const F2 = '10000000-0000-0000-0000-000000000102';
    const F3 = '10000000-0000-0000-0000-000000000103';
    insertInvoices(container, [
      invoice(F1, UNIT_A, run, month, 2101, { value: 100 }),
      invoice(F2, UNIT_A, run, month, 2102, { value: 200, sourceMissing: true, reason: 'aberta ausente' }),
      invoice(F3, UNIT_A, run, month, 2103, { value: 300, status: 'paga', sourceMissing: true, reason: 'paga ausente' }),
    ], 'cenario parcial v3');
    const result = jsonFrom(callAs(container, 'authenticated', UNIT_A, asOfDate), 'leitura parcial v3');
    assert.equal(result.schema_version, 3);
    assert.equal(result.status, 'partial');
    assert.equal(result.operational.collection_allowed, true);
    assert.equal(result.operational.collection_scope, 'confirmed_only');
    assert.deepEqual(result.operational.block_reasons, []);
    assert.deepEqual(result.items.map((item) => item.canonical_fatura_id), [F1]);
    assert.equal(result.totals.total_faturas, 1);
    assert.equal(result.totals.total_original, 100);
    assert.equal(result.reconciliation.source_missing_count, 2);
    assert.equal(result.reconciliation.source_missing_open_count, 1);
    assert.equal(result.reconciliation.source_missing_other_count, 1);
    const unknown = result.reconciliation.unknown_invoices.find((item) => item.canonical_fatura_id === F3);
    assert.equal(unknown.last_known_status, 'paga');
    assert.equal(unknown.last_known_valor_original, 300);
    assert.equal(unknown.source_missing_reason, 'paga ausente');
    assert.ok(unknown.source_missing_detected_at);
    assert.ok(unknown.sync_completed_at);
  });
});

test('v3 quarentena o grupo misto por unidade sem transformar conflito em duplicata confirmada', { timeout: 90_000 }, async (t) => {
  await withCanonicalFixture(t, async (container, asOfDate) => {
    const month = `date_trunc('month', date '${asOfDate}')::date`;
    insertAluno(container, 201, UNIT_A, '2201');
    insertAluno(container, 202, UNIT_A, '2202');
    const run = '00000000-0000-0000-0000-000000000201';
    seedRun(container, run, month);
    const mixed = '20000000-0000-0000-0000-000000000201';
    const good = '20000000-0000-0000-0000-000000000202';
    insertInvoices(container, [
      invoice(mixed, UNIT_A, run, month, 2201),
      invoice(mixed, UNIT_A, run, month, 2201, { sourceMissing: true, fatura: 3299 }),
      invoice(good, UNIT_A, run, month, 2202),
    ], 'grupo misto v3');
    const result = jsonFrom(callAs(container, 'authenticated', UNIT_A, asOfDate), 'grupo misto v3');
    assert.equal(result.status, 'partial');
    assert.equal(result.operational.collection_allowed, true);
    assert.equal(result.reconciliation.duplicate_fatura_count, 0);
    assert.equal(result.reconciliation.source_missing_count, 1);
    assert.equal(result.reconciliation.source_missing_open_count, 1);
    assert.equal(result.reconciliation.source_missing_other_count, 0);
    assert.equal(
      result.reconciliation.source_missing_open_count + result.reconciliation.source_missing_other_count,
      result.reconciliation.source_missing_count,
    );
    assert.deepEqual(
      result.reconciliation.unknown_invoices.map((item) => item.canonical_fatura_id),
      [mixed],
    );
    assert.equal(result.items.some((item) => item.canonical_fatura_id === mixed), false);
    assert.deepEqual(result.items.map((item) => item.canonical_fatura_id), [good]);
  });
});

test('v3 quarentena ID quando fatura ativa confirmada colide com source_missing de matricula inativa', { timeout: 90_000 }, async (t) => {
  await withCanonicalFixture(t, async (container, asOfDate) => {
    const month = `date_trunc('month', date '${asOfDate}')::date`;
    insertAluno(container, 211, UNIT_A, '2211', { status: 'ativo' });
    insertAluno(container, 212, UNIT_A, '2212', { status: 'trancado' });
    const run = '00000000-0000-0000-0000-000000000211';
    const canonicalId = '21000000-0000-0000-0000-000000000211';
    seedRun(container, run, month);
    insertInvoices(container, [
      invoice(canonicalId, UNIT_A, run, month, 2211, { value: 100 }),
      invoice(canonicalId, UNIT_A, run, month, 2212, { value: 200, sourceMissing: true, reason: 'ausente inativa' }),
    ], 'colisao source_missing ativa e inativa');

    const result = jsonFrom(callAs(container, 'authenticated', UNIT_A, asOfDate), 'colisao source_missing ativa e inativa');
    assert.equal(result.status, 'partial');
    assert.equal(result.operational.collection_allowed, true);
    assert.equal(result.operational.collection_scope, 'confirmed_only');
    assert.deepEqual(result.operational.block_reasons, []);
    assert.deepEqual(result.items, []);
    assert.deepEqual(result.totals, {
      maior_atraso: 0,
      total_faturas: 0,
      total_matriculas: 0,
      total_original: 0,
      total_atualizado: 0,
    });
    assert.equal(result.reconciliation.source_missing_count, 1);
    assert.equal(result.reconciliation.source_missing_open_count, 1);
    assert.equal(result.reconciliation.source_missing_other_count, 0);
    assert.equal(result.reconciliation.duplicate_fatura_count, 0);
    assert.equal(result.reconciliation.invalid_identity_invoice_count, 0);
    assert.deepEqual(result.reconciliation.unknown_invoices.map((item) => item.canonical_fatura_id), [canonicalId]);
  });
});

test('v3 bloqueia duplicata quando fatura ativa confirmada colide com confirmada de matricula inativa', { timeout: 90_000 }, async (t) => {
  await withCanonicalFixture(t, async (container, asOfDate) => {
    const month = `date_trunc('month', date '${asOfDate}')::date`;
    insertAluno(container, 221, UNIT_A, '2221', { status: 'ativo' });
    insertAluno(container, 222, UNIT_A, '2222', { status: 'trancado' });
    const run = '00000000-0000-0000-0000-000000000221';
    const canonicalId = '22000000-0000-0000-0000-000000000221';
    seedRun(container, run, month);
    insertInvoices(container, [
      invoice(canonicalId, UNIT_A, run, month, 2221, { value: 100 }),
      invoice(canonicalId, UNIT_A, run, month, 2222, { value: 200 }),
    ], 'colisao duplicada ativa e inativa');

    const result = jsonFrom(callAs(container, 'authenticated', UNIT_A, asOfDate), 'colisao duplicada ativa e inativa');
    assert.equal(result.status, 'incomplete');
    assert.equal(result.operational.collection_allowed, false);
    assert.equal(result.operational.collection_scope, 'blocked');
    assert.deepEqual(result.operational.block_reasons, ['duplicate_confirmed_fatura']);
    assert.deepEqual(result.items, []);
    assert.equal(result.totals.total_faturas, 0);
    assert.equal(result.totals.total_original, 0);
    assert.equal(result.reconciliation.source_missing_count, 0);
    assert.equal(result.reconciliation.duplicate_fatura_count, 1);
    assert.equal(result.reconciliation.invalid_identity_invoice_count, 0);
    assert.deepEqual(result.reconciliation.duplicate_invoices.map((item) => item.canonical_fatura_id), [canonicalId]);
  });
});

test('v3 bloqueia identidade invalida quando fatura ativa colide com metadado invalido de matricula inativa', { timeout: 90_000 }, async (t) => {
  await withCanonicalFixture(t, async (container, asOfDate) => {
    const month = `date_trunc('month', date '${asOfDate}')::date`;
    insertAluno(container, 231, UNIT_A, '2231', { status: 'ativo' });
    insertAluno(container, 232, UNIT_A, '2232', { status: 'trancado' });
    const run = '00000000-0000-0000-0000-000000000231';
    const canonicalId = '23000000-0000-0000-0000-000000000231';
    seedRun(container, run, month);
    insertInvoices(container, [
      invoice(canonicalId, UNIT_A, run, month, 2231, { value: 100 }),
      invoice(canonicalId, UNIT_A, run, month, 2232, {
        status: 'paga',
        value: 200,
        payload: "jsonb_build_object('_la_report', jsonb_build_object('validation_issues', jsonb_build_array(jsonb_build_object('field', 'matricula_id', 'code', 'invalid_optional_identifier', 'raw_value', 'inativa-invalida'))))",
      }),
    ], 'colisao identidade invalida ativa e inativa');

    const result = jsonFrom(callAs(container, 'authenticated', UNIT_A, asOfDate), 'colisao identidade invalida ativa e inativa');
    assert.equal(result.status, 'incomplete');
    assert.equal(result.operational.collection_allowed, false);
    assert.equal(result.operational.collection_scope, 'blocked');
    assert.deepEqual(result.operational.block_reasons, ['invalid_invoice_identity']);
    assert.deepEqual(result.items, []);
    assert.equal(result.totals.total_faturas, 0);
    assert.equal(result.totals.total_original, 0);
    assert.equal(result.reconciliation.source_missing_count, 0);
    assert.equal(result.reconciliation.duplicate_fatura_count, 0);
    assert.equal(result.reconciliation.invalid_identity_invoice_count, 1);
    assert.equal(result.reconciliation.validation_issue_count, 1);
    assert.deepEqual(result.reconciliation.invalid_identity_invoices.map((item) => item.canonical_fatura_id), [canonicalId]);
  });
});

test('v3 aplica a formula contratual a uma unica fatura de R$100 vencida ha 30 dias', { timeout: 90_000 }, async (t) => {
  await withCanonicalFixture(t, async (container, asOfDate) => {
    const month = `date_trunc('month', date '${asOfDate}')::date`;
    insertAluno(container, 300, UNIT_A, '2300');
    const run = '00000000-0000-0000-0000-000000000300';
    seedRun(container, run, month);
    insertInvoices(container, [
      invoice('30000000-0000-0000-0000-000000000300', UNIT_A, run, month, 2300, {
        value: 100,
        due: `date '${asOfDate}' - 30`,
      }),
    ], 'juros v3 base de uma fatura');
    const result = jsonFrom(callAs(container, 'authenticated', UNIT_A, asOfDate), 'juros v3 base');
    assert.equal(result.status, 'ok');
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].valor_original, 100);
    assert.equal(result.items[0].dias_atraso, 30);
    assert.equal(result.items[0].multa_pct, 0.02);
    assert.equal(result.items[0].mora_pct_mes, 0.01);
    assert.equal(result.items[0].valor_atualizado, 103);
    assert.equal(result.totals.total_atualizado, 103);
  });
});

test('v3 aplica juros contratuais fora de qualquer cenario de duplicata', { timeout: 90_000 }, async (t) => {
  await withCanonicalFixture(t, async (container, asOfDate) => {
    const month = `date_trunc('month', date '${asOfDate}')::date`;
    insertAluno(container, 301, UNIT_A, '2301');
    insertAluno(container, 302, UNIT_A, '2302');
    insertAluno(container, 303, UNIT_A, '2303');
    const run = '00000000-0000-0000-0000-000000000301';
    seedRun(container, run, month);
    const F30 = '30000000-0000-0000-0000-000000000301';
    const F31 = '30000000-0000-0000-0000-000000000302';
    const F1 = '30000000-0000-0000-0000-000000000303';
    insertInvoices(container, [
      invoice(F30, UNIT_A, run, month, 2301, { value: 100, due: `date '${asOfDate}' - 30`, jurosFonte: 999 }),
      invoice(F31, UNIT_A, run, month, 2302, { value: 100.01, due: `date '${asOfDate}' - 31`, jurosFonte: 77.77 }),
      invoice(F1, UNIT_A, run, month, 2303, { value: 50.05, due: `date '${asOfDate}' - 1`, jurosFonte: 8.88 }),
    ], 'juros v3 com arredondamento por fatura');
    const result = jsonFrom(callAs(container, 'authenticated', UNIT_A, asOfDate), 'juros v3');
    assert.equal(result.status, 'ok');
    const valoresAtualizados = new Map(result.items.map((item) => [item.canonical_fatura_id, item.valor_atualizado]));
    assert.equal(result.items.every((item) => item.multa_pct === 0.02 && item.mora_pct_mes === 0.01), true);
    assert.equal(valoresAtualizados.get(F30), 103);
    assert.equal(valoresAtualizados.get(F31), 103.04);
    assert.equal(valoresAtualizados.get(F1), 51.07);
    assert.equal(result.totals.total_atualizado, 257.11);
  });
});

test('v3 cobra somente fatura vencida, nunca vencimento de hoje ou futuro', { timeout: 90_000 }, async (t) => {
  await withCanonicalFixture(t, async (container, asOfDate) => {
    const month = `date_trunc('month', date '${asOfDate}')::date`;
    insertAluno(container, 311, UNIT_A, '2311');
    insertAluno(container, 312, UNIT_A, '2312');
    insertAluno(container, 313, UNIT_A, '2313');
    const run = '00000000-0000-0000-0000-000000000311';
    seedRun(container, run, month);
    const past = '31000000-0000-0000-0000-000000000311';
    insertInvoices(container, [
      invoice(past, UNIT_A, run, month, 2311, { due: `date '${asOfDate}' - 1`, value: 100 }),
      invoice('31000000-0000-0000-0000-000000000312', UNIT_A, run, month, 2312, { due: `date '${asOfDate}'`, value: 200 }),
      invoice('31000000-0000-0000-0000-000000000313', UNIT_A, run, month, 2313, { due: `date '${asOfDate}' + 1`, value: 300 }),
    ], 'vencimentos passado, hoje e futuro');
    const result = jsonFrom(callAs(container, 'authenticated', UNIT_A, asOfDate), 'cobranca por vencimento estrito');
    assert.equal(result.status, 'ok');
    assert.deepEqual(result.items.map((item) => item.canonical_fatura_id), [past]);
    assert.equal(result.totals.total_faturas, 1);
    assert.equal(result.totals.total_original, 100);
  });
});

test('v3 falha fechado para status desconhecido e vazio sem reclassificar a fatura', { timeout: 90_000 }, async (t) => {
  await withCanonicalFixture(t, async (container, asOfDate) => {
    const month = `date_trunc('month', date '${asOfDate}')::date`;
    insertAluno(container, 321, UNIT_A, '2321');
    const scenarios = [
      {
        status: 'desconhecido',
        run: '00000000-0000-0000-0000-000000000321',
        canonicalId: '32000000-0000-0000-0000-000000000321',
      },
      {
        status: '',
        run: '00000000-0000-0000-0000-000000000322',
        canonicalId: '32000000-0000-0000-0000-000000000322',
      },
    ];

    for (const scenario of scenarios) {
      seedRun(container, scenario.run, month);
      insertInvoices(container, [
        invoice(scenario.canonicalId, UNIT_A, scenario.run, month, 2321, { status: scenario.status }),
      ], `status nao suportado ${scenario.status || 'vazio'}`);

      const result = jsonFrom(
        callAs(container, 'authenticated', UNIT_A, asOfDate),
        `status nao suportado ${scenario.status || 'vazio'}`,
      );
      assert.equal(result.status, 'error');
      assert.equal(result.error, 'unsupported_invoice_status');
      assert.equal(result.operational.collection_allowed, false);
      assert.equal(result.operational.collection_scope, 'blocked');
      assert.deepEqual(result.operational.block_reasons, []);
      assert.deepEqual(result.items, []);
      assert.deepEqual(result.totals, {
        maior_atraso: 0,
        total_faturas: 0,
        total_matriculas: 0,
        total_original: 0,
        total_atualizado: 0,
      });
      assert.equal(result.reconciliation.status, 'clear');
      assert.equal(result.reconciliation.source_missing_count, 0);
      assert.equal(result.reconciliation.duplicate_fatura_count, 0);
      assert.equal(result.reconciliation.invalid_identity_invoice_count, 0);
      assert.deepEqual(result.reconciliation.unknown_invoices, []);
      assert.deepEqual(result.reconciliation.duplicate_invoices, []);
      assert.deepEqual(result.reconciliation.invalid_identity_invoices, []);

      seed(container, 'delete from public.sync_run_items; delete from public.sync_runs;', `limpeza ${scenario.status || 'vazio'}`);
    }
  });
});

test('v3 preserva stale antes do erro de status nao suportado', { timeout: 90_000 }, async (t) => {
  await withCanonicalFixture(t, async (container, asOfDate) => {
    const month = `date_trunc('month', date '${asOfDate}')::date`;
    insertAluno(container, 331, UNIT_A, '2331');
    const run = '00000000-0000-0000-0000-000000000331';
    seedRun(container, run, month, true);
    insertInvoices(container, [
      invoice('33000000-0000-0000-0000-000000000331', UNIT_A, run, month, 2331, { status: 'desconhecido' }),
    ], 'status nao suportado em snapshot stale');

    const result = jsonFrom(callAs(container, 'authenticated', UNIT_A, asOfDate), 'stale antes de status nao suportado');
    assert.equal(result.status, 'stale');
    assert.equal(result.error, 'unsupported_invoice_status');
    assert.equal(result.operational.collection_allowed, false);
    assert.equal(result.operational.collection_scope, 'blocked');
    assert.deepEqual(result.operational.block_reasons, ['stale_competencia']);
    assert.deepEqual(result.items, []);
    assert.equal(result.totals.total_faturas, 0);
  });
});

test('v3 bloqueia duplicata confirmada na mesma unidade e isola o mesmo ID entre unidades', { timeout: 90_000 }, async (t) => {
  await withCanonicalFixture(t, async (container, asOfDate) => {
    const month = `date_trunc('month', date '${asOfDate}')::date`;
    insertAluno(container, 401, UNIT_A, '2401');
    const run = '00000000-0000-0000-0000-000000000401';
    seedRun(container, run, month);
    const duplicate = '40000000-0000-0000-0000-000000000401';
    insertInvoices(container, [invoice(duplicate, UNIT_A, run, month, 2401), invoice(duplicate, UNIT_A, run, month, 2401, { fatura: 3402 })], 'duplicata confirmada v3');
    const blocked = jsonFrom(callAs(container, 'authenticated', UNIT_A, asOfDate), 'duplicata confirmada v3');
    assert.equal(blocked.status, 'incomplete');
    assert.equal(blocked.operational.collection_allowed, false);
    assert.equal(blocked.operational.collection_scope, 'blocked');
    assert.deepEqual(blocked.operational.block_reasons, ['duplicate_confirmed_fatura']);
    assert.deepEqual(blocked.items, []);
    assert.equal(blocked.totals.total_faturas, 0);

    seed(container, 'delete from public.sync_run_items; delete from public.sync_runs;', 'limpeza duplicata confirmada');
    insertAluno(container, 402, UNIT_B, '2401');
    const crossRun = '00000000-0000-0000-0000-000000000402';
    seedRun(container, crossRun, month);
    const shared = '40000000-0000-0000-0000-000000000402';
    insertInvoices(container, [invoice(shared, UNIT_A, crossRun, month, 2401), invoice(shared, UNIT_B, crossRun, month, 2401)], 'mesmo ID em unidades distintas');
    const isolated = jsonFrom(callAllAs(container, 'service_role', asOfDate), 'isolamento por unidade');
    assert.equal(isolated.status, 'ok');
    assert.equal(isolated.reconciliation.duplicate_fatura_count, 0);
    assert.equal(isolated.items.length, 2);
  });
});

test('v3 exige identidade de matricula: homonimos e emusys_student_id isolado nunca autorizam', { timeout: 90_000 }, async (t) => {
  await withCanonicalFixture(t, async (container, asOfDate) => {
    const month = `date_trunc('month', date '${asOfDate}')::date`;
    insertAluno(container, 501, UNIT_A, '2501', { student: '7501', name: 'Ana Souza' });
    insertAluno(container, 502, UNIT_A, '2502', { student: '7502', name: 'Ana Souza' });
    const nominalPayload = "jsonb_build_object('_la_report', jsonb_build_object('nome', 'Ana Souza'))";
    const assertInvalidScenario = (result, invalidId) => {
      assert.equal(result.status, 'incomplete');
      assert.equal(result.operational.collection_allowed, false);
      assert.deepEqual(result.operational.block_reasons, ['invalid_invoice_identity']);
      assert.equal(result.reconciliation.invalid_identity_invoice_count, 1);
      assert.deepEqual(
        result.reconciliation.invalid_identity_invoices.map((item) => item.canonical_fatura_id),
        [invalidId],
      );
      assert.deepEqual(result.items, []);
    };
    const scenarios = [
      {
        run: '00000000-0000-0000-0000-000000000501',
        invalid: '50000000-0000-0000-0000-000000000501',
        control: '50000000-0000-0000-0000-000000000511',
        row: (id, run) => invoice(id, UNIT_A, run, month, null, { fatura: 3501, student: 7501, payload: nominalPayload }),
        label: 'matricula nula com emusys_student_id correspondente',
      },
      {
        run: '00000000-0000-0000-0000-000000000502',
        invalid: '50000000-0000-0000-0000-000000000502',
        control: '50000000-0000-0000-0000-000000000512',
        row: (id, run) => invoice(id, UNIT_A, run, month, 9999, { student: 7501, payload: nominalPayload }),
        label: 'matricula errada com emusys_student_id correspondente',
      },
      {
        run: '00000000-0000-0000-0000-000000000503',
        invalid: '50000000-0000-0000-0000-000000000503',
        control: '50000000-0000-0000-0000-000000000513',
        row: (id, run) => invoice(id, UNIT_A, run, month, 9998, { student: 7999, payload: nominalPayload }),
        label: 'homonimo somente no payload',
      },
    ];
    for (const scenario of scenarios) {
      seedRun(container, scenario.run, month);
      insertInvoices(container, [
        scenario.row(scenario.invalid, scenario.run),
        invoice(scenario.control, UNIT_A, scenario.run, month, 2502),
      ], scenario.label);
      assertInvalidScenario(
        jsonFrom(callAs(container, 'authenticated', UNIT_A, asOfDate), scenario.label),
        scenario.invalid,
      );
      seed(container, 'delete from public.sync_run_items; delete from public.sync_runs;', `limpeza ${scenario.label}`);
    }
  });
});

test('v3 faz invalid_invoice_identity prevalecer sobre partial de source_missing e preserva auditoria', { timeout: 90_000 }, async (t) => {
  await withCanonicalFixture(t, async (container, asOfDate) => {
    const month = `date_trunc('month', date '${asOfDate}')::date`;
    insertAluno(container, 551, UNIT_A, '2551');
    insertAluno(container, 552, UNIT_A, '2552');
    const run = '00000000-0000-0000-0000-000000000551';
    const invalid = '55000000-0000-0000-0000-000000000551';
    seedRun(container, run, month);
    insertInvoices(container, [
      invoice(invalid, UNIT_A, run, month, 2551, {
        sourceMissing: true,
        reason: 'nao retornada pela origem',
        payload: "jsonb_build_object('_la_report', jsonb_build_object('validation_issues', jsonb_build_array(jsonb_build_object('field', 'matricula_id', 'code', 'invalid_optional_identifier', 'raw_value', 'matricula-invalida'))))",
      }),
      invoice('55000000-0000-0000-0000-000000000552', UNIT_A, run, month, 2552),
    ], 'source_missing com identidade invalida');
    const result = jsonFrom(callAs(container, 'authenticated', UNIT_A, asOfDate), 'precedencia da identidade invalida');
    assert.equal(result.status, 'incomplete');
    assert.equal(result.operational.collection_allowed, false);
    assert.equal(result.operational.collection_scope, 'blocked');
    assert.deepEqual(result.operational.block_reasons, ['invalid_invoice_identity']);
    assert.deepEqual(result.items, []);
    assert.equal(result.reconciliation.source_missing_count, 1);
    assert.equal(result.reconciliation.validation_issue_count, 1);
    assert.equal(result.reconciliation.invalid_identity_invoice_count, 1);
    assert.deepEqual(
      result.reconciliation.invalid_identity_invoices.map((item) => item.canonical_fatura_id),
      [invalid],
    );
    assert.deepEqual(
      result.reconciliation.invalid_identity_invoices[0].validation_issues,
      [{ field: 'matricula_id', code: 'invalid_optional_identifier', raw_value: 'matricula-invalida' }],
    );
  });
});

test('v3 usa estado operacional exato, mas mantem exclusoes financeiras e unidade no vinculo', { timeout: 90_000 }, async (t) => {
  await withCanonicalFixture(t, async (container, asOfDate) => {
    const month = `date_trunc('month', date '${asOfDate}')::date`;
    insertAluno(container, 601, UNIT_A, '2601', { status: 'ativo' });
    insertOperationalState(container, UNIT_A, '2601', 601, 'trancado');
    insertAluno(container, 602, UNIT_A, '2602', { status: 'trancado' });
    insertOperationalState(container, UNIT_A, '2602', 602, 'ativo');
    insertAluno(container, 603, UNIT_A, '2603', { archived: true });
    insertOperationalState(container, UNIT_A, '2603', 603, 'ativo');
    insertAluno(container, 604, UNIT_A, '2604', { exited: true });
    insertOperationalState(container, UNIT_A, '2604', 604, 'ativo');
    insertAluno(container, 605, UNIT_A, '2605', { status: 'trancado' });
    insertOperationalState(container, UNIT_A, '2605', 605, 'trancado');
    insertAluno(container, 606, UNIT_B, '2605', { status: 'ativo' });
    insertOperationalState(container, UNIT_B, '2605', 606, 'ativo');
    const run = '00000000-0000-0000-0000-000000000601';
    seedRun(container, run, month);
    const included = '60000000-0000-0000-0000-000000000602';
    insertInvoices(container, [
      invoice('60000000-0000-0000-0000-000000000601', UNIT_A, run, month, 2601),
      invoice(included, UNIT_A, run, month, 2602),
      invoice('60000000-0000-0000-0000-000000000603', UNIT_A, run, month, 2603),
      invoice('60000000-0000-0000-0000-000000000604', UNIT_A, run, month, 2604),
      invoice('60000000-0000-0000-0000-000000000605', UNIT_A, run, month, 2605),
    ], 'estado operacional e exclusoes financeiras');
    const result = jsonFrom(callAs(container, 'authenticated', UNIT_A, asOfDate), 'estado operacional v3');
    assert.deepEqual(result.items.map((item) => item.canonical_fatura_id), [included]);
  });
});

test('v3 conta uma matricula financeira uma vez mesmo com dois cursos', { timeout: 90_000 }, async (t) => {
  await withCanonicalFixture(t, async (container, asOfDate) => {
    const month = `date_trunc('month', date '${asOfDate}')::date`;
    seed(container, 'insert into public.cursos (id, is_projeto_banda) values (1, false), (2, false);', 'cursos da mesma matricula');
    insertAluno(container, 701, UNIT_A, '2701', { course: 1, updatedOffset: -1 });
    insertAluno(container, 702, UNIT_A, '2701', { course: 2 });
    const courseRows = psql(container, `
      select count(*) from public.vw_alunos_estado_operacional_v131
      where unidade_id = '${UNIT_A}' and emusys_matricula_id = '2701';
    `);
    assertPsql(courseRows, 'grão real da view para dois cursos');
    assert.equal(Number(courseRows.stdout.trim()), 2);
    const run = '00000000-0000-0000-0000-000000000701';
    seedRun(container, run, month);
    insertInvoices(container, [
      invoice('70000000-0000-0000-0000-000000000701', UNIT_A, run, month, 2701, { value: 100 }),
      invoice('70000000-0000-0000-0000-000000000702', UNIT_A, run, month, 2701, { value: 200, fatura: 3702 }),
    ], 'duas faturas da mesma matricula');
    const result = jsonFrom(callAs(container, 'authenticated', UNIT_A, asOfDate), 'matricula financeira unica');
    assert.deepEqual(result.items.map((item) => item.canonical_fatura_id).sort(), [
      '70000000-0000-0000-0000-000000000701',
      '70000000-0000-0000-0000-000000000702',
    ]);
    assert.equal(result.totals.total_faturas, 2);
    assert.equal(result.totals.total_matriculas, 1);
    assert.equal(result.totals.total_original, 300);
  });
});

test('relatorio financeiro preserva snapshot fresco, stale e source_missing sem expor dados nao confiaveis', { timeout: 90_000 }, async (t) => {
  await withCanonicalFixture(t, async (container, asOfDate) => {
    const month = `date_trunc('month', date '${asOfDate}')::date`;
    seed(container, `
      insert into public.tipos_matricula (id, conta_como_pagante, entra_ticket_medio) values (1, true, true);
      insert into public.cursos (id, is_projeto_banda) values (1, false);
    `, 'dimensoes do relatorio financeiro');
    insertAluno(container, 751, UNIT_A, '2751', { course: 1 });
    const run = '00000000-0000-0000-0000-000000000751';
    seedRun(container, run, month);
    insertInvoices(container, [
      invoice('75000000-0000-0000-0000-000000000751', UNIT_A, run, month, 2751, { status: 'paga', value: 100, valorPago: 100, fatura: 3751, description: 'Parcela 1/3' }),
      invoice('75000000-0000-0000-0000-000000000752', UNIT_A, run, month, 2751, { value: 200, fatura: 3752, description: 'Parcela 2/3' }),
      invoice('75000000-0000-0000-0000-000000000753', UNIT_A, run, month, 2751, { status: 'cancelada', value: 300, fatura: 3753, description: 'Parcela 3/3' }),
    ], 'snapshot financeiro fresco');
    const fresh = jsonFrom(callFinanceAs(container, 'authenticated', UNIT_A, asOfDate), 'relatorio financeiro fresco');
    assert.equal(fresh.status, 'ok');
    assert.equal(fresh.fonte, 'sync_run_items');
    assert.equal(fresh.freshness.is_fresh, true);
    assert.equal(fresh.tem_dados, true);
    assert.equal(fresh.totais.faturas_parcela, 3);
    assert.equal(fresh.totais.faturas_parcela_pagas, 1);
    assert.equal(fresh.totais.faturas_parcela_abertas, 1);
    assert.equal(fresh.totais.mrr_atual, 100);
    assert.equal(fresh.totais.faturamento_previsto, 300);
    assert.equal(fresh.totais.valor_aberto_parcelas, 200);
    assert.equal(fresh.inadimplencia_canonica.status, 'ok');

    seed(container, `update public.sync_runs set stale_after = now() - interval '1 minute' where id = '${run}';`, 'relatorio financeiro stale');
    const stale = jsonFrom(callFinanceAs(container, 'authenticated', UNIT_A, asOfDate), 'relatorio financeiro bloqueado por frescor');
    assert.equal(stale.status, 'stale');
    assert.equal(stale.tem_dados, false);
    assert.deepEqual(stale.por_unidade, []);

    seed(container, `
      update public.sync_runs set stale_after = now() + interval '1 hour' where id = '${run}';
      update public.sync_run_items
      set source_missing = true, source_missing_reason = 'nao confirmada na origem', source_missing_detected_at = now()
      where canonical_fatura_id = '75000000-0000-0000-0000-000000000752';
    `, 'relatorio financeiro source_missing');
    const incomplete = jsonFrom(callFinanceAs(container, 'authenticated', UNIT_A, asOfDate), 'relatorio financeiro bloqueado por source_missing');
    assert.equal(incomplete.status, 'incomplete');
    assert.equal(incomplete.tem_dados, false);
    assert.equal(incomplete.integrity.source_missing_count, 1);
    assert.deepEqual(incomplete.por_unidade, []);
  });
});

test('v3 preserva gates de frescor: passado stale bloqueia e competencia futura stale nao bloqueia', { timeout: 90_000 }, async (t) => {
  await withCanonicalFixture(t, async (container, asOfDate) => {
    const month = `date_trunc('month', date '${asOfDate}')::date`;
    insertAluno(container, 801, UNIT_A, '2801');
    const staleRun = '00000000-0000-0000-0000-000000000801';
    seedRun(container, staleRun, month, true);
    insertInvoices(container, [invoice('80000000-0000-0000-0000-000000000801', UNIT_A, staleRun, month, 2801)], 'competencia passada stale');
    const stale = jsonFrom(callAs(container, 'authenticated', UNIT_A, asOfDate), 'gate stale passado');
    assert.equal(stale.status, 'stale');
    assert.equal(stale.operational.collection_allowed, false);
    assert.deepEqual(stale.items, []);

    seed(container, 'delete from public.sync_run_items; delete from public.sync_runs;', 'limpeza gate stale');
    const freshRun = '00000000-0000-0000-0000-000000000802';
    const futureRun = '00000000-0000-0000-0000-000000000803';
    seedRun(container, freshRun, month);
    seedRun(container, futureRun, `(${month} + interval '1 month')::date`, true);
    insertInvoices(container, [
      invoice('80000000-0000-0000-0000-000000000802', UNIT_A, freshRun, month, 2801),
      invoice('80000000-0000-0000-0000-000000000803', UNIT_A, futureRun, `(${month} + interval '1 month')::date`, 2801, { due: `date '${asOfDate}' + 10` }),
    ], 'competencia futura stale');
    const future = jsonFrom(callAs(container, 'authenticated', UNIT_A, asOfDate), 'competencia futura stale ignorada');
    assert.equal(future.status, 'ok');
    assert.equal(future.operational.collection_allowed, true);
    assert.equal(future.items.length, 1);
  });
});

test('v3 usa o snapshot mais recente, janela de tres meses e autorizacao por unidade', { timeout: 90_000 }, async (t) => {
  await withCanonicalFixture(t, async (container, asOfDate) => {
    const month = `date_trunc('month', date '${asOfDate}')::date`;
    for (const [id, matricula, unit] of [[901, '2901', UNIT_A], [902, '2902', UNIT_A], [903, '2903', UNIT_A], [904, '2904', UNIT_A], [905, '2905', UNIT_B]]) insertAluno(container, id, unit, matricula);
    const currentOld = '00000000-0000-0000-0000-000000000901';
    const currentNew = '00000000-0000-0000-0000-000000000902';
    const previous = '00000000-0000-0000-0000-000000000903';
    const edge = '00000000-0000-0000-0000-000000000904';
    const outside = '00000000-0000-0000-0000-000000000905';
    seedRun(container, currentOld, month);
    seed(container, `update public.sync_runs set completed_at = now() - interval '2 hours' where id = '${currentOld}';`, 'snapshot antigo');
    seedRun(container, currentNew, month);
    seedRun(container, previous, `(${month} - interval '1 month')::date`);
    seedRun(container, edge, `(${month} - interval '2 months')::date`);
    seedRun(container, outside, `(${month} - interval '3 months')::date`, true);
    const paid = '90000000-0000-0000-0000-000000000901';
    insertInvoices(container, [
      invoice(paid, UNIT_A, currentOld, month, 2901),
      invoice(paid, UNIT_A, currentNew, month, 2901, { status: 'paga' }),
      invoice('90000000-0000-0000-0000-000000000902', UNIT_A, previous, `(${month} - interval '1 month')::date`, 2902, { value: 200 }),
      invoice('90000000-0000-0000-0000-000000000903', UNIT_A, edge, `(${month} - interval '2 months')::date`, 2903, { value: 300 }),
      invoice('90000000-0000-0000-0000-000000000904', UNIT_A, outside, `(${month} - interval '3 months')::date`, 2904, { value: 400 }),
      invoice('90000000-0000-0000-0000-000000000905', UNIT_B, currentNew, month, 2905, { value: 500 }),
    ], 'snapshot mais recente, janela e unidades');
    const authenticated = jsonFrom(callAs(container, 'authenticated', UNIT_A, asOfDate), 'autorizado na unidade A');
    assert.equal(authenticated.status, 'ok');
    assert.deepEqual(authenticated.items.map((item) => item.canonical_fatura_id).sort(), [
      '90000000-0000-0000-0000-000000000902',
      '90000000-0000-0000-0000-000000000903',
    ]);
    const anonymous = callAs(container, 'anon', UNIT_A, asOfDate);
    assertAuthorizationFailure(anonymous, 'anonimo nao pode executar a RPC');
    const denied = callAs(container, 'authenticated', UNIT_B, asOfDate, UNIT_A);
    assertAuthorizationFailure(denied, 'autenticado nao pode consultar outra unidade');
    const service = jsonFrom(callAllAs(container, 'service_role', asOfDate), 'service role consolidado');
    assert.equal(service.items.some((item) => item.unidade_id === UNIT_B), true);
  });
});
