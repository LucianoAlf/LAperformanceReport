import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  root,
  'supabase/migrations/20260802190000_health_score_v3_nota_diagnostica.sql',
);

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

function extractCalculator(sql) {
  const start = sql.search(
    /create\s+or\s+replace\s+function\s+public\.calcular_health_score_professor_v3_nota_diagnostica\(/i,
  );
  assert.notEqual(start, -1, 'funcao pura de calculo deve existir na migration');
  const bodyStart = sql.indexOf('$function$', start);
  assert.notEqual(bodyStart, -1, 'inicio do corpo da funcao deve existir');
  const end = sql.indexOf('$function$;', bodyStart + '$function$'.length);
  assert.notEqual(end, -1, 'fim do corpo da funcao deve existir');
  return sql.slice(start, end + '$function$;'.length);
}

const fullMigrationFixture = `
  create extension if not exists pgcrypto;
  create schema auth;
  create role anon;
  create role authenticated;
  create role service_role;
  create function auth.role() returns text language sql stable as $$ select 'service_role'::text $$;

  create table public.professores (id integer primary key);
  create table public.unidades (id uuid primary key);
  create table public.usuarios (id integer primary key);
  insert into public.professores select generate_series(1, 5);
  insert into public.unidades values ('10000000-0000-0000-0000-000000000001');

  create table public.health_score_professor_v3_config_versoes (
    id uuid primary key,
    versao integer not null,
    status text not null,
    vigencia_inicio date not null,
    vigencia_fim date,
    cobertura_minima numeric not null,
    faixa_atencao_min numeric not null,
    faixa_saudavel_min numeric not null,
    exige_pilar_fidelizacao boolean not null,
    justificativa text,
    criado_em timestamptz default now(),
    ativado_em timestamptz
  );
  insert into public.health_score_professor_v3_config_versoes values (
    '20000000-0000-0000-0000-000000000001', 1, 'ativa', '2026-06-01', null,
    60, 70, 85, true, 'fixture', now(), now()
  );

  create table public.health_score_professor_v3_config_metricas (
    config_id uuid not null,
    metrica text not null,
    amostra_minima integer,
    primary key (config_id, metrica)
  );
  insert into public.health_score_professor_v3_config_metricas values
    ('20000000-0000-0000-0000-000000000001', 'retencao', null),
    ('20000000-0000-0000-0000-000000000001', 'presenca', null),
    ('20000000-0000-0000-0000-000000000001', 'conversao', 3),
    ('20000000-0000-0000-0000-000000000001', 'numero_alunos', null);

  create table public.health_score_professor_v3_snapshots (
    id uuid primary key default gen_random_uuid(),
    professor_id integer not null references public.professores(id),
    escopo text not null,
    unidade_id uuid references public.unidades(id),
    competencia date not null,
    trimestre_inicio date not null,
    revisao integer not null,
    estado text not null,
    config_id uuid not null references public.health_score_professor_v3_config_versoes(id),
    config_versao integer not null,
    score numeric,
    cobertura numeric not null default 0,
    classificacao text not null,
    publicavel boolean not null default false,
    publicado boolean not null default false,
    motivo_bloqueio text,
    regra_versao text not null,
    snapshot_anterior_id uuid references public.health_score_professor_v3_snapshots(id),
    justificativa_retificacao text,
    criado_por integer references public.usuarios(id),
    criado_em timestamptz not null default now(),
    periodicidade text not null,
    periodo_inicio date not null,
    periodo_fim date not null,
    ciclo_codigo text not null,
    estado_publicacao text not null,
    score_exibivel boolean not null default false,
    ranking_habilitado boolean not null default false
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
    publicavel boolean not null default false,
    confianca text not null,
    fonte text not null,
    regra_versao text not null,
    motivo_sem_base text,
    detalhes jsonb not null default '{}'::jsonb,
    nota numeric,
    peso numeric not null,
    peso_disponivel boolean not null default false,
    contribuicao numeric,
    meta_aplicada numeric,
    unique (snapshot_id, metrica)
  );

  create table public.health_score_professor_v3_snapshot_metrica_segmentos (
    id uuid primary key default gen_random_uuid(),
    snapshot_metrica_id uuid not null references public.health_score_professor_v3_snapshot_metricas(id),
    config_meta_segmento_id uuid, unidade_id uuid, curso_id integer, modalidade text,
    pessoas_unicas integer, vinculos_ativos integer, turmas_elegiveis integer,
    ocupacoes_unicas integer, capacidade_maxima numeric, meta_aplicada numeric,
    numerador numeric, denominador numeric, nota numeric, estado_base text,
    fonte text, regra_versao text, detalhes jsonb, atribuicao_id uuid,
    atribuicao_formal boolean, atribuicao_pontuavel boolean,
    pessoas_unicas_total integer, pessoas_fechamentos integer,
    meses_com_base integer, meses_com_base_consolidado integer,
    meses_no_periodo integer, capacidade_excedida boolean,
    alertas_capacidade jsonb, divergencias jsonb
  );

  create table public.health_score_professor_v3_snapshot_metrica_diagnosticos (
    id uuid primary key default gen_random_uuid(),
    snapshot_metrica_id uuid not null references public.health_score_professor_v3_snapshot_metricas(id),
    unidade_id uuid, pessoas_unicas_total integer, dados_sem_resolucao integer,
    estados_resolucao jsonb, estado_base text, fonte text, regra_versao text,
    divergencias jsonb, detalhes jsonb
  );

  create function public.fn_health_score_professor_v3_ator_gerenciador()
  returns integer language sql stable as $$ select null::integer $$;

  create function public.fn_health_score_professor_v3_ator_leitura(uuid)
  returns integer language sql stable as $$ select null::integer $$;

  insert into public.health_score_professor_v3_snapshots (
    id, professor_id, escopo, unidade_id, competencia, trimestre_inicio, revisao,
    estado, config_id, config_versao, score, cobertura, classificacao,
    publicavel, publicado, regra_versao, periodicidade, periodo_inicio,
    periodo_fim, ciclo_codigo, estado_publicacao, score_exibivel, ranking_habilitado
  ) values (
    '30000000-0000-0000-0000-000000000005', 5, 'unidade',
    '10000000-0000-0000-0000-000000000001', '2026-07-01', '2026-07-01', 1,
    'fechado', '20000000-0000-0000-0000-000000000001', 1, 91, 100, 'saudavel',
    true, true, 'fixture-fechado', 'mensal', '2026-07-01', '2026-07-31',
    '2026-Q3', 'oficial', true, true
  );
  insert into public.health_score_professor_v3_snapshot_metricas (
    snapshot_id, metrica, valor_bruto, estado_base, publicavel, confianca,
    fonte, regra_versao, nota, peso, peso_disponivel, contribuicao
  ) values (
    '30000000-0000-0000-0000-000000000005', 'retencao', 91, 'valida', true,
    'alta', 'fixture', 'fixture-fechado', 91, 25, true, 22.75
  );

  create function public.fixture_bloqueia_metrica_fora_provisorio()
  returns trigger language plpgsql as $$
  declare v_estado text;
  begin
    select estado into v_estado from public.health_score_professor_v3_snapshots
    where id = new.snapshot_id;
    if v_estado <> 'provisorio' then
      raise exception 'fixture: metrica exige snapshot provisorio';
    end if;
    return new;
  end;
  $$;
  create trigger fixture_metricas_append_only
    before insert on public.health_score_professor_v3_snapshot_metricas
    for each row execute function public.fixture_bloqueia_metrica_fora_provisorio();

  create function public.materializar_health_score_professor_v3_periodo_impl(
    p_competencia date,
    p_periodicidade text default 'mensal',
    p_unidade_id uuid default null,
    p_professor_id integer default null
  ) returns jsonb
  language plpgsql security definer set search_path = public, pg_temp
  as $$
  declare
    v_professor integer;
    v_snapshot uuid;
    v_ids jsonb := '[]'::jsonb;
  begin
    for v_professor in select generate_series(1, 4) loop
      insert into public.health_score_professor_v3_snapshots (
        professor_id, escopo, unidade_id, competencia, trimestre_inicio, revisao,
        estado, config_id, config_versao, score, cobertura, classificacao,
        publicavel, publicado, regra_versao, periodicidade, periodo_inicio,
        periodo_fim, ciclo_codigo, estado_publicacao, score_exibivel, ranking_habilitado
      ) values (
        v_professor, 'unidade', p_unidade_id, p_competencia,
        date_trunc('quarter', p_competencia)::date, 1, 'provisorio',
        '20000000-0000-0000-0000-000000000001', 1, null, 0, 'sem_base',
        false, false, 'fixture-base', p_periodicidade,
        date_trunc('month', p_competencia)::date,
        (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date,
        '2026-Q3', 'sem_base', false, false
      ) returning id into v_snapshot;

      if v_professor = 1 then
        insert into public.health_score_professor_v3_snapshot_metricas
          (snapshot_id, metrica, valor_bruto, amostra, estado_base, publicavel,
           confianca, fonte, regra_versao, detalhes, nota, peso,
           peso_disponivel, contribuicao, meta_aplicada)
        values
          (v_snapshot, 'retencao', 80, 40, 'valida', true, 'alta', 'fixture',
           'fixture-base', '{}', 80, 25, true, 20, 90),
          (v_snapshot, 'presenca', 100, 30, 'valida', true, 'alta', 'fixture',
           'fixture-base', '{"aulas_elegiveis":30}', 100, 10, true, 10, 80),
          (v_snapshot, 'numero_alunos', 50, 50, 'valida', true, 'alta', 'fixture',
           'fixture-base', '{}', 100, 10, true, 10, 25);
      elsif v_professor = 2 then
        insert into public.health_score_professor_v3_snapshot_metricas
          (snapshot_id, metrica, valor_bruto, amostra, estado_base, publicavel,
           confianca, fonte, regra_versao, detalhes, nota, peso,
           peso_disponivel, contribuicao, meta_aplicada)
        values
          (v_snapshot, 'retencao', 80, 20, 'valida', true, 'alta', 'fixture',
           'fixture-base', '{}', 80, 25, true, 20, 90),
          (v_snapshot, 'conversao', 50, 2, 'provisorio', true, 'media', 'fixture',
           'fixture-base', '{}', 71.43, 15, true, 10.7145, 70);
      elsif v_professor = 3 then
        insert into public.health_score_professor_v3_snapshot_metricas
          (snapshot_id, metrica, valor_bruto, amostra, estado_base, publicavel,
           confianca, fonte, regra_versao, detalhes, nota, peso,
           peso_disponivel, contribuicao, meta_aplicada)
        values
          (v_snapshot, 'retencao', 80, 20, 'valida', true, 'alta', 'fixture',
           'fixture-base', '{}', 80, 25, true, 20, 90),
          (v_snapshot, 'conversao', 70, 3, 'valida', true, 'alta', 'fixture',
           'fixture-base', '{}', 100, 15, true, 15, 70);
      else
        insert into public.health_score_professor_v3_snapshot_metricas
          (snapshot_id, metrica, valor_bruto, amostra, estado_base, publicavel,
           confianca, fonte, regra_versao, detalhes, nota, peso,
           peso_disponivel, contribuicao, meta_aplicada)
        values
          (v_snapshot, 'numero_alunos', 12, 12, 'valida', true, 'alta', 'fixture',
           'fixture-base', '{}', 48, 10, true, 4.8, 25);
      end if;

      v_ids := v_ids || jsonb_build_array(v_snapshot);
    end loop;
    return jsonb_build_object('snapshot_ids', v_ids, 'snapshots_criados', 4);
  end;
  $$;
`;

test('calculador V3 normaliza pesos e mantem carteira fora da nota', { timeout: 90_000 }, async (t) => {
  assert.equal(fs.existsSync(migrationPath), true, 'migration diagnostica ainda nao existe');
  const migration = fs.readFileSync(migrationPath, 'utf8');

  const version = docker(['version', '--format', '{{.Server.Version}}']);
  if (version.status !== 0) {
    t.skip('Docker indisponivel');
    return;
  }

  const container = `la-report-health-v3-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres',
    'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    const installed = psql(container, extractCalculator(migration));
    assert.equal(installed.status, 0, installed.stderr || installed.stdout);

    const result = psql(container, `
      select public.calcular_health_score_professor_v3_nota_diagnostica(
        jsonb_build_array(
          jsonb_build_object('metrica','retencao','nota',80,'peso',25,'peso_disponivel',true,'papel','nota'),
          jsonb_build_object('metrica','presenca','nota',100,'peso',10,'peso_disponivel',true,'papel','nota'),
          jsonb_build_object('metrica','conversao','nota',null,'peso',15,'peso_disponivel',false,'papel','nota'),
          jsonb_build_object('metrica','numero_alunos','nota',100,'peso',10,'peso_disponivel',false,'papel','diagnostico')
        ),
        60,
        true
      );
    `);
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.score, 85.71);
    assert.equal(payload.cobertura, 35);
    assert.equal(payload.score_exibivel, true);
    assert.equal(payload.ranking_elegivel, false);

    const metrics = new Map(payload.metricas.map((metric) => [metric.metrica, metric]));
    assert.equal(metrics.get('retencao').peso_efetivo, 71.4286);
    assert.equal(metrics.get('presenca').peso_efetivo, 28.5714);
    assert.equal(metrics.get('numero_alunos').peso_efetivo, 0);
    assert.equal(
      Number(payload.metricas.reduce((sum, metric) => sum + metric.peso_efetivo, 0).toFixed(4)),
      100,
    );
  } finally {
    docker(['stop', container]);
  }
});

test('calculador V3 nao transforma ausencia de pilar em zero', { timeout: 90_000 }, async (t) => {
  assert.equal(fs.existsSync(migrationPath), true, 'migration diagnostica ainda nao existe');
  const migration = fs.readFileSync(migrationPath, 'utf8');

  const version = docker(['version', '--format', '{{.Server.Version}}']);
  if (version.status !== 0) {
    t.skip('Docker indisponivel');
    return;
  }

  const container = `la-report-health-v3-empty-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres',
    'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    const installed = psql(container, extractCalculator(migration));
    assert.equal(installed.status, 0, installed.stderr || installed.stdout);

    const result = psql(container, `
      select public.calcular_health_score_professor_v3_nota_diagnostica(
        jsonb_build_array(
          jsonb_build_object('metrica','conversao','nota',null,'peso',15,'peso_disponivel',false,'papel','nota'),
          jsonb_build_object('metrica','numero_alunos','nota',100,'peso',10,'peso_disponivel',false,'papel','diagnostico')
        ),
        60,
        true
      );
    `);
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.score, null);
    assert.equal(payload.cobertura, 0);
    assert.equal(payload.score_exibivel, false);
    assert.equal(payload.ranking_elegivel, false);
  } finally {
    docker(['stop', container]);
  }
});

test('migration completa materializa quatro perfis e preserva fechamento', { timeout: 90_000 }, async (t) => {
  assert.equal(fs.existsSync(migrationPath), true, 'migration diagnostica ainda nao existe');
  const migration = fs.readFileSync(migrationPath, 'utf8');

  const version = docker(['version', '--format', '{{.Server.Version}}']);
  if (version.status !== 0) {
    t.skip('Docker indisponivel');
    return;
  }

  const container = `la-report-health-v3-full-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres',
    'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    const fixture = psql(container, fullMigrationFixture);
    assert.equal(fixture.status, 0, fixture.stderr || fixture.stdout);

    const before = psql(container, `
      select md5(to_jsonb(s)::text)
      from public.health_score_professor_v3_snapshots s
      where s.id = '30000000-0000-0000-0000-000000000005';
    `);
    assert.equal(before.status, 0, before.stderr || before.stdout);

    const applied = psql(container, migration);
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);

    const materialized = psql(container, `
      select public.materializar_health_score_professor_v3_periodo_impl(
        '2026-07-01', 'mensal',
        '10000000-0000-0000-0000-000000000001', null
      );
    `);
    assert.equal(materialized.status, 0, materialized.stderr || materialized.stdout);

    const result = psql(container, `
      with latest as (
        select distinct on (professor_id) *
        from public.health_score_professor_v3_snapshots
        where professor_id between 1 and 4
        order by professor_id, revisao desc
      )
      select jsonb_build_object(
        'professores', (
          select jsonb_agg(jsonb_build_object(
            'professor_id', l.professor_id,
            'score', l.score,
            'cobertura', l.cobertura,
            'ranking_habilitado', l.ranking_habilitado,
            'score_exibivel', l.score_exibivel
          ) order by l.professor_id) from latest l
        ),
        'metricas', (
          select jsonb_agg(jsonb_build_object(
            'professor_id', l.professor_id,
            'metrica', m.metrica,
            'peso_disponivel', m.peso_disponivel,
            'peso_efetivo', m.peso_efetivo,
            'codigo_evidencia', m.codigo_evidencia,
            'papel', m.papel
          ) order by l.professor_id, m.metrica)
          from latest l
          join public.health_score_professor_v3_snapshot_metricas m
            on m.snapshot_id = l.id
        ),
        'fechado_hash', (
          select md5(to_jsonb(s)::text)
          from public.health_score_professor_v3_snapshots s
          where s.id = '30000000-0000-0000-0000-000000000005'
        )
      );
    `);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.fechado_hash, before.stdout.trim());

    const professors = new Map(payload.professores.map((item) => [item.professor_id, item]));
    assert.equal(professors.get(1).score, 85.71);
    assert.equal(professors.get(1).ranking_habilitado, false);
    assert.equal(professors.get(2).score, 80);
    assert.equal(professors.get(3).score, 87.5);
    assert.equal(professors.get(4).score, null);
    assert.equal(professors.get(4).score_exibivel, false);

    const metricKey = (item) => `${item.professor_id}:${item.metrica}`;
    const metrics = new Map(payload.metricas.map((item) => [metricKey(item), item]));
    assert.equal(metrics.get('1:numero_alunos').papel, 'diagnostico');
    assert.equal(metrics.get('1:numero_alunos').peso_efetivo, 0);
    assert.equal(metrics.get('2:conversao').codigo_evidencia, 'amostra_insuficiente');
    assert.equal(metrics.get('2:conversao').peso_disponivel, false);
    assert.equal(metrics.get('3:conversao').codigo_evidencia, 'evidencia_valida');

    const rpc = psql(container, `
      select peso_efetivo, codigo_evidencia, papel
      from public.get_health_score_professor_v3_performance(
        '2026-07-01', '10000000-0000-0000-0000-000000000001', 'mensal'
      ) where professor_id = 1 and metrica = 'numero_alunos';
    `);
    assert.equal(rpc.status, 0, rpc.stderr || rpc.stdout);
    assert.match(rpc.stdout, /^0\|diagnostico_carteira\|diagnostico/m);
  } finally {
    docker(['stop', container]);
  }
});
