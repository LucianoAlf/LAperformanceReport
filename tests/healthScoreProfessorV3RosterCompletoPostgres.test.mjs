import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const currentProducerPath = path.join(
  root,
  'supabase/migrations/20260803232500_health_score_v3_equipe_ativa.sql',
);
const correctiveMigrationPath = path.join(
  root,
  'supabase/migrations/20260813120000_health_score_v3_roster_completo_materializacao_resiliente.sql',
);

const unitA = '10000000-0000-0000-0000-000000000001';
const unitB = '10000000-0000-0000-0000-000000000002';
const configId = '20000000-0000-0000-0000-000000000001';
const expectedMetrics = [
  'conversao',
  'media_turma',
  'numero_alunos',
  'permanencia',
  'presenca',
  'retencao',
];

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
  const bodyStart = sql.indexOf('$function$', start);
  const end = sql.indexOf('$function$;', bodyStart + '$function$'.length);
  assert.notEqual(bodyStart, -1, `corpo de ${functionName} deve existir`);
  assert.notEqual(end, -1, `fim de ${functionName} deve existir`);
  return sql.slice(start, end + '$function$;'.length);
}

const fixture = `
  create extension if not exists pgcrypto;
  create schema auth;
  create role anon;
  create role authenticated;
  create role service_role;

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
    professor_id integer not null references public.professores(id),
    unidade_id uuid not null references public.unidades(id),
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
    config_id uuid not null references public.health_score_professor_v3_config_versoes(id),
    metrica text not null,
    peso numeric not null,
    meta numeric,
    parametros jsonb not null default '{}'::jsonb,
    unique (config_id, metrica)
  );
  create table public.fixture_health_score_v3_evidencias (
    professor_id integer not null,
    unidade_id uuid not null,
    metrica text not null,
    valor_bruto numeric,
    numerador numeric,
    denominador numeric,
    nota numeric,
    amostra integer,
    primary key (professor_id, unidade_id, metrica)
  );

  insert into public.unidades values
    ('${unitA}', 'Unidade Sintetica A', true),
    ('${unitB}', 'Unidade Sintetica B', true);
  insert into public.professores values
    (101, 'Professor Recem Vinculado', true),
    (102, 'Professor Sem Turmas Elegiveis', true),
    (103, 'Professor Matriz Completa', true),
    (104, 'Professor Unidade B', true),
    (105, 'Professor Multiunidade', true);
  insert into public.professores_unidades values
    (101, '${unitA}', true, 'validado'),
    (102, '${unitA}', true, 'validado'),
    (103, '${unitA}', true, 'validado'),
    (104, '${unitB}', true, 'validado'),
    (105, '${unitA}', true, 'validado'),
    (105, '${unitB}', true, 'validado');

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

  -- O recem-vinculado possui evidencia corrente, mas nenhum historico de fidelizacao.
  insert into public.fixture_health_score_v3_evidencias values
    (101, '${unitA}', 'conversao', 7, 7, 10, 100, 10),
    (101, '${unitA}', 'numero_alunos', 8, 8, null, null, 8),
    (101, '${unitA}', 'presenca', 90, 9, 10, 90, 10);

  -- Tres professores completos; o multiunidade tem evidencia nas duas unidades.
  insert into public.fixture_health_score_v3_evidencias
    (professor_id, unidade_id, metrica, valor_bruto, numerador, denominador, nota, amostra)
  select p.professor_id, p.unidade_id, c.metrica,
    case when c.metrica = 'numero_alunos' then 20 else 90 end,
    case when c.metrica = 'numero_alunos' then 20 else 9 end,
    case when c.metrica = 'numero_alunos' then null else 10 end,
    case when c.metrica = 'numero_alunos' then null else 90 end,
    20
  from (values
    (103, '${unitA}'::uuid),
    (104, '${unitB}'::uuid),
    (105, '${unitA}'::uuid),
    (105, '${unitB}'::uuid)
  ) p(professor_id, unidade_id)
  cross join public.health_score_professor_v3_config_metricas c
  where c.config_id = '${configId}';

  -- Fonte esparsa que representa o comportamento anterior: so emite o que tem evidencia.
  create function public.get_hs_prof_v3_performance_payload_base_20260803(
    p_competencia date, p_unidade_id uuid, p_periodicidade text
  ) returns table (${performanceReturn})
  language sql stable set search_path = public, pg_temp
  as $$
    with evidencias as (
      select distinct on (e.professor_id, e.metrica)
        e.*, c.peso, c.meta,
        coalesce(c.parametros->>'papel', 'nota') as papel
      from public.fixture_health_score_v3_evidencias e
      join public.health_score_professor_v3_config_metricas c
        on c.config_id = '${configId}' and c.metrica = e.metrica
      where p_unidade_id is null or e.unidade_id = p_unidade_id
      order by e.professor_id, e.metrica, e.unidade_id
    ), calculada as (
      select e.*,
        count(*) filter (where e.papel = 'nota' and e.nota is not null)
          over (partition by e.professor_id) as pilares_disponiveis,
        sum(e.peso) filter (where e.papel = 'nota' and e.nota is not null)
          over (partition by e.professor_id) as peso_disponivel,
        round(
          sum(e.nota * e.peso) filter (where e.papel = 'nota' and e.nota is not null)
            over (partition by e.professor_id)
          / nullif(sum(e.peso) filter (where e.papel = 'nota' and e.nota is not null)
            over (partition by e.professor_id), 0),
          2
        ) as nota_observada
      from evidencias e
    )
    select
      c.professor_id,
      case when p_unidade_id is null then null::uuid else p_unidade_id end,
      case when p_unidade_id is null then 'consolidado' else 'unidade' end,
      date_trunc('month', p_competencia)::date,
      date_trunc('quarter', p_competencia)::date,
      p_periodicidade,
      date_trunc('month', p_competencia)::date,
      (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date,
      to_char(p_competencia, 'YYYY-MM'),
      'em_andamento', c.nota_observada is not null, false,
      4, 0, c.nota_observada, c.peso_disponivel,
      case when c.pilares_disponiveis = 5 then 'saudavel' else null end,
      case when c.pilares_disponiveis = 5 then 'provisorio' else 'em_maturacao' end,
      false, false,
      case when c.pilares_disponiveis = 5 then null else 'pilares_insuficientes' end,
      'fixture-esparsa',
      c.metrica, c.valor_bruto, c.numerador, c.denominador,
      c.nota, c.peso, c.nota is not null and c.papel = 'nota',
      case when c.papel = 'nota' and c.nota is not null
        then round(c.peso * 100 / c.peso_disponivel, 4) else 0 end,
      case when c.nota is not null then c.nota * c.peso / 100 else null end,
      c.meta, c.amostra, 'ok', true, 'alta', 'fixture_sintetica',
      'fixture-esparsa', null, 'evidencia_valida', c.papel, '{}'::jsonb,
      c.nota_observada,
      case when c.pilares_disponiveis = 5 then c.nota_observada else null end,
      c.pilares_disponiveis, c.pilares_disponiveis,
      case when c.pilares_disponiveis = 5 then 'comparavel' else 'em_maturacao' end,
      case when c.pilares_disponiveis = 5 then null else 'pilares_insuficientes' end,
      null::date, null::numeric, null::text,
      current_date, '${configId}'::uuid, 'fixture-esparsa',
      c.peso_disponivel, c.peso_disponivel,
      c.peso_disponivel, 60::numeric,
      case when c.pilares_disponiveis = 5 then '[]'::jsonb
        else '["pilares_insuficientes"]'::jsonb end
    from calculada c
  $$;
`;

function readRows(container, unitId, scope) {
  const unitSql = unitId === null ? 'null::uuid' : `'${unitId}'::uuid`;
  const result = psql(container, `
    select jsonb_agg(jsonb_build_object(
      'professor_id', professor_id,
      'unidade_id', unidade_id,
      'escopo', escopo,
      'metrica', metrica,
      'valor_bruto', valor_bruto,
      'numerador', numerador,
      'denominador', denominador,
      'nota', nota,
      'estado_base', estado_base,
      'metrica_publicavel', metrica_publicavel,
      'motivo_sem_base', motivo_sem_base,
      'peso_disponivel', peso_disponivel,
      'peso_efetivo', peso_efetivo,
      'codigo_evidencia', codigo_evidencia,
      'papel', papel,
      'score_observado', score_observado,
      'score_comparavel', score_comparavel,
      'classificacao', classificacao,
      'pilares_esperados', pilares_esperados,
      'peso_pontuavel_total', peso_pontuavel_total
    ) order by professor_id, metrica)::text
    from public.get_health_score_professor_v3_performance(
      date_trunc('month', current_date)::date, ${unitSql}, 'mensal'
    )
    where escopo = '${scope}' and unidade_id is not distinct from ${unitSql};
  `);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim() || '[]');
}

test('PostgreSQL exige roster completo e denominador governado em unidade e consolidado', { timeout: 120_000 }, async (t) => {
  assert.equal(fs.existsSync(currentProducerPath), true, 'migration atual do roster deve existir');
  const dockerInfo = docker(['version', '--format', '{{.Server.Version}}']);
  if (dockerInfo.status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  const container = `la-health-v3-roster-${process.pid}-${Date.now()}`;
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

    const currentProducer = extractFunction(
      fs.readFileSync(currentProducerPath, 'utf8'),
      'get_health_score_professor_v3_performance',
    );
    const installed = psql(container, currentProducer);
    assert.equal(installed.status, 0, installed.stderr || installed.stdout);

    if (fs.existsSync(correctiveMigrationPath)) {
      const corrected = psql(container, fs.readFileSync(correctiveMigrationPath, 'utf8'));
      assert.equal(corrected.status, 0, corrected.stderr || corrected.stdout);
    }

    const scopes = [
      { name: 'unidade_a', unitId: unitA, scope: 'unidade', professors: [101, 102, 103, 105] },
      { name: 'unidade_b', unitId: unitB, scope: 'unidade', professors: [104, 105] },
      { name: 'consolidado', unitId: null, scope: 'consolidado', professors: [101, 102, 103, 104, 105] },
    ];
    const violations = [];

    for (const expected of scopes) {
      const rows = readRows(container, expected.unitId, expected.scope);
      const byProfessor = new Map();
      for (const row of rows) {
        const current = byProfessor.get(row.professor_id) ?? [];
        current.push(row);
        byProfessor.set(row.professor_id, current);
      }

      assert.deepEqual(
        [...byProfessor.keys()].sort((a, b) => a - b),
        expected.professors,
        `${expected.name}: migration corretiva deve incluir todo professor ativo do roster`,
      );

      for (const professorId of expected.professors) {
        const professorRows = byProfessor.get(professorId) ?? [];
        const metrics = professorRows.map((row) => row.metrica).sort();
        if (JSON.stringify(metrics) !== JSON.stringify(expectedMetrics)) {
          violations.push({ scope: expected.name, professor_id: professorId, problem: 'matriz_incompleta', metrics });
          continue;
        }

        for (const metric of expectedMetrics) {
          if (professorRows.filter((row) => row.metrica === metric).length !== 1) {
            violations.push({ scope: expected.name, professor_id: professorId, metric, problem: 'metrica_duplicada' });
          }
        }

        for (const row of professorRows.filter((item) => item.estado_base === 'sem_base')) {
          if (
            row.metrica_publicavel !== false
            || row.valor_bruto !== null
            || row.nota !== null
            || row.numerador !== null
            || row.denominador !== null
            || row.peso_disponivel !== false
            || Number(row.peso_efetivo) !== 0
            || !row.motivo_sem_base
            || !row.codigo_evidencia
          ) {
            violations.push({ scope: expected.name, professor_id: professorId, metric: row.metrica, problem: 'sem_base_invalida' });
          }
        }

        const numeroAlunos = professorRows.find((row) => row.metrica === 'numero_alunos');
        if (numeroAlunos?.papel !== 'diagnostico') {
          violations.push({ scope: expected.name, professor_id: professorId, problem: 'numero_alunos_nao_diagnostico' });
        }
        if (professorRows.some((row) => Number(row.pilares_esperados) !== 5)) {
          violations.push({ scope: expected.name, professor_id: professorId, problem: 'pilares_esperados_nao_governados' });
        }
        if (professorRows.some((row) => Number(row.peso_pontuavel_total) !== 90)) {
          violations.push({ scope: expected.name, professor_id: professorId, problem: 'peso_total_nao_governado' });
        }
      }

      const expectedUnit = expected.unitId;
      if (rows.some((row) => row.escopo !== expected.scope || row.unidade_id !== expectedUnit)) {
        violations.push({ scope: expected.name, problem: 'vazamento_de_escopo' });
      }
    }

    const unitARows = readRows(container, unitA, 'unidade');
    for (const professorId of [101, 102]) {
      const rows = unitARows.filter((row) => row.professor_id === professorId);
      if (rows.some((row) => row.score_comparavel !== null || row.classificacao !== null)) {
        violations.push({ scope: 'unidade_a', professor_id: professorId, problem: 'gate_de_comparabilidade_aberto' });
      }
    }
    const recentlyLinked = unitARows.find((row) => row.professor_id === 101);
    if (recentlyLinked && recentlyLinked.score_observado === null) {
      violations.push({ scope: 'unidade_a', professor_id: 101, problem: 'score_observado_parcial_ausente' });
    }
    const noEvidence = unitARows.filter((row) => row.professor_id === 102);
    if (noEvidence.some((row) => row.valor_bruto === 0 || row.nota === 0)) {
      violations.push({ scope: 'unidade_a', professor_id: 102, problem: 'ausencia_convertida_em_zero' });
    }

    assert.deepEqual(
      violations,
      [],
      `falta comportamento da migration corretiva ${path.basename(correctiveMigrationPath)}`,
    );
  } finally {
    docker(['stop', container]);
  }
});
