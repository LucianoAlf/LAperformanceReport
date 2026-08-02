import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  root,
  'supabase/migrations/20260802192000_relatorio_coordenacao_canonico.sql',
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
    const ready = psql(container, 'select 1;');
    if (ready.status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('PostgreSQL de teste nao iniciou a tempo');
}

const fixture = String.raw`
  create schema auth;
  create role anon;
  create role authenticated;
  create role service_role;

  create table public.unidades (id uuid primary key, nome text not null);
  create table public.professores (id integer primary key, nome text not null, ativo boolean not null);
  create table public.professores_unidades (
    professor_id integer not null,
    unidade_id uuid not null,
    emusys_ativo boolean not null,
    validacao_status text
  );
  create table public.professor_acoes (
    id uuid,
    professor_id integer,
    unidade_id uuid,
    tipo text,
    titulo text,
    status text,
    data_agendada timestamptz
  );
  create table public.catalogo_treinamentos (
    id uuid,
    nome text,
    descricao text,
    foco text,
    ativo boolean
  );

  insert into public.unidades values ('10000000-0000-0000-0000-000000000001', 'Recreio');
  insert into public.professores values
    (1, 'Professor Oficial', true),
    (2, 'Professor Parcial', true),
    (3, 'Professor em Maturacao', true),
    (4, 'Professor sem Experimental', true),
    (5, 'Professor sem Fonte', true),
    (6, 'Professor Inativo', false);
  insert into public.professores_unidades
  select id, '10000000-0000-0000-0000-000000000001', true, 'validado'
  from public.professores;
  insert into public.catalogo_treinamentos values
    ('20000000-0000-0000-0000-000000000001', 'Engajamento em Aula', 'Apoio pedagogico', 'presenca', true);

  create function public.fn_health_score_professor_v3_ator_leitura(uuid)
  returns integer language sql stable as $$ select 1 $$;

  create function public.get_health_score_professor_v3_performance(date, uuid, text)
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
    papel text, detalhes jsonb
  ) language sql stable as $$
    select * from (values
      (1, $2, 'unidade', date '2026-07-01', date '2026-07-01', 'mensal', date '2026-07-01', date '2026-07-31', '2026-Q3', 'oficial', true, true, 4, 2, 92::numeric, 100::numeric, 'saudavel', 'fechado', true, true, null, 'fixture', 'retencao', 95::numeric, 19::numeric, 20::numeric, 95::numeric, 25::numeric, true, 25::numeric, 23.75::numeric, 90::numeric, 20, 'valida', true, 'alta', 'fixture', 'fixture', null, 'evidencia_valida', 'nota', '{}'::jsonb),
      (1, $2, 'unidade', date '2026-07-01', date '2026-07-01', 'mensal', date '2026-07-01', date '2026-07-31', '2026-Q3', 'oficial', true, true, 4, 2, 92::numeric, 100::numeric, 'saudavel', 'fechado', true, true, null, 'fixture', 'numero_alunos', 30::numeric, 30::numeric, 30::numeric, null, 10::numeric, false, 0::numeric, null, 25::numeric, 30, 'valida', true, 'alta', 'fixture', 'fixture', null, 'evidencia_valida', 'diagnostico', '{}'::jsonb),
      (2, $2, 'unidade', date '2026-07-01', date '2026-07-01', 'mensal', date '2026-07-01', date '2026-07-31', '2026-Q3', 'parcial', true, false, 4, 2, 78::numeric, 65::numeric, 'atencao', 'provisorio', true, false, null, 'fixture', 'presenca', 78::numeric, 78::numeric, 100::numeric, 78::numeric, 10::numeric, true, 100::numeric, 78::numeric, 80::numeric, 100, 'valida', true, 'media', 'fixture', 'fixture', null, 'evidencia_valida', 'nota', '{}'::jsonb),
      (3, $2, 'unidade', date '2026-07-01', date '2026-07-01', 'mensal', date '2026-07-01', date '2026-07-31', '2026-Q3', 'parcial', true, false, 4, 2, 80::numeric, 25::numeric, 'atencao', 'em_maturacao', true, false, null, 'fixture', 'permanencia', 3::numeric, 3::numeric, 1::numeric, 80::numeric, 25::numeric, true, 100::numeric, 80::numeric, 12::numeric, 1, 'provisorio', true, 'media', 'fixture', 'fixture', 'professor em maturacao', 'professor_em_maturacao', 'nota', '{}'::jsonb),
      (4, $2, 'unidade', date '2026-07-01', date '2026-07-01', 'mensal', date '2026-07-01', date '2026-07-31', '2026-Q3', 'parcial', false, false, 4, 2, null::numeric, 0::numeric, 'sem_base', 'provisorio', false, false, 'sem experimental', 'fixture', 'conversao', null::numeric, 0::numeric, 0::numeric, null::numeric, 15::numeric, false, 0::numeric, null::numeric, 70::numeric, 0, 'sem_base', false, 'baixa', 'fixture', 'fixture', 'sem experimental no periodo', 'sem_experimental_periodo', 'nota', '{}'::jsonb)
    ) v;
  $$;

  create function public.get_health_score_professor_v3_sinais(date, uuid)
  returns table (professor_id integer, unidade_id uuid, sinal text, severidade text, evidencias jsonb)
  language sql stable as $$
    values (2, $2, 'possivel_sobrecarga', 'medio', '{"carteira":30,"motivo":"apoio_pedagogico"}'::jsonb)
  $$;
`;

test('produtor inclui toda a equipe e não expõe finanças', { timeout: 90_000 }, async (t) => {
  assert.equal(fs.existsSync(migrationPath), true, 'migration canônica deve existir');
  const migration = fs.readFileSync(migrationPath, 'utf8');

  const version = docker(['version', '--format', '{{.Server.Version}}']);
  if (version.status !== 0) {
    t.skip('Docker indisponível para fixture PostgreSQL');
    return;
  }

  const container = `la-coord-canon-${process.pid}-${Date.now()}`;
  const run = docker(['run', '--rm', '-d', '--name', container, '-e', 'POSTGRES_PASSWORD=postgres', 'postgres:17-alpine']);
  assert.equal(run.status, 0, run.stderr);
  t.after(() => docker(['rm', '-f', container]));
  await waitForPostgres(container);

  const apply = psql(container, `${fixture}\n${migration}`);
  assert.equal(apply.status, 0, apply.stderr);

  const query = psql(container, String.raw`
    set role authenticated;
    select public.get_relatorio_coordenacao_canonico_v1(
      '10000000-0000-0000-0000-000000000001', 2026, 7
    )::text;
  `);
  assert.equal(query.status, 0, query.stderr);
  const payload = JSON.parse(query.stdout.trim().split(/\r?\n/).at(-1));

  assert.equal(payload.schema_version, 1);
  assert.deepEqual(payload.professores.map((p) => p.nome), [
    'Professor Oficial',
    'Professor Parcial',
    'Professor em Maturacao',
    'Professor sem Experimental',
    'Professor sem Fonte',
  ]);
  assert.equal(payload.professores.at(-1).estado_evidencia, 'fonte_canonica_indisponivel');
  assert.equal(payload.professores[3].metricas.conversao.codigo_evidencia, 'sem_experimental_periodo');
  assert.equal(payload.ranking_oficial.length, 1);
  assert.equal(payload.ranking_oficial[0].nome, 'Professor Oficial');
  assert.equal(payload.periodo.contexto_operacional, 'recesso_parcial');

  const serialized = JSON.stringify(payload).toLowerCase();
  for (const forbidden of ['mrr', 'ticket', 'faturamento', 'parcela', 'financeiro']) {
    assert.equal(serialized.includes(forbidden), false, `payload não pode conter ${forbidden}`);
  }
});

