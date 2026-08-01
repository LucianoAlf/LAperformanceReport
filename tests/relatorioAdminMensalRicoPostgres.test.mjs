import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260801103000_relatorio_admin_mensal_rico_canonico.sql'),
  'utf8',
);

function docker(args, input) {
  return spawnSync('docker', args, {
    input,
    encoding: 'utf8',
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

async function aguardarPostgres(container) {
  for (let tentativa = 0; tentativa < 60; tentativa += 1) {
    const pronto = docker(['exec', container, 'pg_isready', '-U', 'postgres']);
    if (pronto.status === 0) {
      const consulta = docker([
        'exec', container, 'psql', '--no-psqlrc',
        '-U', 'postgres', '-d', 'postgres', '-Atc', 'select 1',
      ]);
      if (consulta.status === 0 && consulta.stdout.trim() === '1') return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('PostgreSQL de teste nao iniciou a tempo');
}

test('RPC mensal administrativa compila e le o fechamento sem altera-lo', { timeout: 90_000 }, async (t) => {
  const versao = docker(['version', '--format', '{{.Server.Version}}']);
  if (versao.status !== 0) {
    t.skip('Docker indisponivel');
    return;
  }

  const container = `la-report-admin-mensal-${process.pid}-${Date.now()}`;
  const iniciado = docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres',
    'postgres:17-alpine',
  ]);
  assert.equal(iniciado.status, 0, iniciado.stderr || iniciado.stdout);

  try {
    await aguardarPostgres(container);

    const schema = psql(container, `
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin;
      create schema auth;
      create extension if not exists pgcrypto;

      create function auth.role() returns text
      language sql stable as $$ select 'anon'::text $$;

      create table public.fechamento_mensal_snapshots (
        id uuid primary key,
        unidade_id uuid not null,
        ano integer not null,
        mes integer not null,
        escopo text not null,
        dominio text not null,
        versao integer not null,
        status text not null,
        payload jsonb not null,
        payload_hash text,
        capturado_em timestamptz not null
      );

      create table public.movimentacoes_admin (
        id bigserial primary key,
        aluno_id bigint,
        unidade_id uuid not null,
        tipo text not null,
        tipo_evasao text,
        competencia_referencia date,
        data date not null,
        created_at timestamptz not null
      );

      create table public.alunos (
        id bigint primary key,
        tipo_matricula_id integer,
        is_segundo_curso boolean
      );

      create table public.audit_log (
        tabela text not null,
        registro_id uuid,
        registro_id_text text,
        created_at timestamptz not null,
        acao text not null,
        dados_antigos jsonb,
        dados_novos jsonb
      );

      create function public.hash_jsonb_canonico(p_payload jsonb)
      returns text language sql immutable
      as $$ select encode(digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex') $$;

      create function public.pode_gerar_relatorio_admin_v1(p_unidade_id uuid)
      returns boolean language sql stable as $$ select true $$;

      create function public.montar_relatorio_admin_mensal_payload_v1(
        p_unidade_id uuid,
        p_ano integer,
        p_mes integer
      ) returns jsonb language sql stable as $$
        select jsonb_build_object(
          'capturado_em', '2026-08-01T00:00:00Z',
          'resumo', '{}'::jsonb,
          'evasoes', jsonb_build_array(jsonb_build_object('id', 3361, 'tipo_evasao', null))
        )
      $$;
    `);
    assert.equal(schema.status, 0, schema.stderr || schema.stdout);

    const aplicada = psql(container, migration);
    assert.equal(aplicada.status, 0, aplicada.stderr || aplicada.stdout);

    const unidade = '11111111-1111-1111-1111-111111111111';
    const admin = '22222222-2222-2222-2222-222222222222';
    const gerencial = '33333333-3333-3333-3333-333333333333';
    const mensal = '44444444-4444-4444-4444-444444444444';

    const fixture = psql(container, `
      insert into public.fechamento_mensal_snapshots
        (id, unidade_id, ano, mes, escopo, dominio, versao, status, payload, capturado_em)
      values
        ('${admin}', '${unidade}', 2026, 7, 'unidade', 'alunos_admin', 1, 'fechado',
         '{"alunos_ativos":344,"alunos_pagantes":336,"matriculas_ativas":430}',
         '2026-08-01T00:00:00Z'),
        ('${gerencial}', '${unidade}', 2026, 7, 'unidade', 'relatorio_gerencial', 1, 'fechado',
         '{
           "financeiro_faturas_emusys":{"totais":{"ticket_medio":449.15,"faturamento_previsto":142925.20,"mrr_atual":141032.20}},
           "kpis_gestao":[{"ltv_medio":6692.34,"tempo_permanencia_medio":14.9,"reajuste_medio":8.13,"inadimplentes":4}],
           "kpis_retencao":[{"evasoes_base_alunos":4,"taxa_renovacao":85.19,"mrr_perdido":2412.85,"renovacoes_previstas":27}],
           "metas_kpi":{"churn_rate":4,"inadimplencia":1.5,"taxa_renovacao":90,"reajuste_medio":10}
         }',
         '2026-08-01T00:00:00Z');

      update public.fechamento_mensal_snapshots
      set payload_hash = public.hash_jsonb_canonico(payload)
      where id in ('${admin}', '${gerencial}');

      insert into public.fechamento_mensal_snapshots
        (id, unidade_id, ano, mes, escopo, dominio, versao, status, payload, capturado_em)
      select '${mensal}', '${unidade}', 2026, 7, 'unidade', 'relatorio_admin_mensal', 1, 'fechado',
        jsonb_build_object(
          'resumo', jsonb_build_object(
            'alunos_ativos', 344,
            'alunos_pagantes', 336,
            'matriculas_ativas', 430,
            'nao_renovacoes', 2,
            'evasoes', 7,
            'renovacoes_realizadas', 23
          ),
          'evasoes', jsonb_build_array(
            jsonb_build_object('id', 3361, 'aluno_nome', 'Aluna Bolsista', 'tipo_evasao', null)
          ),
          'fontes', jsonb_build_object(
            'alunos_admin', jsonb_build_object(
              'snapshot_id', '${admin}',
              'payload_hash', (select payload_hash from public.fechamento_mensal_snapshots where id = '${admin}')
            ),
            'relatorio_gerencial', jsonb_build_object(
              'snapshot_id', '${gerencial}',
              'payload_hash', (select payload_hash from public.fechamento_mensal_snapshots where id = '${gerencial}')
            )
          )
        ),
        '2026-08-01T00:00:00Z';

      update public.fechamento_mensal_snapshots
      set payload_hash = public.hash_jsonb_canonico(payload)
      where id = '${mensal}';

      insert into public.movimentacoes_admin
        (unidade_id, tipo, competencia_referencia, data, created_at)
      values
        ('${unidade}', 'trancamento', '2026-07-01', '2026-07-01', '2026-07-01T10:00:00Z'),
        ('${unidade}', 'trancamento', '2026-07-10', '2026-07-10', '2026-07-10T10:00:00Z'),
        ('${unidade}', 'trancamento', '2026-07-20', '2026-07-20', '2026-07-20T10:00:00Z');

      insert into public.alunos (id, tipo_matricula_id, is_segundo_curso)
      values (1498, 3, false);

      insert into public.movimentacoes_admin
        (id, aluno_id, unidade_id, tipo, tipo_evasao, competencia_referencia, data, created_at)
      values
        (3361, 1498, '${unidade}', 'evasao', null, '2026-07-07', '2026-07-07', '2026-07-07T10:00:00Z');
    `);
    assert.equal(fixture.status, 0, fixture.stderr || fixture.stdout);

    const consulta = psql(container, `
      select jsonb_build_object(
        'status', resultado->>'status',
        'trancamentos_periodo', resultado#>>'{payload,trancamentos_periodo}',
        'churn_rate', resultado#>>'{payload,indicadores_retencao,churn_rate}',
        'inadimplencia', resultado#>>'{payload,indicadores_retencao,inadimplencia}',
        'tipo_evasao', resultado#>>'{payload,evasoes,0,tipo_evasao}',
        'snapshots', (select count(*) from public.fechamento_mensal_snapshots),
        'wrapper_futuro', public.montar_relatorio_admin_mensal_payload_v1('${unidade}', 2026, 7)#>>'{resumo,trancamentos_periodo}',
        'wrapper_tipo_evasao', public.montar_relatorio_admin_mensal_payload_v1('${unidade}', 2026, 7)#>>'{evasoes,0,tipo_evasao}'
      )
      from (select public.get_relatorio_admin_mensal_rico_v1('${unidade}', 2026, 7) resultado) q;
    `);
    assert.equal(consulta.status, 0, consulta.stderr || consulta.stdout);
    const resultado = JSON.parse(consulta.stdout.trim());
    assert.deepEqual(resultado, {
      status: 'fechado',
      trancamentos_periodo: '3',
      churn_rate: '1.79',
      inadimplencia: '1.19',
      tipo_evasao: 'interrompido_bolsista',
      snapshots: 3,
      wrapper_futuro: '3',
      wrapper_tipo_evasao: 'interrompido_bolsista',
    });
  } finally {
    docker(['rm', '--force', container]);
  }
});
