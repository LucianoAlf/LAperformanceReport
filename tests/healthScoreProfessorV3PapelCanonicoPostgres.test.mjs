import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const migrationPath = new URL(
  '../supabase/migrations/20260813270100_health_score_v3_leitor_papel_canonico.sql',
  import.meta.url,
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
    if (psql(container, 'select 1;').status === 0) {
      // O PostgreSQL provisório do initdb aceita uma conexão e reinicia em
      // seguida. Só liberar o fixture depois da segunda conexão estável.
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      if (psql(container, 'select 1;').status === 0) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('PostgreSQL de teste nao iniciou a tempo');
}

test('leitor canonico expõe julho e recalcula cobertura sobre cinco pilares sem alterar snapshot', { timeout: 120_000 }, async (t) => {
  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  const container = `la-health-v3-reader-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres',
    'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  const unitId = '10000000-0000-0000-0000-000000000001';
  const configId = '20000000-0000-0000-0000-000000000001';
  const snapshotId = '30000000-0000-0000-0000-000000000001';

  try {
    await waitForPostgres(container);
    const setup = psql(container, `
      create role anon;
      create role authenticated;
      create role service_role;

      create table public.unidades (id uuid primary key, ativo boolean not null);
      create table public.professores (id integer primary key, ativo boolean not null);
      create table public.professores_unidades (
        professor_id integer not null,
        unidade_id uuid not null,
        emusys_ativo boolean not null,
        validacao_status text
      );
      insert into public.unidades values ('${unitId}', true);
      insert into public.professores values (7, true);
      insert into public.professores_unidades values (7, '${unitId}', true, 'validado');

      create table public.health_score_professor_v3_config_versoes (
        id uuid primary key,
        versao integer not null,
        status text not null,
        vigencia_inicio date not null,
        vigencia_fim date,
        cobertura_minima numeric,
        pilares_minimos integer,
        faixa_atencao_min numeric,
        faixa_saudavel_min numeric,
        exige_pilar_fidelizacao boolean
      );
      insert into public.health_score_professor_v3_config_versoes values
        ('${configId}', 4, 'ativa', '2026-06-01', '2026-08-31', 60, 3, 50, 70, true);

      create table public.health_score_professor_v3_snapshots (
        id uuid primary key,
        professor_id integer not null,
        unidade_id uuid,
        escopo text not null,
        competencia date not null,
        trimestre_inicio date not null,
        periodicidade text not null,
        periodo_inicio date not null,
        periodo_fim date not null,
        ciclo_codigo text,
        estado_publicacao text not null,
        score_exibivel boolean not null default true,
        ranking_habilitado boolean not null default false,
        config_id uuid not null,
        config_versao integer not null,
        revisao integer not null,
        score numeric,
        cobertura numeric not null,
        classificacao text,
        estado text not null,
        publicavel boolean not null default false,
        publicado boolean not null default false,
        motivo_bloqueio text,
        regra_versao text,
        competencia_referencia date,
        score_referencia numeric,
        classificacao_referencia text,
        criado_em timestamptz not null default now()
      );
      insert into public.health_score_professor_v3_snapshots (
        id, professor_id, unidade_id, escopo, competencia, trimestre_inicio,
        periodicidade, periodo_inicio, periodo_fim, ciclo_codigo,
        estado_publicacao, score_exibivel, ranking_habilitado, config_id,
        config_versao, revisao, score, cobertura, classificacao, estado,
        publicavel, publicado, motivo_bloqueio, regra_versao
      ) values (
        '${snapshotId}', 7, '${unitId}', 'unidade', '2026-07-01', '2026-07-01',
        'mensal', '2026-07-01', '2026-07-31', '2026-07',
        'parcial', true, false, '${configId}', 4, 1, 82, 50, 'sem_base',
        'provisorio', false, false, 'cobertura_insuficiente', 'fixture'
      );

      create table public.health_score_professor_v3_snapshot_metricas (
        id uuid primary key default gen_random_uuid(),
        snapshot_id uuid not null,
        metrica text not null,
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
        detalhes jsonb default '{}'::jsonb,
        criado_em timestamptz default now()
      );
      insert into public.health_score_professor_v3_snapshot_metricas (
        snapshot_id, metrica, valor_bruto, nota, peso, peso_disponivel,
        peso_efetivo, contribuicao, meta_aplicada, amostra, estado_base,
        publicavel, confianca, fonte, regra_versao, codigo_evidencia, papel
      ) values
        ('${snapshotId}', 'retencao', 90, 90, 25, true, 25, 25, 90, 10, 'ok', true, 'alta', 'fixture', 'fixture', 'evidencia_valida', 'nota'),
        ('${snapshotId}', 'permanencia', 88, 88, 25, true, 25, 25, 12, 10, 'ok', true, 'alta', 'fixture', 'fixture', 'evidencia_valida', 'nota'),
        ('${snapshotId}', 'media_turma', 86, 86, 15, true, 15, 15, 2, 10, 'ok', true, 'alta', 'fixture', 'fixture', 'evidencia_valida', 'nota'),
        ('${snapshotId}', 'numero_alunos', 20, null, 10, false, 0, null, 20, 20, 'ok', true, 'alta', 'fixture', 'fixture', 'diagnostico_carteira', 'nota'),
        ('${snapshotId}', 'conversao', null, null, 15, false, 0, null, 70, 0, 'sem_base', false, 'sem_base', 'fixture', 'fixture', 'sem_base', 'nota'),
        ('${snapshotId}', 'presenca', null, null, 10, false, 0, null, 80, 0, 'sem_base', false, 'sem_base', 'fixture', 'fixture', 'sem_base', 'nota');

      create function public.calcular_health_score_professor_v3_cobertura_pilares(integer, integer)
      returns numeric language sql immutable as $$
        select case when $2 <= 0 then 0::numeric else round($1 * 100.0 / $2, 1) end
      $$;
      create function public.fn_health_score_professor_v3_config_fingerprint_comparabilidade(uuid)
      returns text language sql immutable as $$ select 'fixture-fingerprint'::text $$;
      create function public.avaliar_health_score_professor_v3_comparabilidade(
        numeric, numeric, integer, boolean, numeric, integer, boolean
      ) returns jsonb language sql immutable as $$
        select case when $1 is not null and $2 >= $5 and $3 >= $6 and $4 and $7
          then jsonb_build_object('estado', 'comparavel', 'motivo', 'criterios_atendidos', 'motivos', '[]'::jsonb)
          else jsonb_build_object('estado', 'em_maturacao', 'motivo', 'cobertura_insuficiente', 'motivos', '["cobertura_insuficiente"]'::jsonb)
        end
      $$;
    `);
    assert.equal(setup.status, 0, setup.stderr || setup.stdout);

    const migration = await readFile(migrationPath, 'utf8');
    const applied = psql(container, migration);
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);

    const result = psql(container, `
      select jsonb_agg(jsonb_build_object(
        'metrica', metrica,
        'papel', papel,
        'cobertura', cobertura,
        'validos', pilares_validos,
        'esperados', pilares_esperados,
        'estado', comparabilidade_estado,
        'score_comparavel', score_comparavel
      ) order by metrica)::text
      from public.get_health_score_professor_v3_performance_snapshot_v3(
        '2026-07-01', '${unitId}', 'mensal'
      );
    `);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const rows = JSON.parse(result.stdout.trim());
    assert.equal(rows.length, 6);
    assert.ok(rows.every((row) => row.cobertura === 60));
    assert.ok(rows.every((row) => row.validos === 3));
    assert.ok(rows.every((row) => row.esperados === 5));
    assert.ok(rows.every((row) => row.estado === 'comparavel'));
    assert.ok(rows.every((row) => row.score_comparavel === 82));
    assert.equal(rows.find((row) => row.metrica === 'numero_alunos').papel, 'diagnostico');

    const immutableCheck = psql(container, `
      select cobertura::text from public.health_score_professor_v3_snapshots
      where id = '${snapshotId}';
    `);
    assert.equal(immutableCheck.status, 0, immutableCheck.stderr || immutableCheck.stdout);
    assert.equal(immutableCheck.stdout.trim(), '50');
  } finally {
    docker(['stop', container]);
  }
});
