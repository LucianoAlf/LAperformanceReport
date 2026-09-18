import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseMigrationPaths = [
  path.join(
    root,
    'supabase/migrations/20260918115015_central_notificacoes_operacionais.sql',
  ),
  path.join(
    root,
    'supabase/migrations/20260918120815_central_notificacoes_operacionais_acl.sql',
  ),
];
const rolloutMigrationPath = path.join(
  root,
  'supabase/migrations/20260918154358_central_notificacoes_operacionais_primeiro_dia.sql',
);
const migrationPaths = [...baseMigrationPaths, rolloutMigrationPath];

function docker(args, input) {
  return spawnSync('docker', args, {
    input,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 12 * 1024 * 1024,
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
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      if (psql(container, 'select 1;').status === 0) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail('PostgreSQL fixture did not start in time');
}

function jsonOutput(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const line = result.stdout
    .trim()
    .split(/\r?\n/u)
    .reverse()
    .find((value) => value.startsWith('{') || value.startsWith('['));
  assert.ok(line, `JSON output missing: ${result.stdout}`);
  return JSON.parse(line);
}

const fixtureSchema = String.raw`
  create role anon;
  create role authenticated;
  create role service_role;

  create table public.unidades (
    id uuid primary key,
    nome text not null
  );
  create table public.professores (
    id integer primary key,
    nome text not null
  );
  create table public.cursos (
    id integer primary key,
    nome text not null
  );
  create table public.alunos (
    id integer primary key,
    unidade_id uuid not null references public.unidades(id),
    nome text not null,
    professor_atual_id integer references public.professores(id),
    curso_id integer references public.cursos(id),
    data_matricula date,
    emusys_matricula_id text,
    lead_origem_id integer,
    emusys_lead_id text,
    status text,
    emusys_student_id text,
    data_nascimento date,
    arquivado_em timestamptz,
    operacional_ativo boolean not null default true
  );
  create table public.aulas_emusys (
    id integer primary key,
    emusys_id integer,
    unidade_id uuid not null references public.unidades(id),
    data_aula date not null,
    data_hora_inicio timestamptz not null,
    data_hora_fim timestamptz,
    tipo text,
    categoria text,
    turma_nome text,
    curso_emusys_id integer,
    curso_nome text,
    professor_id integer references public.professores(id),
    matricula_disciplina_id bigint,
    cancelada boolean not null default false,
    reagendada boolean not null default false,
    data_hora_inicio_original timestamptz,
    cancelada_motivo text,
    cancelada_em timestamptz
  );
  create table public.aula_alunos_emusys (
    aula_emusys_id integer not null references public.aulas_emusys(id),
    aluno_id integer references public.alunos(id),
    aluno_nome text,
    ativo_operacional boolean not null default true
  );
  create table public.aluno_jornada_matricula_disciplina (
    id uuid primary key,
    unidade_id uuid not null references public.unidades(id),
    aluno_id integer references public.alunos(id),
    emusys_aluno_id bigint,
    emusys_matricula_id bigint,
    emusys_matricula_disciplina_id bigint not null,
    emusys_disciplina_id bigint,
    curso_id integer references public.cursos(id),
    curso_nome_emusys text,
    professor_id integer references public.professores(id),
    status_matricula text not null default 'ativa',
    data_primeira_aula timestamptz,
    data_ultima_aula timestamptz,
    fonte_ultima_atualizacao text not null default 'sync-matriculas-emusys',
    ultima_sincronizacao_emusys timestamptz not null default now(),
    payload_snapshot jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now(),
    motivo_inativa text,
    trancamento_motivo text,
    trancamento_data_inicial date,
    trancamento_data_final date,
    unique (unidade_id, emusys_matricula_disciplina_id)
  );
  create table public.movimentacoes_admin (
    id integer primary key,
    unidade_id uuid not null references public.unidades(id),
    data date not null,
    tipo text not null,
    aluno_nome text not null,
    aluno_id integer references public.alunos(id),
    professor_id integer references public.professores(id),
    curso_id integer references public.cursos(id),
    motivo text,
    observacoes text,
    mes_saida date,
    data_prevista_saida date,
    emusys_matricula_id text,
    emusys_aviso_previo_id integer,
    anulado boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    origem_registro text not null default 'webhook'
  );
  create table public.lead_experimentais (
    id integer primary key,
    lead_id integer,
    nome_aluno text not null,
    unidade_id uuid not null references public.unidades(id),
    data_experimental date,
    horario_experimental time,
    professor_experimental_id integer references public.professores(id),
    curso_interesse_id integer references public.cursos(id),
    status text,
    aluno_id integer references public.alunos(id),
    emusys_lead_id integer,
    emusys_aula_id integer,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create table public.leads (
    id integer primary key,
    unidade_id uuid not null references public.unidades(id),
    aluno_id integer references public.alunos(id),
    emusys_lead_id integer,
    status text not null default 'novo'
  );
  create table public.aluno_professor_transicoes (
    id uuid primary key,
    unidade_id uuid not null references public.unidades(id),
    aluno_id integer references public.alunos(id),
    emusys_matricula_id bigint,
    emusys_matricula_disciplina_id bigint not null,
    curso_id integer references public.cursos(id),
    curso_anterior_id integer references public.cursos(id),
    professor_anterior_id integer references public.professores(id),
    professor_novo_id integer references public.professores(id),
    data_transicao timestamptz not null default now(),
    tipo_transicao text not null default 'troca_professor',
    descricao_emusys text,
    fonte text not null default 'webhook:matricula_alterada',
    created_at timestamptz not null default now()
  );
  create table public.emusys_aulas_historico_revisoes_v1 (
    id bigint generated always as identity primary key,
    aula_staging_id bigint not null,
    unidade_id uuid not null references public.unidades(id),
    emusys_aula_id bigint not null,
    payload jsonb not null,
    primeira_coleta_em timestamptz not null default now(),
    ultima_coleta_em timestamptz not null default now()
  );
  create table public.automacao_log (
    id bigint generated always as identity primary key,
    aluno_id integer references public.alunos(id),
    evento text,
    acao text,
    workflow_id text,
    created_at timestamptz not null default now()
  );

  create view public.vw_alunos_estado_operacional_v131 as
  select a.id as aluno_id,
         a.unidade_id,
         a.operacional_ativo as entra_carteira_professor
    from public.alunos a;

  insert into public.unidades values
    ('11111111-1111-1111-1111-111111111111', 'Recreio');
  insert into public.professores values
    (10, 'Professor um'), (20, 'Professor dois');
  insert into public.cursos values
    (1, 'Guitarra'), (2, 'Piano');
  insert into public.alunos
    (id, unidade_id, nome, emusys_student_id, data_nascimento, arquivado_em, operacional_ativo)
  values
    (1, '11111111-1111-1111-1111-111111111111', 'Aluno um', '1001', date '2012-12-30', null, true),
    (2, '11111111-1111-1111-1111-111111111111', 'Aluno duplicado', '1001', date '2012-12-30', null, true),
    (3, '11111111-1111-1111-1111-111111111111', 'Aluno arquivado', '1003', date '2012-12-31', now(), true),
    (4, '11111111-1111-1111-1111-111111111111', 'Aluno janeiro', '1004', date '2013-01-02', null, true);

  insert into public.aluno_jornada_matricula_disciplina
    (id, unidade_id, aluno_id, emusys_aluno_id, emusys_matricula_id,
     emusys_matricula_disciplina_id, emusys_disciplina_id, curso_id,
     curso_nome_emusys, professor_id, status_matricula, data_primeira_aula)
  values
    ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 1, 1001, 9001, 9101, 1, 1, 'Guitarra', 10, 'ativa', now() + interval '2 days'),
    ('00000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 2, 1001, 9001, 9102, 1, 1, 'Guitarra', 10, 'ativa', now() + interval '2 days'),
    ('00000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 4, 1004, 9004, 9104, 2, 2, 'Piano', 10, 'ativa', now() + interval '2 days');

  insert into public.aulas_emusys
    (id, emusys_id, unidade_id, data_aula, data_hora_inicio, data_hora_fim,
     tipo, turma_nome, curso_nome, professor_id, matricula_disciplina_id)
  values
    (101, 5001, '11111111-1111-1111-1111-111111111111', current_date + 1,
     now() + interval '1 day', now() + interval '1 day 50 minutes', 'individual', null, 'Guitarra', 10, 9101),
    (102, 5002, '11111111-1111-1111-1111-111111111111', current_date + 20,
     now() + interval '20 days', now() + interval '20 days 50 minutes', 'individual', null, 'Guitarra', 10, 9101),
    (103, 5003, '11111111-1111-1111-1111-111111111111', current_date + 2,
     now() + interval '2 days', now() + interval '2 days 50 minutes', 'individual', null, 'Guitarra', 10, 9101),
    (104, 9999, '11111111-1111-1111-1111-111111111111', current_date + 3,
     now() + interval '3 days', now() + interval '3 days 50 minutes', 'individual', null, 'Piano', 10, 9101),
    (106, 5006, '11111111-1111-1111-1111-111111111111', current_date + 3,
     now() + interval '3 days', now() + interval '3 days 50 minutes', 'individual', null, 'Guitarra', 10, 9101);
  insert into public.aulas_emusys
    (id, emusys_id, unidade_id, data_aula, data_hora_inicio, data_hora_fim,
     tipo, turma_nome, curso_emusys_id, curso_nome, professor_id,
     matricula_disciplina_id, data_hora_inicio_original)
  values
    (107, 5107, '11111111-1111-1111-1111-111111111111', current_date + 4,
     now() + interval '4 days', now() + interval '4 days 50 minutes', 'grupo', 'Turma unica', 1,
     'Guitarra', 10, 9207, now() + interval '4 days'),
    (108, 5108, '11111111-1111-1111-1111-111111111111', current_date + 4,
     now() + interval '4 days', now() + interval '4 days 50 minutes', 'grupo', 'Turma unica', 1,
     'Guitarra', 10, 9208, now() + interval '4 days');
  insert into public.aula_alunos_emusys values (101, 1, 'Aluno um', true), (103, 1, 'Aluno um', true);

  insert into public.alunos
    (id, unidade_id, nome, professor_atual_id, curso_id, data_matricula,
     emusys_matricula_id, lead_origem_id, emusys_lead_id, status,
     emusys_student_id, operacional_ativo)
  values
    (5, '11111111-1111-1111-1111-111111111111', 'Aluno convertido inicial', 20, 1,
     current_date - 1, '9500', 700, '7001', 'ativo', '1005', true);
  insert into public.leads (id, unidade_id, aluno_id, emusys_lead_id, status)
  values (700, '11111111-1111-1111-1111-111111111111', 5, 7001, 'convertido');
  insert into public.lead_experimentais
    (id, lead_id, nome_aluno, unidade_id, data_experimental, horario_experimental,
     professor_experimental_id, curso_interesse_id, status, aluno_id, emusys_lead_id)
  values
    (504, 700, 'Lead convertido inicial', '11111111-1111-1111-1111-111111111111',
     current_date - 3, time '18:00', 10, 1, 'experimental_realizada', 5, 7001);
  insert into public.aluno_jornada_matricula_disciplina
    (id, unidade_id, aluno_id, emusys_aluno_id, emusys_matricula_id,
     emusys_matricula_disciplina_id, emusys_disciplina_id, curso_id,
     curso_nome_emusys, professor_id, status_matricula, fonte_ultima_atualizacao)
  values
    ('00000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111',
     5, 1005, 9500, 9150, 1, 1, 'Guitarra', 20, 'ativa', 'sync-matriculas-emusys');

  insert into public.movimentacoes_admin
    (id, unidade_id, data, tipo, aluno_nome, aluno_id, professor_id, curso_id,
     motivo, observacoes, data_prevista_saida, emusys_aviso_previo_id)
  values
    (402, '11111111-1111-1111-1111-111111111111', current_date - 1, 'aviso_previo',
     'Aluno um', 1, 10, 1, 'mudanca de cidade', 'nao deve sair no evento', current_date + 9, 702);
  insert into public.lead_experimentais
    (id, nome_aluno, unidade_id, data_experimental, horario_experimental,
     professor_experimental_id, curso_interesse_id, status)
  values
    (503, 'Lead inicial', '11111111-1111-1111-1111-111111111111', current_date + 4,
     time '18:00', 10, 1, 'agendada');
  insert into public.aluno_professor_transicoes
    (id, unidade_id, aluno_id, emusys_matricula_id, emusys_matricula_disciplina_id,
     curso_id, curso_anterior_id, professor_anterior_id, professor_novo_id,
     data_transicao, fonte)
  values
    ('00000000-0000-0000-0000-000000000099', '11111111-1111-1111-1111-111111111111',
     1, 9001, 9101, 1, 1, 20, 10, now() - interval '1 day', 'webhook:matricula_alterada');
  insert into public.emusys_aulas_historico_revisoes_v1
    (aula_staging_id, unidade_id, emusys_aula_id, payload, primeira_coleta_em, ultima_coleta_em)
  values
    (7001, '11111111-1111-1111-1111-111111111111', 5006,
      jsonb_build_object('data_hora_inicio', to_char(now() + interval '3 days 1 hour', 'YYYY-MM-DD"T"HH24:MI:SSOF'), 'cancelada', false),
      now() - interval '2 days', now() - interval '2 days'),
    (7001, '11111111-1111-1111-1111-111111111111', 5006,
      jsonb_build_object('data_hora_inicio', to_char(now() + interval '3 days', 'YYYY-MM-DD"T"HH24:MI:SSOF'), 'cancelada', false),
      now() - interval '1 day', now() - interval '1 day');
`;

test('the operational-notification migration is present before its PostgreSQL fixture runs', () => {
  for (const migrationPath of migrationPaths) {
    assert.ok(fs.existsSync(migrationPath), `missing migration: ${migrationPath}`);
  }
});

test('operational notification triggers, service RPCs, ACLs and initial load honour the closed contract', async (t) => {
  const dockerInfo = docker(['info']);
  if (dockerInfo.status !== 0) {
    t.skip('Docker is unavailable for the PostgreSQL fixture');
    return;
  }

  const container = `la-eventos-operacionais-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--rm', '--name', container,
    '-e', 'POSTGRES_PASSWORD=postgres',
    '-d', 'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    const fixture = psql(container, fixtureSchema);
    assert.equal(fixture.status, 0, fixture.stderr || fixture.stdout);

    for (const migrationPath of baseMigrationPaths) {
      const migration = fs.readFileSync(migrationPath, 'utf8');
      const setup = psql(container, migration);
      assert.equal(setup.status, 0, setup.stderr || setup.stdout);
    }

    const legacyDuplicates = psql(container, `
      select public.fn_eventos_operacionais_registrar(
        'legacy-turma:5107', 'aula_reagendada', now(), 'carga_inicial',
        '11111111-1111-1111-1111-111111111111'::uuid, null, null, 107, 'Guitarra',
        jsonb_build_object('emusys_id', 5107, 'inicio', timestamptz '2030-01-05 18:00:00+00', 'turma', 'Turma unica'),
        jsonb_build_object('antes', jsonb_build_object('inicio', timestamptz '2030-01-04 18:00:00+00'), 'depois', jsonb_build_object('inicio', timestamptz '2030-01-05 18:00:00+00')),
        null, null, jsonb_build_array(jsonb_build_object('professor_id', 10, 'participacao', 'responsavel'))
      );
      select public.fn_eventos_operacionais_registrar(
        'legacy-turma:5108', 'aula_reagendada', now(), 'carga_inicial',
        '11111111-1111-1111-1111-111111111111'::uuid, null, null, 108, 'Guitarra',
        jsonb_build_object('emusys_id', 5108, 'inicio', timestamptz '2030-01-05 18:00:00+00', 'turma', 'Turma unica'),
        jsonb_build_object('antes', jsonb_build_object('inicio', timestamptz '2030-01-04 18:00:00+00'), 'depois', jsonb_build_object('inicio', timestamptz '2030-01-05 18:00:00+00')),
        null, null, jsonb_build_array(jsonb_build_object('professor_id', 10, 'participacao', 'responsavel'))
      );
      select count(*) from public.eventos_operacionais where evento_id like 'legacy-turma:%';
    `);
    assert.equal(legacyDuplicates.status, 0, legacyDuplicates.stderr || legacyDuplicates.stdout);
    assert.equal(legacyDuplicates.stdout.trim().split(/\r?\n/u).at(-1), '2');

    const avisoComOrigemCorrigida = psql(container, `
      insert into public.movimentacoes_admin
        (id, unidade_id, data, tipo, aluno_nome, aluno_id, professor_id, curso_id,
         motivo, data_prevista_saida, emusys_aviso_previo_id, origem_registro)
      values
        (403, '11111111-1111-1111-1111-111111111111', current_date, 'aviso_previo',
         'Aluno um', 1, 10, 1, 'mudanca de cidade', current_date + 12, 703, 'manual');
      insert into public.automacao_log
        (aluno_id, evento, acao, workflow_id, created_at)
      values
        (1, 'matricula_aviso_previo_adicionado', 'aviso_previo_registrado',
         'processar-matricula-emusys', clock_timestamp());
      select origem from public.eventos_operacionais
       where tipo = 'aviso_previo' and evento_id like '%:703:%';
    `);
    assert.equal(avisoComOrigemCorrigida.status, 0, avisoComOrigemCorrigida.stderr || avisoComOrigemCorrigida.stdout);
    assert.equal(avisoComOrigemCorrigida.stdout.trim().split(/\r?\n/u).at(-1), 'sincronizacao');

    const rolloutSource = fs.readFileSync(rolloutMigrationPath, 'utf8');
    const rollbackProof = psql(container, `
      begin;
      ${rolloutSource}
      select
        to_regprocedure('public.fn_eventos_operacionais_carga_inicial_experimental_convertida_v1(timestamp with time zone)') is not null,
        exists (
          select 1
          from pg_constraint
          where conrelid = 'public.eventos_operacionais'::regclass
            and conname = 'eventos_operacionais_tipo_check'
            and pg_get_constraintdef(oid) like '%experimental_convertida%'
        );
      rollback;
      select to_regprocedure('public.fn_eventos_operacionais_carga_inicial_experimental_convertida_v1(timestamp with time zone)') is null;
    `);
    assert.equal(rollbackProof.status, 0, rollbackProof.stderr || rollbackProof.stdout);
    assert.deepEqual(
      rollbackProof.stdout.trim().split(/\r?\n/u).filter((line) => /^(t\|t|t)$/u.test(line)),
      ['t|t', 't'],
    );

    const rolloutMigration = psql(container, rolloutSource);
    assert.equal(rolloutMigration.status, 0, rolloutMigration.stderr || rolloutMigration.stdout);
    const legacyDeduplicated = psql(container, `
      select count(*) from public.eventos_operacionais where evento_id like 'legacy-turma:%';
      select origem from public.eventos_operacionais
       where tipo = 'aviso_previo' and evento_id like '%:703:%';
    `);
    assert.equal(legacyDeduplicated.status, 0, legacyDeduplicated.stderr || legacyDeduplicated.stdout);
    assert.deepEqual(legacyDeduplicated.stdout.trim().split(/\r?\n/u), ['1', 'webhook']);

    const conversoesIniciais = jsonOutput(psql(container, `
      set role service_role;
      select public.fn_eventos_operacionais_carga_inicial_experimental_convertida_v1(now() - interval '7 days')::text;
      reset role;
    `));
    assert.equal(conversoesIniciais.por_tipo.experimental_convertida, 1, JSON.stringify(conversoesIniciais));
    const conversoesIniciaisRepetidas = jsonOutput(psql(container, `
      set role service_role;
      select public.fn_eventos_operacionais_carga_inicial_experimental_convertida_v1(now() - interval '7 days')::text;
      reset role;
    `));
    assert.equal(conversoesIniciaisRepetidas.inseridos, 0, JSON.stringify(conversoesIniciaisRepetidas));

    const initial = jsonOutput(psql(container, `
      set role service_role;
      select public.fn_eventos_operacionais_carga_inicial_v1(now() - interval '7 days')::text;
      reset role;
    `));
    assert.ok(initial.total >= 4, JSON.stringify(initial));
    const initialRepeat = jsonOutput(psql(container, `
      set role service_role;
      select public.fn_eventos_operacionais_carga_inicial_v1(now() - interval '7 days')::text;
      reset role;
    `));
    assert.equal(initialRepeat.inseridos, 0, JSON.stringify(initialRepeat));

    const changes = psql(container, `
      update public.aulas_emusys
         set data_hora_inicio = data_hora_inicio + interval '2 hours'
       where id = 101;
      update public.aulas_emusys
         set data_hora_inicio = data_hora_inicio
       where id = 101;
      update public.aulas_emusys
         set data_hora_inicio = data_hora_inicio + interval '1 hour'
       where id = 102;
      update public.aulas_emusys set cancelada = true, cancelada_motivo = 'feriado' where id = 103;
      insert into public.aulas_emusys
        (id, emusys_id, unidade_id, data_aula, data_hora_inicio, data_hora_fim,
         tipo, curso_nome, professor_id, matricula_disciplina_id, cancelada, cancelada_motivo)
      values
        (105, 5005, '11111111-1111-1111-1111-111111111111', current_date + 2,
         now() + interval '2 days', now() + interval '2 days 50 minutes',
         'individual', 'Guitarra', 10, 9101, true, 'fonte ja cancelada');
      update public.aulas_emusys
         set data_hora_inicio = data_hora_inicio + interval '1 hour'
       where id in (107, 108);
      update public.aulas_emusys set professor_id = 20 where id = 101;

      insert into public.alunos
        (id, unidade_id, nome, professor_atual_id, curso_id, data_matricula,
         emusys_matricula_id, lead_origem_id, emusys_lead_id, status,
         emusys_student_id, operacional_ativo)
      values
        (6, '11111111-1111-1111-1111-111111111111', 'Aluno convertido ao vivo', 20, 1,
         current_date, '9600', 701, '7002', 'ativo', '1006', true);
      insert into public.leads (id, unidade_id, aluno_id, emusys_lead_id, status)
      values (701, '11111111-1111-1111-1111-111111111111', 6, 7002, 'convertido');
      insert into public.lead_experimentais
        (id, lead_id, nome_aluno, unidade_id, data_experimental, horario_experimental,
         professor_experimental_id, curso_interesse_id, status, aluno_id, emusys_lead_id)
      values
        (505, 701, 'Lead convertido ao vivo', '11111111-1111-1111-1111-111111111111',
         current_date - 2, time '18:00', 10, 1, 'experimental_realizada', 6, 7002);
      insert into public.aluno_jornada_matricula_disciplina
        (id, unidade_id, aluno_id, emusys_aluno_id, emusys_matricula_id,
         emusys_matricula_disciplina_id, emusys_disciplina_id, curso_id,
         curso_nome_emusys, professor_id, status_matricula, fonte_ultima_atualizacao)
      values
        ('00000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111',
         6, 1006, 9600, 9160, 1, 1, 'Guitarra', 20, 'ativa', 'webhook:matricula_nova');

      insert into public.lead_experimentais
        (id, nome_aluno, unidade_id, data_experimental, horario_experimental,
         professor_experimental_id, curso_interesse_id, status, emusys_aula_id)
      values
        (501, 'Lead novo', '11111111-1111-1111-1111-111111111111', current_date + 3,
         time '17:00', 10, 1, 'agendada', null),
        (502, 'Lead com aula', '11111111-1111-1111-1111-111111111111', current_date + 3,
         time '18:00', 10, 1, 'agendada', 9999);

      insert into public.aluno_jornada_matricula_disciplina
        (id, unidade_id, aluno_id, emusys_aluno_id, emusys_matricula_id,
         emusys_matricula_disciplina_id, emusys_disciplina_id, curso_id,
         curso_nome_emusys, professor_id, status_matricula, data_primeira_aula,
         fonte_ultima_atualizacao)
      values
        ('00000000-0000-0000-0000-000000000010', '11111111-1111-1111-1111-111111111111',
         1, 1001, 9010, 9110, 1, 1, 'Guitarra', 10, 'ativa', now() + interval '5 days',
         'webhook:matricula_nova');
      update public.aluno_jornada_matricula_disciplina
         set fonte_ultima_atualizacao = 'webhook:matricula_trancamento',
             status_matricula = 'trancada',
             trancamento_motivo = 'viagem',
             trancamento_data_inicial = current_date,
             trancamento_data_final = current_date + 14
       where id = '00000000-0000-0000-0000-000000000010';
      update public.aluno_jornada_matricula_disciplina
         set fonte_ultima_atualizacao = 'webhook:matricula_finalizacao',
             status_matricula = 'inativa',
             motivo_inativa = 'interrompida'
       where id = '00000000-0000-0000-0000-000000000010';
      insert into public.aluno_jornada_matricula_disciplina
        (id, unidade_id, aluno_id, emusys_aluno_id, emusys_matricula_id,
         emusys_matricula_disciplina_id, emusys_disciplina_id, curso_id,
         curso_nome_emusys, professor_id, status_matricula, fonte_ultima_atualizacao)
      values
        ('00000000-0000-0000-0000-000000000011', '11111111-1111-1111-1111-111111111111',
         1, 1001, 9011, 9111, 1, 1, 'Guitarra', 10, 'ativa', 'sync-matriculas-emusys');
      update public.aluno_jornada_matricula_disciplina
         set fonte_ultima_atualizacao = 'webhook:matricula_alterada',
             emusys_disciplina_id = 2,
             curso_id = 2,
             curso_nome_emusys = 'Piano',
             alteracao_descricao_emusys = 'Troca de disciplina'
       where id = '00000000-0000-0000-0000-000000000011';

      insert into public.movimentacoes_admin
        (id, unidade_id, data, tipo, aluno_nome, aluno_id, professor_id, curso_id,
         motivo, observacoes, data_prevista_saida, emusys_aviso_previo_id)
      values
        (401, '11111111-1111-1111-1111-111111111111', current_date, 'aviso_previo',
         'Aluno um', 1, 10, 1, 'mudanca de cidade', 'segredo de saude e financeiro', current_date + 10, 701);
      update public.movimentacoes_admin
         set data_prevista_saida = current_date + 11, updated_at = now()
       where id = 401;
      delete from public.movimentacoes_admin where id = 401;

      insert into public.aluno_professor_transicoes
        (id, unidade_id, aluno_id, emusys_matricula_id, emusys_matricula_disciplina_id,
         curso_id, curso_anterior_id, professor_anterior_id, professor_novo_id,
         data_transicao, fonte)
      values
        ('00000000-0000-0000-0000-000000000012', '11111111-1111-1111-1111-111111111111',
         1, 9012, 9112, 1, 1, 10, 20, now(), 'webhook:matricula_alterada');
    `);
    assert.equal(changes.status, 0, changes.stderr || changes.stdout);

    const noOpExperimental = psql(container, `
      update public.lead_experimentais
         set data_experimental = data_experimental,
             horario_experimental = horario_experimental,
             professor_experimental_id = professor_experimental_id,
             emusys_aula_id = emusys_aula_id
       where id = 501;
      select count(*) from public.eventos_operacionais where tipo = 'experimental_marcada';
    `);
    assert.equal(noOpExperimental.status, 0, noOpExperimental.stderr || noOpExperimental.stdout);
    assert.equal(noOpExperimental.stdout.trim().split(/\r?\n/u).at(-1), '2');

    const firstDayCases = psql(container, `
      select count(*) from public.eventos_operacionais
       where tipo = 'aula_cancelada' and aula_id = 105;
      select count(*) from public.eventos_operacionais
       where tipo = 'aula_reagendada' and aula ->> 'turma' = 'Turma unica'
         and evento_id not like 'legacy-turma:%';
      select count(*) from public.eventos_operacionais
       where tipo = 'experimental_convertida'
         and mudanca ? 'antes' and mudanca ? 'depois'
         and mudanca -> 'antes' ? 'data_experimental'
         and mudanca -> 'depois' ? 'data_matricula'
         and mudanca::text !~ '(valor|plano)';
      select origem from public.eventos_operacionais
       where tipo = 'experimental_convertida' and aluno_id = 6;
      select count(*) from public.eventos_operacionais_audiencia a
       join public.eventos_operacionais e on e.evento_id = a.evento_id
       where e.tipo = 'experimental_convertida'
         and a.professor_id in (10, 20)
         and a.participacao = 'responsavel';
    `);
    assert.equal(firstDayCases.status, 0, firstDayCases.stderr || firstDayCases.stdout);
    assert.deepEqual(firstDayCases.stdout.trim().split(/\r?\n/u), ['1', '1', '2', 'webhook', '4']);

    const counts = psql(container, `
      select tipo || '|' || count(*)
        from public.eventos_operacionais
       group by tipo
       order by tipo;
    `);
    assert.equal(counts.status, 0, counts.stderr || counts.stdout);
    const lines = counts.stdout.trim().split(/\r?\n/u);
    assert.ok(lines.includes('aula_reagendada|4'), lines.join('\n'));
    assert.ok(lines.includes('aula_cancelada|2'), lines.join('\n'));
    assert.ok(lines.includes('professor_trocado|3'), lines.join('\n'));
    assert.ok(lines.includes('experimental_marcada|2'), lines.join('\n'));
    assert.ok(lines.includes('aluno_novo|2'), lines.join('\n'));
    assert.ok(lines.includes('aviso_previo|5'), lines.join('\n'));
    assert.ok(lines.includes('matricula_trancada|1'), lines.join('\n'));
    assert.ok(lines.includes('matricula_encerrada|1'), lines.join('\n'));
    assert.ok(lines.includes('matricula_alterada|1'), lines.join('\n'));
    assert.ok(lines.includes('experimental_convertida|2'), lines.join('\n'));

    const audience = psql(container, `
      select count(*)
        from public.eventos_operacionais_audiencia a
        join public.eventos_operacionais e on e.evento_id = a.evento_id
       where e.tipo = 'professor_trocado'
         and a.professor_id in (10, 20);
    `);
    assert.equal(audience.status, 0, audience.stderr || audience.stdout);
    assert.equal(audience.stdout.trim(), '6');

    const service = jsonOutput(psql(container, `
      set role service_role;
      select public.fn_eventos_operacionais_professor_v1(
        10, now() - interval '8 days', null, null, 200, null
      )::text;
      reset role;
    `));
    assert.ok(service.itens.length >= 10, JSON.stringify(service));
    const changedEnrollment = service.itens.find((item) => item.tipo === 'matricula_alterada');
    assert.equal(changedEnrollment.detalhe, 'Troca de disciplina');
    assert.equal(JSON.stringify(service).match(/observacoes|valor_parcela|presenca|payload_snapshot/iu), null);
    assert.ok(service.itens.every((item) => !('urgencia' in item) && !('autor' in item) && !('confianca_fonte' in item)));

    const birthdays = jsonOutput(psql(container, `
      set role service_role;
      select public.fn_aniversariantes_do_professor_v1(10, date '2026-12-29', date '2027-01-03')::text;
      reset role;
    `));
    assert.equal(birthdays.length, 2, JSON.stringify(birthdays));
    assert.deepEqual(birthdays.map((item) => item.data_nascimento_dia_mes).sort(), ['01-02', '12-30']);

    const paginationSeed = psql(container, `
      insert into public.eventos_operacionais
        (evento_id, tipo, ocorreu_em, detectado_em, origem, unidade_id, mudanca)
      select 'pagina:' || n,
             'aviso_previo',
             now() - make_interval(secs => n),
             now() - make_interval(secs => n),
             'webhook',
             '11111111-1111-1111-1111-111111111111'::uuid,
             '{}'::jsonb
        from generate_series(1, 55) n;
      insert into public.eventos_operacionais_audiencia
        (evento_id, professor_id, participacao, detectado_em)
      select 'pagina:' || n, 10, 'responsavel', now() - make_interval(secs => n)
        from generate_series(1, 55) n;
    `);
    assert.equal(paginationSeed.status, 0, paginationSeed.stderr || paginationSeed.stdout);
    const page1 = jsonOutput(psql(container, `
      set role service_role;
      select public.fn_eventos_operacionais_professor_v1(
        10, now() - interval '8 days', null, null, 50, null
      )::text;
      reset role;
    `));
    assert.equal(page1.itens.length, 50, JSON.stringify(page1));
    assert.ok(page1.proximo_cursor, JSON.stringify(page1));
    const page2 = jsonOutput(psql(container, `
      set role service_role;
      select public.fn_eventos_operacionais_professor_v1(
        10, now() - interval '8 days',
        '${page1.proximo_cursor.detectado_em}',
        '${page1.proximo_cursor.evento_id}', 50, null
      )::text;
      reset role;
    `));
    assert.ok(page2.itens.length > 0, JSON.stringify(page2));
    assert.notEqual(page1.itens.at(-1).evento_id, page2.itens[0].evento_id);

    const acl = psql(container, `
      select
        has_function_privilege('anon',
          'public.fn_eventos_operacionais_professor_v1(integer,timestamp with time zone,timestamp with time zone,text,integer,text[])', 'execute'),
        has_function_privilege('authenticated',
          'public.fn_eventos_operacionais_professor_v1(integer,timestamp with time zone,timestamp with time zone,text,integer,text[])', 'execute'),
        has_function_privilege('service_role',
          'public.fn_eventos_operacionais_professor_v1(integer,timestamp with time zone,timestamp with time zone,text,integer,text[])', 'execute');
    `);
    assert.equal(acl.status, 0, acl.stderr || acl.stdout);
    assert.equal(acl.stdout.trim(), 'f|f|t');

    const rlsAndBirthdayAcl = psql(container, `
      select string_agg(relrowsecurity::text, '|' order by relname)
        from pg_class
       where oid in (
         'public.eventos_operacionais'::regclass,
         'public.eventos_operacionais_audiencia'::regclass
       );
      select has_table_privilege('anon', 'public.eventos_operacionais', 'select'),
             has_table_privilege('authenticated', 'public.eventos_operacionais_audiencia', 'select'),
             has_table_privilege('service_role', 'public.eventos_operacionais', 'select');
      select has_function_privilege('anon',
          'public.fn_aniversariantes_do_professor_v1(integer,date,date)', 'execute'),
             has_function_privilege('service_role',
          'public.fn_aniversariantes_do_professor_v1(integer,date,date)', 'execute');
    `);
    assert.equal(rlsAndBirthdayAcl.status, 0, rlsAndBirthdayAcl.stderr || rlsAndBirthdayAcl.stdout);
    assert.deepEqual(rlsAndBirthdayAcl.stdout.trim().split(/\r?\n/u), ['true|true', 'f|f|f', 'f|t']);

    const triggerWithRevokedExecute = psql(container, `
      grant select, update on public.aulas_emusys to service_role;
      set role service_role;
      update public.aulas_emusys
         set data_hora_inicio = data_hora_inicio + interval '30 minutes'
       where id = 101;
      reset role;
      select count(*) > 2
        from public.eventos_operacionais
       where tipo = 'aula_reagendada';
    `);
    assert.equal(triggerWithRevokedExecute.status, 0, triggerWithRevokedExecute.stderr || triggerWithRevokedExecute.stdout);
    assert.equal(triggerWithRevokedExecute.stdout.trim().split(/\r?\n/u).at(-1), 't');

    const internalAclAndIndexes = psql(container, `
      select string_agg(
        has_function_privilege('anon', format('public.%I()', proname), 'execute')::text,
        '|' order by proname
      )
      from pg_proc
      join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
      where nspname = 'public'
        and proname in (
          'trg_eventos_operacionais_aula_cancelada',
          'trg_eventos_operacionais_aula_reagendada',
          'trg_eventos_operacionais_aviso_previo',
          'trg_eventos_operacionais_experimental',
          'trg_eventos_operacionais_experimental_convertida',
          'trg_eventos_operacionais_jornada_matricula',
          'trg_eventos_operacionais_professor_aula',
          'trg_eventos_operacionais_professor_jornada'
        );
      select to_regclass('public.idx_eventos_operacionais_aluno_id') is not null,
             to_regclass('public.idx_eventos_operacionais_aula_id') is not null,
             to_regclass('public.idx_eventos_operacionais_unidade_id') is not null;
      select has_function_privilege('anon',
          'public.fn_eventos_operacionais_registrar_experimental_convertida(uuid,text)', 'execute'),
             has_function_privilege('authenticated',
          'public.fn_eventos_operacionais_registrar_experimental_convertida(uuid,text)', 'execute'),
             has_function_privilege('service_role',
          'public.fn_eventos_operacionais_registrar_experimental_convertida(uuid,text)', 'execute');
      select has_function_privilege('anon',
          'public.fn_eventos_operacionais_carga_inicial_experimental_convertida_v1(timestamp with time zone)', 'execute'),
             has_function_privilege('service_role',
          'public.fn_eventos_operacionais_carga_inicial_experimental_convertida_v1(timestamp with time zone)', 'execute');
    `);
    assert.equal(internalAclAndIndexes.status, 0, internalAclAndIndexes.stderr || internalAclAndIndexes.stdout);
    assert.deepEqual(internalAclAndIndexes.stdout.trim().split(/\r?\n/u), [
      'false|false|false|false|false|false|false|false',
      't|t|t',
      'f|f|f',
      'f|t',
    ]);

    const isolation = psql(container, `
      alter table public.eventos_operacionais
        add constraint eventos_operacionais_teste_falha check (false) not valid;
      update public.aulas_emusys
       set data_hora_inicio = data_hora_inicio + interval '1 hour'
       where id = 101;
      select data_hora_inicio is not null from public.aulas_emusys where id = 101;
      insert into public.aulas_emusys
        (id, emusys_id, unidade_id, data_aula, data_hora_inicio, data_hora_fim,
         tipo, curso_nome, professor_id, matricula_disciplina_id, cancelada)
      values
        (109, 5109, '11111111-1111-1111-1111-111111111111', current_date + 2,
         now() + interval '2 days', now() + interval '2 days 50 minutes',
         'individual', 'Guitarra', 10, 9101, true);
      select exists (select 1 from public.aulas_emusys where id = 109 and cancelada);
    `);
    assert.equal(isolation.status, 0, isolation.stderr || isolation.stdout);
    assert.deepEqual(
      isolation.stdout.trim().split(/\r?\n/u).filter((line) => line === 't'),
      ['t', 't'],
    );
  } finally {
    docker(['stop', container]);
  }
});
