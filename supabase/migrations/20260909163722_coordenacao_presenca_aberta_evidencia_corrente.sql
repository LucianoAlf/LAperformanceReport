-- Evidencia detalhada em documentos ABERTOS novos, conferida por professor.
-- Apenas CREATE OR REPLACE: sem materializacao, alteracao de HS ou de dados.
-- O ramo fechado e o fallback legado conservam a guarda historica anterior.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';

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
  v_conteudo jsonb;
  v_total_professores integer := 0;
  v_comparaveis integer := 0;
  v_oficiais integer := 0;
  v_parciais integer := 0;
  v_ranking integer := 0;
  v_conversao_pontuando integer := 0;
  v_turmas_media_individual integer := 0;
  v_professores_presenca integer := 0;
  v_professores_sem_eventos integer := 0;
  v_eventos_presenca integer := 0;
  v_presentes integer := 0;
  v_ocorrencias_total integer := 0;
  v_ocorrencias_fora integer := 0;
  v_ocorrencias_incompletas integer := 0;
  v_ocorrencias_conflito integer := 0;
  v_presenca_media numeric;
  v_ciclo_oficial_completo boolean := false;
  v_estado_publicacao text;
  v_presenca_detalhada boolean;
  v_presenca_aberta_atual boolean := false;
  v_inicio_requisitado date;
  v_fim_requisitado date;
  v_chaves_observadas constant text[] := array[
    'presentes_observados', 'denominador_observado', 'ocorrencias_observadas',
    'ocorrencias_fora_calculo', 'ocorrencias_incompletas', 'ocorrencias_com_conflito',
    'faltas_observadas', 'faltas_justificadas_observadas', 'faltas_total_observado'
  ];
  v_presenca_periodo jsonb;
  v_vinculos_historicos jsonb := '[]'::jsonb;
  v_professores_presenca_equipe integer;
begin
  if p_ano is null or p_ano not between 2020 and 2100
     or p_mes is null or p_mes not between 1 and 12
     or p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'RELATORIO_COORDENACAO_V4_PERIODO_INVALIDO'
      using errcode = '22023';
  end if;

  v_conteudo := public.montar_rel_coord_before_confiabilidade_20260909(
    p_unidade_id, p_ano, p_mes, p_periodicidade
  );
  if v_conteudo is null
     or jsonb_typeof(v_conteudo -> 'professores') <> 'array' then
    raise exception 'RELATORIO_COORDENACAO_V4_CONTEUDO_INVALIDO'
      using errcode = '22023';
  end if;

  select
    count(*)::integer,
    count(*) filter (
      where professor.value ->> 'comparabilidade_estado' = 'comparavel'
        and professor.value -> 'score_comparavel' <> 'null'::jsonb
    )::integer,
    count(*) filter (
      where professor.value ->> 'comparabilidade_estado' = 'comparavel'
        and professor.value ->> 'estado_publicacao' = 'oficial'
        and coalesce((professor.value ->> 'ranking_habilitado')::boolean, false)
    )::integer,
    count(*) filter (
      where professor.value ->> 'comparabilidade_estado' = 'comparavel'
        and professor.value ->> 'estado_publicacao' <> 'oficial'
    )::integer,
    count(*) filter (
      where coalesce(
        nullif(professor.value #>> '{metricas,conversao,peso_efetivo}', '')::numeric,
        0
      ) > 0
    )::integer,
    coalesce(sum(
      case
        when coalesce(
          nullif(professor.value #>> '{metricas,media_turma,amostra}', '')::numeric,
          0
        ) > 0
        then (professor.value #>> '{metricas,media_turma,amostra}')::numeric
        else 0
      end
    ), 0)::integer,
    count(*) filter (
      where coalesce(
        nullif(professor.value #>> '{metricas,presenca,detalhes,denominador_observado}', '')::numeric,
        nullif(professor.value #>> '{metricas,presenca,denominador}', '')::numeric,
        0
      ) > 0
    )::integer,
    count(*) filter (
      where coalesce(
        nullif(professor.value #>> '{metricas,presenca,detalhes,denominador_observado}', '')::numeric,
        0
      ) = 0
    )::integer,
    coalesce(sum(coalesce(
      nullif(professor.value #>> '{metricas,presenca,detalhes,denominador_observado}', '')::numeric,
      0
    )), 0)::integer,
    coalesce(sum(coalesce(
      nullif(professor.value #>> '{metricas,presenca,detalhes,presentes_observados}', '')::numeric,
      0
    )), 0)::integer,
    coalesce(sum(coalesce(
      nullif(professor.value #>> '{metricas,presenca,detalhes,ocorrencias_observadas}', '')::numeric,
      0
    )), 0)::integer,
    coalesce(sum(coalesce(
      nullif(professor.value #>> '{metricas,presenca,detalhes,ocorrencias_fora_calculo}', '')::numeric,
      0
    )), 0)::integer,
    coalesce(sum(coalesce(
      nullif(professor.value #>> '{metricas,presenca,detalhes,ocorrencias_incompletas}', '')::numeric,
      0
    )), 0)::integer,
    coalesce(sum(coalesce(
      nullif(professor.value #>> '{metricas,presenca,detalhes,ocorrencias_com_conflito}', '')::numeric,
      0
    )), 0)::integer
  into v_total_professores, v_comparaveis, v_oficiais, v_parciais,
       v_conversao_pontuando, v_turmas_media_individual,
       v_professores_presenca, v_professores_sem_eventos,
       v_eventos_presenca, v_presentes, v_ocorrencias_total,
       v_ocorrencias_fora, v_ocorrencias_incompletas,
       v_ocorrencias_conflito
  from jsonb_array_elements(v_conteudo -> 'professores') professor(value);

  select coalesce(bool_and(
    coalesce((p.value #> '{metricas,presenca,detalhes}') ? 'ocorrencias_fora_calculo', false)
  ), false) into v_presenca_detalhada
  from jsonb_array_elements(v_conteudo -> 'professores') p(value);

  -- Rotulos humanos nao qualificam legado. Exigir periodo/corte correntes
  -- e codigo de evidencia corrente em CADA professor, inclusive sem eventos.
  select p.periodo_inicio, p.periodo_fim
    into v_inicio_requisitado, v_fim_requisitado
  from public.fn_health_score_v3_periodo(make_date(p_ano,p_mes,1),p_periodicidade) p;

  v_presenca_aberta_atual := current_date between v_inicio_requisitado and v_fim_requisitado
    and (v_conteudo #>> '{periodo,inicio}')::date = v_inicio_requisitado
    and (v_conteudo #>> '{periodo,fim}')::date = v_fim_requisitado
    and (v_conteudo #>> '{periodo,data_corte}')::date = current_date
    and v_conteudo #> '{periodo,publicacao_oficial}' = 'false'::jsonb
    and v_conteudo #> '{periodo,ranking_habilitado}' = 'false'::jsonb
    and jsonb_array_length(v_conteudo -> 'professores') > 0
    and not exists (
      select 1 from jsonb_array_elements(v_conteudo -> 'professores') e
      where (e #>> '{metricas,presenca,codigo_evidencia}' = any(array[
        'evidencia_observada_em_andamento', 'sem_eventos_elegiveis_periodo',
        'sem_aulas_elegiveis', 'calendario_sem_aulas_elegiveis'
      ])) is not true
    );
  v_presenca_aberta_atual := coalesce(v_presenca_aberta_atual, false);
  v_presenca_detalhada := v_presenca_detalhada or v_presenca_aberta_atual;
  v_professores_presenca_equipe := v_professores_presenca;
  if v_presenca_detalhada then
    -- O documento congela também vínculos históricos: a lista atual da equipe
    -- não pode apagar eventos válidos de outra unidade ou de vínculos encerrados.
    select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
      into v_presenca_periodo
    from public.get_health_score_professor_v3_presenca_periodo_v2(
      make_date(p_ano, p_mes, 1), p_unidade_id, p_periodicidade
    ) p;

    if v_presenca_aberta_atual then
      -- O reader aberto pode perder detalhes na agregacao mensal/ciclo, mas
      -- seus numeradores/denominadores devem coincidir POR ID com a fonte.
      -- Ausencia/null nao prova zero; inclusive o professor 0/0 deve existir.
      if exists (
        select 1 from jsonb_array_elements(v_presenca_periodo) p
        cross join unnest(v_chaves_observadas) k
        where jsonb_typeof(p -> 'detalhes' -> k) is distinct from 'number'
      ) or exists (
        select 1 from jsonb_array_elements(v_conteudo -> 'professores') e
        left join lateral (
          select p from jsonb_array_elements(v_presenca_periodo) p
          where p ->> 'professor_id' = e ->> 'professor_id'
        ) fonte on true
        where fonte.p is null
          or jsonb_typeof(e #> '{metricas,presenca,numerador}') is distinct from 'number'
          or jsonb_typeof(e #> '{metricas,presenca,denominador}') is distinct from 'number'
          or (e #>> '{metricas,presenca,numerador}')::numeric
            is distinct from (fonte.p #>> '{detalhes,presentes_observados}')::numeric
          or (e #>> '{metricas,presenca,denominador}')::numeric
            is distinct from (fonte.p #>> '{detalhes,denominador_observado}')::numeric
          or (
            e #>> '{metricas,presenca,codigo_evidencia}' <> 'evidencia_observada_em_andamento'
            and (
              (e #>> '{metricas,presenca,numerador}')::numeric <> 0
              or (e #>> '{metricas,presenca,denominador}')::numeric <> 0
            )
          )
      ) or exists (
        select 1 from jsonb_array_elements(v_conteudo -> 'professores') e
        group by e ->> 'professor_id' having count(*) <> 1
      ) or exists (
        select 1 from jsonb_array_elements(v_presenca_periodo) p
        group by p ->> 'professor_id' having count(*) <> 1
      ) then
        raise exception 'RELATORIO_COORDENACAO_V4_PRESENCA_VERSAO_DIVERGENTE'
          using errcode = '22023';
      end if;

      -- Capturar as flags desta leitura mesmo quando a fracao nao mudou.
      -- O payload/hash da nova versao inclui essa evidencia; nenhum snapshot
      -- armazenado e alterado. Manter ordem, notas, pesos e demais detalhes.
      select jsonb_set(v_conteudo, '{professores}', jsonb_agg(
        jsonb_set(e.value, '{metricas,presenca,detalhes}',
          case when jsonb_typeof(e.value #> '{metricas,presenca,detalhes}') = 'object'
            then e.value #> '{metricas,presenca,detalhes}' else '{}'::jsonb end
          || (select jsonb_object_agg(k, p -> 'detalhes' -> k)
              from unnest(v_chaves_observadas) k), true)
        order by e.ord), true)
        into v_conteudo
      from jsonb_array_elements(v_conteudo -> 'professores') with ordinality e(value, ord)
      join jsonb_array_elements(v_presenca_periodo) p
        on p ->> 'professor_id' = e.value ->> 'professor_id';

      select
        count(*) filter (
          where (e #>> '{metricas,presenca,detalhes,denominador_observado}')::numeric = 0
        )::integer,
        count(*) filter (
          where (e #>> '{metricas,presenca,detalhes,denominador_observado}')::numeric > 0
        )::integer
        into v_professores_sem_eventos, v_professores_presenca_equipe
      from jsonb_array_elements(v_conteudo -> 'professores') e;
    end if;

    -- Não misturar fatos recentes com a nota fechada: qualquer divergência da
    -- equipe exige rematerialização/retificação explícita antes do documento.
    if exists (
      select 1 from jsonb_array_elements(v_conteudo -> 'professores') e
      left join lateral (
        select p from jsonb_array_elements(v_presenca_periodo) p
        where p ->> 'professor_id' = e ->> 'professor_id'
      ) fonte on true
      where fonte.p is null
        or coalesce((e #>> '{metricas,presenca,detalhes,presentes_observados}')::integer, 0)
          <> coalesce((fonte.p #>> '{detalhes,presentes_observados}')::integer, 0)
        or coalesce((e #>> '{metricas,presenca,detalhes,denominador_observado}')::integer, 0)
          <> coalesce((fonte.p #>> '{detalhes,denominador_observado}')::integer, 0)
    ) then
      raise exception 'RELATORIO_COORDENACAO_V4_PRESENCA_VERSAO_DIVERGENTE'
        using errcode = '22023';
    end if;

    select
      count(*) filter (where coalesce((p #>> '{detalhes,denominador_observado}')::integer, 0) > 0)::integer,
      coalesce(sum((p #>> '{detalhes,denominador_observado}')::integer), 0)::integer,
      coalesce(sum((p #>> '{detalhes,presentes_observados}')::integer), 0)::integer,
      coalesce(sum((p #>> '{detalhes,ocorrencias_observadas}')::integer), 0)::integer,
      coalesce(sum((p #>> '{detalhes,ocorrencias_fora_calculo}')::integer), 0)::integer,
      coalesce(sum((p #>> '{detalhes,ocorrencias_incompletas}')::integer), 0)::integer,
      coalesce(sum((p #>> '{detalhes,ocorrencias_com_conflito}')::integer), 0)::integer
    into v_professores_presenca, v_eventos_presenca, v_presentes,
      v_ocorrencias_total, v_ocorrencias_fora, v_ocorrencias_incompletas,
      v_ocorrencias_conflito
    from jsonb_array_elements(v_presenca_periodo) p;

    select coalesce(jsonb_agg(jsonb_build_object(
      'professor_id', (p ->> 'professor_id')::integer,
      'nome', p ->> 'professor_nome',
      'valor', p -> 'valor_bruto',
      'numerador', p -> 'numerador',
      'denominador', p -> 'denominador',
      'amostra', p -> 'amostra',
      'detalhes', p -> 'detalhes'
    ) order by p ->> 'professor_nome', (p ->> 'professor_id')::integer), '[]'::jsonb)
      into v_vinculos_historicos
    from jsonb_array_elements(v_presenca_periodo) p
    where coalesce((p #>> '{detalhes,ocorrencias_observadas}')::integer, 0) > 0
      and not exists (
        select 1 from jsonb_array_elements(v_conteudo -> 'professores') e
        where e ->> 'professor_id' = p ->> 'professor_id'
      );
  end if;

  v_ranking := case
    when jsonb_typeof(v_conteudo -> 'ranking_oficial') = 'array'
      then jsonb_array_length(v_conteudo -> 'ranking_oficial')
    else 0
  end;
  v_presenca_media := case when v_eventos_presenca > 0
    then round(v_presentes::numeric / v_eventos_presenca * 100, 1)
    else null
  end;
  v_ciclo_oficial_completo := p_periodicidade = 'ciclo'
    and coalesce((v_conteudo #>> '{periodo,publicacao_oficial}')::boolean, false)
    and coalesce((v_conteudo #>> '{periodo,ranking_habilitado}')::boolean, false)
    and v_conteudo #>> '{periodo,ciclo_estado}' = 'fechado'
    and v_comparaveis > 0
    and v_comparaveis = v_oficiais
    and v_comparaveis = v_ranking
    and not exists (
      select 1 from jsonb_array_elements(v_conteudo -> 'professores') p
      where p ->> 'comparabilidade_estado' = 'comparavel'
        and not exists (
          select 1 from jsonb_array_elements(v_conteudo -> 'ranking_oficial') r
          where r ->> 'professor_id' = p ->> 'professor_id'
            and (r ->> 'score')::numeric = (p ->> 'score_comparavel')::numeric
        )
    );
  v_estado_publicacao := case
    when v_ciclo_oficial_completo then 'oficial'
    when p_periodicidade = 'ciclo' then 'ciclo_em_acompanhamento'
    else 'mensal'
  end;

  v_conteudo := jsonb_set(
    v_conteudo,
    '{resumo_equipe}',
    coalesce(v_conteudo -> 'resumo_equipe', '{}'::jsonb) || jsonb_build_object(
      'total_professores', v_total_professores,
      'comparaveis', v_comparaveis,
      'oficiais', v_oficiais,
      'parciais', v_parciais
    ),
    true
  );
  v_conteudo := jsonb_set(
    v_conteudo,
    '{periodo}',
    coalesce(v_conteudo -> 'periodo', '{}'::jsonb) || jsonb_build_object(
      'estado_publicacao', v_estado_publicacao
    ),
    true
  );
  v_conteudo := jsonb_set(
    v_conteudo,
    '{experimentais}',
    coalesce(v_conteudo -> 'experimentais', '{}'::jsonb) || jsonb_build_object(
      'professores_conversao_pontuando', v_conversao_pontuando
    ),
    true
  );
  v_conteudo := jsonb_set(
    v_conteudo,
    '{carteira_carga}',
    coalesce(v_conteudo -> 'carteira_carga', '{}'::jsonb) || jsonb_build_object(
      'turmas_usadas_na_media_individual', v_turmas_media_individual
    ),
    true
  );
  if v_presenca_detalhada then
  v_conteudo := jsonb_set(
    v_conteudo,
    '{presenca}',
    (coalesce(v_conteudo -> 'presenca', '{}'::jsonb) - 'pendencias' - 'sem_aulas_elegiveis')
      || jsonb_build_object(
        'total_professores', v_total_professores,
        'professores_com_evidencia', v_professores_presenca,
        'professores_com_evidencia_equipe', v_professores_presenca_equipe,
        'vinculos_historicos', v_vinculos_historicos,
        'professores_sem_eventos', v_professores_sem_eventos,
        'presenca_media', v_presenca_media,
        'eventos_elegiveis', v_eventos_presenca,
        'presencas_confirmadas', v_presentes,
        'ocorrencias_observadas', v_ocorrencias_total,
        'ocorrencias_fora_calculo', v_ocorrencias_fora,
        'ocorrencias_incompletas', v_ocorrencias_incompletas,
        'ocorrencias_com_conflito', v_ocorrencias_conflito,
        'regra_agregacao',
          'soma_das_presencas_dividida_pelas_ocorrencias_elegiveis'
      ),
    true
  );

  else
    -- Períodos ainda não retificados mantêm os totais que foram capturados.
    -- Não inferir contagens novas como zero a partir de metadados ausentes.
    v_conteudo := jsonb_set(v_conteudo, '{presenca}',
      coalesce(v_conteudo -> 'presenca', '{}'::jsonb)
      || jsonb_build_object('total_professores', v_total_professores), true);
  end if;

  return (v_conteudo - 'motor_documento') || jsonb_build_object(
    'motor_documento', jsonb_build_object(
      'versao', case when v_presenca_aberta_atual
        then 'coordenacao-v4-presenca-aberta-corrente-20260909'
        else 'coordenacao-v4-presenca-historica-20260909' end,
      'periodicidade', p_periodicidade
    )
  );
end;
$function$;

commit;
