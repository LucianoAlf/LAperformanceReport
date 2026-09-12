import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sourceUrl = new URL(
  '../supabase/migrations/20260907300000_fatia3_porta_de_desfecho.sql',
  import.meta.url,
);

function docker(args, input) {
  return spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
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
    if (psql(container, 'select 1;').status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('PostgreSQL de teste nao iniciou');
}

function canonicalFunction() {
  const source = readFileSync(sourceUrl, 'utf8');
  const match = source.match(
    /create or replace function public\.sol_porta_registrar_desfecho_v1[\s\S]*?\$function\$;/i,
  );
  assert.ok(match, 'funcao canonica nao encontrada na migration');
  return match[0];
}

test('PostgreSQL 17: a unica porta de escrita fecha o alvo certo e o ensaio faz rollback', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  const container = `sol-gate4-outcome-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres',
    'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    const setup = psql(container, String.raw`
      create table public.alunos (id bigint primary key, nome text not null);
      create table public.radar_sinais (
        id uuid primary key, regra_codigo text, entidade_id bigint, unidade_id uuid,
        entidade_tipo text, status text, desfecho text, desfecho_em timestamptz,
        desfecho_nota text, triado_por text, triado_em timestamptz,
        atualizado_em timestamptz
      );
      create table public.automacao_log (
        evento text, acao text, status text, aluno_nome text, detalhes jsonb
      );
      create table public.gate4_vigencia (
        id uuid, regra_codigo text, entidade_id bigint, unidade_id uuid,
        entidade_tipo text, vigencia text, canonico boolean, dominio text
      );
      create view public.vw_radar_sinal_vigencia_v1 as select * from public.gate4_vigencia;

      create function public.sol_resolver_escopo_v1(text, text default null)
      returns jsonb language sql stable as $$
        select jsonb_build_object(
          'ok', true,
          'unidade_id', '10000000-0000-0000-0000-000000000001',
          'unidade_nome', 'Fixture',
          'quem', 'Papel operacional'
        )
      $$;
      create function public.fn_pessoa_chave_aluno(integer)
      returns text language sql immutable as $$ select $1::text $$;
      create function public.sol_nome_mesma_pessoa_v1(text, text)
      returns boolean language sql immutable as $$ select lower($1)=lower($2) $$;

      insert into public.alunos values (1, 'Aluno Fixture');
      insert into public.radar_sinais
        (id,regra_codigo,entidade_id,unidade_id,entidade_tipo,status,atualizado_em)
      values ('00000000-0000-0000-0000-000000000001','R2',1,
              '10000000-0000-0000-0000-000000000001','aluno','aberto',now());
      insert into public.gate4_vigencia values
        ('00000000-0000-0000-0000-000000000001','R2',1,
         '10000000-0000-0000-0000-000000000001','aluno','vigente',true,'aluno');
    `);
    assert.equal(setup.status, 0, setup.stderr || setup.stdout);

    const created = psql(container, canonicalFunction());
    assert.equal(created.status, 0, created.stderr || created.stdout);

    const proof = psql(container, String.raw`
      begin;
      select jsonb_build_object(
        'ok', (payload->>'ok')::boolean,
        'closed', (payload->>'sinais_fechados')::integer
      )::text
      from (select public.sol_porta_registrar_desfecho_v1(
        'actor-fixture','Aluno Fixture','reteve','gate4 isolated proof') payload) called;
      select jsonb_build_object(
        'status', (select status from public.radar_sinais limit 1),
        'audit_rows', (select count(*) from public.automacao_log)
      )::text;
      rollback;
      select jsonb_build_object(
        'status_after_rollback', (select status from public.radar_sinais limit 1),
        'audit_after_rollback', (select count(*) from public.automacao_log)
      )::text;
    `);
    assert.equal(proof.status, 0, proof.stderr || proof.stdout);
    const jsonLines = proof.stdout.split('\n').filter((line) => line.trim().startsWith('{'));
    assert.deepEqual(JSON.parse(jsonLines[0]), { ok: true, closed: 1 });
    assert.deepEqual(JSON.parse(jsonLines[1]), { status: 'resolvido', audit_rows: 1 });
    assert.deepEqual(JSON.parse(jsonLines[2]), {
      status_after_rollback: 'aberto', audit_after_rollback: 0,
    });

    const negative = psql(container, String.raw`
      select public.sol_porta_registrar_desfecho_v1(
        'actor-fixture','Aluno Fixture','resolvido_acho',null
      )::text;
    `);
    assert.equal(negative.status, 0, negative.stderr || negative.stdout);
    const payload = JSON.parse(negative.stdout.trim());
    assert.equal(payload.ok, false);
    assert.equal(payload.motivo, 'desfecho_invalido');
    assert.equal(payload.aceitos.length, 4);
  } finally {
    docker(['stop', container]);
  }
});
