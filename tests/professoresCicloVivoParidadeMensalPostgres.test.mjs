import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrationPath = new URL(
  '../supabase/migrations/20260909051920_professores_ciclo_vivo_paridade_mensal.sql',
  import.meta.url,
);
const performanceMigrationPath = new URL(
  '../supabase/migrations/20260909052519_professores_ciclo_vivo_performance_paridade.sql',
  import.meta.url,
);

const dockerWindows = join(
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
    '-U', 'postgres', '-d', 'postgres', '-At',
  ], sql);
}

async function waitForPostgres(container) {
  let consecutiveReadyChecks = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (psql(container, 'select 1;').status === 0) {
      consecutiveReadyChecks += 1;
      if (consecutiveReadyChecks >= 2) return;
    } else {
      consecutiveReadyChecks = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('PostgreSQL de teste nao iniciou a tempo');
}

const fixture = String.raw`
  create role anon;
  create role authenticated;
  create role service_role;

  create function public.fn_health_score_v3_periodo(
    p_competencia date,
    p_periodicidade text
  ) returns table (
    competencia date,
    periodicidade text,
    periodo_inicio date,
    periodo_fim date,
    ciclo_codigo text
  ) language sql stable as $$
    select
      date_trunc('month', p_competencia)::date,
      p_periodicidade,
      date_trunc('month', p_competencia)::date,
      (date_trunc('month', p_competencia) + interval '3 months - 1 day')::date,
      to_char(p_competencia, 'YYYY-MM') || '-ciclo'
  $$;

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
    select
      7,
      coalesce(p_unidade_id, '10000000-0000-0000-0000-000000000001'::uuid),
      'unidade',
      p_competencia,
      p_competencia,
      p_periodicidade,
      p_competencia,
      (p_competencia + interval '1 month - 1 day')::date,
      'fixture',
      case when p_periodicidade = 'mensal' then 'em_andamento' else 'legado_ciclo' end,
      true,
      p_periodicidade = 'mensal',
      6,
      3,
      case when p_periodicidade = 'mensal' then 91.25 else 12.00 end,
      case when p_periodicidade = 'mensal' then 80.00 else 20.00 end,
      'saudavel',
      'comparavel',
      false,
      false,
      null::text,
      'fixture',
      'presenca',
      case when p_periodicidade = 'mensal' then 75.00 else 5.00 end,
      case when p_periodicidade = 'mensal' then 75.00 else 1.00 end,
      100.00,
      case when p_periodicidade = 'mensal' then 90.00 else 10.00 end,
      10.00,
      p_periodicidade = 'mensal',
      case when p_periodicidade = 'mensal' then 10.00 else 0.00 end,
      case when p_periodicidade = 'mensal' then 9.00 else 0.00 end,
      80.00,
      100,
      case when p_periodicidade = 'mensal' then 'valida' else 'revisar' end,
      p_periodicidade = 'mensal',
      'alta',
      'fixture',
      'fixture',
      null::text,
      'fixture',
      'professor',
      jsonb_build_object('origem', p_periodicidade)
  $$;

  create function public.montar_relatorio_coordenacao_conteudo_v4(
    p_unidade_id uuid,
    p_ano integer,
    p_mes integer,
    p_periodicidade text
  ) returns jsonb language sql stable as $$
    select jsonb_build_object(
      'professores', jsonb_build_array(jsonb_build_object('professor_id', 7)),
      'periodo', jsonb_build_object(
        'ano', p_ano,
        'mes', p_mes,
        'periodicidade', p_periodicidade
      ),
      'origem_ano', p_ano,
      'origem_mes', p_mes
    )
  $$;

  create function public.get_health_score_professor_v3_performance(
    p_competencia date,
    p_unidade_id uuid,
    p_periodicidade text
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
    papel text, detalhes jsonb, score_observado numeric, score_comparavel numeric,
    pilares_validos integer, pilares_esperados integer,
    comparabilidade_estado text, comparabilidade_motivo text,
    competencia_referencia date, score_referencia numeric,
    classificacao_referencia text, data_corte date, config_id uuid,
    regra_fingerprint text, peso_pontuavel_total numeric,
    peso_disponivel_total numeric, cobertura_normalizada numeric,
    cobertura_minima_aplicada numeric, comparabilidade_motivos jsonb
  ) language sql stable as $$
    select
      p.*,
      p.score,
      p.score,
      4,
      5,
      'comparavel',
      'criterios_atendidos',
      p_competencia,
      p.score,
      p.classificacao,
      p_competencia,
      '20000000-0000-0000-0000-000000000002'::uuid,
      'fixture-fingerprint',
      90.00,
      90.00,
      p.cobertura,
      0.00,
      '[]'::jsonb
    from public.get_health_score_professor_v3_projecao_viva(
      p_competencia,
      p_unidade_id,
      p_periodicidade
    ) p
  $$;
`;

test('PostgreSQL avanca somente dentro do ciclo e preserva a fotografia mensal no primeiro mes', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  const container = `la-ciclo-vivo-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres',
    'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    const migration = readFileSync(migrationPath, 'utf8');
    const performanceMigration = readFileSync(performanceMigrationPath, 'utf8');
    const setup = psql(container, `${fixture}\n${migration}\n${performanceMigration}`);
    assert.equal(setup.status, 0, setup.stderr || setup.stdout);

    const timeline = psql(container, String.raw`
      select jsonb_build_object(
        'setembro', public.fn_health_score_professor_v3_competencia_ciclo_vivo(
          date '2026-09-01', date '2026-09-09'
        ),
        'outubro', public.fn_health_score_professor_v3_competencia_ciclo_vivo(
          date '2026-09-01', date '2026-10-15'
        ),
        'novembro', public.fn_health_score_professor_v3_competencia_ciclo_vivo(
          date '2026-09-01', date '2026-11-30'
        ),
        'fora_do_ciclo', public.fn_health_score_professor_v3_competencia_ciclo_vivo(
          date '2026-09-01', date '2026-12-01'
        )
      )::text;
    `);
    assert.equal(timeline.status, 0, timeline.stderr || timeline.stdout);
    assert.deepEqual(JSON.parse(timeline.stdout.trim()), {
      setembro: '2026-09-01',
      outubro: '2026-10-01',
      novembro: '2026-11-01',
      fora_do_ciclo: '2026-09-01',
    });

    const parity = psql(container, String.raw`
      with competencia as (
        select date_trunc('month', current_date)::date as mes
      ), mensal as (
        select p.*
        from competencia c
        cross join lateral public.get_hs_prof_v3_projecao_viva_before_ciclo_parity_20260909(
          c.mes, null, 'mensal'
        ) p
      ), ciclo as (
        select p.*
        from competencia c
        cross join lateral public.get_health_score_professor_v3_projecao_viva(
          c.mes, null, 'ciclo'
        ) p
      )
      select jsonb_build_object(
        'score_mensal', m.score,
        'score_ciclo', c.score,
        'valor_mensal', m.valor_bruto,
        'valor_ciclo', c.valor_bruto,
        'estado_base_mensal', m.estado_base,
        'estado_base_ciclo', c.estado_base,
        'publicavel_mensal', m.metrica_publicavel,
        'publicavel_ciclo', c.metrica_publicavel,
        'periodicidade_ciclo', c.periodicidade,
        'ranking_ciclo', c.ranking_habilitado,
        'publicado_ciclo', c.publicado,
        'primeiro_mes_igual', c.detalhes->'primeiro_mes_igual_ao_mensal'
      )::text
      from mensal m
      join ciclo c using (professor_id, metrica);
    `);
    assert.equal(parity.status, 0, parity.stderr || parity.stdout);
    const result = JSON.parse(parity.stdout.trim());
    assert.equal(result.score_ciclo, result.score_mensal);
    assert.equal(result.valor_ciclo, result.valor_mensal);
    assert.equal(result.estado_base_ciclo, result.estado_base_mensal);
    assert.equal(result.publicavel_ciclo, result.publicavel_mensal);
    assert.equal(result.periodicidade_ciclo, 'ciclo');
    assert.equal(result.ranking_ciclo, false);
    assert.equal(result.publicado_ciclo, false);
    assert.equal(result.primeiro_mes_igual, true);

    const document = psql(container, String.raw`
      select public.montar_relatorio_coordenacao_conteudo_v4(
        null,
        2026,
        9,
        'ciclo'
      )::text;
    `);
    assert.equal(document.status, 0, document.stderr || document.stdout);
    const payload = JSON.parse(document.stdout.trim());
    assert.equal(payload.periodo.ano, 2026);
    assert.equal(payload.periodo.mes, 9);
    assert.equal(payload.periodo.periodicidade, 'ciclo');

    const performanceParity = psql(container, String.raw`
      with competencia as (
        select date_trunc('month', current_date)::date as mes
      ), mensal as (
        select p.*
        from competencia c
        cross join lateral public.get_hs_prof_v3_performance_before_ciclo_parity_20260909(
          c.mes, null, 'mensal'
        ) p
      ), ciclo as (
        select p.*
        from competencia c
        cross join lateral public.get_health_score_professor_v3_performance(
          c.mes, null, 'ciclo'
        ) p
      )
      select jsonb_build_object(
        'score_mensal', m.score,
        'score_ciclo', c.score,
        'valor_mensal', m.valor_bruto,
        'valor_ciclo', c.valor_bruto,
        'score_observado_mensal', m.score_observado,
        'score_observado_ciclo', c.score_observado,
        'pilares_mensal', m.pilares_validos,
        'pilares_ciclo', c.pilares_validos,
        'comparabilidade_mensal', m.comparabilidade_estado,
        'comparabilidade_ciclo', c.comparabilidade_estado,
        'periodicidade_ciclo', c.periodicidade,
        'ranking_ciclo', c.ranking_habilitado,
        'publicado_ciclo', c.publicado,
        'primeiro_mes_igual', c.detalhes->'primeiro_mes_igual_ao_mensal'
      )::text
      from mensal m
      join ciclo c using (professor_id, metrica);
    `);
    assert.equal(
      performanceParity.status,
      0,
      performanceParity.stderr || performanceParity.stdout,
    );
    const performance = JSON.parse(performanceParity.stdout.trim());
    assert.equal(performance.score_ciclo, performance.score_mensal);
    assert.equal(performance.valor_ciclo, performance.valor_mensal);
    assert.equal(performance.score_observado_ciclo, performance.score_observado_mensal);
    assert.equal(performance.pilares_ciclo, performance.pilares_mensal);
    assert.equal(performance.comparabilidade_ciclo, performance.comparabilidade_mensal);
    assert.equal(performance.periodicidade_ciclo, 'ciclo');
    assert.equal(performance.ranking_ciclo, false);
    assert.equal(performance.publicado_ciclo, false);
    assert.equal(performance.primeiro_mes_igual, true);
  } finally {
    docker(['stop', container]);
  }
});
