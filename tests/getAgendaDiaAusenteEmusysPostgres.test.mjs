import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .filter((file) => file.endsWith('_get_agenda_dia_oculta_ausente_emusys.sql'))
  .map((file) => path.join(root, 'supabase/migrations', file))
  .sort()
  .at(-1);

function docker(args, input) {
  return spawnSync('docker', args, {
    input,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
}

function psql(container, sql) {
  return docker([
    'exec', '-i', container,
    'psql', '--no-psqlrc', '-q', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'postgres', '-At',
  ], sql);
}

async function waitForPostgres(container) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (psql(container, 'select 1;').status === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      if (psql(container, 'select 1;').status === 0) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail('PostgreSQL de teste nao iniciou a tempo');
}

const agendaReturn = String.raw`
  chave text,
  unidade_id uuid,
  unidade_nome text,
  professor_nome text,
  professor_id integer,
  professor_foto_url text,
  sala_nome text,
  curso_nome text,
  turma_nome text,
  hora_inicio text,
  hora_fim text,
  duracao_minutos integer,
  categoria text,
  tipo text,
  cancelada boolean,
  justificada boolean,
  reagendada boolean,
  hora_original text,
  nr_da_aula integer,
  qtd_aulas_contrato integer,
  qtd_alunos integer,
  anotacoes text,
  anotacoes_fabio text,
  professor_presenca text,
  alunos jsonb,
  aula_ids integer[],
  cancelada_motivo text,
  cancelada_origem text,
  experimental_leads jsonb
`;

const fixture = String.raw`
  create extension if not exists unaccent;

  create role anon;
  create role authenticated;
  create role service_role;

  create table public.unidades (
    id uuid primary key,
    nome text not null
  );

  create table public.professores (
    id integer primary key,
    nome text,
    foto_url text
  );

  create table public.aulas_emusys (
    id integer primary key,
    emusys_id integer,
    unidade_id uuid not null,
    data_aula date not null,
    data_hora_inicio timestamptz not null,
    data_hora_fim timestamptz,
    duracao_minutos integer,
    tipo text,
    categoria text,
    turma_nome text,
    curso_emusys_id integer,
    curso_nome text,
    sala_nome text,
    professor_nome text,
    professor_id integer,
    cancelada boolean,
    nr_da_aula integer,
    qtd_alunos integer,
    anotacoes text,
    anotacoes_fabio text,
    matricula_disciplina_id integer,
    qtd_aulas_contrato integer,
    reagendada boolean,
    data_hora_inicio_original timestamptz,
    justificada boolean,
    professor_presenca text,
    cancelada_motivo text,
    cancelada_origem text,
    visivel_para_authenticated boolean not null default true
  );

  create table public.disciplinas_modalidade_fixture (
    emusys_disciplina_id integer,
    unidade_id uuid,
    modalidade text
  );
  create view public.vw_disciplinas_modalidade as
    select emusys_disciplina_id, unidade_id, modalidade
    from public.disciplinas_modalidade_fixture;

  create table public.aula_alunos_emusys (
    aula_emusys_id integer,
    aluno_id integer,
    aluno_nome text,
    aluno_nome_normalizado text
  );
  create table public.aluno_presenca (
    aula_emusys_id integer,
    aluno_id integer,
    status_presenca text,
    respondido_por text,
    emusys_presenca_bruta text
  );
  create table public.alunos (
    id integer primary key,
    nome text,
    foto_url text,
    data_nascimento date,
    responsavel_nome text,
    responsavel_telefone text,
    status text
  );
  create table public.aluno_jornada_matricula_disciplina (
    aluno_id integer,
    trancamento_data_inicial date,
    status_matricula text,
    inadimplente_emusys boolean
  );
  create table public.aluno_presenca_administrativo (
    aluno_id integer,
    aula_emusys_id integer,
    motivo text,
    evidencia_path text
  );
  create table public.aluno_reposicoes (
    aluno_id integer,
    status text
  );
  create table public.pesquisas_whatsapp (
    aluno_id integer,
    tipo text,
    nota integer,
    created_at timestamptz
  );
  create table public.risco_evasao_fixture (
    aluno_id integer,
    probabilidade numeric,
    calculado_em timestamptz
  );
  create view public.vw_risco_evasao_atual as
    select aluno_id, probabilidade, calculado_em
    from public.risco_evasao_fixture;
  create table public.jornada_atual_fixture (
    aluno_id integer,
    data_ultima_aula date
  );
  create view public.vw_jornada_aluno_atual as
    select aluno_id, data_ultima_aula
    from public.jornada_atual_fixture;

  create table public.lead_experimentais (
    id integer,
    lead_id integer,
    aluno_id integer,
    nome_aluno text,
    curso_interesse_id integer,
    unidade_id uuid,
    data_experimental date,
    horario_experimental time,
    professor_experimental_id integer,
    status text,
    observacoes text
  );
  create table public.cursos (id integer, nome text);
  create table public.leads (
    id integer,
    aluno_id integer,
    telefone text,
    canal_origem_id integer,
    faixa_etaria text
  );
  create table public.canais_origem (id integer, nome text);

  alter table public.aulas_emusys enable row level security;
  create policy aulas_emusys_authenticated on public.aulas_emusys
    for select to authenticated
    using (visivel_para_authenticated);
  create policy aulas_emusys_service_role on public.aulas_emusys
    for select to service_role
    using (true);

  grant usage on schema public to authenticated, service_role;
  grant select on all tables in schema public to authenticated, service_role;

  insert into public.unidades (id, nome)
  values ('11111111-1111-1111-1111-111111111111', 'Campo Grande');

  insert into public.professores (id, nome)
  values
    (1, 'Fantasma'),
    (2, 'Grupo Misto'),
    (3, 'Agenda Secretaria'),
    (4, 'Emusys Real'),
    (5, 'Ativa'),
    (6, 'Reativada'),
    (7, 'Restrita');

  insert into public.aulas_emusys (
    id, emusys_id, unidade_id, data_aula, data_hora_inicio, duracao_minutos,
    tipo, categoria, turma_nome, curso_emusys_id, curso_nome, sala_nome,
    professor_nome, professor_id, cancelada, nr_da_aula, qtd_alunos,
    matricula_disciplina_id, qtd_aulas_contrato, reagendada, justificada,
    cancelada_motivo, cancelada_origem, visivel_para_authenticated
  ) values
    (100, 515512, '11111111-1111-1111-1111-111111111111', '2026-08-15', '2026-08-15 12:00:00+00', 50,
     'turma', 'normal', 'G_Sa_09', 10, 'Guitarra T', 'Sala 13', 'Fantasma', 1, true, 1, 1,
     0, 40, false, false, 'Ausente na fotografia', 'sync_ausente_emusys', true),
    (101, 515513, '11111111-1111-1111-1111-111111111111', '2026-08-15', '2026-08-15 13:00:00+00', 50,
     'turma', 'normal', 'G_Sa_10', 10, 'Guitarra T', 'Sala 13', 'Grupo Misto', 2, true, 1, 1,
     0, 40, false, false, 'Ausente na fotografia', 'sync_ausente_emusys', true),
    (102, 680699, '11111111-1111-1111-1111-111111111111', '2026-08-15', '2026-08-15 13:00:00+00', 50,
     'turma', 'normal', 'G_Sa_10', 10, 'Guitarra T', 'Sala 13', 'Grupo Misto', 2, true, 1, 1,
     0, 40, false, false, null, null, true),
    (103, 700001, '11111111-1111-1111-1111-111111111111', '2026-08-15', '2026-08-15 14:00:00+00', 50,
     'turma', 'normal', 'P_Sa_14', 11, 'Piano T', 'Sala 1', 'Agenda Secretaria', 3, true, 1, 1,
     0, 40, false, false, 'Cancelada pela secretaria', 'agenda_secretaria', true),
    (104, 700002, '11111111-1111-1111-1111-111111111111', '2026-08-15', '2026-08-15 15:00:00+00', 50,
     'turma', 'normal', 'B_Sa_15', 12, 'Bateria T', 'Sala 2', 'Emusys Real', 4, true, 1, 1,
     0, 40, false, false, 'Cancelada no Emusys', 'emusys', true),
    (105, 700003, '11111111-1111-1111-1111-111111111111', '2026-08-15', '2026-08-15 16:00:00+00', 50,
     'turma', 'normal', 'C_Sa_16', 13, 'Canto T', 'Sala 3', 'Ativa', 5, false, 1, 1,
     0, 40, false, false, null, null, true),
    (106, 700004, '11111111-1111-1111-1111-111111111111', '2026-08-15', '2026-08-15 17:00:00+00', 50,
     'turma', 'normal', 'V_Sa_17', 14, 'Violao T', 'Sala 4', 'Reativada', 6, false, 1, 1,
     0, 40, false, false, null, 'sync_ausente_emusys', true),
    (107, 700005, '11111111-1111-1111-1111-111111111111', '2026-08-15', '2026-08-15 18:00:00+00', 50,
     'turma', 'normal', 'T_Sa_18', 15, 'Teclado T', 'Sala 5', 'Restrita', 7, false, 1, 1,
     0, 40, false, false, null, null, false);

  create function public.get_agenda_dia(
    p_data date,
    p_unidade_id uuid default null
  )
  returns table(${agendaReturn})
  language sql
  stable
  security invoker
  set search_path to 'public'
  as $function$
    with base as (
      select
        ae.*,
        u.nome as unidade_nome,
        md5(
          ae.unidade_id::text || '|' || coalesce(ae.professor_nome, '') || '|' ||
          coalesce(ae.sala_nome, '') || '|' || ae.data_hora_inicio::text || '|' ||
          coalesce(ae.duracao_minutos, 0)::text || '|' || coalesce(ae.curso_nome, '') || '|' ||
          coalesce(ae.turma_nome, '') || '|' || ae.cancelada::text
        ) as chave
      from public.aulas_emusys ae
      join public.unidades u on u.id = ae.unidade_id
      where ae.data_aula = p_data
        and (p_unidade_id is null or ae.unidade_id = p_unidade_id)
    ),
    agrupado as (
      select
        b.chave,
        b.unidade_id,
        b.unidade_nome,
        b.professor_nome,
        min(b.professor_id) as professor_id,
        null::text as professor_foto_url,
        b.sala_nome,
        b.curso_nome,
        b.turma_nome,
        b.data_hora_inicio,
        b.duracao_minutos,
        b.cancelada,
        min(b.categoria) as categoria,
        min(b.tipo) as tipo,
        bool_or(b.justificada) as justificada,
        bool_or(b.reagendada) as reagendada,
        min(b.nr_da_aula) as nr_da_aula,
        min(b.qtd_aulas_contrato) as qtd_aulas_contrato,
        max(b.qtd_alunos) as qtd_alunos,
        max(b.anotacoes) as anotacoes,
        max(b.anotacoes_fabio) as anotacoes_fabio,
        max(b.professor_presenca) as professor_presenca,
        array_agg(distinct b.id) as aula_ids,
        max(b.cancelada_motivo) as cancelada_motivo,
        min(b.cancelada_origem) as cancelada_origem
      from base b
      group by
        b.chave, b.unidade_id, b.unidade_nome, b.professor_nome, b.sala_nome,
        b.curso_nome, b.turma_nome, b.data_hora_inicio, b.duracao_minutos, b.cancelada
    )
    select
      a.chave,
      a.unidade_id,
      a.unidade_nome,
      a.professor_nome,
      a.professor_id,
      a.professor_foto_url,
      a.sala_nome,
      a.curso_nome,
      a.turma_nome,
      to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI'),
      to_char(
        (a.data_hora_inicio at time zone 'America/Sao_Paulo')
          + make_interval(mins => coalesce(a.duracao_minutos, 0)),
        'HH24:MI'
      ),
      a.duracao_minutos,
      a.categoria,
      a.tipo,
      a.cancelada,
      a.justificada,
      a.reagendada,
      null::text,
      a.nr_da_aula,
      a.qtd_aulas_contrato,
      a.qtd_alunos,
      a.anotacoes,
      a.anotacoes_fabio,
      a.professor_presenca,
      '[]'::jsonb,
      a.aula_ids,
      a.cancelada_motivo,
      a.cancelada_origem,
      '[]'::jsonb
    from agrupado a
    order by a.professor_nome nulls last, a.data_hora_inicio, a.sala_nome;
  $function$;

  revoke all on function public.get_agenda_dia(date, uuid)
    from public, anon, authenticated, service_role;
  grant execute on function public.get_agenda_dia(date, uuid)
    to authenticated, service_role;
`;

const snapshotSql = String.raw`
  select string_agg(
    id::text || '|' || coalesce(cancelada_origem, '<null>'),
    ',' order by id
  )
  from public.aulas_emusys;
`;

test('get_agenda_dia filtra stale antes da agregacao sem ampliar ACL ou RLS', async (t) => {
  assert.ok(migrationPath, 'falta migration get_agenda_dia_oculta_ausente_emusys');

  if (docker(['info']).status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  const container = `la-agenda-ausente-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--rm', '--name', container,
    '-e', 'POSTGRES_PASSWORD=postgres',
    '-d', 'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    const created = psql(container, fixture);
    assert.equal(created.status, 0, created.stderr || created.stdout);

    const before = psql(container, snapshotSql);
    assert.equal(before.status, 0, before.stderr || before.stdout);

    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    const migrated = psql(container, migrationSql);
    assert.equal(migrated.status, 0, migrated.stderr || migrated.stdout);
    const remigrated = psql(container, migrationSql);
    assert.equal(remigrated.status, 0, remigrated.stderr || remigrated.stdout);

    const after = psql(container, snapshotSql);
    assert.equal(after.status, 0, after.stderr || after.stdout);
    assert.equal(after.stdout, before.stdout, 'a migration nao pode alterar historico bruto');

    const result = psql(container, String.raw`
      set role authenticated;
      select string_agg(
        professor_nome || '|' || coalesce(cancelada_origem, '<null>') || '|' || array_to_string(aula_ids, ':'),
        ',' order by professor_nome
      )
      from public.get_agenda_dia('2026-08-15', '11111111-1111-1111-1111-111111111111');
      reset role;
      select
        (not prosecdef)::text || '|' ||
        has_function_privilege('authenticated', 'public.get_agenda_dia(date,uuid)', 'execute') || '|' ||
        has_function_privilege('service_role', 'public.get_agenda_dia(date,uuid)', 'execute') || '|' ||
        has_function_privilege('anon', 'public.get_agenda_dia(date,uuid)', 'execute') || '|' ||
        (to_regprocedure('public.get_agenda_dia_historico_sync_v1(date,uuid)') is null)::text
      from pg_proc
      where oid = 'public.get_agenda_dia(date,uuid)'::regprocedure;
      select pg_get_function_result('public.get_agenda_dia(date,uuid)'::regprocedure);
    `);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.deepEqual(result.stdout.trim().split(/\r?\n/u), [
      'Agenda Secretaria|agenda_secretaria|103,Ativa|<null>|105,Emusys Real|emusys|104,Grupo Misto|<null>|102,Reativada|sync_ausente_emusys|106',
      'true|true|true|false|true',
      'TABLE(chave text, unidade_id uuid, unidade_nome text, professor_nome text, professor_id integer, professor_foto_url text, sala_nome text, curso_nome text, turma_nome text, hora_inicio text, hora_fim text, duracao_minutos integer, categoria text, tipo text, cancelada boolean, justificada boolean, reagendada boolean, hora_original text, nr_da_aula integer, qtd_aulas_contrato integer, qtd_alunos integer, anotacoes text, anotacoes_fabio text, professor_presenca text, alunos jsonb, aula_ids integer[], cancelada_motivo text, cancelada_origem text, experimental_leads jsonb)',
    ]);
  } finally {
    docker(['stop', container]);
  }
});
