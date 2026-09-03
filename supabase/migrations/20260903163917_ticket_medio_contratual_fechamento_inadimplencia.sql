-- Ticket médio de competência fechada é histórico: usa a fotografia congelada
-- da unidade, que preserva pagas e inadimplentes no fechamento. Não pode ser
-- recomposto pelo último sync vivo, pois uma parcela pode mudar de estado,
-- ser substituída ou ficar source_missing depois do fechamento.

create or replace function public.aplicar_financeiro_ticket_contratual_v2(
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
  v_vivo jsonb;
  v_result jsonb;
  v_por_unidade jsonb;
  v_totais jsonb;
  v_faturamento_total numeric;
  v_pagantes_total numeric;
begin
  v_vivo := public.aplicar_financeiro_ticket_contratual_v1(p_base, p_ano, p_mes);

  -- Mantém a autorização e o comportamento fail-closed da leitura viva.
  if coalesce((v_vivo->>'tem_dados')::boolean, false) is not true
     or jsonb_typeof(v_vivo->'por_unidade') <> 'array' then
    return v_vivo;
  end if;

  with unidades as (
    select
      (value->>'unidade_id')::uuid as unidade_id,
      value as payload_unidade
    from jsonb_array_elements(v_vivo->'por_unidade')
    where nullif(value->>'unidade_id', '') is not null
  ), fechamentos as (
    select distinct on (s.unidade_id)
      s.unidade_id,
      coalesce(
        nullif(s.payload->>'faturamento_previsto', '')::numeric,
        nullif(s.payload->>'mrr', '')::numeric
      ) as faturamento_fechado,
      coalesce(
        nullif(s.payload->>'alunos_pagantes', '')::numeric,
        nullif(s.payload->>'alunos_pagantes_canonicos', '')::numeric
      ) as alunos_pagantes_fechados
    from public.fechamento_mensal_snapshots s
    join unidades u on s.unidade_id = u.unidade_id
    where s.ano = p_ano
      and s.mes = p_mes
      and s.escopo = 'unidade'
      and s.dominio = 'alunos_executivo'
      and s.status = 'fechado'
    order by
      s.unidade_id,
      s.versao desc,
      s.fechado_em desc nulls last,
      s.created_at desc
  ), calculada as (
    select
      u.unidade_id,
      case
        when f.faturamento_fechado > 0
         and f.alunos_pagantes_fechados > 0 then
          u.payload_unidade || jsonb_build_object(
            'faturamento_previsto', round(f.faturamento_fechado, 2),
            'ticket_medio', round(f.faturamento_fechado / f.alunos_pagantes_fechados, 2),
            'ticket_medio_previsto', round(f.faturamento_fechado / f.alunos_pagantes_fechados, 2),
            'alunos_pagantes_canonicos', f.alunos_pagantes_fechados,
            'fonte_denominador_ticket', 'fechamento_mensal_snapshots.alunos_admin/alunos_executivo',
            'fonte_receita_ticket', 'fechamento_mensal_snapshots.alunos_executivo',
            'regra_ticket_medio', 'competencia fechada: receita congelada com pagas e inadimplentes / pagantes fechados'
          )
        else u.payload_unidade
      end as payload_final,
      coalesce(
        f.faturamento_fechado,
        nullif(u.payload_unidade->>'faturamento_previsto', '')::numeric,
        0::numeric
      ) as faturamento_final,
      coalesce(
        f.alunos_pagantes_fechados,
        nullif(u.payload_unidade->>'alunos_pagantes_canonicos', '')::numeric,
        0::numeric
      ) as alunos_pagantes_final
    from unidades u
    left join fechamentos f on f.unidade_id = u.unidade_id
  )
  select
    coalesce(
      jsonb_agg(payload_final order by payload_final->>'unidade_nome'),
      '[]'::jsonb
    ),
    coalesce(sum(faturamento_final), 0),
    coalesce(sum(alunos_pagantes_final), 0)
  into v_por_unidade, v_faturamento_total, v_pagantes_total
  from calculada;

  v_totais := coalesce(v_vivo->'totais', '{}'::jsonb)
    || jsonb_build_object(
      'faturamento_previsto', round(v_faturamento_total, 2),
      'ticket_medio', case
        when v_pagantes_total > 0 then round(v_faturamento_total / v_pagantes_total, 2)
        else 0::numeric
      end,
      'ticket_medio_previsto', case
        when v_pagantes_total > 0 then round(v_faturamento_total / v_pagantes_total, 2)
        else 0::numeric
      end,
      'alunos_pagantes_canonicos', v_pagantes_total,
      'fonte_receita_ticket', 'fechamento_mensal_snapshots.alunos_executivo quando a competencia esta fechada',
      'regra_ticket_medio', 'competencia fechada preserva pagas e inadimplentes pela receita congelada; competencia aberta usa leitura viva contratual'
    );

  v_result := jsonb_set(v_vivo, '{por_unidade}', v_por_unidade, true);
  v_result := jsonb_set(v_result, '{totais}', v_totais, true);
  return v_result;
end;
$function$;

revoke all on function public.aplicar_financeiro_ticket_contratual_v2(jsonb, uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.aplicar_financeiro_ticket_contratual_v2(jsonb, uuid, integer, integer)
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

  return public.aplicar_financeiro_ticket_contratual_v2(
    v_base,
    p_unidade_id,
    p_ano,
    p_mes
  );
end;
$function$;

revoke all on function public.get_financeiro_faturas_emusys(uuid, integer, integer) from public, anon;
grant execute on function public.get_financeiro_faturas_emusys(uuid, integer, integer)
  to authenticated, service_role;

comment on function public.get_financeiro_faturas_emusys(uuid, integer, integer) is
  'Competencia fechada usa receita e pagantes congelados por unidade; competencia aberta usa leitura viva. O ticket nao perde inadimplentes apos o fechamento.';
