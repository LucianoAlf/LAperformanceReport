import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  buildAuditSql,
  buildShadowClassificationCase,
} from '../scripts/auditar-presenca-canonica.mjs';

const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');
const IMAGE = process.env.PRESENCA_V2_POSTGRES_IMAGE || 'postgres:17-alpine';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} falhou\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout.trim();
}

function docker(args, options = {}) {
  return run('docker', args, options);
}

function psql(container, sql) {
  return docker(['exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-tA'], {
    input: sql,
  });
}

function waitForPostgres(container) {
  let consecutivos = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = spawnSync('docker', [
      'exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-c', 'select 1',
    ], {
      encoding: 'utf8',
    });
    consecutivos = probe.status === 0 ? consecutivos + 1 : 0;
    if (consecutivos >= 3) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error('PostgreSQL 17 descartavel nao ficou pronto');
}

function migrationV2() {
  const matches = readdirSync(MIGRATIONS)
    .filter((name) => /^\d+_presenca_ocorrencia_canonica_v2\.sql$/u.test(name));
  assert.ok(matches.length <= 1, `mais de uma migration v2 encontrada: ${matches.join(', ')}`);
  return matches.length === 1 ? join(MIGRATIONS, matches[0]) : null;
}

function optimizationMigrations() {
  return [
    '20260828083539_presenca_ocorrencia_canonica_v2_indices.sql',
    '20260828083733_presenca_ocorrencia_canonica_v2_otimizada.sql',
  ].map((name) => join(MIGRATIONS, name));
}

function conflictSemanticsMigration() {
  const matches = readdirSync(MIGRATIONS)
    .filter((name) => /^\d+_presenca_conflitos_gemeos_sem_ruido\.sql$/u.test(name));
  assert.ok(matches.length <= 1, `mais de uma migration do hotfix encontrada: ${matches.join(', ')}`);
  return matches.length === 1 ? join(MIGRATIONS, matches[0]) : null;
}

function snapshotCoerenteMigration() {
  const matches = readdirSync(MIGRATIONS)
    .filter((name) => /^\d+_presenca_snapshot_coerente\.sql$/u.test(name));
  assert.ok(matches.length <= 1, `mais de uma migration de snapshot encontrada: ${matches.join(', ')}`);
  return matches.length === 1 ? join(MIGRATIONS, matches[0]) : null;
}

const schema = String.raw`
create extension if not exists unaccent;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role sol_acesso_restrito nologin;
create role lia_acesso_restrito nologin;
create role mila_acesso_restrito nologin;
create role fabio_agent nologin;

create table public.alunos (
  id integer primary key,
  nome text not null
);

create table public.aulas_emusys (
  id integer primary key,
  emusys_id integer not null,
  unidade_id uuid not null,
  data_aula date not null,
  data_hora_inicio timestamptz not null,
  data_hora_fim timestamptz,
  duracao_minutos integer,
  tipo text,
  categoria text,
  curso_nome text,
  professor_id integer,
  cancelada boolean default false,
  justificada boolean default false
);

create index idx_aulas_emusys_data
  on public.aulas_emusys (unidade_id, data_aula);

create table public.aluno_presenca (
  id uuid primary key,
  aluno_id integer not null,
  professor_id integer,
  unidade_id uuid not null,
  data_aula date not null,
  horario_aula time,
  status text,
  respondido_por text,
  respondido_em timestamptz,
  created_at timestamptz default now(),
  aula_emusys_id integer references public.aulas_emusys(id),
  curso_nome text,
  status_presenca text,
  emusys_presenca_bruta text,
  sincronizado_emusys_em timestamptz,
  constraint uq_presenca_aluno_aula unique (aluno_id, aula_emusys_id)
);

create table public.presenca_politicas_confiabilidade (
  id uuid primary key,
  unidade_id uuid not null,
  data_inicio date not null,
  data_fim date not null,
  ausencia_emusys_resultado text not null,
  exige_revisao_operacional boolean not null,
  decidido_em date not null,
  decidido_por text not null,
  evidencia text not null,
  regra_versao text not null,
  ativa boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.unidades (
  id uuid primary key,
  nome text not null
);

create table public.aula_alunos_emusys (
  id integer primary key,
  unidade_id uuid not null,
  aula_emusys_id integer not null,
  aluno_id integer,
  aluno_chave text,
  ultimo_run_visto uuid,
  updated_at timestamptz default now()
);

create table public.presenca_sync_execucoes (
  id uuid primary key,
  unidade_id uuid not null,
  data_alvo date not null,
  status text not null,
  criada_em timestamptz not null,
  finalizada_em timestamptz
);

create or replace function public.fn_presenca_e_forte(p_fonte text)
returns boolean language sql immutable as $$
  select coalesce(p_fonte in (
    'agenda_secretaria', 'manual', 'professor_la_teacher',
    'fabio_audio', 'professor_whatsapp'
  ), false)
$$;

create or replace function public.get_agenda_dia(p_data date, p_unidade uuid)
returns table(alunos jsonb, cancelada boolean, hora_fim time)
language sql stable as $$
  select '[]'::jsonb, false, time '00:00' where false
$$;

create or replace function public.fn_presenca_pendencias_do_dia(p_unidade uuid, p_data date)
returns table(dummy integer)
language sql stable as $$
  select null::integer where false
$$;
`;

const fixtures = String.raw`
insert into public.unidades values
  ('10000000-0000-0000-0000-000000000001', 'Barra'),
  ('20000000-0000-0000-0000-000000000002', 'Recreio');

insert into public.alunos values
  (120, 'Aluno Homônimo'),
  (121, 'Aluno Homônimo');

insert into public.aulas_emusys
  (id, emusys_id, unidade_id, data_aula, data_hora_inicio, data_hora_fim,
   tipo, categoria, curso_nome, professor_id)
values
  (1, 1001, '10000000-0000-0000-0000-000000000001', '2026-08-25', '2026-08-25 10:00-03', '2026-08-25 11:00-03', 'turma', 'normal', 'Piano', 501),
  (2, 1002, '10000000-0000-0000-0000-000000000001', '2026-08-25', '2026-08-25 10:00-03', '2026-08-25 11:00-03', 'individual', 'normal', ' Piano ', 501),
  (3, 1003, '10000000-0000-0000-0000-000000000001', '2026-08-25', '2026-08-25 10:00-03', '2026-08-25 11:00-03', 'individual', 'normal', 'PIANO', 501),
  (4, 1004, '10000000-0000-0000-0000-000000000001', '2026-08-25', '2026-08-25 12:00-03', '2026-08-25 13:00-03', 'individual', 'normal', 'Violao', 502),
  (5, 1005, '10000000-0000-0000-0000-000000000001', '2026-08-25', '2026-08-25 12:00-03', '2026-08-25 13:00-03', 'individual', 'normal', 'Experimental', 502),
  (6, 1006, '10000000-0000-0000-0000-000000000001', '2026-08-25', '2026-08-25 14:00-03', '2026-08-25 15:00-03', 'individual', 'normal', 'Bateria', 503),
  (7, 1007, '10000000-0000-0000-0000-000000000001', '2026-08-25', '2026-08-25 15:00-03', '2026-08-25 16:00-03', 'individual', 'normal', 'Canto', 504),
  (8, 1008, '10000000-0000-0000-0000-000000000001', '2026-08-25', '2026-08-25 16:00-03', '2026-08-25 17:00-03', 'individual', 'normal', 'Teclado', 505),
  (9, 1009, '10000000-0000-0000-0000-000000000001', '2026-08-25', '2026-08-25 17:00-03', '2026-08-25 18:00-03', 'individual', 'normal', 'Guitarra', 506),
  (10, 1010, '10000000-0000-0000-0000-000000000001', '2026-08-25', '2026-08-25 18:00-03', '2026-08-25 19:00-03', 'individual', 'normal', 'Baixo', 507),
  (11, 1011, '10000000-0000-0000-0000-000000000001', '2026-08-25', '2026-08-25 19:00-03', '2026-08-25 20:00-03', 'individual', 'normal', 'Sax', 508),
  (12, 1012, '10000000-0000-0000-0000-000000000001', '2026-08-25', '2026-08-25 20:00-03', '2026-08-25 21:00-03', 'individual', 'normal', 'Flauta', 509),
  (13, 9999, '10000000-0000-0000-0000-000000000001', '2026-08-25', '2026-08-25 21:00-03', '2026-08-25 22:00-03', 'individual', 'normal', 'Percussao', 510),
  (14, 9999, '20000000-0000-0000-0000-000000000002', '2026-08-25', '2026-08-25 21:00-03', '2026-08-25 22:00-03', 'individual', 'normal', 'Percussao', 510),
  (15, 1015, '10000000-0000-0000-0000-000000000001', '2026-08-26', '2026-08-26 09:00-03', '2026-08-26 10:00-03', 'individual', 'normal', 'Ukulele', 511),
  (16, 1016, '10000000-0000-0000-0000-000000000001', '2026-08-25', '2026-08-25 08:00-03', '2026-08-25 09:00-03', 'individual', 'normal', 'Piano', 512),
  (17, 1017, '10000000-0000-0000-0000-000000000001', '2026-08-25', '2026-08-25 07:00-03', '2026-08-25 08:00-03', 'individual', 'normal', 'Bateria', 513),
  (18, 1018, '10000000-0000-0000-0000-000000000001', '2026-08-27', '2026-08-27 09:00-03', '2026-08-27 10:00-03', 'individual', 'normal', 'Canto', 514),
  (19, 1019, '10000000-0000-0000-0000-000000000001', '2026-08-25', '2026-08-25 06:00-03', '2026-08-25 07:00-03', 'turma', 'normal', 'Violino', 515),
  (20, 1020, '10000000-0000-0000-0000-000000000001', '2026-08-25', '2026-08-25 06:00-03', '2026-08-25 07:00-03', 'individual', 'normal', 'Violino', 515),
  (21, 1021, '10000000-0000-0000-0000-000000000001', '2026-08-25', '2026-08-25 05:00-03', '2026-08-25 06:00-03', 'turma', 'normal', 'Piano', 516),
  (22, 1022, '10000000-0000-0000-0000-000000000001', '2026-08-25', '2026-08-25 05:00-03', '2026-08-25 06:00-03', 'turma', 'normal', 'Piano', 516),
  (23, 1023, '10000000-0000-0000-0000-000000000001', '2026-08-25', '2026-08-25 04:00-03', '2026-08-25 05:00-03', 'individual', 'normal', 'Data resolvida', 517),
  (24, 1024, '10000000-0000-0000-0000-000000000001', '2026-08-25', '2026-08-25 03:00-03', '2026-08-25 04:00-03', 'individual', 'normal', 'Slot multidata', 518),
  (25, 1025, '10000000-0000-0000-0000-000000000001', '2026-08-26', '2026-08-25 03:00-03', '2026-08-25 04:00-03', 'individual', 'normal', 'Slot multidata', 518),
  (26, 1026, '10000000-0000-0000-0000-000000000001', '2026-08-25', '2026-08-25 02:00-03', '2026-08-25 03:00-03', 'turma', 'normal', 'Snapshot coerente', 519),
  (27, 1027, '10000000-0000-0000-0000-000000000001', '2026-08-25', '2026-08-25 02:00-03', '2026-08-25 03:00-03', 'individual', 'normal', 'Snapshot coerente', 519);

update public.aulas_emusys set cancelada = true where id = 16;
update public.aulas_emusys set justificada = true where id = 17;
update public.aulas_emusys set justificada = true where id = 20;

insert into public.presenca_sync_execucoes
  (id, unidade_id, data_alvo, status, criada_em, finalizada_em)
values
  ('40000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001', '2026-08-25', 'concluida',
   '2026-08-25 03:00:00-03', '2026-08-25 03:02:00-03');

insert into public.aula_alunos_emusys
  (id, unidade_id, aula_emusys_id, aluno_id, ultimo_run_visto, updated_at)
values
  (26, '10000000-0000-0000-0000-000000000001', 26, 126,
   '40000000-0000-0000-0000-000000000001', '2026-08-25 03:02:00-03'),
  (27, '10000000-0000-0000-0000-000000000001', 27, 126,
   '40000000-0000-0000-0000-000000000001', '2026-08-25 03:02:00-03'),
  (28, '10000000-0000-0000-0000-000000000001', 26, 127,
   '40000000-0000-0000-0000-000000000001', '2026-08-25 03:02:00-03'),
  (29, '10000000-0000-0000-0000-000000000001', 27, 127,
   '40000000-0000-0000-0000-000000000001', '2026-08-25 03:02:00-03');

insert into public.presenca_politicas_confiabilidade values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '2026-08-26', '2026-08-26', 'falta_confirmada', false, '2026-08-26',
   'fixture', 'politica temporal fixture', 'fixture-v1', true, now()),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   '2026-08-27', '2026-08-27', 'falta_confirmada', true, '2026-08-27',
   'fixture', 'publica e revisa depois', 'fixture-review-v1', true, now());

insert into public.aluno_presenca
  (id, aluno_id, professor_id, unidade_id, data_aula, horario_aula, status,
   respondido_por, respondido_em, aula_emusys_id, curso_nome, status_presenca,
   emusys_presenca_bruta, sincronizado_emusys_em)
values
  ('00000000-0000-0000-0000-000000000001', 101, 501, '10000000-0000-0000-0000-000000000001', '2026-08-25', '10:00', 'presente', 'emusys', null, 1, 'Piano', null, 'presente', '2026-08-25 11:10-03'),
  ('00000000-0000-0000-0000-000000000002', 101, 501, '10000000-0000-0000-0000-000000000001', '2026-08-25', '10:00', 'ausente', 'emusys', null, 2, ' Piano ', null, 'ausente', '2026-08-25 11:11-03'),
  ('00000000-0000-0000-0000-000000000003', 101, 501, '10000000-0000-0000-0000-000000000001', '2026-08-25', '10:00', 'presente', 'emusys', null, 3, 'PIANO', null, 'presente', '2026-08-25 11:12-03'),
  ('00000000-0000-0000-0000-000000000004', 102, 502, '10000000-0000-0000-0000-000000000001', '2026-08-25', '12:00', 'ausente', 'professor_la_teacher', null, 4, 'Violao', null, 'ausente', '2026-08-25 13:10-03'),
  ('00000000-0000-0000-0000-000000000005', 102, 502, '10000000-0000-0000-0000-000000000001', '2026-08-25', '12:00', 'presente', 'emusys', null, 5, 'Experimental', null, 'presente', '2026-08-25 13:10-03'),
  ('00000000-0000-0000-0000-000000000006', 103, 503, '10000000-0000-0000-0000-000000000001', '2026-08-25', '14:00', 'presente', 'agenda_secretaria', '2026-08-25 15:01-03', 6, 'Bateria', 'presente', 'ausente', '2026-08-25 15:20-03'),
  ('00000000-0000-0000-0000-000000000007', 104, 504, '10000000-0000-0000-0000-000000000001', '2026-08-25', '15:00', 'presente', 'fabio_audio', '2026-08-25 16:01-03', 7, 'Canto', 'presente', null, null),
  ('00000000-0000-0000-0000-000000000008', 105, 505, '10000000-0000-0000-0000-000000000001', '2026-08-25', '16:00', 'presente', 'emusys', null, 8, 'Teclado', null, 'presente', '2026-08-25 17:02-03'),
  ('00000000-0000-0000-0000-000000000009', 106, 506, '10000000-0000-0000-0000-000000000001', '2026-08-25', '17:00', 'ausente', 'emusys', null, 9, 'Guitarra', null, 'ausente', '2026-08-25 18:02-03'),
  ('00000000-0000-0000-0000-000000000010', 107, 507, '10000000-0000-0000-0000-000000000001', '2026-08-25', '18:00', 'ausente', 'agenda_secretaria', '2026-08-25 19:01-03', 10, 'Baixo', 'falta', 'presente', '2026-08-25 19:10-03'),
  ('00000000-0000-0000-0000-000000000011', 108, 508, '10000000-0000-0000-0000-000000000001', '2026-08-25', '19:00', 'ausente', 'agenda_secretaria', '2026-08-25 20:01-03', 11, 'Sax', 'falta_justificada', 'presente', '2026-08-25 20:10-03'),
  ('00000000-0000-0000-0000-000000000012', 109, 509, '10000000-0000-0000-0000-000000000001', '2026-08-25', '20:00', null, 'professor_la_teacher', null, 12, 'Flauta', null, null, null),
  ('00000000-0000-0000-0000-000000000013', 110, 510, '10000000-0000-0000-0000-000000000001', '2026-08-25', '21:00', 'presente', 'emusys', null, 13, 'Percussao', null, 'presente', '2026-08-25 22:05-03'),
  ('00000000-0000-0000-0000-000000000014', 110, 510, '20000000-0000-0000-0000-000000000002', '2026-08-25', '21:00', 'presente', 'emusys', null, 14, 'Percussao', null, 'presente', '2026-08-25 22:05-03'),
  ('00000000-0000-0000-0000-000000000015', 111, 511, '10000000-0000-0000-0000-000000000001', '2026-08-26', '09:00', 'ausente', 'emusys', null, 15, 'Ukulele', null, 'ausente', '2026-08-26 10:05-03'),
  ('00000000-0000-0000-0000-000000000016', 112, 512, '10000000-0000-0000-0000-000000000001', '2026-08-25', '08:00', 'presente', 'emusys', null, 16, 'Piano', null, 'presente', '2026-08-25 09:05-03'),
  ('00000000-0000-0000-0000-000000000017', 113, 513, '10000000-0000-0000-0000-000000000001', '2026-08-25', '07:00', 'presente', 'agenda_secretaria', '2026-08-25 08:01-03', 17, 'Bateria', 'presente', 'presente', '2026-08-25 08:05-03'),
  ('00000000-0000-0000-0000-000000000018', 115, 514, '10000000-0000-0000-0000-000000000001', '2026-08-27', '09:00', 'ausente', 'emusys', null, 18, 'Canto', null, 'ausente', '2026-08-27 10:05-03'),
  ('00000000-0000-0000-0000-000000000019', 114, null, '10000000-0000-0000-0000-000000000001', '2026-08-28', null, 'presente', 'agenda_secretaria', '2026-08-28 10:00-03', null, null, 'presente', null, null),
  ('00000000-0000-0000-0000-000000000020', 114, null, '10000000-0000-0000-0000-000000000001', '2026-08-28', null, 'presente', 'agenda_secretaria', '2026-08-28 10:01-03', null, null, 'presente', null, null);

insert into public.aluno_presenca
  (id, aluno_id, professor_id, unidade_id, data_aula, horario_aula, status,
   respondido_por, respondido_em, aula_emusys_id, curso_nome, status_presenca,
   emusys_presenca_bruta, sincronizado_emusys_em)
values
  ('00000000-0000-0000-0000-000000000021', 116, 515, '10000000-0000-0000-0000-000000000001', '2026-08-25', '06:00', 'presente', 'emusys', null, 19, 'Violino', null, 'presente', '2026-08-25 07:05-03'),
  ('00000000-0000-0000-0000-000000000022', 116, 515, '10000000-0000-0000-0000-000000000001', '2026-08-25', '06:00', 'presente', 'emusys', null, 20, 'Violino', null, 'presente', '2026-08-25 07:06-03'),
  ('00000000-0000-0000-0000-000000000023', 120, 516, '10000000-0000-0000-0000-000000000001', '2026-08-25', '05:00', 'presente', 'emusys', null, 21, 'Piano', null, 'presente', '2026-08-25 06:05-03'),
  ('00000000-0000-0000-0000-000000000024', 121, 516, '10000000-0000-0000-0000-000000000001', '2026-08-25', '05:00', 'presente', 'emusys', null, 22, 'Piano', null, 'presente', '2026-08-25 06:05-03'),
  ('00000000-0000-0000-0000-000000000025', 122, 517, '10000000-0000-0000-0000-000000000001', '2026-08-24', '04:00', 'presente', 'emusys', null, 23, 'Data resolvida', null, 'presente', '2026-08-25 05:05-03'),
  ('00000000-0000-0000-0000-000000000026', 124, 518, '10000000-0000-0000-0000-000000000001', '2026-08-25', '03:00', 'ausente', 'emusys', null, 24, 'Slot multidata', null, 'ausente', '2026-08-25 04:05-03'),
  ('00000000-0000-0000-0000-000000000027', 124, 518, '10000000-0000-0000-0000-000000000001', '2026-08-26', '03:00', 'presente', 'emusys', null, 25, 'Slot multidata', null, 'presente', '2026-08-25 04:06-03'),
  ('00000000-0000-0000-0000-000000000028', 123, 501, '20000000-0000-0000-0000-000000000002', '2026-08-26', '10:00', 'presente', 'agenda_secretaria', '2026-08-26 11:00-03', 1, 'Piano', 'presente', null, null),
  ('00000000-0000-0000-0000-000000000029', 126, 519, '10000000-0000-0000-0000-000000000001', '2026-08-25', '02:00', 'ausente', 'agenda_secretaria', '2026-08-25 03:01-03', 26, 'Snapshot coerente', 'falta', 'presente', '2026-08-25 03:00:10-03'),
  ('00000000-0000-0000-0000-000000000030', 126, 519, '10000000-0000-0000-0000-000000000001', '2026-08-25', '02:00', 'ausente', 'agenda_secretaria', '2026-08-25 03:01-03', 27, 'Snapshot coerente', 'falta', 'ausente', '2026-08-25 03:00:11-03'),
  ('00000000-0000-0000-0000-000000000031', 127, 519, '10000000-0000-0000-0000-000000000001', '2026-08-25', '02:00', 'ausente', 'agenda_secretaria', '2026-08-25 03:01-03', 26, 'Snapshot coerente', 'falta', 'presente', '2026-08-25 03:00:10-03'),
  ('00000000-0000-0000-0000-000000000032', 127, 519, '10000000-0000-0000-0000-000000000001', '2026-08-25', '02:00', 'ausente', 'agenda_secretaria', '2026-08-25 03:01-03', 27, 'Snapshot coerente', 'falta', 'presente', '2026-08-25 03:00:11-03');
`;

test('ocorrencia canonica v2 resolve grao, precedencia, politica e escopo', () => {
  assert.match(IMAGE, /^postgres:17(?:[-.][a-z0-9.-]+)?$/iu, 'fixture exige PostgreSQL 17');
  const container = `la-presenca-v2-${process.pid}`;
  docker(['run', '--rm', '--name', container, '-e', 'POSTGRES_PASSWORD=postgres', '-d', IMAGE]);
  try {
    waitForPostgres(container);
    psql(container, schema);
    const migration = migrationV2();
    if (migration && existsSync(migration)) psql(container, readFileSync(migration, 'utf8'));
    psql(container, fixtures);

    const baselineRows = JSON.parse(psql(container, String.raw`
      select coalesce(json_agg(to_jsonb(v) order by
        v.unidade_id, v.data_aula, v.data_hora_inicio, v.aluno_id, v.curso_nome, v.slot_key
      ), '[]'::json)
        from public.vw_presenca_ocorrencia_canonica_v2 v;
    `));
    psql(container, String.raw`
      grant select on public.vw_presenca_ocorrencia_canonica_v2
        to sol_acesso_restrito, lia_acesso_restrito, mila_acesso_restrito, fabio_agent;
    `);
    const optimizations = optimizationMigrations();
    for (const optimization of optimizations) {
      assert.ok(existsSync(optimization), `migration de otimizacao ausente: ${optimization}`);
      psql(container, readFileSync(optimization, 'utf8'));
    }

    psql(container, String.raw`
      create view public.vw_presenca_slot_canonica_v1 as
      with evidencia as (
        select
          ap.*,
          coalesce(ap.professor_id, ae.professor_id) as professor_resolvido,
          coalesce(ae.data_aula, ap.data_aula) as data_resolvida,
          coalesce(
            ae.data_hora_inicio,
            case when ap.horario_aula is not null then
              (ap.data_aula::timestamp + ap.horario_aula)
                at time zone 'America/Sao_Paulo'
            end
          ) as inicio_resolvido,
          coalesce(
            ae.data_hora_fim,
            case when ae.data_hora_inicio is not null and ae.duracao_minutos is not null
              then ae.data_hora_inicio + make_interval(mins => ae.duracao_minutos)
            end
          ) as fim_resolvido,
          coalesce(nullif(btrim(ae.curso_nome), ''), nullif(btrim(ap.curso_nome), ''), '')
            as curso_resolvido,
          coalesce(ae.cancelada, false) as cancelada,
          coalesce(ae.justificada, false) as justificada,
          lower(coalesce(nullif(btrim(ap.emusys_presenca_bruta), ''),
            case when ap.respondido_por in ('emusys', 'sistema') then ap.status end)) as raw,
          politica.ausencia_emusys_resultado,
          case when public.fn_presenca_e_forte(ap.respondido_por)
                    and ap.respondido_em is not null then
            case when ap.status_presenca in ('presente', 'falta', 'falta_justificada')
                   then ap.status_presenca
                 when ap.status = 'presente' then 'presente'
                 when ap.status = 'ausente' then 'falta'
            end
          end as decisao_humana
        from public.aluno_presenca ap
        left join public.aulas_emusys ae
          on ae.id = ap.aula_emusys_id and ae.unidade_id = ap.unidade_id
        left join lateral (
          select p.ausencia_emusys_resultado
          from public.presenca_politicas_confiabilidade p
          where p.unidade_id = ap.unidade_id and p.ativa
            and coalesce(ae.data_aula, ap.data_aula) between p.data_inicio and p.data_fim
          order by p.data_inicio desc, p.created_at desc, p.id
          limit 1
        ) politica on true
      ), classificada as (
        select e.*,
          case when e.cancelada then 'aula_cancelada'
               when e.justificada then 'aula_justificada'
               when e.decisao_humana = 'presente' then 'presente'
               when e.decisao_humana in ('falta', 'falta_justificada') then 'falta_confirmada'
               when e.raw = 'presente' then 'presente'
               when e.raw = 'ausente' and e.ausencia_emusys_resultado = 'falta_confirmada'
                 then 'falta_confirmada'
               else 'indeterminado' end as resultado,
          case when e.cancelada or e.justificada then false
               when e.decisao_humana is not null then true
               when e.raw = 'presente' then true
               else false end as fecha
        from evidencia e
      ), ranqueada as (
        select c.*,
          count(*) over (
            partition by c.aluno_id, c.unidade_id, c.professor_resolvido,
                         c.inicio_resolvido, c.fim_resolvido, c.curso_resolvido
          ) as qtd_linhas,
          bool_or(c.cancelada) over (
            partition by c.aluno_id, c.unidade_id, c.professor_resolvido,
                         c.inicio_resolvido, c.fim_resolvido, c.curso_resolvido
          ) as slot_cancelado,
          bool_or(c.justificada) over (
            partition by c.aluno_id, c.unidade_id, c.professor_resolvido,
                         c.inicio_resolvido, c.fim_resolvido, c.curso_resolvido
          ) as slot_justificado,
          bool_or(c.decisao_humana = 'presente' or c.raw = 'presente') over (
            partition by c.aluno_id, c.unidade_id, c.professor_resolvido,
                         c.inicio_resolvido, c.fim_resolvido, c.curso_resolvido
          ) as slot_tem_presente,
          row_number() over (
            partition by c.aluno_id, c.unidade_id, c.professor_resolvido,
                         c.inicio_resolvido, c.fim_resolvido, c.curso_resolvido
            order by c.fecha desc, public.fn_presenca_e_forte(c.respondido_por) desc,
                     c.respondido_em asc nulls last, c.id
          ) as posicao
        from classificada c
      )
      select
        r.id as aluno_presenca_id,
        r.aluno_id, r.unidade_id, r.professor_resolvido as professor_id,
        r.data_resolvida as data_aula,
        r.inicio_resolvido as data_hora_inicio,
        r.fim_resolvido as data_hora_fim,
        r.curso_resolvido as curso_nome,
        case when r.slot_cancelado then 'aula_cancelada'
             when r.slot_justificado then 'aula_justificada'
             else r.resultado end as resultado_pedagogico,
        case when not (r.slot_cancelado or r.slot_justificado) and r.fecha
          then coalesce(r.decisao_humana,
          case when r.raw = 'presente' then 'presente' end) end as presenca_afirmada,
        (not (r.slot_cancelado or r.slot_justificado) and r.fecha) as chamada_fechada,
        r.respondido_por,
        r.respondido_em,
        r.raw as estado_emusys_bruto,
        ((r.slot_cancelado or r.slot_justificado) and r.slot_tem_presente) as possui_conflito,
        false as tem_divergencia,
        r.slot_cancelado or r.slot_justificado as exclui_por_evento,
        r.qtd_linhas > 1 as slot_geminado_no_emusys
      from ranqueada r
      where r.posicao = 1;
    `);

    let rows = JSON.parse(psql(container, String.raw`
      select coalesce(json_agg(to_jsonb(v) order by
        v.unidade_id, v.data_aula, v.data_hora_inicio, v.aluno_id, v.curso_nome, v.slot_key
      ), '[]'::json)
        from public.vw_presenca_ocorrencia_canonica_v2 v;
    `));
    assert.deepEqual(rows, baselineRows, 'otimizacao deve ser semanticamente identica a v2.1');

    const conflictHotfix = conflictSemanticsMigration();
    if (conflictHotfix && existsSync(conflictHotfix)) {
      psql(container, readFileSync(conflictHotfix, 'utf8'));
    }
    const snapshotCoerente = snapshotCoerenteMigration();
    assert.ok(snapshotCoerente, 'migration de snapshot coerente ausente');
    psql(container, readFileSync(snapshotCoerente, 'utf8'));
    rows = JSON.parse(psql(container, String.raw`
      select coalesce(json_agg(to_jsonb(v) order by
        v.unidade_id, v.data_aula, v.data_hora_inicio, v.aluno_id, v.curso_nome, v.slot_key
      ), '[]'::json)
        from public.vw_presenca_ocorrencia_canonica_v2 v;
    `));

    const boundedPlanRaw = psql(container, String.raw`
      set enable_seqscan = off;
      explain (format json, costs off)
      select count(*)
        from public.vw_presenca_ocorrencia_canonica_v2
       where unidade_id = '10000000-0000-0000-0000-000000000001'
         and data_aula = date '2026-08-25';
    `);
    const boundedPlan = JSON.parse(
      boundedPlanRaw.slice(boundedPlanRaw.indexOf('['), boundedPlanRaw.lastIndexOf(']') + 1),
    );
    const planNodes = [];
    const visitPlan = (node) => {
      if (!node || typeof node !== 'object') return;
      if (node['Node Type']) planNodes.push(node);
      for (const child of node.Plans ?? []) visitPlan(child);
    };
    visitPlan(boundedPlan[0].Plan);
    const scans = planNodes.filter((node) => node['Relation Name']);
    const hasIndexedCondition = (indexName, relationName, terms) => scans.some((node) => (
      node['Index Name'] === indexName
      && node['Relation Name'] === relationName
      && terms.every((term) => String(node['Index Cond'] ?? '').includes(term))
    ));
    assert.ok(
      hasIndexedCondition('idx_aulas_emusys_data', 'aulas_emusys', ['unidade_id', 'data_aula']),
      JSON.stringify(scans, null, 2),
    );
    assert.ok(
      hasIndexedCondition(
        'idx_aluno_presenca_unidade_data_v2',
        'aluno_presenca',
        ['unidade_id', 'data_aula'],
      ),
      JSON.stringify(scans, null, 2),
    );
    assert.ok(
      scans.some((node) => node['Index Name'] === 'idx_aulas_emusys_slot_data_divergente_v2'),
      JSON.stringify(scans, null, 2),
    );

    const linkedLookupRaw = psql(container, String.raw`
      drop index public.idx_aluno_presenca_unidade_data_v2;
      set enable_seqscan = off;
      explain (format json, costs off)
      select id
        from public.aluno_presenca
       where aula_emusys_id = 1
         and unidade_id = '10000000-0000-0000-0000-000000000001';
    `);
    const linkedLookup = JSON.parse(
      linkedLookupRaw.slice(linkedLookupRaw.indexOf('['), linkedLookupRaw.lastIndexOf(']') + 1),
    )[0].Plan;
    assert.equal(linkedLookup['Index Name'], 'idx_aluno_presenca_aula_emusys_unidade_v2');
    assert.match(linkedLookup['Index Cond'], /aula_emusys_id.*unidade_id|unidade_id.*aula_emusys_id/iu);

    const byAluno = (id) => rows.filter((row) => row.aluno_id === id);
    assert.equal(byAluno(101).length, 1, 'duas/tres gemeas viram uma ocorrencia');
    assert.deepEqual(byAluno(101)[0].ids_aulas_emusys, [1, 2, 3]);
    assert.equal(byAluno(101)[0].resultado_canonico, 'presente');
    assert.equal(byAluno(101)[0].possui_conflito, false, 'presente vence ausencia bruta entre gemeas Emusys');
    assert.match(byAluno(101)[0].regra_versao, /presenca-ocorrencia-canonica-v2\.3/u);
    assert.equal(byAluno(102).length, 2, 'dois cursos do mesmo aluno permanecem dois slots');
    assert.equal(byAluno(102).find((row) => row.curso_nome === 'Violao').resultado_canonico, 'indeterminado');
    assert.equal(byAluno(102).find((row) => row.curso_nome === 'Experimental').resultado_canonico, 'presente');

    const agendaVsEmusys = byAluno(103)[0];
    assert.equal(agendaVsEmusys.resultado_canonico, 'presente');
    assert.equal(agendaVsEmusys.fecha_chamada, true);
    assert.equal(agendaVsEmusys.fonte_decisao, 'agenda_secretaria');
    assert.equal(agendaVsEmusys.possui_conflito, false, 'ausencia bruta nao contradiz decisao humana terminal');

    assert.equal(byAluno(104)[0].resultado_canonico, 'presente');
    assert.equal(byAluno(104)[0].fonte_decisao, 'fabio_audio');
    assert.equal(byAluno(105)[0].resultado_canonico, 'presente');
    assert.equal(byAluno(105)[0].fecha_chamada, true);
    assert.equal(byAluno(106)[0].resultado_canonico, 'indeterminado');
    assert.equal(byAluno(106)[0].fecha_chamada, false);
    assert.equal(byAluno(107)[0].resultado_canonico, 'falta');
    assert.equal(byAluno(107)[0].fecha_chamada, true);
    assert.equal(byAluno(107)[0].possui_conflito, true, 'falta humana continua conflitante com presenca Emusys');
    assert.equal(byAluno(108)[0].resultado_canonico, 'falta_justificada');
    assert.equal(byAluno(108)[0].fecha_chamada, true);
    assert.equal(byAluno(108)[0].possui_conflito, true, 'falta justificada humana continua conflitante com presenca Emusys');
    assert.equal(byAluno(109)[0].resultado_canonico, 'indeterminado');
    assert.equal(byAluno(109)[0].fecha_chamada, false);

    assert.equal(byAluno(110).length, 2, 'mesmo ID Emusys em unidades distintas nao colide');
    assert.notEqual(byAluno(110)[0].slot_key, byAluno(110)[1].slot_key);
    assert.deepEqual(
      [byAluno(120).length, byAluno(121).length],
      [1, 1],
      'dois alunos homônimos permanecem separados por aluno_id',
    );
    assert.equal(
      byAluno(122)[0].data_aula,
      '2026-08-25',
      'data da aula Emusys continua prevalecendo sobre a data redundante divergente',
    );
    assert.equal(byAluno(123).length, 1, 'vinculo com unidade divergente permanece evidencia orfa');
    assert.equal(byAluno(123)[0].fonte_decisao, 'identidade_incompleta');
    assert.equal(byAluno(124).length, 1, 'data redundante nao altera o grao historico do slot');
    assert.deepEqual(byAluno(124)[0].ids_aulas_emusys, [24, 25]);
    assert.equal(byAluno(124)[0].resultado_canonico, 'presente');
    assert.equal(byAluno(124)[0].possui_conflito, false, 'presente vence ausencia bruta tambem no ramo multidata');

    assert.equal(byAluno(126).length, 1);
    assert.equal(
      byAluno(126)[0].possui_conflito,
      false,
      'presenca e ausencia gêmeas no mesmo snapshot nao podem gerar conflito operacional',
    );
    assert.equal(byAluno(127).length, 1);
    assert.equal(
      byAluno(127)[0].possui_conflito,
      true,
      'duas presencas gêmeas no mesmo snapshot continuam sendo contradicao real',
    );

    assert.equal(byAluno(111)[0].resultado_canonico, 'falta');
    assert.equal(byAluno(111)[0].fecha_chamada, false, 'ausencia Emusys nao fecha chamada sozinha');
    assert.equal(byAluno(111)[0].fonte_decisao, 'emusys_politica_temporal');

    assert.equal(byAluno(112)[0].resultado_canonico, 'aula_cancelada');
    assert.equal(byAluno(112)[0].fecha_chamada, false);
    assert.equal(byAluno(112)[0].possui_conflito, true);
    assert.equal(byAluno(113)[0].resultado_canonico, 'aula_justificada');
    assert.equal(byAluno(113)[0].fecha_chamada, false);
    assert.equal(byAluno(113)[0].possui_conflito, true);

    assert.equal(byAluno(114).length, 2, 'identidades incompletas nao podem ser fundidas');
    assert.equal(new Set(byAluno(114).map((row) => row.slot_key)).size, 2);
    for (const incompleta of byAluno(114)) {
      assert.equal(incompleta.resultado_canonico, 'indeterminado');
      assert.equal(incompleta.fecha_chamada, false);
      assert.equal(incompleta.fonte_decisao, 'identidade_incompleta');
    }

    assert.equal(byAluno(115)[0].resultado_canonico, 'falta');
    assert.equal(byAluno(115)[0].fecha_chamada, false);
    assert.equal(byAluno(115)[0].fonte_decisao, 'emusys_politica_temporal');
    assert.match(byAluno(115)[0].regra_versao, /fixture-review-v1/u);

    assert.equal(byAluno(116).length, 1);
    assert.deepEqual(byAluno(116)[0].ids_aulas_emusys, [19, 20]);
    assert.equal(byAluno(116)[0].resultado_canonico, 'aula_justificada');
    assert.equal(byAluno(116)[0].fecha_chamada, false);

    const acl = psql(container, String.raw`
      select json_build_object(
        'security_invoker', coalesce(c.reloptions @> array['security_invoker=true'], false),
        'anon', has_table_privilege('anon', 'public.vw_presenca_ocorrencia_canonica_v2', 'select'),
        'authenticated', has_table_privilege('authenticated', 'public.vw_presenca_ocorrencia_canonica_v2', 'select'),
        'sol', has_table_privilege('sol_acesso_restrito', 'public.vw_presenca_ocorrencia_canonica_v2', 'select'),
        'lia', has_table_privilege('lia_acesso_restrito', 'public.vw_presenca_ocorrencia_canonica_v2', 'select'),
        'mila', has_table_privilege('mila_acesso_restrito', 'public.vw_presenca_ocorrencia_canonica_v2', 'select'),
        'fabio', has_table_privilege('fabio_agent', 'public.vw_presenca_ocorrencia_canonica_v2', 'select'),
        'service_role', has_table_privilege('service_role', 'public.vw_presenca_ocorrencia_canonica_v2', 'select')
      )
      from pg_class c
      where c.oid = 'public.vw_presenca_ocorrencia_canonica_v2'::regclass;
    `);
    assert.deepEqual(JSON.parse(acl), {
      security_invoker: true,
      anon: false,
      authenticated: false,
      sol: false,
      lia: false,
      mila: false,
      fabio: false,
      service_role: true,
    });

    const classificacao = JSON.parse(psql(container, String.raw`
      with comparacao(difere, duplicidade_emusys, colisao_curso,
                      precedencia_humana, politica_temporal) as (
        values
          (true,  true,  false, false, false),
          (true,  false, true,  false, false),
          (true,  false, false, true,  false),
          (true,  false, false, false, true),
          (false, false, false, false, false)
      ), classificada as (
        select ${buildShadowClassificationCase('comparacao')} as classe
        from comparacao
      )
      select json_build_object(
        'classes', array_agg(classe order by classe) filter (where classe is not null),
        'sem_explicacao', count(*) filter (where classe = 'sem_explicacao')
      ) from classificada;
    `));
    assert.deepEqual(classificacao, {
      classes: ['colisao_curso', 'duplicidade_emusys', 'politica_temporal', 'precedencia_humana'],
      sem_explicacao: 0,
    });

    const auditorSql = buildAuditSql({
      inicio: '2026-08-25',
      fim: '2026-08-25',
      unidades: ['Barra'],
    }).replace(/;\s*$/u, '');
    const auditor = JSON.parse(psql(container, `
      select coalesce(json_agg(to_jsonb(q)), '[]'::json)
      from (${auditorSql}) q;
    `));
    assert.equal(auditor.length, 1);
    const shadowMarker = '), shadow_contagem as (';
    const shadowPrefixEnd = auditorSql.indexOf(shadowMarker);
    assert.notEqual(shadowPrefixEnd, -1);
    const shadowDetailsSql = `${auditorSql.slice(0, shadowPrefixEnd)})
      select * from shadow_classificado where difere`;
    const shadowDetails = JSON.parse(psql(container, `
      select coalesce(json_agg(to_jsonb(q)), '[]'::json)
      from (${shadowDetailsSql}) q;
    `));
    assert.equal(
      Number(auditor[0].sem_explicacao),
      0,
      JSON.stringify({ resumo: auditor[0], diferencas: shadowDetails }),
    );
  } finally {
    spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' });
  }
});
