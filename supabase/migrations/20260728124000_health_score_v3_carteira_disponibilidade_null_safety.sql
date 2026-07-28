begin;

do $migration$
declare
  v_assinatura regprocedure :=
    'public.materializar_health_score_professor_v3_periodo_impl(date,text,uuid,integer)'::regprocedure;
  v_definicao text;
  v_antigo text :=
    E'then v_numero.publicavel\n'
    || E'            and v_numero.denominador > 0\n'
    ||
    E'            and v_numero.estado_base = ''ok''';
  v_novo text :=
    E'then coalesce(v_numero.publicavel, false)\n'
    || E'            and coalesce(v_numero.denominador, 0) > 0\n'
    ||
    E'            and coalesce(v_numero.estado_base, '''') = ''ok''';
begin
  select pg_get_functiondef(v_assinatura)
  into v_definicao;

  if position(v_antigo in v_definicao) = 0 then
    raise exception
      'HEALTH_SCORE_V3_PATCH_INCOMPATIVEL: expressao de peso_disponivel nao encontrada';
  end if;

  execute replace(v_definicao, v_antigo, v_novo);
end;
$migration$;

revoke all on function
  public.materializar_health_score_professor_v3_periodo_impl(
    date, text, uuid, integer
  )
  from public, anon, authenticated;
grant execute on function
  public.materializar_health_score_professor_v3_periodo_impl(
    date, text, uuid, integer
  )
  to service_role;

comment on function
  public.materializar_health_score_professor_v3_periodo_impl(
    date, text, uuid, integer
  ) is
  'Cria revisao append-only da carteira por disponibilidade; ausencia de base produz peso_disponivel=false, nunca null.';

commit;
