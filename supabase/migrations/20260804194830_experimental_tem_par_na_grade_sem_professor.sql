-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create or replace function public.experimental_tem_par_na_grade(
  p_unidade_id uuid,
  p_nome_aluno text,
  p_data date,
  p_horario time
)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from aulas_emusys ae
    join aula_alunos_emusys aae on aae.aula_emusys_id = ae.id
    where ae.unidade_id = p_unidade_id
      and coalesce(ae.cancelada, false) = false
      and (ae.data_hora_inicio at time zone 'America/Sao_Paulo')::date = p_data
      and (ae.data_hora_inicio at time zone 'America/Sao_Paulo')::time = p_horario
      and lower(unaccent(btrim(aae.aluno_nome))) = lower(unaccent(btrim(p_nome_aluno)))
  );
$$;

drop function if exists public.experimental_tem_par_na_grade(uuid, text, date, time, integer);

revoke all on function public.experimental_tem_par_na_grade(uuid, text, date, time) from public, anon;
grant execute on function public.experimental_tem_par_na_grade(uuid, text, date, time) to authenticated, service_role;
