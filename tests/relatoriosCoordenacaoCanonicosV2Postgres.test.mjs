import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  root,
  'supabase/migrations/20260803110000_relatorios_coordenacao_canonicos_v2.sql',
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

const fixture = String.raw`
  create extension pgcrypto;
  create schema auth;
  create role anon;
  create role authenticated;
  create role service_role;

  create function auth.role() returns text language sql stable as $$
    select current_user::text
  $$;
  create function auth.uid() returns uuid language sql stable as $$
    select null::uuid
  $$;

  create table public.unidades (
    id uuid primary key,
    nome text not null,
    ativo boolean not null default true
  );
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
    unidade_id uuid not null,
    aluno_id integer,
    aluno_nome text,
    professor_id integer,
    motivo text,
    motivo_saida_id integer,
    valor_parcela_evasao numeric,
    valor_parcela_anterior numeric
  );
  create table public.fechamento_mensal_snapshots (
    id uuid primary key default gen_random_uuid(),
    ano integer not null,
    mes integer not null,
    escopo text not null,
    unidade_id uuid,
    dominio text not null,
    versao integer not null,
    status text not null,
    fonte text not null,
    payload jsonb not null,
    payload_hash text not null,
    financeiro_realizado_disponivel boolean not null default false,
    observacao text,
    capturado_em timestamptz not null default now(),
    capturado_por uuid,
    aprovado_em timestamptz,
    aprovado_por uuid,
    fechado_em timestamptz,
    fechado_por uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (ano, mes, escopo, unidade_id, dominio, versao)
  );
  create table public.fechamento_mensal_auditoria (
    id uuid primary key default gen_random_uuid(),
    snapshot_id uuid,
    ano integer not null,
    mes integer not null,
    escopo text not null,
    unidade_id uuid,
    acao text not null,
    detalhes jsonb not null default '{}'::jsonb,
    actor_id uuid,
    created_at timestamptz not null default now()
  );

  create function public.hash_jsonb_canonico(jsonb)
  returns text language sql stable as $$
    select encode(digest(coalesce($1, '{}'::jsonb)::text, 'sha256'), 'hex')
  $$;
  create function public.fn_health_score_professor_v3_ator_leitura(uuid)
  returns integer language sql stable as $$ select 1 $$;
  create function public.is_movimentacao_admin_retencao_valida(integer)
  returns boolean language sql stable as $$ select $1 <> 99 $$;

  create function public.get_relatorio_coordenacao_canonico_v1(uuid, integer, integer)
  returns jsonb language sql stable as $$
    select jsonb_build_object(
      'schema_version', 1,
      'periodo', jsonb_build_object(
        'unidade_id', $1,
        'unidade_nome', case when $1 is null then 'Consolidado' else 'Recreio' end,
        'ano', $2,
        'mes', $3,
        'inicio', make_date($2, $3, 1),
        'fim', (make_date($2, $3, 1) + interval '1 month - 1 day')::date
      ),
      'resumo_equipe', jsonb_build_object('total_professores', 2, 'com_score', 2),
      'professores', jsonb_build_array(
        jsonb_build_object('professor_id', 1, 'nome', 'Professor Um', 'score', 90),
        jsonb_build_object('professor_id', 2, 'nome', 'Professor Dois', 'score', 80)
      ),
      'carteira_carga', jsonb_build_object('alunos_na_carteira', 3),
      'retencao_permanencia', jsonb_build_object('retencao_media', 95),
      'presenca', jsonb_build_object('presenca_media', 80)
    )
  $$;

  create function public.get_kpis_professor_periodo_canonico_v3(
    integer, integer, uuid, date, date
  ) returns table (
    professor_id integer,
    total_turmas integer,
    alunos_via_turmas integer,
    turmas_elegiveis_media integer,
    carteira_alunos integer,
    evasoes_validas integer,
    nao_renovacoes_validas integer,
    saidas_validas_total integer,
    saidas_score_professor integer,
    mrr_perdido_total numeric,
    mrr_perdido_score numeric
  ) language sql stable as $$
    select * from (
      values
        (1, 2, 3, 2, 2, 1, 0, 1, 1, 100::numeric, 100::numeric),
        (2, 1, 1, 1, 1, 0, 1, 1, 0, 200::numeric, 0::numeric)
    ) unit_rows
    where $3 is not null
    union all
    select * from (
      values
        (1, 2, 3, 2, 2, 1, 0, 1, 1, 100::numeric, 100::numeric),
        (1, 4, 5, 3, 4, 0, 0, 0, 0, 0::numeric, 0::numeric),
        (2, 1, 1, 1, 1, 0, 1, 1, 0, 200::numeric, 0::numeric)
    ) consolidated_rows
    where $3 is null
  $$;

  insert into public.unidades values
    ('10000000-0000-0000-0000-000000000001', 'Recreio', true);
  insert into public.professores values
    (1, 'Professor Um'), (2, 'Professor Dois');
  insert into public.alunos values
    (1, 'Aluno Evasao', false),
    (2, 'Aluno Sem Professor', false),
    (3, 'Segundo Curso Ignorado', true);
  insert into public.motivos_saida values
    (1, 'Desistencia', true, true),
    (2, 'Nao renovou', true, false);
  insert into public.movimentacoes_admin values
    (1, '2026-07-10', 'evasao', '10000000-0000-0000-0000-000000000001', 1, null, 1, 'Desistencia', 1, 100, null),
    (2, '2026-07-20', 'nao_renovacao', '10000000-0000-0000-0000-000000000001', 2, null, null, 'Nao renovou', 2, null, 200),
    (3, '2026-07-21', 'evasao', '10000000-0000-0000-0000-000000000001', 3, null, 1, 'Desistencia', 1, 999, null),
    (99, '2026-07-22', 'evasao', '10000000-0000-0000-0000-000000000001', 1, null, 1, 'Desistencia', 1, 999, null);

  insert into public.fechamento_mensal_snapshots (
    ano, mes, escopo, unidade_id, dominio, versao, status, fonte, payload, payload_hash
  ) values (
    2026, 7, 'unidade', '10000000-0000-0000-0000-000000000001',
    'relatorio_coordenacao', 1, 'fechado', 'get_dados_relatorio_coordenacao',
    '{"schema_version":1,"preservado":true}'::jsonb,
    public.hash_jsonb_canonico('{"schema_version":1,"preservado":true}'::jsonb)
  );
`;

test('contrato V2 agrega consolidado, inclui saida sem professor e preserva snapshot anterior', { timeout: 90_000 }, async (t) => {
  const version = docker(['version', '--format', '{{.Server.Version}}']);
  if (version.status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  const migration = fs.readFileSync(migrationPath, 'utf8');
  const container = `la-coord-v2-${process.pid}-${Date.now()}`;
  const run = docker([
    'run', '--rm', '-d', '--name', container,
    '-e', 'POSTGRES_PASSWORD=postgres', 'postgres:17-alpine',
  ]);
  assert.equal(run.status, 0, run.stderr);
  t.after(() => docker(['rm', '-f', container]));
  await waitForPostgres(container);

  const apply = psql(container, `${fixture}\n${migration}`);
  assert.equal(apply.status, 0, apply.stderr);

  const live = psql(container, String.raw`
    select jsonb_build_object(
      'unidade', public.montar_relatorio_coordenacao_payload_v2(
        '10000000-0000-0000-0000-000000000001', 2026, 7
      ),
      'consolidado', public.montar_relatorio_coordenacao_payload_v2(null, 2026, 7)
    )::text;
  `);
  assert.equal(live.status, 0, live.stderr);
  const payload = JSON.parse(live.stdout.trim().split(/\r?\n/).at(-1));

  assert.equal(payload.unidade.schema_version, 2);
  assert.equal(payload.unidade.saidas_retencao.evasoes_validas, 1);
  assert.equal(payload.unidade.saidas_retencao.nao_renovacoes_validas, 1);
  assert.equal(payload.unidade.saidas_retencao.saidas_validas_total, 2);
  assert.equal(Number(payload.unidade.saidas_retencao.mrr_perdido_total), 300);
  assert.equal(payload.unidade.saidas_retencao.saidas_atribuiveis_professor, 1);
  assert.equal(Number(payload.unidade.saidas_retencao.mrr_perdido_atribuivel), 100);
  assert.equal(payload.unidade.saidas_retencao.movimentos.length, 2);
  assert.equal(payload.unidade.saidas_retencao.movimentos[1].professor_id, null);
  assert.equal(payload.unidade.carteira_carga.total_turmas_operacionais, 3);
  assert.equal(payload.consolidado.carteira_carga.total_turmas_operacionais, 7);
  assert.equal(
    payload.consolidado.professores.find((item) => item.professor_id === 1).operacional.total_turmas,
    6,
  );

  const closedBeforeCapture = psql(container, String.raw`
    set role authenticated;
    select public.get_relatorio_coordenacao_canonico_v2(
      '10000000-0000-0000-0000-000000000001', 2026, 7
    );
  `);
  assert.notEqual(closedBeforeCapture.status, 0);
  assert.match(closedBeforeCapture.stderr, /RELATORIO_COORDENACAO_V2_FECHADO_INDISPONIVEL/);

  const privateBuilder = psql(container, String.raw`
    set role service_role;
    select public.montar_relatorio_coordenacao_payload_v2(
      '10000000-0000-0000-0000-000000000001', 2026, 7
    );
  `);
  assert.notEqual(privateBuilder.status, 0);
  assert.match(privateBuilder.stderr, /permission denied/i);

  const capture = psql(container, String.raw`
    set role service_role;
    select public.capturar_relatorio_coordenacao_canonico_v2(2026, 7)::text;
  `);
  assert.equal(capture.status, 0, capture.stderr);
  const captureResult = JSON.parse(capture.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(captureResult.snapshots_capturados, 2);

  const audit = psql(container, String.raw`
    select jsonb_build_object(
      'snapshots', jsonb_agg(jsonb_build_object(
        'versao', versao,
        'fonte', fonte,
        'preservado', payload->'preservado',
        'schema_version', payload->'schema_version',
        'hash_ok', payload_hash = public.hash_jsonb_canonico(payload)
      ) order by versao),
      'fechado', public.get_relatorio_coordenacao_canonico_v2(
        '10000000-0000-0000-0000-000000000001', 2026, 7
      )
    )::text
    from public.fechamento_mensal_snapshots
    where ano = 2026 and mes = 7 and escopo = 'unidade';
  `);
  assert.equal(audit.status, 0, audit.stderr);
  const audited = JSON.parse(audit.stdout.trim().split(/\r?\n/).at(-1));
  assert.deepEqual(audited.snapshots.map((row) => row.versao), [1, 2]);
  assert.equal(audited.snapshots[0].preservado, true);
  assert.equal(audited.snapshots[0].schema_version, 1);
  assert.equal(audited.snapshots[1].schema_version, 2);
  assert.equal(audited.snapshots.every((row) => row.hash_ok), true);
  assert.equal(audited.fechado.auditoria.imutavel, true);
  assert.equal(audited.fechado.auditoria.versao, 2);

  const recapture = psql(container, String.raw`
    set role service_role;
    select public.capturar_relatorio_coordenacao_canonico_v2(2026, 7)::text;
  `);
  assert.equal(recapture.status, 0, recapture.stderr);
  assert.equal(JSON.parse(recapture.stdout.trim().split(/\r?\n/).at(-1)).snapshots_capturados, 0);
});
