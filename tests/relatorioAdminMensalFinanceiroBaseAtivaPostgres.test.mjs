import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  root,
  'supabase/migrations/20260804213000_relatorio_admin_mensal_financeiro_base_ativa.sql',
);

function dockerAvailable() {
  return spawnSync('docker', ['version'], { encoding: 'utf8' }).status === 0;
}

function psql(container, sql) {
  return execFileSync(
    'docker',
    [
      'exec', '-i', container,
      'psql', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1',
      '-U', 'postgres', '-d', 'postgres', '-At',
    ],
    { input: sql, encoding: 'utf8' },
  );
}

function waitForPostgres(container) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      psql(container, 'select 1;');
      return;
    } catch {
      // O container ainda esta iniciando.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
    }
  }
  throw new Error('PostgreSQL de teste nao iniciou');
}

test('mensal administrativo usa base ativa fechada e separa o realizado', { timeout: 120_000 }, (t) => {
  assert.equal(existsSync(migrationPath), true, 'migration corretiva ainda nao existe');

  const migration = readFileSync(migrationPath, 'utf8');
  assert.match(migration, /kpis_alunos_canonicos[\s\S]*totais/i);
  assert.match(migration, /faturamento_realizado/i);
  assert.doesNotMatch(migration, /financeiro_faturas_emusys/i);

  if (!dockerAvailable()) {
    t.skip('Docker indisponivel para o teste PostgreSQL');
    return;
  }

  const container = `la-admin-fin-${process.pid}-${Date.now()}`;
  execFileSync('docker', [
    'run', '--rm', '-d', '--name', container,
    '-e', 'POSTGRES_PASSWORD=postgres',
    'postgres:17-alpine',
  ], { encoding: 'utf8' });

  try {
    waitForPostgres(container);
    psql(container, `
      create extension if not exists pgcrypto;
      do $$ begin
        create role anon;
      exception when duplicate_object then null; end $$;
      do $$ begin
        create role authenticated;
      exception when duplicate_object then null; end $$;
      do $$ begin
        create role service_role;
      exception when duplicate_object then null; end $$;

      create schema auth;
      create function auth.role() returns text language sql stable as
        $$ select 'service_role'::text $$;

      create function public.hash_jsonb_canonico(p_payload jsonb)
      returns text language sql stable as $$
        select encode(
          digest(convert_to(coalesce(p_payload, '{}'::jsonb)::text, 'UTF8'), 'sha256'),
          'hex'
        );
      $$;

      create table public.fechamento_mensal_snapshots (
        id uuid primary key,
        ano integer not null,
        mes integer not null,
        escopo text not null,
        unidade_id uuid not null,
        dominio text not null,
        versao integer not null,
        status text not null,
        fonte text not null,
        payload jsonb not null,
        payload_hash text not null,
        financeiro_realizado_disponivel boolean not null default false,
        observacao text,
        capturado_em timestamptz not null default now(),
        capturado_por uuid,
        aprovado_em timestamptz,
        aprovado_por uuid,
        fechado_em timestamptz,
        fechado_por uuid,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create table public.test_admin_base_outputs (
        unidade_id uuid primary key,
        resultado jsonb not null
      );

      create function public.get_relatorio_admin_mensal_rico_v1(
        p_unidade_id uuid,
        p_ano integer,
        p_mes integer
      ) returns jsonb language sql stable security definer as $$
        select resultado
        from public.test_admin_base_outputs
        where unidade_id = p_unidade_id;
      $$;

      with fontes(unidade_id, snapshot_id, nome, pagantes, mrr, ticket, previsto, realizado, ltv, permanencia) as (
        values
          ('11111111-1111-1111-1111-111111111111'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'Barra', 240, 108025.65, 450.11, 108025.65, 106638.65, 6073.38, 13.5),
          ('22222222-2222-2222-2222-222222222222'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'Recreio', 336, 150982.39, 449.35, 150982.39, 149335.15, 6691.59, 14.9),
          ('33333333-3333-3333-3333-333333333333'::uuid, 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'Campo Grande', 393, 154939.58, 394.25, 154939.58, 149495.58, 7614.43, 19.3)
      ), payloads as (
        select *, jsonb_build_object(
          'unidade', jsonb_build_object('nome', nome),
          'kpis_alunos_canonicos', jsonb_build_object('totais', jsonb_build_object(
            'alunos_pagantes', pagantes,
            'mrr', mrr,
            'ticket_medio', ticket,
            'faturamento_previsto', previsto,
            'faturamento_realizado', realizado,
            'ltv_medio', ltv,
            'tempo_permanencia_medio', permanencia
          )),
          'financeiro_faturas_emusys', jsonb_build_object('totais', jsonb_build_object(
            'mrr_atual', realizado,
            'ticket_medio', round(realizado / greatest(pagantes - 79, 1), 2)
          ))
        ) as payload
        from fontes
      )
      insert into public.fechamento_mensal_snapshots (
        id, ano, mes, escopo, unidade_id, dominio, versao, status, fonte, payload, payload_hash
      )
      select snapshot_id, 2026, 7, 'unidade', unidade_id, 'relatorio_gerencial', 1, 'fechado',
             'fixture', payload, public.hash_jsonb_canonico(payload)
      from payloads;

      insert into public.test_admin_base_outputs (unidade_id, resultado)
      select s.unidade_id, jsonb_build_object(
        'snapshot_id', gen_random_uuid(),
        'payload_hash', repeat('0', 64),
        'versao', 1,
        'status', 'fechado',
        'payload', jsonb_build_object(
          'resumo', jsonb_build_object(
            'alunos_pagantes', (s.payload#>>'{kpis_alunos_canonicos,totais,alunos_pagantes}')::integer
          ),
          'fontes', jsonb_build_object('relatorio_gerencial', jsonb_build_object(
            'snapshot_id', s.id,
            'payload_hash', s.payload_hash
          )),
          'indicadores_financeiros', jsonb_build_object(
            'mrr_atual', s.payload#>>'{kpis_alunos_canonicos,totais,faturamento_realizado}',
            'ticket_medio', 396.51,
            'faturamento_previsto', 146510.40,
            'ltv_medio', 7652.64,
            'tempo_permanencia', 19.3
          )
        )
      )
      from public.fechamento_mensal_snapshots s;
    `);

    psql(container, migration);

    const rows = psql(container, `
      select jsonb_build_object(
        'unidade_id', unidade_id,
        'financeiro', public.get_relatorio_admin_mensal_rico_v1(unidade_id, 2026, 7)
          #>'{payload,indicadores_financeiros}'
      )::text
      from public.test_admin_base_outputs
      order by unidade_id;
    `).trim().split(/\r?\n/).map((line) => JSON.parse(line));

    const expected = [
      ['11111111-1111-1111-1111-111111111111', 108025.65, 450.11, 106638.65, 6073.38, 13.5],
      ['22222222-2222-2222-2222-222222222222', 150982.39, 449.35, 149335.15, 6691.59, 14.9],
      ['33333333-3333-3333-3333-333333333333', 154939.58, 394.25, 149495.58, 7614.43, 19.3],
    ];

    assert.equal(rows.length, expected.length);
    rows.forEach((row, index) => {
      const [unit, mrr, ticket, realized, ltv, permanence] = expected[index];
      assert.equal(row.unidade_id, unit);
      assert.equal(Number(row.financeiro.mrr_atual), mrr);
      assert.equal(Number(row.financeiro.ticket_medio), ticket);
      assert.equal(Number(row.financeiro.faturamento_previsto), mrr);
      assert.equal(Number(row.financeiro.faturamento_realizado), realized);
      assert.equal(Number(row.financeiro.ltv_medio), ltv);
      assert.equal(Number(row.financeiro.tempo_permanencia), permanence);
      assert.equal(row.financeiro.fonte, 'kpis_alunos_canonicos.totais');
    });

    assert.equal(
      psql(container, 'select count(*) from public.fechamento_mensal_snapshots;').trim(),
      '3',
      'a leitura nao pode reescrever snapshots fechados',
    );
  } finally {
    spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' });
  }
});
