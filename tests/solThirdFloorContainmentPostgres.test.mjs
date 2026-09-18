import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL(
  '../supabase/migrations/20260918014500_sol_contem_terceiro_andar_e_reconcilia_entregas.sql',
  import.meta.url,
), 'utf8');
const rollback = readFileSync(new URL(
  '../supabase/rollbacks/20260918014500_sol_contem_terceiro_andar_e_reconcilia_entregas_ROLLBACK.sql',
  import.meta.url,
), 'utf8');

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
  let consecutive = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (psql(container, 'select 1;').status === 0) {
      consecutive += 1;
      if (consecutive >= 3) return;
    } else {
      consecutive = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('PostgreSQL de teste nao iniciou');
}

test('contrato: contenção fecha os três canais e reconcilia somente fila vinculada', () => {
  assert.match(migration, /radar_pauta_grupo[\s\S]*radar_bloco_sinais_comercial/i);
  assert.match(migration, /update public\.radar_destinatarios[\s\S]*lower\(agente\) = 'sol'/i);
  assert.match(migration, /mensagem = 'fila:' \|\| f\.id::text/i);
  assert.match(migration, /status = 'enviado'/i);
  assert.match(migration, /status = 'falhou'/i);
  assert.doesNotMatch(migration, /insert into public\.fila_relatorios_sol_hermes/i);
  assert.doesNotMatch(migration, /insert into public\.radar_sinais|update public\.radar_sinais/i);
  assert.match(rollback, /jsonb_array_elements\(v_run\.switches\)/i);
  assert.match(rollback, /jsonb_array_elements\(v_run\.recipients\)/i);
  assert.match(rollback, /jsonb_array_elements\(v_run\.deliveries\)/i);
});

test('PostgreSQL 17: apply, trigger, rollback exato e reaplicação', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  const container = `sol-third-floor-containment-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres',
    'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    const setup = psql(container, String.raw`
      create role anon;
      create role authenticated;
      create role service_role;
      create table public.automacoes_config (
        slug text primary key,
        ativo boolean not null,
        updated_at timestamptz not null default now()
      );
      create table public.radar_destinatarios (
        id uuid primary key,
        agente text not null,
        ativo boolean not null
      );
      create table public.fila_relatorios_sol_hermes (
        id bigint primary key,
        tipo_relatorio text not null,
        status text not null,
        enviada_em timestamptz,
        erro text
      );
      create table public.radar_entregas (
        id uuid primary key,
        agente text not null,
        mensagem text,
        status text not null check (status in ('pendente','enviado','falhou','suprimido')),
        erro text,
        enviado_em timestamptz
      );
      insert into public.automacoes_config(slug,ativo) values
        ('radar_pauta_grupo',true),('radar_bloco_sinais_comercial',true);
      insert into public.radar_destinatarios(id,agente,ativo) values
        ('10000000-0000-4000-8000-000000000001','sol',true),
        ('10000000-0000-4000-8000-000000000002','sol',true),
        ('10000000-0000-4000-8000-000000000003','sol',true),
        ('10000000-0000-4000-8000-000000000004','sol',false),
        ('10000000-0000-4000-8000-000000000005','lia',true);
      insert into public.fila_relatorios_sol_hermes values
        (10,'radar_pauta','enviada','2026-09-17T12:00:00Z',null),
        (11,'radar_pauta','erro',null,'bridge indisponivel'),
        (12,'presenca','enviada','2026-09-17T12:01:00Z',null);
      insert into public.radar_entregas values
        ('20000000-0000-4000-8000-000000000001','sol','fila:10','pendente',null,null),
        ('20000000-0000-4000-8000-000000000002','sol','fila:11','pendente',null,null),
        ('20000000-0000-4000-8000-000000000003','sol','fila:999','pendente',null,null);
    `);
    assert.equal(setup.status, 0, setup.stderr || setup.stdout);

    const applied = psql(container, migration);
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);

    const contained = psql(container, String.raw`
      select
        (select string_agg(slug || '=' || ativo::text, ',' order by slug) from public.automacoes_config),
        (select count(*) from public.radar_destinatarios where agente='sol' and ativo),
        (select string_agg(id::text || '=' || status, ',' order by id) from public.radar_entregas),
        (select count(*) from public.sol_terceiro_andar_contencao_auditoria_v1 where rolled_back_at is null);
    `);
    assert.equal(contained.status, 0, contained.stderr || contained.stdout);
    assert.match(contained.stdout, /radar_bloco_sinais_comercial=false,radar_pauta_grupo=false\|0\|/);
    assert.match(contained.stdout, /0001=enviado/);
    assert.match(contained.stdout, /0002=falhou/);
    assert.match(contained.stdout, /0003=pendente\|1/);

    const trigger = psql(container, String.raw`
      insert into public.fila_relatorios_sol_hermes values
        (13,'radar_pauta','sol_pendente',null,null);
      insert into public.radar_entregas values
        ('20000000-0000-4000-8000-000000000004','sol','fila:13','pendente',null,null);
      update public.fila_relatorios_sol_hermes
         set status='enviada', enviada_em='2026-09-18T01:00:00Z'
       where id=13;
      select status, enviado_em is not null from public.radar_entregas
       where id='20000000-0000-4000-8000-000000000004';
    `);
    assert.equal(trigger.status, 0, trigger.stderr || trigger.stdout);
    assert.equal(trigger.stdout.trim().split('\n').at(-1), 'enviado|t');

    const rolledBack = psql(container, rollback);
    assert.equal(rolledBack.status, 0, rolledBack.stderr || rolledBack.stdout);
    const restored = psql(container, String.raw`
      select
        (select count(*) from public.automacoes_config where ativo),
        (select count(*) from public.radar_destinatarios where agente='sol' and ativo),
        (select string_agg(id::text || '=' || status, ',' order by id) from public.radar_entregas),
        to_regprocedure('public.sol_sincronizar_radar_entrega_da_fila_v1()') is null;
    `);
    assert.equal(restored.status, 0, restored.stderr || restored.stdout);
    assert.match(restored.stdout, /^2\|3\|/);
    assert.match(restored.stdout, /0001=pendente/);
    assert.match(restored.stdout, /0002=pendente/);
    assert.match(restored.stdout, /0004=enviado\|t/);

    const reapplied = psql(container, migration);
    assert.equal(reapplied.status, 0, reapplied.stderr || reapplied.stdout);
    const activeRuns = psql(container, String.raw`
      select count(*) from public.sol_terceiro_andar_contencao_auditoria_v1
       where rolled_back_at is null;
    `);
    assert.equal(activeRuns.status, 0, activeRuns.stderr || activeRuns.stdout);
    assert.equal(activeRuns.stdout.trim(), '1');
  } finally {
    docker(['stop', container]);
  }
});
