-- Gate 17B: identidade PostgreSQL dedicada para exportar snapshot-source.
-- Sem senha no Git: a credencial e aplicada separadamente pelo secret store.

do $migration$
begin
  if exists (
    select 1 from pg_roles where rolname = 'fabio_motor_v2_snapshot_ro'
  ) then
    raise exception 'role fabio_motor_v2_snapshot_ro ja existe; abortando fail-closed';
  end if;

  execute $role$
    create role fabio_motor_v2_snapshot_ro
      login
      password null
      nosuperuser
      nocreatedb
      nocreaterole
      noinherit
      noreplication
      nobypassrls
      connection limit 2
  $role$;
end
$migration$;

alter role fabio_motor_v2_snapshot_ro set default_transaction_read_only = on;
alter role fabio_motor_v2_snapshot_ro set statement_timeout = '30s';
alter role fabio_motor_v2_snapshot_ro set lock_timeout = '3s';
alter role fabio_motor_v2_snapshot_ro set idle_in_transaction_session_timeout = '30s';
alter role fabio_motor_v2_snapshot_ro set row_security = on;
alter role fabio_motor_v2_snapshot_ro set search_path = 'pg_catalog, public';

revoke all privileges on database postgres from fabio_motor_v2_snapshot_ro;
grant connect on database postgres to fabio_motor_v2_snapshot_ro;

revoke all privileges on schema public from fabio_motor_v2_snapshot_ro;
grant usage on schema public to fabio_motor_v2_snapshot_ro;

grant select (
  id, professor_id, unidade_id, tipo, curso_nome,
  turma_nome, data_hora_inicio, cancelada
) on public.aulas_emusys to fabio_motor_v2_snapshot_ro;

grant select (
  aula_emusys_id, aluno_id
) on public.aula_alunos_emusys to fabio_motor_v2_snapshot_ro;

grant select (
  aula_emusys_id, aluno_id, considera_presenca
) on public.vw_aluno_presenca_semantica_v1 to fabio_motor_v2_snapshot_ro;

grant select (
  id, aula_id, parent_id, aluno_id, campos, confirmado_em, professor_id
) on public.fabio_registros_aula to fabio_motor_v2_snapshot_ro;

create policy fabio_motor_v2_snapshot_ro_select
  on public.aulas_emusys
  for select
  to fabio_motor_v2_snapshot_ro
  using (true);

create policy fabio_motor_v2_snapshot_ro_select
  on public.aula_alunos_emusys
  for select
  to fabio_motor_v2_snapshot_ro
  using (true);

create policy fabio_motor_v2_snapshot_ro_select
  on public.fabio_registros_aula
  for select
  to fabio_motor_v2_snapshot_ro
  using (true);

comment on role fabio_motor_v2_snapshot_ro is
  'Gate 17B: exportacao read-only dos snapshot-source do Motor V2; sem DML, sem Storage e sem provider.';
