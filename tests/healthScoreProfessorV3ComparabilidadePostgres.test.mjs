import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  root,
  'supabase/migrations/20260803123000_health_score_v3_comparabilidade.sql',
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

async function waitForPostgres(container) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const mainProcess = docker([
      'exec', container,
      'sh', '-c', 'test "$(cat /proc/1/comm)" = postgres',
    ]);
    const ready = mainProcess.status === 0
      ? psql(container, 'select 1;')
      : { status: 1 };
    if (ready.status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('PostgreSQL de teste nao iniciou a tempo');
}

function extractComparabilityFunction(sql) {
  const start = sql.search(
    /create\s+or\s+replace\s+function\s+public\.avaliar_health_score_professor_v3_comparabilidade\(/i,
  );
  assert.notEqual(start, -1, 'funcao pura de comparabilidade deve existir');
  const bodyStart = sql.indexOf('$function$', start);
  const end = sql.indexOf('$function$;', bodyStart + '$function$'.length);
  assert.notEqual(bodyStart, -1);
  assert.notEqual(end, -1);
  return sql.slice(start, end + '$function$;'.length);
}

test('PostgreSQL aplica os gates de comparabilidade sem transformar ausencia em zero', async (t) => {
  const dockerInfo = docker(['info']);
  if (dockerInfo.status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  const container = `la-health-comparabilidade-${process.pid}`;
  const start = docker([
    'run', '--rm', '--name', container,
    '-e', 'POSTGRES_PASSWORD=postgres',
    '-d', 'postgres:17-alpine',
  ]);
  assert.equal(start.status, 0, start.stderr || start.stdout);

  try {
    await waitForPostgres(container);
    const migration = fs.readFileSync(migrationPath, 'utf8');
    const helper = extractComparabilityFunction(migration);
    const setup = psql(container, `create schema if not exists public;\n${helper}`);
    assert.equal(setup.status, 0, setup.stderr || setup.stdout);

    const result = psql(container, `
      with casos(nome, score, cobertura, pilares, fidelizacao, fonte) as (
        values
          ('adriana_1_pilar', 100::numeric, 15::numeric, 1, true, true),
          ('dois_pilares', 98::numeric, 40::numeric, 2, true, true),
          ('tres_cobertura_baixa', 90::numeric, 50::numeric, 3, true, true),
          ('tres_sem_fidelizacao', 90::numeric, 65::numeric, 3, false, true),
          ('tres_comparavel', 90::numeric, 65::numeric, 3, true, true),
          ('fonte_em_auditoria', 90::numeric, 65::numeric, 3, true, false),
          ('sem_base', null::numeric, 0::numeric, 0, false, true)
      )
      select jsonb_object_agg(
        nome,
        public.avaliar_health_score_professor_v3_comparabilidade(
          score, cobertura, pilares, fidelizacao, 60, fonte
        )
      )::text
      from casos;
    `);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());

    assert.equal(payload.adriana_1_pilar.estado, 'em_maturacao');
    assert.equal(payload.adriana_1_pilar.motivo, 'pilares_insuficientes');
    assert.equal(payload.adriana_1_pilar.score_comparavel, null);
    assert.equal(payload.dois_pilares.estado, 'em_maturacao');
    assert.equal(payload.tres_cobertura_baixa.motivo, 'cobertura_insuficiente');
    assert.equal(payload.tres_sem_fidelizacao.motivo, 'sem_pilar_fidelizacao');
    assert.equal(payload.tres_comparavel.estado, 'comparavel');
    assert.equal(payload.tres_comparavel.score_comparavel, 90);
    assert.equal(payload.fonte_em_auditoria.motivo, 'fonte_em_auditoria');
    assert.equal(payload.sem_base.estado, 'sem_base_operacional');
    assert.equal(payload.sem_base.score_comparavel, null);
  } finally {
    docker(['stop', container]);
  }
});

test('RPC completa publica comparabilidade e referencia historica em campos separados', async (t) => {
  const dockerInfo = docker(['info']);
  if (dockerInfo.status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  const container = `la-health-readmodel-${process.pid}`;
  const start = docker([
    'run', '--rm', '--name', container,
    '-e', 'POSTGRES_PASSWORD=postgres',
    '-d', 'postgres:17-alpine',
  ]);
  assert.equal(start.status, 0, start.stderr || start.stdout);

  const unit = '10000000-0000-0000-0000-000000000001';
  const config = '20000000-0000-0000-0000-000000000001';
  const snapshot = '30000000-0000-0000-0000-000000000001';
  const oldReturn = `
    professor_id integer, unidade_id uuid, escopo text, competencia date,
    trimestre_inicio date, periodicidade text, periodo_inicio date, periodo_fim date,
    ciclo_codigo text, estado_publicacao text, score_exibivel boolean,
    ranking_habilitado boolean, config_versao integer, revisao integer, score numeric,
    cobertura numeric, classificacao text, estado text, snapshot_publicavel boolean,
    publicado boolean, motivo_bloqueio text, regra_versao_snapshot text,
    metrica text, valor_bruto numeric, numerador numeric, denominador numeric,
    nota numeric, peso numeric, peso_disponivel boolean, peso_efetivo numeric,
    contribuicao numeric, meta numeric, amostra integer, estado_base text,
    metrica_publicavel boolean, confianca text, fonte text,
    regra_versao_metrica text, motivo_sem_base text, codigo_evidencia text,
    papel text, detalhes jsonb
  `;
  const fixture = `
    create schema auth;
    create role anon;
    create role authenticated;
    create role service_role;
    create function auth.role() returns text language sql stable
      as $$ select 'service_role'::text $$;
    create function public.fn_health_score_professor_v3_ator_leitura(uuid)
      returns void language sql stable as $$ select $$;

    create table public.fechamento_mensal_snapshots (
      id uuid primary key,
      ano integer,
      mes integer,
      escopo text,
      unidade_id uuid,
      dominio text,
      status text,
      fonte text,
      payload jsonb,
      payload_hash text,
      versao integer,
      fechado_em timestamptz
    );
    create function public.montar_relatorio_coordenacao_payload_v2(
      uuid, integer, integer
    ) returns jsonb language sql stable as $$
      select jsonb_build_object(
        'schema_version', 2,
        'professores', '[]'::jsonb,
        'resumo_equipe', '{}'::jsonb
      )
    $$;
    create function public.hash_jsonb_canonico(jsonb)
      returns text language sql immutable as $$ select md5($1::text) $$;

    create table public.health_score_professor_v3_config_versoes (
      id uuid primary key, versao integer unique, cobertura_minima numeric,
      exige_pilar_fidelizacao boolean
    );
    insert into public.health_score_professor_v3_config_versoes values
      ('${config}', 4, 60, true);

    create table public.health_score_professor_v3_snapshots (
      id uuid primary key, professor_id integer, unidade_id uuid, escopo text,
      competencia date, trimestre_inicio date, periodicidade text,
      periodo_inicio date, periodo_fim date, ciclo_codigo text,
      estado_publicacao text, ranking_habilitado boolean, config_id uuid,
      config_versao integer, revisao integer, score numeric, cobertura numeric,
      classificacao text, estado text, publicavel boolean, publicado boolean,
      motivo_bloqueio text, regra_versao text, criado_em timestamptz,
      invalidado_em timestamptz
    );
    create table public.health_score_professor_v3_snapshot_metricas (
      snapshot_id uuid, metrica text, nota numeric, peso numeric,
      peso_disponivel boolean, codigo_evidencia text, papel text
    );
    insert into public.health_score_professor_v3_snapshots values (
      '${snapshot}', 3, '${unit}', 'unidade', '2026-07-01', '2026-07-01',
      'mensal', '2026-07-01', '2026-07-31', '2026-07', 'parcial', false,
      '${config}', 4, 1, 88, 65, 'saudavel', 'provisorio', false, false,
      null, 'fixture', now(), null
    );
    insert into public.health_score_professor_v3_snapshot_metricas values
      ('${snapshot}', 'retencao', 90, 25, true, 'evidencia_valida', 'nota'),
      ('${snapshot}', 'permanencia', 88, 25, true, 'evidencia_valida', 'nota'),
      ('${snapshot}', 'media_turma', 86, 15, true, 'evidencia_valida', 'nota');

    create function public.get_health_score_professor_v3_performance(
      p_competencia date, p_unidade_id uuid, p_periodicidade text
    ) returns table (${oldReturn})
    language sql stable security definer set search_path = public, pg_temp
    as $$
      with professores(id, score, cobertura, classificacao, pilares) as (
        values
          (1, 100::numeric, 15::numeric, 'saudavel'::text, array['media_turma']),
          (2, 90::numeric, 65::numeric, 'saudavel'::text, array['retencao','permanencia','media_turma']),
          (3, 100::numeric, 25::numeric, 'saudavel'::text, array['retencao'])
      ), metricas(metrica, peso) as (
        values
          ('retencao'::text, 25::numeric),
          ('permanencia'::text, 25::numeric),
          ('conversao'::text, 15::numeric),
          ('media_turma'::text, 15::numeric),
          ('presenca'::text, 10::numeric)
      )
      select
        p.id, p_unidade_id, 'unidade'::text, date_trunc('month', p_competencia)::date,
        date_trunc('month', p_competencia)::date, p_periodicidade,
        date_trunc('month', p_competencia)::date,
        (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date,
        to_char(p_competencia, 'YYYY-MM'), 'em_andamento'::text, true, false,
        4, 0, p.score, p.cobertura, p.classificacao, 'em_andamento'::text,
        false, false, 'competencia_em_andamento'::text, 'fixture'::text,
        m.metrica, case when m.metrica = any(p.pilares) then p.score else null end,
        null::numeric, null::numeric,
        case when m.metrica = any(p.pilares) then p.score else null end,
        m.peso, m.metrica = any(p.pilares),
        case when m.metrica = any(p.pilares) then 100.0 / cardinality(p.pilares) else 0 end,
        null::numeric, 80::numeric,
        case when m.metrica = any(p.pilares) then 5 else 0 end,
        case when m.metrica = any(p.pilares) then 'ok' else 'sem_base' end,
        m.metrica = any(p.pilares), 'alta'::text, 'fixture_canonica'::text,
        'fixture'::text, null::text,
        case when m.metrica = any(p.pilares) then 'evidencia_valida' else 'nao_aplicavel' end,
        'nota'::text, '{}'::jsonb
      from professores p cross join metricas m
    $$;

    create function public.get_health_score_professor_v3_snapshot_modal(
      p_competencia date, p_unidade_id uuid, p_professor_id integer, p_periodicidade text
    ) returns table (${oldReturn})
    language sql stable security definer set search_path = public, pg_temp
    as $$
      select * from public.get_health_score_professor_v3_performance(
        p_competencia, p_unidade_id, p_periodicidade
      ) where professor_id = p_professor_id
    $$;
  `;

  try {
    await waitForPostgres(container);
    const setup = psql(container, fixture);
    assert.equal(setup.status, 0, setup.stderr || setup.stdout);

    const migration = fs.readFileSync(migrationPath, 'utf8');
    const applied = psql(container, migration);
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);

    const result = psql(container, `
      select jsonb_agg(x order by professor_id)::text
      from (
        select distinct on (professor_id)
          professor_id,
          score_observado,
          score_comparavel,
          pilares_validos,
          comparabilidade_estado,
          classificacao,
          competencia_referencia,
          score_referencia
        from public.get_health_score_professor_v3_performance(
          '2026-08-01', '${unit}', 'mensal'
        )
        order by professor_id, metrica
      ) x;
    `);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const rows = JSON.parse(result.stdout.trim());

    assert.deepEqual(rows[0], {
      professor_id: 1,
      score_observado: 100,
      score_comparavel: null,
      pilares_validos: 1,
      comparabilidade_estado: 'em_maturacao',
      classificacao: null,
      competencia_referencia: null,
      score_referencia: null,
    });
    assert.equal(rows[1].comparabilidade_estado, 'comparavel');
    assert.equal(rows[1].score_comparavel, 90);
    assert.equal(rows[1].classificacao, 'saudavel');
    assert.equal(rows[2].comparabilidade_estado, 'em_maturacao');
    assert.equal(rows[2].score_comparavel, null);
    assert.equal(rows[2].competencia_referencia, '2026-07-01');
    assert.equal(rows[2].score_referencia, 88);

    const modal = psql(container, `
      select distinct comparabilidade_estado, score_observado, score_comparavel
      from public.get_health_score_professor_v3_snapshot_modal(
        '2026-08-01', '${unit}', 1, 'mensal'
      );
    `);
    assert.equal(modal.status, 0, modal.stderr || modal.stdout);
    assert.equal(modal.stdout.trim(), 'em_maturacao|100|');
  } finally {
    docker(['stop', container]);
  }
});
