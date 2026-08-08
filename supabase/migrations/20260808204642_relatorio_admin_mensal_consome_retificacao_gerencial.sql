-- A leitura do relatorio mensal administrativo passa a consumir a retificacao
-- do snapshot gerencial, no mesmo desenho que get_relatorio_mensal_canonico_v1
-- ja usa para o comercial: o snapshot permanece imutavel e o payload corrigido
-- e sobreposto na leitura, com os dois hashes validados.
--
-- Sem isso, aplicar_retificacao_relatorio_gerencial_financeiro_v1 gravaria a
-- correcao e ninguem a veria -- o relatorio continuaria publicando o numero
-- congelado.
--
-- Regras de seguranca preservadas:
--   1. o snapshot gerencial continua sendo validado contra o hash registrado em
--      `fontes.relatorio_gerencial.payload_hash` do snapshot admin;
--   2. a retificacao so e aceita se `base_payload_hash` for exatamente esse hash
--      -- retificacao feita sobre outra versao e ignorada, nao aplicada;
--   3. o payload corrigido e re-hasheado e comparado com o hash gravado, entao
--      adulteracao na tabela de retificacoes derruba a leitura em vez de passar.

create or replace function public.get_relatorio_admin_mensal_rico_v1(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_resultado jsonb;
  v_gerencial public.fechamento_mensal_snapshots%rowtype;
  v_gerencial_payload jsonb;
  v_retificacao public.fechamento_mensal_retificacoes%rowtype;
  v_retificacao_id uuid := null;
  v_gerencial_id uuid;
  v_gerencial_hash text;
  v_totais jsonb;
  v_faturas jsonb;
  v_pagantes_relatorio integer;
  v_pagantes_fonte integer;
  v_mrr numeric;
  v_ticket numeric;
  v_faturamento_previsto numeric;
  v_faturamento_realizado numeric;
  v_faturado_emusys numeric;
  v_ltv numeric;
  v_permanencia numeric;
  v_financeiro jsonb;
  v_fideliza public.programa_fideliza_config%rowtype;
  v_metas_fideliza jsonb;
begin
  v_resultado := public.get_relatorio_admin_mensal_rico_base_v3(p_unidade_id, p_ano, p_mes);

  v_gerencial_id := nullif(v_resultado#>>'{payload,fontes,relatorio_gerencial,snapshot_id}', '')::uuid;
  v_gerencial_hash := nullif(v_resultado#>>'{payload,fontes,relatorio_gerencial,payload_hash}', '');

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

  v_gerencial_payload := v_gerencial.payload;

  -- Sobreposicao da retificacao, se houver uma feita sobre ESTA versao.
  select * into v_retificacao
  from public.fechamento_mensal_retificacoes r
  where r.snapshot_id = v_gerencial.id
    and r.base_payload_hash = v_gerencial.payload_hash
  order by r.created_at desc
  limit 1;

  if v_retificacao.id is not null then
    if public.hash_jsonb_canonico(v_retificacao.payload_corrigido) <> v_retificacao.payload_corrigido_hash then
      raise exception 'RELATORIO_ADMIN_MENSAL_RETIFICACAO_CORROMPIDA';
    end if;
    v_gerencial_payload := v_retificacao.payload_corrigido;
    v_retificacao_id := v_retificacao.id;
  end if;

  v_totais := v_gerencial_payload#>'{kpis_alunos_canonicos,totais}';
  if jsonb_typeof(v_totais) <> 'object' then
    raise exception 'RELATORIO_ADMIN_MENSAL_BASE_FINANCEIRA_AUSENTE';
  end if;

  v_faturas := coalesce(
    v_gerencial_payload#>'{financeiro_faturas_emusys,totais}',
    v_gerencial_payload#>'{kpis_gestao,0,financeiro_faturas_emusys}',
    v_gerencial_payload#>'{dados_mes_atual,0,financeiro_faturas_emusys}',
    '{}'::jsonb
  );
  if jsonb_typeof(v_faturas) <> 'object' or v_faturas = '{}'::jsonb then
    raise exception 'RELATORIO_ADMIN_MENSAL_FONTE_FATURAS_AUSENTE';
  end if;

  v_pagantes_relatorio := nullif(v_resultado#>>'{payload,resumo,alunos_pagantes}', '')::integer;
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
  v_faturamento_realizado := nullif(v_faturas->>'mrr_atual', '')::numeric;
  v_faturado_emusys := nullif(v_faturas->>'faturamento_previsto', '')::numeric;
  v_ltv := nullif(v_totais->>'ltv_medio', '')::numeric;
  v_permanencia := coalesce(
    nullif(v_totais->>'tempo_permanencia_medio', '')::numeric,
    nullif(v_totais->>'tempo_permanencia', '')::numeric
  );

  if v_pagantes_relatorio is null or v_pagantes_fonte is null or v_mrr is null
     or v_ticket is null or v_faturamento_previsto is null
     or v_faturamento_realizado is null or v_faturado_emusys is null
     or v_ltv is null or v_permanencia is null then
    raise exception 'RELATORIO_ADMIN_MENSAL_BASE_FINANCEIRA_INCOMPLETA';
  end if;

  if v_pagantes_relatorio <> v_pagantes_fonte then
    raise exception 'RELATORIO_ADMIN_MENSAL_PAGANTES_DIVERGENTES';
  end if;
  if v_pagantes_fonte > 0 and round(v_mrr / v_pagantes_fonte, 2) <> round(v_ticket, 2) then
    raise exception 'RELATORIO_ADMIN_MENSAL_TICKET_DIVERGENTE';
  end if;
  if round(v_faturamento_previsto, 2) <> round(v_mrr, 2) then
    raise exception 'RELATORIO_ADMIN_MENSAL_MRR_DIVERGENTE';
  end if;
  if round(v_faturamento_realizado, 2) > round(v_faturado_emusys, 2) then
    raise exception 'RELATORIO_ADMIN_MENSAL_REALIZADO_ACIMA_DO_FATURADO';
  end if;
  if least(v_mrr, v_ticket, v_faturamento_previsto, v_faturamento_realizado,
           v_faturado_emusys, v_ltv, v_permanencia) < 0 then
    raise exception 'RELATORIO_ADMIN_MENSAL_FINANCEIRO_NEGATIVO';
  end if;

  v_financeiro := jsonb_build_object(
    'ticket_medio', v_ticket,
    'faturamento_previsto', v_faturamento_previsto,
    'faturamento_realizado', v_faturamento_realizado,
    'faturado_emusys', v_faturado_emusys,
    'mrr_atual', v_mrr,
    'ltv_medio', v_ltv,
    'tempo_permanencia', v_permanencia,
    'fonte', 'kpis_alunos_canonicos.totais + financeiro_faturas_emusys',
    'semantica_mrr', 'base_contratual_ativa',
    'semantica_realizado', 'faturas_de_parcela_pagas_na_competencia',
    'semantica_faturado_emusys', 'faturas_de_parcela_pagas_e_em_aberto',
    'retificacao_id', v_retificacao_id
  );

  v_resultado := jsonb_set(v_resultado, '{payload,indicadores_financeiros}', v_financeiro, true);

  -- Inadimplencia tambem vem do gerencial (possivelmente retificado).
  v_resultado := jsonb_set(
    v_resultado,
    '{payload,indicadores_retencao,inadimplentes}',
    coalesce(v_gerencial_payload#>'{kpis_gestao,0,inadimplentes}', '0'::jsonb),
    true
  );
  v_resultado := jsonb_set(
    v_resultado,
    '{payload,indicadores_retencao,inadimplencia}',
    coalesce(v_gerencial_payload#>'{kpis_gestao,0,inadimplencia}', '0'::jsonb),
    true
  );

  select * into v_fideliza from public.programa_fideliza_config c where c.ano = p_ano;
  if v_fideliza.ano is null then
    raise exception 'RELATORIO_ADMIN_MENSAL_FIDELIZA_CONFIG_AUSENTE';
  end if;

  v_metas_fideliza := jsonb_build_object(
    'churn_rate', v_fideliza.meta_churn_maximo,
    'inadimplencia', v_fideliza.meta_inadimplencia_maxima,
    'taxa_renovacao', v_fideliza.meta_renovacao_minima,
    'reajuste_medio', v_fideliza.meta_reajuste_minimo,
    'fonte', 'programa_fideliza_config',
    'ano_config', v_fideliza.ano
  );

  return jsonb_set(v_resultado, '{payload,metas_fideliza}', v_metas_fideliza, true);
end;
$function$;
