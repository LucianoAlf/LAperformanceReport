import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselineMigrationPath = path.join(
  root,
  'supabase/migrations/20260811130700_chamada_toggle_indeterminado.sql',
);
const fixMigrationPath = path.join(
  root,
  'supabase/migrations/20260812171943_chamada_retroativa_fallback_emusys.sql',
);

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

async function waitForPostgres(container) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const ready = psql(container, 'select 1;');
    if (ready.status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail('PostgreSQL de teste nao iniciou a tempo');
}

function extractFunction(sql) {
  const start = sql.search(
    /create\s+or\s+replace\s+function\s+public\.app_registrar_chamada_agenda\s*\(/i,
  );
  assert.notEqual(start, -1, 'RPC app_registrar_chamada_agenda ausente');
  const dollarTag = sql.slice(start).match(/\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$/)?.[0];
  assert.ok(dollarTag, 'delimitador da RPC ausente');
  const bodyStart = sql.indexOf(dollarTag, start);
  const end = sql.indexOf(`${dollarTag};`, bodyStart + dollarTag.length);
  assert.notEqual(bodyStart, -1, 'corpo da RPC ausente');
  assert.notEqual(end, -1, 'fim da RPC ausente');
  return sql.slice(start, end + `${dollarTag};`.length);
}

const fixtureSchema = `
  create schema if not exists auth;

  create table public.usuarios (
    id integer primary key,
    auth_user_id uuid not null,
    ativo boolean not null default true
  );

  create table public.aulas_emusys (
    id integer primary key,
    unidade_id uuid not null,
    professor_id integer,
    data_aula date not null,
    data_hora_inicio timestamptz not null,
    curso_nome text,
    turma_nome text,
    sala_nome text,
    cancelada boolean not null default false
  );

  create table public.aula_alunos_emusys (
    aula_emusys_id integer not null,
    aluno_id integer not null
  );

  create table public.aluno_presenca (
    id integer primary key,
    aluno_id integer not null,
    aula_emusys_id integer not null,
    professor_id integer,
    unidade_id uuid not null,
    data_aula date,
    horario_aula time,
    status text,
    status_presenca text,
    curso_nome text,
    turma_nome text,
    sala_nome text,
    respondido_por text,
    respondido_em timestamptz
  );

  create table public.aluno_presenca_retificacoes (
    id bigserial primary key,
    aluno_presenca_id integer,
    unidade_id uuid,
    status_anterior text,
    status_novo text,
    respondido_por_anterior text,
    respondido_em_anterior timestamptz,
    motivo text,
    autor_usuario_id integer,
    autor_auth_user_id uuid
  );

  create table public.aluno_presenca_administrativo (
    aluno_id integer not null,
    aula_emusys_id integer not null,
    justificada boolean not null default false,
    updated_at timestamptz,
    unique (aluno_id, aula_emusys_id)
  );

  create table public.aluno_reposicoes (
    aluno_id integer not null,
    aula_origem_id integer not null,
    origem text not null,
    status text not null default 'pendente',
    updated_at timestamptz
  );

  create function auth.uid()
  returns uuid
  language sql stable
  as $$ select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid $$;

  create function public.usuario_tem_permissao(integer, text, uuid)
  returns boolean
  language sql stable
  as $$ select true $$;

  insert into public.usuarios (id, auth_user_id) values
    (7, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

  insert into public.aulas_emusys (
    id, unidade_id, professor_id, data_aula, data_hora_inicio,
    curso_nome, turma_nome, sala_nome
  ) values (
    100, '11111111-1111-1111-1111-111111111111', 3,
    date '2026-08-06', timestamptz '2026-08-06 13:00:00+00',
    'Piano', 'Turma teste', 'Sala 1'
  );

  insert into public.aula_alunos_emusys (aula_emusys_id, aluno_id)
  values (100, 10);

  -- Evidencia do Emusys: visualmente neutra na chamada, apesar de ausente.
  insert into public.aluno_presenca (
    id, aluno_id, aula_emusys_id, professor_id, unidade_id, data_aula,
    status, status_presenca, respondido_por
  ) values (
    1, 10, 100, 3, '11111111-1111-1111-1111-111111111111', date '2026-08-06',
    'ausente', null, 'emusys'
  );
`;

test('RPC promove fallback ausente do Emusys para falta humana e permanece idempotente', async (t) => {
  const dockerInfo = docker(['info']);
  if (dockerInfo.status !== 0) {
    t.skip('Docker indisponivel para fixture PostgreSQL');
    return;
  }

  const container = `la-chamada-retroativa-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--rm', '--name', container,
    '-e', 'POSTGRES_PASSWORD=postgres',
    '-d', 'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  try {
    await waitForPostgres(container);

    const baseline = extractFunction(fs.readFileSync(baselineMigrationPath, 'utf8'));
    const correction = fs.existsSync(fixMigrationPath)
      ? extractFunction(fs.readFileSync(fixMigrationPath, 'utf8'))
      : '';
    const setup = psql(container, `${fixtureSchema}\n${baseline}\n${correction}`);
    assert.equal(
      setup.status,
      0,
      `${setup.stderr || setup.stdout}\ncontainer=${docker(['inspect', '--format', '{{.State.Status}}', container]).stdout}`,
    );

    const first = psql(container, `
      select public.app_registrar_chamada_agenda(
        '[{"aula_emusys_id":100,"aluno_id":10,"status":"falta"}]'::jsonb
      )::text;
    `);
    assert.equal(first.status, 0, first.stderr || first.stdout);
    const firstResult = JSON.parse(first.stdout.trim());
    assert.equal(firstResult.atualizados, 1);
    assert.deepEqual(firstResult.erros, []);

    const row = psql(container, `
      select coalesce(status_presenca, '<null>') || '|' || coalesce(respondido_por, '<null>')
      from public.aluno_presenca
      where id = 1;
    `);
    assert.equal(row.status, 0, row.stderr || row.stdout);
    assert.equal(row.stdout.trim(), 'falta|agenda_secretaria');

    const second = psql(container, `
      select public.app_registrar_chamada_agenda(
        '[{"aula_emusys_id":100,"aluno_id":10,"status":"falta"}]'::jsonb
      )::text;
    `);
    assert.equal(second.status, 0, second.stderr || second.stdout);
    const secondResult = JSON.parse(second.stdout.trim());
    assert.equal(secondResult.atualizados, 0);
    assert.equal(secondResult.retificados, 0);
    assert.deepEqual(secondResult.erros, []);
  } finally {
    docker(['stop', container]);
  }
});
