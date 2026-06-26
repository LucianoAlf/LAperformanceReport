create or replace function public.campo_fixado(
  p_aluno_id integer,
  p_campo text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.matriculas_campos_fixados f
    where f.aluno_id = p_aluno_id
      and f.campo = p_campo
  );
$$;

grant execute on function public.campo_fixado(integer, text) to authenticated;
grant execute on function public.campo_fixado(integer, text) to service_role;
