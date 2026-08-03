begin;

do $migration$
declare
  v_def text;
  v_trocadas integer := 0;
  v_atual text := $trecho$
      not coalesce(bool_or(
        coalesce(b.codigo_evidencia, '') in (
          'fonte_canonica_indisponivel',
          'segmentacao_incompleta',
          'conversao_em_auditoria',
          'presenca_em_auditoria',
          'dados_em_auditoria'
        )
      ), false) as fonte_canonica_disponivel
$trecho$;
  v_corrigido text := $trecho$
      not coalesce(bool_or(
        b.papel = 'nota'
        and coalesce(b.peso_disponivel, false)
        and b.nota is not null
        and coalesce(b.codigo_evidencia, '') in (
          'fonte_canonica_indisponivel',
          'segmentacao_incompleta',
          'conversao_em_auditoria',
          'presenca_em_auditoria',
          'dados_em_auditoria'
        )
      ), false) as fonte_canonica_disponivel
$trecho$;
  v_historico_atual text := $trecho$
      not coalesce(bool_or(
        coalesce(sm.codigo_evidencia, '') in (
          'fonte_canonica_indisponivel',
          'segmentacao_incompleta',
          'conversao_em_auditoria',
          'presenca_em_auditoria',
          'dados_em_auditoria'
        )
      ), false) as fonte_canonica_disponivel
$trecho$;
  v_historico_corrigido text := $trecho$
      not coalesce(bool_or(
        sm.papel = 'nota'
        and coalesce(sm.peso_disponivel, false)
        and sm.nota is not null
        and coalesce(sm.codigo_evidencia, '') in (
          'fonte_canonica_indisponivel',
          'segmentacao_incompleta',
          'conversao_em_auditoria',
          'presenca_em_auditoria',
          'dados_em_auditoria'
        )
      ), false) as fonte_canonica_disponivel
$trecho$;
begin
  select pg_get_functiondef(
    'public.get_health_score_professor_v3_performance(date,uuid,text)'::regprocedure
  ) into v_def;

  if position(v_atual in v_def) = 0 then
    raise exception 'HEALTH_SCORE_V3_FONTE_PILAR_EFETIVO: trecho atual nao encontrado';
  end if;
  v_def := replace(v_def, v_atual, v_corrigido);
  v_trocadas := v_trocadas + 1;

  if position(v_historico_atual in v_def) = 0 then
    raise exception 'HEALTH_SCORE_V3_FONTE_PILAR_EFETIVO: trecho historico nao encontrado';
  end if;
  v_def := replace(v_def, v_historico_atual, v_historico_corrigido);
  v_trocadas := v_trocadas + 1;

  execute v_def;

  if v_trocadas <> 2 then
    raise exception 'HEALTH_SCORE_V3_FONTE_PILAR_EFETIVO: substituicoes incompletas';
  end if;
end;
$migration$;

comment on function public.get_health_score_professor_v3_performance(
  date, uuid, text
) is
  'Read model V3: comparabilidade considera auditoria somente nos pilares que efetivamente compoem a nota.';

commit;
