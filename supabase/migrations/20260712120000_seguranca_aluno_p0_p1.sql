-- Seguranca P0/P1 do dominio de aluno.
-- Escopo: RPCs pedagogicas, storage de avatars e higiene de grants.
-- Nao altera nem corrige dados existentes.

alter function public.usuario_tem_permissao(integer, character varying, uuid)
  set search_path = public, pg_temp;

create or replace function public.fn_usuario_atual_tem_permissao(
  p_codigo_permissao character varying,
  p_unidade_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    coalesce(auth.role(), '') = 'service_role'
    or exists (
      select 1
      from public.usuarios u
      where u.auth_user_id = auth.uid()
        and coalesce(u.ativo, true)
        and public.usuario_tem_permissao(u.id, p_codigo_permissao, p_unidade_id)
    );
$$;

revoke all on function public.fn_usuario_atual_tem_permissao(character varying, uuid)
  from public, anon;
grant execute on function public.fn_usuario_atual_tem_permissao(character varying, uuid)
  to authenticated, service_role;

create or replace function public.get_jornada_professor(p_professor_id integer)
returns setof public.vw_jornada_professor_atual
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select j.*
  from public.vw_jornada_professor_atual j
  where j.professor_id = p_professor_id
    and (
      coalesce(auth.role(), '') = 'service_role'
      or public.fn_professor_do_usuario() = p_professor_id
      or public.fn_usuario_atual_tem_permissao('professores.editar', j.unidade_id)
    )
  order by j.aluno_nome, j.curso_nome;
$$;

revoke all on function public.get_jornada_professor(integer) from public, anon;
grant execute on function public.get_jornada_professor(integer)
  to authenticated, service_role;

-- Preserva as queries canonicas existentes e as torna inacessiveis diretamente.
do $$
begin
  if to_regprocedure('public.get_historico_pedagogico_aluno(integer)') is not null
     and to_regprocedure('public.get_historico_pedagogico_aluno_interno_20260712(integer)') is null then
    execute 'alter function public.get_historico_pedagogico_aluno(integer) rename to get_historico_pedagogico_aluno_interno_20260712';
  end if;

  if to_regprocedure('public.get_relatorio_pedagogico_aluno(integer,date,date)') is not null
     and to_regprocedure('public.get_relatorio_pedagogico_aluno_interno_20260712(integer,date,date)') is null then
    execute 'alter function public.get_relatorio_pedagogico_aluno(integer,date,date) rename to get_relatorio_pedagogico_aluno_interno_20260712';
  end if;
end;
$$;

alter function public.get_historico_pedagogico_aluno_interno_20260712(integer)
  security definer;
alter function public.get_historico_pedagogico_aluno_interno_20260712(integer)
  set search_path = public, pg_temp;
revoke all on function public.get_historico_pedagogico_aluno_interno_20260712(integer)
  from public, anon, authenticated;
grant execute on function public.get_historico_pedagogico_aluno_interno_20260712(integer)
  to service_role;

alter function public.get_relatorio_pedagogico_aluno_interno_20260712(integer, date, date)
  security definer;
alter function public.get_relatorio_pedagogico_aluno_interno_20260712(integer, date, date)
  set search_path = public, pg_temp;
revoke all on function public.get_relatorio_pedagogico_aluno_interno_20260712(integer, date, date)
  from public, anon, authenticated;
grant execute on function public.get_relatorio_pedagogico_aluno_interno_20260712(integer, date, date)
  to service_role;

create or replace function public.fn_pode_ler_aluno_pedagogico(p_aluno_id integer)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with alvo as (
    select a.id, a.unidade_id, a.professor_atual_id
    from public.alunos a
    where a.id = p_aluno_id
  )
  select coalesce(bool_or(
    coalesce(auth.role(), '') = 'service_role'
    or public.fn_usuario_atual_tem_permissao('professores.editar', alvo.unidade_id)
    or alvo.professor_atual_id = public.fn_professor_do_usuario()
    or exists (
      select 1
      from public.aluno_jornada_matricula_disciplina j
      where j.aluno_id = alvo.id
        and j.professor_id = public.fn_professor_do_usuario()
    )
  ), false)
  from alvo;
$$;

revoke all on function public.fn_pode_ler_aluno_pedagogico(integer)
  from public, anon;
grant execute on function public.fn_pode_ler_aluno_pedagogico(integer)
  to authenticated, service_role;

create or replace function public.get_historico_pedagogico_aluno(p_aluno_id integer)
returns table(
  data_aula date,
  horario_aula time without time zone,
  status text,
  curso_nome text,
  professor_nome text,
  tipo text,
  turma_nome text,
  unidade_nome text,
  anotacoes text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.fn_pode_ler_aluno_pedagogico(p_aluno_id) then
    raise exception 'Acesso negado ao historico pedagogico do aluno %', p_aluno_id
      using errcode = '42501';
  end if;

  return query
  select *
  from public.get_historico_pedagogico_aluno_interno_20260712(p_aluno_id);
end;
$$;

revoke all on function public.get_historico_pedagogico_aluno(integer)
  from public, anon;
grant execute on function public.get_historico_pedagogico_aluno(integer)
  to authenticated, service_role;

create or replace function public.get_relatorio_pedagogico_aluno(
  p_aluno_id integer,
  p_data_inicio date default null,
  p_data_fim date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.fn_pode_ler_aluno_pedagogico(p_aluno_id) then
    raise exception 'Acesso negado ao relatorio pedagogico do aluno %', p_aluno_id
      using errcode = '42501';
  end if;

  return public.get_relatorio_pedagogico_aluno_interno_20260712(
    p_aluno_id,
    p_data_inicio,
    p_data_fim
  );
end;
$$;

revoke all on function public.get_relatorio_pedagogico_aluno(integer, date, date)
  from public, anon;
grant execute on function public.get_relatorio_pedagogico_aluno(integer, date, date)
  to authenticated, service_role;

-- As RPCs de passagem de bastao ja possuem guard por professor/admin.
-- Aqui apenas impedimos grants implicitos ou legados para public/anon.
revoke all on function public.get_passagem_bastao_aluno(integer) from public, anon;
revoke all on function public.get_passagens_bastao_pendentes(integer) from public, anon;
revoke all on function public.passagem_bastao_is_admin() from public, anon;
revoke all on function public.passagem_bastao_is_professor(integer) from public, anon;
grant execute on function public.get_passagem_bastao_aluno(integer)
  to authenticated, service_role;
grant execute on function public.get_passagens_bastao_pendentes(integer)
  to authenticated, service_role;
grant execute on function public.passagem_bastao_is_admin()
  to authenticated, service_role;
grant execute on function public.passagem_bastao_is_professor(integer)
  to authenticated, service_role;

-- avatars permanece publico para leitura. Escrita/exclusao exige usuario autenticado
-- dono do arquivo de perfil ou permissao administrativa de professores.
do $$
declare
  v_policy record;
begin
  for v_policy in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        coalesce(qual, '') ilike '%avatars%'
        or coalesce(with_check, '') ilike '%avatars%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', v_policy.policyname);
  end loop;
end;
$$;

create policy avatars_leitura_publica
on storage.objects
for select
to public
using (bucket_id = 'avatars');

create policy avatars_upload_autorizado
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (
    public.fn_usuario_atual_tem_permissao('professores.editar', null)
    or exists (
      select 1
      from public.usuarios u
      where u.auth_user_id = auth.uid()
        and position('/' in name) = 0
        and name like u.id::text || '-%'
    )
  )
);

create policy avatars_atualizacao_autorizada
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and (
    public.fn_usuario_atual_tem_permissao('professores.editar', null)
    or exists (
      select 1
      from public.usuarios u
      where u.auth_user_id = auth.uid()
        and position('/' in name) = 0
        and name like u.id::text || '-%'
    )
  )
)
with check (
  bucket_id = 'avatars'
  and (
    public.fn_usuario_atual_tem_permissao('professores.editar', null)
    or exists (
      select 1
      from public.usuarios u
      where u.auth_user_id = auth.uid()
        and position('/' in name) = 0
        and name like u.id::text || '-%'
    )
  )
);

create policy avatars_exclusao_autorizada
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (
    public.fn_usuario_atual_tem_permissao('professores.editar', null)
    or exists (
      select 1
      from public.usuarios u
      where u.auth_user_id = auth.uid()
        and position('/' in name) = 0
        and name like u.id::text || '-%'
    )
  )
);
