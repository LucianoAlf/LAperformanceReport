import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  root,
  'supabase/migrations/20260803223000_relatorios_coordenacao_periodicidade_canonica.sql',
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
  create role anon;
  create role authenticated;
  create role service_role;

  create table public.professores (id integer primary key, nome text not null);
  create table public.alunos (
    id integer primary key,
    nome text not null,
    is_segundo_curso boolean not null default false
  );
  create table public.motivos_saida (
    id integer primary key,
    nome text not null,
    ativo boolean not null default true,
    conta_score_professor boolean not null default false
  );
  create table public.movimentacoes_admin (
    id integer primary key,
    data date not null,
    tipo text not null,
    unidade_id uuid,
    aluno_id integer,
    aluno_nome text,
    professor_id integer,
    motivo text,
    motivo_saida_id integer,
    valor_parcela_evasao numeric,
    valor_parcela_anterior numeric
  );

  create function public.fn_health_score_v3_periodo(date, text)
  returns table (
    periodicidade text,
    periodo_inicio date,
    periodo_fim date,
    ciclo_codigo text,
    periodo_label text
  ) language sql stable as $$
    select
      $2,
      case when $2 = 'ciclo' then date '2026-06-01' else date_trunc('month', $1)::date end,
      case when $2 = 'ciclo' then date '2026-08-31'
        else (date_trunc('month', $1) + interval '1 month - 1 day')::date end,
      case when $2 = 'ciclo' then 'jun-jul-ago' else to_char($1, 'YYYY-MM') end,
      case when $2 = 'ciclo' then 'Jun / Jul / Ago' else to_char($1, 'MM/YYYY') end
  $$;

  create function public.get_relatorio_coordenacao_canonico_v2(uuid, integer, integer)
  returns jsonb language sql stable as $$
    select jsonb_build_object(
      'schema_version', 2,
      'periodo', jsonb_build_object(
        'unidade_id', $1,
        'unidade_nome', 'Recreio',
        'ano', $2,
        'mes', $3,
        'coordenadores', jsonb_build_array('Quintela', 'Juliana')
      ),
      'professores', jsonb_build_array(
        jsonb_build_object('professor_id', 1, 'nome', 'Professor Teste')
      ),
      'mapa_sinais', jsonb_build_array(
        jsonb_build_object(
          'professor_id', 1,
          'professor', 'Professor Teste',
          'sinal', 'capacidade_estimada_conferir',
          'evidencias', jsonb_build_object(
            'turmas', jsonb_build_array(jsonb_build_object('turma_id', 10))
          )
        )
      ),
      'agenda_treinamentos', '{}'::jsonb,
      'qualidade_dados', '{}'::jsonb,
      'auditoria', '{}'::jsonb
    )
  $$;

  create function public.get_health_score_professor_v3_performance(date, uuid, text)
  returns table (
    professor_id integer,
    metrica text,
    valor_bruto numeric,
    numerador numeric,
    denominador numeric,
    nota numeric,
    meta numeric,
    amostra integer,
    peso numeric,
    peso_disponivel boolean,
    peso_efetivo numeric,
    papel text,
    codigo_evidencia text,
    motivo_sem_base text,
    estado_base text,
    confianca text,
    fonte text,
    regra_versao_metrica text,
    detalhes jsonb,
    score_observado numeric,
    score_comparavel numeric,
    cobertura_normalizada numeric,
    classificacao text,
    estado_publicacao text,
    score_exibivel boolean,
    ranking_habilitado boolean,
    pilares_validos integer,
    pilares_esperados integer,
    comparabilidade_estado text,
    comparabilidade_motivo text,
    competencia_referencia date,
    score_referencia numeric,
    classificacao_referencia text,
    data_corte date,
    config_id uuid,
    regra_fingerprint text,
    peso_pontuavel_total numeric,
    peso_disponivel_total numeric,
    cobertura_minima_aplicada numeric,
    comparabilidade_motivos jsonb
  ) language sql stable as $$
    select
      1,
      v.metrica,
      v.valor_bruto,
      v.numerador,
      v.denominador,
      v.nota,
      v.meta,
      v.denominador::integer,
      v.peso,
      true,
      v.peso,
      case when v.metrica = 'numero_alunos' then 'diagnostico' else 'nota' end,
      'evidencia_valida',
      null::text,
      'valida',
      'alta',
      'fixture canônica',
      'fixture-v1',
      '{}'::jsonb,
      85::numeric,
      85::numeric,
      100::numeric,
      'saudavel',
      case when $3 = 'ciclo' then 'ciclo_em_acompanhamento' else 'em_andamento' end,
      true,
      false,
      5,
      5,
      'comparavel',
      null::text,
      $1,
      null::numeric,
      null::text,
      date '2026-08-03',
      '20000000-0000-0000-0000-000000000001'::uuid,
      'fixture-regra-v1',
      90::numeric,
      90::numeric,
      60::numeric,
      '[]'::jsonb
    from (values
      ('retencao', 90::numeric, 9::numeric, 10::numeric, 90::numeric, 90::numeric, 25::numeric),
      ('permanencia', 12::numeric, 120::numeric, 10::numeric, 100::numeric, 12::numeric, 25::numeric),
      ('conversao', 50::numeric, 2::numeric, 4::numeric, 71.4::numeric, 70::numeric, 15::numeric),
      ('media_turma', 1.2::numeric, 12::numeric, 10::numeric, 80::numeric, 1.5::numeric, 15::numeric),
      ('presenca', 80::numeric, 8::numeric, 10::numeric, 100::numeric, 80::numeric, 10::numeric),
      ('numero_alunos', 10::numeric, 10::numeric, 10::numeric, null::numeric, null::numeric, 0::numeric)
    ) v(metrica, valor_bruto, numerador, denominador, nota, meta, peso)
  $$;

  create function public.get_kpis_professor_periodo_canonico_v3(
    integer, integer, uuid, date, date
  ) returns table (
    professor_id integer,
    total_turmas integer,
    alunos_via_turmas integer,
    turmas_elegiveis_media integer,
    carteira_alunos integer
  ) language sql stable as $$
    select 1, 8, 10, 8, 10
  $$;

  create function public.is_movimentacao_admin_retencao_valida(integer)
  returns boolean language sql stable as $$ select true $$;

  create function public.fn_health_score_professor_v3_ator_leitura(uuid)
  returns integer language sql stable as $$ select 1 $$;

  insert into public.professores values (1, 'Professor Teste');
`;

test('PostgreSQL executa os contratos mensal e ciclo V3 com fatos brutos', { timeout: 90_000 }, async (t) => {
  const version = docker(['version', '--format', '{{.Server.Version}}']);
  if (version.status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  const migration = fs.readFileSync(migrationPath, 'utf8');
  const container = `la-coord-v3-${process.pid}-${Date.now()}`;
  const run = docker([
    'run', '--rm', '-d', '--name', container,
    '-e', 'POSTGRES_PASSWORD=postgres', 'postgres:17-alpine',
  ]);
  assert.equal(run.status, 0, run.stderr || run.stdout);
  t.after(() => docker(['rm', '-f', container]));
  await waitForPostgres(container);

  const apply = psql(container, `${fixture}\n${migration}`);
  assert.equal(apply.status, 0, apply.stderr || apply.stdout);

  const result = psql(container, String.raw`
    select jsonb_build_object(
      'mensal', public.montar_relatorio_coordenacao_payload_v3(null, 2026, 8, 'mensal'),
      'ciclo', public.montar_relatorio_coordenacao_payload_v3(null, 2026, 8, 'ciclo')
    )::text;
  `);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));

  assert.equal(payload.mensal.schema_version, 3);
  assert.equal(payload.mensal.periodo.periodicidade, 'mensal');
  assert.equal(payload.mensal.presenca.presenca_media, 80);
  assert.equal(payload.mensal.retencao_permanencia.retencao_media, 90);
  assert.equal(payload.mensal.experimentais.taxa_conversao_observada, 50);
  assert.equal(payload.mensal.carteira_carga.alunos_na_carteira, 10);
  assert.equal(payload.mensal.qualidade_dados.capacidade_estimada_pendente.professores_afetados, 1);
  assert.equal(payload.mensal.ranking_oficial, null);

  assert.equal(payload.ciclo.schema_version, 3);
  assert.equal(payload.ciclo.periodo.periodicidade, 'ciclo');
  assert.equal(payload.ciclo.periodo.inicio, '2026-06-01');
  assert.equal(payload.ciclo.periodo.fim, '2026-08-31');
  assert.equal(payload.ciclo.periodo.estado_publicacao, 'ciclo_em_acompanhamento');
  assert.equal(payload.ciclo.ranking_oficial, null);
});
