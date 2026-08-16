import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPaths = [
  'supabase/migrations/20260816003732_inadimplencia_canonica_frescor.sql',
  'supabase/migrations/20260816004257_inadimplencia_canonica_dedupe_global.sql',
  'supabase/migrations/20260816013502_inadimplencia_canonica_quarentena_identidade.sql',
  'supabase/migrations/20260816013512_financeiro_faturas_relatorios_canonicos.sql',
].map((migration) => path.join(root, migration));
const UNIT_A = '11111111-1111-1111-1111-111111111111';
const UNIT_B = '22222222-2222-2222-2222-222222222222';
const AUTH_UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function docker(args, input, timeout = 120_000) {
  return spawnSync('docker', args, {
    input,
    encoding: 'utf8',
    timeout,
    maxBuffer: 10 * 1024 * 1024,
  });
}

function psql(container, sql) {
  return docker([
    'exec', '-i', container,
    'psql', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'postgres', '-At',
  ], sql);
}

async function waitForPostgres(container) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const ready = psql(container, 'select 1;');
    if (ready.status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('PostgreSQL de teste nao iniciou a tempo');
}

function assertPsql(result, label) {
  assert.equal(
    result.status,
    0,
    `${label}: ${result.stderr || result.stdout || result.error?.message || 'sem saida'}`,
  );
}

function jsonFrom(result, label) {
  assertPsql(result, label);
  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  assert.ok(lines.length > 0, `${label}: psql nao retornou JSON`);
  return JSON.parse(lines.at(-1));
}

function seed(container, sql, label) {
  assertPsql(psql(container, sql), label);
}

function currentDate(container) {
  const result = psql(container, "select (now() at time zone 'America/Sao_Paulo')::date::text;");
  assertPsql(result, 'data de referencia da fixture');
  return result.stdout.trim();
}

function callAs(container, role, unitId, asOfDate, authUnitId = UNIT_A) {
  return psql(container, `
    set role ${role};
    set app.test_role = '${role}';
    set app.test_uid = '${AUTH_UID}';
    set app.test_unidade_id = '${authUnitId}';
    select public.get_inadimplencia_canonica(
      '${unitId}'::uuid,
      date '${asOfDate}'
    )::text;
  `);
}

function callAllAs(container, role, asOfDate) {
  return psql(container, `
    set role ${role};
    set app.test_role = '${role}';
    set app.test_uid = '${AUTH_UID}';
    select public.get_inadimplencia_canonica(
      null,
      date '${asOfDate}'
    )::text;
  `);
}

function callFinanceAs(container, role, unitId, asOfDate) {
  const [year, month] = asOfDate.split('-').map(Number);
  return psql(container, `
    set role ${role};
    set app.test_role = '${role}';
    set app.test_uid = '${AUTH_UID}';
    set app.test_unidade_id = '${unitId}';
    select public.get_financeiro_faturas_emusys(
      '${unitId}'::uuid,
      ${year},
      ${month}
    )::text;
  `);
}

const fixtureSchema = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema auth;

  create table public.unidades (
    id uuid primary key,
    nome text not null,
    ativo boolean not null default true
  );

  create table public.tipos_matricula (
    id bigint primary key,
    conta_como_pagante boolean not null default false,
    entra_ticket_medio boolean not null default false
  );

  create table public.cursos (
    id bigint primary key,
    is_projeto_banda boolean not null default false
  );

  create table public.alunos (
    id bigint primary key,
    unidade_id uuid not null references public.unidades(id),
    emusys_matricula_id text,
    status text,
    arquivado_em timestamptz,
    tipo_matricula_id bigint references public.tipos_matricula(id),
    curso_id bigint references public.cursos(id),
    is_segundo_curso boolean,
    data_saida date
  );

  create table public.sync_runs (
    id uuid primary key,
    competencia date not null,
    run_type text not null,
    status text not null,
    snapshot_complete boolean not null,
    unidades_concluidas integer not null,
    completed_at timestamptz,
    stale_after timestamptz
  );

  create table public.sync_run_items (
    id bigint generated always as identity primary key,
    canonical_fatura_id uuid not null,
    unidade_id uuid not null references public.unidades(id),
    unidade_codigo text not null,
    competencia date not null,
    run_id uuid not null references public.sync_runs(id),
    emusys_fatura_id bigint,
    emusys_matricula_id bigint,
    emusys_contrato_id bigint,
    emusys_student_id bigint,
    descricao text,
    status text not null,
    data_vencimento date not null,
    data_pagamento date,
    valor_original numeric(12, 2) not null,
    valor_pago numeric(12, 2),
    desconto_aplicado numeric(12, 2) not null default 0,
    desconto_fixo numeric(12, 2) not null default 0,
    desconto_condicional numeric(12, 2),
    juros_e_multa numeric(12, 2),
    source_missing boolean not null default false,
    source_missing_reason text,
    source_missing_detected_at timestamptz,
    payload jsonb not null default '{}'::jsonb
  );

  create function auth.role()
  returns text
  language sql stable
  as $$
    select coalesce(nullif(current_setting('app.test_role', true), ''), current_user::text);
  $$;

  create function auth.uid()
  returns uuid
  language sql stable
  as $$
    select nullif(current_setting('app.test_uid', true), '')::uuid;
  $$;

  create function public.is_admin()
  returns boolean
  language sql stable
  as $$
    select coalesce(nullif(current_setting('app.test_admin', true), '')::boolean, false);
  $$;

  create function public.get_user_unidade_ids()
  returns setof uuid
  language sql stable
  as $$
    select u.id
    from public.unidades u
    where u.id = nullif(current_setting('app.test_unidade_id', true), '')::uuid;
  $$;

  insert into public.unidades (id, nome, ativo) values
    ('${UNIT_A}'::uuid, 'Campo Grande', true),
    ('${UNIT_B}'::uuid, 'Recreio', true);
`;

test('Checkpoint 2: leitura canonica respeita frescor, reconciliacao, juros e autorizacao', {
  timeout: 90_000,
}, async (t) => {
  for (const migrationPath of migrationPaths) {
    assert.equal(fs.existsSync(migrationPath), true, `migration do Checkpoint 2 nao existe: ${migrationPath}`);
  }

  const dockerInfo = docker(['info'], undefined, 5_000);
  const dockerVersion = docker(
    ['version', '--format', '{{.Server.Version}}'],
    undefined,
    5_000,
  );
  if (
    dockerInfo.status !== 0
    || dockerInfo.error
    || !/Server Version:/u.test(dockerInfo.stdout || '')
    || dockerVersion.status !== 0
    || dockerVersion.error
    || !dockerVersion.stdout?.trim()
  ) {
    t.skip('Docker indisponivel para fixture PostgreSQL descartavel do Checkpoint 2');
    return;
  }

  const container = `la-inadimplencia-canonica-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--rm', '--name', container,
    '-e', 'POSTGRES_PASSWORD=postgres',
    '-d', 'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);

    const migration = migrationPaths.map((migrationPath) => fs.readFileSync(migrationPath, 'utf8')).join('\n');
    const setup = psql(container, `${fixtureSchema}\n${migration}`);
    assertPsql(setup, 'fixture minima + migration do Checkpoint 2');
    const asOfDate = currentDate(container);
    const month = `date_trunc('month', date '${asOfDate}')::date`;
    const day = `date '${asOfDate}'`;

    seed(container, `
      delete from public.sync_run_items;
      delete from public.sync_runs;

      insert into public.sync_runs (
        id, competencia, run_type, status, snapshot_complete,
        unidades_concluidas, completed_at, stale_after
      ) values (
        '00000000-0000-0000-0000-000000000001',
        ${month},
        'live', 'succeeded', true, 3, now(), now() + interval '1 hour'
      );

      insert into public.sync_run_items (
        canonical_fatura_id, unidade_id, unidade_codigo, competencia, run_id,
        emusys_fatura_id, emusys_matricula_id, emusys_contrato_id,
        emusys_student_id, descricao, status, data_vencimento, data_pagamento,
        valor_original, desconto_condicional, juros_e_multa, source_missing
      ) values
        (
          '10000000-0000-0000-0000-000000000001', '${UNIT_A}', 'CG',
          ${month},
          '00000000-0000-0000-0000-000000000001',
          1001, 2001, 3001, 4001, 'Aberta vencida', 'aberta',
          ${day} - 5, null, 100, 0, 0, false
        ),
        (
          '10000000-0000-0000-0000-000000000002', '${UNIT_A}', 'CG',
          ${month},
          '00000000-0000-0000-0000-000000000001',
          1002, 2002, 3002, 4002, 'Aberta futura', 'aberta',
          ${day} + 5, null, 200, 0, 0, false
        ),
        (
          '10000000-0000-0000-0000-000000000003', '${UNIT_A}', 'CG',
          ${month},
          '00000000-0000-0000-0000-000000000001',
          1003, 2003, 3003, 4003, 'Paga vencida', 'paga',
          ${day} - 10, ${day} - 8, 300, 0, 0, false
        );
    `, 'cenario 1: snapshot fresco completo');

    const fresh = jsonFrom(
      callAs(container, 'authenticated', UNIT_A, asOfDate),
      'cenario 1: leitura autenticada',
    );
    assert.equal(fresh.status, 'ok');
    assert.deepEqual(
      fresh.items.map((item) => [item.canonical_fatura_id, item.status, item.source_missing]),
      [['10000000-0000-0000-0000-000000000001', 'aberta', false]],
    );
    assert.equal(fresh.items[0].data_vencimento <= fresh.as_of_date, true);

    seed(container, `
      delete from public.sync_run_items;
      delete from public.sync_runs;

      insert into public.sync_runs (
        id, competencia, run_type, status, snapshot_complete,
        unidades_concluidas, completed_at, stale_after
      ) values (
        '00000000-0000-0000-0000-000000000007',
        ${month},
        'live', 'succeeded', true, 3, now(), now() + interval '1 hour'
      );

      insert into public.sync_run_items (
        canonical_fatura_id, unidade_id, unidade_codigo, competencia, run_id,
        emusys_fatura_id, emusys_matricula_id, emusys_contrato_id,
        emusys_student_id, descricao, status, data_vencimento, valor_original,
        desconto_condicional, juros_e_multa, source_missing, payload
      ) values
        (
          '70000000-0000-0000-0000-000000000001', '${UNIT_A}', 'CG',
          ${month}, '00000000-0000-0000-0000-000000000007',
          1701, null, 3701, 4701, 'Matricula invalida na origem', 'aberta',
          ${day} - 2, 100, 0, 0, false,
          jsonb_build_object(
            '_la_report', jsonb_build_object(
              'validation_issues', jsonb_build_array(jsonb_build_object(
                'field', 'matricula_id',
                'code', 'invalid_optional_identifier',
                'raw_value', 'matricula-invalida'
              ))
            )
          )
        ),
        (
          '70000000-0000-0000-0000-000000000002', '${UNIT_A}', 'CG',
          ${month}, '00000000-0000-0000-0000-000000000007',
          1702, 2702, 3702, 4702, 'Fatura valida no mesmo snapshot', 'aberta',
          ${day} - 2, 200, 0, 0, false, '{}'::jsonb
        );
    `, 'cenario 1c: identificador opcional invalido auditado');

    const invalidIdentity = jsonFrom(
      callAs(container, 'authenticated', UNIT_A, asOfDate),
      'cenario 1c: leitura bloqueada por identidade invalida',
    );
    assert.equal(invalidIdentity.status, 'incomplete');
    assert.equal(invalidIdentity.reconciliation.status, 'pending');
    assert.equal(invalidIdentity.reconciliation.validation_issue_count, 1);
    assert.equal(invalidIdentity.reconciliation.invalid_identity_invoice_count, 1);
    assert.equal(invalidIdentity.reconciliation.invalid_identity_invoices.length, 1);
    assert.equal(
      invalidIdentity.reconciliation.invalid_identity_invoices[0].validation_issues[0].field,
      'matricula_id',
    );
    assert.deepEqual(invalidIdentity.items, []);
    assert.equal(invalidIdentity.totals.total_faturas, 0);

    seed(container, `
      delete from public.sync_run_items;
      delete from public.sync_runs;

      insert into public.sync_runs (
        id, competencia, run_type, status, snapshot_complete,
        unidades_concluidas, completed_at, stale_after
      ) values
        (
          '00000000-0000-0000-0000-000000000011', ${month},
          'live', 'succeeded', true, 3,
          now() - interval '2 hours', now() - interval '90 minutes'
        ),
        (
          '00000000-0000-0000-0000-000000000012', ${month},
          'live', 'succeeded', true, 3,
          now(), now() + interval '1 hour'
        );

      insert into public.sync_run_items (
        canonical_fatura_id, unidade_id, unidade_codigo, competencia, run_id,
        emusys_fatura_id, emusys_matricula_id, emusys_contrato_id,
        emusys_student_id, descricao, status, data_vencimento, data_pagamento,
        valor_original, desconto_condicional, juros_e_multa, source_missing
      ) values
        (
          '10000000-0000-0000-0000-000000000011', '${UNIT_A}', 'CG',
          ${month}, '00000000-0000-0000-0000-000000000011',
          1011, 2011, 3011, 4011, 'Aberta no snapshot antigo', 'aberta',
          ${day} - 10, null, 100, 0, 0, false
        ),
        (
          '10000000-0000-0000-0000-000000000011', '${UNIT_A}', 'CG',
          ${month}, '00000000-0000-0000-0000-000000000012',
          1011, 2011, 3011, 4011, 'Paga no snapshot mais novo', 'paga',
          ${day} - 10, ${day} - 1, 100, 0, 0, false
        );
    `, 'cenario 1b: snapshot novo quitou a fatura antiga');

    const paidInLatest = jsonFrom(
      callAs(container, 'authenticated', UNIT_A, asOfDate),
      'cenario 1b: competencia quitada sai da janela necessaria',
    );
    assert.equal(paidInLatest.status, 'ok');
    assert.equal(paidInLatest.freshness.competencias_necessarias, 0);
    assert.deepEqual(paidInLatest.items, []);

    seed(container, `
      delete from public.sync_run_items;
      delete from public.sync_runs;

      insert into public.sync_runs (
        id, competencia, run_type, status, snapshot_complete,
        unidades_concluidas, completed_at, stale_after
      ) values (
        '00000000-0000-0000-0000-000000000002',
        ${month},
        'live', 'succeeded', true, 3, now(), now() + interval '1 hour'
      );

      insert into public.sync_run_items (
        canonical_fatura_id, unidade_id, unidade_codigo, competencia, run_id,
        emusys_fatura_id, emusys_matricula_id, emusys_contrato_id,
        emusys_student_id, descricao, status, data_vencimento, valor_original,
        juros_e_multa, source_missing, source_missing_reason,
        source_missing_detected_at
      ) values
        (
          '20000000-0000-0000-0000-000000000001', '${UNIT_A}', 'CG',
          ${month},
          '00000000-0000-0000-0000-000000000002',
          1101, 2101, 3101, 4101, 'Fonte ausente', 'aberta',
          ${day} - 3, 100, 0, true, 'nao retornada pela origem', now()
        ),
        (
          '20000000-0000-0000-0000-000000000002', '${UNIT_A}', 'CG',
          ${month},
          '00000000-0000-0000-0000-000000000002',
          1102, 2102, 3102, 4102, 'Nao transformar em paga', 'paga',
          ${day} - 3, 100, 0, false, null, null
        );
    `, 'cenario 2: source_missing');

    const incomplete = jsonFrom(
      callAs(container, 'authenticated', UNIT_A, asOfDate),
      'cenario 2: leitura com source_missing',
    );
    assert.equal(incomplete.status, 'incomplete');
    assert.equal(incomplete.reconciliation.status, 'pending');
    assert.equal(incomplete.reconciliation.source_missing_count, 1);
    assert.deepEqual(incomplete.items, []);
    assert.equal(
      incomplete.reconciliation.unknown_invoices[0].canonical_fatura_id,
      '20000000-0000-0000-0000-000000000001',
    );
    assert.equal(
      incomplete.items.some((item) => item.status === 'paga'),
      false,
    );

    seed(container, `
      delete from public.sync_run_items;
      delete from public.sync_runs;

      insert into public.sync_runs (
        id, competencia, run_type, status, snapshot_complete,
        unidades_concluidas, completed_at, stale_after
      ) values (
        '00000000-0000-0000-0000-000000000003',
        ${month},
        'live', 'succeeded', true, 3,
        now() - interval '2 hours', now() - interval '90 minutes'
      );

      insert into public.sync_run_items (
        canonical_fatura_id, unidade_id, unidade_codigo, competencia, run_id,
        emusys_fatura_id, emusys_matricula_id, emusys_contrato_id,
        emusys_student_id, descricao, status, data_vencimento, valor_original,
        juros_e_multa, source_missing
      ) values (
        '30000000-0000-0000-0000-000000000001', '${UNIT_A}', 'CG',
        ${month},
        '00000000-0000-0000-0000-000000000003',
        1201, 2201, 3201, 4201, 'Snapshot velho', 'aberta',
        ${day} - 3, 100, 0, false
      ), (
        '30000000-0000-0000-0000-000000000002', '${UNIT_A}', 'CG',
        ${month},
        '00000000-0000-0000-0000-000000000003',
        1202, 2202, 3202, 4202, 'Ausente em snapshot velho', 'aberta',
        ${day} - 3, 100, 0, true
      );
    `, 'cenario 3: snapshot antigo');

    const stale = jsonFrom(
      callAs(container, 'authenticated', UNIT_A, asOfDate),
      'cenario 3: leitura stale',
    );
    assert.equal(stale.status, 'stale');
    assert.equal(stale.freshness.competencias_stale, 1);
    assert.equal(stale.reconciliation.source_missing_count, 1);
    assert.deepEqual(stale.items, []);
    assert.equal(stale.totals.total_faturas, 0);

    seed(container, `
      delete from public.sync_run_items;
      delete from public.sync_runs;

      insert into public.sync_runs (
        id, competencia, run_type, status, snapshot_complete,
        unidades_concluidas, completed_at, stale_after
      ) values (
        '00000000-0000-0000-0000-000000000004',
        ${month},
        'live', 'succeeded', true, 3, now(), now() + interval '1 hour'
      );

      insert into public.sync_run_items (
        canonical_fatura_id, unidade_id, unidade_codigo, competencia, run_id,
        emusys_fatura_id, emusys_matricula_id, emusys_contrato_id,
        emusys_student_id, descricao, status, data_vencimento, valor_original,
        desconto_condicional, juros_e_multa, source_missing
      ) values (
        '40000000-0000-0000-0000-000000000001', '${UNIT_A}', 'CG',
        ${month},
        '00000000-0000-0000-0000-000000000004',
        1301, 2301, 3301, 4301, 'Formula pro rata', 'aberta',
        ${day} - 30, 100, 0, 0, false
      ), (
        '40000000-0000-0000-0000-000000000001', '${UNIT_A}', 'CG',
        ${month},
        '00000000-0000-0000-0000-000000000004',
        1302, 2302, 3302, 4302, 'Duplicata da mesma fatura', 'aberta',
        ${day} - 30, 100, 0, 0, false
      );
    `, 'cenario 4: formula de juros');

    const interest = jsonFrom(
      callAs(container, 'authenticated', UNIT_A, asOfDate),
      'cenario 4: leitura com formula de juros',
    );
    assert.equal(interest.status, 'incomplete');
    assert.equal(interest.reconciliation.duplicate_fatura_count, 1);
    assert.equal(interest.items.length, 1);
    assert.equal(interest.items[0].dias_atraso, 30);
    assert.equal(interest.items[0].multa_pct, 0.02);
    assert.equal(interest.items[0].mora_pct_mes, 0.01);
    assert.equal(interest.items[0].valor_atualizado, 103);
    assert.equal(interest.totals.total_atualizado, 103);

    seed(container, `
      delete from public.sync_run_items;
      delete from public.sync_runs;

      insert into public.sync_runs (
        id, competencia, run_type, status, snapshot_complete,
        unidades_concluidas, completed_at, stale_after
      ) values (
        '00000000-0000-0000-0000-000000000006',
        ${month},
        'live', 'succeeded', true, 3, now(), now() + interval '1 hour'
      );

      insert into public.sync_run_items (
        canonical_fatura_id, unidade_id, unidade_codigo, competencia, run_id,
        emusys_fatura_id, emusys_matricula_id, emusys_contrato_id,
        emusys_student_id, descricao, status, data_vencimento, valor_original,
        desconto_condicional, juros_e_multa, source_missing
      ) values (
        '60000000-0000-0000-0000-000000000001', '${UNIT_A}', 'CG',
        ${month},
        '00000000-0000-0000-0000-000000000006',
        1601, 2601, 3601, 4601, 'Duplicata global A', 'aberta',
        ${day} - 2, 100, 0, 0, false
      ), (
        '60000000-0000-0000-0000-000000000001', '${UNIT_B}', 'REC',
        ${month},
        '00000000-0000-0000-0000-000000000006',
        1602, 2602, 3602, 4602, 'Duplicata global B', 'aberta',
        ${day} - 2, 100, 0, 0, false
      );
    `, 'cenario 5: duplicata global entre unidades');

    const crossUnitDuplicate = jsonFrom(
      callAllAs(container, 'service_role', asOfDate),
      'cenario 5: dedupe global entre unidades',
    );
    assert.equal(crossUnitDuplicate.status, 'incomplete');
    assert.equal(crossUnitDuplicate.reconciliation.duplicate_fatura_count, 1);
    assert.equal(crossUnitDuplicate.items.length, 1);
    assert.deepEqual(
      crossUnitDuplicate.reconciliation.duplicate_invoices[0].unidade_ids.sort(),
      [UNIT_A, UNIT_B].sort(),
    );

    seed(container, `
      update public.sync_run_items
      set source_missing = true,
          source_missing_reason = 'conflito confirmado e ausente',
          source_missing_detected_at = now()
      where canonical_fatura_id = '60000000-0000-0000-0000-000000000001'
        and unidade_id = '${UNIT_B}';
    `, 'cenario 6: conflito confirmado e source_missing');

    const confirmedAndMissing = jsonFrom(
      callAllAs(container, 'service_role', asOfDate),
      'cenario 6: conflito confirmado e source_missing',
    );
    assert.equal(confirmedAndMissing.status, 'incomplete');
    assert.equal(confirmedAndMissing.reconciliation.duplicate_fatura_count, 1);
    assert.equal(confirmedAndMissing.reconciliation.source_missing_count, 1);
    assert.equal(confirmedAndMissing.reconciliation.unknown_invoices.length, 1);
    assert.deepEqual(confirmedAndMissing.items, []);

    seed(container, `
      delete from public.sync_run_items;
      delete from public.sync_runs;

      insert into public.sync_runs (
        id, competencia, run_type, status, snapshot_complete,
        unidades_concluidas, completed_at, stale_after
      ) values (
        '00000000-0000-0000-0000-000000000005',
        ${month},
        'live', 'succeeded', true, 3, now(), now() + interval '1 hour'
      );

      insert into public.sync_run_items (
        canonical_fatura_id, unidade_id, unidade_codigo, competencia, run_id,
        emusys_fatura_id, emusys_matricula_id, emusys_contrato_id,
        emusys_student_id, descricao, status, data_vencimento, valor_original,
        desconto_condicional, juros_e_multa, source_missing
      ) values (
        '50000000-0000-0000-0000-000000000001', '${UNIT_B}', 'REC',
        ${month},
        '00000000-0000-0000-0000-000000000005',
        1401, 2401, 3401, 4401, 'Unidade externa', 'aberta',
          ${day} - 1, 50, 0, 0, false
      );
    `, 'cenario 5: autorizacao e service_role');

    const unauthorized = callAs(container, 'authenticated', UNIT_B, asOfDate, UNIT_A);
    assert.notEqual(unauthorized.status, 0, 'usuario fora da unidade deveria falhar');
    assert.match(unauthorized.stderr, /42501|autorizad/i);

    const service = jsonFrom(
      callAs(container, 'service_role', UNIT_B, asOfDate),
      'cenario 5: leitura service_role',
    );
    assert.equal(service.status, 'ok');
    assert.equal(service.items.length, 1);
    assert.equal(service.items[0].unidade_id, UNIT_B);

    seed(container, `
      delete from public.sync_run_items;
      delete from public.sync_runs;
      delete from public.alunos;
      delete from public.tipos_matricula;
      delete from public.cursos;

      insert into public.tipos_matricula (id, conta_como_pagante, entra_ticket_medio)
      values (1, true, true);
      insert into public.cursos (id, is_projeto_banda) values (1, false);
      insert into public.alunos (
        id, unidade_id, emusys_matricula_id, status, arquivado_em,
        tipo_matricula_id, curso_id, is_segundo_curso
      ) values (
        1, '${UNIT_A}', '2901', 'ativo', null, 1, 1, false
      );

      insert into public.sync_runs (
        id, competencia, run_type, status, snapshot_complete,
        unidades_concluidas, completed_at, stale_after
      ) values (
        '00000000-0000-0000-0000-000000000009', ${month},
        'live', 'succeeded', true, 3, now(), now() + interval '1 hour'
      );

      insert into public.sync_run_items (
        canonical_fatura_id, unidade_id, unidade_codigo, competencia, run_id,
        emusys_fatura_id, emusys_matricula_id, emusys_student_id,
        descricao, status, data_vencimento, data_pagamento,
        valor_original, valor_pago, juros_e_multa, desconto_aplicado,
        desconto_fixo, desconto_condicional, source_missing, payload
      ) values
        (
          '90000000-0000-0000-0000-000000000001', '${UNIT_A}', 'CG', ${month},
          '00000000-0000-0000-0000-000000000009',
          1901, 2901, 4901, 'Parcela 1', 'paga', ${day} - 10, ${day} - 9,
          100, 100, 0, 0, 0, 0, false, '{}'::jsonb
        ),
        (
          '90000000-0000-0000-0000-000000000002', '${UNIT_A}', 'CG', ${month},
          '00000000-0000-0000-0000-000000000009',
          1902, 2901, 4901, 'Parcela 2', 'aberta', ${day} - 5, null,
          200, null, 0, 0, 0, 0, false, '{}'::jsonb
        ),
        (
          '90000000-0000-0000-0000-000000000003', '${UNIT_A}', 'CG', ${month},
          '00000000-0000-0000-0000-000000000009',
          1903, 2901, 4901, 'Parcela 3', 'cancelada', ${day} - 5, null,
          300, null, 0, 0, 0, 0, false, '{}'::jsonb
        );
    `, 'cenario 7: relatorio financeiro por snapshot imutavel fresco');

    const finance = jsonFrom(
      callFinanceAs(container, 'authenticated', UNIT_A, asOfDate),
      'cenario 7: relatorio financeiro fresco',
    );
    assert.equal(finance.status, 'ok');
    assert.equal(finance.fonte, 'sync_run_items');
    assert.equal(finance.freshness.is_fresh, true);
    assert.equal(finance.tem_dados, true);
    assert.equal(finance.totais.faturas_parcela, 3);
    assert.equal(finance.totais.faturas_parcela_pagas, 1);
    assert.equal(finance.totais.faturas_parcela_abertas, 1);
    assert.equal(finance.totais.mrr_atual, 100);
    assert.equal(finance.totais.faturamento_previsto, 300);
    assert.equal(finance.totais.valor_aberto_parcelas, 200);
    assert.equal(finance.inadimplencia_canonica.status, 'ok');

    seed(container, `
      update public.sync_runs
      set stale_after = now() - interval '1 minute'
      where id = '00000000-0000-0000-0000-000000000009';
    `, 'cenario 8: relatorio stale');
    const staleFinance = jsonFrom(
      callFinanceAs(container, 'authenticated', UNIT_A, asOfDate),
      'cenario 8: relatorio bloqueado por frescor',
    );
    assert.equal(staleFinance.status, 'stale');
    assert.equal(staleFinance.tem_dados, false);
    assert.deepEqual(staleFinance.por_unidade, []);

    seed(container, `
      update public.sync_runs
      set stale_after = now() + interval '1 hour'
      where id = '00000000-0000-0000-0000-000000000009';
      update public.sync_run_items
      set source_missing = true,
          source_missing_reason = 'nao confirmada na origem'
      where canonical_fatura_id = '90000000-0000-0000-0000-000000000002';
    `, 'cenario 9: relatorio com source_missing');
    const incompleteFinance = jsonFrom(
      callFinanceAs(container, 'authenticated', UNIT_A, asOfDate),
      'cenario 9: source_missing nao vira pagamento',
    );
    assert.equal(incompleteFinance.status, 'incomplete');
    assert.equal(incompleteFinance.tem_dados, false);
    assert.equal(incompleteFinance.integrity.source_missing_count, 1);
    assert.deepEqual(incompleteFinance.por_unidade, []);
  } finally {
    docker(['rm', '--force', container]);
  }
});
