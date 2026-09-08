-- Recupera o relatorio mensal administrativo de agosto/2026 sem confundir
-- pagantes administrativos com o denominador financeiro do ticket.
--
-- Raizes medidas em producao em 08/09/2026:
--   1. Barra e Campo Grande ja tinham o denominador financeiro explicito no
--      snapshot alunos_executivo, mas o leitor rico olhava apenas o snapshot
--      gerencial antigo, anterior ao backfill global.
--   2. A retificacao do Recreio subtraiu oito movimentos do agregado de churn,
--      embora somente sete existissem quando o snapshot gerencial foi capturado.
--      Caetano Leao Barradas foi materializado depois da captura. O detalhe e o
--      relatorio de coordenacao preservaram a verdade: 23 interrupcoes
--      academicas + 6 nao renovacoes = 29 saidas, churn 29 / 334 = 8,68%.
--
-- Politica:
--   * snapshots fechados nao sao atualizados nem apagados;
--   * novas versoes carregam a retificacao e sua auditoria;
--   * o fallback financeiro usa SOMENTE ticket_denominador_pagantes explicito
--     de alunos_executivo; nunca alunos_pagantes administrativos;
--   * qualquer precondicao divergente aborta a transacao inteira.

begin;

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
  v_executivo public.fechamento_mensal_snapshots%rowtype;
  v_retificacao public.fechamento_mensal_retificacoes%rowtype;
  v_retificacao_id uuid := null;
  v_gerencial_id uuid;
  v_gerencial_hash text;
  v_totais jsonb;
  v_faturas jsonb;
  v_pagantes_relatorio integer;
  v_pagantes_fonte integer;
  v_ticket_denominador_pagantes integer;
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

  v_gerencial_payload := v_gerencial.payload;

  select * into v_retificacao
  from public.fechamento_mensal_retificacoes r
  where r.snapshot_id = v_gerencial.id
    and r.base_payload_hash = v_gerencial.payload_hash
  order by r.created_at desc
  limit 1;

  if v_retificacao.id is not null then
    if public.hash_jsonb_canonico(v_retificacao.payload_corrigido)
       <> v_retificacao.payload_corrigido_hash then
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

  v_pagantes_relatorio := nullif(
    v_resultado#>>'{payload,resumo,alunos_pagantes}',
    ''
  )::integer;
  v_pagantes_fonte := coalesce(
    nullif(v_totais->>'alunos_pagantes', '')::integer,
    nullif(v_totais->>'total_alunos_pagantes', '')::integer
  );
  v_ticket_denominador_pagantes := coalesce(
    nullif(
      v_gerencial_payload#>>'{financeiro_ticket_contratual,ticket_denominador_pagantes}',
      ''
    )::integer,
    nullif(v_faturas->>'ticket_denominador_pagantes', '')::integer,
    nullif(v_faturas->>'alunos_pagantes_canonicos', '')::integer
  );

  -- Backfill global de 05/09 publicou a base financeira em alunos_executivo.
  -- Snapshots gerenciais fechados antes dele nao ganharam esse campo. A fonte
  -- alternativa continua financeira e explicita; alunos_pagantes nao participa.
  if v_ticket_denominador_pagantes is null then
    select * into v_executivo
    from public.fechamento_mensal_snapshots s
    where s.unidade_id = p_unidade_id
      and s.ano = p_ano
      and s.mes = p_mes
      and s.escopo = 'unidade'
      and s.dominio = 'alunos_executivo'
      and s.status in ('fechado', 'retificado')
    order by s.versao desc, s.fechado_em desc nulls last, s.created_at desc
    limit 1;

    if v_executivo.id is not null
       and (
         v_executivo.payload_hash is null
         or public.hash_jsonb_canonico(v_executivo.payload) <> v_executivo.payload_hash
       ) then
      raise exception 'RELATORIO_ADMIN_MENSAL_FONTE_EXECUTIVA_INVALIDA';
    end if;

    v_ticket_denominador_pagantes := coalesce(
      nullif(
        v_executivo.payload#>>'{financeiro_ticket_contratual,ticket_denominador_pagantes}',
        ''
      )::integer,
      nullif(v_executivo.payload->>'ticket_denominador_pagantes', '')::integer
    );
  end if;

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

  if v_pagantes_relatorio is null or v_pagantes_fonte is null
     or v_ticket_denominador_pagantes is null or v_mrr is null
     or v_ticket is null or v_faturamento_previsto is null
     or v_faturamento_realizado is null or v_faturado_emusys is null
     or v_ltv is null or v_permanencia is null then
    raise exception 'RELATORIO_ADMIN_MENSAL_BASE_FINANCEIRA_INCOMPLETA';
  end if;

  if v_pagantes_relatorio <> v_pagantes_fonte then
    raise exception 'RELATORIO_ADMIN_MENSAL_PAGANTES_DIVERGENTES';
  end if;
  if v_ticket_denominador_pagantes <= 0 then
    raise exception 'RELATORIO_ADMIN_MENSAL_DENOMINADOR_TICKET_INVALIDO';
  end if;
  if round(v_mrr / v_ticket_denominador_pagantes, 2) <> round(v_ticket, 2) then
    raise exception 'RELATORIO_ADMIN_MENSAL_TICKET_DIVERGENTE';
  end if;
  if round(v_faturamento_previsto, 2) <> round(v_mrr, 2) then
    raise exception 'RELATORIO_ADMIN_MENSAL_MRR_DIVERGENTE';
  end if;
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
    'ticket_denominador_pagantes', v_ticket_denominador_pagantes,
    'alunos_pagantes_administrativos', v_pagantes_relatorio,
    'faturamento_previsto', v_faturamento_previsto,
    'faturamento_realizado', v_faturamento_realizado,
    'faturado_emusys', v_faturado_emusys,
    'mrr_atual', v_mrr,
    'ltv_medio', v_ltv,
    'tempo_permanencia', v_permanencia,
    'fonte',
      'kpis_alunos_canonicos.totais + financeiro_ticket_contratual + financeiro_faturas_emusys + alunos_executivo explicito',
    'semantica_pagantes', 'KPI administrativo; nao e o denominador do ticket',
    'semantica_denominador_ticket', 'universo financeiro congelado da competencia',
    'semantica_mrr', 'base_contratual_ativa',
    'semantica_realizado', 'faturas_de_parcela_pagas_na_competencia',
    'semantica_faturado_emusys', 'faturas_de_parcela_pagas_e_em_aberto',
    'retificacao_id', v_retificacao_id
  );

  v_resultado := jsonb_set(
    v_resultado,
    '{payload,indicadores_financeiros}',
    v_financeiro,
    true
  );
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

  select * into v_fideliza
  from public.programa_fideliza_config c
  where c.ano = p_ano;

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

  return jsonb_set(
    v_resultado,
    '{payload,metas_fideliza}',
    v_metas_fideliza,
    true
  );
end;
$function$;

comment on function public.get_relatorio_admin_mensal_rico_v1(uuid, integer, integer) is
  'Relatorio mensal rico: pagantes administrativos e denominador financeiro explicito sao independentes; snapshots gerenciais legados podem ler o denominador do snapshot alunos_executivo da mesma competencia.';

revoke all on function public.get_relatorio_admin_mensal_rico_v1(uuid, integer, integer)
  from public, anon;
grant execute on function public.get_relatorio_admin_mensal_rico_v1(uuid, integer, integer)
  to authenticated, service_role;

do $retificacao$
declare
  v_unidade_id uuid;
  v_qtd integer;
  v_movimentos_posteriores integer;
  v_movimentos_preliminares_no_snapshot constant integer := 7;
  v_evasoes_interrompidas constant integer := 23;
  v_nao_renovacoes constant integer := 6;
  v_evasoes_churn constant integer := 29;
  v_pagantes constant integer := 334;
  v_ativos constant integer := 344;
  v_matriculas constant integer := 422;
  v_novos constant integer := 23;
  v_churn constant numeric := 8.68;
  v_saldo constant integer := -6;

  v_exec public.fechamento_mensal_snapshots%rowtype;
  v_gerencial public.fechamento_mensal_snapshots%rowtype;
  v_mensal public.fechamento_mensal_snapshots%rowtype;
  v_fideliza public.fechamento_mensal_snapshots%rowtype;
  v_coordenacao public.fechamento_mensal_snapshots%rowtype;

  v_exec_new jsonb;
  v_gerencial_new jsonb;
  v_mensal_new jsonb;
  v_fideliza_new jsonb;
  v_common_patch jsonb;
  v_retencao jsonb;
  v_fontes jsonb;
  v_resumo jsonb;
  v_churn_bruto jsonb;
  v_meses jsonb;
  v_metricas jsonb;
  v_farmer jsonb;

  v_exec_id uuid;
  v_gerencial_id uuid;
  v_gerencial_hash text;
  v_mensal_id uuid;
  v_fideliza_id uuid;
  v_rico jsonb;
  v_item jsonb;
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);

  select max(u.id::text)::uuid, count(*)::integer
  into v_unidade_id, v_qtd
  from public.unidades u
  where lower(btrim(u.nome)) = 'recreio';

  if v_qtd <> 1 or v_unidade_id is null then
    raise exception 'RELATORIO_AGOSTO_RECREIO_UNIDADE_INVALIDA: %', v_qtd;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('relatorio_admin_agosto_2026_integridade|' || v_unidade_id::text, 0)
  );

  select * into v_exec
  from public.fechamento_mensal_snapshots s
  where s.unidade_id = v_unidade_id
    and s.ano = 2026 and s.mes = 8
    and s.escopo = 'unidade'
    and s.dominio = 'alunos_executivo'
    and s.status in ('fechado', 'retificado')
  order by s.versao desc, s.created_at desc
  limit 1;

  select * into v_gerencial
  from public.fechamento_mensal_snapshots s
  where s.unidade_id = v_unidade_id
    and s.ano = 2026 and s.mes = 8
    and s.escopo = 'unidade'
    and s.dominio = 'relatorio_gerencial'
    and s.status in ('fechado', 'retificado')
  order by s.versao desc, s.created_at desc
  limit 1;

  select * into v_mensal
  from public.fechamento_mensal_snapshots s
  where s.unidade_id = v_unidade_id
    and s.ano = 2026 and s.mes = 8
    and s.escopo = 'unidade'
    and s.dominio = 'relatorio_admin_mensal'
    and s.status in ('fechado', 'retificado')
  order by s.versao desc, s.created_at desc
  limit 1;

  select * into v_fideliza
  from public.fechamento_mensal_snapshots s
  where s.unidade_id = v_unidade_id
    and s.ano = 2026 and s.mes = 8
    and s.escopo = 'unidade'
    and s.dominio = 'programa_fideliza'
    and s.status in ('fechado', 'retificado')
  order by s.versao desc, s.created_at desc
  limit 1;

  select * into v_coordenacao
  from public.fechamento_mensal_snapshots s
  where s.unidade_id = v_unidade_id
    and s.ano = 2026 and s.mes = 8
    and s.escopo = 'unidade'
    and s.dominio = 'relatorio_coordenacao'
    and s.status in ('fechado', 'retificado')
  order by s.versao desc, s.created_at desc
  limit 1;

  if v_exec.id is null or v_gerencial.id is null or v_mensal.id is null
     or v_fideliza.id is null or v_coordenacao.id is null
     or public.hash_jsonb_canonico(v_exec.payload) <> v_exec.payload_hash
     or public.hash_jsonb_canonico(v_gerencial.payload) <> v_gerencial.payload_hash
     or public.hash_jsonb_canonico(v_mensal.payload) <> v_mensal.payload_hash
     or public.hash_jsonb_canonico(v_fideliza.payload) <> v_fideliza.payload_hash
     or public.hash_jsonb_canonico(v_coordenacao.payload) <> v_coordenacao.payload_hash then
    raise exception 'RELATORIO_AGOSTO_RECREIO_SNAPSHOTS_INVALIDOS';
  end if;

  select item into v_item
  from jsonb_array_elements(
    coalesce(v_fideliza.payload#>'{farmers,0,metricas,churn_bruto,meses}', '[]'::jsonb)
  ) item
  where item->>'mes' = '8';

  if coalesce((v_exec.payload->>'evasoes')::integer, -1) <> 28
     or round(coalesce((v_exec.payload->>'churn_rate')::numeric, -1), 2) <> 8.38
     or coalesce((v_gerencial.payload#>>'{kpis_retencao,0,evasoes_base_alunos}')::integer, -1) <> 22
     or coalesce((v_gerencial.payload#>>'{kpis_retencao,0,nao_renovacoes}')::integer, -1) <> v_nao_renovacoes
     or coalesce((v_gerencial.payload#>>'{kpis_retencao,0,total_evasoes}')::integer, -1) <> 28
     or round(coalesce((v_gerencial.payload#>>'{kpis_retencao,0,churn_rate}')::numeric, -1), 2) <> 8.38
     or coalesce((v_mensal.payload#>>'{resumo,alunos_ativos}')::integer, -1) <> v_ativos
     or coalesce((v_mensal.payload#>>'{resumo,alunos_pagantes}')::integer, -1) <> v_pagantes
     or coalesce((v_mensal.payload#>>'{resumo,matriculas_ativas}')::integer, -1) <> v_matriculas
     or jsonb_array_length(coalesce(v_mensal.payload->'evasoes', '[]'::jsonb)) <> 31
     or jsonb_array_length(coalesce(v_mensal.payload->'nao_renovacoes', '[]'::jsonb)) <> v_nao_renovacoes
     or coalesce((v_coordenacao.payload#>>'{saidas_retencao,evasoes_validas}')::integer, -1) <> v_evasoes_interrompidas
     or coalesce((v_coordenacao.payload#>>'{saidas_retencao,nao_renovacoes_validas}')::integer, -1) <> v_nao_renovacoes
     or coalesce((v_coordenacao.payload#>>'{saidas_retencao,saidas_validas_total}')::integer, -1) <> v_evasoes_churn
     or jsonb_array_length(coalesce(v_fideliza.payload->'farmers', '[]'::jsonb)) <> 1
     or coalesce((v_fideliza.payload#>>'{farmers,0,metricas,churn_bruto,evasoes}')::integer, -1) <> 34
     or round(coalesce((v_fideliza.payload#>>'{farmers,0,metricas,churn_rate}')::numeric, -1), 2) <> 3.39
     or coalesce((v_item->>'evasoes')::integer, -1) <> 28
     or coalesce((v_item->>'alunos')::integer, -1) <> 336
     or round(coalesce((v_item->>'taxa')::numeric, -1), 2) <> 8.33 then
    raise exception 'RELATORIO_AGOSTO_RECREIO_PRECONDICAO_INVALIDA';
  end if;

  -- O snapshot gerencial nasceu as 01:00 UTC. Sete movimentos preliminares ja
  -- existiam; Caetano foi materializado as 02:12 UTC e nunca esteve nos 30.
  select
    count(*) filter (where m.created_at <= v_gerencial.capturado_em)::integer,
    count(*) filter (where m.created_at > v_gerencial.capturado_em)::integer
  into v_qtd, v_movimentos_posteriores
  from public.movimentacoes_admin m
  where m.unidade_id = v_unidade_id
    and m.anulado_por = 'retificacao_agosto_2026_recreio'
    and m.tipo = 'evasao'
    and m.competencia_referencia = date '2026-08-01';

  if v_qtd <> v_movimentos_preliminares_no_snapshot
     or v_movimentos_posteriores <> 1
     or not exists (
       select 1
       from public.movimentacoes_admin m
       join public.alunos a on a.id = m.aluno_id
       where m.unidade_id = v_unidade_id
         and m.anulado_por = 'retificacao_agosto_2026_recreio'
         and lower(btrim(a.nome)) = lower('Caetano Leao Barradas')
         and m.created_at > v_gerencial.capturado_em
     ) then
    raise exception 'RELATORIO_AGOSTO_RECREIO_CRONOLOGIA_INVALIDA: %/7, %/1',
      v_qtd,
      v_movimentos_posteriores;
  end if;

  if round(v_evasoes_churn::numeric / v_pagantes * 100, 2) <> v_churn then
    raise exception 'RELATORIO_AGOSTO_RECREIO_CHURN_INVALIDO';
  end if;

  v_exec_new := v_exec.payload || jsonb_build_object(
    'evasoes', v_evasoes_churn,
    'total_evasoes', v_evasoes_churn,
    'evasoes_base_alunos', v_evasoes_interrompidas,
    'total_evasoes_label', v_evasoes_churn::text,
    'churn_rate', v_churn,
    'saldo_liquido', v_saldo,
    'retificacao_integridade_agosto_2026', jsonb_build_object(
      'motivo', 'sete movimentos, nao oito, pertenciam ao snapshot gerencial original',
      'evasoes_academicas', v_evasoes_interrompidas,
      'nao_renovacoes', v_nao_renovacoes,
      'saidas_churn', v_evasoes_churn,
      'churn_rate', v_churn
    )
  );

  insert into public.fechamento_mensal_snapshots (
    ano, mes, escopo, unidade_id, dominio, versao, status,
    fonte, payload, payload_hash, financeiro_realizado_disponivel,
    observacao, capturado_em, capturado_por,
    aprovado_em, aprovado_por, fechado_em, fechado_por
  ) values (
    2026, 8, 'unidade', v_unidade_id, 'alunos_executivo', v_exec.versao + 1, 'fechado',
    'retificacao_integridade_relatorio_agosto_2026_v1',
    v_exec_new, public.hash_jsonb_canonico(v_exec_new),
    v_exec.financeiro_realizado_disponivel,
    format('retificacao append-only; snapshot anterior: %s', v_exec.id),
    v_exec.capturado_em, v_exec.capturado_por,
    now(), auth.uid(), now(), auth.uid()
  ) returning id into v_exec_id;

  insert into public.fechamento_mensal_auditoria (
    snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
  ) values (
    v_exec_id, 2026, 8, 'unidade', v_unidade_id, 'snapshot_gravado',
    jsonb_build_object(
      'dominio', 'alunos_executivo',
      'snapshot_anterior_id', v_exec.id,
      'payload_anterior_hash', v_exec.payload_hash,
      'evasoes_base_alunos', v_evasoes_interrompidas,
      'nao_renovacoes', v_nao_renovacoes,
      'total_evasoes', v_evasoes_churn,
      'churn_rate', v_churn
    ),
    auth.uid()
  );

  v_common_patch := jsonb_build_object(
    'evasoes', v_evasoes_churn,
    'total_evasoes', v_evasoes_churn,
    'evasoes_base_alunos', v_evasoes_interrompidas,
    'total_evasoes_label', v_evasoes_churn::text,
    'churn_rate', v_churn,
    'saldo_liquido', v_saldo
  );
  v_retencao := v_gerencial.payload#>'{kpis_retencao,0}'
    || jsonb_build_object(
      'evasoes_base_alunos', v_evasoes_interrompidas,
      'evasoes_interrompidas', v_evasoes_interrompidas,
      'nao_renovacoes', v_nao_renovacoes,
      'total_evasoes', v_evasoes_churn,
      'total_evasoes_label', v_evasoes_churn::text,
      'churn_rate', v_churn,
      'taxa_evasao', v_churn
    );

  v_gerencial_new := v_gerencial.payload || jsonb_build_object(
    'retificacao_integridade_agosto_2026', v_exec_new->'retificacao_integridade_agosto_2026'
  );
  v_gerencial_new := jsonb_set(
    v_gerencial_new,
    '{kpis_gestao,0}',
    v_gerencial.payload#>'{kpis_gestao,0}' || v_common_patch,
    true
  );
  v_gerencial_new := jsonb_set(
    v_gerencial_new,
    '{dados_mes_atual,0}',
    v_gerencial.payload#>'{dados_mes_atual,0}' || v_common_patch,
    true
  );
  v_gerencial_new := jsonb_set(
    v_gerencial_new,
    '{kpis_alunos_canonicos,totais}',
    v_gerencial.payload#>'{kpis_alunos_canonicos,totais}' || v_common_patch,
    true
  );
  v_gerencial_new := jsonb_set(
    v_gerencial_new,
    '{kpis_alunos_canonicos,por_unidade,0}',
    v_gerencial.payload#>'{kpis_alunos_canonicos,por_unidade,0}' || v_common_patch,
    true
  );
  v_gerencial_new := jsonb_set(
    v_gerencial_new,
    '{kpis_retencao,0}',
    v_retencao,
    true
  );

  insert into public.fechamento_mensal_snapshots (
    ano, mes, escopo, unidade_id, dominio, versao, status,
    fonte, payload, payload_hash, financeiro_realizado_disponivel,
    observacao, capturado_em, capturado_por,
    aprovado_em, aprovado_por, fechado_em, fechado_por
  ) values (
    2026, 8, 'unidade', v_unidade_id, 'relatorio_gerencial',
    v_gerencial.versao + 1, 'fechado',
    'retificacao_integridade_relatorio_agosto_2026_v1',
    v_gerencial_new, public.hash_jsonb_canonico(v_gerencial_new),
    v_gerencial.financeiro_realizado_disponivel,
    format('retificacao append-only; snapshot anterior: %s', v_gerencial.id),
    v_gerencial.capturado_em, v_gerencial.capturado_por,
    now(), auth.uid(), now(), auth.uid()
  ) returning id, payload_hash into v_gerencial_id, v_gerencial_hash;

  insert into public.fechamento_mensal_auditoria (
    snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
  ) values (
    v_gerencial_id, 2026, 8, 'unidade', v_unidade_id, 'snapshot_gravado',
    jsonb_build_object(
      'dominio', 'relatorio_gerencial',
      'snapshot_anterior_id', v_gerencial.id,
      'payload_anterior_hash', v_gerencial.payload_hash,
      'movimentos_preliminares_presentes_na_captura', v_movimentos_preliminares_no_snapshot,
      'evasoes_base_alunos', v_evasoes_interrompidas,
      'total_evasoes', v_evasoes_churn,
      'churn_rate', v_churn
    ),
    auth.uid()
  );

  v_fontes := jsonb_set(
    coalesce(v_mensal.payload->'fontes', '{}'::jsonb),
    '{relatorio_gerencial}',
    jsonb_build_object(
      'snapshot_id', v_gerencial_id,
      'payload_hash', v_gerencial_hash
    ),
    true
  );
  v_resumo := coalesce(v_mensal.payload->'resumo', '{}'::jsonb)
    || jsonb_build_object('churn_rate', v_churn);
  v_mensal_new := jsonb_set(v_mensal.payload, '{fontes}', v_fontes, true);
  v_mensal_new := jsonb_set(v_mensal_new, '{resumo}', v_resumo, true);
  v_mensal_new := v_mensal_new || jsonb_build_object(
    'retificacao_integridade_agosto_2026', v_exec_new->'retificacao_integridade_agosto_2026'
  );

  insert into public.fechamento_mensal_snapshots (
    ano, mes, escopo, unidade_id, dominio, versao, status,
    fonte, payload, payload_hash, financeiro_realizado_disponivel,
    observacao, capturado_em, capturado_por,
    aprovado_em, aprovado_por, fechado_em, fechado_por
  ) values (
    2026, 8, 'unidade', v_unidade_id, 'relatorio_admin_mensal',
    v_mensal.versao + 1, 'fechado',
    'retificacao_integridade_relatorio_agosto_2026_v1',
    v_mensal_new, public.hash_jsonb_canonico(v_mensal_new),
    v_mensal.financeiro_realizado_disponivel,
    format('retificacao append-only; snapshot anterior: %s', v_mensal.id),
    v_mensal.capturado_em, v_mensal.capturado_por,
    now(), auth.uid(), now(), auth.uid()
  ) returning id into v_mensal_id;

  insert into public.fechamento_mensal_auditoria (
    snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
  ) values (
    v_mensal_id, 2026, 8, 'unidade', v_unidade_id, 'snapshot_gravado',
    jsonb_build_object(
      'dominio', 'relatorio_admin_mensal',
      'snapshot_anterior_id', v_mensal.id,
      'payload_anterior_hash', v_mensal.payload_hash,
      'snapshot_relatorio_gerencial_id', v_gerencial_id,
      'evasoes_detalhadas', 31,
      'nao_renovacoes_detalhadas', v_nao_renovacoes,
      'saidas_churn', v_evasoes_churn,
      'churn_rate', v_churn
    ),
    auth.uid()
  );

  select coalesce(jsonb_agg(
    case
      when (item->>'mes')::integer = 8 then
        item || jsonb_build_object('evasoes', 29, 'alunos', 336, 'taxa', 8.63)
      else item
    end
    order by ord
  ), '[]'::jsonb)
  into v_meses
  from jsonb_array_elements(v_fideliza.payload#>'{farmers,0,metricas,churn_bruto,meses}')
    with ordinality t(item, ord);

  v_churn_bruto := v_fideliza.payload#>'{farmers,0,metricas,churn_bruto}'
    || jsonb_build_object('evasoes', 35, 'meses', v_meses);
  v_metricas := v_fideliza.payload#>'{farmers,0,metricas}'
    || jsonb_build_object('churn_rate', 3.49, 'churn_bruto', v_churn_bruto);
  v_farmer := v_fideliza.payload->'farmers'->0
    || jsonb_build_object('metricas', v_metricas);
  v_fideliza_new := jsonb_set(v_fideliza.payload, '{farmers,0}', v_farmer, true)
    || jsonb_build_object(
      'retificacao_integridade_agosto_2026', v_exec_new->'retificacao_integridade_agosto_2026'
    );

  insert into public.fechamento_mensal_snapshots (
    ano, mes, escopo, unidade_id, dominio, versao, status,
    fonte, payload, payload_hash, financeiro_realizado_disponivel,
    observacao, capturado_em, capturado_por,
    aprovado_em, aprovado_por, fechado_em, fechado_por
  ) values (
    2026, 8, 'unidade', v_unidade_id, 'programa_fideliza',
    v_fideliza.versao + 1, 'fechado',
    'retificacao_integridade_relatorio_agosto_2026_v1',
    v_fideliza_new, public.hash_jsonb_canonico(v_fideliza_new),
    v_fideliza.financeiro_realizado_disponivel,
    format('retificacao append-only; snapshot anterior: %s', v_fideliza.id),
    v_fideliza.capturado_em, v_fideliza.capturado_por,
    now(), auth.uid(), now(), auth.uid()
  ) returning id into v_fideliza_id;

  insert into public.fechamento_mensal_auditoria (
    snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
  ) values (
    v_fideliza_id, 2026, 8, 'unidade', v_unidade_id, 'snapshot_gravado',
    jsonb_build_object(
      'dominio', 'programa_fideliza',
      'snapshot_anterior_id', v_fideliza.id,
      'payload_anterior_hash', v_fideliza.payload_hash,
      'evasoes_agosto', 29,
      'denominador_agosto', 336,
      'taxa_agosto', 8.63
    ),
    auth.uid()
  );

  update public.dados_mensais
  set evasoes = v_evasoes_churn,
      churn_rate = v_churn,
      updated_at = now()
  where unidade_id = v_unidade_id
    and ano = 2026 and mes = 8
    and evasoes = 28
    and round(churn_rate, 2) = 8.38
    and alunos_ativos = v_ativos
    and alunos_pagantes = v_pagantes
    and matriculas_ativas = v_matriculas;
  get diagnostics v_qtd = row_count;

  if v_qtd <> 1 then
    raise exception 'RELATORIO_AGOSTO_RECREIO_DADOS_MENSAIS_INVALIDO: %/1', v_qtd;
  end if;

  insert into public.automacao_log (
    aluno_nome, unidade_nome, evento, acao, detalhes,
    workflow_id, execution_id, status, created_at
  ) values (
    'Integridade agosto/2026', 'Recreio',
    'retificacao_fechamento_mensal', 'cronologia_churn_corrigida',
    jsonb_build_object(
      'snapshot_original_capturado_em', v_gerencial.capturado_em,
      'movimentos_preliminares_presentes', v_movimentos_preliminares_no_snapshot,
      'movimento_caetano_posterior', true,
      'evasoes_academicas', v_evasoes_interrompidas,
      'nao_renovacoes', v_nao_renovacoes,
      'total_churn', v_evasoes_churn,
      'churn_rate', v_churn,
      'snapshot_executivo_id', v_exec_id,
      'snapshot_gerencial_id', v_gerencial_id,
      'snapshot_admin_mensal_id', v_mensal_id,
      'snapshot_fideliza_id', v_fideliza_id
    ),
    'retificacao_integridade_relatorio_agosto_2026_v1',
    now()::text,
    'ok',
    now()
  );

  -- Prova local da unidade retificada: Recreio 344 ativos, 334 pagantes,
  -- 422 matriculas, churn 8.68; denominador financeiro 325, ticket 445.38.
  v_rico := public.get_relatorio_admin_mensal_rico_v1(v_unidade_id, 2026, 8);
  if coalesce((v_rico#>>'{payload,resumo,alunos_ativos}')::integer, -1) <> 344
     or coalesce((v_rico#>>'{payload,resumo,alunos_pagantes}')::integer, -1) <> 334
     or coalesce((v_rico#>>'{payload,resumo,matriculas_ativas}')::integer, -1) <> 422
     or round(coalesce((v_rico#>>'{payload,indicadores_retencao,churn_rate}')::numeric, -1), 2) <> 8.68
     or coalesce((v_rico#>>'{payload,indicadores_retencao,total_evasoes}')::integer, -1) <> 37
     or coalesce((v_rico#>>'{payload,indicadores_financeiros,ticket_denominador_pagantes}')::integer, -1) <> 325
     or round(coalesce((v_rico#>>'{payload,indicadores_financeiros,ticket_medio}')::numeric, -1), 2) <> 445.38 then
    raise exception 'RELATORIO_AGOSTO_RECREIO_VALIDACAO_RICO_FALHOU: %', v_rico;
  end if;
end;
$retificacao$;

-- Prova das tres unidades. Barra: 256 / 446.30. Campo Grande: 382 / 398.87.
-- Recreio: denominador 325 / ticket 445.38, separado dos 334 pagantes admin.
do $validacao_tres_unidades$
declare
  v_esperado record;
  v_rico jsonb;
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);

  for v_esperado in
    select * from (values
      ('Barra'::text, 256, 446.30::numeric),
      ('Campo Grande'::text, 382, 398.87::numeric),
      ('Recreio'::text, 325, 445.38::numeric)
    ) v(unidade_nome, denominador, ticket)
  loop
    select public.get_relatorio_admin_mensal_rico_v1(u.id, 2026, 8)
    into v_rico
    from public.unidades u
    where lower(btrim(u.nome)) = lower(v_esperado.unidade_nome);

    if v_rico is null
       or coalesce((v_rico#>>'{payload,indicadores_financeiros,ticket_denominador_pagantes}')::integer, -1)
          <> v_esperado.denominador
       or round(coalesce((v_rico#>>'{payload,indicadores_financeiros,ticket_medio}')::numeric, -1), 2)
          <> v_esperado.ticket then
      raise exception 'RELATORIO_AGOSTO_UNIDADE_VALIDACAO_FALHOU: %, %',
        v_esperado.unidade_nome,
        v_rico;
    end if;
  end loop;
end;
$validacao_tres_unidades$;

commit;
