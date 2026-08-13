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
const correctiveMigrationName =
  '20260813120000_health_score_v3_roster_completo_materializacao_resiliente.sql';
const currentCronPath = path.join(
  migrationsDir,
  pinnedCronMigrationName,
);
const currentClosePath = path.join(
  migrationsDir,
  pinnedCloseMigrationName,
);
const correctiveMigrationPath = path.join(
  migrationsDir,
  correctiveMigrationName,
);

const pinnedDefinitions = [
  ['fingerprint_health_score_professor_v3_escopo', pinnedCronMigrationName],
  ['materializar_health_score_professor_v3_escopo_diario', pinnedCronMigrationName],
  ['executar_health_score_professor_v3_escopo_diario', pinnedCronMigrationName],
  ['executar_health_score_professor_v3_cron_diario', pinnedCronMigrationName],
  ['fechar_health_score_professor_v3_ciclo', pinnedCloseMigrationName],
];
const expectedMetrics = [
  'conversao',
  'media_turma',
  'numero_alunos',
  'permanencia',
  'presenca',
  'retencao',
];
const expectedMissingMetrics = ['permanencia', 'retencao'];

const unitId = '10000000-0000-0000-0000-000000000001';
const configId = '20000000-0000-0000-0000-000000000001';
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

function assertPinnedDefinitionsAreCurrent() {
  for (const [functionName, pinnedMigrationName] of pinnedDefinitions) {
    const definitions = localFunctionDefinitions(functionName);
    assert.ok(
      definitions.includes(pinnedMigrationName),
      `${functionName} deve continuar ancorada em ${pinnedMigrationName}`,
    );
    assert.ok(
      [pinnedMigrationName, correctiveMigrationName].includes(definitions.at(-1)),
      `fixture desatualizada: ${functionName} foi redefinida por ${definitions.at(-1)}`,
    );
  }
}

function collectIncompleteProfessorReports(payload, reports = []) {
  if (Array.isArray(payload)) {
    for (const item of payload) collectIncompleteProfessorReports(item, reports);
    return reports;
  }
  if (payload === null || typeof payload !== 'object') return reports;

  if (Number.isInteger(payload.professor_id)) {
    const missingMetricArrays = Object.values(payload).filter((value) => (
      Array.isArray(value)
      && value.length > 0
      && value.length < expectedMetrics.length
      && value.every((item) => expectedMetrics.includes(item))
    ));
    for (const metrics of missingMetricArrays) {
      reports.push({
        professor_id: payload.professor_id,
        metricas_ausentes: [...metrics].sort(),
      });
    }
  }

  for (const value of Object.values(payload)) {
    collectIncompleteProfessorReports(value, reports);
  }
  return reports;
}

const fixture = `
  create extension if not exists pgcrypto;
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
  create sequence public.fixture_health_score_v3_produtor_chamadas;

  insert into public.unidades values ('${unitId}', 'Unidade Sintetica', true);
  insert into public.professores values
    (201, 'Professor Valido Um', true),
    (202, 'Professor Incompleto', true),
    (203, 'Professor Valido Dois', true);
  insert into public.professores_unidades values
    (201, '${unitId}', true, 'validado'),
    (202, '${unitId}', true, 'validado'),
    (203, '${unitId}', true, 'validado');
  insert into public.health_score_professor_v3_config_versoes values (
    '${configId}', 4, 'ativa', date '2026-08-01', null, 60, 70, 85
  );
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

  -- Produtor atual instrumentado: 201 e 203 sao validos; 202 nao tem retencao/permanencia.
  create function public.get_health_score_professor_v3_performance(
    p_competencia date, p_unidade_id uuid, p_periodicidade text
  ) returns table (${performanceReturn})
  language plpgsql volatile set search_path = public, pg_temp
  as $$
  begin
    perform nextval('public.fixture_health_score_v3_produtor_chamadas');
    return query
    with roster(professor_id, metricas) as (
      values
        (201, array['retencao','permanencia','conversao','media_turma','numero_alunos','presenca']::text[]),
        (202, array['conversao','media_turma','numero_alunos','presenca']::text[]),
        (203, array['retencao','permanencia','conversao','media_turma','numero_alunos','presenca']::text[])
    ), base as (
      select r.professor_id, m.metrica, m.peso, m.meta,
        coalesce(m.parametros->>'papel', 'nota') as papel,
        cardinality(r.metricas) - 1 as pilares_validos
      from roster r
      cross join lateral unnest(r.metricas) x(metrica)
      join public.health_score_professor_v3_config_metricas m
        on m.config_id = '${configId}' and m.metrica = x.metrica
    )
    select
      b.professor_id, p_unidade_id,
      case when p_unidade_id is null then 'consolidado' else 'unidade' end,
      date_trunc('month', p_competencia)::date,
      date_trunc('quarter', p_competencia)::date,
      p_periodicidade,
      date_trunc('month', p_competencia)::date,
      (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date,
      to_char(p_competencia, 'YYYY-MM'), 'em_andamento', true, false,
      4, 0, 90::numeric, 100::numeric,
      case when b.professor_id = 202 then null else 'saudavel' end,
      case when b.professor_id = 202 then 'em_maturacao' else 'provisorio' end,
      false, false,
      case when b.professor_id = 202 then 'pilares_insuficientes' else null end,
      'fixture-produtor',
      b.metrica,
      case when b.metrica = 'numero_alunos' then 20::numeric else 90::numeric end,
      case when b.metrica = 'numero_alunos' then 20::numeric else 9::numeric end,
      case when b.metrica = 'numero_alunos' then null::numeric else 10::numeric end,
      case when b.metrica = 'numero_alunos' then null::numeric else 90::numeric end,
      b.peso, b.papel = 'nota',
      case when b.papel = 'nota' then round(b.peso * 100 / 90, 4) else 0 end,
      case when b.papel = 'nota' then 90 * b.peso / 100 else null end,
      b.meta, 20, 'ok', true, 'alta', 'fixture_sintetica',
      'fixture-produtor', null, 'evidencia_valida', b.papel, '{}'::jsonb,
      90::numeric,
      case when b.professor_id = 202 then null else 90::numeric end,
      b.pilares_validos,
      case when b.professor_id = 202 then 3 else 5 end,
      case when b.professor_id = 202 then 'em_maturacao' else 'comparavel' end,
      case when b.professor_id = 202 then 'pilares_insuficientes' else null end,
      null::date, null::numeric, null::text,
      current_date, '${configId}'::uuid, 'fixture-produtor',
      case when b.professor_id = 202 then 40::numeric else 90::numeric end,
      case when b.professor_id = 202 then 40::numeric else 90::numeric end,
      case when b.professor_id = 202 then 44.4::numeric else 100::numeric end,
      60::numeric,
      case when b.professor_id = 202 then '["pilares_insuficientes"]'::jsonb else '[]'::jsonb end
    from base b;
  end;
  $$;

  -- Um candidato de ciclo aparentemente apto; o roster oficial ainda esta incompleto.
  insert into public.health_score_professor_v3_ciclos
    (codigo, data_inicio, data_fim, estado, publicacao_oficial, ranking_habilitado)
  values ('fixture-ciclo', date '1999-01-01', date '2000-01-01', 'aberto', false, false);
  insert into public.health_score_professor_v3_snapshots (
    id, professor_id, escopo, unidade_id, competencia, trimestre_inicio,
    revisao, estado, config_id, config_versao, score, cobertura,
    classificacao, publicavel, publicado, regra_versao, periodicidade,
    periodo_inicio, periodo_fim, ciclo_codigo, estado_publicacao,
    score_exibivel, ranking_habilitado
  ) values (
    '${cycleSnapshotId}', 201, 'unidade', '${unitId}', date '2000-01-01',
    date '2000-01-01', 1, 'provisorio', '${configId}', 4, 90, 100,
    'saudavel', false, false, 'fixture-ciclo', 'ciclo', date '1999-01-01',
    date '2000-01-01', 'fixture-ciclo', 'parcial', true, false
  );
  insert into public.health_score_professor_v3_snapshot_metricas (
    snapshot_id, metrica, valor_bruto, numerador, denominador, amostra,
    estado_base, publicavel, confianca, fonte, regra_versao, detalhes,
    nota, peso, peso_disponivel, contribuicao, meta_aplicada,
    peso_efetivo, codigo_evidencia, papel
  )
  select '${cycleSnapshotId}', m.metrica,
    case when m.metrica = 'numero_alunos' then 20 else 90 end,
    9, 10, 20, 'ok', true, 'alta', 'fixture_sintetica', 'fixture-ciclo',
    '{"apta_oficial":true}'::jsonb,
    case when m.metrica = 'numero_alunos' then null else 90 end,
    m.peso, m.metrica <> 'numero_alunos',
    case when m.metrica = 'numero_alunos' then null else 9 end,
    m.meta, case when m.metrica = 'numero_alunos' then 0 else m.peso end,
    'evidencia_valida', coalesce(m.parametros->>'papel', 'nota')
  from public.health_score_professor_v3_config_metricas m
  where m.config_id = '${configId}';
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
  assertPinnedDefinitionsAreCurrent();
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

    const producerSmoke = runJson(container, `
      with fonte as materialized (
        select *
        from public.get_health_score_professor_v3_performance(
          date_trunc('month', current_date)::date, '${unitId}'::uuid, 'mensal'
        )
      ), ausentes_202 as (
        select coalesce(jsonb_agg(c.metrica order by c.metrica), '[]'::jsonb) as metricas
        from public.health_score_professor_v3_config_metricas c
        where c.config_id = '${configId}'::uuid
          and not exists (
            select 1 from fonte f
            where f.professor_id = 202 and f.metrica = c.metrica
          )
      )
      select jsonb_build_object(
        'linhas', (select count(*) from fonte),
        'metricas_ausentes_202', (select metricas from ausentes_202)
      )::text;
    `);
    assert.deepEqual(producerSmoke, {
      linhas: 16,
      metricas_ausentes_202: expectedMissingMetrics,
    }, 'fixture deve emitir 6 + 4 + 6 metricas e duas ausencias exatas');
    const resetCalls = psql(
      container,
      "alter sequence public.fixture_health_score_v3_produtor_chamadas restart with 1;",
    );
    assert.equal(resetCalls.status, 0, resetCalls.stderr || resetCalls.stdout);

    if (fs.existsSync(correctiveMigrationPath)) {
      const corrected = psql(container, fs.readFileSync(correctiveMigrationPath, 'utf8'));
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
      "select last_value from public.fixture_health_score_v3_produtor_chamadas;",
    ).stdout.trim());
    const snapshotsAfterFirst = Number(psql(container, `
      select count(*) from public.health_score_professor_v3_snapshots
      where periodicidade = 'mensal';
    `).stdout.trim());

    const second = runJson(container, executionSql);
    const callsAfterSecond = Number(psql(
      container,
      "select last_value from public.fixture_health_score_v3_produtor_chamadas;",
    ).stdout.trim());
    const snapshotsAfterSecond = Number(psql(container, `
      select count(*) from public.health_score_professor_v3_snapshots
      where periodicidade = 'mensal';
    `).stdout.trim());

    const monthlySnapshots = runJson(container, `
      select coalesce(jsonb_agg(jsonb_build_object(
        'professor_id', professor_id,
        'revisao', revisao,
        'estado_publicacao', estado_publicacao,
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
      declare v_result jsonb;
      begin
        create temporary table fixture_close_result(payload jsonb) on commit preserve rows;
        begin
          v_result := public.fechar_health_score_professor_v3_ciclo(
            'fixture-ciclo', 'fixture de fechamento estrito'
          );
          insert into fixture_close_result values (
            jsonb_build_object('status', 'fechado', 'resultado', v_result)
          );
        exception when others then
          insert into fixture_close_result values (
            jsonb_build_object('status', 'recusado', 'erro', sqlerrm)
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
      where c.codigo = 'fixture-ciclo';
    `);

    const expectedValidSnapshots = [
      { professor_id: 201, revisao: 1, estado_publicacao: 'parcial', ranking_habilitado: false },
      { professor_id: 203, revisao: 1, estado_publicacao: 'parcial', ranking_habilitado: false },
    ];
    const observed = {
      first_status: first.status,
      first_error: Object.hasOwn(first, 'erro') ? first.erro : null,
      incomplete_professors_reported: collectIncompleteProfessorReports(first),
      second_status: second.status,
      execution_statuses: executionStatuses,
      producer_calls_after_first: callsAfterFirst,
      producer_calls_after_second: callsAfterSecond,
      snapshots_after_first: snapshotsAfterFirst,
      snapshots_after_second: snapshotsAfterSecond,
      monthly_snapshots: monthlySnapshots,
      official_close_status: closeAttempt.status,
      official_close_reports_incomplete_roster: (
        typeof closeAttempt.erro === 'string'
        && /(?:roster|professores|pilares).*incomplet/iu.test(closeAttempt.erro)
      ),
      official_state: officialState,
    };
    const expected = {
      first_status: 'parcial',
      first_error: null,
      incomplete_professors_reported: [{
        professor_id: 202,
        metricas_ausentes: expectedMissingMetrics,
      }],
      second_status: 'sem_alteracao',
      execution_statuses: ['parcial', 'sem_alteracao'],
      producer_calls_after_first: 1,
      producer_calls_after_second: 2,
      snapshots_after_first: 2,
      snapshots_after_second: 2,
      monthly_snapshots: expectedValidSnapshots,
      official_close_status: 'recusado',
      official_close_reports_incomplete_roster: true,
      official_state: {
        estado: 'aberto',
        publicacao_oficial: false,
        ranking_habilitado: false,
        snapshots_oficiais: 0,
      },
    };

    assert.deepEqual(
      observed,
      expected,
      `falta materializacao resiliente da migration ${path.basename(correctiveMigrationPath)}; `
        + 'o cron atual aborta em HEALTH_SCORE_V3_PILARES_INCOMPLETOS e chama o produtor duas vezes',
    );
  } finally {
    docker(['stop', container]);
  }
});
