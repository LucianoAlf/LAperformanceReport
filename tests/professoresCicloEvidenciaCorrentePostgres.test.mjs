import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  root,
  'supabase/migrations/20260909085007_professores_ciclo_evidencia_corrente.sql',
);
const coordinationMigrationPath = path.join(
  root,
  'supabase/migrations/20260909085523_relatorio_coordenacao_presenca_corrente_v4.sql',
);
const residualMigrationPath = path.join(
  root,
  'supabase/migrations/20260909090406_professores_presenca_sem_referencia_residual.sql',
);
const zeroExplicitMigrationPath = path.join(
  root,
  'supabase/migrations/20260909090904_relatorio_coordenacao_presenca_zero_explicito_v4.sql',
);
const noAuditStateMigrationPath = path.join(
  root,
  'supabase/migrations/20260909091241_professores_presenca_aberta_sem_estado_auditoria.sql',
);
const dockerWindows = path.join(
  process.env.LOCALAPPDATA || '',
  'Programs',
  'DockerDesktop',
  'resources',
  'bin',
  'docker.exe',
);
const dockerExecutable = process.platform === 'win32' && existsSync(dockerWindows)
  ? dockerWindows
  : 'docker';

function docker(args, input) {
  return spawnSync(dockerExecutable, args, {
    input,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
}

function psql(container, sql) {
  return docker([
    'exec', '-i', container,
    'psql', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'postgres', '-qAt',
  ], sql);
}

async function waitForPostgres(container) {
  let consecutiveSuccesses = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (psql(container, 'select 1;').status === 0) {
      consecutiveSuccesses += 1;
      if (consecutiveSuccesses >= 2) return;
    } else {
      consecutiveSuccesses = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('PostgreSQL da regressao de evidencia corrente nao iniciou a tempo');
}

const setupSql = String.raw`
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create function public.relatorio_coordenacao_periodos_v4(
  p_ano integer,
  p_mes integer,
  p_periodicidade text,
  p_data_corte date
)
returns table (competencia date)
language sql stable
as $$
  select make_date(p_ano, p_mes, 1)
$$;

create function public.get_health_score_professor_v3_performance_snapshot_v3(
  p_competencia date,
  p_unidade_id uuid,
  p_periodicidade text
)
returns table (
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
  papel text, detalhes jsonb, score_observado numeric, score_comparavel numeric,
  pilares_validos integer, pilares_esperados integer, comparabilidade_estado text,
  comparabilidade_motivo text, competencia_referencia date, score_referencia numeric,
  classificacao_referencia text, data_corte date, config_id uuid,
  regra_fingerprint text, peso_pontuavel_total numeric, peso_disponivel_total numeric,
  cobertura_normalizada numeric, cobertura_minima_aplicada numeric,
  comparabilidade_motivos jsonb, retrato_calculado_em timestamptz,
  retrato_execucao_id uuid, retrato_estado text, retrato_defasagem_minutos numeric
)
language sql stable security definer
set search_path to public, pg_temp
as $$
  with periodo as (
    select
      date_trunc('month', p_competencia)::date as competencia,
      case when p_periodicidade = 'ciclo'
        then (date_trunc('month', p_competencia) + interval '3 months - 1 day')::date
        else (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date
      end as periodo_fim,
      current_date between date_trunc('month', p_competencia)::date
        and case when p_periodicidade = 'ciclo'
          then (date_trunc('month', p_competencia) + interval '3 months - 1 day')::date
          else (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date
        end as aberto
  ), metricas as (
    select * from (values
      (
        501::integer,
        'presenca'::text, 80::numeric, 42::numeric, 69::numeric, 69::integer,
        'referencia_periodo_anterior'::text, 'referencia_historica'::text,
        'Aguardando eventos da competencia atual; exibindo a ultima base disponivel'::text,
        'referencia_periodo_anterior'::text,
        jsonb_build_object(
          'referencia_temporaria', true,
          'competencia_referencia', '2026-08-01',
          'presentes_observados', 10,
          'denominador_observado', 10,
          'faltas_observadas', 0,
          'ocorrencias_incompletas', 2,
          'estado_publicacao', 'bloqueado_roster'
        )
      ),
      (
        501::integer,
        'conversao'::text, 60::numeric, 3::numeric, 5::numeric, 5::integer,
        'referencia_periodo_anterior'::text, 'referencia_historica'::text,
        'Aguardando eventos da competencia atual; exibindo a ultima base disponivel'::text,
        'referencia_periodo_anterior'::text,
        jsonb_build_object(
          'referencia_temporaria', true,
          'competencia_referencia', '2026-08-01',
          'experimentais_confirmadas', 0,
          'matriculas_creditadas', 0,
          'codigo_evidencia', 'sem_experimental_mes'
        )
      ),
      (
        502::integer,
        'presenca'::text, 63.2::numeric, 12::numeric, 19::numeric, 19::integer,
        'referencia_periodo_anterior'::text, 'referencia_historica'::text,
        'Aguardando eventos da competencia atual; exibindo a ultima base disponivel'::text,
        'referencia_periodo_anterior'::text,
        jsonb_build_object(
          'referencia_temporaria', true,
          'competencia_referencia', '2026-08-01',
          'presentes_observados', 0,
          'denominador_observado', 0,
          'faltas_observadas', 0,
          'ocorrencias_incompletas', 0,
          'estado_publicacao', 'bloqueado_roster'
        )
      ),
      (
        503::integer,
        'presenca'::text, null::numeric, null::numeric, null::numeric, null::integer,
        'em_auditoria'::text, 'auditoria'::text,
        'ocorrencia pendente ou conflitante no periodo'::text,
        'calendario_sem_aulas_elegiveis'::text,
        jsonb_build_object(
          'referencia_temporaria', false,
          'competencia_referencia', null,
          'presentes_observados', 0,
          'denominador_observado', 0,
          'faltas_observadas', 0,
          'ocorrencias_incompletas', 0,
          'estado_publicacao', 'em_auditoria'
        )
      )
    ) as m(
      professor_id, metrica, valor_bruto, numerador, denominador, amostra, estado_base,
      confianca, motivo_sem_base, codigo_evidencia, detalhes
    )
  )
  select
    m.professor_id, p_unidade_id, case when p_unidade_id is null then 'consolidado' else 'unidade' end,
    p.competencia, p.competencia, p_periodicidade, p.competencia, p.periodo_fim,
    'fixture', case when p.aberto then 'em_andamento' else 'oficial' end,
    true, not p.aberto, 6, 1, 92::numeric, 60::numeric, 'saudavel',
    case when p.aberto then 'provisorio' else 'fechado' end,
    not p.aberto, not p.aberto, null::text, 'fixture-regra',
    m.metrica, m.valor_bruto, m.numerador, m.denominador, null::numeric,
    10::numeric, false, 0::numeric, null::numeric, 80::numeric, m.amostra,
    m.estado_base, false, m.confianca, 'fixture-source', 'fixture-metrica',
    m.motivo_sem_base, m.codigo_evidencia, 'nota', m.detalhes,
    92::numeric, 92::numeric, 3, 5, 'comparavel', 'criterios_atendidos',
    null::date, 91::numeric, 'saudavel', current_date, null::uuid,
    'fixture-fingerprint', 90::numeric, 65::numeric, 60::numeric, 0::numeric,
    '[]'::jsonb, clock_timestamp(), null::uuid,
    case when p.aberto then 'provisorio' else 'fechado' end, 0::numeric
  from periodo p
  cross join metricas m;
$$;
`;

test('leitor do painel usa evidencia corrente no periodo aberto sem reaproveitar agosto', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  assert.equal(existsSync(migrationPath), true, `migration ausente: ${migrationPath}`);
  assert.equal(
    existsSync(coordinationMigrationPath),
    true,
    `migration ausente: ${coordinationMigrationPath}`,
  );
  assert.equal(
    existsSync(residualMigrationPath),
    true,
    `migration ausente: ${residualMigrationPath}`,
  );
  assert.equal(
    existsSync(zeroExplicitMigrationPath),
    true,
    `migration ausente: ${zeroExplicitMigrationPath}`,
  );
  assert.equal(
    existsSync(noAuditStateMigrationPath),
    true,
    `migration ausente: ${noAuditStateMigrationPath}`,
  );

  const container = `la-professores-evidencia-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres',
    'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    const setup = psql(container, setupSql);
    assert.equal(setup.status, 0, setup.stderr || setup.stdout);

    const migration = readFileSync(migrationPath, 'utf8').replace(/\r\n/gu, '\n');
    const applied = psql(container, migration);
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);
    const coordinationMigration = readFileSync(coordinationMigrationPath, 'utf8')
      .replace(/\r\n/gu, '\n');
    const coordinationApplied = psql(container, coordinationMigration);
    assert.equal(
      coordinationApplied.status,
      0,
      coordinationApplied.stderr || coordinationApplied.stdout,
    );
    const residualMigration = readFileSync(residualMigrationPath, 'utf8')
      .replace(/\r\n/gu, '\n');
    const residualApplied = psql(container, residualMigration);
    assert.equal(
      residualApplied.status,
      0,
      residualApplied.stderr || residualApplied.stdout,
    );
    const zeroExplicitMigration = readFileSync(zeroExplicitMigrationPath, 'utf8')
      .replace(/\r\n/gu, '\n');
    const zeroExplicitApplied = psql(container, zeroExplicitMigration);
    assert.equal(
      zeroExplicitApplied.status,
      0,
      zeroExplicitApplied.stderr || zeroExplicitApplied.stdout,
    );
    const noAuditStateMigration = readFileSync(noAuditStateMigrationPath, 'utf8')
      .replace(/\r\n/gu, '\n');
    const noAuditStateApplied = psql(container, noAuditStateMigration);
    assert.equal(
      noAuditStateApplied.status,
      0,
      noAuditStateApplied.stderr || noAuditStateApplied.stdout,
    );

    const result = psql(container, String.raw`
      with mensal as (
        select jsonb_agg(to_jsonb(r) order by r.metrica) as payload
        from public.get_health_score_professor_v3_performance_snapshot_v3(
          date_trunc('month', current_date)::date, null, 'mensal'
        ) r
      ), ciclo as (
        select jsonb_agg(to_jsonb(r) order by r.metrica) as payload
        from public.get_health_score_professor_v3_performance_snapshot_v3(
          date_trunc('month', current_date)::date, null, 'ciclo'
        ) r
      ), fechado as (
        select jsonb_agg(to_jsonb(r) order by r.metrica) as payload
        from public.get_health_score_professor_v3_performance_snapshot_v3(
          date '2026-06-01', null, 'ciclo'
        ) r
      ), coordenacao as (
        select jsonb_agg(to_jsonb(r) order by r.professor_id) as payload
        from public.relatorio_coordenacao_presenca_v4(
          null,
          extract(year from current_date)::integer,
          extract(month from current_date)::integer,
          'ciclo',
          current_date
        ) r
      )
      select jsonb_build_object(
        'mensal', (select payload from mensal),
        'ciclo', (select payload from ciclo),
        'fechado', (select payload from fechado),
        'coordenacao', (select payload from coordenacao)
      )::text;
    `);
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const payload = JSON.parse(result.stdout.trim().split(/\r?\n/u).at(-1));
    for (const key of ['mensal', 'ciclo']) {
      const conversion = payload[key].find(
        (row) => row.professor_id === 501 && row.metrica === 'conversao',
      );
      const attendance = payload[key].find(
        (row) => row.professor_id === 501 && row.metrica === 'presenca',
      );
      const attendanceWithoutEvents = payload[key].find(
        (row) => row.professor_id === 502 && row.metrica === 'presenca',
      );
      const attendanceAuditWithoutConflict = payload[key].find(
        (row) => row.professor_id === 503 && row.metrica === 'presenca',
      );

      assert.equal(attendance.valor_bruto, 100);
      assert.equal(attendance.numerador, 10);
      assert.equal(attendance.denominador, 10);
      assert.equal(attendance.amostra, 10);
      assert.equal(attendance.estado_base, 'em_andamento');
      assert.equal(attendance.metrica_publicavel, false);
      assert.equal(attendance.peso_disponivel, false);
      assert.equal(attendance.detalhes.referencia_temporaria, false);
      assert.equal(attendance.detalhes.competencia_referencia, null);
      assert.equal(attendance.detalhes.presenca_observada_em_andamento, true);

      assert.equal(attendanceWithoutEvents.valor_bruto, null);
      assert.equal(attendanceWithoutEvents.numerador, 0);
      assert.equal(attendanceWithoutEvents.denominador, 0);
      assert.equal(attendanceWithoutEvents.amostra, 0);
      assert.equal(attendanceWithoutEvents.estado_base, 'sem_base');
      assert.equal(attendanceWithoutEvents.confianca, 'sem_base');
      assert.equal(
        attendanceWithoutEvents.codigo_evidencia,
        'sem_eventos_elegiveis_periodo',
      );
      assert.equal(attendanceWithoutEvents.detalhes.referencia_temporaria, false);
      assert.equal(attendanceWithoutEvents.detalhes.competencia_referencia, null);
      assert.equal(
        attendanceWithoutEvents.detalhes.presenca_observada_em_andamento,
        false,
      );

      assert.equal(attendanceAuditWithoutConflict.valor_bruto, null);
      assert.equal(attendanceAuditWithoutConflict.numerador, 0);
      assert.equal(attendanceAuditWithoutConflict.denominador, 0);
      assert.equal(attendanceAuditWithoutConflict.amostra, 0);
      assert.equal(attendanceAuditWithoutConflict.estado_base, 'sem_base');
      assert.equal(attendanceAuditWithoutConflict.confianca, 'sem_base');
      assert.equal(
        attendanceAuditWithoutConflict.codigo_evidencia,
        'sem_eventos_elegiveis_periodo',
      );
      assert.equal(
        attendanceAuditWithoutConflict.detalhes.presenca_observada_em_andamento,
        false,
      );

      assert.equal(conversion.valor_bruto, null);
      assert.equal(conversion.numerador, 0);
      assert.equal(conversion.denominador, 0);
      assert.equal(conversion.amostra, 0);
      assert.equal(conversion.estado_base, 'sem_base');
      assert.equal(conversion.codigo_evidencia, 'sem_experimental_mes');
      assert.equal(conversion.detalhes.referencia_temporaria, false);
      assert.equal(conversion.detalhes.competencia_referencia, null);
    }

    const closedAttendance = payload.fechado.find(
      (row) => row.professor_id === 501 && row.metrica === 'presenca',
    );
    const closedConversion = payload.fechado.find(
      (row) => row.professor_id === 501 && row.metrica === 'conversao',
    );
    assert.equal(closedAttendance.valor_bruto, 80);
    assert.equal(closedAttendance.detalhes.referencia_temporaria, true);
    assert.equal(closedConversion.valor_bruto, 60);
    assert.equal(closedConversion.detalhes.referencia_temporaria, true);

    assert.equal(payload.coordenacao.length, 3);
    const coordinationObserved = payload.coordenacao.find(
      (row) => row.professor_id === 501,
    );
    const coordinationWithoutEvents = payload.coordenacao.find(
      (row) => row.professor_id === 502,
    );
    const coordinationAuditWithoutConflict = payload.coordenacao.find(
      (row) => row.professor_id === 503,
    );
    assert.equal(coordinationObserved.valor, 100);
    assert.equal(coordinationObserved.numerador, 10);
    assert.equal(coordinationObserved.denominador, 10);
    assert.equal(coordinationObserved.amostra, 10);
    assert.equal(coordinationObserved.competencias_observadas, 1);
    assert.equal(coordinationObserved.detalhes.competencias.length, 1);
    assert.equal(
      Object.hasOwn(coordinationObserved.detalhes.competencias[0], 'competencia_referencia'),
      false,
    );
    assert.equal(coordinationWithoutEvents.valor, null);
    assert.equal(coordinationWithoutEvents.numerador, 0);
    assert.equal(coordinationWithoutEvents.denominador, 0);
    assert.equal(coordinationWithoutEvents.amostra, 0);
    assert.equal(coordinationWithoutEvents.competencias_observadas, 0);
    assert.equal(coordinationWithoutEvents.codigo_evidencia, 'sem_eventos_elegiveis_periodo');
    assert.equal(coordinationWithoutEvents.pendencia, false);
    assert.equal(coordinationAuditWithoutConflict.numerador, 0);
    assert.equal(coordinationAuditWithoutConflict.denominador, 0);
    assert.equal(coordinationAuditWithoutConflict.amostra, 0);
    assert.equal(
      coordinationAuditWithoutConflict.codigo_evidencia,
      'sem_eventos_elegiveis_periodo',
    );
    assert.equal(coordinationAuditWithoutConflict.pendencia, false);
  } finally {
    docker(['stop', container]);
  }
});
