begin;

-- O documento deve conter exatamente o mesmo conjunto de professores que o
-- leitor da pagina devolve para o recorte. A composicao anterior continua
-- responsavel por todas as fontes; este adaptador apenas elimina linhas sem
-- retrato e recompõe os agregados que dependem do roster.
alter function public.montar_relatorio_coordenacao_conteudo_v4(
  uuid, integer, integer, text
) rename to montar_rel_coord_conteudo_before_espelho_integral_20260909;

revoke all on function public.montar_rel_coord_conteudo_before_espelho_integral_20260909(
  uuid, integer, integer, text
) from public, anon, authenticated;
grant execute on function public.montar_rel_coord_conteudo_before_espelho_integral_20260909(
  uuid, integer, integer, text
) to service_role;

create or replace function public.montar_relatorio_coordenacao_conteudo_v4(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodicidade text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_competencia date := make_date(p_ano, p_mes, 1);
  v_conteudo jsonb;
  v_professores jsonb;
  v_ids_painel integer[];
  v_ausentes integer;
  v_resumo jsonb;
  v_carteira jsonb;
  v_presenca jsonb;
  v_retencao_permanencia jsonb;
  v_experimentais jsonb;
  v_ranking jsonb;
  v_sinais jsonb;
begin
  if p_ano is null or p_ano not between 2020 and 2100
     or p_mes is null or p_mes not between 1 and 12
     or p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'RELATORIO_COORDENACAO_V4_PERIODO_INVALIDO'
      using errcode = '22023';
  end if;

  v_conteudo := public.montar_rel_coord_conteudo_before_espelho_integral_20260909(
    p_unidade_id,
    p_ano,
    p_mes,
    p_periodicidade
  );

  if v_conteudo is null
     or jsonb_typeof(v_conteudo -> 'professores') <> 'array' then
    raise exception 'RELATORIO_COORDENACAO_V4_CONTEUDO_INVALIDO'
      using errcode = '22023';
  end if;

  select array_agg(distinct p.professor_id order by p.professor_id)
    into v_ids_painel
  from public.get_health_score_professor_v3_performance_snapshot_v3(
    v_competencia,
    p_unidade_id,
    p_periodicidade
  ) p;

  if coalesce(cardinality(v_ids_painel), 0) = 0 then
    raise exception 'RELATORIO_COORDENACAO_V4_PAINEL_SEM_RETRATO'
      using errcode = '22023';
  end if;

  select count(*)::integer
    into v_ausentes
  from unnest(v_ids_painel) painel(professor_id)
  where not exists (
    select 1
    from jsonb_array_elements(v_conteudo -> 'professores') item(value)
    where nullif(item.value ->> 'professor_id', '')::integer = painel.professor_id
  );

  if v_ausentes > 0 then
    raise exception 'RELATORIO_COORDENACAO_V4_ROSTER_INCOMPLETO: % professor(es)', v_ausentes
      using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(item.value order by item.ord), '[]'::jsonb)
    into v_professores
  from jsonb_array_elements(v_conteudo -> 'professores')
    with ordinality item(value, ord)
  where nullif(item.value ->> 'professor_id', '')::integer = any(v_ids_painel);

  if jsonb_array_length(v_professores) <> cardinality(v_ids_painel) then
    raise exception 'RELATORIO_COORDENACAO_V4_ROSTER_DUPLICADO_OU_DIVERGENTE'
      using errcode = '22023';
  end if;

  with equipe as (
    select value as p
    from jsonb_array_elements(v_professores)
  )
  select jsonb_build_object(
    'total_professores', count(*),
    'com_score', count(*) filter (where nullif(p ->> 'score_observado', '') is not null),
    'comparaveis', count(*) filter (where p ->> 'comparabilidade_estado' = 'comparavel'),
    'em_maturacao', count(*) filter (where p ->> 'comparabilidade_estado' = 'em_maturacao'),
    'sem_base_operacional', count(*) filter (
      where p ->> 'comparabilidade_estado' = 'sem_base_operacional'
    ),
    'com_evidencia_pendente', count(*) filter (
      where p ->> 'comparabilidade_estado' = 'sem_base_operacional'
    ),
    'saudaveis', count(*) filter (
      where p ->> 'comparabilidade_estado' = 'comparavel'
        and p ->> 'classificacao' = 'saudavel'
    ),
    'atencao', count(*) filter (
      where p ->> 'comparabilidade_estado' = 'comparavel'
        and p ->> 'classificacao' = 'atencao'
    ),
    'criticos', count(*) filter (
      where p ->> 'comparabilidade_estado' = 'comparavel'
        and p ->> 'classificacao' = 'critico'
    ),
    'score_medio_comparavel', round(avg(nullif(p ->> 'score_comparavel', '')::numeric), 1),
    'score_medio_observado', round(avg(nullif(p ->> 'score_observado', '')::numeric), 1),
    'score_medio_visivel', round(avg(nullif(p ->> 'score_comparavel', '')::numeric), 1)
  ) into v_resumo
  from equipe;

  with equipe as (
    select
      coalesce(
        nullif(value #>> '{metricas,numero_alunos,valor_bruto}', '')::numeric,
        nullif(value #>> '{metricas,numero_alunos,valor}', '')::numeric
      ) as carteira,
      nullif(value #>> '{operacional,total_turmas}', '')::numeric as total_turmas,
      nullif(value #>> '{operacional,alunos_via_turmas}', '')::numeric as ocupacoes,
      nullif(value #>> '{operacional,turmas_elegiveis_media}', '')::numeric as turmas_elegiveis
    from jsonb_array_elements(v_professores)
  )
  select coalesce(v_conteudo -> 'carteira_carga', '{}'::jsonb) || jsonb_build_object(
    'alunos_na_carteira', case when count(carteira) > 0 then sum(carteira) else null::numeric end,
    'professores_com_carteira_observada', count(carteira),
    'media_por_professor', round(avg(carteira), 1),
    'total_turmas_operacionais', case
      when count(total_turmas) > 0 then sum(total_turmas) else null::numeric end,
    'ocupacoes_elegiveis', case
      when count(ocupacoes) > 0 then sum(ocupacoes) else null::numeric end,
    'turmas_elegiveis', case
      when count(turmas_elegiveis) > 0 then sum(turmas_elegiveis) else null::numeric end,
    'media_alunos_turma', case
      when sum(coalesce(turmas_elegiveis, 0)) > 0
        then round(
          sum(coalesce(ocupacoes, 0)) / sum(coalesce(turmas_elegiveis, 0)),
          2
        )
      else null::numeric
    end
  ) into v_carteira
  from equipe;

  with raw as (
    select value #> '{metricas,presenca}' as item
    from jsonb_array_elements(v_professores)
  )
  select coalesce(v_conteudo -> 'presenca', '{}'::jsonb) || jsonb_build_object(
    'presenca_media', case
      when sum(coalesce(nullif(item ->> 'denominador', '')::numeric, 0)) > 0
        then round(
          100 * sum(coalesce(nullif(item ->> 'numerador', '')::numeric, 0))
            / sum(coalesce(nullif(item ->> 'denominador', '')::numeric, 0)),
          1
        )
      else null::numeric
    end,
    'professores_com_evidencia', count(*) filter (
      where coalesce(nullif(item ->> 'denominador', '')::numeric, 0) > 0
    ),
    'pendencias', count(*) filter (
      where coalesce(nullif(item ->> 'denominador', '')::numeric, 0) <= 0
        and coalesce(item ->> 'codigo_evidencia', '') not in (
          'calendario_sem_aulas_elegiveis',
          'sem_eventos_elegiveis_periodo',
          'sem_aulas_elegiveis'
        )
    ),
    'sem_aulas_elegiveis', count(*) filter (
      where coalesce(item ->> 'codigo_evidencia', '') in (
        'calendario_sem_aulas_elegiveis',
        'sem_eventos_elegiveis_periodo',
        'sem_aulas_elegiveis'
      )
    ),
    'eventos_elegiveis', sum(coalesce(nullif(item ->> 'denominador', '')::numeric, 0)),
    'presencas_confirmadas', sum(coalesce(nullif(item ->> 'numerador', '')::numeric, 0)),
    'regra_agregacao', 'soma_numeradores_dividida_pela_soma_denominadores'
  ) into v_presenca
  from raw;

  with raw as (
    select value as p
    from jsonb_array_elements(v_professores)
  ), metricas as (
    select
      p #> '{metricas,retencao}' as retencao,
      p #> '{metricas,permanencia}' as permanencia
    from raw
  )
  select coalesce(v_conteudo -> 'retencao_permanencia', '{}'::jsonb) || jsonb_build_object(
    'retencao_media', case
      when sum(coalesce(nullif(retencao ->> 'denominador', '')::numeric, 0)) > 0
        then round(
          100 * sum(coalesce(nullif(retencao ->> 'numerador', '')::numeric, 0))
            / sum(coalesce(nullif(retencao ->> 'denominador', '')::numeric, 0)),
          1
        )
      else null::numeric
    end,
    'professores_com_retencao', count(*) filter (
      where coalesce(nullif(retencao ->> 'denominador', '')::numeric, 0) > 0
    ),
    'permanencia_media_meses', case
      when sum(coalesce(nullif(permanencia ->> 'denominador', '')::numeric, 0)) > 0
        then round(
          sum(coalesce(
            nullif(permanencia ->> 'numerador', '')::numeric,
            nullif(permanencia ->> 'valor_bruto', '')::numeric
              * coalesce(nullif(permanencia ->> 'denominador', '')::numeric, 0)
          )) / sum(coalesce(nullif(permanencia ->> 'denominador', '')::numeric, 0)),
          1
        )
      else null::numeric
    end,
    'professores_com_permanencia', count(*) filter (
      where coalesce(nullif(permanencia ->> 'denominador', '')::numeric, 0) > 0
    ),
    'regra_agregacao', 'fatos_brutos_ponderados_no_periodo'
  ) into v_retencao_permanencia
  from metricas;

  with raw as (
    select value #> '{metricas,conversao}' as item
    from jsonb_array_elements(v_professores)
  )
  select coalesce(v_conteudo -> 'experimentais', '{}'::jsonb) || jsonb_build_object(
    'professores_com_amostra_minima', count(*) filter (
      where coalesce(nullif(item ->> 'denominador', '')::numeric, 0) >= 3
    ),
    'professores_conversao_pontuando', count(*) filter (
      where coalesce(nullif(item ->> 'peso_disponivel', '')::boolean, false)
        and coalesce(nullif(item ->> 'peso_efetivo', '')::numeric, 0) > 0
    ),
    'professores_sem_experimental', count(*) filter (
      where coalesce(nullif(item ->> 'denominador', '')::numeric, 0) = 0
    ),
    'professores_com_amostra_insuficiente', count(*) filter (
      where coalesce(nullif(item ->> 'denominador', '')::numeric, 0) between 1 and 2
    ),
    'taxa_conversao_observada', case
      when sum(coalesce(nullif(item ->> 'denominador', '')::numeric, 0)) > 0
        then round(
          100 * sum(coalesce(nullif(item ->> 'numerador', '')::numeric, 0))
            / sum(coalesce(nullif(item ->> 'denominador', '')::numeric, 0)),
          1
        )
      else null::numeric
    end,
    'experimentais_confirmadas', sum(coalesce(nullif(item ->> 'denominador', '')::numeric, 0)),
    'matriculas_pos_experimental', sum(coalesce(nullif(item ->> 'numerador', '')::numeric, 0)),
    'regra_agregacao', 'soma_numeradores_dividida_pela_soma_denominadores'
  ) into v_experimentais
  from raw;

  with equipe as (
    select value as p
    from jsonb_array_elements(v_professores)
    where value ->> 'comparabilidade_estado' = 'comparavel'
      and coalesce(nullif(value ->> 'ranking_habilitado', '')::boolean, false)
      and value ->> 'estado_publicacao' = 'oficial'
      and nullif(value ->> 'score_comparavel', '') is not null
  )
  select jsonb_agg(
    jsonb_build_object(
      'professor_id', nullif(p ->> 'professor_id', '')::integer,
      'nome', p ->> 'nome',
      'score', nullif(p ->> 'score_comparavel', '')::numeric,
      'cobertura', nullif(p ->> 'cobertura', '')::numeric,
      'classificacao', p ->> 'classificacao'
    ) order by nullif(p ->> 'score_comparavel', '')::numeric desc, p ->> 'nome'
  ) into v_ranking
  from equipe;

  if jsonb_typeof(v_conteudo -> 'mapa_sinais') = 'array' then
    select coalesce(jsonb_agg(item.value order by item.ord), '[]'::jsonb)
      into v_sinais
    from jsonb_array_elements(v_conteudo -> 'mapa_sinais')
      with ordinality item(value, ord)
    where nullif(item.value ->> 'professor_id', '')::integer = any(v_ids_painel);
  else
    v_sinais := '[]'::jsonb;
  end if;

  v_conteudo := jsonb_set(v_conteudo, '{professores}', v_professores, true);
  v_conteudo := jsonb_set(v_conteudo, '{resumo_equipe}', v_resumo, true);
  v_conteudo := jsonb_set(v_conteudo, '{carteira_carga}', v_carteira, true);
  v_conteudo := jsonb_set(v_conteudo, '{presenca}', v_presenca, true);
  v_conteudo := jsonb_set(
    v_conteudo,
    '{retencao_permanencia}',
    v_retencao_permanencia,
    true
  );
  v_conteudo := jsonb_set(v_conteudo, '{experimentais}', v_experimentais, true);
  v_conteudo := jsonb_set(
    v_conteudo,
    '{ranking_oficial}',
    coalesce(v_ranking, 'null'::jsonb),
    true
  );
  v_conteudo := jsonb_set(v_conteudo, '{mapa_sinais}', v_sinais, true);
  v_conteudo := jsonb_set(
    v_conteudo,
    '{qualidade_dados}',
    coalesce(v_conteudo -> 'qualidade_dados', '{}'::jsonb) || jsonb_build_object(
      'professores_sem_fonte', coalesce(
        nullif(v_resumo ->> 'sem_base_operacional', '')::integer,
        0
      )
    ),
    true
  );
  v_conteudo := jsonb_set(
    v_conteudo,
    '{auditoria}',
    coalesce(v_conteudo -> 'auditoria', '{}'::jsonb) || jsonb_build_object(
      'roster_fonte', 'performance_snapshot_v3',
      'professores_no_painel', cardinality(v_ids_painel)
    ),
    true
  );

  return v_conteudo;
end;
$function$;

revoke all on function public.montar_relatorio_coordenacao_conteudo_v4(
  uuid, integer, integer, text
) from public, anon, authenticated;
grant execute on function public.montar_relatorio_coordenacao_conteudo_v4(
  uuid, integer, integer, text
) to service_role;

comment on function public.montar_relatorio_coordenacao_conteudo_v4(
  uuid, integer, integer, text
) is 'Documento V4 com roster, valores e agregados derivados do mesmo retrato exibido na pagina de Performance.';

commit;
