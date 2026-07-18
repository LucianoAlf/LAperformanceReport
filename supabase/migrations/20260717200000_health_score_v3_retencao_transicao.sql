-- Health Score Professor V3 - regra transitória de retenção.
-- Decisão de negócio confirmada pelo Alf em 17/07/2026:
--   * encerramentos até 02/08/2026 penalizam independentemente do motivo,
--     porque a classificação histórica de motivos não possui cobertura integral;
--   * encerramentos a partir de 03/08/2026 só penalizam quando o motivo
--     atribuível ao professor estiver confirmado.
-- A regra é aplicada por evento e funciona inclusive no trimestre jul-set/2026.

create or replace function public.get_professor_retencao_v3_sombra(
  p_competencia date,
  p_unidade_id uuid default null
)
returns table (
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
language sql
stable
security definer
set search_path = public, pg_temp
as $$
with params as (
  select
    date_trunc('month', p_competencia)::date as competencia,
    date_trunc('quarter', p_competencia)::date as inicio_trimestre,
    (date_trunc('quarter', p_competencia) + interval '3 months - 1 day')::date
      as fim_trimestre,
    date '2026-08-03' as data_corte
  where p_competencia is not null
), unidades_permitidas as (
  select up.unidade_id
  from public.fn_health_score_v3_unidades_permitidas_sombra(p_unidade_id) up
), periodos as (
  select pe.*
  from public.vw_professor_periodos_efetivos_v3_sombra pe
  join unidades_permitidas up on up.unidade_id = pe.unidade_id
  cross join params p
  where pe.professor_id is not null
    and pe.status_periodo <> 'invalidado'
    and (pe.data_inicio at time zone 'America/Sao_Paulo')::date <= p.fim_trimestre
    and (
      pe.data_fim is null
      or (pe.data_fim at time zone 'America/Sao_Paulo')::date >= p.inicio_trimestre
    )
), professores_alvo as (
  select distinct
    pe.professor_id,
    case when p_unidade_id is null then null::uuid else pe.unidade_id end as unidade_saida
  from periodos pe
), estatisticas as (
  select
    pe.professor_id,
    case when p_unidade_id is null then null::uuid else pe.unidade_id end as unidade_saida,
    count(distinct pe.periodo_chave) filter (
      where pe.publicavel = true
    )::integer as vinculos_expostos,
    count(distinct pe.periodo_chave) filter (
      where pe.publicavel = false
    )::integer as vinculos_nao_publicaveis,
    count(distinct pe.periodo_chave) filter (
      where pe.publicavel = true
        and pe.status_periodo = 'encerrado'
        and (pe.data_fim at time zone 'America/Sao_Paulo')::date
          between p.inicio_trimestre and p.fim_trimestre
        and (pe.data_fim at time zone 'America/Sao_Paulo')::date < date '2026-08-03'
    )::integer as encerramentos_pre_corte,
    count(distinct pe.periodo_chave) filter (
      where pe.publicavel = true
        and pe.status_periodo = 'encerrado'
        and (pe.data_fim at time zone 'America/Sao_Paulo')::date
          between p.inicio_trimestre and p.fim_trimestre
        and (pe.data_fim at time zone 'America/Sao_Paulo')::date >= date '2026-08-03'
        and pe.atribuicao_confirmada is true
        and pe.conta_retencao_professor is true
        and ms.conta_score_professor is true
    )::integer as encerramentos_pos_corte_atribuiveis,
    count(distinct pe.periodo_chave) filter (
      where pe.publicavel = true
        and pe.status_periodo = 'encerrado'
        and (pe.data_fim at time zone 'America/Sao_Paulo')::date
          between p.inicio_trimestre and p.fim_trimestre
        and (pe.data_fim at time zone 'America/Sao_Paulo')::date >= date '2026-08-03'
        and (
          pe.atribuicao_confirmada is not true
          or pe.conta_retencao_professor is null
          or pe.motivo_saida_id is null
          or ms.conta_score_professor is null
        )
    )::integer as encerramentos_pos_corte_pendentes
  from periodos pe
  cross join params p
  left join public.motivos_saida ms on ms.id = pe.motivo_saida_id
  group by
    pe.professor_id,
    case when p_unidade_id is null then null::uuid else pe.unidade_id end
), calculos as (
  select
    e.*,
    coalesce(e.encerramentos_pre_corte, 0)
      + coalesce(e.encerramentos_pos_corte_atribuiveis, 0)
      as encerramentos_penalizadores
  from estatisticas e
)
select
  pa.professor_id,
  pr.nome as professor_nome,
  pa.unidade_saida as unidade_id,
  p.competencia,
  case
    when e.vinculos_expostos > 0 then
      round(
        100 * (
          1 - e.encerramentos_penalizadores::numeric / e.vinculos_expostos::numeric
        ),
        2
      )
    else null
  end as valor_bruto,
  greatest(
    coalesce(e.vinculos_expostos, 0) - coalesce(e.encerramentos_penalizadores, 0),
    0
  )::numeric as numerador,
  coalesce(e.vinculos_expostos, 0)::numeric as denominador,
  coalesce(e.vinculos_expostos, 0) as amostra,
  case
    when coalesce(e.vinculos_expostos, 0) = 0 then 'sem_base'
    when e.vinculos_expostos < 10 then 'sem_base_amostra'
    when e.encerramentos_pos_corte_pendentes > 0
      or e.vinculos_nao_publicaveis > 0 then 'revisar'
    else 'ok'
  end as estado_base,
  (
    e.vinculos_expostos >= 10
    and e.encerramentos_pos_corte_pendentes = 0
    and e.vinculos_nao_publicaveis = 0
  ) as publicavel,
  case
    when coalesce(e.vinculos_expostos, 0) = 0 then 'sem_base'
    when e.encerramentos_pos_corte_pendentes > 0
      or e.vinculos_nao_publicaveis > 0 then 'media'
    when e.vinculos_expostos < 10 then 'baixa_amostra'
    else 'alta'
  end as confianca,
  'vw_professor_periodos_efetivos_v3_sombra+politica_retencao_transitoria'::text
    as fonte,
  'health-score-professor-v3-retencao-2'::text as regra_versao,
  case
    when coalesce(e.vinculos_expostos, 0) = 0 then
      'nenhum vinculo publicavel exposto no trimestre'
    when e.vinculos_expostos < 10 then
      'base minima de 10 vinculos expostos nao atingida'
    when e.encerramentos_pos_corte_pendentes > 0 then
      'ha encerramentos desde 03/08/2026 aguardando classificacao do motivo'
    when e.vinculos_nao_publicaveis > 0 then
      'ha vinculos historicos em revisao'
    else null
  end as motivo_sem_base,
  jsonb_build_object(
    'inicio_trimestre', p.inicio_trimestre,
    'fim_trimestre', p.fim_trimestre,
    'data_corte', date '2026-08-03',
    'modo_pre_corte', 'todos_encerramentos',
    'modo_pos_corte', 'somente_motivo_atribuivel_confirmado',
    'vinculos_expostos', coalesce(e.vinculos_expostos, 0),
    'encerramentos_pre_corte', coalesce(e.encerramentos_pre_corte, 0),
    'encerramentos_pos_corte_atribuiveis',
      coalesce(e.encerramentos_pos_corte_atribuiveis, 0),
    'encerramentos_pos_corte_pendentes',
      coalesce(e.encerramentos_pos_corte_pendentes, 0),
    'encerramentos_penalizadores', coalesce(e.encerramentos_penalizadores, 0),
    'vinculos_nao_publicaveis', coalesce(e.vinculos_nao_publicaveis, 0),
    'motivos_historicos_completos', false
  ) as detalhes
from professores_alvo pa
join public.professores pr on pr.id = pa.professor_id
cross join params p
left join calculos e
  on e.professor_id = pa.professor_id
 and e.unidade_saida is not distinct from pa.unidade_saida
order by pr.nome, pa.unidade_saida;
$$;

revoke all on function public.get_professor_retencao_v3_sombra(date, uuid)
  from public, anon;
grant execute on function public.get_professor_retencao_v3_sombra(date, uuid)
  to authenticated, service_role;

comment on function public.get_professor_retencao_v3_sombra(date, uuid) is
  'V3 sombra retencao-2: ate 02/08/2026 todo encerramento penaliza; desde 03/08/2026 somente motivo atribuivel confirmado penaliza.';
