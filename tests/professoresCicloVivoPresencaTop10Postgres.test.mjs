import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  root,
  'supabase/migrations/20260909000911_professores_ciclo_presenca_referencia_top10.sql',
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
const unidadeA = '10000000-0000-0000-0000-000000000001';
const unidadeB = '20000000-0000-0000-0000-000000000002';

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
  let sucessosConsecutivos = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (psql(container, 'select 1;').status === 0) {
      sucessosConsecutivos += 1;
      // O entrypoint do Postgres sobe um servidor transitório durante o init.
      // Duas leituras estáveis evitam começar o fixture na janela do restart.
      if (sucessosConsecutivos >= 2) return;
    } else {
      sucessosConsecutivos = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('PostgreSQL da regressão do ciclo vivo não iniciou a tempo');
}

const setupSql = String.raw`
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create table public.health_score_professor_v3_snapshots (
  id uuid primary key,
  professor_id integer not null,
  unidade_id uuid,
  escopo text not null,
  competencia date not null,
  periodicidade text not null,
  estado text not null,
  estado_publicacao text not null,
  invalidado_em timestamptz,
  revisao integer not null default 1,
  criado_em timestamptz not null default clock_timestamp()
);

create table public.health_score_professor_v3_snapshot_metricas (
  snapshot_id uuid not null references public.health_score_professor_v3_snapshots(id),
  metrica text not null,
  valor_bruto numeric,
  numerador numeric,
  denominador numeric,
  amostra integer,
  estado_base text,
  publicavel boolean,
  confianca text,
  fonte text,
  regra_versao text,
  motivo_sem_base text,
  detalhes jsonb not null default '{}'::jsonb,
  nota numeric,
  peso numeric,
  peso_disponivel boolean,
  contribuicao numeric,
  meta_aplicada numeric,
  peso_efetivo numeric,
  codigo_evidencia text,
  papel text
);

insert into public.health_score_professor_v3_snapshots (
  id, professor_id, unidade_id, escopo, competencia, periodicidade, estado, estado_publicacao, revisao, criado_em
) values
  ('00000000-0000-0000-0000-000000000001', 501, null, 'consolidado', date '2026-09-01', 'mensal', 'provisorio', 'em_andamento', 1, '2026-09-08 06:00:00+00'),
  ('00000000-0000-0000-0000-000000000002', 501, null, 'consolidado', date '2026-10-01', 'mensal', 'provisorio', 'em_andamento', 1, '2026-10-01 06:00:00+00');

insert into public.health_score_professor_v3_snapshot_metricas (
  snapshot_id, metrica, valor_bruto, numerador, denominador, amostra, estado_base,
  publicavel, confianca, fonte, regra_versao, motivo_sem_base, detalhes, nota, peso,
  peso_disponivel, contribuicao, meta_aplicada, peso_efetivo, codigo_evidencia, papel
) values
  ('00000000-0000-0000-0000-000000000001', 'presenca', 80, 80, 100, 100,
   'referencia_periodo_anterior', false, 'referencia_historica', 'fixture-set', 'fixture-1',
   'Aguardando eventos da competência atual; exibindo a última base disponível',
   '{"referencia_temporaria": true, "competencia_referencia": "2026-08-01"}',
   null, 10, false, null, 80, 0, 'referencia_periodo_anterior', 'nota'),
  ('00000000-0000-0000-0000-000000000002', 'presenca', 99, 99, 100, 100,
   'ok', true, 'alta', 'fixture-out', 'fixture-2', null, '{}',
   99, 10, true, 9.9, 80, 10, 'evidencia_ciclo_disponivel', 'nota');

create function public.get_health_score_professor_v3_performance(date, uuid, text)
returns table (
  professor_id integer, escopo text, unidade_id uuid, metrica text,
  valor_bruto numeric, numerador numeric, denominador numeric, nota numeric,
  peso numeric, peso_disponivel boolean, peso_efetivo numeric, contribuicao numeric,
  meta numeric, amostra integer, estado_base text, metrica_publicavel boolean,
  confianca text, fonte text, regra_versao_metrica text, motivo_sem_base text,
  codigo_evidencia text, papel text, detalhes jsonb
)
language sql stable as $$
  select 501, case when $2 is null then 'consolidado' else 'unidade' end, $2,
    'presenca', null::numeric, null::numeric, null::numeric, null::numeric,
    10::numeric, false, 0::numeric, null::numeric, 80::numeric, null::integer,
    'bloqueado_roster', false, 'auditoria', 'vw_presenca_ocorrencia_canonica_v2',
    'fixture-ciclo', 'roster incompleto ou em revisao no periodo',
    'presenca_em_auditoria', 'nota',
    jsonb_build_object('periodo_inicio', '2026-09-01', 'periodo_fim', '2026-11-30')
$$;

create function public.materializar_health_score_professor_v3_escopo_diario(
  p_competencia date, p_periodicidade text, p_escopo text, p_unidade_id uuid
)
returns jsonb
language plpgsql security definer
set search_path to public, pg_temp
as $$
declare
  v_competencia date := date_trunc('month', p_competencia)::date;
  v_escopo text := lower(trim(coalesce(p_escopo, '')));
  v_unidade_id uuid := p_unidade_id;
begin
  if p_periodicidade not in ('mensal', 'ciclo') or v_escopo not in ('unidade', 'consolidado') then
    raise exception 'HEALTH_SCORE_V3_PARAMETRO_INVALIDO';
  end if;

  create temporary table health_score_v3_diario_fonte on commit drop as
  select p.*
  from public.get_health_score_professor_v3_performance(
    v_competencia, v_unidade_id, p_periodicidade
  ) p
  where p.escopo = v_escopo
    and p.unidade_id is not distinct from v_unidade_id;

  create temporary table health_score_v3_diario_incompletos (
    professor_id integer primary key,
    metricas_ausentes jsonb not null
  ) on commit drop;

  return (
    select jsonb_build_object(
      'valor_bruto', valor_bruto,
      'numerador', numerador,
      'denominador', denominador,
      'estado_base', estado_base,
      'peso_disponivel', peso_disponivel,
      'metrica_publicavel', metrica_publicavel,
      'detalhes', detalhes
    )
    from health_score_v3_diario_fonte
    where metrica = 'presenca'
  );
end;
$$;

create function public.executar_health_score_professor_v3_escopo_diario(
  p_competencia date, p_periodicidade text, p_escopo text, p_unidade_id uuid
)
returns jsonb
language plpgsql security definer
set search_path to public, pg_temp
as $$
declare
  v_competencia date := date_trunc('month', p_competencia)::date;
begin
  create temporary table health_score_v3_diario_fonte on commit drop as
  select p.*
  from public.get_health_score_professor_v3_performance(
    v_competencia, p_unidade_id, p_periodicidade
  ) p
  where p.escopo = p_escopo
    and p.unidade_id is not distinct from p_unidade_id;

  create temporary table health_score_v3_diario_incompletos (
    professor_id integer primary key,
    metricas_ausentes jsonb not null
  ) on commit drop;

  return public.materializar_health_score_professor_v3_escopo_diario(
    p_competencia, p_periodicidade, p_escopo, p_unidade_id
  );
end;
$$;

create table public.alunos (
  id integer primary key,
  professor_experimental_id integer
);

insert into public.alunos (id, professor_experimental_id) values (901, 501);

create function public.matriculas_comerciais_v1(
  p_unidade_id uuid, p_inicio date, p_fim date
)
returns table (aluno_id integer, conta boolean)
language sql stable
as $$
  select
    901::integer as aluno_id,
    true as conta
  from generate_series(
    1,
    case
      when p_unidade_id = '${unidadeA}'::uuid then 6
      when p_unidade_id = '${unidadeB}'::uuid then 3
      else 0
    end
  );
$$;

create function public.fn_health_score_v3_unidades_permitidas_sombra(
  p_unidade_id uuid default null
)
returns table (unidade_id uuid)
language sql stable
as $$
  select p_unidade_id
  where p_unidade_id is not null
  union all
  select unidade_id
  from (values ('${unidadeA}'::uuid), ('${unidadeB}'::uuid)) u(unidade_id)
  where p_unidade_id is null;
$$;

create function public.fn_health_score_professor_v3_ator_leitura(uuid)
returns void
language plpgsql
as $$
begin
  return;
end;
$$;

create function public.montar_relatorio_coordenacao_payload_v3(
  p_unidade_id uuid, p_ano integer, p_mes integer, p_periodicidade text
)
returns jsonb
language sql stable
as $$
  select jsonb_build_object(
    'periodo', jsonb_build_object('inicio', '2026-06-01', 'fim', '2026-08-31'),
    'professores', jsonb_build_array(
      jsonb_build_object('professor_id', 501, 'nome', 'Valdo Delfino', 'operacional', '{}'::jsonb)
    )
  );
$$;

create function public.get_relatorio_coordenacao_canonico_v3(
  p_unidade_id uuid, p_ano integer, p_mes integer, p_periodicidade text default 'mensal'
)
returns jsonb
language plpgsql stable security definer
set search_path to public, pg_temp
as $$
declare
  v_payload jsonb;
  v_periodo_inicio date;
  v_periodo_fim date;
  v_professores jsonb;
begin
  perform public.fn_health_score_professor_v3_ator_leitura(p_unidade_id);

  v_payload := public.montar_relatorio_coordenacao_payload_v3(
    p_unidade_id,
    p_ano,
    p_mes,
    p_periodicidade
  );

  if v_payload is null
     or jsonb_typeof(v_payload->'professores') <> 'array'
     or nullif(v_payload->'periodo'->>'inicio', '') is null
     or nullif(v_payload->'periodo'->>'fim', '') is null then
    raise exception 'RELATORIO_COORDENACAO_MATRICULADOR_PAYLOAD_INVALIDO'
      using errcode = '22023';
  end if;

  v_periodo_inicio := (v_payload->'periodo'->>'inicio')::date;
  v_periodo_fim := (v_payload->'periodo'->>'fim')::date;

  with matriculas_comerciais_por_professor as (
    select
      a.professor_experimental_id as professor_id,
      count(*)::integer as matriculas_comerciais
    from public.matriculas_comerciais_v1(
      p_unidade_id,
      v_periodo_inicio,
      v_periodo_fim + 1
    ) m
    join public.alunos a on a.id = m.aluno_id
    where m.conta is true
      and a.professor_experimental_id is not null
    group by a.professor_experimental_id
  ), professores_ordenados as (
    select
      e.professor,
      e.ordem,
      nullif(e.professor->>'professor_id', '')::integer as professor_id
    from jsonb_array_elements(v_payload->'professores') with ordinality
      as e(professor, ordem)
  )
  select coalesce(
    jsonb_agg(
      jsonb_set(
        p.professor,
        '{operacional}',
        coalesce(p.professor->'operacional', '{}'::jsonb)
          || jsonb_build_object(
            'matriculas_comerciais',
            coalesce(m.matriculas_comerciais, 0)
          ),
        true
      )
      order by p.ordem
    ),
    '[]'::jsonb
  ) into v_professores
  from professores_ordenados p
  left join matriculas_comerciais_por_professor m
    on m.professor_id = p.professor_id;

  return jsonb_set(v_payload, '{professores}', v_professores, true);
end;
$$;
`;

test('ciclo vivo reutiliza a referência mensal e ignora mês futuro em PostgreSQL real', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponível para fixture PostgreSQL');
    return;
  }
  const container = `la-professores-presenca-ciclo-${process.pid}-${Date.now()}`;
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

    // Dollar-quoted anchors are compared byte for byte by the migration. Normalize
    // the checkout line endings so the Windows fixture matches pg_get_functiondef.
    const migration = readFileSync(migrationPath, 'utf8').replace(/\r\n/gu, '\n');
    const applied = psql(container, migration);
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);

    const result = psql(container, String.raw`
      with fonte as (
        select jsonb_agg(to_jsonb(f)) as linhas
        from public.get_health_score_professor_v3_presenca_ciclo_acompanhamento_v1(
          date '2026-09-01', null
        ) f
      ), materializado as (
        select public.materializar_health_score_professor_v3_escopo_diario(
          date '2026-09-01', 'ciclo', 'consolidado', null
        ) as linha
      ), relatorio as (
        select public.get_relatorio_coordenacao_canonico_v3(
          null, 2026, 8, 'ciclo'
        ) as payload
      )
      select jsonb_build_object(
        'fonte', (select linhas from fonte),
        'materializado', (select linha from materializado),
        'matriculas_valdo', (
          select payload->'professores'->0->'operacional'->>'matriculas_comerciais'
          from relatorio
        )
      )::text;
    `);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout.trim().split(/\r?\n/u).at(-1));

    assert.equal(payload.fonte.length, 1);
    assert.equal(payload.fonte[0].valor_bruto, 80);
    assert.equal(payload.materializado.valor_bruto, 80);
    assert.equal(payload.materializado.numerador, 80);
    assert.equal(payload.materializado.denominador, 100);
    assert.equal(payload.materializado.estado_base, 'referencia_periodo_anterior');
    assert.equal(payload.materializado.peso_disponivel, false);
    assert.equal(payload.materializado.metrica_publicavel, false);
    assert.equal(payload.materializado.detalhes.presenca_ciclo_em_acompanhamento, true);
    assert.equal(payload.materializado.detalhes.periodo_inicio, '2026-09-01');
    assert.equal(payload.materializado.detalhes.periodo_fim, '2026-11-30');
    assert.equal(payload.materializado.detalhes.competencia_referencia, '2026-08-01');
    assert.equal(payload.matriculas_valdo, '9');
  } finally {
    docker(['stop', container]);
  }
});
