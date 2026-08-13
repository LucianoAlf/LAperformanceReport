import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'supabase/migrations');
const pinnedCronMigrationName =
  '20260808193000_health_score_v3_cron_diario_idempotente.sql';
const pinnedCloseMigrationName =
  '20260719203100_health_score_v3_metricas_segmentadas_hardening.sql';
const currentCronPath = path.join(
  migrationsDir,
  pinnedCronMigrationName,
);
const currentClosePath = path.join(
  migrationsDir,
  pinnedCloseMigrationName,
);

const pinnedDefinitions = [
  ['fingerprint_health_score_professor_v3_escopo', pinnedCronMigrationName],
  ['materializar_health_score_professor_v3_escopo_diario', pinnedCronMigrationName],
  ['executar_health_score_professor_v3_escopo_diario', pinnedCronMigrationName],
  ['executar_health_score_professor_v3_cron_diario', pinnedCronMigrationName],
  ['fechar_health_score_professor_v3_ciclo', pinnedCloseMigrationName],
];
const expectedMissingMetrics = ['permanencia', 'retencao'];

const unitId = '10000000-0000-0000-0000-000000000001';
const healthyUnitId = '10000000-0000-0000-0000-000000000002';
const absentUnitId = '10000000-0000-0000-0000-000000000003';
const configId = '20000000-0000-0000-0000-000000000001';
const inconsistentConfigId = '20000000-0000-0000-0000-000000000002';
const cycleSnapshotId = '30000000-0000-0000-0000-000000000001';

const performanceReturn = `
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
const performanceColumns = performanceReturn
  .split(',')
  .map((definition) => definition.trim().split(/\s+/u)[0])
  .join(', ');

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
  let consecutiveReadyChecks = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const ready = psql(container, 'select 1;');
    if (ready.status === 0) {
      consecutiveReadyChecks += 1;
      if (consecutiveReadyChecks === 2) return;
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
    'iu',
  ));
  assert.notEqual(start, -1, `funcao ${functionName} deve existir na migration atual`);

  const taggedStart = sql.indexOf('$function$', start);
  const plainStart = sql.indexOf('$$', start);
  const delimiter = taggedStart !== -1 && (plainStart === -1 || taggedStart < plainStart)
    ? '$function$'
    : '$$';
  const bodyStart = sql.indexOf(delimiter, start);
  const end = sql.indexOf(`${delimiter};`, bodyStart + delimiter.length);
  assert.notEqual(bodyStart, -1, `corpo de ${functionName} deve existir`);
  assert.notEqual(end, -1, `fim de ${functionName} deve existir`);
  return sql.slice(start, end + `${delimiter};`.length);
}

function extractFunctionAcl(sql, functionName) {
  const functionPattern = new RegExp(
    `on\\s+function\\s+public\\.${functionName}\\s*\\(`,
    'iu',
  );
  return [...sql.matchAll(/\b(?:revoke|grant)\s+[\s\S]*?;/giu)]
    .map(([statement]) => statement)
    .filter((statement) => functionPattern.test(statement))
    .join('\n');
}

function localFunctionDefinitions(functionName) {
  const definitionPattern = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}\\s*\\(`,
    'iu',
  );
  return fs.readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .filter((name) => definitionPattern.test(
      fs.readFileSync(path.join(migrationsDir, name), 'utf8'),
    ))
    .sort();
}

function discoverCorrectiveMigrationNames() {
  const discovered = new Set();
  for (const [functionName, pinnedMigrationName] of pinnedDefinitions) {
    const definitions = localFunctionDefinitions(functionName);
    const pinnedIndex = definitions.indexOf(pinnedMigrationName);
    assert.notEqual(
      pinnedIndex,
      -1,
      `${functionName} deve continuar ancorada em ${pinnedMigrationName}`,
    );
    for (const migrationName of definitions.slice(pinnedIndex + 1)) {
      assert.match(
        migrationName,
        /^\d{14}_.+\.sql$/u,
        'migration corretiva deve ter nome gerado pelo Supabase CLI',
      );
      discovered.add(migrationName);
    }
  }
  return [...discovered].sort();
}

function assertPinnedDefinitionsAreCurrent(correctiveMigrationNames) {
  for (const [functionName, pinnedMigrationName] of pinnedDefinitions) {
    const definitions = localFunctionDefinitions(functionName);
    assert.ok(
      definitions.includes(pinnedMigrationName),
      `${functionName} deve continuar ancorada em ${pinnedMigrationName}`,
    );
    assert.ok(
      definitions.at(-1) === pinnedMigrationName
        || correctiveMigrationNames.includes(definitions.at(-1)),
      `fixture desatualizada: ${functionName} foi redefinida por ${definitions.at(-1)}`,
    );
  }
}

function directMaterializerLockContract() {
  const definitionName = localFunctionDefinitions(
    'materializar_health_score_professor_v3_escopo_diario',
  ).at(-1);
  const definition = extractFunction(
    fs.readFileSync(path.join(migrationsDir, definitionName), 'utf8'),
    'materializar_health_score_professor_v3_escopo_diario',
  ).toLowerCase();
  const lockIndex = definition.indexOf('pg_advisory_xact_lock');
  const captureIndex = definition.indexOf('get_health_score_professor_v3_performance');
  const revisionIndex = definition.indexOf('max(s.revisao)');
  return {
    lock_before_capture: lockIndex !== -1
      && captureIndex !== -1
      && lockIndex < captureIndex,
    lock_before_revision: lockIndex !== -1
      && revisionIndex !== -1
      && lockIndex < revisionIndex,
  };
}

function cycleCloseLockContract() {
  const definitionName = localFunctionDefinitions(
    'fechar_health_score_professor_v3_ciclo',
  ).at(-1);
  const definition = extractFunction(
    fs.readFileSync(path.join(migrationsDir, definitionName), 'utf8'),
    'fechar_health_score_professor_v3_ciclo',
  ).toLowerCase();
  const seriesIndex = definition.indexOf('generate_series');
  const startIndex = definition.indexOf('v_ciclo.data_inicio', seriesIndex);
  const endIndex = definition.indexOf('v_ciclo.data_fim', seriesIndex);
  const orderIndex = definition.indexOf('order by competencia', seriesIndex);
  const lockIndex = definition.indexOf('pg_advisory_xact_lock', seriesIndex);
  const cycleKeyIndex = definition.indexOf("|| ':ciclo'", lockIndex);
  const rosterValidationIndex = definition.indexOf('with roster_unidade');
  const candidatesIndex = definition.indexOf('with candidatos');
  return {
    complete_month_series: seriesIndex !== -1
      && startIndex > seriesIndex
      && endIndex > startIndex,
    ordered_before_lock: orderIndex > seriesIndex && lockIndex > orderIndex,
    cycle_materializer_key: cycleKeyIndex > lockIndex,
    lock_before_roster_and_candidates: lockIndex !== -1
      && rosterValidationIndex > lockIndex
      && candidatesIndex > rosterValidationIndex,
  };
}

function readStrictIncompleteProfessors(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (!Object.hasOwn(payload, 'professores_incompletos')) return null;
  const value = payload.professores_incompletos;
  const valid = Array.isArray(value) && value.every((item) => (
    item !== null
    && typeof item === 'object'
    && !Array.isArray(item)
    && JSON.stringify(Object.keys(item).sort())
      === JSON.stringify(['metricas_ausentes', 'professor_id'])
    && Number.isInteger(item.professor_id)
    && Array.isArray(item.metricas_ausentes)
    && item.metricas_ausentes.every((metric) => typeof metric === 'string')
    && JSON.stringify(item.metricas_ausentes)
      === JSON.stringify([...item.metricas_ausentes].sort())
  ));
  return valid ? value : { schema_invalido: true, valor: value };
}

function readStrictInconsistentConfigurations(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (!Object.hasOwn(payload, 'professores_configuracao_inconsistente')) return null;
  const value = payload.professores_configuracao_inconsistente;
  const valid = Array.isArray(value) && value.every((item) => (
    item !== null
    && typeof item === 'object'
    && !Array.isArray(item)
    && JSON.stringify(Object.keys(item).sort())
      === JSON.stringify(['config_ids', 'config_versoes', 'professor_id'])
    && Number.isInteger(item.professor_id)
    && Array.isArray(item.config_ids)
    && item.config_ids.every((id) => typeof id === 'string')
    && JSON.stringify(item.config_ids) === JSON.stringify([...item.config_ids].sort())
    && Array.isArray(item.config_versoes)
    && item.config_versoes.every((version) => Number.isInteger(version))
    && JSON.stringify(item.config_versoes)
      === JSON.stringify([...item.config_versoes].sort((a, b) => a - b))
  ));
  return valid ? value : { schema_invalido: true, valor: value };
}

const fixture = `
  create extension if not exists pgcrypto;
  create extension if not exists dblink;
  create schema auth;
  create role anon;
  create role authenticated;
  create role service_role;
  create function auth.role() returns text language sql stable
    as $$ select 'service_role'::text $$;

  create table public.unidades (
    id uuid primary key,
    nome text not null,
    ativo boolean not null
  );
  create table public.professores (
    id integer primary key,
    nome text not null,
    ativo boolean not null
  );
  create table public.professores_unidades (
    professor_id integer not null,
    unidade_id uuid not null,
    emusys_ativo boolean not null,
    validacao_status text not null,
    primary key (professor_id, unidade_id)
  );
  create table public.health_score_professor_v3_config_versoes (
    id uuid primary key,
    versao integer not null,
    status text not null,
    vigencia_inicio date not null,
    vigencia_fim date,
    cobertura_minima numeric not null,
    faixa_atencao_min numeric not null,
    faixa_saudavel_min numeric not null
  );
  create table public.health_score_professor_v3_config_metricas (
    id uuid primary key default gen_random_uuid(),
    config_id uuid not null,
    metrica text not null,
    peso numeric not null,
    meta numeric,
    parametros jsonb not null default '{}'::jsonb,
    unique (config_id, metrica)
  );
  create table public.health_score_professor_v3_snapshots (
    id uuid primary key default gen_random_uuid(),
    professor_id integer not null,
    escopo text not null,
    unidade_id uuid,
    competencia date not null,
    trimestre_inicio date not null,
    revisao integer not null,
    estado text not null,
    config_id uuid not null,
    config_versao integer not null,
    score numeric,
    cobertura numeric not null,
    classificacao text,
    publicavel boolean not null,
    publicado boolean not null,
    motivo_bloqueio text,
    regra_versao text not null,
    snapshot_anterior_id uuid,
    justificativa_retificacao text,
    criado_por integer,
    criado_em timestamptz not null default now(),
    fechado_em timestamptz,
    periodicidade text not null,
    periodo_inicio date not null,
    periodo_fim date not null,
    ciclo_codigo text not null,
    estado_publicacao text not null,
    score_exibivel boolean not null,
    ranking_habilitado boolean not null,
    unique (professor_id, escopo, unidade_id, competencia, periodicidade, revisao)
  );
  create table public.health_score_professor_v3_snapshot_metricas (
    id uuid primary key default gen_random_uuid(),
    snapshot_id uuid not null references public.health_score_professor_v3_snapshots(id),
    metrica text not null,
    valor_bruto numeric,
    numerador numeric,
    denominador numeric,
    amostra integer,
    estado_base text not null,
    publicavel boolean not null,
    confianca text not null,
    fonte text not null,
    regra_versao text not null,
    motivo_sem_base text,
    detalhes jsonb not null default '{}'::jsonb,
    nota numeric,
    peso numeric not null,
    peso_disponivel boolean not null,
    contribuicao numeric,
    meta_aplicada numeric,
    peso_efetivo numeric,
    codigo_evidencia text,
    papel text,
    unique (snapshot_id, metrica)
  );
  create table public.health_score_professor_v3_ciclos (
    id uuid primary key default gen_random_uuid(),
    codigo text not null unique,
    data_inicio date not null,
    data_fim date not null,
    estado text not null,
    publicacao_oficial boolean not null,
    ranking_habilitado boolean not null,
    fechado_em timestamptz,
    fechado_por integer,
    justificativa_fechamento text
  );
  create table public.health_score_professor_v3_materializacao_execucoes (
    id uuid primary key default gen_random_uuid(),
    competencia date not null,
    periodicidade text not null check (periodicidade = 'mensal'),
    escopo text not null check (escopo in ('unidade', 'consolidado')),
    unidade_id uuid,
    fingerprint_fonte text not null,
    status text not null check (status in ('iniciada', 'baseline_adotado', 'materializado', 'sem_alteracao', 'erro')),
    snapshot_ids jsonb not null default '[]'::jsonb,
    snapshots_criados integer not null default 0,
    erro text,
    iniciado_em timestamptz not null default now(),
    finalizado_em timestamptz,
    executado_por text not null default session_user
  );
  create table public.fixture_health_score_v3_produtor_contador (
    singleton boolean primary key default true check (singleton),
    chamadas integer not null check (chamadas >= 0)
  );
  insert into public.fixture_health_score_v3_produtor_contador (chamadas) values (0);
  create table public.fixture_health_score_v3_fonte_capturada (
    invocacao_id integer not null,
    professor_id integer not null,
    metrica text not null,
    payload jsonb not null,
    primary key (invocacao_id, professor_id, metrica)
  );
  create type public.fixture_health_score_v3_performance_row as (${performanceReturn});

  insert into public.unidades values
    ('${unitId}', 'Unidade Sintetica Incompleta', true),
    ('${healthyUnitId}', 'Unidade Sintetica Saudavel', true),
    ('${absentUnitId}', 'Unidade Ativa Sem Snapshot', true);
  insert into public.professores values
    (201, 'Professor Valido Um', true),
    (202, 'Professor Incompleto', true),
    (203, 'Professor Valido Dois', true),
    (204, 'Professor Sem Linha na Fonte', true),
    (205, 'Professor Em Maturacao', true),
    (206, 'Professor Configuracao Misturada', true),
    (301, 'Professor Roster Saudavel', true),
    (401, 'Professor Unidade Ausente', true);
  insert into public.professores_unidades values
    (201, '${unitId}', true, 'validado'),
    (202, '${unitId}', true, 'validado'),
    (203, '${unitId}', true, 'validado'),
    (204, '${unitId}', true, 'validado'),
    (205, '${unitId}', true, 'validado'),
    (206, '${unitId}', true, 'validado'),
    (301, '${healthyUnitId}', true, 'validado'),
    (401, '${absentUnitId}', true, 'validado');
  insert into public.health_score_professor_v3_config_versoes values
    ('${configId}', 4, 'ativa', date '2026-08-01', null, 60, 70, 85),
    ('${inconsistentConfigId}', 5, 'rascunho', date '2026-08-01', null, 60, 70, 85);
  insert into public.health_score_professor_v3_config_metricas
    (config_id, metrica, peso, meta, parametros)
  values
    ('${configId}', 'retencao', 25, 90, '{"papel":"nota"}'),
    ('${configId}', 'permanencia', 25, 12, '{"papel":"nota"}'),
    ('${configId}', 'conversao', 15, 70, '{"papel":"nota"}'),
    ('${configId}', 'media_turma', 15, 80, '{"papel":"nota"}'),
    ('${configId}', 'numero_alunos', 10, 25, '{"papel":"diagnostico"}'),
    ('${configId}', 'presenca', 10, 80, '{"papel":"nota"}');

  create function public.fn_health_score_professor_v3_ator_gerenciador()
  returns integer language sql stable as $$ select 999::integer $$;

  -- 204 tem zero linhas; 205 possui seis linhas, mas permanece em maturacao;
  -- 206 mistura duas configuracoes dentro da mesma captura.
  create function public.get_health_score_professor_v3_performance(
    p_competencia date, p_unidade_id uuid, p_periodicidade text
  ) returns table (${performanceReturn})
  language plpgsql volatile set search_path = public, pg_temp
  as $$
  declare
    v_invocacao_id integer;
  begin
    select chamada
    into v_invocacao_id
    from dblink(
      'dbname=postgres',
      'update public.fixture_health_score_v3_produtor_contador '
        || 'set chamadas = chamadas + 1 returning chamadas'
    ) as contador(chamada integer);
    return query
    with roster(professor_id, metricas) as (
      values
        (201, array['retencao','permanencia','conversao','media_turma','numero_alunos','presenca']::text[]),
        (202, array['conversao','media_turma','numero_alunos','presenca']::text[]),
        (203, array['retencao','permanencia','conversao','media_turma','numero_alunos','presenca']::text[]),
        (205, array['retencao','permanencia','conversao','media_turma','numero_alunos','presenca']::text[]),
        (206, array['retencao','permanencia','conversao','media_turma','numero_alunos','presenca']::text[])
    ), base as (
      select r.professor_id, m.metrica, m.peso, m.meta,
        coalesce(m.parametros->>'papel', 'nota') as papel,
        cardinality(r.metricas) - 1 as pilares_validos
      from roster r
      cross join lateral unnest(r.metricas) x(metrica)
      join public.health_score_professor_v3_config_metricas m
        on m.config_id = '${configId}' and m.metrica = x.metrica
    ), fonte (${performanceColumns}) as (
    select
      b.professor_id, p_unidade_id,
      case when p_unidade_id is null then 'consolidado' else 'unidade' end,
      date_trunc('month', p_competencia)::date,
      date_trunc('quarter', p_competencia)::date,
      p_periodicidade,
      date_trunc('month', p_competencia)::date,
      (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date,
      to_char(p_competencia, 'YYYY-MM'), 'em_andamento',
      b.professor_id <> 205, false,
      case when b.professor_id = 206 and b.metrica in ('retencao', 'permanencia', 'conversao')
        then 5 else 4 end,
      0,
      case when b.professor_id = 205 then 72::numeric else 90::numeric end,
      case when b.professor_id = 205 then 40::numeric else 100::numeric end,
      case when b.professor_id in (202, 205) then null else 'saudavel' end,
      case when b.professor_id in (202, 205) then 'em_maturacao' else 'provisorio' end,
      false, false,
      case
        when b.professor_id = 202 then 'pilares_insuficientes'
        when b.professor_id = 205 then 'cobertura_insuficiente'
        else null
      end,
      'fixture-produtor',
      b.metrica,
      case when b.metrica = 'numero_alunos' then 20::numeric else 90::numeric end,
      case when b.metrica = 'numero_alunos' then 20::numeric else 9::numeric end,
      case when b.metrica = 'numero_alunos' then null::numeric else 10::numeric end,
      case when b.metrica = 'numero_alunos' then null::numeric else 90::numeric end,
      b.peso,
      b.papel = 'nota' and (
        b.professor_id <> 205 or b.metrica in ('conversao', 'presenca')
      ),
      case
        when b.papel = 'nota' and (
          b.professor_id <> 205 or b.metrica in ('conversao', 'presenca')
        ) then round(b.peso * 100 / 90, 4)
        else 0
      end,
      case
        when b.papel = 'nota' and (
          b.professor_id <> 205 or b.metrica in ('conversao', 'presenca')
        ) then 90 * b.peso / 100
        else null
      end,
      b.meta, 20, 'ok', true, 'alta', 'fixture_sintetica',
      'fixture-produtor', null, 'evidencia_valida', b.papel, '{}'::jsonb,
      case when b.professor_id = 205 then 72::numeric else 90::numeric end,
      case when b.professor_id in (202, 205) then null else 90::numeric end,
      case when b.professor_id = 205 then 2 else b.pilares_validos end,
      case when b.professor_id in (202, 205) then 5 else 5 end,
      case when b.professor_id in (202, 205) then 'em_maturacao' else 'comparavel' end,
      case
        when b.professor_id = 202 then 'pilares_insuficientes'
        when b.professor_id = 205 then 'cobertura_insuficiente'
        else null
      end,
      null::date, null::numeric, null::text,
      current_date,
      case when b.professor_id = 206 and b.metrica in ('retencao', 'permanencia', 'conversao')
        then '${inconsistentConfigId}'::uuid else '${configId}'::uuid end,
      'fixture-produtor',
      case when b.professor_id in (202, 205) then 40::numeric else 90::numeric end,
      case when b.professor_id in (202, 205) then 25::numeric else 90::numeric end,
      case when b.professor_id in (202, 205) then 40::numeric else 100::numeric end,
      60::numeric,
      case
        when b.professor_id = 202 then '["pilares_insuficientes"]'::jsonb
        when b.professor_id = 205 then '["cobertura_insuficiente"]'::jsonb
        else '[]'::jsonb
      end
    from base b
    ), capturada as (
      insert into public.fixture_health_score_v3_fonte_capturada (
        invocacao_id, professor_id, metrica, payload
      )
      select v_invocacao_id, f.professor_id, f.metrica, to_jsonb(f)
      from fonte f
      returning payload
    )
    select (jsonb_populate_record(
      null::public.fixture_health_score_v3_performance_row,
      c.payload
    )).* from capturada c;
  end;
  $$;

  -- Um candidato aparentemente apto em escopo cujo roster oficial esta incompleto.
  insert into public.health_score_professor_v3_ciclos
    (codigo, data_inicio, data_fim, estado, publicacao_oficial, ranking_habilitado)
  values
    ('fixture-ciclo-incompleto', date '1999-01-01', date '2000-01-01', 'aberto', false, false),
    ('fixture-ciclo-saudavel', date '2000-01-01', date '2001-01-01', 'aberto', false, false);
  insert into public.health_score_professor_v3_snapshots (
    id, professor_id, escopo, unidade_id, competencia, trimestre_inicio,
    revisao, estado, config_id, config_versao, score, cobertura,
    classificacao, publicavel, publicado, regra_versao, periodicidade,
    periodo_inicio, periodo_fim, ciclo_codigo, estado_publicacao,
    score_exibivel, ranking_habilitado
  ) values (
    '${cycleSnapshotId}', 201, 'unidade', '${unitId}', date '2000-01-01',
    date '2000-01-01', 1, 'provisorio', '${configId}', 4, 90, 100,
    'saudavel', false, false, 'fixture-ciclo-incompleto', 'ciclo', date '1999-01-01',
    date '2000-01-01', 'fixture-ciclo-incompleto', 'parcial', true, false
  );

  -- Controle positivo global: todas as unidades ativas e o consolidado estao
  -- retratados. No ciclo incompleto, a unidade 3 permanece com zero snapshots.
  insert into public.health_score_professor_v3_snapshots (
    professor_id, escopo, unidade_id, competencia, trimestre_inicio,
    revisao, estado, config_id, config_versao, score, cobertura,
    classificacao, publicavel, publicado, regra_versao, periodicidade,
    periodo_inicio, periodo_fim, ciclo_codigo, estado_publicacao,
    score_exibivel, ranking_habilitado
  )
  with roster_unidade(professor_id, unidade_id) as (values
    (201, '${unitId}'::uuid),
    (202, '${unitId}'::uuid),
    (203, '${unitId}'::uuid),
    (204, '${unitId}'::uuid),
    (205, '${unitId}'::uuid),
    (206, '${unitId}'::uuid),
    (301, '${healthyUnitId}'::uuid),
    (401, '${absentUnitId}'::uuid)
  ), roster_global as (
    select professor_id, 'unidade'::text as escopo, unidade_id
    from roster_unidade
    union all
    select distinct professor_id, 'consolidado'::text, null::uuid
    from roster_unidade
  )
  select
    professor_id, escopo, unidade_id, date '2001-01-01', date '2001-01-01',
    1, 'provisorio', '${configId}', 4, 90, 100, 'saudavel', false, false,
    'fixture-ciclo-saudavel', 'ciclo', date '2000-01-01', date '2001-01-01',
    'fixture-ciclo-saudavel', 'parcial', true, false
  from roster_global;

  insert into public.health_score_professor_v3_snapshot_metricas (
    snapshot_id, metrica, valor_bruto, numerador, denominador, amostra,
    estado_base, publicavel, confianca, fonte, regra_versao, detalhes,
    nota, peso, peso_disponivel, contribuicao, meta_aplicada,
    peso_efetivo, codigo_evidencia, papel
  )
  select s.id, m.metrica,
    case when m.metrica = 'numero_alunos' then 20 else 90 end,
    9, 10, 20, 'ok', true, 'alta', 'fixture_sintetica', s.ciclo_codigo,
    '{"apta_oficial":true}'::jsonb,
    case when m.metrica = 'numero_alunos' then null else 90 end,
    m.peso, m.metrica <> 'numero_alunos',
    case when m.metrica = 'numero_alunos' then null else 9 end,
    m.meta,
    case when m.metrica = 'numero_alunos'
      then (s.professor_id % 10)::numeric / 100
      else m.peso + (s.professor_id % 10)::numeric / 100
    end,
    format('evidencia-%s-%s', s.professor_id, m.metrica),
    coalesce(m.parametros->>'papel', 'nota')
  from public.health_score_professor_v3_snapshots s
  cross join public.health_score_professor_v3_config_metricas m
  where m.config_id = '${configId}'
    and s.periodicidade = 'ciclo';
`;

function runJson(container, sql) {
  const result = psql(container, sql);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const jsonLine = result.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .reverse()
    .find((line) => line.startsWith('{') || line.startsWith('['));
  assert.ok(jsonLine, `consulta deve devolver JSON: ${result.stdout}`);
  return JSON.parse(jsonLine);
}

test('PostgreSQL materializa parcialmente sem duplicar produtor e mantem fechamento estrito', { timeout: 120_000 }, async (t) => {
  const correctiveMigrationNames = discoverCorrectiveMigrationNames();
  assertPinnedDefinitionsAreCurrent(correctiveMigrationNames);
  assert.equal(fs.existsSync(currentCronPath), true, 'migration atual do cron deve existir');
  assert.equal(fs.existsSync(currentClosePath), true, 'migration atual do fechamento deve existir');
  const dockerInfo = docker(['version', '--format', '{{.Server.Version}}']);
  if (dockerInfo.status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  const container = `la-health-v3-resiliente-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres',
    'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    const prepared = psql(container, fixture);
    assert.equal(prepared.status, 0, prepared.stderr || prepared.stdout);

    const cronSql = fs.readFileSync(currentCronPath, 'utf8');
    const closeSql = fs.readFileSync(currentClosePath, 'utf8');
    const cronFunctionNames = [
      'fingerprint_health_score_professor_v3_escopo',
      'materializar_health_score_professor_v3_escopo_diario',
      'executar_health_score_professor_v3_escopo_diario',
      'executar_health_score_professor_v3_cron_diario',
    ];
    const currentFunctions = [
      ...cronFunctionNames.flatMap((functionName) => [
        extractFunction(cronSql, functionName),
        extractFunctionAcl(cronSql, functionName),
      ]),
      extractFunction(closeSql, 'fechar_health_score_professor_v3_ciclo'),
      extractFunctionAcl(closeSql, 'fechar_health_score_professor_v3_ciclo'),
    ].join('\n');
    const installed = psql(container, currentFunctions);
    assert.equal(installed.status, 0, installed.stderr || installed.stdout);

    const zeroSafeCounter = Number(psql(container, `
      select chamadas from public.fixture_health_score_v3_produtor_contador;
    `).stdout.trim());
    assert.equal(zeroSafeCounter, 0, 'contador deve representar zero chamadas sem coercao');

    const producerSmoke = runJson(container, `
      with fonte as materialized (
        select *
        from public.get_health_score_professor_v3_performance(
          date_trunc('month', current_date)::date, '${unitId}'::uuid, 'mensal'
        )
      ), catalogo as (
        select c.metrica
        from public.health_score_professor_v3_config_metricas c
        where c.config_id = '${configId}'::uuid
      ), ausentes_202 as (
        select coalesce(jsonb_agg(c.metrica order by c.metrica), '[]'::jsonb) as metricas
        from catalogo c
        where not exists (
            select 1 from fonte f
            where f.professor_id = 202 and f.metrica = c.metrica
          )
      ), ausentes_204 as (
        select coalesce(jsonb_agg(c.metrica order by c.metrica), '[]'::jsonb) as metricas
        from catalogo c
        where not exists (
          select 1 from fonte f
          where f.professor_id = 204 and f.metrica = c.metrica
        )
      )
      select jsonb_build_object(
        'linhas', (select count(*) from fonte),
        'metricas_ausentes_202', (select metricas from ausentes_202),
        'metricas_ausentes_204', (select metricas from ausentes_204),
        'config_ids_206', (
          select jsonb_agg(distinct f.config_id order by f.config_id)
          from fonte f where f.professor_id = 206
        ),
        'config_versoes_206', (
          select jsonb_agg(distinct f.config_versao order by f.config_versao)
          from fonte f where f.professor_id = 206
        ),
        'autoridade_205', (
          select jsonb_build_object(
            'score_observado', min(f.score_observado),
            'score_comparavel', min(f.score_comparavel),
            'classificacao', min(f.classificacao),
            'estado', min(f.estado),
            'comparabilidade_estado', min(f.comparabilidade_estado),
            'motivo_bloqueio', min(f.motivo_bloqueio),
            'score_exibivel', bool_or(f.score_exibivel)
          ) from fonte f where f.professor_id = 205
        )
      )::text;
    `);
    assert.deepEqual(producerSmoke, {
      linhas: 28,
      metricas_ausentes_202: expectedMissingMetrics,
      metricas_ausentes_204: [
        'conversao', 'media_turma', 'numero_alunos',
        'permanencia', 'presenca', 'retencao',
      ],
      config_ids_206: [configId, inconsistentConfigId],
      config_versoes_206: [4, 5],
      autoridade_205: {
        score_observado: 72,
        score_comparavel: null,
        classificacao: null,
        estado: 'em_maturacao',
        comparabilidade_estado: 'em_maturacao',
        motivo_bloqueio: 'cobertura_insuficiente',
        score_exibivel: false,
      },
    }, 'fixture deve separar ausencia, maturacao e configuracao inconsistente');
    const resetInstrumentation = psql(container, `
      truncate public.fixture_health_score_v3_fonte_capturada;
      update public.fixture_health_score_v3_produtor_contador set chamadas = 0;
    `);
    assert.equal(
      resetInstrumentation.status,
      0,
      resetInstrumentation.stderr || resetInstrumentation.stdout,
    );

    for (const migrationName of correctiveMigrationNames) {
      const migrationPath = path.join(migrationsDir, migrationName);
      const corrected = psql(container, fs.readFileSync(migrationPath, 'utf8'));
      assert.equal(corrected.status, 0, corrected.stderr || corrected.stdout);
    }

    const securityContract = runJson(container, `
      with funcoes(nome, assinatura) as (
        values
          ('fingerprint', 'public.fingerprint_health_score_professor_v3_escopo(date,text,text,uuid)'),
          ('materializador', 'public.materializar_health_score_professor_v3_escopo_diario(date,text,text,uuid)'),
          ('executor', 'public.executar_health_score_professor_v3_escopo_diario(date,text,text,uuid)'),
          ('cron', 'public.executar_health_score_professor_v3_cron_diario()'),
          ('fechamento', 'public.fechar_health_score_professor_v3_ciclo(text,text)')
      )
      select jsonb_object_agg(f.nome, jsonb_build_object(
        'security_definer', p.prosecdef,
        'search_path', coalesce((
          select configuracao
          from unnest(p.proconfig) configuracao
          where configuracao like 'search_path=%'
          limit 1
        ), ''),
        'anon', has_function_privilege('anon', f.assinatura, 'EXECUTE'),
        'authenticated', has_function_privilege('authenticated', f.assinatura, 'EXECUTE'),
        'service_role', has_function_privilege('service_role', f.assinatura, 'EXECUTE')
      ))::text
      from funcoes f
      join pg_proc p on p.oid = f.assinatura::regprocedure;
    `);
    assert.deepEqual(securityContract, {
      fingerprint: {
        security_definer: true,
        search_path: 'search_path=public, pg_temp',
        anon: false,
        authenticated: false,
        service_role: true,
      },
      materializador: {
        security_definer: true,
        search_path: 'search_path=public, pg_temp',
        anon: false,
        authenticated: false,
        service_role: true,
      },
      executor: {
        security_definer: true,
        search_path: 'search_path=public, pg_temp',
        anon: false,
        authenticated: false,
        service_role: false,
      },
      cron: {
        security_definer: true,
        search_path: 'search_path=public, pg_temp',
        anon: false,
        authenticated: false,
        service_role: true,
      },
      fechamento: {
        security_definer: true,
        search_path: 'search_path=public, pg_temp',
        anon: false,
        authenticated: true,
        service_role: true,
      },
    }, 'migration corretiva deve preservar definer, search_path e ACLs atuais');

    const executionSql = `
      select public.executar_health_score_professor_v3_escopo_diario(
        date_trunc('month', current_date)::date,
        'mensal', 'unidade', '${unitId}'::uuid
      )::text;
    `;
    const first = runJson(container, executionSql);
    const callsAfterFirst = Number(psql(
      container,
      'select chamadas from public.fixture_health_score_v3_produtor_contador;',
    ).stdout.trim());
    const snapshotsAfterFirst = Number(psql(container, `
      select count(*) from public.health_score_professor_v3_snapshots
      where periodicidade = 'mensal';
    `).stdout.trim());

    const second = runJson(container, executionSql);
    const callsAfterSecond = Number(psql(
      container,
      'select chamadas from public.fixture_health_score_v3_produtor_contador;',
    ).stdout.trim());
    const snapshotsAfterSecond = Number(psql(container, `
      select count(*) from public.health_score_professor_v3_snapshots
      where periodicidade = 'mensal';
    `).stdout.trim());

    const sourceCaptureContract = runJson(container, `
      with capturas as (
        select
          invocacao_id,
          count(*)::integer as linhas,
          md5(jsonb_agg(payload order by professor_id, metrica)::text) as fingerprint
        from public.fixture_health_score_v3_fonte_capturada
        group by invocacao_id
      ), execucoes as (
        select
          row_number() over (order by iniciado_em, id)::integer as invocacao_id,
          fingerprint_fonte
        from public.health_score_professor_v3_materializacao_execucoes
        where competencia = date_trunc('month', current_date)::date
          and periodicidade = 'mensal'
          and escopo = 'unidade'
          and unidade_id = '${unitId}'::uuid
      )
      select jsonb_build_object(
        'invocacoes', (select count(*) from capturas),
        'linhas_por_invocacao', coalesce((
          select jsonb_agg(linhas order by invocacao_id) from capturas
        ), '[]'::jsonb),
        'fingerprints_execucao_correspondem',
          (select count(*) from execucoes) = (select count(*) from capturas)
          and not exists (
            select 1
            from execucoes e
            full join capturas c using (invocacao_id)
            where e.invocacao_id is null
              or c.invocacao_id is null
              or e.fingerprint_fonte is distinct from c.fingerprint
          ),
        'execucoes_sem_captura_exclusiva', (
          select count(*)
          from execucoes e
          full join capturas c using (invocacao_id)
          where e.invocacao_id is null or c.invocacao_id is null
        )
      )::text;
    `);

    const persistedMetricsMatchFirstCapture = runJson(container, `
      with professores_validos(professor_id) as (values (201), (203), (205)),
      fonte as (
        select
          c.professor_id,
          c.metrica,
          jsonb_build_object(
            'metrica', c.payload->'metrica',
            'valor_bruto', c.payload->'valor_bruto',
            'numerador', c.payload->'numerador',
            'denominador', c.payload->'denominador',
            'amostra', c.payload->'amostra',
            'estado_base', c.payload->'estado_base',
            'publicavel', c.payload->'metrica_publicavel',
            'confianca', c.payload->'confianca',
            'fonte', c.payload->'fonte',
            'regra_versao', c.payload->'regra_versao_metrica',
            'motivo_sem_base', c.payload->'motivo_sem_base',
            'detalhes', c.payload->'detalhes',
            'nota', c.payload->'nota',
            'peso', c.payload->'peso',
            'peso_disponivel', c.payload->'peso_disponivel',
            'contribuicao', c.payload->'contribuicao',
            'meta_aplicada', c.payload->'meta',
            'peso_efetivo', c.payload->'peso_efetivo',
            'codigo_evidencia', c.payload->'codigo_evidencia',
            'papel', c.payload->'papel'
          ) as payload
        from public.fixture_health_score_v3_fonte_capturada c
        join professores_validos p using (professor_id)
        where c.invocacao_id = 1
      ), persistidas as (
        select
          s.professor_id,
          m.metrica,
          to_jsonb(m) - 'id' - 'snapshot_id' as payload
        from public.health_score_professor_v3_snapshots s
        join public.health_score_professor_v3_snapshot_metricas m
          on m.snapshot_id = s.id
        join professores_validos p using (professor_id)
        where s.competencia = date_trunc('month', current_date)::date
          and s.periodicidade = 'mensal'
          and s.escopo = 'unidade'
          and s.unidade_id = '${unitId}'::uuid
          and s.revisao = 1
      ), contagens as (
        select
          p.professor_id,
          (select count(*) from fonte f where f.professor_id = p.professor_id) as fonte,
          (select count(*) from persistidas x where x.professor_id = p.professor_id) as persistidas
        from professores_validos p
      )
      select jsonb_build_object(
        'linhas_por_professor', (
          select jsonb_object_agg(
            professor_id::text,
            jsonb_build_object('fonte', fonte, 'persistidas', persistidas)
            order by professor_id
          )
          from contagens
        ),
        'linhas_exatamente_iguais',
          not exists (
            select professor_id, metrica, payload from fonte
            except
            select professor_id, metrica, payload from persistidas
          )
          and not exists (
            select professor_id, metrica, payload from persistidas
            except
            select professor_id, metrica, payload from fonte
          )
      )::text;
    `);

    const monthlySnapshots = runJson(container, `
      select coalesce(jsonb_agg(jsonb_build_object(
        'professor_id', professor_id,
        'revisao', revisao,
        'score', score,
        'cobertura', cobertura,
        'classificacao', classificacao,
        'estado', estado,
        'publicavel', publicavel,
        'publicado', publicado,
        'motivo_bloqueio', motivo_bloqueio,
        'estado_publicacao', estado_publicacao,
        'score_exibivel', score_exibivel,
        'ranking_habilitado', ranking_habilitado
      ) order by professor_id, revisao), '[]'::jsonb)::text
      from public.health_score_professor_v3_snapshots
      where periodicidade = 'mensal';
    `);

    const executionStatuses = runJson(container, `
      select coalesce(jsonb_agg(status order by iniciado_em, id), '[]'::jsonb)::text
      from public.health_score_professor_v3_materializacao_execucoes
      where competencia = date_trunc('month', current_date)::date
        and periodicidade = 'mensal'
        and escopo = 'unidade'
        and unidade_id = '${unitId}'::uuid;
    `);

    const closeAttempt = runJson(container, `
      do $capture$
      declare
        v_result jsonb;
        v_message text;
        v_detail text;
      begin
        create temporary table fixture_close_result(payload jsonb) on commit preserve rows;
        begin
          v_result := public.fechar_health_score_professor_v3_ciclo(
            'fixture-ciclo-incompleto', 'fixture de fechamento estrito'
          );
          insert into fixture_close_result values (
            jsonb_build_object('status', 'fechado', 'resultado', v_result)
          );
        exception when others then
          get stacked diagnostics
            v_message = message_text,
            v_detail = pg_exception_detail;
          insert into fixture_close_result values (
            jsonb_build_object(
              'status', 'recusado',
              'mensagem', v_message,
              'detalhe', nullif(v_detail, '')::jsonb
            )
          );
        end;
      end;
      $capture$;
      select payload::text from fixture_close_result;
    `);

    const officialState = runJson(container, `
      select jsonb_build_object(
        'estado', c.estado,
        'publicacao_oficial', c.publicacao_oficial,
        'ranking_habilitado', c.ranking_habilitado,
        'snapshots_oficiais', (
          select count(*)
          from public.health_score_professor_v3_snapshots s
          where s.ciclo_codigo = c.codigo
            and s.estado_publicacao = 'oficial'
        )
      )::text
      from public.health_score_professor_v3_ciclos c
      where c.codigo = 'fixture-ciclo-incompleto';
    `);

    const healthyCloseAttempt = runJson(container, `
      do $capture$
      declare v_result jsonb;
      begin
        create temporary table fixture_healthy_close_result(payload jsonb)
          on commit preserve rows;
        begin
          v_result := public.fechar_health_score_professor_v3_ciclo(
            'fixture-ciclo-saudavel', 'controle positivo de fechamento saudavel'
          );
          insert into fixture_healthy_close_result values (
            jsonb_build_object('status', 'fechado', 'resultado', v_result)
          );
        exception when others then
          insert into fixture_healthy_close_result values (
            jsonb_build_object('status', 'recusado', 'erro', sqlerrm)
          );
        end;
      end;
      $capture$;
      select payload::text from fixture_healthy_close_result;
    `);

    const healthyOfficialState = runJson(container, `
      select jsonb_build_object(
        'roster_ativo', (
          select coalesce(jsonb_agg(p.id order by p.id), '[]'::jsonb)
          from public.professores_unidades pu
          join public.professores p on p.id = pu.professor_id
          where pu.unidade_id = '${healthyUnitId}'::uuid
            and pu.emusys_ativo
            and pu.validacao_status = 'validado'
            and p.ativo
        ),
        'roster_retratado', (
          select coalesce(jsonb_agg(r.professor_id order by r.professor_id), '[]'::jsonb)
          from (
            select distinct s.professor_id
            from public.health_score_professor_v3_snapshots s
            where s.ciclo_codigo = c.codigo
              and s.unidade_id = '${healthyUnitId}'::uuid
              and s.estado_publicacao in ('parcial', 'oficial')
          ) r
        ),
        'estado', c.estado,
        'publicacao_oficial', c.publicacao_oficial,
        'ranking_habilitado', c.ranking_habilitado,
        'snapshots_oficiais', (
          select count(*)
          from public.health_score_professor_v3_snapshots s
          where s.ciclo_codigo = c.codigo
            and s.estado_publicacao = 'oficial'
            and s.ranking_habilitado
        )
      )::text
      from public.health_score_professor_v3_ciclos c
      where c.codigo = 'fixture-ciclo-saudavel';
    `);

    const healthyMetricParity = runJson(container, `
      with origens as (
        select s.*
        from public.health_score_professor_v3_snapshots s
        where s.ciclo_codigo = 'fixture-ciclo-saudavel'
          and s.estado_publicacao = 'parcial'
      ), oficiais as (
        select s.*
        from public.health_score_professor_v3_snapshots s
        where s.ciclo_codigo = 'fixture-ciclo-saudavel'
          and s.estado_publicacao = 'oficial'
      ), pares as (
        select
          o.id as origem_id,
          f.id as oficial_id,
          om.metrica,
          to_jsonb(om) - 'id' - 'snapshot_id' - 'detalhes' as payload_origem,
          to_jsonb(fm) - 'id' - 'snapshot_id' - 'detalhes' as payload_oficial
        from origens o
        join oficiais f on f.snapshot_anterior_id = o.id
        join public.health_score_professor_v3_snapshot_metricas om
          on om.snapshot_id = o.id
        join public.health_score_professor_v3_snapshot_metricas fm
          on fm.snapshot_id = f.id and fm.metrica = om.metrica
      )
      select jsonb_build_object(
        'snapshots_origem', (select count(*) from origens),
        'snapshots_oficiais', (select count(*) from oficiais),
        'metricas_comparadas', (select count(*) from pares),
        'payload_exato_exceto_detalhes', not exists (
          select 1 from pares p
          where p.payload_origem is distinct from p.payload_oficial
        ),
        'campos_governados_nao_nulos', not exists (
          select 1
          from public.health_score_professor_v3_snapshot_metricas m
          join origens o on o.id = m.snapshot_id
          where m.peso_efetivo is null
             or m.codigo_evidencia is null
             or m.papel is null
        )
      )::text;
    `);

    const expectedValidSnapshots = [
      {
        professor_id: 201, revisao: 1, score: 90, cobertura: 100,
        classificacao: 'saudavel', estado: 'provisorio', publicavel: false,
        publicado: false, motivo_bloqueio: null, estado_publicacao: 'parcial',
        score_exibivel: true, ranking_habilitado: false,
      },
      {
        professor_id: 203, revisao: 1, score: 90, cobertura: 100,
        classificacao: 'saudavel', estado: 'provisorio', publicavel: false,
        publicado: false, motivo_bloqueio: null, estado_publicacao: 'parcial',
        score_exibivel: true, ranking_habilitado: false,
      },
      {
        professor_id: 205, revisao: 1, score: 72, cobertura: 40,
        classificacao: null, estado: 'em_maturacao', publicavel: false,
        publicado: false, motivo_bloqueio: 'cobertura_insuficiente',
        estado_publicacao: 'em_andamento', score_exibivel: false,
        ranking_habilitado: false,
      },
    ];
    const observed = {
      first_status: first.status,
      first_error: Object.hasOwn(first, 'erro') ? first.erro : null,
      incomplete_professors_reported: readStrictIncompleteProfessors(first),
      inconsistent_configurations_reported: readStrictInconsistentConfigurations(first),
      second_status: second.status,
      execution_statuses: executionStatuses,
      producer_calls_after_first: callsAfterFirst,
      producer_calls_after_second: callsAfterSecond,
      source_capture_contract: sourceCaptureContract,
      persisted_metrics_match_first_capture: persistedMetricsMatchFirstCapture,
      snapshots_after_first: snapshotsAfterFirst,
      snapshots_after_second: snapshotsAfterSecond,
      monthly_snapshots: monthlySnapshots,
      direct_materializer_lock: directMaterializerLockContract(),
      cycle_close_lock: cycleCloseLockContract(),
      official_close_status: closeAttempt.status,
      official_close_message: closeAttempt.mensagem ?? null,
      official_close_detail: closeAttempt.detalhe ?? null,
      official_state: officialState,
      healthy_close: {
        status: healthyCloseAttempt.status,
        ciclo_codigo: healthyCloseAttempt.resultado?.ciclo_codigo ?? null,
        estado_publicacao: healthyCloseAttempt.resultado?.estado_publicacao ?? null,
        ranking_habilitado: healthyCloseAttempt.resultado?.ranking_habilitado ?? null,
        snapshots_fechados: healthyCloseAttempt.resultado?.snapshots_fechados ?? null,
      },
      healthy_official_state: healthyOfficialState,
      healthy_metric_parity: healthyMetricParity,
    };
    const expected = {
      first_status: 'parcial',
      first_error: null,
      incomplete_professors_reported: [{
        professor_id: 202,
        metricas_ausentes: expectedMissingMetrics,
      }, {
        professor_id: 204,
        metricas_ausentes: [
          'conversao', 'media_turma', 'numero_alunos',
          'permanencia', 'presenca', 'retencao',
        ],
      }],
      inconsistent_configurations_reported: [{
        professor_id: 206,
        config_ids: [configId, inconsistentConfigId],
        config_versoes: [4, 5],
      }],
      second_status: 'sem_alteracao',
      execution_statuses: ['parcial', 'sem_alteracao'],
      producer_calls_after_first: 1,
      producer_calls_after_second: 2,
      source_capture_contract: {
        invocacoes: 2,
        linhas_por_invocacao: [28, 28],
        fingerprints_execucao_correspondem: true,
        execucoes_sem_captura_exclusiva: 0,
      },
      persisted_metrics_match_first_capture: {
        linhas_por_professor: {
          201: { fonte: 6, persistidas: 6 },
          203: { fonte: 6, persistidas: 6 },
          205: { fonte: 6, persistidas: 6 },
        },
        linhas_exatamente_iguais: true,
      },
      snapshots_after_first: 3,
      snapshots_after_second: 3,
      monthly_snapshots: expectedValidSnapshots,
      direct_materializer_lock: {
        lock_before_capture: true,
        lock_before_revision: true,
      },
      cycle_close_lock: {
        complete_month_series: true,
        ordered_before_lock: true,
        cycle_materializer_key: true,
        lock_before_roster_and_candidates: true,
      },
      official_close_status: 'recusado',
      official_close_message: 'HEALTH_SCORE_V3_FECHAMENTO_BLOQUEADO: roster incompleto',
      official_close_detail: {
        professores_ausentes: [
          { unidade_id: null, professor_id: 201 },
          { unidade_id: null, professor_id: 202 },
          { unidade_id: null, professor_id: 203 },
          { unidade_id: null, professor_id: 204 },
          { unidade_id: null, professor_id: 205 },
          { unidade_id: null, professor_id: 206 },
          { unidade_id: null, professor_id: 301 },
          { unidade_id: null, professor_id: 401 },
          { unidade_id: unitId, professor_id: 202 },
          { unidade_id: unitId, professor_id: 203 },
          { unidade_id: unitId, professor_id: 204 },
          { unidade_id: unitId, professor_id: 205 },
          { unidade_id: unitId, professor_id: 206 },
          { unidade_id: healthyUnitId, professor_id: 301 },
          { unidade_id: absentUnitId, professor_id: 401 },
        ],
        professores_excedentes: [],
      },
      official_state: {
        estado: 'aberto',
        publicacao_oficial: false,
        ranking_habilitado: false,
        snapshots_oficiais: 0,
      },
      healthy_close: {
        status: 'fechado',
        ciclo_codigo: 'fixture-ciclo-saudavel',
        estado_publicacao: 'oficial',
        ranking_habilitado: true,
        snapshots_fechados: 16,
      },
      healthy_official_state: {
        roster_ativo: [301],
        roster_retratado: [301],
        estado: 'fechado',
        publicacao_oficial: true,
        ranking_habilitado: true,
        snapshots_oficiais: 16,
      },
      healthy_metric_parity: {
        snapshots_origem: 16,
        snapshots_oficiais: 16,
        metricas_comparadas: 96,
        payload_exato_exceto_detalhes: true,
        campos_governados_nao_nulos: true,
      },
    };

    assert.deepEqual(
      observed,
      expected,
      `faltam correcoes de materializacao resiliente; migrations descobertas: ${correctiveMigrationNames.join(', ') || 'nenhuma'}; `
        + 'o cron atual aborta em HEALTH_SCORE_V3_PILARES_INCOMPLETOS e chama o produtor duas vezes',
    );
  } finally {
    docker(['stop', container]);
  }
});
