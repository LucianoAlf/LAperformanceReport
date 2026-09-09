-- Evidência observada não é amostra mínima para pontuar.
-- Mantém percentuais com denominador positivo e o quorum >= 10 na publicação.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';

create or replace function public.get_health_score_professor_v3_presenca_periodo_v2(
  p_competencia date,
  p_unidade_id uuid default null,
  p_periodicidade text default 'mensal'
)
returns table (
  metrica text,
  professor_id integer,
  professor_nome text,
  unidade_id uuid,
  competencia date,
  valor_bruto numeric,
  numerador numeric,
  denominador numeric,
  amostra integer,
  estado_base text,
  publicavel boolean,
  confianca text,
  fonte text,
  regra_versao text,
  motivo_sem_base text,
  detalhes jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
#variable_conflict use_column
declare
  v_competencia date := date_trunc('month', p_competencia)::date;
  v_inicio date;
  v_fim_periodo date;
  v_fim_recorte date;
  v_codigo text;
begin
  if p_competencia is null or p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'HEALTH_SCORE_V3_PRESENCA_PERIODO_INVALIDO'
      using errcode = '22023';
  end if;

  select p.periodo_inicio, p.periodo_fim, p.ciclo_codigo
    into v_inicio, v_fim_periodo, v_codigo
  from public.fn_health_score_v3_periodo(p_competencia, p_periodicidade) p;

  v_fim_recorte := least(v_fim_periodo, current_date);

  return query
  with unidades_permitidas as materialized (
    select up.unidade_id
    from public.fn_health_score_v3_unidades_permitidas_sombra(p_unidade_id) up
  ), observada as materialized (
    select
      o.professor_id,
      o.unidade_id,
      count(*)::integer as ocorrencias_observadas,
      count(*) filter (
        where o.considera_frequencia_denominador
      )::integer as denominador_observado,
      count(*) filter (where o.considera_presenca)::integer
        as presentes_observados,
      count(*) filter (where o.considera_falta)::integer
        as faltas_observadas,
      count(*) filter (where o.considera_falta_justificada)::integer
        as faltas_justificadas_observadas,
      count(*) filter (
        where not o.considera_frequencia_denominador
      )::integer as ocorrencias_fora_calculo,
      count(*) filter (where o.ocorrencia_incompleta)::integer
        as ocorrencias_incompletas,
      count(*) filter (where o.possui_conflito)::integer
        as ocorrencias_com_conflito
    from unidades_permitidas up
    cross join lateral public.fn_presenca_ocorrencias_escopo_interno_v2(
      up.unidade_id,
      v_inicio,
      v_fim_recorte,
      null,
      null
    ) o
    group by o.professor_id, o.unidade_id
  ), alvo_unidade as (
    select distinct pu.professor_id, pu.unidade_id
    from public.professores_unidades pu
    join unidades_permitidas up on up.unidade_id = pu.unidade_id
    join public.professores pr on pr.id = pu.professor_id and pr.ativo = true
    where coalesce(pu.emusys_ativo, true)
      and coalesce(pu.validacao_status, 'validado')
        not in ('ignorado', 'rejeitado')
      and to_jsonb(pr) ->> 'mesclado_em_professor_id' is null
    union
    select distinct o.professor_id, o.unidade_id
    from observada o
    where o.professor_id is not null
  ), por_professor as (
    select
      a.professor_id,
      case when p_unidade_id is null then null::uuid else a.unidade_id end
        as unidade_saida,
      sum(coalesce(o.ocorrencias_observadas, 0))::integer
        as ocorrencias_observadas,
      sum(coalesce(o.denominador_observado, 0))::integer
        as denominador_observado,
      sum(coalesce(o.presentes_observados, 0))::integer
        as presentes_observados,
      sum(coalesce(o.faltas_observadas, 0))::integer
        as faltas_observadas,
      sum(coalesce(o.faltas_justificadas_observadas, 0))::integer
        as faltas_justificadas_observadas,
      sum(coalesce(o.ocorrencias_fora_calculo, 0))::integer
        as ocorrencias_fora_calculo,
      sum(coalesce(o.ocorrencias_incompletas, 0))::integer
        as ocorrencias_incompletas,
      sum(coalesce(o.ocorrencias_com_conflito, 0))::integer
        as ocorrencias_com_conflito
    from alvo_unidade a
    left join observada o
      on o.professor_id = a.professor_id
     and o.unidade_id = a.unidade_id
    group by a.professor_id,
      case when p_unidade_id is null then null::uuid else a.unidade_id end
  ), classificada as (
    select
      p.*,
      case
        when p.denominador_observado = 0 then 'sem_base'
        when p.denominador_observado < 10 then 'sem_base_amostra'
        else 'ok'
      end as estado_base_calculado,
      p.denominador_observado >= 10 as publicavel_calculado
    from por_professor p
  )
  select
    'presenca'::text,
    c.professor_id,
    pr.nome::text,
    c.unidade_saida,
    v_competencia,
    case when c.denominador_observado > 0 then round(
      c.presentes_observados::numeric / c.denominador_observado * 100,
      2
    ) else null end,
    case when c.denominador_observado > 0
      then c.presentes_observados::numeric else null end,
    case when c.denominador_observado > 0
      then c.denominador_observado::numeric else null end,
    case when c.denominador_observado > 0
      then c.denominador_observado else null end,
    c.estado_base_calculado,
    c.publicavel_calculado,
    case
      when c.publicavel_calculado then 'alta'
      when c.estado_base_calculado = 'sem_base_amostra' then 'baixa'
      else 'sem_base'
    end,
    'fn_presenca_ocorrencias_escopo_interno_v2'::text,
    'health-score-professor-v3-presenca-v2.4'::text,
    case c.estado_base_calculado
      when 'sem_base' then 'nenhuma ocorrencia elegivel no periodo'
      when 'sem_base_amostra' then 'base minima de 10 eventos nao atingida'
      else null
    end,
    jsonb_build_object(
      'periodicidade', p_periodicidade,
      'periodo_inicio', v_inicio,
      'periodo_fim', v_fim_periodo,
      'fim_recorte', v_fim_recorte,
      'ciclo_codigo', v_codigo,
      'ocorrencias_observadas', c.ocorrencias_observadas,
      'denominador_observado', c.denominador_observado,
      'presentes_observados', c.presentes_observados,
      'faltas_observadas', c.faltas_observadas,
      'faltas_justificadas_observadas',
        c.faltas_justificadas_observadas,
      'faltas_total_observado',
        c.faltas_observadas + c.faltas_justificadas_observadas,
      'ocorrencias_fora_calculo', c.ocorrencias_fora_calculo,
      'ocorrencias_incompletas', c.ocorrencias_incompletas,
      'ocorrencias_com_conflito', c.ocorrencias_com_conflito,
      'estado_publicacao', c.estado_base_calculado,
      'fonte_veredito', 'fn_presenca_ocorrencias_escopo_interno_v2',
      'apta_oficial', c.publicavel_calculado
        and p_periodicidade = 'ciclo'
        and v_fim_periodo <= current_date
    )
  from classificada c
  join public.professores pr on pr.id = c.professor_id;
end;
$function$;


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
      'versao', 'coordenacao-v4-confiabilidade-total-20260909',
      'periodicidade', p_periodicidade
    )
  );
end;
$function$;


commit;
