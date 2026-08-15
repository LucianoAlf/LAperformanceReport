import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'supabase/migrations');
const migrationPath = fs.readdirSync(migrationsDir)
  .filter((file) => file.endsWith('_reconciliacao_grade_snapshot_completo.sql'))
  .map((file) => path.join(migrationsDir, file))
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
      // A imagem oficial aceita uma conexão durante o initdb e reinicia logo
      // depois. Confirmar a segunda conexão evita entregar um socket efêmero
      // ao fixture.
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

  create table public.aulas_emusys (
    id integer primary key,
    emusys_id integer not null,
    unidade_id uuid not null,
    data_aula date not null,
    categoria text default 'normal',
    cancelada boolean not null default false,
    cancelada_origem text,
    constraint aulas_emusys_cancelada_origem_check
      check (cancelada_origem is null or cancelada_origem in ('emusys', 'agenda_secretaria', 'sync_ausente_emusys'))
  );

  create table public.aula_alunos_emusys (
    id bigint generated always as identity primary key,
    aula_emusys_id integer not null,
    unidade_id uuid not null,
    aluno_id integer,
    aluno_emusys_id bigint,
    aluno_chave text not null,
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

  create function public.fn_presenca_fecha_chamada(p_status text, p_origem text)
  returns boolean language sql immutable as $$
    select coalesce(
      p_status in ('presente', 'falta', 'falta_justificada')
      and (
        p_origem in ('agenda_secretaria', 'professor_la_teacher', 'fabio_audio', 'manual', 'professor_whatsapp')
        or (p_origem = 'emusys' and p_status = 'presente')
      ),
      false
    )
  $$;

  insert into public.aulas_emusys
    (id, emusys_id, unidade_id, data_aula, categoria, cancelada)
  values
    (10, 100, '11111111-1111-1111-1111-111111111111', (now() at time zone 'America/Sao_Paulo')::date + 1, 'normal', false),
    (20, 200, '11111111-1111-1111-1111-111111111111', (now() at time zone 'America/Sao_Paulo')::date + 1, 'normal', false),
    (30, 300, '11111111-1111-1111-1111-111111111111', (now() at time zone 'America/Sao_Paulo')::date + 1, 'normal', false),
    (40, 400, '11111111-1111-1111-1111-111111111111', (now() at time zone 'America/Sao_Paulo')::date + 1, 'normal', false),
    (50, 500, '11111111-1111-1111-1111-111111111111', (now() at time zone 'America/Sao_Paulo')::date - 1, 'normal', false),
    (60, 600, '11111111-1111-1111-1111-111111111111', (now() at time zone 'America/Sao_Paulo')::date + 1, 'normal', false),
    (70, 700, '11111111-1111-1111-1111-111111111111', (now() at time zone 'America/Sao_Paulo')::date + 1, 'normal', false),
    (80, 800, '11111111-1111-1111-1111-111111111111', (now() at time zone 'America/Sao_Paulo')::date + 1, null, false),
    (90, 900, '11111111-1111-1111-1111-111111111111', (now() at time zone 'America/Sao_Paulo')::date + 1, 'normal', false),
    (100, 1000, '11111111-1111-1111-1111-111111111111', (now() at time zone 'America/Sao_Paulo')::date + 1, 'normal', false),
    (110, 1100, '11111111-1111-1111-1111-111111111111', (now() at time zone 'America/Sao_Paulo')::date + 1, 'normal', false),
    (120, 1200, '11111111-1111-1111-1111-111111111111', (now() at time zone 'America/Sao_Paulo')::date + 1, 'normal', false);

  insert into public.aula_alunos_emusys
    (aula_emusys_id, unidade_id, aluno_id, aluno_emusys_id, aluno_chave, aluno_nome)
  values
    (20, '11111111-1111-1111-1111-111111111111', 201, 201, 'emusys:201', 'Aluno atual'),
    (20, '11111111-1111-1111-1111-111111111111', 202, 202, 'emusys:202', 'Aluno removido'),
    (30, '11111111-1111-1111-1111-111111111111', 301, 301, 'emusys:301', 'Aluno com presença'),
    (40, '11111111-1111-1111-1111-111111111111', 401, 401, 'emusys:401', 'Aula com presença'),
    (60, '11111111-1111-1111-1111-111111111111', null, 601, 'emusys:601', 'Identidade ambígua'),
    (70, '11111111-1111-1111-1111-111111111111', 701, 701, 'local:701', 'Chave legada com identidade Emusys'),
    (20, '11111111-1111-1111-1111-111111111111', 203, 203, 'nome:segredo:2000-01-01', 'Chave que nao pode vazar'),
    (110, '11111111-1111-1111-1111-111111111111', 1101, 1101, 'emusys:1101', 'Presenca legada no roster'),
    (120, '11111111-1111-1111-1111-111111111111', 1201, 1201, 'emusys:1201', 'Vinculo estavel que a fonte ambigua nao pode apagar');

  insert into public.aluno_presenca
    (aula_emusys_id, aluno_id, status_presenca, respondido_por)
  values
    (30, 301, 'presente', 'agenda_secretaria'),
    (40, 401, 'presente', 'agenda_secretaria'),
    (90, 901, 'falta', 'emusys');

  insert into public.aluno_presenca
    (aula_emusys_id, aluno_id, status, status_presenca, respondido_por)
  values
    (100, 1001, 'presente', null, 'agenda_secretaria'),
    (110, 1101, 'ausente', null, 'agenda_secretaria');
`;

test('reconciliacao por fotografia completa preserva presença humana e não toca passado', async (t) => {
  assert.ok(migrationPath, 'falta migration reconciliacao_grade_snapshot_completo');

  const dockerInfo = docker(['info']);
  if (dockerInfo.status !== 0) {
    t.skip('Docker indisponível para fixture PostgreSQL');
    return;
  }

  const container = `la-grade-snapshot-${process.pid}-${Date.now()}`;
  const started = docker([
    'run', '--rm', '--name', container,
    '-e', 'POSTGRES_PASSWORD=postgres',
    '-d', 'postgres:17-alpine',
  ]);
  assert.equal(started.status, 0, started.stderr || started.stdout);

  const snapshot = JSON.stringify([
    { emusys_id: 200, aluno_chaves: ['emusys:201'] },
    { emusys_id: 300, aluno_chaves: [] },
    { emusys_id: 600, aluno_chaves: [] },
    { emusys_id: 700, aluno_chaves: ['emusys:701'] },
    { emusys_id: 1100, aluno_chaves: [] },
    { emusys_id: 1200, aluno_chaves: ['emusys:1202', 'nome:aluno sem id:2000-01-01'] },
  ]);

  try {
    await waitForPostgres(container);
    const fixture = psql(container, fixtureSchema);
    assert.equal(fixture.status, 0, fixture.stderr || fixture.stdout);

    const migration = psql(container, fs.readFileSync(migrationPath, 'utf8'));
    assert.equal(migration.status, 0, migration.stderr || migration.stdout);

    const fotografiaVazia = psql(container, `
      select (
        public.reconciliar_grade_snapshot_emusys_v1(
          '11111111-1111-1111-1111-111111111111',
          (now() at time zone 'America/Sao_Paulo')::date,
          (now() at time zone 'America/Sao_Paulo')::date + 1,
          '[]'::jsonb,
          false
        )->>'status'
      ) || '|' || (
        public.reconciliar_grade_snapshot_emusys_v1(
          '11111111-1111-1111-1111-111111111111',
          (now() at time zone 'America/Sao_Paulo')::date,
          (now() at time zone 'America/Sao_Paulo')::date + 1,
          '[]'::jsonb,
          false
        )->>'motivo'
      );
      select cancelada::text from public.aulas_emusys where id = 10;
    `);
    assert.equal(fotografiaVazia.status, 0, fotografiaVazia.stderr || fotografiaVazia.stdout);
    assert.deepEqual(lines(fotografiaVazia.stdout), [
      'abortado|fotografia_vazia_ou_invalida',
      'false',
    ]);

    const dryRun = psql(container, `
      select public.reconciliar_grade_snapshot_emusys_v1(
        '11111111-1111-1111-1111-111111111111',
        (now() at time zone 'America/Sao_Paulo')::date,
        (now() at time zone 'America/Sao_Paulo')::date + 1,
        '${snapshot}'::jsonb,
        true
      )->>'aulas_canceladas';
      select cancelada::text from public.aulas_emusys where id = 10;
      select count(*)::text from public.aula_alunos_emusys where aula_emusys_id = 20;
      select not ((public.reconciliar_grade_snapshot_emusys_v1(
        '11111111-1111-1111-1111-111111111111',
        (now() at time zone 'America/Sao_Paulo')::date,
        (now() at time zone 'America/Sao_Paulo')::date + 1,
        '${snapshot}'::jsonb,
        true
      )->'detalhe')::text like '%nome:%');
    `);
    assert.equal(dryRun.status, 0, dryRun.stderr || dryRun.stdout);
    assert.deepEqual(lines(dryRun.stdout), ['2', 'false', '3', 't']);

    const aplicado = psql(container, `
      select public.reconciliar_grade_snapshot_emusys_v1(
        '11111111-1111-1111-1111-111111111111',
        (now() at time zone 'America/Sao_Paulo')::date,
        (now() at time zone 'America/Sao_Paulo')::date + 1,
        '${snapshot}'::jsonb,
        false
      )->>'vinculos_removidos';
      select id || '|' || cancelada::text || '|' || coalesce(cancelada_origem, '<null>')
      from public.aulas_emusys
      where id in (10, 40, 50, 80, 90, 100)
      order by id;
      select aluno_chave from public.aula_alunos_emusys
      where aula_emusys_id in (20, 30, 60, 70, 110, 120)
      order by aula_emusys_id, aluno_chave;
    `);
    assert.equal(aplicado.status, 0, aplicado.stderr || aplicado.stdout);
    assert.deepEqual(lines(aplicado.stdout), [
      '2',
      '10|true|sync_ausente_emusys',
      '40|false|<null>',
      '50|false|<null>',
      '80|false|<null>',
      '90|true|sync_ausente_emusys',
      '100|false|<null>',
      'emusys:201',
      'emusys:301',
      'emusys:601',
      'local:701',
      'emusys:1101',
      'emusys:1201',
    ]);

    const repetido = psql(container, `
      select public.reconciliar_grade_snapshot_emusys_v1(
        '11111111-1111-1111-1111-111111111111',
        (now() at time zone 'America/Sao_Paulo')::date,
        (now() at time zone 'America/Sao_Paulo')::date + 1,
        '${snapshot}'::jsonb,
        false
      )->>'alteracoes_aplicadas';
      select has_function_privilege(
        'anon',
        'public.reconciliar_grade_snapshot_emusys_v1(uuid,date,date,jsonb,boolean)',
        'execute'
      ) || '|' || has_function_privilege(
        'service_role',
        'public.reconciliar_grade_snapshot_emusys_v1(uuid,date,date,jsonb,boolean)',
        'execute'
      );
    `);
    assert.equal(repetido.status, 0, repetido.stderr || repetido.stdout);
    assert.deepEqual(lines(repetido.stdout), ['0', 'false|true']);
  } finally {
    docker(['stop', container]);
  }
});
