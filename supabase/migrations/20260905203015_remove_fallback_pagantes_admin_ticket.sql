-- Remove o ultimo fallback que confundia o KPI administrativo de pagantes
-- com o denominador financeiro do ticket medio.
--
-- Esta migration nao altera snapshots nem dados persistidos. Ela troca apenas
-- a composicao de leitura do relatorio de faturas:
--   * competencia fechada: exige ticket_denominador_pagantes explicito;
--   * competencia sem fechamento: usa a base financeira viva canonica;
--   * fonte incompleta: publica ticket indisponivel, sem estimar por ativos,
--     pagantes administrativos ou cobertura incidental de faturas.

begin;

create or replace function public.aplicar_financeiro_ticket_contratual_v4(
  p_base jsonb,
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
  v_result jsonb := coalesce(p_base, '{}'::jsonb);
  v_por_unidade jsonb := '[]'::jsonb;
  v_totais jsonb := '{}'::jsonb;
  v_faturamento_total numeric;
  v_ticket_denominador_total numeric;
  v_qtd_unidades integer := 0;
  v_qtd_unidades_validas integer := 0;
begin
  if coalesce((v_result->>'tem_dados')::boolean, false) is not true
     or jsonb_typeof(v_result->'por_unidade') <> 'array' then
    return v_result;
  end if;

  with unidades as (
    select
      (item->>'unidade_id')::uuid as unidade_id,
      item as payload_unidade
    from jsonb_array_elements(v_result->'por_unidade') item
    where nullif(item->>'unidade_id', '') is not null
  ), fechamentos as (
    select distinct on (s.unidade_id)
      s.unidade_id,
      coalesce(
        nullif(s.payload#>>'{financeiro_ticket_contratual,ticket_denominador_pagantes}', '')::numeric,
        nullif(s.payload->>'ticket_denominador_pagantes', '')::numeric
      ) as ticket_denominador_pagantes,
      coalesce(
        nullif(s.payload#>>'{financeiro_ticket_contratual,mrr_contratual}', '')::numeric,
        nullif(s.payload->>'mrr_contratual', '')::numeric,
        nullif(s.payload->>'faturamento_previsto', '')::numeric,
        nullif(s.payload->>'mrr', '')::numeric
      ) as mrr_contratual
    from public.fechamento_mensal_snapshots s
    join unidades u on u.unidade_id = s.unidade_id
    where s.ano = p_ano
      and s.mes = p_mes
      and s.escopo = 'unidade'
      and s.dominio = 'alunos_executivo'
      and s.status in ('fechado', 'retificado')
    order by
      s.unidade_id,
      s.versao desc,
      s.fechado_em desc nulls last,
      s.created_at desc
  ), financeiro_vivo as (
    select fin.*
    from public.get_kpis_alunos_financeiro_vivo_canonico(
      p_unidade_id,
      p_ano,
      p_mes
    ) fin
  ), resolvida as (
    select
      u.unidade_id,
      u.payload_unidade,
      case
        when f.unidade_id is not null then f.ticket_denominador_pagantes
        else fv.alunos_pagantes::numeric
      end as ticket_denominador_pagantes,
      case
        when f.unidade_id is not null then f.mrr_contratual
        else fv.mrr
      end as mrr_contratual,
      case
        when f.unidade_id is not null
         and coalesce(f.ticket_denominador_pagantes, 0) > 0
         and f.mrr_contratual is not null
          then true
        when f.unidade_id is null
         and coalesce(fv.alunos_pagantes, 0) > 0
         and fv.mrr is not null
          then true
        else false
      end as fonte_valida,
      case
        when f.unidade_id is not null
         and coalesce(f.ticket_denominador_pagantes, 0) > 0
         and f.mrr_contratual is not null
          then 'fechamento_mensal_snapshots.alunos_executivo.ticket_denominador_pagantes'
        when f.unidade_id is not null
          then 'indisponivel_sem_denominador_financeiro_explicito'
        when coalesce(fv.alunos_pagantes, 0) > 0 and fv.mrr is not null
          then 'get_kpis_alunos_financeiro_vivo_canonico.alunos_pagantes'
        else 'indisponivel_sem_base_financeira_viva'
      end as fonte_denominador,
      case
        when f.unidade_id is not null and f.mrr_contratual is not null
          then 'fechamento_mensal_snapshots.alunos_executivo.mrr_contratual'
        when f.unidade_id is null and fv.mrr is not null
          then 'get_kpis_alunos_financeiro_vivo_canonico.mrr'
        else 'indisponivel_sem_receita_financeira'
      end as fonte_receita
    from unidades u
    left join fechamentos f on f.unidade_id = u.unidade_id
    left join financeiro_vivo fv on fv.unidade_id = u.unidade_id
  ), finalizada as (
    select
      unidade_id,
      fonte_valida,
      case when fonte_valida then mrr_contratual else null end as faturamento_valido,
      case when fonte_valida then ticket_denominador_pagantes else null end as denominador_valido,
      payload_unidade || jsonb_build_object(
        'ticket_medio_realizado', nullif(payload_unidade->>'ticket_medio', '')::numeric,
        'faturamento_previsto', case
          when mrr_contratual is not null then round(mrr_contratual, 2)
          else null
        end,
        'ticket_medio', case
          when fonte_valida then round(mrr_contratual / ticket_denominador_pagantes, 2)
          else null
        end,
        'ticket_medio_previsto', case
          when fonte_valida then round(mrr_contratual / ticket_denominador_pagantes, 2)
          else null
        end,
        'ticket_denominador_pagantes', case
          when fonte_valida then ticket_denominador_pagantes
          else null
        end,
        'alunos_pagantes_canonicos', case
          when fonte_valida then ticket_denominador_pagantes
          else null
        end,
        'fonte_denominador_ticket', fonte_denominador,
        'fonte_receita_ticket', fonte_receita,
        'regra_ticket_medio',
          'receita contratual com pagas e inadimplentes / denominador financeiro explicito; nunca usa pagantes administrativos'
      ) as payload_final
    from resolvida
  )
  select
    coalesce(
      jsonb_agg(payload_final order by payload_final->>'unidade_nome'),
      '[]'::jsonb
    ),
    count(*)::integer,
    count(*) filter (where fonte_valida)::integer,
    sum(faturamento_valido),
    sum(denominador_valido)
  into
    v_por_unidade,
    v_qtd_unidades,
    v_qtd_unidades_validas,
    v_faturamento_total,
    v_ticket_denominador_total
  from finalizada;

  v_totais := coalesce(v_result->'totais', '{}'::jsonb)
    || jsonb_build_object(
      'faturamento_previsto', case
        when v_qtd_unidades > 0 and v_qtd_unidades_validas = v_qtd_unidades
          then round(v_faturamento_total, 2)
        else null
      end,
      'ticket_medio', case
        when v_qtd_unidades > 0
         and v_qtd_unidades_validas = v_qtd_unidades
         and v_ticket_denominador_total > 0
          then round(v_faturamento_total / v_ticket_denominador_total, 2)
        else null
      end,
      'ticket_medio_previsto', case
        when v_qtd_unidades > 0
         and v_qtd_unidades_validas = v_qtd_unidades
         and v_ticket_denominador_total > 0
          then round(v_faturamento_total / v_ticket_denominador_total, 2)
        else null
      end,
      'ticket_denominador_pagantes', case
        when v_qtd_unidades > 0 and v_qtd_unidades_validas = v_qtd_unidades
          then v_ticket_denominador_total
        else null
      end,
      'alunos_pagantes_canonicos', case
        when v_qtd_unidades > 0 and v_qtd_unidades_validas = v_qtd_unidades
          then v_ticket_denominador_total
        else null
      end,
      'fonte_denominador_ticket', case
        when v_qtd_unidades > 0 and v_qtd_unidades_validas = v_qtd_unidades
          then 'fontes_financeiras_explicitas_por_unidade'
        else 'indisponivel_unidade_sem_denominador_financeiro'
      end,
      'fonte_receita_ticket', case
        when v_qtd_unidades > 0 and v_qtd_unidades_validas = v_qtd_unidades
          then 'fontes_financeiras_explicitas_por_unidade'
        else 'indisponivel_unidade_sem_receita_financeira'
      end,
      'regra_ticket_medio',
        'todas as unidades precisam de receita e denominador financeiros; total falha fechado se uma fonte estiver ausente'
    );

  v_result := jsonb_set(v_result, '{por_unidade}', v_por_unidade, true);
  v_result := jsonb_set(v_result, '{totais}', v_totais, true);
  return v_result;
end;
$function$;

revoke all on function public.aplicar_financeiro_ticket_contratual_v4(jsonb, uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.aplicar_financeiro_ticket_contratual_v4(jsonb, uuid, integer, integer)
  to service_role;

create or replace function public.get_financeiro_faturas_emusys(
  p_unidade_id uuid default null::uuid,
  p_ano integer default (extract(year from (now() at time zone 'America/Sao_Paulo')))::integer,
  p_mes integer default (extract(month from (now() at time zone 'America/Sao_Paulo')))::integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_base jsonb;
begin
  v_base := public.get_financeiro_faturas_emusys_base_ticket_contratual_v1(
    p_unidade_id,
    p_ano,
    p_mes
  );

  return public.aplicar_financeiro_ticket_contratual_v4(
    v_base,
    p_unidade_id,
    p_ano,
    p_mes
  );
end;
$function$;

revoke all on function public.get_financeiro_faturas_emusys(uuid, integer, integer)
  from public, anon;
grant execute on function public.get_financeiro_faturas_emusys(uuid, integer, integer)
  to authenticated, service_role;

comment on function public.get_financeiro_faturas_emusys(uuid, integer, integer) is
  'Ticket usa somente denominador financeiro explicito: snapshot fechado ou base financeira viva canonica. Nunca usa alunos ativos, pagantes administrativos nem cobertura incidental de faturas.';

commit;
