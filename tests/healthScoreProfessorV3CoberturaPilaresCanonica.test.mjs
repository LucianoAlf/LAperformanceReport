import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  root,
  'supabase/migrations/20260804120000_health_score_v3_cobertura_pilares_canonica.sql',
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
  let consecutiveReadyChecks = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const ready = psql(container, 'select 1;');
    if (ready.status === 0) {
      consecutiveReadyChecks += 1;
      if (consecutiveReadyChecks >= 2) return;
    } else {
      consecutiveReadyChecks = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('PostgreSQL de teste nao iniciou a tempo');
}

function extractFunction(sql, functionName) {
  const start = sql.search(new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}\\(`,
    'i',
  ));
  assert.notEqual(start, -1, `funcao ${functionName} deve existir`);
  const taggedBodyStart = sql.indexOf('$function$', start);
  const plainBodyStart = sql.indexOf('$$', start);
  const delimiter = taggedBodyStart !== -1
    && (plainBodyStart === -1 || taggedBodyStart < plainBodyStart)
    ? '$function$'
    : '$$';
  const bodyStart = sql.indexOf(delimiter, start);
  const end = sql.indexOf(`${delimiter};`, bodyStart + delimiter.length);
  assert.notEqual(bodyStart, -1, `corpo de ${functionName} deve existir`);
  assert.notEqual(end, -1, `fim de ${functionName} deve existir`);
  return sql.slice(start, end + `${delimiter};`.length);
}

test('contrato usa cobertura por quantidade de pilares e preserva peso como diagnostico', () => {
  assert.equal(fs.existsSync(migrationPath), true, 'migration corretiva ainda nao existe');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /calcular_health_score_professor_v3_cobertura_pilares/i);
  assert.match(sql, /pilares_validos[\s\S]*pilares_esperados/i);
  assert.match(sql, /cobertura_ponderada_diagnostica/i);
  assert.match(sql, /avaliar_health_score_professor_v3_comparabilidade\([\s\S]*cobertura_pilares/i);
  assert.doesNotMatch(
    sql,
    /avaliar_health_score_professor_v3_comparabilidade\([\s\S]{0,250}peso_disponivel_total[\s\S]{0,120}peso_pontuavel_total/i,
  );
});

test('PostgreSQL considera 3 de 5 pilares como 60% sem depender da distribuicao dos pesos', async (t) => {
  assert.equal(fs.existsSync(migrationPath), true, 'migration corretiva ainda nao existe');
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  const container = `la-health-pillar-coverage-${process.pid}`;
  const started = docker([
    'run', '--rm', '--name', container,
    '-e', 'POSTGRES_PASSWORD=postgres',
    '-d', 'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    const sql = fs.readFileSync(migrationPath, 'utf8');
    const coverage = extractFunction(
      sql,
      'calcular_health_score_professor_v3_cobertura_pilares',
    );
    const setup = psql(container, `create schema if not exists public;\n${coverage}`);
    assert.equal(setup.status, 0, setup.stderr || setup.stdout);

    const result = psql(container, `
      select jsonb_build_object(
        'tres_de_cinco', public.calcular_health_score_professor_v3_cobertura_pilares(3, 5),
        'dois_de_cinco', public.calcular_health_score_professor_v3_cobertura_pilares(2, 5),
        'sem_base', public.calcular_health_score_professor_v3_cobertura_pilares(0, 0)
      )::text;
    `);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.tres_de_cinco, 60);
    assert.equal(payload.dois_de_cinco, 40);
    assert.equal(payload.sem_base, 0);
  } finally {
    docker(['stop', container]);
  }
});

test('PostgreSQL resolve modalidade individual observada sem esconder segmento pendente real', async (t) => {
  assert.equal(fs.existsSync(migrationPath), true, 'migration corretiva ainda nao existe');
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  const container = `la-health-individual-segment-${process.pid}`;
  const started = docker([
    'run', '--rm', '--name', container,
    '-e', 'POSTGRES_PASSWORD=postgres',
    '-d', 'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    const sql = fs.readFileSync(migrationPath, 'utf8');
    const resolver = extractFunction(
      sql,
      'resolver_health_score_v3_media_turma_individual',
    );
    const setup = psql(container, `create schema if not exists public;\n${resolver}`);
    assert.equal(setup.status, 0, setup.stderr || setup.stdout);

    const result = psql(container, `
      with detalhes as (
        select jsonb_build_object('segmentos_resumo', jsonb_build_array(jsonb_build_array(
          jsonb_build_object(
            'modalidade', 'turma', 'estado_base', 'ok',
            'turmas_elegiveis', 10, 'ocupacoes_unicas', 10,
            'numerador', 10, 'denominador', 15
          ),
          jsonb_build_object(
            'modalidade', 'individual', 'estado_base', 'segmentacao_incompleta',
            'turmas_elegiveis', 5, 'ocupacoes_unicas', 5,
            'numerador', null, 'denominador', null
          )
        ))) as payload
      ), casos as (
        select 'individual_resolvido'::text as nome,
          public.resolver_health_score_v3_media_turma_individual(payload, 10, 15) as r
        from detalhes
        union all
        select 'turma_pendente', public.resolver_health_score_v3_media_turma_individual(
          jsonb_build_object('segmentos_resumo', jsonb_build_array(jsonb_build_array(
            jsonb_build_object(
              'modalidade', 'turma', 'estado_base', 'segmentacao_incompleta',
              'turmas_elegiveis', 2, 'ocupacoes_unicas', 3,
              'numerador', null, 'denominador', null
            )
          ))), 0, 0
        )
      )
      select jsonb_object_agg(nome, r)::text from casos;
    `);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());

    assert.equal(payload.individual_resolvido.resolvido, true);
    assert.equal(payload.individual_resolvido.numerador, 15);
    assert.equal(payload.individual_resolvido.denominador, 20);
    assert.equal(payload.individual_resolvido.nota, 75);
    assert.equal(payload.individual_resolvido.segmentos_individuais_inferidos, 1);
    assert.equal(payload.turma_pendente.resolvido, false);
    assert.equal(payload.turma_pendente.segmentos_pendentes, 1);
  } finally {
    docker(['stop', container]);
  }
});

test('migration completa compila sobre o contrato PostgreSQL vigente', async (t) => {
  assert.equal(fs.existsSync(migrationPath), true, 'migration corretiva ainda nao existe');
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  const container = `la-health-full-migration-${process.pid}`;
  const started = docker([
    'run', '--rm', '--name', container,
    '-e', 'POSTGRES_PASSWORD=postgres',
    '-d', 'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  const performanceColumns = `
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
    papel text, detalhes jsonb,
    score_observado numeric, score_comparavel numeric,
    pilares_validos integer, pilares_esperados integer,
    comparabilidade_estado text, comparabilidade_motivo text,
    competencia_referencia date, score_referencia numeric,
    classificacao_referencia text,
    data_corte date, config_id uuid, regra_fingerprint text,
    peso_pontuavel_total numeric, peso_disponivel_total numeric,
    cobertura_normalizada numeric, cobertura_minima_aplicada numeric,
    comparabilidade_motivos jsonb
  `;

  try {
    await waitForPostgres(container);
    const setup = psql(container, `
      create schema if not exists public;
      create role anon;
      create role authenticated;
      create role service_role;

      create table public.health_score_professor_v3_config_versoes (
        id uuid primary key,
        cobertura_minima numeric,
        pilares_minimos integer,
        faixa_atencao_min numeric,
        faixa_saudavel_min numeric
      );

      create function public.fn_health_score_professor_v3_config_fingerprint_comparabilidade(uuid)
      returns text language sql immutable as $$ select 'fixture'::text $$;

      create function public.avaliar_health_score_professor_v3_comparabilidade(
        numeric, numeric, integer, boolean, numeric, integer, boolean
      ) returns jsonb language sql immutable as $$
        select jsonb_build_object('estado', 'comparavel', 'motivo', 'criterios_atendidos', 'motivos', '[]'::jsonb)
      $$;

      create function public.get_health_score_professor_v3_metricas_periodo(date, uuid, text)
      returns table (
        metrica text, professor_id integer, professor_nome text, unidade_id uuid,
        competencia date, valor_bruto numeric, numerador numeric, denominador numeric,
        amostra integer, estado_base text, publicavel boolean, confianca text,
        fonte text, regra_versao text, motivo_sem_base text, detalhes jsonb
      ) language sql stable as $$ select
        null::text, null::integer, null::text, null::uuid, null::date,
        null::numeric, null::numeric, null::numeric, null::integer, null::text,
        null::boolean, null::text, null::text, null::text, null::text, null::jsonb
        where false
      $$;

      create function public.get_health_score_professor_v3_performance(date, uuid, text)
      returns table (${performanceColumns}) language sql stable as $$
        select
          null::integer, null::uuid, null::text, null::date, null::date, null::text,
          null::date, null::date, null::text, null::text, null::boolean, null::boolean,
          null::integer, null::integer, null::numeric, null::numeric, null::text,
          null::text, null::boolean, null::boolean, null::text, null::text, null::text,
          null::numeric, null::numeric, null::numeric, null::numeric, null::numeric,
          null::boolean, null::numeric, null::numeric, null::numeric, null::integer,
          null::text, null::boolean, null::text, null::text, null::text, null::text,
          null::text, null::text, null::jsonb, null::numeric, null::numeric,
          null::integer, null::integer, null::text, null::text, null::date,
          null::numeric, null::text, null::date, null::uuid, null::text,
          null::numeric, null::numeric, null::numeric, null::numeric, null::jsonb
        where false
      $$;
    `);
    assert.equal(setup.status, 0, setup.stderr || setup.stdout);

    const migration = fs.readFileSync(migrationPath, 'utf8');
    const applied = psql(container, migration);
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);

    const smoke = psql(container, `
      select public.calcular_health_score_professor_v3_cobertura_pilares(3, 5);
    `);
    assert.equal(smoke.status, 0, smoke.stderr || smoke.stdout);
    assert.equal(smoke.stdout.trim(), '60.0');
  } finally {
    docker(['stop', container]);
  }
});
