import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const migrationsDir = path.join(root, 'supabase', 'migrations');

function migrationSource() {
  const migrationName = fs.readdirSync(migrationsDir)
    .filter((name) => /_financeiro_faturas_alunos_v2\.sql$/u.test(name))
    .sort()
    .at(-1);
  assert.ok(migrationName, 'migration de faturas financeiras v2 ausente');
  return fs.readFileSync(path.join(migrationsDir, migrationName), 'utf8');
}

function canceladasValorPatchSource() {
  const migrationName = fs.readdirSync(migrationsDir)
    .filter((name) => /_financeiro_faturas_canceladas_valor_explicito\.sql$/u.test(name))
    .sort()
    .at(-1);
  assert.ok(migrationName, 'migration do valor explicito de canceladas ausente');
  return fs.readFileSync(path.join(migrationsDir, migrationName), 'utf8');
}

function reconciliacaoTotaisPatchSource() {
  const migrationName = fs.readdirSync(migrationsDir)
    .filter((name) => /_financeiro_faturas_reconciliacao_totais_v1\.sql$/u.test(name))
    .sort()
    .at(-1);
  assert.ok(migrationName, 'migration de reconciliacao financeira ausente');
  return fs.readFileSync(path.join(migrationsDir, migrationName), 'utf8');
}

function carteiraAtivaMigrationSource() {
  const migrationName = fs.readdirSync(migrationsDir)
    .filter((name) => /_inadimplencia_canonica_carteira_ativa_d2_v1\.sql$/u.test(name))
    .sort()
    .at(-1);
  assert.ok(migrationName, 'migration da carteira ativa D+2 ausente');
  return fs.readFileSync(path.join(migrationsDir, migrationName), 'utf8');
}

function carteiraAtivaV4MigrationSource() {
  const migrationName = fs.readdirSync(migrationsDir)
    .filter((name) => /_inadimplencia_canonica_v4_carteira_ativa_d2\.sql$/u.test(name))
    .sort()
    .at(-1);
  assert.ok(migrationName, 'migration do contrato canonico v4 ausente');
  return fs.readFileSync(path.join(migrationsDir, migrationName), 'utf8');
}

function helperSql(source) {
  const match = source.match(
    /create\s+or\s+replace\s+function\s+public\.calcular_valores_fatura_financeiro_v1[\s\S]*?\$function\$\s*;/i,
  );
  assert.ok(match, 'funcao calcular_valores_fatura_financeiro_v1 ausente da migration');
  return match[0];
}

function bootstrapSql() {
  return `
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create function auth.role() returns text
    language sql stable as $$ select 'service_role'::text $$;

    create table public.unidades (
      id uuid primary key,
      ativo boolean not null default true
    );
    create table public.cursos (
      id integer primary key,
      nome text
    );
    create table public.formas_pagamento (
      id integer primary key,
      nome text
    );
    create table public.alunos (
      id integer primary key,
      unidade_id uuid not null,
      nome text not null,
      emusys_matricula_id text,
      emusys_student_id text,
      curso_id integer,
      forma_pagamento_id integer,
      arquivado_em timestamptz,
      data_saida date,
      status text
    );
    -- Fixture mínimo da fonte canônica consumida pela RPC de reconciliação.
    -- Em produção esta é a view derivada de emusys_matriculas_estado_atual;
    -- aqui ela projeta os mesmos campos a partir do cadastro controlado do teste.
    create view public.vw_aluno_estado_operacional_canonico as
    select
      a.unidade_id,
      a.emusys_matricula_id,
      a.emusys_student_id as emusys_aluno_id,
      a.id as aluno_id,
      a.nome as aluno_nome,
      case
        when a.status = 'trancado' then 'trancada'
        when a.status = 'evadido' then 'inativa'
        when a.status = 'ativo' then 'ativa'
        else a.status
      end as status_emusys
    from public.alunos a;
    create table public.vw_alunos_estado_operacional_v131 (
      aluno_id integer primary key,
      unidade_id uuid not null,
      entra_financeiro_ativo boolean not null default false,
      eh_trancamento_atual boolean not null default false,
      status_operacional text
    );
    create table public.sync_runs (
      id uuid primary key,
      competencia date not null,
      run_type text not null,
      status text not null,
      completed_at timestamptz,
      stale_after timestamptz,
      snapshot_complete boolean not null default false,
      unidades_concluidas integer not null
    );
    create table public.sync_run_items (
      id uuid primary key,
      run_id uuid not null,
      canonical_fatura_id uuid not null,
      competencia date not null,
      unidade_id uuid not null,
      unidade_codigo text not null,
      emusys_fatura_id bigint not null,
      emusys_matricula_id bigint,
      emusys_contrato_id bigint,
      emusys_student_id bigint,
      descricao text not null default '',
      status text not null,
      data_vencimento date not null,
      data_pagamento date,
      valor_original numeric not null,
      valor_pago numeric,
      juros_e_multa numeric not null default 0,
      desconto_aplicado numeric not null default 0,
      desconto_fixo numeric not null default 0,
      desconto_condicional numeric not null default 0,
      payload jsonb not null default '{}'::jsonb,
      source_missing boolean not null default false,
      source_missing_reason text
    );
    create function public.is_admin() returns boolean
    language sql stable as $$ select true $$;
    create function public.get_user_unidade_ids() returns table(id uuid)
    language sql stable as $$ select id from public.unidades $$;
    create function public.get_inadimplencia_canonica(
      p_unidade_id uuid default null,
      p_as_of_date date default current_date
    ) returns jsonb
    language sql stable security definer set search_path = public, pg_temp as $$
      select jsonb_build_object(
        'schema_version', 3,
        'status', 'ok',
        'operational', jsonb_build_object(
          'collection_allowed', true,
          'collection_scope', 'confirmed_only'
        ),
        'items', jsonb_build_array(
          jsonb_build_object(
            'canonical_fatura_id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            'unidade_id', '11111111-1111-1111-1111-111111111111',
            'emusys_fatura_id', '1001',
            'emusys_matricula_id', '1435',
            'run_id', '22222222-2222-2222-2222-222222222222',
            'competencia', '2026-08-01',
            'status', 'aberta',
            'data_vencimento', '2026-08-10',
            'valor_original', 500,
            'desconto_condicional_perdido', 30,
            'dias_atraso', 6,
            'aluno_id_canonico', 10
          ),
          jsonb_build_object(
            'canonical_fatura_id', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            'unidade_id', '11111111-1111-1111-1111-111111111111',
            'emusys_fatura_id', '1006',
            'emusys_matricula_id', '1436',
            'competencia', '2026-08-01',
            'status', 'aberta',
            'data_vencimento', '2026-08-10',
            'valor_original', 500,
            'desconto_condicional_perdido', 0,
            'dias_atraso', 6,
            'aluno_id_canonico', 11
          ),
          jsonb_build_object(
            'canonical_fatura_id', 'cccccccc-cccc-cccc-cccc-cccccccccccc',
            'unidade_id', '11111111-1111-1111-1111-111111111111',
            'emusys_fatura_id', '1007',
            'emusys_matricula_id', '1437',
            'competencia', '2026-08-01',
            'status', 'aberta',
            'data_vencimento', '2026-08-10',
            'valor_original', 500,
            'desconto_condicional_perdido', 0,
            'dias_atraso', 6,
            'aluno_id_canonico', 12
          ),
          jsonb_build_object(
            'canonical_fatura_id', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
            'unidade_id', '11111111-1111-1111-1111-111111111111',
            'emusys_fatura_id', '1008',
            'emusys_matricula_id', '1438',
            'competencia', '2026-08-01',
            'status', 'aberta',
            'data_vencimento', '2026-08-15',
            'valor_original', 500,
            'desconto_condicional_perdido', 0,
            'dias_atraso', 1,
            'aluno_id_canonico', 13
          ),
          jsonb_build_object(
            'canonical_fatura_id', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
            'unidade_id', '11111111-1111-1111-1111-111111111111',
            'emusys_fatura_id', '1009',
            'emusys_matricula_id', '1439',
            'competencia', '2026-05-01',
            'status', 'aberta',
            'data_vencimento', '2026-05-10',
            'valor_original', 500,
            'desconto_condicional_perdido', 0,
            'dias_atraso', 98,
            'aluno_id_canonico', 14
          )
        ),
        'totals', jsonb_build_object('total_atualizado', 0)
      )
    $$;

    insert into public.unidades (id, ativo)
    values ('11111111-1111-1111-1111-111111111111', true);
    insert into public.cursos (id, nome) values (1, 'Bateria');
    insert into public.formas_pagamento (id, nome) values (1, 'Credito recorrente');
    insert into public.alunos (
      id, unidade_id, nome, emusys_matricula_id, emusys_student_id,
      curso_id, forma_pagamento_id, status
    ) values (
      10, '11111111-1111-1111-1111-111111111111', 'Ana Financeira', '1435', '501',
      1, 1, 'ativo'
    );
    insert into public.alunos (
      id, unidade_id, nome, emusys_matricula_id, emusys_student_id,
      curso_id, forma_pagamento_id, status
    ) values
      (11, '11111111-1111-1111-1111-111111111111', 'Beatriz Trancada', '1436', '502', 1, 1, 'trancado'),
      (12, '11111111-1111-1111-1111-111111111111', 'Caio Evasao', '1437', '503', 1, 1, 'evadido'),
      (13, '11111111-1111-1111-1111-111111111111', 'Dora D0', '1438', '504', 1, 1, 'ativo'),
      (14, '11111111-1111-1111-1111-111111111111', 'Enzo Historico', '1439', '505', 1, 1, 'ativo');
    insert into public.vw_alunos_estado_operacional_v131 (
      aluno_id, unidade_id, entra_financeiro_ativo, eh_trancamento_atual, status_operacional
    ) values
      (10, '11111111-1111-1111-1111-111111111111', true, false, 'ativo'),
      (11, '11111111-1111-1111-1111-111111111111', false, true, 'trancado'),
      (12, '11111111-1111-1111-1111-111111111111', false, false, 'evadido'),
      (13, '11111111-1111-1111-1111-111111111111', true, false, 'ativo'),
      (14, '11111111-1111-1111-1111-111111111111', true, false, 'ativo');
    insert into public.sync_runs (
      id, competencia, run_type, status, completed_at, stale_after, snapshot_complete, unidades_concluidas
    ) values (
      '22222222-2222-2222-2222-222222222222', date '2026-08-01', 'live', 'succeeded',
      now(), now() + interval '1 day', true, 3
    );
    insert into public.sync_run_items (
      id, run_id, canonical_fatura_id, competencia, unidade_id, unidade_codigo,
      emusys_fatura_id, emusys_matricula_id, emusys_contrato_id, emusys_student_id,
      descricao, status, data_vencimento, data_pagamento, valor_original, valor_pago,
      juros_e_multa, desconto_fixo, desconto_condicional, payload, source_missing, source_missing_reason
    ) values
      (
        '30000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', date '2026-08-01',
        '11111111-1111-1111-1111-111111111111', 'REC',
        1001, 1435, 9001, 501, 'Parcela 08/2026 Bateria', 'aberta', date '2026-08-10', null,
        500, null, 0, 50, 30, '{}'::jsonb, false, null
      ),
      (
        '30000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', date '2026-08-01',
        '11111111-1111-1111-1111-111111111111', 'REC',
        1002, 1435, 9001, 501, 'Parcela paga', 'paga', date '2026-08-05', date '2026-08-11',
        480, 480, 0, 0, 0, '{"forma_pagamento_transacao":"PIX automatico"}'::jsonb, false, null
      ),
      (
        '30000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222',
        'cccccccc-cccc-cccc-cccc-cccccccccccc', date '2026-08-01',
        '11111111-1111-1111-1111-111111111111', 'REC',
        1003, 1435, 9001, 501, 'Parcela futura', 'aberta', date '2026-08-20', null,
        395, null, 0, 5, 0, '{}'::jsonb, false, null
      ),
      (
        '30000000-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222',
        'dddddddd-dddd-dddd-dddd-dddddddddddd', date '2026-08-01',
        '11111111-1111-1111-1111-111111111111', 'REC',
        1004, 1435, 9001, 501, 'Parcela ausente da origem', 'aberta', date '2026-08-08', null,
        447, null, 0, 0, 0, '{}'::jsonb, true, 'nao_encontrada_no_run'
      ),
      (
        '30000000-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222',
        'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', date '2026-08-01',
        '11111111-1111-1111-1111-111111111111', 'REC',
        1005, 9999, 9002, 999, 'Sem identidade local', 'aberta', date '2026-08-09', null,
        410, null, 0, 0, 0, '{}'::jsonb, false, null
      );
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

  const name = `la-faturas-v2-${process.pid}-${Date.now()}`.toLowerCase();
  const started = docker(['run', '--rm', '--name', name, '-e', 'POSTGRES_PASSWORD=postgres', '-d', 'postgres:17-alpine']);
  assert.equal(started.status, 0, started.stderr || started.stdout);
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const logs = docker(['logs', name]);
      const initialized = /ready for start up/u.test(`${logs.stdout}\n${logs.stderr}`);
      if (initialized && psql(name, 'select 1;').status === 0) {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!ready) {
      const finalProbe = psql(name, 'select 1;');
      const logs = docker(['logs', name]);
      assert.fail([
        'PostgreSQL de teste nao iniciou',
        finalProbe.stderr,
        logs.stdout,
        logs.stderr,
      ].filter(Boolean).join('\n'));
    }
    await callback(name);
  } finally {
    docker(['rm', '-f', name]);
  }
}

test('formula financeira preserva desconto fixo e perde somente o condicional no atraso', { timeout: 90_000 }, async (t) => {
  const source = migrationSource();
  await withPostgres(t, async (container) => {
    const applied = psql(container, helperSql(source));
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);

    const result = psql(container, `
      select public.calcular_valores_fatura_financeiro_v1(
        500, 50, 30, date '2026-07-17', 'aberta', date '2026-08-16'
      )::text;
    `);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const valores = JSON.parse(result.stdout.trim());
    assert.deepEqual(valores, {
      dias_atraso: 30,
      mora: 4.5,
      multa: 9,
      valor_com_desconto: 420,
      valor_hoje: 463.5,
      valor_sem_desconto_condicional: 450,
    });

    const paga = psql(container, `
      select public.calcular_valores_fatura_financeiro_v1(
        500, 50, 30, date '2026-07-17', 'paga', date '2026-08-16'
      )::text;
    `);
    assert.equal(paga.status, 0, paga.stderr || paga.stdout);
    assert.equal(JSON.parse(paga.stdout.trim()).valor_hoje, null);

    const aVencer = psql(container, `
      select public.calcular_valores_fatura_financeiro_v1(
        500, 50, 30, date '2026-08-20', 'aberta', date '2026-08-16'
      )::text;
    `);
    assert.equal(aVencer.status, 0, aVencer.stderr || aVencer.stdout);
    assert.equal(JSON.parse(aVencer.stdout.trim()).valor_hoje, 420);
  });
});

test('leitura global separa historico financeiro, D+2 e reconciliacao sem totalizar source_missing', { timeout: 90_000 }, async (t) => {
  const source = migrationSource();
  const canceladasPatch = canceladasValorPatchSource();
  const carteiraAtivaSource = carteiraAtivaMigrationSource();
  const carteiraAtivaV4Source = carteiraAtivaV4MigrationSource();
  await withPostgres(t, async (container) => {
    const bootstrapped = psql(container, bootstrapSql());
    assert.equal(bootstrapped.status, 0, bootstrapped.stderr || bootstrapped.stdout);

    const applied = psql(container, source);
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);
    const reconciliacaoTotaisPatch = psql(container, reconciliacaoTotaisPatchSource());
    assert.equal(reconciliacaoTotaisPatch.status, 0, reconciliacaoTotaisPatch.stderr || reconciliacaoTotaisPatch.stdout);
    const carteiraAtivaAplicada = psql(container, carteiraAtivaSource);
    assert.equal(carteiraAtivaAplicada.status, 0, carteiraAtivaAplicada.stderr || carteiraAtivaAplicada.stdout);
    const carteiraAtivaV4Aplicada = psql(container, carteiraAtivaV4Source);
    assert.equal(carteiraAtivaV4Aplicada.status, 0, carteiraAtivaV4Aplicada.stderr || carteiraAtivaV4Aplicada.stdout);
    const canceladasPatchAplicado = psql(container, canceladasPatch);
    assert.equal(canceladasPatchAplicado.status, 0, canceladasPatchAplicado.stderr || canceladasPatchAplicado.stdout);

    const carteiraCanonica = psql(container, `
      select public.get_inadimplencia_canonica(
        '11111111-1111-1111-1111-111111111111',
        date '2026-08-16'
      )::text;
    `);
    assert.equal(carteiraCanonica.status, 0, carteiraCanonica.stderr || carteiraCanonica.stdout);
    const canonica = JSON.parse(carteiraCanonica.stdout.trim());
    assert.equal(canonica.schema_version, 4);
    assert.deepEqual(canonica.items.map((item) => item.emusys_fatura_id), ['1001']);
    assert.equal(canonica.operational.collection_scope, 'confirmed_active_d2_3_competencias');
    assert.equal(canonica.operational.consumer_must_apply_collection_grace, false);
    assert.deepEqual(canonica.totals, {
      total_faturas: 1,
      total_matriculas: 1,
      total_original: 500,
      total_atualizado: 459.9,
      maior_atraso: 6,
    });
    assert.equal(canonica.items[0].valor_com_desconto, 420);
    assert.equal(canonica.items[0].valor_sem_desconto_condicional, 450);
    assert.equal(canonica.items[0].valor_atualizado, 459.9);

    const result = psql(container, `
      select public.get_faturas_alunos_financeiro_v1(
        '11111111-1111-1111-1111-111111111111',
        2026,
        8,
        'competencia',
        'todas',
        date '2026-08-16'
      )::text;
    `);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const leitura = JSON.parse(result.stdout.trim());

    assert.equal(leitura.fonte, 'sync_run_items');
    assert.equal(leitura.status, 'partial');
    assert.deepEqual(leitura.totais.em_atraso_d0, { quantidade: 2, valor: 879.06 });
    assert.deepEqual(leitura.totais.cobranca_d2, { quantidade: 1, valor: 459.9 });
    assert.deepEqual(leitura.totais.canceladas, { quantidade: 0, valor: 0 });
    assert.equal(leitura.totais.todas.quantidade, 4);
    assert.equal(leitura.reconciliation.source_missing, 1);
    assert.equal(leitura.reconciliation.identidade_invalida, 1);

    const aberta = leitura.items.find((item) => item.emusys_fatura_id === '1001');
    assert.equal(aberta.forma_pagamento.rotulo, 'Forma prevista');
    assert.equal(aberta.forma_pagamento.nome, 'Credito recorrente');
    assert.deepEqual(aberta.valores, {
      valor_com_desconto: 420,
      valor_sem_desconto_condicional: 450,
      multa: 9,
      mora: 0.9,
      valor_hoje: 459.9,
      valor_pago: null,
      juros_e_multa_snapshot: 0,
    });
    assert.equal(aberta.cobranca.d2_elegivel, true);

    const paga = leitura.items.find((item) => item.emusys_fatura_id === '1002');
    assert.equal(paga.forma_pagamento.rotulo, 'Pago via');
    assert.equal(paga.forma_pagamento.nome, 'PIX automatico');
    assert.equal(paga.valores.valor_hoje, null);
    assert.equal(paga.valores.valor_pago, 480);

    const pendente = leitura.items.find((item) => item.emusys_fatura_id === '1005');
    assert.equal(pendente.status, 'aberta');
    assert.equal(pendente.cobranca.d2_elegivel, false);
    const pendencia = leitura.reconciliation.items.find((item) => item.emusys_fatura_id === '1005');
    assert.equal(pendencia.aluno.nome, 'Aluno nao vinculado');
    assert.equal(pendencia.emusys_matricula_id, '9999');
    assert.equal(pendencia.emusys_student_id, '999');
    assert.deepEqual(pendencia.valores, {
      valor_original: 410,
      valor_com_desconto: 410,
      valor_sem_desconto_condicional: 410,
      multa: 8.2,
      mora: 0.96,
      valor_hoje: 419.16,
      valor_pago: null,
      juros_e_multa_snapshot: 0,
    });

    const d2 = psql(container, `
      select public.get_faturas_alunos_financeiro_v1(
        '11111111-1111-1111-1111-111111111111',
        2026,
        8,
        'competencia',
        'cobranca_d2',
        date '2026-08-16'
      )::text;
    `);
    assert.equal(d2.status, 0, d2.stderr || d2.stdout);
    const carteira = JSON.parse(d2.stdout.trim());
    assert.deepEqual(carteira.items.map((item) => item.emusys_fatura_id), ['1001']);
  });
});
