begin;

create or replace function public.get_health_score_professor_v3_config_ui(
  p_competencia date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
set statement_timeout = '60s'
as $function$
declare
  v_resultado jsonb;
  v_versoes_ativas jsonb;
begin
  v_resultado := public.fn_health_score_professor_v3_config_ui_competencia(
    p_competencia
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'versao', c.versao,
        'vigencia_inicio', c.vigencia_inicio,
        'vigencia_fim', c.vigencia_fim
      )
      order by c.vigencia_inicio, c.versao
    ),
    '[]'::jsonb
  )
    into v_versoes_ativas
  from public.health_score_professor_v3_config_versoes c
  where c.status = 'ativa';

  return coalesce(v_resultado, '{}'::jsonb) || jsonb_build_object(
    'catalogo_segmentos',
    public.fn_health_score_professor_v3_catalogo_segmentos_v1(),
    'versoes_ativas',
    v_versoes_ativas
  );
end;
$function$;

revoke all on function public.get_health_score_professor_v3_config_ui(date)
  from public, anon;
grant execute on function public.get_health_score_professor_v3_config_ui(date)
  to authenticated, service_role;

comment on function public.get_health_score_professor_v3_config_ui(date) is
  'Retorna a configuracao da competencia, o catalogo pedagogico e as vigencias ativas necessarias para impedir rascunho sobre outra versao.';

commit;
