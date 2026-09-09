begin;

-- Toda linha de presenca do periodo aberto representa a competencia corrente:
-- com denominador, exibe o percentual observado; sem denominador, exibe a
-- ausencia honesta de evento elegivel. O estado tecnico legado em_auditoria
-- nao deve vazar para a pagina quando nao ha conflito nem ocorrencia pendente.
do $patch_presenca_aberta_sem_estado_auditoria$
declare
  v_definicao text;
  v_antigo text := $antigo$
        p.periodo_aberto
        and p.metrica = 'presenca'
        and (
          coalesce(p.denominador_observado, 0) > 0
          or p.referencia_temporaria
        )
      ) as usar_presenca_corrente,
$antigo$;
  v_novo text := $novo$
        p.periodo_aberto
        and p.metrica = 'presenca'
      ) as usar_presenca_corrente,
$novo$;
begin
  select pg_get_functiondef(
    'public.get_health_score_professor_v3_performance_snapshot_v3(date,uuid,text)'::regprocedure
  ) into v_definicao;

  if position(v_novo in v_definicao) > 0 then
    null;
  elsif position(v_antigo in v_definicao) > 0 then
    v_definicao := replace(v_definicao, v_antigo, v_novo);
    execute v_definicao;
  else
    raise exception 'HEALTH_SCORE_V3_PRESENCA_ABERTA_CONDICAO_INESPERADA';
  end if;
end;
$patch_presenca_aberta_sem_estado_auditoria$;

comment on function public.get_health_score_professor_v3_performance_snapshot_v3(
  date, uuid, text
) is
  'Leitor materializado do painel: toda presenca do periodo aberto usa o fato corrente ou ausencia 0/0, sem referencia anterior e sem estado tecnico de auditoria sem conflito.';

commit;
