begin;

do $migration$
declare
  v_assinatura regprocedure :=
    'public.materializar_health_score_professor_v3_periodo_impl_base_202607(date,text,uuid,integer)'::regprocedure;
  v_definicao text;
  v_antigo text :=
    E'      order by s.revisao desc, s.criado_em desc, s.id desc\n'
    || E'      limit 1;\n\n'
    || E'      insert into public.health_score_professor_v3_snapshots (';
  v_novo text :=
    E'      order by s.revisao desc, s.criado_em desc, s.id desc\n'
    || E'      limit 1;\n\n'
    || E'      if not found then\n'
    || E'        v_snapshot_anterior_id := null;\n'
    || E'        v_revisao := 1;\n'
    || E'      end if;\n\n'
    || E'      insert into public.health_score_professor_v3_snapshots (';
begin
  select pg_get_functiondef(v_assinatura)
  into v_definicao;

  if position(v_antigo in v_definicao) = 0 then
    raise exception
      'HEALTH_SCORE_V3_PATCH_INCOMPATIVEL: ponto de revisao inicial nao encontrado';
  end if;

  execute replace(v_definicao, v_antigo, v_novo);
end;
$migration$;

revoke all on function
  public.materializar_health_score_professor_v3_periodo_impl_base_202607(
    date, text, uuid, integer
  )
  from public, anon, authenticated;
grant execute on function
  public.materializar_health_score_professor_v3_periodo_impl_base_202607(
    date, text, uuid, integer
  )
  to service_role;

comment on function
  public.materializar_health_score_professor_v3_periodo_impl_base_202607(
    date, text, uuid, integer
  ) is
  'Materializador-base preservado; primeiro snapshot de uma chave inicia explicitamente na revisao 1.';

commit;
