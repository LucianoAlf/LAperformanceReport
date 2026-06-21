-- P02P - Experimentais: denominador canonico e taxa bloqueada
--
-- Objetivo:
-- - Evoluir a RPC diagnostica de experimentais sem alterar dados.
-- - Separar denominador operacional, conversoes confirmadas e pendencias.
-- - Manter Taxa Experimental -> Matricula bloqueada como KPI oficial.
--
-- Nao altera tabelas.
-- Nao faz UPDATE/DELETE/INSERT em dados.
-- Nao mexe em status, presenca, leads, alunos, snapshots ou UI.

create or replace function public.get_experimentais_comercial_diagnostico_v2(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodo text default 'mensal'::text,
  p_data date default null::date
)
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
with periodo as (
  select
    case when lower(coalesce(p_periodo, 'mensal')) = 'diario' then 'diario' else 'mensal' end as tipo,
    p_ano as ano,
    p_mes as mes,
    case
      when lower(coalesce(p_periodo, 'mensal')) = 'diario'
      then coalesce(p_data, make_date(p_ano, p_mes, 1))
      else make_date(p_ano, p_mes, 1)
    end as inicio,
    case
      when lower(coalesce(p_periodo, 'mensal')) = 'diario'
      then coalesce(p_data, make_date(p_ano, p_mes, 1)) + interval '1 day'
      else make_date(p_ano, p_mes, 1) + interval '1 month'
    end as fim_exclusivo,
    p_data as data_referencia
),
unidades_alvo as (
  select u.id as unidade_id, u.nome as unidade_nome
  from public.unidades u
  where u.ativo = true
    and (p_unidade_id is null or u.id = p_unidade_id)
),
lead_experimentais_base as (
  select
    le.id,
    le.unidade_id,
    le.status,
    lower(coalesce(le.status, '')) as status_norm,
    le.aluno_id,
    l.aluno_id as lead_aluno_id,
    al_origem.id as aluno_origem_id,
    le.data_experimental,
    (
      l.aluno_id is not null
      or al_origem.id is not null
      or coalesce(l.converteu, false) = true
      or l.data_conversao is not null
      or lower(coalesce(l.status, '')) in ('convertido', 'matriculado')
    ) as sinal_conversao,
    exists (
      select 1
      from public.aluno_presenca ap
      join public.aulas_emusys ae on ae.id = ap.aula_emusys_id
      where ap.aluno_id = le.aluno_id
        and ap.data_aula = le.data_experimental
        and ap.unidade_id = le.unidade_id
        and lower(coalesce(ap.status, '')) = 'presente'
        and lower(coalesce(ae.categoria, '')) = 'experimental'
        and coalesce(ae.cancelada, false) = false
    ) as presenca_individual_confirmada
  from public.lead_experimentais le
  join unidades_alvo ua on ua.unidade_id = le.unidade_id
  cross join periodo p
  left join public.leads l on l.id = le.lead_id
  left join public.alunos al_origem on al_origem.lead_origem_id = le.lead_id
  where le.data_experimental >= p.inicio::date
    and le.data_experimental < p.fim_exclusivo::date
),
lead_experimentais_agg as (
  select
    unidade_id,
    count(*) filter (
      where status_norm not in ('cancelada', 'cancelado', 'experimental_cancelada')
    )::int as experimentais_agendadas_eventos,
    count(*) filter (
      where status_norm in ('cancelada', 'cancelado', 'experimental_cancelada')
    )::int as experimentais_canceladas,
    count(*) filter (
      where status_norm in ('experimental_faltou','faltou','no_show','no-show')
    )::int as no_show_status_operacional,
    count(*) filter (
      where status_norm in ('experimental_realizada','convertido','matriculado')
    )::int as experimentais_realizadas_status_operacional,
    count(*) filter (
      where status_norm in ('experimental_realizada','convertido','matriculado')
        and aluno_id is not null
        and presenca_individual_confirmada
    )::int as experimentais_realizadas_presenca_confirmada,
    count(*) filter (
      where status_norm in ('experimental_realizada','convertido','matriculado')
        and not (aluno_id is not null and presenca_individual_confirmada)
    )::int as experimentais_status_operacional_sem_presenca,
    count(*) filter (where aluno_id is null)::int as experimentais_sem_aluno_id,
    count(*) filter (
      where status_norm in ('experimental_realizada','convertido','matriculado')
        and aluno_id is not null
        and presenca_individual_confirmada
    )::int as conversoes_canonicas_com_vinculo_presenca,
    count(*) filter (
      where status_norm in ('experimental_realizada','convertido','matriculado')
        and aluno_id is null
        and sinal_conversao
    )::int as conversoes_pendentes_vinculo,
    count(*) filter (
      where status_norm in ('experimental_realizada','convertido','matriculado')
        and aluno_id is null
        and not sinal_conversao
    )::int as realizadas_sem_conversao_aparente
  from lead_experimentais_base
  group by unidade_id
),
presencas_emusys_base as (
  select
    ap.id as presenca_id,
    ap.unidade_id,
    ap.aluno_id,
    ap.data_aula,
    exists (
      select 1
      from public.lead_experimentais le
      where le.aluno_id = ap.aluno_id
        and le.data_experimental = ap.data_aula
        and le.unidade_id = ap.unidade_id
    ) as tem_lead_experimental_vinculado
  from public.aluno_presenca ap
  join public.aulas_emusys ae on ae.id = ap.aula_emusys_id
  join unidades_alvo ua on ua.unidade_id = ap.unidade_id
  cross join periodo p
  where ap.data_aula >= p.inicio::date
    and ap.data_aula < p.fim_exclusivo::date
    and lower(coalesce(ap.status, '')) = 'presente'
    and lower(coalesce(ae.categoria, '')) = 'experimental'
    and coalesce(ae.cancelada, false) = false
),
presencas_emusys_agg as (
  select
    unidade_id,
    count(*)::int as presencas_emusys_experimentais_presentes,
    count(*) filter (where tem_lead_experimental_vinculado)::int as presencas_emusys_com_funil,
    count(*) filter (where not tem_lead_experimental_vinculado)::int as presencas_emusys_sem_funil
  from presencas_emusys_base
  group by unidade_id
),
metricas_unidade as (
  select
    ua.unidade_id,
    ua.unidade_nome,
    coalesce(le.experimentais_agendadas_eventos, 0) as experimentais_agendadas_eventos,
    coalesce(le.experimentais_canceladas, 0) as experimentais_canceladas,
    coalesce(le.no_show_status_operacional, 0) as no_show_status_operacional,
    coalesce(le.experimentais_realizadas_status_operacional, 0) as experimentais_realizadas_status_operacional,
    coalesce(le.experimentais_realizadas_presenca_confirmada, 0) as experimentais_realizadas_presenca_confirmada,
    coalesce(le.experimentais_status_operacional_sem_presenca, 0) as experimentais_status_operacional_sem_presenca,
    coalesce(le.experimentais_sem_aluno_id, 0) as experimentais_sem_aluno_id,
    coalesce(le.conversoes_canonicas_com_vinculo_presenca, 0) as conversoes_canonicas_com_vinculo_presenca,
    coalesce(le.conversoes_pendentes_vinculo, 0) as conversoes_pendentes_vinculo,
    coalesce(le.realizadas_sem_conversao_aparente, 0) as realizadas_sem_conversao_aparente,
    case
      when coalesce(le.experimentais_realizadas_status_operacional, 0) > 0
      then round(
        coalesce(le.conversoes_canonicas_com_vinculo_presenca, 0)::numeric
          / le.experimentais_realizadas_status_operacional * 100,
        1
      )
      else null
    end as taxa_exp_mat_minima_canonica,
    case
      when coalesce(le.experimentais_realizadas_status_operacional, 0) > 0
      then round(
        (
          coalesce(le.conversoes_canonicas_com_vinculo_presenca, 0)
          + coalesce(le.conversoes_pendentes_vinculo, 0)
        )::numeric / le.experimentais_realizadas_status_operacional * 100,
        1
      )
      else null
    end as taxa_exp_mat_maxima_apos_revisao,
    'bloqueada_regra_canonica_p02p'::text as taxa_exp_mat_status,
    coalesce(pe.presencas_emusys_experimentais_presentes, 0) as presencas_emusys_experimentais_presentes,
    coalesce(pe.presencas_emusys_com_funil, 0) as presencas_emusys_com_funil,
    coalesce(pe.presencas_emusys_sem_funil, 0) as presencas_emusys_sem_funil
  from unidades_alvo ua
  left join lead_experimentais_agg le on le.unidade_id = ua.unidade_id
  left join presencas_emusys_agg pe on pe.unidade_id = ua.unidade_id
),
totais as (
  select
    sum(experimentais_agendadas_eventos)::int as experimentais_agendadas_eventos,
    sum(experimentais_canceladas)::int as experimentais_canceladas,
    sum(no_show_status_operacional)::int as no_show_status_operacional,
    sum(experimentais_realizadas_status_operacional)::int as experimentais_realizadas_status_operacional,
    sum(experimentais_realizadas_presenca_confirmada)::int as experimentais_realizadas_presenca_confirmada,
    sum(experimentais_status_operacional_sem_presenca)::int as experimentais_status_operacional_sem_presenca,
    sum(experimentais_sem_aluno_id)::int as experimentais_sem_aluno_id,
    sum(conversoes_canonicas_com_vinculo_presenca)::int as conversoes_canonicas_com_vinculo_presenca,
    sum(conversoes_pendentes_vinculo)::int as conversoes_pendentes_vinculo,
    sum(realizadas_sem_conversao_aparente)::int as realizadas_sem_conversao_aparente,
    case
      when sum(experimentais_realizadas_status_operacional) > 0
      then round(
        sum(conversoes_canonicas_com_vinculo_presenca)::numeric
          / sum(experimentais_realizadas_status_operacional) * 100,
        1
      )
      else null
    end as taxa_exp_mat_minima_canonica,
    case
      when sum(experimentais_realizadas_status_operacional) > 0
      then round(
        (
          sum(conversoes_canonicas_com_vinculo_presenca)
          + sum(conversoes_pendentes_vinculo)
        )::numeric / sum(experimentais_realizadas_status_operacional) * 100,
        1
      )
      else null
    end as taxa_exp_mat_maxima_apos_revisao,
    'bloqueada_regra_canonica_p02p'::text as taxa_exp_mat_status,
    sum(presencas_emusys_experimentais_presentes)::int as presencas_emusys_experimentais_presentes,
    sum(presencas_emusys_com_funil)::int as presencas_emusys_com_funil,
    sum(presencas_emusys_sem_funil)::int as presencas_emusys_sem_funil
  from metricas_unidade
)
select jsonb_build_object(
  'periodo', jsonb_build_object(
    'tipo', (select tipo from periodo),
    'ano', (select ano from periodo),
    'mes', (select mes from periodo),
    'inicio', (select inicio::date from periodo),
    'fim_exclusivo', (select fim_exclusivo::date from periodo),
    'data_referencia', (select data_referencia from periodo)
  ),
  'fonte', jsonb_build_object(
    'canonica_realizada', 'lead_experimentais.aluno_id + aluno_presenca + aulas_emusys.categoria=experimental',
    'denominador_exp_mat', 'lead_experimentais.status in (experimental_realizada, convertido, matriculado)',
    'pendencia_exp_mat', 'eventos realizados com sinal de conversao mas sem lead_experimentais.aluno_id',
    'diagnostico_orfa', 'aluno_presenca experimental sem lead_experimentais vinculado',
    'taxa_experimental_matricula_publicavel', false
  ),
  'totais', (select to_jsonb(totais) from totais),
  'por_unidade', (
    select coalesce(jsonb_agg(to_jsonb(mu) order by mu.unidade_nome), '[]'::jsonb)
    from metricas_unidade mu
  )
);
$function$;

revoke all on function public.get_experimentais_comercial_diagnostico_v2(uuid, integer, integer, text, date) from public, anon;
grant execute on function public.get_experimentais_comercial_diagnostico_v2(uuid, integer, integer, text, date) to authenticated, service_role;

comment on function public.get_experimentais_comercial_diagnostico_v2(uuid, integer, integer, text, date)
is 'P02P: diagnostico canonico de experimentais. Separa denominador operacional, conversoes confirmadas, pendencias de vinculo e mantem taxa Exp->Mat bloqueada.';
