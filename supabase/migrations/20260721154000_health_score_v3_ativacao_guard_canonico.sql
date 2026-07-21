-- A ativacao deve bloquear o estado atual da operacao, nao diagnosticos
-- historicos ou nao pontuaveis preservados pela simulacao. Catalogo formal,
-- jornada ativa e metas segmentadas continuam sendo os gates canonicos.
-- Os guards nao_ofertada_observada e atribuicoes_pontuaveis_sem_meta ficam
-- intactos na funcao recomposta.

do $ajustar_guard_ativacao$
declare
  v_def text;
  v_original text;
  v_substituto text;
begin
  select pg_get_functiondef(
    'public.ativar_health_score_professor_v3_config_pre_catalogo_v1(uuid,text)'
      ::regprocedure::oid
  ) into v_def;

  v_original := $bloco$
  if v_modo_segmentado and exists (
    select 1
    from public.get_health_score_professor_v3_metricas_segmentadas_v1(
      v_competencia_simulacao,
      p_config_id,
      null,
      'mensal'
    ) d
    where d.metrica = 'numero_alunos'
      and (
        d.estado_base in (
          'regra_ausente',
          'divergencia_nao_ofertada',
          'segmentacao_incompleta'
        )
        or (
          d.atribuicao_pontuavel
          and d.config_meta_segmento_id is null
        )
        or d.divergencias->>'nao_ofertada_com_dados' = 'true'
      )
  ) then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: diagnosticos segmentados atuais bloqueiam a ativacao';
  end if;
$bloco$;

  v_substituto := $bloco$
  if v_modo_segmentado and exists (
    select 1
    from public.get_professor_curso_modalidade_excecoes_v2(
      null,
      500,
      false
    )
  ) then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: excecoes atuais de jornada e catalogo bloqueiam a ativacao';
  end if;
$bloco$;

  if strpos(v_def, v_original) = 0 then
    raise exception 'bloco de diagnosticos atuais nao localizado';
  end if;
  v_def := replace(v_def, v_original, v_substituto);

  v_original := $bloco$
  if v_modo_segmentado and jsonb_array_length(
    coalesce(v_resultado_simulacao->'regra_ausente', '[]'::jsonb)
  ) > 0 then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: regra obrigatoria ausente';
  end if;
$bloco$;
  v_substituto := $bloco$
  -- regra_ausente pode representar atribuicao historica ou nao pontuavel.
  -- A obrigatoriedade atual ja e validada pelo catalogo e pelas atribuicoes
  -- formais ativas antes deste ponto.
$bloco$;
  if strpos(v_def, v_original) = 0 then
    raise exception 'bloco legado de regra ausente nao localizado';
  end if;
  v_def := replace(v_def, v_original, v_substituto);

  v_original := $bloco$
  if v_modo_segmentado and jsonb_array_length(
    coalesce(
      v_resultado_simulacao->'segmentacao_incompleta',
      '[]'::jsonb
    )
  ) > 0 then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: regra obrigatoria depende de segmentacao completa';
  end if;
$bloco$;
  v_substituto := $bloco$
  -- segmentacao_incompleta historica continua registrada na simulacao, mas
  -- somente uma excecao ativa da jornada ou do catalogo bloqueia a vigencia.
$bloco$;
  if strpos(v_def, v_original) = 0 then
    raise exception 'bloco legado de segmentacao incompleta nao localizado';
  end if;
  v_def := replace(v_def, v_original, v_substituto);

  execute v_def;
end;
$ajustar_guard_ativacao$;

comment on function public.ativar_health_score_professor_v3_config_pre_catalogo_v1(
  uuid,
  text
) is
  'Ativa configuracao V3 usando catalogo formal, metas e excecoes atuais como gates; diagnosticos historicos permanecem auditaveis sem bloquear vigencia futura.';
