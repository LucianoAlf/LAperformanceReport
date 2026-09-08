-- Corrige o fechamento financeiro de agosto/2026 do Recreio.
-- Versao registrada no ledger remoto: 20260908172442.
--
-- A retificacao academica de 05/09 recompôs nove alunos cuja saida efetiva
-- ocorreu em setembro e fechou agosto com 344 ativos e 334 pagantes. A
-- retificacao financeira imediatamente posterior reaproveitou o denominador
-- anterior (325), embora mantivesse o MRR retificado de R$ 144.749,17. Isso
-- produziu R$ 445,38. A equacao confirmada para o fechamento e:
--   R$ 144.749,17 / 334 pagantes = R$ 433,38.
--
-- Esta migration nao muda a regra global que separa pagantes administrativos
-- do denominador financeiro. Ela apenas corrige o valor congelado desta
-- unidade/competencia e cria novas versoes append-only dos tres snapshots
-- consumidores.

begin;

do $correcao$
declare
  v_unidade_id uuid;
  v_qtd integer;

  v_ativos constant integer := 344;
  v_pagantes_administrativos constant integer := 334;
  v_matriculas constant integer := 422;
  v_ticket_denominador_pagantes constant integer := 334;
  v_mrr constant numeric := 144749.17;
  v_ticket constant numeric := 433.38;

  v_exec public.fechamento_mensal_snapshots%rowtype;
  v_gerencial public.fechamento_mensal_snapshots%rowtype;
  v_mensal public.fechamento_mensal_snapshots%rowtype;
  v_exec_new jsonb;
  v_gerencial_new jsonb;
  v_mensal_new jsonb;
  v_financeiro_ticket jsonb;
  v_financeiro_totais jsonb;
  v_retificacao_ticket jsonb;
  v_bloco jsonb;
  v_resumo jsonb;
  v_fontes jsonb;
  v_exec_id uuid;
  v_exec_hash text;
  v_gerencial_id uuid;
  v_gerencial_hash text;
  v_mensal_id uuid;
  v_mensal_hash text;
  v_rico jsonb;
  v_relatorio_gerencial jsonb;
  v_financeiro jsonb;
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);

  select (max(id::text))::uuid, count(*)::integer
    into v_unidade_id, v_qtd
  from public.unidades
  where lower(btrim(nome)) = 'recreio';

  if v_qtd <> 1
     or v_unidade_id <> '95553e96-971b-4590-a6eb-0201d013c14d'::uuid then
    raise exception 'TICKET_AGOSTO_RECREIO_334_UNIDADE_INVALIDA: %/%',
      v_unidade_id, v_qtd;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('ticket_agosto_2026_recreio_334|' || v_unidade_id::text, 0)
  );

  select * into v_exec
  from public.fechamento_mensal_snapshots s
  where s.ano = 2026 and s.mes = 8 and s.escopo = 'unidade'
    and s.unidade_id = v_unidade_id and s.dominio = 'alunos_executivo'
    and s.status = 'fechado'
  order by s.versao desc, s.created_at desc
  limit 1
  for update;

  select * into v_gerencial
  from public.fechamento_mensal_snapshots s
  where s.ano = 2026 and s.mes = 8 and s.escopo = 'unidade'
    and s.unidade_id = v_unidade_id and s.dominio = 'relatorio_gerencial'
    and s.status = 'fechado'
  order by s.versao desc, s.created_at desc
  limit 1
  for update;

  select * into v_mensal
  from public.fechamento_mensal_snapshots s
  where s.ano = 2026 and s.mes = 8 and s.escopo = 'unidade'
    and s.unidade_id = v_unidade_id and s.dominio = 'relatorio_admin_mensal'
    and s.status = 'fechado'
  order by s.versao desc, s.created_at desc
  limit 1
  for update;

  if v_exec.id is null or v_gerencial.id is null or v_mensal.id is null then
    raise exception 'TICKET_AGOSTO_RECREIO_334_SNAPSHOTS_AUSENTES';
  end if;

  -- Estado de producao medido imediatamente antes da correcao. Se qualquer
  -- outro fechamento tiver sido publicado, a transacao para e exige nova
  -- auditoria em vez de corrigir uma base desconhecida.
  if v_exec.versao <> 6
     or v_exec.fonte <> 'retificacao_integridade_relatorio_agosto_2026_v1'
     or public.hash_jsonb_canonico(v_exec.payload) <> v_exec.payload_hash
     or coalesce((v_exec.payload->>'alunos_ativos')::integer, -1) <> v_ativos
     or coalesce((v_exec.payload->>'alunos_pagantes')::integer, -1) <> v_pagantes_administrativos
     or coalesce((v_exec.payload->>'matriculas_ativas')::integer, -1) <> v_matriculas
     or round(coalesce((v_exec.payload->>'mrr')::numeric, -1), 2) <> v_mrr
     or coalesce((v_exec.payload->>'ticket_denominador_pagantes')::integer, -1) <> 325
     or round(coalesce((v_exec.payload->>'ticket_medio')::numeric, -1), 2) <> 445.38
     or coalesce((v_exec.payload#>>'{financeiro_ticket_contratual,ticket_denominador_pagantes}')::integer, -1) <> 325
     or round(coalesce((v_exec.payload#>>'{financeiro_ticket_contratual,ticket_medio}')::numeric, -1), 2) <> 445.38 then
    raise exception 'TICKET_AGOSTO_RECREIO_334_EXECUTIVO_MUDOU: v% fonte %',
      v_exec.versao, v_exec.fonte;
  end if;

  if v_gerencial.versao <> 7
     or v_gerencial.fonte <> 'retificacao_integridade_relatorio_agosto_2026_v1'
     or public.hash_jsonb_canonico(v_gerencial.payload) <> v_gerencial.payload_hash
     or jsonb_typeof(v_gerencial.payload#>'{kpis_gestao,0}') is distinct from 'object'
     or jsonb_typeof(v_gerencial.payload#>'{dados_mes_atual,0}') is distinct from 'object'
     or jsonb_typeof(v_gerencial.payload#>'{kpis_alunos_canonicos,totais}') is distinct from 'object'
     or jsonb_array_length(coalesce(v_gerencial.payload#>'{kpis_alunos_canonicos,por_unidade}', '[]'::jsonb)) <> 1
     or coalesce((v_gerencial.payload#>>'{kpis_alunos_canonicos,totais,alunos_pagantes}')::integer, -1) <> v_pagantes_administrativos
     or coalesce((v_gerencial.payload#>>'{kpis_alunos_canonicos,totais,ticket_denominador_pagantes}')::integer, -1) <> 325
     or round(coalesce((v_gerencial.payload#>>'{kpis_alunos_canonicos,totais,ticket_medio}')::numeric, -1), 2) <> 445.38
     or coalesce((v_gerencial.payload#>>'{financeiro_faturas_emusys,totais,ticket_denominador_pagantes}')::integer, -1) <> 325
     or round(coalesce((v_gerencial.payload#>>'{financeiro_faturas_emusys,totais,ticket_medio}')::numeric, -1), 2) <> 445.38 then
    raise exception 'TICKET_AGOSTO_RECREIO_334_GERENCIAL_MUDOU: v% fonte %',
      v_gerencial.versao, v_gerencial.fonte;
  end if;

  if v_mensal.versao <> 7
     or v_mensal.fonte <> 'retificacao_integridade_relatorio_agosto_2026_v1'
     or public.hash_jsonb_canonico(v_mensal.payload) <> v_mensal.payload_hash
     or nullif(v_mensal.payload#>>'{fontes,relatorio_gerencial,snapshot_id}', '')::uuid
        is distinct from v_gerencial.id
     or v_mensal.payload#>>'{fontes,relatorio_gerencial,payload_hash}'
        is distinct from v_gerencial.payload_hash
     or coalesce((v_mensal.payload#>>'{resumo,alunos_pagantes}')::integer, -1) <> v_pagantes_administrativos
     or coalesce((v_mensal.payload#>>'{resumo,ticket_denominador_pagantes}')::integer, -1) <> 325
     or round(coalesce((v_mensal.payload#>>'{resumo,ticket_medio}')::numeric, -1), 2) <> 445.38
     or coalesce((v_mensal.payload#>>'{fontes,financeiro_ticket_contratual,ticket_denominador_pagantes}')::integer, -1) <> 325 then
    raise exception 'TICKET_AGOSTO_RECREIO_334_ADMIN_MENSAL_MUDOU: v% fonte %',
      v_mensal.versao, v_mensal.fonte;
  end if;

  if round(v_mrr / v_ticket_denominador_pagantes, 2) <> v_ticket then
    raise exception 'TICKET_AGOSTO_RECREIO_334_EQUACAO_INVALIDA';
  end if;

  v_financeiro_ticket := coalesce(
    v_exec.payload->'financeiro_ticket_contratual', '{}'::jsonb
  ) || jsonb_build_object(
    'ticket_medio', v_ticket,
    'mrr_contratual', v_mrr,
    'faturamento_previsto', v_mrr,
    'ticket_denominador_pagantes', v_ticket_denominador_pagantes,
    'alunos_pagantes_canonicos', v_ticket_denominador_pagantes,
    'alunos_pagantes_administrativos', v_pagantes_administrativos,
    'fonte', 'fechamento_agosto_2026_recreio_334_pagantes_confirmados'
  );

  v_financeiro_totais := coalesce(
    v_gerencial.payload#>'{financeiro_faturas_emusys,totais}', '{}'::jsonb
  ) || jsonb_build_object(
    'ticket_medio', v_ticket,
    'ticket_medio_previsto', v_ticket,
    'faturamento_previsto', v_mrr,
    'ticket_denominador_pagantes', v_ticket_denominador_pagantes,
    'alunos_pagantes_canonicos', v_ticket_denominador_pagantes,
    'regra_ticket_medio',
      'competencia fechada: receita contratual com pagas e inadimplentes / 334 pagantes confirmados'
  );

  -- O payload novo nao pode carregar a retificacao anterior como se 325 ainda
  -- fosse o valor vigente. Os snapshots antigos preservam a evidencia original;
  -- nas novas versoes o mesmo bloco fica marcado como superado e reconciliado.
  v_retificacao_ticket := coalesce(
    v_exec.payload->'retificacao_ticket_agosto_2026', '{}'::jsonb
  ) || jsonb_build_object(
    'superseded', true,
    'superseded_by', 'correcao_ticket_agosto_2026_recreio_334_pagantes_v1',
    'ticket_denominador_pagantes', v_ticket_denominador_pagantes,
    'ticket_medio', v_ticket
  );

  v_exec_new := v_exec.payload || jsonb_build_object(
    'ticket_medio', v_ticket,
    'ticket_denominador_pagantes', v_ticket_denominador_pagantes,
    'financeiro_ticket_contratual', v_financeiro_ticket,
    'retificacao_ticket_agosto_2026', v_retificacao_ticket,
    'correcao_ticket_agosto_2026', jsonb_build_object(
      'motivo', 'denominador 325 era anterior a reposicao de nove pagantes no fechamento de agosto',
      'mrr_contratual', v_mrr,
      'alunos_pagantes_administrativos', v_pagantes_administrativos,
      'ticket_denominador_pagantes', v_ticket_denominador_pagantes,
      'ticket_medio', v_ticket,
      'confirmado_em', '2026-09-08'
    )
  );

  insert into public.fechamento_mensal_snapshots (
    ano, mes, escopo, unidade_id, dominio, versao, status,
    fonte, payload, payload_hash, financeiro_realizado_disponivel,
    observacao, capturado_em, capturado_por,
    aprovado_em, aprovado_por, fechado_em, fechado_por
  ) values (
    2026, 8, 'unidade', v_unidade_id, 'alunos_executivo', v_exec.versao + 1, 'fechado',
    'correcao_ticket_agosto_2026_recreio_334_pagantes_v1',
    v_exec_new, public.hash_jsonb_canonico(v_exec_new),
    v_exec.financeiro_realizado_disponivel,
    format('correcao append-only; snapshot anterior: %s', v_exec.id),
    v_exec.capturado_em, v_exec.capturado_por,
    now(), auth.uid(), now(), auth.uid()
  ) returning id, payload_hash into v_exec_id, v_exec_hash;

  v_gerencial_new := v_gerencial.payload || jsonb_build_object(
    'financeiro_ticket_contratual', v_financeiro_ticket,
    'retificacao_ticket_agosto_2026', v_retificacao_ticket,
    'correcao_ticket_agosto_2026', v_exec_new->'correcao_ticket_agosto_2026'
  );
  v_gerencial_new := jsonb_set(
    v_gerencial_new,
    '{financeiro_faturas_emusys,totais}',
    v_financeiro_totais,
    true
  );

  v_bloco := v_gerencial_new#>'{kpis_gestao,0}' || jsonb_build_object(
    'ticket_medio', v_ticket,
    'ticket_denominador_pagantes', v_ticket_denominador_pagantes,
    'alunos_pagantes_canonicos', v_ticket_denominador_pagantes,
    'alunos_pagantes_administrativos', v_pagantes_administrativos
  );
  v_bloco := jsonb_set(v_bloco, '{financeiro_faturas_emusys}', v_financeiro_totais, true);
  v_gerencial_new := jsonb_set(v_gerencial_new, '{kpis_gestao,0}', v_bloco, true);

  v_bloco := v_gerencial_new#>'{dados_mes_atual,0}' || jsonb_build_object(
    'ticket_medio', v_ticket,
    'ticket_denominador_pagantes', v_ticket_denominador_pagantes,
    'alunos_pagantes_canonicos', v_ticket_denominador_pagantes,
    'alunos_pagantes_administrativos', v_pagantes_administrativos
  );
  v_gerencial_new := jsonb_set(v_gerencial_new, '{dados_mes_atual,0}', v_bloco, true);

  v_bloco := v_gerencial_new#>'{kpis_alunos_canonicos,totais}' || jsonb_build_object(
    'ticket_medio', v_ticket,
    'ticket_denominador_pagantes', v_ticket_denominador_pagantes,
    'alunos_pagantes_canonicos', v_ticket_denominador_pagantes,
    'alunos_pagantes_administrativos', v_pagantes_administrativos
  );
  v_gerencial_new := jsonb_set(
    v_gerencial_new, '{kpis_alunos_canonicos,totais}', v_bloco, true
  );

  v_bloco := v_gerencial_new#>'{kpis_alunos_canonicos,por_unidade,0}' || jsonb_build_object(
    'ticket_medio', v_ticket,
    'ticket_denominador_pagantes', v_ticket_denominador_pagantes,
    'alunos_pagantes_canonicos', v_ticket_denominador_pagantes,
    'alunos_pagantes_administrativos', v_pagantes_administrativos
  );
  v_gerencial_new := jsonb_set(
    v_gerencial_new, '{kpis_alunos_canonicos,por_unidade,0}', v_bloco, true
  );

  insert into public.fechamento_mensal_snapshots (
    ano, mes, escopo, unidade_id, dominio, versao, status,
    fonte, payload, payload_hash, financeiro_realizado_disponivel,
    observacao, capturado_em, capturado_por,
    aprovado_em, aprovado_por, fechado_em, fechado_por
  ) values (
    2026, 8, 'unidade', v_unidade_id, 'relatorio_gerencial',
    v_gerencial.versao + 1, 'fechado',
    'correcao_ticket_agosto_2026_recreio_334_pagantes_v1',
    v_gerencial_new, public.hash_jsonb_canonico(v_gerencial_new),
    v_gerencial.financeiro_realizado_disponivel,
    format('correcao append-only; snapshot anterior: %s', v_gerencial.id),
    v_gerencial.capturado_em, v_gerencial.capturado_por,
    now(), auth.uid(), now(), auth.uid()
  ) returning id, payload_hash into v_gerencial_id, v_gerencial_hash;

  v_resumo := coalesce(v_mensal.payload->'resumo', '{}'::jsonb) || jsonb_build_object(
    'alunos_ativos', v_ativos,
    'alunos_pagantes', v_pagantes_administrativos,
    'matriculas_ativas', v_matriculas,
    'ticket_medio', v_ticket,
    'ticket_denominador_pagantes', v_ticket_denominador_pagantes,
    'faturamento_previsto', v_mrr
  );
  v_fontes := coalesce(v_mensal.payload->'fontes', '{}'::jsonb);
  v_fontes := jsonb_set(
    v_fontes,
    '{relatorio_gerencial}',
    jsonb_build_object(
      'snapshot_id', v_gerencial_id,
      'payload_hash', v_gerencial_hash
    ),
    true
  );
  v_fontes := jsonb_set(
    v_fontes, '{financeiro_ticket_contratual}', v_financeiro_ticket, true
  );
  v_mensal_new := jsonb_set(v_mensal.payload, '{resumo}', v_resumo, true);
  v_mensal_new := jsonb_set(v_mensal_new, '{fontes}', v_fontes, true);
  v_mensal_new := v_mensal_new || jsonb_build_object(
    'retificacao_ticket_agosto_2026', v_retificacao_ticket,
    'correcao_ticket_agosto_2026', v_exec_new->'correcao_ticket_agosto_2026'
  );

  insert into public.fechamento_mensal_snapshots (
    ano, mes, escopo, unidade_id, dominio, versao, status,
    fonte, payload, payload_hash, financeiro_realizado_disponivel,
    observacao, capturado_em, capturado_por,
    aprovado_em, aprovado_por, fechado_em, fechado_por
  ) values (
    2026, 8, 'unidade', v_unidade_id, 'relatorio_admin_mensal',
    v_mensal.versao + 1, 'fechado',
    'correcao_ticket_agosto_2026_recreio_334_pagantes_v1',
    v_mensal_new, public.hash_jsonb_canonico(v_mensal_new),
    v_mensal.financeiro_realizado_disponivel,
    format('correcao append-only; snapshot anterior: %s', v_mensal.id),
    v_mensal.capturado_em, v_mensal.capturado_por,
    now(), auth.uid(), now(), auth.uid()
  ) returning id, payload_hash into v_mensal_id, v_mensal_hash;

  insert into public.fechamento_mensal_auditoria (
    snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
  ) values
    (
      v_exec_id, 2026, 8, 'unidade', v_unidade_id, 'snapshot_gravado',
      jsonb_build_object(
        'dominio', 'alunos_executivo',
        'snapshot_anterior_id', v_exec.id,
        'payload_anterior_hash', v_exec.payload_hash,
        'mrr_contratual', v_mrr,
        'alunos_pagantes_administrativos', v_pagantes_administrativos,
        'ticket_denominador_anterior', 325,
        'ticket_denominador_pagantes', v_ticket_denominador_pagantes,
        'ticket_medio_anterior', 445.38,
        'ticket_medio', v_ticket
      ),
      auth.uid()
    ),
    (
      v_gerencial_id, 2026, 8, 'unidade', v_unidade_id, 'snapshot_gravado',
      jsonb_build_object(
        'dominio', 'relatorio_gerencial',
        'snapshot_anterior_id', v_gerencial.id,
        'payload_anterior_hash', v_gerencial.payload_hash,
        'snapshot_alunos_executivo_id', v_exec_id,
        'ticket_denominador_pagantes', v_ticket_denominador_pagantes,
        'ticket_medio', v_ticket
      ),
      auth.uid()
    ),
    (
      v_mensal_id, 2026, 8, 'unidade', v_unidade_id, 'snapshot_gravado',
      jsonb_build_object(
        'dominio', 'relatorio_admin_mensal',
        'snapshot_anterior_id', v_mensal.id,
        'payload_anterior_hash', v_mensal.payload_hash,
        'snapshot_relatorio_gerencial_id', v_gerencial_id,
        'snapshot_relatorio_gerencial_hash', v_gerencial_hash,
        'ticket_denominador_pagantes', v_ticket_denominador_pagantes,
        'ticket_medio', v_ticket
      ),
      auth.uid()
    );

  update public.dados_mensais
     set ticket_denominador_pagantes = v_ticket_denominador_pagantes,
         ticket_medio_contratual = v_ticket,
         mrr_contratual = v_mrr,
         updated_at = now()
   where unidade_id = v_unidade_id
     and ano = 2026 and mes = 8
     and alunos_ativos = v_ativos
     and alunos_pagantes = v_pagantes_administrativos
     and matriculas_ativas = v_matriculas
     and evasoes = 29
     and round(churn_rate, 2) = 8.68
     and round(ticket_medio, 2) = v_ticket
     and round(faturamento_estimado, 2) = 144748.92
     and ticket_denominador_pagantes = 325
     and round(ticket_medio_contratual, 2) = 445.38
     and round(mrr_contratual, 2) = v_mrr;
  get diagnostics v_qtd = row_count;

  if v_qtd <> 1 then
    raise exception 'TICKET_AGOSTO_RECREIO_334_DADOS_MENSAIS_INVALIDO: %/1', v_qtd;
  end if;

  insert into public.fechamento_mensal_auditoria (
    snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
  ) values (
    v_exec_id, 2026, 8, 'unidade', v_unidade_id,
    'compatibilidade_dados_mensais_atualizada',
    jsonb_build_object(
      'dados_mensais_ticket_medio_legado_preservado', v_ticket,
      'dados_mensais_faturamento_estimado_legado_preservado', 144748.92,
      'ticket_denominador_anterior', 325,
      'ticket_denominador_pagantes', v_ticket_denominador_pagantes,
      'ticket_medio_contratual_anterior', 445.38,
      'ticket_medio_contratual', v_ticket,
      'mrr_contratual', v_mrr
    ),
    auth.uid()
  );

  insert into public.automacao_log (
    aluno_nome, unidade_nome, evento, acao, detalhes,
    workflow_id, execution_id, status, created_at
  ) values (
    'Ticket agosto/2026', 'Recreio',
    'retificacao_fechamento_mensal', 'ticket_medio_corrigido',
    jsonb_build_object(
      'causa_raiz', 'denominador antigo de 325 reaplicado apos reposicao de nove pagantes',
      'mrr_contratual', v_mrr,
      'alunos_pagantes', v_pagantes_administrativos,
      'ticket_denominador_pagantes', v_ticket_denominador_pagantes,
      'ticket_medio', v_ticket,
      'snapshot_executivo_id', v_exec_id,
      'snapshot_gerencial_id', v_gerencial_id,
      'snapshot_admin_mensal_id', v_mensal_id
    ),
    'correcao_ticket_agosto_2026_recreio_334_pagantes_v1',
    now()::text,
    'ok',
    now()
  );

  -- Prova dos leitores usados para gerar os dois relatorios.
  v_rico := public.get_relatorio_admin_mensal_rico_v1(v_unidade_id, 2026, 8);
  if coalesce((v_rico#>>'{payload,resumo,alunos_ativos}')::integer, -1) <> v_ativos
     or coalesce((v_rico#>>'{payload,resumo,alunos_pagantes}')::integer, -1) <> v_pagantes_administrativos
     or coalesce((v_rico#>>'{payload,resumo,matriculas_ativas}')::integer, -1) <> v_matriculas
     or coalesce((v_rico#>>'{payload,indicadores_financeiros,ticket_denominador_pagantes}')::integer, -1) <> v_ticket_denominador_pagantes
     or round(coalesce((v_rico#>>'{payload,indicadores_financeiros,ticket_medio}')::numeric, -1), 2) <> v_ticket
     or round(coalesce((v_rico#>>'{payload,indicadores_financeiros,mrr_atual}')::numeric, -1), 2) <> v_mrr then
    raise exception 'TICKET_AGOSTO_RECREIO_334_RELATORIO_RICO_FALHOU: %', v_rico;
  end if;

  v_relatorio_gerencial := public.get_relatorio_gerencial_canonico_v1(
    v_unidade_id, 2026, 8
  );
  if coalesce((v_relatorio_gerencial#>>'{administrativo,resumo,alunos_pagantes}')::integer, -1) <> v_pagantes_administrativos
     or coalesce((v_relatorio_gerencial#>>'{administrativo,indicadores_financeiros,ticket_denominador_pagantes}')::integer, -1) <> v_ticket_denominador_pagantes
     or round(coalesce((v_relatorio_gerencial#>>'{administrativo,indicadores_financeiros,ticket_medio}')::numeric, -1), 2) <> v_ticket then
    raise exception 'TICKET_AGOSTO_RECREIO_334_RELATORIO_GERENCIAL_FALHOU: %',
      v_relatorio_gerencial;
  end if;

  v_financeiro := public.get_financeiro_faturas_emusys(v_unidade_id, 2026, 8);
  if coalesce((v_financeiro#>>'{totais,ticket_denominador_pagantes}')::integer, -1) <> v_ticket_denominador_pagantes
     or round(coalesce((v_financeiro#>>'{totais,ticket_medio}')::numeric, -1), 2) <> v_ticket
     or round(coalesce((v_financeiro#>>'{totais,faturamento_previsto}')::numeric, -1), 2) <> v_mrr then
    raise exception 'TICKET_AGOSTO_RECREIO_334_FINANCEIRO_FALHOU: %', v_financeiro;
  end if;
end;
$correcao$;

-- Prova de nao regressao nas tres unidades.
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
      ('Recreio'::text, 334, 433.38::numeric)
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
      raise exception 'TICKET_AGOSTO_2026_VALIDACAO_UNIDADE_FALHOU: %, %',
        v_esperado.unidade_nome, v_rico;
    end if;
  end loop;
end;
$validacao_tres_unidades$;

commit;
