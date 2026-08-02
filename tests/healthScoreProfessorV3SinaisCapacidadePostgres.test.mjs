import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  root,
  'supabase/migrations/20260802191000_health_score_v3_sinais_capacidade.sql',
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

const fixture = `
  create schema auth;
  create role anon;
  create role authenticated;
  create role service_role;
  create function auth.role() returns text language sql stable
    as $$ select 'service_role'::text $$;

  create table public.unidades (id uuid primary key);
  create table public.professores (id integer primary key);
  create table public.cursos (id integer primary key, nome text);
  create table public.salas (
    id integer primary key, unidade_id uuid not null, nome text,
    capacidade_maxima integer, ativo boolean not null default true
  );
  create table public.turmas_explicitas (
    id integer primary key, tipo text, nome text, professor_id integer,
    curso_id integer, dia_semana text, horario_inicio time,
    sala_id integer, unidade_id uuid, capacidade_maxima integer,
    ativo boolean not null default true
  );
  create table public.professores_unidades (
    professor_id integer, unidade_id uuid, disponibilidade jsonb,
    primary key (professor_id, unidade_id)
  );
  create table public.health_score_professor_v3_config_versoes (
    id uuid primary key, versao integer, status text, vigencia_inicio date,
    vigencia_fim date
  );
  create table public.health_score_professor_v3_config_metas_curso_modalidade (
    config_id uuid, unidade_id uuid, curso_id integer, modalidade text,
    estado text, capacidade_maxima numeric
  );

  insert into public.unidades values ('10000000-0000-0000-0000-000000000001');
  insert into public.professores values (1), (2);
  insert into public.cursos values (10, 'Bateria');
  insert into public.salas values
    (100, '10000000-0000-0000-0000-000000000001', 'Sala grande', 4, true);
  insert into public.turmas_explicitas values
    (200, 'turma', 'bateria sabado', 2, 10, 'sabado', '10:00', 100,
     '10000000-0000-0000-0000-000000000001', 2, true);
  insert into public.professores_unidades values
    (1, '10000000-0000-0000-0000-000000000001', '{"sabado":true}'),
    (2, '10000000-0000-0000-0000-000000000001', '{}');
  insert into public.health_score_professor_v3_config_versoes values
    ('30000000-0000-0000-0000-000000000001', 1, 'ativa', '2026-06-01', null);
  insert into public.health_score_professor_v3_config_metas_curso_modalidade values
    ('30000000-0000-0000-0000-000000000001',
     '10000000-0000-0000-0000-000000000001', 10, 'turma', 'configurada', 3);

  create function public.fn_health_score_professor_v3_ator_gerenciador()
  returns integer language sql stable as $$ select null::integer $$;

  create function public.get_carteira_professor_periodo_detalhe_canonico_v1(
    p_ano integer, p_mes integer, p_unidade_id uuid,
    p_data_inicio date, p_data_fim date
  ) returns table (
    professor_id integer, unidade_id uuid, pessoa_chave text,
    curso_id integer, modalidade text, turma_chave text,
    elegivel_media boolean, curso_resolvido boolean,
    modalidade_resolvida boolean
  ) language sql stable as $$
    select * from (values
      (2, p_unidade_id, 'aluno-1', 10, 'turma', 'turma:10:bateria sabado', true, true, true),
      (2, p_unidade_id, 'aluno-2', 10, 'turma', 'turma:10:bateria sabado', true, true, true),
      (2, p_unidade_id, 'aluno-3', 10, 'turma', 'turma:10:bateria sabado', true, true, true)
    ) v(professor_id, unidade_id, pessoa_chave, curso_id, modalidade,
        turma_chave, elegivel_media, curso_resolvido, modalidade_resolvida)
  $$;

  create function public.get_health_score_professor_v3_performance(
    p_competencia date, p_unidade_id uuid, p_periodicidade text
  ) returns table (
    professor_id integer, unidade_id uuid, estado text, score numeric,
    metrica text, valor_bruto numeric, meta numeric, codigo_evidencia text
  ) language sql stable as $$
    select * from (values
      (1, p_unidade_id, 'provisorio', 90::numeric, 'numero_alunos', 10::numeric, null::numeric, 'diagnostico_carteira'),
      (1, p_unidade_id, 'provisorio', 90::numeric, 'retencao', 95::numeric, 90::numeric, 'evidencia_valida'),
      (1, p_unidade_id, 'provisorio', 90::numeric, 'presenca', 90::numeric, 80::numeric, 'evidencia_valida'),
      (2, p_unidade_id, 'provisorio', 70::numeric, 'numero_alunos', 40::numeric, null::numeric, 'diagnostico_carteira'),
      (2, p_unidade_id, 'provisorio', 70::numeric, 'retencao', 80::numeric, 90::numeric, 'evidencia_valida'),
      (2, p_unidade_id, 'provisorio', 70::numeric, 'presenca', 70::numeric, 80::numeric, 'evidencia_valida')
    ) v(professor_id, unidade_id, estado, score, metrica, valor_bruto, meta, codigo_evidencia)
  $$;
`;

test('PostgreSQL resolve capacidade fisica e produz sinais sem pontuar carteira', { timeout: 90_000 }, async (t) => {
  assert.equal(fs.existsSync(migrationPath), true, 'migration de sinais deve existir');
  const migration = fs.readFileSync(migrationPath, 'utf8');
  const version = docker(['version', '--format', '{{.Server.Version}}']);
  if (version.status !== 0) {
    t.skip('Docker indisponivel');
    return;
  }

  const container = `la-report-health-v3-signals-${process.pid}-${Date.now()}`;
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
    const applied = psql(container, migration);
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);

    const resolved = psql(container, `
      select jsonb_agg(x order by x->>'caso') from (
        select jsonb_build_object('caso','curso','valor',
          public.resolver_health_score_professor_v3_capacidade(null,4,3,8)) x
        union all
        select jsonb_build_object('caso','segmento','valor',
          public.resolver_health_score_professor_v3_capacidade(null,null,null,3))
        union all
        select jsonb_build_object('caso','turma','valor',
          public.resolver_health_score_professor_v3_capacidade(2,4,3,8))
      ) q;
    `);
    assert.equal(resolved.status, 0, resolved.stderr || resolved.stdout);
    const capacities = new Map(
      JSON.parse(resolved.stdout.trim()).map((item) => [item.caso, item.valor]),
    );
    assert.equal(capacities.get('turma').capacidade, 2);
    assert.equal(capacities.get('turma').fonte, 'turma');
    assert.equal(capacities.get('curso').capacidade, 3);
    assert.equal(capacities.get('curso').fonte, 'curso');
    assert.equal(capacities.get('segmento').fonte, 'estimada_segmento');

    const diagnostic = psql(container, `
      select ocupacoes_unicas, capacidade, fonte_capacidade,
             capacidade_fisica, capacidade_excedida
      from public.get_health_score_professor_v3_capacidade_diagnostico(
        '2026-07-01', '10000000-0000-0000-0000-000000000001'
      );
    `);
    assert.equal(diagnostic.status, 0, diagnostic.stderr || diagnostic.stdout);
    assert.match(diagnostic.stdout, /^3\|2\|turma\|t\|t/m);

    const signals = psql(container, `
      select professor_id, sinal
      from public.get_health_score_professor_v3_sinais(
        '2026-07-01', '10000000-0000-0000-0000-000000000001'
      ) order by professor_id, sinal;
    `);
    assert.equal(signals.status, 0, signals.stderr || signals.stdout);
    assert.match(signals.stdout, /1\|oportunidade_distribuicao/);
    assert.match(signals.stdout, /2\|possivel_sobrecarga/);
    assert.match(signals.stdout, /2\|concentracao_operacional/);
  } finally {
    docker(['stop', container]);
  }
});
