-- Restaura a semantica financeira do relatorio administrativo mensal.
-- MRR e ticket pertencem a base contratual ativa fechada; o que foi pago na
-- competencia permanece disponivel separadamente como faturamento realizado.
-- Nenhum snapshot fechado e alterado: a retificacao acontece apenas na leitura.

alter function public.get_relatorio_admin_mensal_rico_v1(uuid, integer, integer)
  rename to get_relatorio_admin_mensal_rico_base_v3;

revoke all on function public.get_relatorio_admin_mensal_rico_base_v3(uuid, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_relatorio_admin_mensal_rico_base_v3(uuid, integer, integer)
  to service_role;

create or replace function public.get_relatorio_admin_mensal_rico_v1(
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
  v_resultado jsonb;
  v_gerencial public.fechamento_mensal_snapshots%rowtype;
  v_gerencial_id uuid;
  v_gerencial_hash text;
  v_totais jsonb;
  v_pagantes_relatorio integer;
  v_pagantes_fonte integer;
  v_mrr numeric;
  v_ticket numeric;
  v_faturamento_previsto numeric;
  v_faturamento_realizado numeric;
  v_ltv numeric;
  v_permanencia numeric;
  v_financeiro jsonb;
begin
  v_resultado := public.get_relatorio_admin_mensal_rico_base_v3(
    p_unidade_id,
    p_ano,
    p_mes
  );

  v_gerencial_id := nullif(
    v_resultado#>>'{payload,fontes,relatorio_gerencial,snapshot_id}',
    ''
  )::uuid;
  v_gerencial_hash := nullif(
    v_resultado#>>'{payload,fontes,relatorio_gerencial,payload_hash}',
    ''
  );

  select * into v_gerencial
  from public.fechamento_mensal_snapshots s
  where s.id = v_gerencial_id
    and s.unidade_id = p_unidade_id
    and s.ano = p_ano
    and s.mes = p_mes
    and s.escopo = 'unidade'
    and s.dominio = 'relatorio_gerencial'
    and s.status = 'fechado';

  if v_gerencial.id is null
     or v_gerencial.payload_hash is null
     or v_gerencial.payload_hash <> v_gerencial_hash
     or public.hash_jsonb_canonico(v_gerencial.payload) <> v_gerencial.payload_hash then
    raise exception 'RELATORIO_ADMIN_MENSAL_FONTE_FINANCEIRA_INVALIDA';
  end if;

  v_totais := v_gerencial.payload#>'{kpis_alunos_canonicos,totais}';
  if jsonb_typeof(v_totais) <> 'object' then
    raise exception 'RELATORIO_ADMIN_MENSAL_BASE_FINANCEIRA_AUSENTE';
  end if;

  v_pagantes_relatorio := nullif(
    v_resultado#>>'{payload,resumo,alunos_pagantes}',
    ''
  )::integer;
  v_pagantes_fonte := coalesce(
    nullif(v_totais->>'alunos_pagantes', '')::integer,
    nullif(v_totais->>'total_alunos_pagantes', '')::integer
  );
  v_mrr := coalesce(
    nullif(v_totais->>'mrr', '')::numeric,
    nullif(v_totais->>'mrr_atual', '')::numeric
  );
  v_ticket := nullif(v_totais->>'ticket_medio', '')::numeric;
  v_faturamento_previsto := nullif(v_totais->>'faturamento_previsto', '')::numeric;
  v_faturamento_realizado := nullif(v_totais->>'faturamento_realizado', '')::numeric;
  v_ltv := nullif(v_totais->>'ltv_medio', '')::numeric;
  v_permanencia := coalesce(
    nullif(v_totais->>'tempo_permanencia_medio', '')::numeric,
    nullif(v_totais->>'tempo_permanencia', '')::numeric
  );

  if v_pagantes_relatorio is null
     or v_pagantes_fonte is null
     or v_mrr is null
     or v_ticket is null
     or v_faturamento_previsto is null
     or v_faturamento_realizado is null
     or v_ltv is null
     or v_permanencia is null then
    raise exception 'RELATORIO_ADMIN_MENSAL_BASE_FINANCEIRA_INCOMPLETA';
  end if;

  if v_pagantes_relatorio <> v_pagantes_fonte then
    raise exception 'RELATORIO_ADMIN_MENSAL_PAGANTES_DIVERGENTES';
  end if;

  if v_pagantes_fonte > 0
     and round(v_mrr / v_pagantes_fonte, 2) <> round(v_ticket, 2) then
    raise exception 'RELATORIO_ADMIN_MENSAL_TICKET_DIVERGENTE';
  end if;

  if round(v_faturamento_previsto, 2) <> round(v_mrr, 2) then
    raise exception 'RELATORIO_ADMIN_MENSAL_MRR_DIVERGENTE';
  end if;

  if least(
       v_mrr,
       v_ticket,
       v_faturamento_previsto,
       v_faturamento_realizado,
       v_ltv,
       v_permanencia
     ) < 0 then
    raise exception 'RELATORIO_ADMIN_MENSAL_FINANCEIRO_NEGATIVO';
  end if;

  v_financeiro := jsonb_build_object(
    'ticket_medio', v_ticket,
    'faturamento_previsto', v_faturamento_previsto,
    'faturamento_realizado', v_faturamento_realizado,
    'mrr_atual', v_mrr,
    'ltv_medio', v_ltv,
    'tempo_permanencia', v_permanencia,
    'fonte', 'kpis_alunos_canonicos.totais',
    'semantica_mrr', 'base_contratual_ativa_paga_e_em_aberto',
    'semantica_realizado', 'valor_pago_na_competencia'
  );

  return jsonb_set(
    v_resultado,
    '{payload,indicadores_financeiros}',
    v_financeiro,
    true
  );
end;
$function$;

revoke all on function public.get_relatorio_admin_mensal_rico_v1(uuid, integer, integer)
  from public, anon;
grant execute on function public.get_relatorio_admin_mensal_rico_v1(uuid, integer, integer)
  to authenticated, service_role;

comment on function public.get_relatorio_admin_mensal_rico_v1(uuid, integer, integer) is
  'Le o mensal administrativo fechado com MRR e ticket da base contratual ativa e faturamento realizado separado, sem alterar snapshots.';
