import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260804170000_health_score_v3_kpis_temporais_canonicos.sql',
);

function docker(args, input) {
  return spawnSync('docker', args, { input, encoding: 'utf8', timeout: 120_000 });
}

function psql(container, sql) {
  return docker([
    'exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'postgres', '-At',
  ], sql);
}

function extractFunction(sql, name) {
  const start = sql.indexOf(`create or replace function public.${name}`);
  assert.notEqual(start, -1, `funcao ${name} ausente`);
  const end = sql.indexOf('$function$;', start);
  assert.notEqual(end, -1, `fim da funcao ${name} ausente`);
  return sql.slice(start, end + '$function$;'.length);
}

async function waitForPostgres(container) {
  let last;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    last = psql(container, 'select 1;');
    if (last.status === 0) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const stable = psql(container, 'select 1;');
      if (stable.status === 0) return;
      last = stable;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail(last?.stderr || 'PostgreSQL nao ficou pronto');
}

test('PostgreSQL conta chamada tardia e nao mistura ocorrencias com id reutilizado', async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel');
    return;
  }

  const container = `la-health-presenca-${process.pid}`;
  const started = docker([
    'run', '--rm', '--name', container,
    '-e', 'POSTGRES_PASSWORD=postgres', '-d', 'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr);

  try {
    await waitForPostgres(container);

    const migration = fs.readFileSync(migrationPath, 'utf8');
    const helper = extractFunction(
      migration,
      'get_health_score_professor_v3_presenca_periodo_v2',
    );
    const setup = `
      create schema if not exists public;
      create table public.professores (id integer primary key, nome text not null);
      create table public.professores_unidades (
        professor_id integer, unidade_id uuid, emusys_ativo boolean,
        validacao_status text
      );
      create table public.vw_aluno_identidade_unidade_canonica (
        unidade_id uuid, pessoa_chave text, aluno_ids_locais integer[],
        emusys_aluno_id bigint
      );
      create table public.aulas_emusys (
        id bigint, professor_id integer, unidade_id uuid, data_aula date,
        cancelada boolean, categoria text, sem_acompanhamento boolean
      );
      create table public.aula_alunos_emusys (
        aula_emusys_id bigint, aluno_emusys_id bigint, aluno_id integer
      );
      create table public.presenca_politicas_confiabilidade (
        unidade_id uuid, ativa boolean, data_inicio date, data_fim date,
        exige_revisao_operacional boolean, created_at timestamptz
      );
      create table public.vw_aluno_presenca_semantica_v1 (
        professor_id integer, unidade_id uuid, aula_emusys_id bigint,
        data_aula date, aluno_id integer, resultado_pedagogico text,
        considera_frequencia_denominador boolean,
        evidencia_registrada_em timestamptz
      );

      create function public.fn_health_score_v3_unidades_permitidas_sombra(uuid)
      returns table (unidade_id uuid) language sql stable as $$
        select coalesce($1, '11111111-1111-1111-1111-111111111111'::uuid)
      $$;
      create function public.fn_health_score_v3_periodo(date, text)
      returns table (
        periodicidade text, periodo_inicio date, periodo_fim date,
        ciclo_codigo text, periodo_label text
      ) language sql stable as $$
        select $2, date_trunc('month', $1)::date,
          (date_trunc('month', $1) + interval '1 month - 1 day')::date,
          to_char($1, 'YYYY-MM'), to_char($1, 'MM/YYYY')
      $$;

      ${helper}

      insert into public.professores values (1, 'Professora Teste');
      insert into public.professores_unidades values (
        1, '11111111-1111-1111-1111-111111111111', true, 'validado'
      );
      insert into public.vw_aluno_identidade_unidade_canonica values (
        '11111111-1111-1111-1111-111111111111', 'pessoa:1', array[10], 100
      );
      insert into public.aulas_emusys values (
        500, 1, '11111111-1111-1111-1111-111111111111', '2026-07-18',
        false, 'normal', false
      );
      insert into public.aula_alunos_emusys values (500, 100, 10);
      insert into public.presenca_politicas_confiabilidade values (
        '11111111-1111-1111-1111-111111111111', true,
        '2026-01-01', '2026-12-31', false, now()
      );

      -- Registro antigo com o mesmo id externo, mas de outra ocorrencia.
      insert into public.vw_aluno_presenca_semantica_v1 values (
        1, '11111111-1111-1111-1111-111111111111', 500,
        '2026-07-07', 10, 'falta_confirmada', true, '2026-07-07 20:00+00'
      );
      -- Chamada da aula de 18/07, registrada dez dias depois: deve contar.
      insert into public.vw_aluno_presenca_semantica_v1 values (
        1, '11111111-1111-1111-1111-111111111111', 500,
        '2026-07-18', 10, 'presente', true, '2026-07-28 20:00+00'
      );
    `;
    const applied = psql(container, setup);
    assert.equal(applied.status, 0, applied.stderr);

    const result = psql(container, `
      select valor_bruto || '|' || numerador || '|' || denominador
      from public.get_health_score_professor_v3_presenca_periodo_v2(
        '2026-07-01', '11111111-1111-1111-1111-111111111111', 'mensal'
      ) where professor_id = 1;
    `);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), '100.00|1|1');
  } finally {
    docker(['stop', container]);
  }
});

test('PostgreSQL usa o ultimo mes alcancado como fotografia dos KPIs de estado', async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel');
    return;
  }

  const container = `la-health-fotografia-${process.pid}`;
  const started = docker([
    'run', '--rm', '--name', container,
    '-e', 'POSTGRES_PASSWORD=postgres', '-d', 'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr);

  try {
    await waitForPostgres(container);

    const migration = fs.readFileSync(migrationPath, 'utf8');
    const wrapper = extractFunction(
      migration,
      'get_health_score_professor_v3_metricas_segmentadas_agregadas_v1',
    );
    const setup = `
      create schema if not exists public;
      create function public.fn_health_score_v3_periodo(date, text)
      returns table (
        periodicidade text, periodo_inicio date, periodo_fim date,
        ciclo_codigo text, periodo_label text
      ) language sql stable as $$
        select $2,
          date_trunc('month', $1)::date,
          (date_trunc('month', $1) + interval '3 months - 1 day')::date,
          'TESTE', 'Teste'
      $$;
      create function public.get_hs_prof_v3_segmentadas_agregadas_before_snapshot_20260804(
        date, uuid, uuid, text
      ) returns table (
        metrica text, professor_id integer, professor_nome text, unidade_id uuid,
        competencia date, valor_bruto numeric, numerador numeric, denominador numeric,
        amostra integer, estado_base text, publicavel boolean, confianca text,
        fonte text, regra_versao text, motivo_sem_base text, detalhes jsonb, nota numeric
      ) language sql stable as $$
        select metricas.metrica, 1, 'Professora Teste', $3,
          date_trunc('month', $1)::date,
          case
            when metricas.metrica = 'media_turma'
              then extract(month from $1)::numeric
            else 34::numeric
          end,
          10::numeric, 8::numeric,
          8, 'ok', true, 'alta', 'fixture', 'fixture', null::text,
          jsonb_build_object('periodicidade_recebida', $4), 80::numeric
        from (values ('media_turma'::text), ('conversao'::text)) metricas(metrica)
      $$;

      ${wrapper}
    `;
    const applied = psql(container, setup);
    assert.equal(applied.status, 0, applied.stderr);

    const result = psql(container, `
      with recorte as (
        select (date_trunc('month', current_date) - interval '1 month')::date as inicio
      )
      select string_agg(
        metrica || '=' || valor_bruto || ':'
          || (detalhes ->> 'periodicidade_recebida') || ':'
          || coalesce(detalhes ->> 'semantica_ciclo', 'acumulado'),
        ',' order by metrica
      )
      from recorte,
      lateral public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
        recorte.inicio,
        '22222222-2222-2222-2222-222222222222',
        '11111111-1111-1111-1111-111111111111',
        'ciclo'
      );
    `);
    assert.equal(result.status, 0, result.stderr);
    const expectedMonth = String(new Date().getMonth() + 1);
    assert.equal(
      result.stdout.trim(),
      `conversao=34:ciclo:acumulado,media_turma=${expectedMonth}:mensal:fotografia_fim_recorte`,
    );
  } finally {
    docker(['stop', container]);
  }
});
