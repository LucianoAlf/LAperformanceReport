-- Retificação append-only: tira a evasão indevida da Layara Sales Magalhães do fechamento
-- de agosto/2026 do Recreio. Saídas 29 -> 28, que é o número do Emusys.
--
-- O FATO (medido em 08/09/2026): ela não saiu. Presente em 22/08 — dezesseis dias depois da
-- evasão lançada à mão em 06/08 —, mensalidades de 08 e 09/2026 pagas (R$ 430 cada), 27
-- aulas futuras na matrícula Emusys 1428 e aviso prévio do próprio Emusys em 08/09 para
-- sair em OUTUBRO. A movimentação já foi arquivada no dado vivo pela migration
-- `20260908190000`; esta aqui corrige a FOTO do mês, que é imutável e não acompanha.
--
-- São DOIS domínios porque o relatório lê de dois snapshots:
--   • `relatorio_admin_mensal` -> a lista de evasões e `resumo.evasoes`;
--   • `relatorio_gerencial`    -> `kpis_retencao`, de onde saem `evasoes_base_alunos` e
--     `mrr_perdido`. O churn NÃO é gravado: `get_relatorio_admin_mensal_rico_base_v1` o
--     recalcula como `(evasoes_base_alunos + nao_renovacoes) / alunos_pagantes`, então
--     corrigir a base já move o churn de 8,68% para 8,38%.
--
-- 🔴 O QUE ESTA RETIFICAÇÃO NÃO TOCA, E POR QUÊ: `alunos_pagantes` (334), `alunos_ativos`
-- (344), ticket médio, faturamento e inadimplência ficam como estão.
--
-- A tentação é somar a Layara ao denominador (334 -> 335), já que ela estava pagando em
-- agosto. Não faço porque o denominador tem erro PRÓPRIO e independente: medido hoje, com
-- ela já corrigida, temos 337 pessoas ativas contra 339 no espelho do Emusys — divergência
-- de DUAS pessoas que ninguém apurou. Mexer no denominador por causa de uma delas seria
-- escolher arbitrariamente o erro que eu topei hoje e deixar os outros, produzindo um
-- número que parece apurado e não é. O "344 = 344" que batia com o Emusys em agosto era
-- coincidência, não validação.
--
-- Efeito colateral assumido: o churn fica levemente CONSERVADOR (28/334 = 8,38% em vez de
-- 28/335 = 8,36%). São 0,02 ponto, contra os 0,30 de erro que esta retificação corrige.
-- A apuração do denominador é frente própria.

do $$
declare
  v_unidade_id uuid := '95553e96-971b-4590-a6eb-0201d013c14d'; -- Recreio
  v_mov_id bigint := 3541;                                     -- evasão indevida
  v_valor_layara numeric := 430;                               -- valor_perdido no payload
  v_snap public.fechamento_mensal_snapshots%rowtype;
  v_lista jsonb;
  v_qtd integer;
  v_resumo_antes integer;
  v_novo jsonb;
  v_novo_id uuid;
  v_ret jsonb;
  v_mrr_antes numeric;
begin
  ---------------------------------------------------------------------------
  -- 1) relatorio_admin_mensal: lista de evasões e resumo
  ---------------------------------------------------------------------------
  select * into v_snap
  from public.fechamento_mensal_snapshots
  where ano = 2026 and mes = 8 and escopo = 'unidade'
    and unidade_id = v_unidade_id and dominio = 'relatorio_admin_mensal'
  order by versao desc limit 1;

  if v_snap.id is null then
    raise exception 'RETIFICACAO_LAYARA_SNAPSHOT_ADMIN_AUSENTE';
  end if;
  if v_snap.payload_hash is null
     or public.hash_jsonb_canonico(v_snap.payload) <> v_snap.payload_hash then
    raise exception 'RETIFICACAO_LAYARA_HASH_ADMIN_DIVERGENTE';
  end if;

  -- Parte da versão MAIS RECENTE, nunca do payload original: as v5-v9 já corrigiram
  -- evasões, ticket, financeiro e avisos prévios, e recomeçar do zero as apagaria.
  v_resumo_antes := coalesce((v_snap.payload->'resumo'->>'evasoes')::integer, 0);

  select coalesce(jsonb_agg(item order by ord), '[]'::jsonb), count(*)
    into v_lista, v_qtd
  from jsonb_array_elements(coalesce(v_snap.payload->'evasoes', '[]'::jsonb))
    with ordinality e(item, ord)
  where nullif(item->>'id', '')::bigint is distinct from v_mov_id;

  if v_qtd <> jsonb_array_length(coalesce(v_snap.payload->'evasoes', '[]'::jsonb)) - 1 then
    raise exception 'RETIFICACAO_LAYARA_LISTA_INESPERADA: esperado remover 1 item, restaram %', v_qtd;
  end if;
  if v_resumo_antes <> 37 then
    raise exception 'RETIFICACAO_LAYARA_RESUMO_INESPERADO: esperado 37, obtido %', v_resumo_antes;
  end if;

  v_novo := jsonb_set(v_snap.payload, '{evasoes}', v_lista);
  v_novo := jsonb_set(v_novo, '{resumo,evasoes}', to_jsonb(v_resumo_antes - 1));
  v_novo := jsonb_set(v_novo, '{retificacao_evasao_layara_agosto_2026}', jsonb_build_object(
    'aplicado_em', now(),
    'movimentacao_removida', v_mov_id,
    'de', v_resumo_antes, 'para', v_resumo_antes - 1,
    'snapshot_anterior', v_snap.id,
    'motivo', 'Evasao lancada a mao em 06/08/2026 sem saida real (presenca em 22/08, '
              || 'mensalidades de 08 e 09 pagas, 27 aulas futuras, aviso previo para outubro). '
              || 'Denominador (alunos_pagantes/ativos), ticket e inadimplencia NAO foram '
              || 'tocados: o denominador tem divergencia propria de 2 pessoas contra o '
              || 'espelho do Emusys, pendente de apuracao.'
  ));

  -- Guarda de escopo: fora as três chaves declaradas, o payload sai byte a byte igual.
  if (v_novo - 'evasoes' - 'retificacao_evasao_layara_agosto_2026' #- '{resumo,evasoes}')
     is distinct from
     (v_snap.payload - 'evasoes' - 'retificacao_evasao_layara_agosto_2026' #- '{resumo,evasoes}')
  then
    raise exception 'RETIFICACAO_LAYARA_ESCOPO_ADMIN_EXCEDIDO';
  end if;

  insert into public.fechamento_mensal_snapshots (
    ano, mes, escopo, unidade_id, dominio, versao, status, fonte, payload, payload_hash,
    financeiro_realizado_disponivel, observacao, capturado_em, capturado_por,
    aprovado_em, aprovado_por, fechado_em, fechado_por
  ) values (
    2026, 8, 'unidade', v_unidade_id, 'relatorio_admin_mensal', v_snap.versao + 1, 'fechado',
    'retificacao_evasao_layara_agosto_2026_recreio_v1', v_novo,
    public.hash_jsonb_canonico(v_novo), v_snap.financeiro_realizado_disponivel,
    format('retificacao append-only; snapshot anterior: %s', v_snap.id),
    v_snap.capturado_em, v_snap.capturado_por, now(), auth.uid(), now(), auth.uid()
  ) returning id into v_novo_id;

  insert into public.fechamento_mensal_auditoria (
    snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
  ) values (
    v_novo_id, 2026, 8, 'unidade', v_unidade_id, 'snapshot_gravado',
    jsonb_build_object('dominio', 'relatorio_admin_mensal',
      'snapshot_anterior_id', v_snap.id, 'evasoes_de', v_resumo_antes,
      'evasoes_para', v_resumo_antes - 1), auth.uid()
  );
  raise notice 'admin_mensal: v% -> v% (evasoes % -> %)',
    v_snap.versao, v_snap.versao + 1, v_resumo_antes, v_resumo_antes - 1;

  ---------------------------------------------------------------------------
  -- 2) relatorio_gerencial: kpis_retencao
  ---------------------------------------------------------------------------
  select * into v_snap
  from public.fechamento_mensal_snapshots
  where ano = 2026 and mes = 8 and escopo = 'unidade'
    and unidade_id = v_unidade_id and dominio = 'relatorio_gerencial'
  order by versao desc limit 1;

  if v_snap.id is null then
    raise exception 'RETIFICACAO_LAYARA_SNAPSHOT_GERENCIAL_AUSENTE';
  end if;
  if v_snap.payload_hash is null
     or public.hash_jsonb_canonico(v_snap.payload) <> v_snap.payload_hash then
    raise exception 'RETIFICACAO_LAYARA_HASH_GERENCIAL_DIVERGENTE';
  end if;

  v_ret := v_snap.payload->'kpis_retencao'->0;
  if v_ret is null then
    raise exception 'RETIFICACAO_LAYARA_KPIS_RETENCAO_AUSENTE';
  end if;
  if (v_ret->>'evasoes_base_alunos')::integer <> 23
     or (v_ret->>'total_evasoes')::integer <> 29
     or (v_ret->>'nao_renovacoes')::integer <> 6 then
    raise exception 'RETIFICACAO_LAYARA_KPIS_INESPERADOS: base=%, total=%, nao_renov=%',
      v_ret->>'evasoes_base_alunos', v_ret->>'total_evasoes', v_ret->>'nao_renovacoes';
  end if;

  v_mrr_antes := (v_ret->>'mrr_perdido')::numeric;

  -- O churn NÃO é gravado aqui: a função do relatório o recalcula a partir de
  -- `evasoes_base_alunos + nao_renovacoes` sobre `alunos_pagantes`. Ainda assim os campos
  -- `churn_rate`/`taxa_evasao` deste bloco são lidos por outros consumidores, e deixá-los
  -- com 8,68 faria dois números discordarem sobre o mesmo mês.
  v_ret := v_ret
    || jsonb_build_object(
         'evasoes_base_alunos', 22,
         'evasoes_interrompidas', 22,
         'total_evasoes', 28,
         'total_evasoes_label', '28',
         'mrr_perdido', v_mrr_antes - v_valor_layara,
         'churn_rate', round((22 + 6)::numeric / 334 * 100, 2),
         'taxa_evasao', round((22 + 6)::numeric / 334 * 100, 2)
       );

  v_novo := jsonb_set(v_snap.payload, '{kpis_retencao,0}', v_ret);
  v_novo := jsonb_set(v_novo, '{retificacao_evasao_layara_agosto_2026}', jsonb_build_object(
    'aplicado_em', now(),
    'movimentacao_removida', v_mov_id,
    'snapshot_anterior', v_snap.id,
    'motivo', 'Espelha no gerencial a retificacao do admin mensal: evasao indevida da '
              || 'Layara Sales Magalhaes. Denominador, ticket e inadimplencia intactos.'
  ));

  if (v_novo - 'kpis_retencao' - 'retificacao_evasao_layara_agosto_2026')
     is distinct from
     (v_snap.payload - 'kpis_retencao' - 'retificacao_evasao_layara_agosto_2026')
  then
    raise exception 'RETIFICACAO_LAYARA_ESCOPO_GERENCIAL_EXCEDIDO';
  end if;

  insert into public.fechamento_mensal_snapshots (
    ano, mes, escopo, unidade_id, dominio, versao, status, fonte, payload, payload_hash,
    financeiro_realizado_disponivel, observacao, capturado_em, capturado_por,
    aprovado_em, aprovado_por, fechado_em, fechado_por
  ) values (
    2026, 8, 'unidade', v_unidade_id, 'relatorio_gerencial', v_snap.versao + 1, 'fechado',
    'retificacao_evasao_layara_agosto_2026_recreio_v1', v_novo,
    public.hash_jsonb_canonico(v_novo), v_snap.financeiro_realizado_disponivel,
    format('retificacao append-only; snapshot anterior: %s', v_snap.id),
    v_snap.capturado_em, v_snap.capturado_por, now(), auth.uid(), now(), auth.uid()
  ) returning id into v_novo_id;

  insert into public.fechamento_mensal_auditoria (
    snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
  ) values (
    v_novo_id, 2026, 8, 'unidade', v_unidade_id, 'snapshot_gravado',
    jsonb_build_object('dominio', 'relatorio_gerencial',
      'snapshot_anterior_id', v_snap.id, 'total_evasoes_de', 29, 'total_evasoes_para', 28,
      'mrr_perdido_de', v_mrr_antes, 'mrr_perdido_para', v_mrr_antes - v_valor_layara),
    auth.uid()
  );
  raise notice 'gerencial: v% -> v% (total_evasoes 29 -> 28)', v_snap.versao, v_snap.versao + 1;
end $$;

-- ---------------------------------------------------------------------------
-- 3) Religa o ponteiro: sem isto, a parte 2 fica INERTE.
--
-- Descoberto ao validar: depois das partes 1 e 2, a lista de evasões caiu para 30 e o
-- resumo para 36, mas churn e `mrr_perdido` NÃO se moveram. O motivo é que o snapshot
-- `relatorio_admin_mensal` declara a fonte gerencial por ID E HASH em
-- `fontes.relatorio_gerencial`, e `get_relatorio_admin_mensal_rico_base_v1` lê exatamente
-- aquele snapshot — não "o mais recente". Como a parte 2 criou uma VERSÃO NOVA do
-- gerencial, o admin continuou lendo a antiga.
--
-- É a mesma armadilha que o CLAUDE.md registra sobre retificação que fica correta e
-- inerte. A amarração por hash existe de propósito (garante que o par admin+gerencial é
-- consistente), então o certo é atualizar o ponteiro, nunca afrouxar a checagem.
-- ---------------------------------------------------------------------------

do $$
declare
  v_unidade_id uuid := '95553e96-971b-4590-a6eb-0201d013c14d';
  v_admin public.fechamento_mensal_snapshots%rowtype;
  v_ger public.fechamento_mensal_snapshots%rowtype;
  v_novo jsonb;
  v_novo_id uuid;
begin
  select * into v_admin
  from public.fechamento_mensal_snapshots
  where ano = 2026 and mes = 8 and escopo = 'unidade'
    and unidade_id = v_unidade_id and dominio = 'relatorio_admin_mensal'
  order by versao desc limit 1;

  select * into v_ger
  from public.fechamento_mensal_snapshots
  where ano = 2026 and mes = 8 and escopo = 'unidade'
    and unidade_id = v_unidade_id and dominio = 'relatorio_gerencial'
  order by versao desc limit 1;

  if v_admin.id is null or v_ger.id is null then
    raise exception 'RELIGA_FONTE_SNAPSHOT_AUSENTE';
  end if;

  -- Só religa para a versão que ESTA retificação criou; apontar para outra coisa seria
  -- trocar a fonte do mês por engano.
  if v_ger.fonte <> 'retificacao_evasao_layara_agosto_2026_recreio_v1' then
    raise exception 'RELIGA_FONTE_GERENCIAL_INESPERADA: %', v_ger.fonte;
  end if;
  if public.hash_jsonb_canonico(v_ger.payload) <> v_ger.payload_hash then
    raise exception 'RELIGA_FONTE_HASH_GERENCIAL_DIVERGENTE';
  end if;

  if (v_admin.payload#>>'{fontes,relatorio_gerencial,snapshot_id}')::uuid = v_ger.id then
    raise notice 'RELIGA_FONTE: ponteiro ja aponta para o gerencial v%; nada a fazer', v_ger.versao;
    return;
  end if;

  v_novo := jsonb_set(v_admin.payload, '{fontes,relatorio_gerencial}', jsonb_build_object(
    'snapshot_id', v_ger.id,
    'payload_hash', v_ger.payload_hash
  ));

  if (v_novo #- '{fontes,relatorio_gerencial}')
     is distinct from (v_admin.payload #- '{fontes,relatorio_gerencial}') then
    raise exception 'RELIGA_FONTE_ESCOPO_EXCEDIDO';
  end if;

  insert into public.fechamento_mensal_snapshots (
    ano, mes, escopo, unidade_id, dominio, versao, status, fonte, payload, payload_hash,
    financeiro_realizado_disponivel, observacao, capturado_em, capturado_por,
    aprovado_em, aprovado_por, fechado_em, fechado_por
  ) values (
    2026, 8, 'unidade', v_unidade_id, 'relatorio_admin_mensal', v_admin.versao + 1, 'fechado',
    'retificacao_evasao_layara_agosto_2026_recreio_fonte_v1', v_novo,
    public.hash_jsonb_canonico(v_novo), v_admin.financeiro_realizado_disponivel,
    format('religa fontes.relatorio_gerencial para o snapshot %s (v%s)', v_ger.id, v_ger.versao),
    v_admin.capturado_em, v_admin.capturado_por, now(), auth.uid(), now(), auth.uid()
  ) returning id into v_novo_id;

  insert into public.fechamento_mensal_auditoria (
    snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
  ) values (
    v_novo_id, 2026, 8, 'unidade', v_unidade_id, 'snapshot_gravado',
    jsonb_build_object('dominio', 'relatorio_admin_mensal',
      'snapshot_anterior_id', v_admin.id,
      'fonte_gerencial_de', v_admin.payload#>>'{fontes,relatorio_gerencial,snapshot_id}',
      'fonte_gerencial_para', v_ger.id), auth.uid()
  );
  raise notice 'admin_mensal: v% -> v% (fonte gerencial religada para v%)',
    v_admin.versao, v_admin.versao + 1, v_ger.versao;
end $$;
