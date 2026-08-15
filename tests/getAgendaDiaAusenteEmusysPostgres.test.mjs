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

const fixture = String.raw`
  create role anon;
  create role authenticated;
  create role service_role;

  create table public.agenda_fixture_acl (
    chave text primary key,
    visivel_para_authenticated boolean not null
  );
  alter table public.agenda_fixture_acl enable row level security;
  create policy agenda_fixture_acl_authenticated on public.agenda_fixture_acl
    for select to authenticated
    using (visivel_para_authenticated);
  create policy agenda_fixture_acl_service_role on public.agenda_fixture_acl
    for select to service_role
    using (true);
  grant select on public.agenda_fixture_acl to authenticated, service_role;

  insert into public.agenda_fixture_acl (chave, visivel_para_authenticated)
  values
    ('fantasma', true),
    ('cancelada_real', true),
    ('ativa', true),
    ('reativada', true),
    ('restrita', false);

  create function public.get_agenda_dia(
    p_data date,
    p_unidade_id uuid default null
  )
  returns table(
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
  )
  language sql stable
  as $$
    select agenda.*
    from (
      values
        ('fantasma'::text, '11111111-1111-1111-1111-111111111111'::uuid,
         'Campo Grande'::text, 'Matheus'::text, 28, null::text, 'Sala 13'::text,
         'Guitarra T'::text, 'G_Sa_09'::text, '09:00'::text, '09:50'::text,
         50, 'normal'::text, 'turma'::text, true, false, false, null::text,
         null::integer, null::integer, 1, null::text, null::text, null::text,
         '[]'::jsonb, array[515512]::integer[],
         'Aula ausente no Emusys'::text, 'sync_ausente_emusys'::text, '[]'::jsonb),
        ('cancelada_real'::text, '11111111-1111-1111-1111-111111111111'::uuid,
         'Campo Grande'::text, 'Outro professor'::text, 29, null::text, 'Sala 1'::text,
         'Piano T'::text, 'P_Sa_10'::text, '10:00'::text, '10:50'::text,
         50, 'normal'::text, 'turma'::text, true, false, false, null::text,
         null::integer, null::integer, 1, null::text, null::text, null::text,
         '[]'::jsonb, array[700]::integer[],
         'Cancelada no Emusys'::text, 'emusys'::text, '[]'::jsonb),
        ('ativa'::text, '11111111-1111-1111-1111-111111111111'::uuid,
         'Campo Grande'::text, 'Professor ativo'::text, 30, null::text, 'Sala 2'::text,
         'Bateria T'::text, 'B_Sa_11'::text, '11:00'::text, '11:50'::text,
         50, 'normal'::text, 'turma'::text, false, false, false, null::text,
         null::integer, null::integer, 1, null::text, null::text, null::text,
         '[]'::jsonb, array[701]::integer[],
         null::text, null::text, '[]'::jsonb),
        ('reativada'::text, '11111111-1111-1111-1111-111111111111'::uuid,
         'Campo Grande'::text, 'Professor reativado'::text, 31, null::text, 'Sala 3'::text,
         'Canto T'::text, 'C_Sa_12'::text, '12:00'::text, '12:50'::text,
         50, 'normal'::text, 'turma'::text, false, false, false, null::text,
         null::integer, null::integer, 1, null::text, null::text, null::text,
         '[]'::jsonb, array[702]::integer[],
         null::text, 'sync_ausente_emusys'::text, '[]'::jsonb),
        ('restrita'::text, '11111111-1111-1111-1111-111111111111'::uuid,
         'Campo Grande'::text, 'Professor restrito'::text, 32, null::text, 'Sala 4'::text,
         'Violao T'::text, 'V_Sa_13'::text, '13:00'::text, '13:50'::text,
         50, 'normal'::text, 'turma'::text, false, false, false, null::text,
         null::integer, null::integer, 1, null::text, null::text, null::text,
         '[]'::jsonb, array[703]::integer[],
         null::text, null::text, '[]'::jsonb)
    ) as agenda(
      chave, unidade_id, unidade_nome, professor_nome, professor_id, professor_foto_url,
      sala_nome, curso_nome, turma_nome, hora_inicio, hora_fim, duracao_minutos,
      categoria, tipo, cancelada, justificada, reagendada, hora_original, nr_da_aula,
      qtd_aulas_contrato, qtd_alunos, anotacoes, anotacoes_fabio, professor_presenca,
      alunos, aula_ids, cancelada_motivo, cancelada_origem, experimental_leads
    )
    join public.agenda_fixture_acl as acl
      on acl.chave = agenda.chave;
  $$;

  revoke all on function public.get_agenda_dia(date, uuid)
    from public, anon;
  grant execute on function public.get_agenda_dia(date, uuid)
    to authenticated, service_role;
`;

test('get_agenda_dia oculta somente aula removida do Emusys sem escalar RLS', async (t) => {
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

    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    const migrated = psql(container, migrationSql);
    assert.equal(migrated.status, 0, migrated.stderr || migrated.stdout);
    const remigrated = psql(container, migrationSql);
    assert.equal(remigrated.status, 0, remigrated.stderr || remigrated.stdout);

    const result = psql(container, `
      set role authenticated;
      select string_agg(chave || '|' || coalesce(cancelada_origem, '<null>'), ',' order by chave)
      from public.get_agenda_dia('2026-08-15', '11111111-1111-1111-1111-111111111111');
      reset role;
      select has_function_privilege(
        'authenticated',
        'public.get_agenda_dia(date,uuid)',
        'execute'
      ) || '|' || has_function_privilege(
        'service_role',
        'public.get_agenda_dia(date,uuid)',
        'execute'
      ) || '|' || has_function_privilege(
        'anon',
        'public.get_agenda_dia(date,uuid)',
        'execute'
      ) || '|' || has_function_privilege(
        'authenticated',
        'public.get_agenda_dia_historico_sync_v1(date,uuid)',
        'execute'
      ) || '|' || has_function_privilege(
        'service_role',
        'public.get_agenda_dia_historico_sync_v1(date,uuid)',
        'execute'
      ) || '|' || has_function_privilege(
        'anon',
        'public.get_agenda_dia_historico_sync_v1(date,uuid)',
        'execute'
      ) || '|' || (
        select (not prosecdef)::text
        from pg_proc
        where oid = 'public.get_agenda_dia(date,uuid)'::regprocedure
      );
    `);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.deepEqual(result.stdout.trim().split(/\r?\n/u), [
      'ativa|<null>,cancelada_real|emusys,reativada|sync_ausente_emusys',
      'true|true|false|true|true|false|true',
    ]);
  } finally {
    docker(['stop', container]);
  }
});
