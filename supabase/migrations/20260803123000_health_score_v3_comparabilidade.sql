begin;

create or replace function public.avaliar_health_score_professor_v3_comparabilidade(
  p_score_observado numeric,
  p_cobertura numeric,
  p_pilares_validos integer,
  p_tem_fidelizacao boolean,
  p_cobertura_minima numeric,
  p_fonte_canonica_disponivel boolean default true
)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $function$
declare
  v_estado text;
  v_motivo text;
  v_comparavel boolean := false;
begin
  if coalesce(p_pilares_validos, 0) = 0 then
    v_estado := 'sem_base_operacional';
    v_motivo := 'sem_pilares_validos';
  elsif not coalesce(p_fonte_canonica_disponivel, false) then
    v_estado := 'em_maturacao';
    v_motivo := 'fonte_em_auditoria';
  elsif p_score_observado is null then
    v_estado := 'em_maturacao';
    v_motivo := 'score_observado_indisponivel';
  elsif p_pilares_validos < 3 then
    v_estado := 'em_maturacao';
    v_motivo := 'pilares_insuficientes';
  elsif coalesce(p_cobertura, 0) < coalesce(p_cobertura_minima, 60) then
    v_estado := 'em_maturacao';
    v_motivo := 'cobertura_insuficiente';
  elsif not coalesce(p_tem_fidelizacao, false) then
    v_estado := 'em_maturacao';
    v_motivo := 'sem_pilar_fidelizacao';
  else
    v_estado := 'comparavel';
    v_motivo := 'criterios_atendidos';
    v_comparavel := true;
  end if;

  return jsonb_build_object(
    'estado', v_estado,
    'motivo', v_motivo,
    'comparavel', v_comparavel,
    'score_comparavel', case when v_comparavel then p_score_observado else null end
  );
end;
$function$;

revoke all on function public.avaliar_health_score_professor_v3_comparabilidade(
  numeric, numeric, integer, boolean, numeric, boolean
) from public, anon, authenticated;
grant execute on function public.avaliar_health_score_professor_v3_comparabilidade(
  numeric, numeric, integer, boolean, numeric, boolean
) to service_role;

alter function public.get_health_score_professor_v3_performance(date, uuid, text)
  rename to get_health_score_professor_v3_performance_base_comparabilidade;

alter function public.get_health_score_professor_v3_snapshot_modal(date, uuid, integer, text)
  rename to get_hs_prof_v3_snapshot_modal_base_comparabilidade;

create function public.get_health_score_professor_v3_performance(
  p_competencia date,
  p_unidade_id uuid,
  p_periodicidade text
)
returns table (
  professor_id integer, unidade_id uuid, escopo text, competencia date,
  trimestre_inicio date, periodicidade text, periodo_inicio date, periodo_fim date,
  ciclo_codigo text, estado_publicacao text, score_exibivel boolean,
  ranking_habilitado boolean, config_versao integer, revisao integer, score numeric,
  cobertura numeric, classificacao text, estado text, snapshot_publicavel boolean,
  publicado boolean, motivo_bloqueio text, regra_versao_snapshot text,
  metrica text, valor_bruto numeric, numerador numeric, denominador numeric,
  nota numeric, peso numeric, peso_disponivel boolean, peso_efetivo numeric,
  contribuicao numeric, meta numeric, amostra integer, estado_base text,
  metrica_publicavel boolean, confianca text, fonte text,
  regra_versao_metrica text, motivo_sem_base text, codigo_evidencia text,
  papel text, detalhes jsonb,
  score_observado numeric, score_comparavel numeric,
  pilares_validos integer, pilares_esperados integer,
  comparabilidade_estado text, comparabilidade_motivo text,
  competencia_referencia date, score_referencia numeric,
  classificacao_referencia text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  perform public.fn_health_score_professor_v3_ator_leitura(p_unidade_id);

  if p_competencia is null or p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'HEALTH_SCORE_V3_PERFORMANCE_INVALIDO: competencia e periodicidade obrigatorias'
      using errcode = '22023';
  end if;

  return query
  with base as materialized (
    select b.*
    from public.get_health_score_professor_v3_performance_base_comparabilidade(
      p_competencia,
      p_unidade_id,
      p_periodicidade
    ) b
  ),
  resumo as (
    select
      b.professor_id,
      max(b.config_versao) as config_versao,
      max(b.score) as score_observado,
      max(b.cobertura) as cobertura,
      count(distinct b.metrica) filter (
        where b.papel = 'nota'
          and coalesce(b.peso_disponivel, false)
          and b.nota is not null
      )::integer as pilares_validos,
      count(distinct b.metrica) filter (
        where b.papel = 'nota' and coalesce(b.peso, 0) > 0
      )::integer as pilares_esperados,
      coalesce(bool_or(
        b.metrica in ('retencao', 'permanencia')
        and coalesce(b.peso_disponivel, false)
        and b.nota is not null
      ), false) as tem_fidelizacao,
      not coalesce(bool_or(
        coalesce(b.codigo_evidencia, '') in (
          'fonte_canonica_indisponivel',
          'segmentacao_incompleta',
          'conversao_em_auditoria',
          'presenca_em_auditoria',
          'dados_em_auditoria'
        )
      ), false) as fonte_canonica_disponivel
    from base b
    group by b.professor_id
  ),
  avaliados as (
    select
      r.*,
      coalesce(c.cobertura_minima, 60) as cobertura_minima,
      public.avaliar_health_score_professor_v3_comparabilidade(
        r.score_observado,
        r.cobertura,
        r.pilares_validos,
        r.tem_fidelizacao,
        coalesce(c.cobertura_minima, 60),
        r.fonte_canonica_disponivel
      ) as avaliacao
    from resumo r
    left join public.health_score_professor_v3_config_versoes c
      on c.versao = r.config_versao
  ),
  historico_candidatos as (
    select
      s.*,
      row_number() over (
        partition by s.professor_id, s.competencia
        order by
          (s.estado_publicacao = 'oficial') desc,
          s.revisao desc,
          s.criado_em desc,
          s.id desc
      ) as rn
    from public.health_score_professor_v3_snapshots s
    where s.competencia < date_trunc('month', p_competencia)::date
      and s.unidade_id is not distinct from p_unidade_id
      and s.periodicidade = p_periodicidade
      and s.estado in ('provisorio', 'em_maturacao', 'fechado')
      and s.invalidado_em is null
  ),
  historico_resumo as (
    select
      s.professor_id,
      s.competencia,
      s.score,
      s.cobertura,
      s.classificacao,
      c.cobertura_minima,
      count(distinct sm.metrica) filter (
        where sm.papel = 'nota'
          and coalesce(sm.peso_disponivel, false)
          and sm.nota is not null
      )::integer as pilares_validos,
      coalesce(bool_or(
        sm.metrica in ('retencao', 'permanencia')
        and coalesce(sm.peso_disponivel, false)
        and sm.nota is not null
      ), false) as tem_fidelizacao,
      not coalesce(bool_or(
        coalesce(sm.codigo_evidencia, '') in (
          'fonte_canonica_indisponivel',
          'segmentacao_incompleta',
          'conversao_em_auditoria',
          'presenca_em_auditoria',
          'dados_em_auditoria'
        )
      ), false) as fonte_canonica_disponivel
    from historico_candidatos s
    join public.health_score_professor_v3_snapshot_metricas sm
      on sm.snapshot_id = s.id
    left join public.health_score_professor_v3_config_versoes c
      on c.id = s.config_id
    where s.rn = 1
    group by
      s.professor_id,
      s.competencia,
      s.score,
      s.cobertura,
      s.classificacao,
      c.cobertura_minima
  ),
  historico_comparavel as (
    select
      h.*,
      row_number() over (
        partition by h.professor_id order by h.competencia desc
      ) as rn
    from historico_resumo h
    where (
      public.avaliar_health_score_professor_v3_comparabilidade(
        h.score,
        h.cobertura,
        h.pilares_validos,
        h.tem_fidelizacao,
        coalesce(h.cobertura_minima, 60),
        h.fonte_canonica_disponivel
      ) ->> 'estado'
    ) = 'comparavel'
  ),
  referencia as (
    select
      h.professor_id,
      h.competencia,
      h.score,
      h.classificacao
    from historico_comparavel h
    where h.rn = 1
  )
  select
    b.professor_id,
    b.unidade_id,
    b.escopo,
    b.competencia,
    b.trimestre_inicio,
    b.periodicidade,
    b.periodo_inicio,
    b.periodo_fim,
    b.ciclo_codigo,
    b.estado_publicacao,
    (a.avaliacao ->> 'estado') = 'comparavel' and b.score is not null as score_exibivel,
    b.ranking_habilitado and (a.avaliacao ->> 'estado') = 'comparavel' as ranking_habilitado,
    b.config_versao,
    b.revisao,
    b.score,
    b.cobertura,
    case when (a.avaliacao ->> 'estado') = 'comparavel' then b.classificacao else null end,
    b.estado,
    b.snapshot_publicavel,
    b.publicado,
    b.motivo_bloqueio,
    b.regra_versao_snapshot,
    b.metrica,
    b.valor_bruto,
    b.numerador,
    b.denominador,
    b.nota,
    b.peso,
    b.peso_disponivel,
    b.peso_efetivo,
    b.contribuicao,
    b.meta,
    b.amostra,
    b.estado_base,
    b.metrica_publicavel,
    b.confianca,
    b.fonte,
    b.regra_versao_metrica,
    b.motivo_sem_base,
    b.codigo_evidencia,
    b.papel,
    coalesce(b.detalhes, '{}'::jsonb) || jsonb_build_object(
      'comparabilidade_estado', a.avaliacao ->> 'estado',
      'comparabilidade_motivo', a.avaliacao ->> 'motivo',
      'pilares_validos', a.pilares_validos,
      'pilares_esperados', a.pilares_esperados,
      'competencia_referencia_comparavel', ref.competencia,
      'score_referencia_comparavel', ref.score
    ),
    b.score as score_observado,
    case when (a.avaliacao ->> 'estado') = 'comparavel' then b.score else null end as score_comparavel,
    a.pilares_validos,
    a.pilares_esperados,
    a.avaliacao ->> 'estado' as comparabilidade_estado,
    a.avaliacao ->> 'motivo' as comparabilidade_motivo,
    ref.competencia as competencia_referencia,
    ref.score as score_referencia,
    ref.classificacao as classificacao_referencia
  from base b
  join avaliados a on a.professor_id = b.professor_id
  left join referencia ref on ref.professor_id = b.professor_id
  order by b.professor_id, case b.metrica
    when 'retencao' then 1
    when 'permanencia' then 2
    when 'conversao' then 3
    when 'media_turma' then 4
    when 'numero_alunos' then 5
    when 'presenca' then 6
    else 99
  end;
end;
$function$;

create function public.get_health_score_professor_v3_snapshot_modal(
  p_competencia date,
  p_unidade_id uuid,
  p_professor_id integer,
  p_periodicidade text
)
returns table (
  professor_id integer, unidade_id uuid, escopo text, competencia date,
  trimestre_inicio date, periodicidade text, periodo_inicio date, periodo_fim date,
  ciclo_codigo text, estado_publicacao text, score_exibivel boolean,
  ranking_habilitado boolean, config_versao integer, revisao integer, score numeric,
  cobertura numeric, classificacao text, estado text, snapshot_publicavel boolean,
  publicado boolean, motivo_bloqueio text, regra_versao_snapshot text,
  metrica text, valor_bruto numeric, numerador numeric, denominador numeric,
  nota numeric, peso numeric, peso_disponivel boolean, peso_efetivo numeric,
  contribuicao numeric, meta numeric, amostra integer, estado_base text,
  metrica_publicavel boolean, confianca text, fonte text,
  regra_versao_metrica text, motivo_sem_base text, codigo_evidencia text,
  papel text, detalhes jsonb,
  score_observado numeric, score_comparavel numeric,
  pilares_validos integer, pilares_esperados integer,
  comparabilidade_estado text, comparabilidade_motivo text,
  competencia_referencia date, score_referencia numeric,
  classificacao_referencia text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  if p_professor_id is null then
    raise exception 'HEALTH_SCORE_V3_MODAL_INVALIDO: professor obrigatorio'
      using errcode = '22023';
  end if;

  return query
  select p.*
  from public.get_health_score_professor_v3_performance(
    p_competencia,
    p_unidade_id,
    p_periodicidade
  ) p
  where p.professor_id = p_professor_id;
end;
$function$;

revoke all on function public.get_health_score_professor_v3_performance_base_comparabilidade(
  date, uuid, text
) from public, anon, authenticated;
grant execute on function public.get_health_score_professor_v3_performance_base_comparabilidade(
  date, uuid, text
) to service_role;

revoke all on function public.get_hs_prof_v3_snapshot_modal_base_comparabilidade(
  date, uuid, integer, text
) from public, anon, authenticated;
grant execute on function public.get_hs_prof_v3_snapshot_modal_base_comparabilidade(
  date, uuid, integer, text
) to service_role;

revoke all on function public.get_health_score_professor_v3_performance(
  date, uuid, text
) from public, anon;
grant execute on function public.get_health_score_professor_v3_performance(
  date, uuid, text
) to authenticated, service_role;

revoke all on function public.get_health_score_professor_v3_snapshot_modal(
  date, uuid, integer, text
) from public, anon;
grant execute on function public.get_health_score_professor_v3_snapshot_modal(
  date, uuid, integer, text
) to authenticated, service_role;

comment on function public.avaliar_health_score_professor_v3_comparabilidade(
  numeric, numeric, integer, boolean, numeric, boolean
) is
  'Regra pura de comparabilidade V3: minimo de tres pilares, cobertura configurada, fidelizacao e fonte canonica auditavel.';

comment on function public.get_health_score_professor_v3_performance(
  date, uuid, text
) is
  'Read model V3 que separa desempenho observado, Health Score comparavel e referencia historica explicita.';

comment on function public.get_health_score_professor_v3_snapshot_modal(
  date, uuid, integer, text
) is
  'Detalhe V3 derivado do mesmo contrato canonico de comparabilidade da leitura em lote.';

create or replace function public.enriquecer_relatorio_coordenacao_v2_comparabilidade(
  p_payload jsonb,
  p_unidade_id uuid,
  p_competencia date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_professores jsonb := '[]'::jsonb;
  v_resumo jsonb := '{}'::jsonb;
  v_ranking jsonb;
begin
  if p_payload is null
     or jsonb_typeof(p_payload->'professores') <> 'array'
     or p_competencia is null then
    raise exception 'RELATORIO_COORDENACAO_COMPARABILIDADE_PAYLOAD_INVALIDO'
      using errcode = '22023';
  end if;

  with performance_raw as materialized (
    select r.*
    from public.get_health_score_professor_v3_performance(
      date_trunc('month', p_competencia)::date,
      p_unidade_id,
      'mensal'
    ) r
  ),
  performance as (
    select
      r.professor_id,
      max(r.score_observado) as score_observado,
      max(r.score_comparavel) as score_comparavel,
      max(r.cobertura) as cobertura,
      max(r.classificacao) as classificacao,
      max(r.estado_publicacao) as estado_publicacao,
      bool_or(r.ranking_habilitado) as ranking_habilitado,
      max(r.pilares_validos) as pilares_validos,
      max(r.pilares_esperados) as pilares_esperados,
      max(r.comparabilidade_estado) as comparabilidade_estado,
      max(r.comparabilidade_motivo) as comparabilidade_motivo,
      max(r.competencia_referencia) as competencia_referencia,
      max(r.score_referencia) as score_referencia,
      max(r.classificacao_referencia) as classificacao_referencia
    from performance_raw r
    group by r.professor_id
  ),
  equipe as (
    select
      item,
      p.*,
      coalesce(p.comparabilidade_estado, 'sem_base_operacional') as estado_resolvido,
      coalesce(p.comparabilidade_motivo, 'fonte_canonica_indisponivel') as motivo_resolvido
    from jsonb_array_elements(p_payload->'professores') item
    left join performance p
      on p.professor_id = nullif(item->>'professor_id', '')::integer
  )
  select coalesce(
    jsonb_agg(
      item || jsonb_build_object(
        'score_observado', score_observado,
        'score_comparavel', score_comparavel,
        'cobertura', cobertura,
        'classificacao', classificacao,
        'score_exibivel', estado_resolvido = 'comparavel' and score_comparavel is not null,
        'ranking_habilitado', coalesce(ranking_habilitado, false)
          and estado_resolvido = 'comparavel'
          and score_comparavel is not null,
        'pilares_validos', coalesce(pilares_validos, 0),
        'pilares_esperados', coalesce(pilares_esperados, 0),
        'comparabilidade_estado', estado_resolvido,
        'comparabilidade_motivo', motivo_resolvido,
        'estado_evidencia', estado_resolvido,
        'competencia_referencia', competencia_referencia,
        'score_referencia', score_referencia,
        'classificacao_referencia', classificacao_referencia
      )
      order by item->>'nome'
    ),
    '[]'::jsonb
  )
  into v_professores
  from equipe;

  with equipe as (
    select value as p
    from jsonb_array_elements(v_professores)
  )
  select jsonb_build_object(
    'total_professores', count(*),
    'com_score', count(*) filter (where p->>'score_observado' is not null),
    'comparaveis', count(*) filter (where p->>'comparabilidade_estado' = 'comparavel'),
    'em_maturacao', count(*) filter (where p->>'comparabilidade_estado' = 'em_maturacao'),
    'sem_base_operacional', count(*) filter (where p->>'comparabilidade_estado' = 'sem_base_operacional'),
    'com_evidencia_pendente', count(*) filter (where p->>'comparabilidade_estado' = 'sem_base_operacional'),
    'saudaveis', count(*) filter (
      where p->>'comparabilidade_estado' = 'comparavel'
        and p->>'classificacao' = 'saudavel'
    ),
    'atencao', count(*) filter (
      where p->>'comparabilidade_estado' = 'comparavel'
        and p->>'classificacao' = 'atencao'
    ),
    'criticos', count(*) filter (
      where p->>'comparabilidade_estado' = 'comparavel'
        and p->>'classificacao' = 'critico'
    ),
    'score_medio_comparavel', round(avg((p->>'score_comparavel')::numeric), 1),
    'score_medio_observado', round(avg((p->>'score_observado')::numeric), 1),
    'score_medio_visivel', round(avg((p->>'score_comparavel')::numeric), 1)
  )
  into v_resumo
  from equipe;

  with equipe as (
    select value as p
    from jsonb_array_elements(v_professores)
    where value->>'comparabilidade_estado' = 'comparavel'
      and coalesce((value->>'ranking_habilitado')::boolean, false)
      and value->>'estado_publicacao' = 'oficial'
      and value->>'score_comparavel' is not null
  )
  select jsonb_agg(
    jsonb_build_object(
      'professor_id', (p->>'professor_id')::integer,
      'nome', p->>'nome',
      'score', (p->>'score_comparavel')::numeric,
      'cobertura', (p->>'cobertura')::numeric,
      'classificacao', p->>'classificacao'
    )
    order by (p->>'score_comparavel')::numeric desc, p->>'nome'
  )
  into v_ranking
  from equipe;

  return p_payload || jsonb_build_object(
    'professores', v_professores,
    'resumo_equipe', coalesce(p_payload->'resumo_equipe', '{}'::jsonb) || v_resumo,
    'ranking_oficial', v_ranking,
    'auditoria', coalesce(p_payload->'auditoria', '{}'::jsonb) || jsonb_build_object(
      'comparabilidade_contrato', 'health-score-professor-v3-comparabilidade-1',
      'comparabilidade_derivada_em_leitura', true
    )
  );
end;
$function$;

revoke all on function public.enriquecer_relatorio_coordenacao_v2_comparabilidade(
  jsonb, uuid, date
) from public, anon, authenticated, service_role;

create or replace function public.get_relatorio_coordenacao_canonico_v2(
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
  v_mes_atual date := date_trunc('month', timezone('America/Sao_Paulo', now()))::date;
  v_escopo text;
  v_snapshot public.fechamento_mensal_snapshots%rowtype;
  v_payload jsonb;
begin
  perform public.fn_health_score_professor_v3_ator_leitura(p_unidade_id);

  if p_ano is null or p_ano < 2020 or p_ano > 2100
     or p_mes is null or p_mes not between 1 and 12 then
    raise exception 'RELATORIO_COORDENACAO_V2_PERIODO_INVALIDO'
      using errcode = '22023';
  end if;

  v_competencia := make_date(p_ano, p_mes, 1);
  if v_competencia >= v_mes_atual then
    v_payload := public.montar_relatorio_coordenacao_payload_v2(p_unidade_id, p_ano, p_mes);
    return public.enriquecer_relatorio_coordenacao_v2_comparabilidade(
      v_payload,
      p_unidade_id,
      v_competencia
    );
  end if;

  v_escopo := case when p_unidade_id is null then 'consolidado' else 'unidade' end;
  select * into v_snapshot
  from public.fechamento_mensal_snapshots s
  where s.ano = p_ano
    and s.mes = p_mes
    and s.escopo = v_escopo
    and s.unidade_id is not distinct from p_unidade_id
    and s.dominio = 'relatorio_coordenacao'
    and s.status = 'fechado'
    and s.fonte = 'montar_relatorio_coordenacao_payload_v2'
    and s.payload->>'schema_version' = '2'
  order by s.versao desc
  limit 1;

  if v_snapshot.id is null then
    raise exception 'RELATORIO_COORDENACAO_V2_FECHADO_INDISPONIVEL';
  end if;
  if public.hash_jsonb_canonico(v_snapshot.payload) <> v_snapshot.payload_hash then
    raise exception 'RELATORIO_COORDENACAO_V2_HASH_DIVERGENTE';
  end if;

  v_payload := v_snapshot.payload || jsonb_build_object(
    'auditoria', coalesce(v_snapshot.payload->'auditoria', '{}'::jsonb) || jsonb_build_object(
      'imutavel', true,
      'snapshot_id', v_snapshot.id,
      'payload_hash', v_snapshot.payload_hash,
      'versao', v_snapshot.versao,
      'status', v_snapshot.status,
      'fechado_em', v_snapshot.fechado_em
    )
  );

  return public.enriquecer_relatorio_coordenacao_v2_comparabilidade(
    v_payload,
    p_unidade_id,
    v_competencia
  );
end;
$function$;

revoke all on function public.get_relatorio_coordenacao_canonico_v2(uuid, integer, integer)
  from public, anon;
grant execute on function public.get_relatorio_coordenacao_canonico_v2(uuid, integer, integer)
  to authenticated, service_role;

comment on function public.enriquecer_relatorio_coordenacao_v2_comparabilidade(
  jsonb, uuid, date
) is
  'Acrescenta comparabilidade V3 ao contrato da Coordenacao sem reescrever snapshots fechados.';

comment on function public.get_relatorio_coordenacao_canonico_v2(uuid, integer, integer) is
  'Leitura unica dos cinco relatorios com snapshot verificado e comparabilidade V3 derivada pelo servidor.';

commit;
