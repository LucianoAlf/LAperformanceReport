begin;

do $migration$
begin
  if to_regprocedure(
    'public.materializar_hs_v3_periodo_impl_pre_guard_20260802(date,text,uuid,integer)'
  ) is null then
    if to_regprocedure(
      'public.materializar_health_score_professor_v3_periodo_impl(date,text,uuid,integer)'
    ) is null then
      raise exception
        'HEALTH_SCORE_V3_MATERIALIZADOR_AUSENTE: funcao base nao encontrada';
    end if;

    alter function public.materializar_health_score_professor_v3_periodo_impl(
      date, text, uuid, integer
    ) rename to materializar_hs_v3_periodo_impl_pre_guard_20260802;
  end if;
end;
$migration$;

create or replace function public.materializar_health_score_professor_v3_periodo_impl(
  p_competencia date,
  p_periodicidade text default 'mensal',
  p_unidade_id uuid default null,
  p_professor_id integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_resultado jsonb;
  v_mutacao_anterior text := coalesce(
    current_setting('app.health_score_v3_mutacao_controlada', true),
    'off'
  );
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and session_user <> 'postgres' then
    raise exception 'HEALTH_SCORE_V3_ACESSO_NEGADO: materializacao interna'
      using errcode = '42501';
  end if;

  perform set_config(
    'app.health_score_v3_mutacao_controlada',
    'on',
    true
  );

  begin
    v_resultado := public.materializar_hs_v3_periodo_impl_pre_guard_20260802(
      p_competencia,
      p_periodicidade,
      p_unidade_id,
      p_professor_id
    );
  exception when others then
    perform set_config(
      'app.health_score_v3_mutacao_controlada',
      v_mutacao_anterior,
      true
    );
    raise;
  end;

  perform set_config(
    'app.health_score_v3_mutacao_controlada',
    v_mutacao_anterior,
    true
  );

  return v_resultado;
end;
$function$;

revoke all on function
  public.materializar_hs_v3_periodo_impl_pre_guard_20260802(
    date, text, uuid, integer
  )
  from public, anon, authenticated;
grant execute on function
  public.materializar_hs_v3_periodo_impl_pre_guard_20260802(
    date, text, uuid, integer
  )
  to service_role;

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
  'Abre mutacao controlada apenas durante a materializacao append-only e restaura o estado da sessao ao concluir ou falhar.';

commit;
