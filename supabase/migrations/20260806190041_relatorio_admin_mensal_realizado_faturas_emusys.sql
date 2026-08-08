-- Corrige o "Faturamento Realizado" do relatorio mensal administrativo.
--
-- Antes: o valor vinha de kpis_alunos_canonicos.totais.faturamento_realizado,
-- que e uma DEDUCAO ARITMETICA (mrr - inadimplencia), nao o que entrou no caixa.
-- Medido em julho/2026: R$ 45.006,69 de faturamento inexistente nas 3 unidades
-- (CG +24.990,02 / Barra +11.713,72 / Recreio +8.302,95).
--
-- Agora: le as faturas de parcela efetivamente pagas, que JA estao congeladas
-- no mesmo snapshot gerencial (bloco financeiro_faturas_emusys, alimentado por
-- emusys_faturas_v1). O payload nao e alterado e o hash segue valido -- muda
-- apenas de qual chave a leitura extrai o numero.
--
-- MRR / Faturamento Previsto seguem sendo a BASE CONTRATUAL dos alunos pagantes
-- (regra validada pelo Alf em 2026-08-06): MRR e quanto ha A RECEBER, independente
-- de quem pagou. Por isso nao migram para a fonte de faturas.
--
-- Novo campo faturado_emusys expoe "pago + em aberto" do Emusys, que era o que o
-- rotulo antigo do MRR prometia e nao entregava.
--
-- NOTA: esta migration foi aplicada em producao via MCP em 2026-08-06 e esta
-- registrada em supabase_migrations.schema_migrations com a version deste arquivo.
-- O corpo abaixo foi superseded por 20260807002922 (metas Fideliza+), que recria
-- a mesma funcao acrescentando o bloco de metas. Mantido para historico.

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

  -- Faturas reais do Emusys. Os tres caminhos espelham o coalesce ja usado em
  -- get_relatorio_admin_mensal_rico_base_v1, porque kpis_gestao aparece ora como
  -- objeto, ora como array, dependendo da versao do snapshot.
  v_faturas := coalesce(
    v_gerencial.payload#>'{financeiro_faturas_emusys,totais}',
    v_gerencial.payload#>'{kpis_gestao,0,financeiro_faturas_emusys}',
    v_gerencial.payload#>'{dados_mes_atual,0,financeiro_faturas_emusys}',
    '{}'::jsonb
  );
  if jsonb_typeof(v_faturas) <> 'object'
     or v_faturas = '{}'::jsonb then
    raise exception 'RELATORIO_ADMIN_MENSAL_FONTE_FATURAS_AUSENTE';
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

  -- Aqui esta a correcao: parcelas PAGAS na competencia, nao mrr - inadimplencia.
  -- No bloco de faturas, "mrr_atual" e o total pago e "faturamento_previsto" e
  -- pago + em aberto (nomes herdados da fonte; a semantica vai explicita abaixo).
  v_faturamento_realizado := nullif(v_faturas->>'mrr_atual', '')::numeric;
  v_faturado_emusys := nullif(v_faturas->>'faturamento_previsto', '')::numeric;

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
     or v_faturado_emusys is null
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

  -- Pago nunca pode superar pago + em aberto da mesma fonte.
  if round(v_faturamento_realizado, 2) > round(v_faturado_emusys, 2) then
    raise exception 'RELATORIO_ADMIN_MENSAL_REALIZADO_ACIMA_DO_FATURADO';
  end if;

  if least(
       v_mrr,
       v_ticket,
       v_faturamento_previsto,
       v_faturamento_realizado,
       v_faturado_emusys,
       v_ltv,
       v_permanencia
     ) < 0 then
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
    'semantica_faturado_emusys', 'faturas_de_parcela_pagas_e_em_aberto'
  );

  return jsonb_set(
    v_resultado,
    '{payload,indicadores_financeiros}',
    v_financeiro,
    true
  );
end;
$function$;
