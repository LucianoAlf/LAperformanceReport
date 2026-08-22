-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create or replace function public.app_minha_agenda_mes(
  p_inicio date default current_date,
  p_fim date default current_date + 35
)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare v_prof integer := public.fn_professor_do_usuario();
begin
  if v_prof is null then
    return jsonb_build_object('erro', 'sem_professor_vinculado');
  end if;

  if p_fim < p_inicio then
    raise exception 'p_fim (%) não pode ser anterior a p_inicio (%)', p_fim, p_inicio;
  end if;

  return (
    select jsonb_build_object(
      'inicio', p_inicio,
      'fim', p_fim,
      'total', count(*),
      'aulas', coalesce(jsonb_agg(to_jsonb(v) order by v.data_hora_inicio), '[]'::jsonb))
    from public.vw_fabio_aulas_contexto v
    where v.professor_id = v_prof
      and v.data_aula between p_inicio and p_fim
      and coalesce(v.cancelada, false) = false
  );
end
$function$;

revoke all on function public.app_minha_agenda_mes(date, date) from public, anon;
grant execute on function public.app_minha_agenda_mes(date, date) to authenticated;
