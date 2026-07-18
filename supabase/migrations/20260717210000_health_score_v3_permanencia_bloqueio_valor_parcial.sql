-- Health Score Professor V3 - bloqueio de valor parcial de permanencia.
-- Historico incompleto continua auditavel em detalhes, mas nunca sai como KPI bruto.

create or replace function public.get_professor_permanencia_v3_sombra(
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
    (date_trunc('month', p_competencia) + interval '1 month')::date
      as fim_competencia_exclusivo
  where p_competencia is not null
), unidades_permitidas as (
  select up.unidade_id
  from public.fn_health_score_v3_unidades_permitidas_sombra(p_unidade_id) up
), periodos_unidade as (
  select pe.*
  from public.vw_professor_periodos_efetivos_v3_sombra pe
  join unidades_permitidas up on up.unidade_id = pe.unidade_id
  where pe.professor_id is not null
    and pe.status_periodo <> 'invalidado'
), professores_alvo as (
  select distinct
    pe.professor_id,
    case when p_unidade_id is null then null::uuid else pe.unidade_id end as unidade_saida
  from periodos_unidade pe
  cross join params p
  where (pe.data_inicio at time zone 'America/Sao_Paulo')::date
    < p.fim_competencia_exclusivo
), completude as (
  select
    pe.professor_id,
    case when p_unidade_id is null then null::uuid else pe.unidade_id end as unidade_saida,
    bool_or(pe.inicio_incompleto) as historico_incompleto,
    min(pe.data_inicio) as primeira_evidencia,
    max(coalesce(pe.data_fim, pe.data_inicio)) as ultima_evidencia
  from periodos_unidade pe
  cross join params p
  where (pe.data_inicio at time zone 'America/Sao_Paulo')::date
    < p.fim_competencia_exclusivo
  group by
    pe.professor_id,
    case when p_unidade_id is null then null::uuid else pe.unidade_id end
), periodos_elegiveis as (
  select pe.*
  from periodos_unidade pe
  cross join params p
  where pe.status_periodo = 'encerrado'
    and pe.elegivel_permanencia = true
    and pe.publicavel = true
    and pe.confianca in ('alta', 'revisado_aprovado')
    and (pe.data_fim at time zone 'America/Sao_Paulo')::date
      < p.fim_competencia_exclusivo
), estatisticas as (
  select
    pe.professor_id,
    case when p_unidade_id is null then null::uuid else pe.unidade_id end as unidade_saida,
    sum(pe.duracao_meses) as soma_meses,
    avg(pe.duracao_meses) as media_meses,
    percentile_cont(0.5) within group (order by pe.duracao_meses)
      as mediana_meses,
    count(*)::integer as amostra
  from periodos_elegiveis pe
  group by
    pe.professor_id,
    case when p_unidade_id is null then null::uuid else pe.unidade_id end
), exclusoes as (
  select
    pe.professor_id,
    case when p_unidade_id is null then null::uuid else pe.unidade_id end as unidade_saida,
    count(*) filter (
      where pe.status_periodo = 'encerrado' and not pe.elegivel_permanencia
    )::integer as abaixo_quatro_meses,
    count(*) filter (
      where pe.status_periodo = 'encerrado'
        and pe.elegivel_permanencia
        and not pe.publicavel
    )::integer as elegiveis_nao_publicaveis,
    count(*) filter (where pe.status_periodo = 'ativo')::integer as ainda_ativos
  from periodos_unidade pe
  cross join params p
  where (pe.data_inicio at time zone 'America/Sao_Paulo')::date
    < p.fim_competencia_exclusivo
  group by
    pe.professor_id,
    case when p_unidade_id is null then null::uuid else pe.unidade_id end
)
select
  pa.professor_id,
  pr.nome as professor_nome,
  pa.unidade_saida as unidade_id,
  p.competencia,
  case
    when coalesce(c.historico_incompleto, false) then null
    when coalesce(e.amostra, 0) > 0 then round(e.media_meses, 2)
    else null
  end as valor_bruto,
  coalesce(e.soma_meses, 0)::numeric as numerador,
  coalesce(e.amostra, 0)::numeric as denominador,
  coalesce(e.amostra, 0) as amostra,
  case
    when coalesce(e.amostra, 0) = 0 then 'sem_base'
    when coalesce(c.historico_incompleto, false) then 'historico_incompleto'
    when e.amostra < 3 then 'sem_base_amostra'
    else 'ok'
  end as estado_base,
  (
    e.amostra >= 3
    and not coalesce(c.historico_incompleto, false)
  ) as publicavel,
  case
    when coalesce(e.amostra, 0) = 0 then 'sem_base'
    when coalesce(c.historico_incompleto, false) then 'parcial'
    when e.amostra < 3 then 'baixa_amostra'
    else 'alta'
  end as confianca,
  'vw_professor_periodos_efetivos_v3_sombra'::text as fonte,
  'health-score-professor-v3-permanencia-3'::text as regra_versao,
  case
    when coalesce(e.amostra, 0) = 0
      then 'nenhum vinculo encerrado elegivel e publicavel no historico observado'
    when coalesce(c.historico_incompleto, false)
      then 'a origem nao cobre o inicio integral da historia deste professor'
    when e.amostra < 3
      then 'pontuacao exige ao menos 3 vinculos encerrados elegiveis'
    else null
  end as motivo_sem_base,
  jsonb_build_object(
    'escopo_temporal', 'historico_acumulado_ate_competencia',
    'fim_competencia_exclusivo', p.fim_competencia_exclusivo,
    'media_parcial_diagnostica', case
      when coalesce(e.amostra, 0) > 0 then round(e.media_meses, 2)
      else null
    end,
    'mediana_parcial_diagnostica', case
      when coalesce(e.amostra, 0) > 0 then round(e.mediana_meses::numeric, 2)
      else null
    end,
    'amostra_parcial_encerrada', coalesce(e.amostra, 0),
    'corte_minimo_meses', 4,
    'historico_incompleto', coalesce(c.historico_incompleto, false),
    'primeira_evidencia', c.primeira_evidencia,
    'ultima_evidencia', c.ultima_evidencia,
    'excluidos_abaixo_quatro_meses', coalesce(x.abaixo_quatro_meses, 0),
    'elegiveis_nao_publicaveis', coalesce(x.elegiveis_nao_publicaveis, 0),
    'vinculos_ainda_ativos', coalesce(x.ainda_ativos, 0),
    'transparencia_exclusao', 'vinculos menores que 4 meses permanecem no historico, fora da media',
    'aviso_diagnostico', 'valor parcial nao pode ser exibido como KPI oficial'
  ) as detalhes
from professores_alvo pa
join public.professores pr on pr.id = pa.professor_id
cross join params p
left join estatisticas e
  on e.professor_id = pa.professor_id
 and e.unidade_saida is not distinct from pa.unidade_saida
left join completude c
  on c.professor_id = pa.professor_id
 and c.unidade_saida is not distinct from pa.unidade_saida
left join exclusoes x
  on x.professor_id = pa.professor_id
 and x.unidade_saida is not distinct from pa.unidade_saida
order by pr.nome, pa.unidade_saida;
$$;

comment on function public.get_professor_permanencia_v3_sombra(date, uuid) is
  'V3 sombra: permanencia acumulada; historico incompleto devolve KPI nulo e preserva somente diagnostico parcial auditavel.';

revoke all on function public.get_professor_permanencia_v3_sombra(date, uuid)
  from public, anon, authenticated;
grant execute on function public.get_professor_permanencia_v3_sombra(date, uuid)
  to service_role;
