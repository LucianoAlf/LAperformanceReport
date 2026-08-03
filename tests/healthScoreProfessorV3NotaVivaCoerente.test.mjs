import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  root,
  'supabase/migrations/20260802235000_health_score_v3_nota_viva_coerente.sql',
);
const percentuaisReaisMigrationPath = path.join(
  root,
  'supabase/migrations/20260803002500_health_score_v3_percentuais_reais.sql',
);
const calculatorMigrationPath = path.join(
  root,
  'supabase/migrations/20260802190000_health_score_v3_nota_diagnostica.sql',
);

function readMigration() {
  assert.equal(
    fs.existsSync(migrationPath),
    true,
    'migration da nota viva coerente ainda nao existe',
  );
  return fs.readFileSync(migrationPath, 'utf8');
}

function readPercentuaisReaisMigration() {
  assert.equal(
    fs.existsSync(percentuaisReaisMigrationPath),
    true,
    'migration corretiva dos percentuais reais ainda nao existe',
  );
  return fs.readFileSync(percentuaisReaisMigrationPath, 'utf8');
}

function extractFunction(sql, functionName) {
  const pattern = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}\\(`,
    'i',
  );
  const start = sql.search(pattern);
  assert.notEqual(start, -1, `funcao ${functionName} deve existir`);
  const bodyStart = sql.indexOf('$function$', start);
  assert.notEqual(bodyStart, -1, `inicio de ${functionName} deve existir`);
  const end = sql.indexOf('$function$;', bodyStart + '$function$'.length);
  assert.notEqual(end, -1, `fim de ${functionName} deve existir`);
  return sql.slice(start, end + '$function$;'.length);
}

function docker(args, input) {
  return spawnSync('docker', args, {
    input,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
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

test('competencia viva exibe o score corrente e mantem o anterior apenas como referencia', () => {
  const sql = readMigration();

  assert.match(sql, /create or replace function public\.get_health_score_professor_v3_performance/i);
  assert.match(sql, /get_health_score_professor_v3_projecao_viva\s*\(/i);
  assert.doesNotMatch(sql, /p\.cobertura\s*<\s*p\.cobertura_minima[\s\S]{0,500}r\.score_referencia/i);
  assert.doesNotMatch(sql, /r\.score_referencia\s+as\s+score/i);
  assert.match(sql, /score_competencia_referencia/i);
  assert.match(sql, /score_atual_em_formacao/i);
  assert.doesNotMatch(sql, /update\s+public\.health_score_professor_v3_snapshots/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.health_score_professor_v3_snapshots/i);
});

test('percentuais preservam o valor real e apenas permanencia usa atingimento da meta', async (t) => {
  const probe = docker(['info', '--format', '{{.ServerVersion}}']);
  if (probe.status !== 0) {
    t.skip('Docker indisponivel para o fixture PostgreSQL real');
    return;
  }

  const sql = readPercentuaisReaisMigration();
  const normalizer = extractFunction(
    sql,
    'normalizar_health_score_professor_v3_meta_viva',
  );
  const container = `health-score-v3-nota-viva-${process.pid}`;
  const started = docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres',
    'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    const installed = psql(container, normalizer);
    assert.equal(installed.status, 0, installed.stderr || installed.stdout);

    const result = psql(container, `
      select jsonb_build_object(
        'retencao_abaixo_meta', public.normalizar_health_score_professor_v3_meta_viva('retencao', 81, 90, null),
        'retencao_acima_meta', public.normalizar_health_score_professor_v3_meta_viva('retencao', 100, 90, null),
        'conversao', public.normalizar_health_score_professor_v3_meta_viva('conversao', 35, 70, null),
        'presenca', public.normalizar_health_score_professor_v3_meta_viva('presenca', 60, 80, null),
        'permanencia', public.normalizar_health_score_professor_v3_meta_viva('permanencia', 9, 12, null),
        'media_turma', public.normalizar_health_score_professor_v3_meta_viva('media_turma', 1.2, null, 55),
        'carteira', public.normalizar_health_score_professor_v3_meta_viva('numero_alunos', 34, null, null)
      );
    `);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.deepEqual(JSON.parse(result.stdout.trim()), {
      retencao_abaixo_meta: 81.00,
      retencao_acima_meta: 100.00,
      conversao: 35.00,
      presenca: 60.00,
      permanencia: 75.00,
      media_turma: 55.00,
      carteira: null,
    });
  } finally {
    docker(['stop', container]);
  }
});

test('conversao com amostra minima entra na nota viva e sem amostra permanece diagnostica', () => {
  const sql = readMigration();

  assert.match(sql, /metrica\s*=\s*'conversao'[\s\S]*amostra[\s\S]*amostra_minima/i);
  assert.match(sql, /provisorio_ciclo[\s\S]*em_andamento/i);
  assert.match(sql, /conversao_elegivel/i);
  assert.match(sql, /peso_disponivel_coerente/i);
});

test('score retornado explicita e preserva a identidade com a soma das contribuicoes', () => {
  const sql = readMigration();

  assert.match(sql, /score_igual_soma_contribuicoes/i);
  assert.match(sql, /score_atual_em_formacao/i);
  assert.match(sql, /competencia_anterior/i);
});

test('projecao viva compila e ordena pelo score atual em PostgreSQL real', async (t) => {
  const probe = docker(['info', '--format', '{{.ServerVersion}}']);
  if (probe.status !== 0) {
    t.skip('Docker indisponivel para o fixture PostgreSQL real');
    return;
  }

  const migration = readMigration();
  const percentuaisReaisMigration = readPercentuaisReaisMigration();
  const calculatorSql = fs.readFileSync(calculatorMigrationPath, 'utf8');
  const calculator = extractFunction(
    calculatorSql,
    'calcular_health_score_professor_v3_nota_diagnostica',
  );
  const container = `health-score-v3-projecao-${process.pid}`;
  const started = docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres',
    'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  const unitId = '10000000-0000-0000-0000-000000000001';
  const configId = '20000000-0000-0000-0000-000000000001';
  const fixture = `
    create extension if not exists pgcrypto;
    create schema auth;
    create role anon;
    create role authenticated;
    create role service_role;

    create table public.health_score_professor_v3_config_versoes (
      id uuid primary key,
      versao integer not null,
      status text not null,
      vigencia_inicio date not null,
      vigencia_fim date,
      cobertura_minima numeric not null,
      exige_pilar_fidelizacao boolean not null,
      faixa_atencao_min numeric not null,
      faixa_saudavel_min numeric not null
    );
    insert into public.health_score_professor_v3_config_versoes values (
      '${configId}', 4, 'ativa', '2026-06-01', null, 60, true, 70, 85
    );

    create table public.health_score_professor_v3_config_metricas (
      config_id uuid not null,
      metrica text not null,
      amostra_minima integer,
      primary key (config_id, metrica)
    );
    insert into public.health_score_professor_v3_config_metricas values
      ('${configId}', 'retencao', 10),
      ('${configId}', 'permanencia', 3),
      ('${configId}', 'conversao', 3),
      ('${configId}', 'media_turma', 1),
      ('${configId}', 'numero_alunos', 1),
      ('${configId}', 'presenca', 10);

    create table public.health_score_professor_v3_snapshots (
      id uuid primary key default gen_random_uuid(),
      professor_id integer not null,
      unidade_id uuid,
      escopo text not null,
      competencia date not null,
      trimestre_inicio date not null,
      periodicidade text not null,
      periodo_inicio date not null,
      periodo_fim date not null,
      ciclo_codigo text not null,
      estado_publicacao text not null,
      score_exibivel boolean not null,
      ranking_habilitado boolean not null,
      config_versao integer not null,
      revisao integer not null,
      score numeric,
      cobertura numeric,
      classificacao text,
      estado text not null,
      publicavel boolean not null,
      publicado boolean not null,
      motivo_bloqueio text,
      regra_versao text not null,
      invalidado_em timestamptz,
      criado_em timestamptz not null default now()
    );
    insert into public.health_score_professor_v3_snapshots (
      professor_id, unidade_id, escopo, competencia, trimestre_inicio,
      periodicidade, periodo_inicio, periodo_fim, ciclo_codigo,
      estado_publicacao, score_exibivel, ranking_habilitado, config_versao,
      revisao, score, cobertura, classificacao, estado, publicavel,
      publicado, motivo_bloqueio, regra_versao
    ) values
      (26, '${unitId}', 'unidade', '2026-07-01', '2026-06-01', 'mensal',
       '2026-07-01', '2026-07-31', 'mensal', 'parcial', true, false, 4,
       1, 93.38, 40, 'saudavel', 'provisorio', false, false,
       'fixture', 'fixture-julho'),
      (27, '${unitId}', 'unidade', '2026-07-01', '2026-06-01', 'mensal',
       '2026-07-01', '2026-07-31', 'mensal', 'parcial', true, false, 4,
       1, 83, 65, 'atencao', 'provisorio', false, false,
       'fixture', 'fixture-julho');

    create table public.health_score_professor_v3_snapshot_metricas (
      snapshot_id uuid,
      metrica text,
      valor_bruto numeric,
      numerador numeric,
      denominador numeric,
      nota numeric,
      peso numeric,
      peso_disponivel boolean,
      peso_efetivo numeric,
      contribuicao numeric,
      meta_aplicada numeric,
      amostra integer,
      estado_base text,
      publicavel boolean,
      confianca text,
      fonte text,
      regra_versao text,
      motivo_sem_base text,
      codigo_evidencia text,
      papel text,
      detalhes jsonb
    );

    create function public.fn_health_score_professor_v3_ator_leitura(uuid)
    returns integer language sql stable as $$ select null::integer $$;

    ${calculator}

    create function public.get_health_score_professor_v3_projecao_viva(
      p_competencia date,
      p_unidade_id uuid default null,
      p_periodicidade text default 'mensal'
    ) returns table (
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
    ) language sql stable as $$
      select * from (values
        (26, '${unitId}'::uuid, 'unidade', '2026-08-01'::date, '2026-06-01'::date,
         'mensal', '2026-08-01'::date, '2026-08-31'::date, 'mensal', 'em_andamento',
         true, false, 4, 0, 84.56::numeric, 40::numeric, 'atencao', 'em_andamento',
         false, false, 'competencia_em_andamento', 'fixture-base',
         'retencao', 100::numeric, 4::numeric, 4::numeric, null::numeric, 25::numeric,
         false, 0::numeric, null::numeric, 90::numeric, 4, 'fonte_indisponivel', false,
         'baixa', 'fixture', 'fixture', 'fonte_indisponivel', 'fonte_indisponivel', 'nota', '{}'::jsonb),
        (26, '${unitId}'::uuid, 'unidade', '2026-08-01'::date, '2026-06-01'::date,
         'mensal', '2026-08-01'::date, '2026-08-31'::date, 'mensal', 'em_andamento',
         true, false, 4, 0, 84.56::numeric, 40::numeric, 'atencao', 'em_andamento',
         false, false, 'competencia_em_andamento', 'fixture-base',
         'permanencia', 20.33::numeric, 22::numeric, 22::numeric, 100::numeric, 25::numeric,
         true, 62.5::numeric, 62.5::numeric, 12::numeric, 22, 'ok', true,
         'alta', 'fixture', 'fixture', null, 'evidencia_valida', 'nota', '{}'::jsonb),
        (26, '${unitId}'::uuid, 'unidade', '2026-08-01'::date, '2026-06-01'::date,
         'mensal', '2026-08-01'::date, '2026-08-31'::date, 'mensal', 'em_andamento',
         true, false, 4, 0, 84.56::numeric, 40::numeric, 'atencao', 'em_andamento',
         false, false, 'competencia_em_andamento', 'fixture-base',
         'conversao', 25::numeric, 1::numeric, 4::numeric, null::numeric, 15::numeric,
         false, 0::numeric, null::numeric, 70::numeric, 4, 'provisorio_ciclo', false,
         'provisoria', 'fixture', 'fixture', 'ciclo em andamento', 'professor_em_maturacao', 'nota', '{}'::jsonb),
        (26, '${unitId}'::uuid, 'unidade', '2026-08-01'::date, '2026-06-01'::date,
         'mensal', '2026-08-01'::date, '2026-08-31'::date, 'mensal', 'em_andamento',
         true, false, 4, 0, 84.56::numeric, 40::numeric, 'atencao', 'em_andamento',
         false, false, 'competencia_em_andamento', 'fixture-base',
         'media_turma', 1::numeric, 5::numeric, 5::numeric, 58.82::numeric, 15::numeric,
         true, 37.5::numeric, 22.0575::numeric, null::numeric, 5, 'ok', true,
         'alta', 'fixture', 'fixture', null, 'evidencia_valida', 'nota', '{}'::jsonb),
        (26, '${unitId}'::uuid, 'unidade', '2026-08-01'::date, '2026-06-01'::date,
         'mensal', '2026-08-01'::date, '2026-08-31'::date, 'mensal', 'em_andamento',
         true, false, 4, 0, 84.56::numeric, 40::numeric, 'atencao', 'em_andamento',
         false, false, 'competencia_em_andamento', 'fixture-base',
         'numero_alunos', 5::numeric, 5::numeric, 5::numeric, null::numeric, 10::numeric,
         false, 0::numeric, null::numeric, null::numeric, 5, 'ok', true,
         'alta', 'fixture', 'fixture', null, 'diagnostico_carteira', 'diagnostico', '{}'::jsonb),
        (27, '${unitId}'::uuid, 'unidade', '2026-08-01'::date, '2026-06-01'::date,
         'mensal', '2026-08-01'::date, '2026-08-31'::date, 'mensal', 'em_andamento',
         true, false, 4, 0, 85.57::numeric, 65::numeric, 'saudavel', 'em_andamento',
         false, false, 'competencia_em_andamento', 'fixture-base',
         'retencao', 100::numeric, 21::numeric, 21::numeric, 100::numeric, 25::numeric,
         true, 38.4615::numeric, 38.4615::numeric, 90::numeric, 21, 'ok', true,
         'alta', 'fixture', 'fixture', null, 'evidencia_valida', 'nota', '{}'::jsonb),
        (27, '${unitId}'::uuid, 'unidade', '2026-08-01'::date, '2026-06-01'::date,
         'mensal', '2026-08-01'::date, '2026-08-31'::date, 'mensal', 'em_andamento',
         true, false, 4, 0, 85.57::numeric, 65::numeric, 'saudavel', 'em_andamento',
         false, false, 'competencia_em_andamento', 'fixture-base',
         'permanencia', 11::numeric, 67::numeric, 67::numeric, 91.67::numeric, 25::numeric,
         true, 38.4615::numeric, 35.2577::numeric, 12::numeric, 67, 'ok', true,
         'alta', 'fixture', 'fixture', null, 'evidencia_valida', 'nota', '{}'::jsonb),
        (27, '${unitId}'::uuid, 'unidade', '2026-08-01'::date, '2026-06-01'::date,
         'mensal', '2026-08-01'::date, '2026-08-31'::date, 'mensal', 'em_andamento',
         true, false, 4, 0, 85.57::numeric, 65::numeric, 'saudavel', 'em_andamento',
         false, false, 'competencia_em_andamento', 'fixture-base',
         'conversao', 33.33::numeric, 1::numeric, 3::numeric, null::numeric, 15::numeric,
         false, 0::numeric, null::numeric, 70::numeric, 3, 'provisorio_ciclo', false,
         'provisoria', 'fixture', 'fixture', 'ciclo em andamento', 'professor_em_maturacao', 'nota', '{}'::jsonb),
        (27, '${unitId}'::uuid, 'unidade', '2026-08-01'::date, '2026-06-01'::date,
         'mensal', '2026-08-01'::date, '2026-08-31'::date, 'mensal', 'em_andamento',
         true, false, 4, 0, 85.57::numeric, 65::numeric, 'saudavel', 'em_andamento',
         false, false, 'competencia_em_andamento', 'fixture-base',
         'media_turma', 1.19::numeric, 18::numeric, 18::numeric, 51.35::numeric, 15::numeric,
         true, 23.0769::numeric, 11.85::numeric, null::numeric, 18, 'ok', true,
         'alta', 'fixture', 'fixture', null, 'evidencia_valida', 'nota', '{}'::jsonb),
        (27, '${unitId}'::uuid, 'unidade', '2026-08-01'::date, '2026-06-01'::date,
         'mensal', '2026-08-01'::date, '2026-08-31'::date, 'mensal', 'em_andamento',
         true, false, 4, 0, 85.57::numeric, 65::numeric, 'saudavel', 'em_andamento',
         false, false, 'competencia_em_andamento', 'fixture-base',
         'numero_alunos', 18::numeric, 18::numeric, 18::numeric, null::numeric, 10::numeric,
         false, 0::numeric, null::numeric, null::numeric, 18, 'ok', true,
         'alta', 'fixture', 'fixture', null, 'diagnostico_carteira', 'diagnostico', '{}'::jsonb)
      ) as v(
        professor_id, unidade_id, escopo, competencia, trimestre_inicio,
        periodicidade, periodo_inicio, periodo_fim, ciclo_codigo,
        estado_publicacao, score_exibivel, ranking_habilitado, config_versao,
        revisao, score, cobertura, classificacao, estado, snapshot_publicavel,
        publicado, motivo_bloqueio, regra_versao_snapshot, metrica, valor_bruto,
        numerador, denominador, nota, peso, peso_disponivel, peso_efetivo,
        contribuicao, meta, amostra, estado_base, metrica_publicavel, confianca,
        fonte, regra_versao_metrica, motivo_sem_base, codigo_evidencia, papel,
        detalhes
      );
    $$;
  `;

  try {
    await waitForPostgres(container);
    const installed = psql(container, fixture);
    assert.equal(installed.status, 0, installed.stderr || installed.stdout);

    const applied = psql(container, migration);
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);
    const corrected = psql(container, percentuaisReaisMigration);
    assert.equal(corrected.status, 0, corrected.stderr || corrected.stdout);

    const result = psql(container, `
      with desempenho as (
        select
          professor_id,
          max(score) as score,
          max((detalhes ->> 'score_referencia')::numeric) as score_referencia,
          max((detalhes ->> 'score_igual_soma_contribuicoes')::boolean::int) as identidade,
          max(case when metrica = 'conversao' then peso_disponivel::int else 0 end) as conversao_pontua,
          max(case when metrica = 'numero_alunos' then peso_disponivel::int else 0 end) as carteira_pontua
        from public.get_health_score_professor_v3_performance(
          '2026-08-01', '${unitId}', 'mensal'
        )
        group by professor_id
      )
      select jsonb_agg(to_jsonb(d) order by score desc) from desempenho d;
    `);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const rows = JSON.parse(result.stdout.trim());

    assert.deepEqual(rows.map((row) => row.professor_id), [27, 26]);
    assert.equal(rows.find((row) => row.professor_id === 26).score_referencia, 93.38);
    assert.notEqual(rows.find((row) => row.professor_id === 26).score, 93.38);
    assert.equal(rows.every((row) => row.identidade === 1), true);
    assert.equal(rows.every((row) => row.conversao_pontua === 1), true);
    assert.equal(rows.every((row) => row.carteira_pontua === 0), true);
  } finally {
    docker(['stop', container]);
  }
});
