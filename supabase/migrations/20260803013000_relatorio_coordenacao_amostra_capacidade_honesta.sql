begin;

-- Capacidade fisica comprovada e capacidade apenas estimada sao evidencias
-- diferentes. A segunda serve para conferir o cadastro e nunca, isoladamente,
-- comprova sobrecarga nem bloqueia uma leitura saudavel.
create or replace function public.get_health_score_professor_v3_sinais(
  p_competencia date,
  p_unidade_id uuid
)
returns table (
  professor_id integer,
  unidade_id uuid,
  sinal text,
  severidade text,
  evidencias jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  perform public.fn_health_score_professor_v3_ator_leitura(p_unidade_id);

  if p_competencia is null then
    raise exception 'HEALTH_SCORE_V3_SINAIS_INVALIDO: competencia obrigatoria'
      using errcode = '22023';
  end if;

  return query
  with performance as (
    select *
    from public.get_health_score_professor_v3_performance(
      p_competencia,
      p_unidade_id,
      'mensal'
    )
  ), professores as (
    select
      p.professor_id,
      p.unidade_id,
      max(p.estado) as estado,
      max(p.score) as score,
      max(p.valor_bruto) filter (where p.metrica = 'numero_alunos') as carteira,
      max(p.valor_bruto) filter (where p.metrica = 'retencao') as retencao,
      max(p.meta) filter (where p.metrica = 'retencao') as meta_retencao,
      max(p.valor_bruto) filter (where p.metrica = 'presenca') as presenca,
      max(p.meta) filter (where p.metrica = 'presenca') as meta_presenca,
      max(p.codigo_evidencia) filter (where p.metrica = 'retencao') as evidencia_retencao,
      max(p.codigo_evidencia) filter (where p.metrica = 'presenca') as evidencia_presenca,
      bool_or(p.codigo_evidencia = 'professor_em_maturacao') as em_maturacao
    from performance p
    group by p.professor_id, p.unidade_id
  ), percentis as (
    select
      percentile_cont(0.5) within group (order by f.carteira) as p50,
      percentile_cont(0.75) within group (order by f.carteira) as p75
    from professores f
    where f.carteira is not null
  ), capacidade as (
    select
      d.professor_id,
      d.unidade_id,
      bool_or(d.capacidade_excedida and d.capacidade_fisica)
        as capacidade_fisica_excedida,
      bool_or(d.capacidade_excedida and not d.capacidade_fisica)
        as capacidade_estimada_excedida,
      jsonb_agg(d.evidencias order by d.curso_id, d.turma_chave)
        filter (where d.capacidade_excedida and d.capacidade_fisica)
        as evidencias_capacidade_fisica,
      jsonb_agg(d.evidencias order by d.curso_id, d.turma_chave)
        filter (where d.capacidade_excedida and not d.capacidade_fisica)
        as evidencias_capacidade_estimada
    from public.get_health_score_professor_v3_capacidade_diagnostico(
      p_competencia,
      p_unidade_id
    ) d
    where p_unidade_id is not null
    group by d.professor_id, d.unidade_id
  ), disponibilidade as (
    select
      pu.professor_id,
      pu.unidade_id,
      coalesce(pu.disponibilidade, '{}'::jsonb) not in ('{}'::jsonb, '[]'::jsonb)
        as disponivel
    from public.professores_unidades pu
    where p_unidade_id is null or pu.unidade_id = p_unidade_id
  ), base as (
    select
      f.*,
      q.p50,
      q.p75,
      coalesce(c.capacidade_fisica_excedida, false) as capacidade_fisica_excedida,
      coalesce(c.capacidade_estimada_excedida, false) as capacidade_estimada_excedida,
      c.evidencias_capacidade_fisica,
      c.evidencias_capacidade_estimada,
      coalesce(d.disponivel, false) as tem_disponibilidade,
      coalesce(f.retencao >= f.meta_retencao, false) as retencao_saudavel,
      coalesce(f.presenca >= f.meta_presenca, false) as presenca_saudavel
    from professores f
    cross join percentis q
    left join capacidade c
      on c.professor_id = f.professor_id
     and c.unidade_id is not distinct from f.unidade_id
    left join disponibilidade d
      on d.professor_id = f.professor_id
     and d.unidade_id is not distinct from f.unidade_id
  ), sinais as (
    select
      b.professor_id, b.unidade_id,
      'possivel_sobrecarga'::text as sinal,
      case when b.capacidade_fisica_excedida then 'alto' else 'medio' end::text
        as severidade,
      jsonb_build_object(
        'carteira', b.carteira,
        'p75_unidade', b.p75,
        'retencao', b.retencao,
        'meta_retencao', b.meta_retencao,
        'presenca', b.presenca,
        'meta_presenca', b.meta_presenca,
        'capacidade_fisica_excedida', b.capacidade_fisica_excedida,
        'motivo', 'carteira_acima_p75_com_indicador_pedagogico_fragil'
      ) as evidencias
    from base b
    where b.carteira > b.p75
      and (
        not b.retencao_saudavel
        or not b.presenca_saudavel
        or b.capacidade_fisica_excedida
      )

    union all
    select b.professor_id, b.unidade_id,
      'expansao_sustentavel', 'baixo',
      jsonb_build_object(
        'carteira', b.carteira,
        'p50_unidade', b.p50,
        'retencao', b.retencao,
        'presenca', b.presenca,
        'motivo', 'carteira_relevante_com_indicadores_saudaveis'
      )
    from base b
    where b.carteira >= b.p50
      and b.retencao_saudavel
      and b.presenca_saudavel
      and not b.capacidade_fisica_excedida

    union all
    select b.professor_id, b.unidade_id,
      'oportunidade_distribuicao', 'baixo',
      jsonb_build_object(
        'carteira', b.carteira,
        'p50_unidade', b.p50,
        'disponibilidade_cadastrada', b.tem_disponibilidade,
        'motivo', 'carteira_abaixo_p50_com_saude_e_disponibilidade'
      )
    from base b
    where b.carteira < b.p50
      and b.retencao_saudavel
      and b.presenca_saudavel
      and b.tem_disponibilidade

    union all
    select b.professor_id, b.unidade_id,
      'concentracao_operacional', 'alto',
      jsonb_build_object(
        'capacidade_fisica_excedida', true,
        'turmas', coalesce(b.evidencias_capacidade_fisica, '[]'::jsonb),
        'motivo', 'ocupacao_acima_da_capacidade_fisica_cadastrada'
      )
    from base b
    where b.capacidade_fisica_excedida

    union all
    select b.professor_id, b.unidade_id,
      'capacidade_estimada_conferir', 'medio',
      jsonb_build_object(
        'capacidade_estimada_excedida', true,
        'fonte', 'estimada_segmento',
        'turmas', coalesce(b.evidencias_capacidade_estimada, '[]'::jsonb),
        'motivo', 'estimativa_sem_vinculo_fisico_de_turma_ou_sala'
      )
    from base b
    where b.capacidade_estimada_excedida

    union all
    select b.professor_id, b.unidade_id,
      'maturacao', 'baixo',
      jsonb_build_object(
        'estado', b.estado,
        'score', b.score,
        'evidencia_retencao', b.evidencia_retencao,
        'evidencia_presenca', b.evidencia_presenca,
        'motivo', 'professor_ou_base_em_maturacao'
      )
    from base b
    where b.em_maturacao or b.estado = 'em_maturacao'
  )
  select s.professor_id, s.unidade_id, s.sinal, s.severidade, s.evidencias
  from sinais s
  order by
    case s.severidade when 'alto' then 1 when 'medio' then 2 else 3 end,
    s.professor_id,
    s.sinal;
end;
$function$;

-- Preserva o produtor vigente e acrescenta somente a semantica honesta do
-- bloco de experimentais. O conteudo fechado do Health Score nao e recalculado.
alter function public.get_relatorio_coordenacao_canonico_v1(uuid, integer, integer)
  rename to get_relatorio_coordenacao_canonico_v1_base_20260802;

create or replace function public.get_relatorio_coordenacao_canonico_v1(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_competencia date;
  v_payload jsonb;
  v_experimentais jsonb;
  v_amostra_minima integer := 3;
  v_professores_com_amostra_minima integer := 0;
  v_professores_com_conversao_pontuando integer := 0;
begin
  perform public.fn_health_score_professor_v3_ator_leitura(p_unidade_id);

  if p_ano is null or p_ano < 2020 or p_ano > 2100
     or p_mes is null or p_mes < 1 or p_mes > 12 then
    raise exception 'RELATORIO_COORDENACAO_PERIODO_INVALIDO: ano e mes obrigatorios'
      using errcode = '22023';
  end if;

  v_competencia := make_date(p_ano, p_mes, 1);
  v_payload := public.get_relatorio_coordenacao_canonico_v1_base_20260802(
    p_unidade_id,
    p_ano,
    p_mes
  );

  select coalesce(cm.amostra_minima, 3)
    into v_amostra_minima
  from public.health_score_professor_v3_config_versoes cv
  join public.health_score_professor_v3_config_metricas cm
    on cm.config_id = cv.id
   and cm.metrica = 'conversao'
  where cv.status in ('ativa', 'arquivada')
    and cv.vigencia_inicio <= v_competencia
    and (cv.vigencia_fim is null or cv.vigencia_fim >= v_competencia)
  order by
    case cv.status when 'ativa' then 0 else 1 end,
    cv.vigencia_inicio desc,
    cv.versao desc
  limit 1;

  v_amostra_minima := coalesce(v_amostra_minima, 3);

  with equipe as (
    select value as p
    from jsonb_array_elements(coalesce(v_payload -> 'professores', '[]'::jsonb))
  )
  select
    count(*) filter (
      where coalesce((p #>> '{metricas,conversao,amostra}')::integer, 0)
        >= v_amostra_minima
    ),
    count(*) filter (
      where coalesce((p #>> '{metricas,conversao,peso_efetivo}')::numeric, 0) > 0
    )
  into
    v_professores_com_amostra_minima,
    v_professores_com_conversao_pontuando
  from equipe;

  v_experimentais := coalesce(v_payload -> 'experimentais', '{}'::jsonb)
    || jsonb_build_object(
      'amostra_minima_configurada', v_amostra_minima,
      'professores_com_amostra', v_professores_com_amostra_minima,
      'professores_com_amostra_minima', v_professores_com_amostra_minima,
      'professores_com_conversao_pontuando', v_professores_com_conversao_pontuando
    );

  return jsonb_set(v_payload, '{experimentais}', v_experimentais, true);
end;
$function$;

revoke all on function public.get_health_score_professor_v3_sinais(date, uuid)
  from public, anon;
grant execute on function public.get_health_score_professor_v3_sinais(date, uuid)
  to authenticated, service_role;

revoke all on function
  public.get_relatorio_coordenacao_canonico_v1_base_20260802(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function
  public.get_relatorio_coordenacao_canonico_v1_base_20260802(uuid, integer, integer)
  to service_role;

revoke all on function public.get_relatorio_coordenacao_canonico_v1(uuid, integer, integer)
  from public, anon;
grant execute on function public.get_relatorio_coordenacao_canonico_v1(uuid, integer, integer)
  to authenticated, service_role;

comment on function public.get_health_score_professor_v3_sinais(date, uuid) is
  'Mapa diagnostico: capacidade fisica comprovada e estimativa cadastral sao sinais distintos; nao altera score nem snapshots.';
comment on function public.get_relatorio_coordenacao_canonico_v1(uuid, integer, integer) is
  'Contrato pedagogico mensal com amostra observada separada da participacao historica na nota; preserva fechamentos.';

commit;
