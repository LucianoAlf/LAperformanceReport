begin;

-- A primeira leitura corrente eliminava a referencia anterior apenas quando
-- ja existia denominador no novo periodo. Isso deixava professores com 0/0
-- exibindo agosto como se fosse setembro. O patch e estritamente de
-- apresentacao: remove essa referencia, preserva nota/score e explicita que o
-- periodo ainda nao possui chamada elegivel.
do $patch_presenca_sem_referencia_residual$
declare
  v_definicao text;
  v_alterada boolean := false;
  v_antigo text;
  v_novo text;
begin
  select pg_get_functiondef(
    'public.get_health_score_professor_v3_performance_snapshot_v3(date,uuid,text)'::regprocedure
  ) into v_definicao;

  v_antigo := $antigo$
        and p.metrica = 'presenca'
        and coalesce(p.denominador_observado, 0) > 0
$antigo$;
  v_novo := $novo$
        and p.metrica = 'presenca'
        and (
          coalesce(p.denominador_observado, 0) > 0
          or p.referencia_temporaria
        )
$novo$;
  if position(v_novo in v_definicao) = 0 then
    if position(v_antigo in v_definicao) = 0 then
      raise exception 'HEALTH_SCORE_V3_PRESENCA_CORRENTE_CONDICAO_INESPERADA';
    end if;
    v_definicao := replace(v_definicao, v_antigo, v_novo);
    v_alterada := true;
  end if;

  v_antigo := $antigo$
      when n.usar_presenca_corrente then 'em_andamento'
      when n.remover_conversao_anterior
           and n.experimentais_confirmadas > 0 then 'em_andamento'
$antigo$;
  v_novo := $novo$
      when n.usar_presenca_corrente
           and coalesce(n.denominador_observado, 0) > 0 then 'em_andamento'
      when n.usar_presenca_corrente then 'sem_base'
      when n.remover_conversao_anterior
           and n.experimentais_confirmadas > 0 then 'em_andamento'
$novo$;
  if position(v_novo in v_definicao) = 0 then
    if position(v_antigo in v_definicao) = 0 then
      raise exception 'HEALTH_SCORE_V3_PRESENCA_CORRENTE_ESTADO_INESPERADO';
    end if;
    v_definicao := replace(v_definicao, v_antigo, v_novo);
    v_alterada := true;
  end if;

  v_antigo := $antigo$
      when n.usar_presenca_corrente then 'parcial'
      when n.remover_conversao_anterior
           and n.experimentais_confirmadas > 0 then 'parcial'
$antigo$;
  v_novo := $novo$
      when n.usar_presenca_corrente
           and coalesce(n.denominador_observado, 0) > 0 then 'parcial'
      when n.usar_presenca_corrente then 'sem_base'
      when n.remover_conversao_anterior
           and n.experimentais_confirmadas > 0 then 'parcial'
$novo$;
  if position(v_novo in v_definicao) = 0 then
    if position(v_antigo in v_definicao) = 0 then
      raise exception 'HEALTH_SCORE_V3_PRESENCA_CORRENTE_CONFIANCA_INESPERADA';
    end if;
    v_definicao := replace(v_definicao, v_antigo, v_novo);
    v_alterada := true;
  end if;

  v_antigo := $antigo$
      when n.usar_presenca_corrente
        then 'Evidencia corrente do periodo em andamento; nao compoe a nota ate o fechamento.'
      when n.remover_conversao_anterior
$antigo$;
  v_novo := $novo$
      when n.usar_presenca_corrente
           and coalesce(n.denominador_observado, 0) > 0
        then 'Evidencia corrente do periodo em andamento; nao compoe a nota ate o fechamento.'
      when n.usar_presenca_corrente
        then 'Nenhuma chamada elegivel registrada no periodo.'
      when n.remover_conversao_anterior
$novo$;
  if position(v_novo in v_definicao) = 0 then
    if position(v_antigo in v_definicao) = 0 then
      raise exception 'HEALTH_SCORE_V3_PRESENCA_CORRENTE_MOTIVO_INESPERADO';
    end if;
    v_definicao := replace(v_definicao, v_antigo, v_novo);
    v_alterada := true;
  end if;

  v_antigo := $antigo$
      when n.usar_presenca_corrente then 'evidencia_observada_em_andamento'
      when n.remover_conversao_anterior
$antigo$;
  v_novo := $novo$
      when n.usar_presenca_corrente
           and coalesce(n.denominador_observado, 0) > 0
        then 'evidencia_observada_em_andamento'
      when n.usar_presenca_corrente then 'sem_eventos_elegiveis_periodo'
      when n.remover_conversao_anterior
$novo$;
  if position(v_novo in v_definicao) = 0 then
    if position(v_antigo in v_definicao) = 0 then
      raise exception 'HEALTH_SCORE_V3_PRESENCA_CORRENTE_CODIGO_INESPERADO';
    end if;
    v_definicao := replace(v_definicao, v_antigo, v_novo);
    v_alterada := true;
  end if;

  v_antigo := $antigo$
          'presenca_observada_em_andamento', true,
$antigo$;
  v_novo := $novo$
          'presenca_observada_em_andamento',
            coalesce(n.denominador_observado, 0) > 0,
$novo$;
  if position(v_novo in v_definicao) = 0 then
    if position(v_antigo in v_definicao) = 0 then
      raise exception 'HEALTH_SCORE_V3_PRESENCA_CORRENTE_DETALHE_INESPERADO';
    end if;
    v_definicao := replace(v_definicao, v_antigo, v_novo);
    v_alterada := true;
  end if;

  if v_alterada then
    execute v_definicao;
  end if;
end;
$patch_presenca_sem_referencia_residual$;

comment on function public.get_health_score_professor_v3_performance_snapshot_v3(
  date, uuid, text
) is
  'Leitor materializado do painel: em periodo aberto exibe evidencia corrente, inclusive ausencia corrente 0/0, sem reutilizar competencia anterior e sem alterar a nota.';

commit;
