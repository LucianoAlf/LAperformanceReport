import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  root,
  'supabase/migrations/20260815124415_corrige_pendencias_presenca_trancamento_reagendamento.sql',
);
const edgePath = path.join(root, 'supabase/functions/reconciliar-grade-aluno/index.ts');

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
    'psql', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'postgres', '-At',
  ], sql);
}

function lines(output) {
  return output.trim() === '' ? [] : output.trim().split(/\r?\n/u);
}

async function waitForPostgres(container) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (psql(container, 'select 1;').status === 0) {
      // A imagem oficial sobe um PostgreSQL provisório durante o initdb. Esperar
      // uma segunda conexão evita usar esse processo justamente antes do restart.
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      if (psql(container, 'select 1;').status === 0) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail('PostgreSQL de teste não iniciou a tempo');
}

const fixtureSchema = String.raw`
  create role anon;
  create role authenticated;
  create role service_role;
  create role sol_acesso_restrito;
  create role mila_acesso_restrito;
  create role fabio_agent;
  create role lia_acesso_restrito;

  create table public.unidades (
    id uuid primary key,
    nome text not null
  );

  create table public.professores (
    id integer primary key,
    nome text not null
  );

  create table public.alunos (
    id integer primary key,
    nome text not null
  );

  create table public.aluno_jornada_matricula_disciplina (
    id uuid primary key default gen_random_uuid(),
    unidade_id uuid not null,
    aluno_id integer not null,
    emusys_matricula_disciplina_id bigint not null,
    curso_nome_emusys text,
    status_matricula text not null,
    trancamento_data_inicial date,
    trancamento_data_final date
  );

  create table public.aulas_emusys (
    id integer primary key,
    emusys_id integer not null,
    unidade_id uuid not null,
    data_aula date not null,
    data_hora_inicio timestamptz not null,
    data_hora_fim timestamptz not null,
    categoria text not null default 'normal',
    tipo text,
    turma_nome text,
    curso_nome text,
    sala_nome text,
    professor_nome text,
    professor_id integer,
    matricula_disciplina_id bigint,
    cancelada boolean not null default false,
    cancelada_origem text,
    cancelada_motivo text,
    cancelada_em timestamptz,
    professor_presenca_origem text,
    constraint aulas_emusys_cancelada_origem_check
      check (cancelada_origem is null or cancelada_origem in ('emusys', 'agenda_secretaria'))
  );

  create table public.aula_alunos_emusys (
    aula_emusys_id integer not null,
    aluno_id integer,
    aluno_emusys_id bigint,
    aluno_nome text not null
  );

  create table public.aluno_presenca (
    id integer generated always as identity primary key,
    aula_emusys_id integer not null,
    aluno_id integer not null,
    status text,
    status_presenca text,
    respondido_por text
  );

  create table public.aluno_presenca_administrativo (
    aula_emusys_id integer not null,
    aluno_id integer not null,
    justificada boolean default false
  );

  create function public.fn_aula_operacional_id(p_aula_id integer)
  returns integer language sql stable as $$ select p_aula_id $$;

  create function public.fn_presenca_fecha_chamada(p_status text, p_origem text)
  returns boolean language sql stable as $$
    select p_status in ('presente', 'falta')
  $$;

  create function public.fn_presenca_e_forte(p_origem text)
  returns boolean language sql stable as $$ select false $$;

  create function public.fn_presenca_fonte_legivel(p_origem text)
  returns text language sql stable as $$ select coalesce(p_origem, '') $$;

  insert into public.unidades values
    ('11111111-1111-1111-1111-111111111111', 'Campo Grande'),
    ('22222222-2222-2222-2222-222222222222', 'Barra');
  insert into public.professores values (1, 'Professor de teste');
  insert into public.alunos values
    (11, 'Elisa trancada antes'),
    (12, 'Fabiana trancada antes'),
    (13, 'Isis trancada antes'),
    (14, 'Trancamento posterior'),
    (15, 'Outro curso ativo'),
    (20, 'Sergio sem decisão humana'),
    (21, 'Sergio com decisão humana');

  insert into public.aluno_jornada_matricula_disciplina
    (unidade_id, aluno_id, emusys_matricula_disciplina_id, curso_nome_emusys,
     status_matricula, trancamento_data_inicial, trancamento_data_final)
  values
    ('11111111-1111-1111-1111-111111111111', 11, 501, 'Musicalização para Bebês T',
     'trancada', current_date - 10, current_date + 5),
    ('11111111-1111-1111-1111-111111111111', 12, 601, 'Bateria T',
     'trancada', current_date - 10, current_date + 5),
    ('22222222-2222-2222-2222-222222222222', 13, 701, 'Canto T',
     'trancada', current_date - 20, current_date + 2),
    ('11111111-1111-1111-1111-111111111111', 14, 801, 'Bateria T',
     'trancada', current_date, current_date + 10),
    ('11111111-1111-1111-1111-111111111111', 15, 901, 'Bateria T',
     'trancada', current_date - 10, current_date + 10);

  insert into public.aulas_emusys
    (id, emusys_id, unidade_id, data_aula, data_hora_inicio, data_hora_fim,
     categoria, tipo, turma_nome, curso_nome, sala_nome, professor_nome,
     professor_id, matricula_disciplina_id)
  values
    (1, 1001, '11111111-1111-1111-1111-111111111111', current_date - 1,
     now() - interval '1 day', now() - interval '23 hours', 'normal', 'individual',
     'MB_Sex_18', 'Musicalização para Bebês T', 'Sala 1', 'Professor de teste', 1, 501),
    (2, 1002, '11111111-1111-1111-1111-111111111111', current_date - 1,
     now() - interval '1 day', now() - interval '23 hours', 'normal', 'turma',
     'B_Sex_17', 'Bateria T', 'Sala 2', 'Professor de teste', 1, 0),
    (3, 1003, '22222222-2222-2222-2222-222222222222', current_date - 1,
     now() - interval '1 day', now() - interval '23 hours', 'normal', 'turma',
     'C_Sex_09', 'Canto T', 'Sala 3', 'Professor de teste', 1, 0),
    (4, 1004, '11111111-1111-1111-1111-111111111111', current_date - 1,
     now() - interval '1 day', now() - interval '23 hours', 'normal', 'individual',
     'B_Sex_20', 'Bateria T', 'Sala 4', 'Professor de teste', 1, 801),
    (5, 1005, '11111111-1111-1111-1111-111111111111', current_date - 1,
     now() - interval '1 day', now() - interval '23 hours', 'normal', 'individual',
     'P_Sex_20', 'Piano T', 'Sala 5', 'Professor de teste', 1, 902),
    (50, 9001, '11111111-1111-1111-1111-111111111111', current_date - 1,
     now() - interval '1 day' + interval '2 hours', now() - interval '1 day' + interval '3 hours',
     'normal', 'individual', 'S_Sex_18', 'Bateria T', 'Sala 6', 'Professor de teste', 1, 1001),
    (60, 9003, '11111111-1111-1111-1111-111111111111', current_date - 1,
     now() - interval '1 day' + interval '4 hours', now() - interval '1 day' + interval '5 hours',
     'normal', 'individual', 'S_Sex_20', 'Bateria T', 'Sala 7', 'Professor de teste', 1, 1002);

  insert into public.aula_alunos_emusys
    (aula_emusys_id, aluno_id, aluno_emusys_id, aluno_nome)
  values
    (1, 11, 11011, 'Elisa trancada antes'),
    (2, 12, 11012, 'Fabiana trancada antes'),
    (3, 13, 11013, 'Isis trancada antes'),
    (4, 14, 11014, 'Trancamento posterior'),
    (5, 15, 11015, 'Outro curso ativo'),
    (50, 20, 12020, 'Sergio sem decisão humana'),
    (60, 21, 12021, 'Sergio com decisão humana');

  insert into public.aluno_presenca
    (aula_emusys_id, aluno_id, status, status_presenca, respondido_por)
  values (60, 21, 'ausente', 'falta', 'agenda_secretaria');
`;

test('trancamentos pré-aula não viram pendência e a reconciliação preserva decisão humana', async (t) => {
  const edgeSource = fs.readFileSync(edgePath, 'utf8');
  assert.match(
    edgeSource,
    /const hoje = hojeBRT\(\);\s+const dataInicio = somarDias\(hoje, -1\);\s+const dataFim = somarDias\(hoje, dias\);/u,
    'a edge deve buscar ontem e repassar a mesma janela para a RPC',
  );

  const dockerInfo = docker(['info']);
  if (dockerInfo.status !== 0) {
    t.skip('Docker indisponível para fixture PostgreSQL');
    return;
  }

  const container = `la-presenca-pendencias-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--rm', '--name', container,
    '-e', 'POSTGRES_PASSWORD=postgres',
    '-d', 'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);
    const fixture = psql(container, fixtureSchema);
    assert.equal(
      fixture.status,
      0,
      `${fixture.stderr || fixture.stdout}\n${docker(['logs', container]).stdout}`,
    );

    const migration = fs.readFileSync(migrationPath, 'utf8');
    const setup = psql(container, migration);
    assert.equal(setup.status, 0, setup.stderr || setup.stdout);

    const pendenciasCampoGrande = psql(container, `
      select aluno_nome
      from public.fn_presenca_pendencias_do_dia(
        '11111111-1111-1111-1111-111111111111', current_date - 1
      )
      where aluno_nome in ('Elisa trancada antes', 'Fabiana trancada antes', 'Trancamento posterior', 'Outro curso ativo')
      order by aluno_nome;
    `);
    assert.equal(pendenciasCampoGrande.status, 0, pendenciasCampoGrande.stderr || pendenciasCampoGrande.stdout);
    assert.deepEqual(lines(pendenciasCampoGrande.stdout), ['Outro curso ativo', 'Trancamento posterior']);

    const pendenciasBarra = psql(container, `
      select aluno_nome
      from public.fn_presenca_pendencias_do_dia(
        '22222222-2222-2222-2222-222222222222', current_date - 1
      );
    `);
    assert.equal(pendenciasBarra.status, 0, pendenciasBarra.stderr || pendenciasBarra.stdout);
    assert.deepEqual(lines(pendenciasBarra.stdout), []);

    const view = psql(container, `
      select aluno_nome
      from public.vw_presenca_pendencia
      where data_aula = current_date - 1
        and aluno_nome in ('Elisa trancada antes', 'Fabiana trancada antes', 'Isis trancada antes', 'Trancamento posterior', 'Outro curso ativo')
      order by aluno_nome;
    `);
    assert.equal(view.status, 0, view.stderr || view.stdout);
    assert.deepEqual(lines(view.stdout), ['Outro curso ativo', 'Trancamento posterior']);

    const reconciliacao = psql(container, `
      select (public.reconciliar_grade_aluno_v1(
        12020,
        '11111111-1111-1111-1111-111111111111',
        current_date - 1,
        current_date + 1,
        array[9002],
        false
      )->>'status');
      select (public.reconciliar_grade_aluno_v1(
        12021,
        '11111111-1111-1111-1111-111111111111',
        current_date - 1,
        current_date + 1,
        array[9002],
        false
      )->>'status');
      select cancelada_origem || '|' || case when cancelada then 't' else 'f' end
      from public.aulas_emusys where id = 50;
      select case when cancelada then 't' else 'f' end || '|' || coalesce(
        (select respondido_por from public.aluno_presenca where aula_emusys_id = 60),
        '<sem resposta>'
      )
      from public.aulas_emusys where id = 60;
    `);
    assert.equal(reconciliacao.status, 0, reconciliacao.stderr || reconciliacao.stdout);
    assert.deepEqual(lines(reconciliacao.stdout), [
      'ok',
      'ok',
      'sync_ausente_emusys|t',
      'f|agenda_secretaria',
    ]);

    const acl = psql(container, `
      select has_function_privilege(
        'anon',
        'public.fn_presenca_pendencia_elegivel(uuid,integer,date,bigint,text)',
        'execute'
      ) || '|' || has_function_privilege(
        'service_role',
        'public.fn_presenca_pendencia_elegivel(uuid,integer,date,bigint,text)',
        'execute'
      );
    `);
    assert.equal(acl.status, 0, acl.stderr || acl.stdout);
    assert.equal(acl.stdout.trim(), 'false|true');
  } finally {
    docker(['stop', container]);
  }
});
