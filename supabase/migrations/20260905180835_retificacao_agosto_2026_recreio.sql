-- Retifica o fechamento de agosto/2026 do Recreio depois da confirmacao da
-- secretaria de que nove alunos permaneceram ativos ate 31/08. O Emusys
-- publicou finalizacoes preliminares no fim de agosto e voltou a publicar as
-- finalizacoes efetivas em 04/09.
--
-- Politica desta migracao:
--   * movimentos e passagens incorretos sao anulados, nunca apagados;
--   * o estado atual dos alunos e as saidas efetivas de setembro nao mudam;
--   * snapshots fechados permanecem imutaveis e recebem novas versoes;
--   * MRR/faturas permanecem congelados; ticket e recalculado pelo denominador
--     de pagantes retificado;
--   * qualquer divergencia nas fontes medidas aborta a transacao inteira.

begin;

do $migration$
declare
  v_unidade_id uuid;
  v_qtd integer;
  v_bad_movement_ids integer[];
  v_bad_history_ids integer[];

  v_ativos constant integer := 344;
  v_pagantes constant numeric := 334;
  v_matriculas constant integer := 422;
  v_evasoes_churn constant integer := 28;
  v_evasoes_interrompidas constant integer := 22;
  v_novas_matriculas constant integer := 23;
  v_mrr constant numeric := 144749.17;
  v_ticket numeric;
  v_churn numeric;
  v_arr numeric;
  v_realizado numeric;

  v_admin public.fechamento_mensal_snapshots%rowtype;
  v_exec public.fechamento_mensal_snapshots%rowtype;
  v_gerencial public.fechamento_mensal_snapshots%rowtype;
  v_mensal public.fechamento_mensal_snapshots%rowtype;
  v_fideliza public.fechamento_mensal_snapshots%rowtype;
  v_coordenacao public.fechamento_mensal_snapshots%rowtype;

  v_admin_new jsonb;
  v_exec_new jsonb;
  v_gerencial_new jsonb;
  v_mensal_new jsonb;
  v_fideliza_new jsonb;
  v_coordenacao_new jsonb;

  v_admin_id uuid;
  v_admin_hash text;
  v_exec_id uuid;
  v_exec_hash text;
  v_gerencial_id uuid;
  v_gerencial_hash text;
  v_mensal_id uuid;
  v_mensal_hash text;
  v_fideliza_id uuid;
  v_fideliza_hash text;
  v_coordenacao_id uuid;
  v_coordenacao_hash text;

  v_financeiro jsonb;
  v_financeiro_totais jsonb;
  v_financeiro_ticket jsonb;
  v_common_patch jsonb;
  v_gestao jsonb;
  v_dados_mes jsonb;
  v_alunos_totais jsonb;
  v_alunos_unidade jsonb;
  v_retencao jsonb;
  v_motivos jsonb;
  v_evasoes_admin jsonb;
  v_resumo_admin jsonb;
  v_fontes_admin jsonb;
  v_fideliza_meses jsonb;
  v_fideliza_churn jsonb;
  v_fideliza_metricas jsonb;
  v_fideliza_farmer jsonb;
  v_coordenacao_movimentos jsonb;
  v_coordenacao_saidas jsonb;
  v_coordenacao_auditoria jsonb;
  v_rico jsonb;
  v_relatorio_gerencial jsonb;
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);

  select max(id::text)::uuid, count(*)::integer
    into v_unidade_id, v_qtd
  from public.unidades
  where lower(btrim(nome)) = 'recreio';

  if v_qtd <> 1 or v_unidade_id is null then
    raise exception 'RETIFICACAO_AGOSTO_RECREIO_UNIDADE_INVALIDA: %', v_qtd;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('retificacao_agosto_2026_recreio|' || v_unidade_id::text, 0)
  );

  -- Os IDs externos abaixo sao por unidade. A combinacao unidade + matricula
  -- precisa resolver exatamente os nove vinculos confirmados pela secretaria.
  with esperados(nome, matricula_id) as (
    values
      ('Caetano Leao Barradas', '425'),
      ('Abraão Teles Seabra', '1440'),
      ('David Kayat A. Mansour', '1350'),
      ('Gabriel Ferreira Marques Machado', '1458'),
      ('Sara Ferreira Machado', '1459'),
      ('Isabella Boscardini Moreira', '472'),
      ('Lara Carvalho Rocha', '1384'),
      ('Olivia Carvalho Rocha', '1383'),
      ('Lucas Tavares de Mello Costa', '1463')
  )
  select count(*)::integer
    into v_qtd
  from esperados e
  join public.alunos a
    on a.unidade_id = v_unidade_id
   and a.arquivado_em is null
   and btrim(a.emusys_matricula_id) = e.matricula_id
   and lower(btrim(a.nome)) = lower(btrim(e.nome));

  if v_qtd <> 9 then
    raise exception 'RETIFICACAO_AGOSTO_RECREIO_IDENTIDADE_INVALIDA: %/9', v_qtd;
  end if;

  -- Oito eventos preliminares viraram movimentos de agosto. David nao ganhou
  -- movimento regular porque a deduplicacao antiga colidiu com sua banda.
  with esperados(nome, matricula_id, data_preliminar) as (
    values
      ('Caetano Leao Barradas', '425', date '2026-08-31'),
      ('Abraão Teles Seabra', '1440', date '2026-08-29'),
      ('Gabriel Ferreira Marques Machado', '1458', date '2026-08-29'),
      ('Sara Ferreira Machado', '1459', date '2026-08-29'),
      ('Isabella Boscardini Moreira', '472', date '2026-08-29'),
      ('Lara Carvalho Rocha', '1384', date '2026-08-29'),
      ('Olivia Carvalho Rocha', '1383', date '2026-08-29'),
      ('Lucas Tavares de Mello Costa', '1463', date '2026-08-29')
  )
  select count(*)::integer, array_agg(m.id order by m.id)
    into v_qtd, v_bad_movement_ids
  from esperados e
  join public.alunos a
    on a.unidade_id = v_unidade_id
   and a.arquivado_em is null
   and btrim(a.emusys_matricula_id) = e.matricula_id
  join public.movimentacoes_admin m
    on m.unidade_id = v_unidade_id
   and m.aluno_id = a.id
   and m.tipo = 'evasao'
   and m.data = e.data_preliminar
   and m.competencia_referencia = date '2026-08-01'
   and m.anulado is false;

  if v_qtd <> 8 or cardinality(v_bad_movement_ids) <> 8 then
    raise exception 'RETIFICACAO_AGOSTO_RECREIO_SAIDAS_PRELIMINARES_INVALIDAS: %/8', v_qtd;
  end if;

  -- As nove saidas efetivas precisam existir em setembro antes de anular a
  -- competencia preliminar. Assim a retificacao nunca apaga uma saida real.
  with esperados(matricula_id) as (
    values ('425'), ('1440'), ('1350'), ('1458'), ('1459'),
           ('472'), ('1384'), ('1383'), ('1463')
  )
  select count(*)::integer
    into v_qtd
  from esperados e
  join public.alunos a
    on a.unidade_id = v_unidade_id
   and a.arquivado_em is null
   and btrim(a.emusys_matricula_id) = e.matricula_id
  join public.movimentacoes_admin m
    on m.unidade_id = v_unidade_id
   and m.aluno_id = a.id
   and m.tipo = 'evasao'
   and m.data = date '2026-09-04'
   and m.competencia_referencia = date '2026-09-01'
   and m.anulado is false;

  if v_qtd <> 9 then
    raise exception 'RETIFICACAO_AGOSTO_RECREIO_SAIDAS_SETEMBRO_INVALIDAS: %/9', v_qtd;
  end if;

  -- A saida de GarageBand do David e outra matricula e deve sobreviver.
  select count(*)::integer
    into v_qtd
  from public.movimentacoes_admin m
  join public.alunos a on a.id = m.aluno_id and a.unidade_id = m.unidade_id
  where m.unidade_id = v_unidade_id
    and btrim(a.emusys_matricula_id) = '1433'
    and m.tipo = 'evasao'
    and m.data = date '2026-08-25'
    and m.anulado is false;

  if v_qtd <> 1 then
    raise exception 'RETIFICACAO_AGOSTO_RECREIO_BANDA_DAVID_INVALIDA: %/1', v_qtd;
  end if;

  -- Seis alunos tinham tempo suficiente para gerar passagem historica no
  -- primeiro evento. Os tres vinculos recentes nao geraram passagem.
  with esperados(nome, data_preliminar) as (
    values
      ('Caetano Leao Barradas', date '2026-08-31'),
      ('Abraão Teles Seabra', date '2026-08-29'),
      ('David Kayat A. Mansour', date '2026-08-29'),
      ('Isabella Boscardini Moreira', date '2026-08-29'),
      ('Lara Carvalho Rocha', date '2026-08-29'),
      ('Olivia Carvalho Rocha', date '2026-08-29')
  )
  select count(*)::integer, array_agg(h.id order by h.id)
    into v_qtd, v_bad_history_ids
  from esperados e
  join public.alunos_historico h
    on h.unidade_id = v_unidade_id
   and lower(btrim(h.nome)) = lower(btrim(e.nome))
   and h.data_saida = e.data_preliminar
   and h.anulado is false;

  if v_qtd <> 6 or cardinality(v_bad_history_ids) <> 6 then
    raise exception 'RETIFICACAO_AGOSTO_RECREIO_HISTORICO_INVALIDO: %/6', v_qtd;
  end if;

  -- Falha fechada sobre as seis versoes que serao derivadas.
  select * into v_admin
  from public.fechamento_mensal_snapshots s
  where s.ano = 2026 and s.mes = 8 and s.escopo = 'unidade'
    and s.unidade_id = v_unidade_id and s.dominio = 'alunos_admin'
    and s.status = 'fechado'
  order by s.versao desc, s.created_at desc limit 1;
  if v_admin.payload_hash <> 'c1bf3681cdcdf6c81366875d2fcdb6efe0998b18ec1b5ddc07f103146a6d30b6'
     or public.hash_jsonb_canonico(v_admin.payload) <> v_admin.payload_hash then
    raise exception 'RETIFICACAO_AGOSTO_RECREIO_FONTE_ALUNOS_ADMIN_MUDOU';
  end if;

  select * into v_exec
  from public.fechamento_mensal_snapshots s
  where s.ano = 2026 and s.mes = 8 and s.escopo = 'unidade'
    and s.unidade_id = v_unidade_id and s.dominio = 'alunos_executivo'
    and s.status = 'fechado'
  order by s.versao desc, s.created_at desc limit 1;
  if v_exec.payload_hash <> '2a4cc45323c26fe4ce3a15eb63190b48aa2b0cf5ab0afa7c052949b1dcf0a95c'
     or public.hash_jsonb_canonico(v_exec.payload) <> v_exec.payload_hash then
    raise exception 'RETIFICACAO_AGOSTO_RECREIO_FONTE_ALUNOS_EXECUTIVO_MUDOU';
  end if;

  select * into v_gerencial
  from public.fechamento_mensal_snapshots s
  where s.ano = 2026 and s.mes = 8 and s.escopo = 'unidade'
    and s.unidade_id = v_unidade_id and s.dominio = 'relatorio_gerencial'
    and s.status = 'fechado'
  order by s.versao desc, s.created_at desc limit 1;
  if v_gerencial.payload_hash <> '7e2e5ce45f923dea30dcc16d24434f0a245a24206a78d1816c870f799f69f949'
     or public.hash_jsonb_canonico(v_gerencial.payload) <> v_gerencial.payload_hash then
    raise exception 'RETIFICACAO_AGOSTO_RECREIO_FONTE_GERENCIAL_MUDOU';
  end if;

  select * into v_mensal
  from public.fechamento_mensal_snapshots s
  where s.ano = 2026 and s.mes = 8 and s.escopo = 'unidade'
    and s.unidade_id = v_unidade_id and s.dominio = 'relatorio_admin_mensal'
    and s.status = 'fechado'
  order by s.versao desc, s.created_at desc limit 1;
  if v_mensal.payload_hash <> 'f6f066d8d75d64729148e7503aa015df7ca9242429d6a6e3521bc7c22c10074a'
     or public.hash_jsonb_canonico(v_mensal.payload) <> v_mensal.payload_hash then
    raise exception 'RETIFICACAO_AGOSTO_RECREIO_FONTE_ADMIN_MENSAL_MUDOU';
  end if;

  select * into v_fideliza
  from public.fechamento_mensal_snapshots s
  where s.ano = 2026 and s.mes = 8 and s.escopo = 'unidade'
    and s.unidade_id = v_unidade_id and s.dominio = 'programa_fideliza'
    and s.status = 'fechado'
  order by s.versao desc, s.created_at desc limit 1;
  if v_fideliza.payload_hash <> '18b6d7e0da0f67edcfa273b41ab75c37ac543d39fecdf9714120dadd579b3eac'
     or public.hash_jsonb_canonico(v_fideliza.payload) <> v_fideliza.payload_hash then
    raise exception 'RETIFICACAO_AGOSTO_RECREIO_FONTE_FIDELIZA_MUDOU';
  end if;

  select * into v_coordenacao
  from public.fechamento_mensal_snapshots s
  where s.ano = 2026 and s.mes = 8 and s.escopo = 'unidade'
    and s.unidade_id = v_unidade_id and s.dominio = 'relatorio_coordenacao'
    and s.status = 'fechado'
  order by s.versao desc, s.created_at desc limit 1;
  if v_coordenacao.payload_hash <> '276b2c1a29365d73a9ad03d989d644f36f42c277e0f0f71ce61a5f94116f0c60'
     or public.hash_jsonb_canonico(v_coordenacao.payload) <> v_coordenacao.payload_hash then
    raise exception 'RETIFICACAO_AGOSTO_RECREIO_FONTE_COORDENACAO_MUDOU';
  end if;

  if not exists (
    select 1 from public.dados_mensais dm
    where dm.unidade_id = v_unidade_id and dm.ano = 2026 and dm.mes = 8
      and dm.alunos_ativos = 335 and dm.alunos_pagantes = 325
      and dm.matriculas_ativas = 413 and dm.evasoes = 36
      and round(dm.churn_rate, 2) = 11.08
      and round(dm.ticket_medio, 2) = 445.38
  ) then
    raise exception 'RETIFICACAO_AGOSTO_RECREIO_DADOS_MENSAIS_MUDARAM';
  end if;

  v_financeiro := public.get_financeiro_faturas_emusys(v_unidade_id, 2026, 8);
  v_financeiro_totais := v_financeiro->'totais';
  v_realizado := nullif(v_financeiro_totais->>'mrr_atual', '')::numeric;
  if coalesce((v_financeiro->>'tem_dados')::boolean, false) is not true
     or round(coalesce((v_financeiro#>>'{totais,faturamento_previsto}')::numeric, -1), 2) <> v_mrr
     or coalesce((v_financeiro#>>'{totais,alunos_pagantes_canonicos}')::integer, -1) <> 325
     or round(coalesce(v_realizado, -1), 2) <> 143346.97 then
    raise exception 'RETIFICACAO_AGOSTO_RECREIO_FINANCEIRO_PRECONDICAO_INVALIDA';
  end if;

  v_ticket := round(v_mrr / v_pagantes, 2);
  v_churn := round(v_evasoes_churn::numeric / v_pagantes * 100, 2);
  v_arr := round(v_mrr * 12, 2);
  if v_ticket <> 433.38 or v_churn <> 8.38 then
    raise exception 'RETIFICACAO_AGOSTO_RECREIO_FORMULAS_INVALIDAS: ticket %, churn %', v_ticket, v_churn;
  end if;

  -- Completa a identidade das duas ocorrencias sem tocar em outras matriculas.
  with esperados(matricula_id) as (
    values ('425'), ('1440'), ('1350'), ('1458'), ('1459'),
           ('472'), ('1384'), ('1383'), ('1463')
  )
  update public.movimentacoes_admin m
     set emusys_matricula_id = a.emusys_matricula_id,
         origem_registro = 'webhook_emusys',
         updated_at = now()
  from public.alunos a
  join esperados e on e.matricula_id = btrim(a.emusys_matricula_id)
  where a.unidade_id = v_unidade_id
    and a.arquivado_em is null
    and m.unidade_id = a.unidade_id
    and m.aluno_id = a.id
    and m.tipo = 'evasao'
    and (
      m.id = any(v_bad_movement_ids)
      or (m.data = date '2026-09-04' and m.competencia_referencia = date '2026-09-01')
    );
  get diagnostics v_qtd = row_count;
  if v_qtd <> 17 then
    raise exception 'RETIFICACAO_AGOSTO_RECREIO_PROVENIENCIA_INVALIDA: %/17', v_qtd;
  end if;

  update public.movimentacoes_admin
     set anulado = true,
         anulado_motivo = 'Finalizacao preliminar do Emusys; saida efetiva observada em 04/09/2026',
         anulado_em = now(),
         anulado_por = 'retificacao_agosto_2026_recreio',
         updated_at = now()
   where id = any(v_bad_movement_ids)
     and unidade_id = v_unidade_id
     and data < date '2026-09-01'
     and anulado is false;
  get diagnostics v_qtd = row_count;
  if v_qtd <> 8 then
    raise exception 'RETIFICACAO_AGOSTO_RECREIO_ANULACAO_MOVIMENTOS_FALHOU: %/8', v_qtd;
  end if;

  update public.alunos_historico
     set anulado = true,
         motivo_anulacao = 'Passagem criada por finalizacao preliminar do Emusys; saida efetiva ocorreu em setembro',
         anulado_em = now(),
         anulado_por = 'retificacao_agosto_2026_recreio',
         updated_at = now()
   where id = any(v_bad_history_ids)
     and unidade_id = v_unidade_id
     and data_saida < date '2026-09-01'
     and anulado is false;
  get diagnostics v_qtd = row_count;
  if v_qtd <> 6 then
    raise exception 'RETIFICACAO_AGOSTO_RECREIO_ANULACAO_HISTORICO_FALHOU: %/6', v_qtd;
  end if;

  -- 1) Base administrativa: 344 pessoas + 52 bandas + 26 adicionais = 422.
  v_admin_new := v_admin.payload || jsonb_build_object(
    'alunos_ativos', v_ativos,
    'total_alunos_ativos', v_ativos,
    'alunos_pagantes', v_pagantes::integer,
    'total_alunos_pagantes', v_pagantes::integer,
    'matriculas_base_alunos_ativos', v_ativos,
    'matriculas_ativas', v_matriculas,
    'retificacao_agosto_2026', jsonb_build_object(
      'motivo', 'finalizacoes_preliminares do Emusys substituidas pelas saidas efetivas de setembro',
      'alunos_repostos_no_fechamento', 9,
      'movimentos_preliminares_anulados', 8
    )
  );

  insert into public.fechamento_mensal_snapshots (
    ano, mes, escopo, unidade_id, dominio, versao, status,
    fonte, payload, payload_hash, financeiro_realizado_disponivel,
    observacao, capturado_em, capturado_por,
    aprovado_em, aprovado_por, fechado_em, fechado_por
  ) values (
    2026, 8, 'unidade', v_unidade_id, 'alunos_admin', v_admin.versao + 1, 'fechado',
    'retificacao_agosto_2026_recreio_v1', v_admin_new,
    public.hash_jsonb_canonico(v_admin_new), v_admin.financeiro_realizado_disponivel,
    format('retificacao append-only; snapshot anterior: %s', v_admin.id),
    v_admin.capturado_em, v_admin.capturado_por,
    now(), auth.uid(), now(), auth.uid()
  ) returning id, payload_hash into v_admin_id, v_admin_hash;

  insert into public.fechamento_mensal_auditoria (
    snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
  ) values (
    v_admin_id, 2026, 8, 'unidade', v_unidade_id, 'snapshot_gravado',
    jsonb_build_object(
      'dominio', 'alunos_admin', 'snapshot_anterior_id', v_admin.id,
      'payload_anterior_hash', v_admin.payload_hash,
      'alunos_ativos', v_ativos, 'alunos_pagantes', v_pagantes,
      'matriculas_ativas', v_matriculas
    ), auth.uid()
  );

  v_financeiro_ticket := jsonb_build_object(
    'ticket_medio', v_ticket,
    'mrr_contratual', v_mrr,
    'faturamento_previsto', v_mrr,
    'faturamento_realizado', v_realizado,
    'alunos_pagantes_canonicos', v_pagantes::integer,
    'fonte', 'get_financeiro_faturas_emusys'
  );

  -- 2) Executivo: agrega por pessoa e usa o total canonico de churn.
  v_exec_new := v_exec.payload || jsonb_build_object(
    'alunos_ativos', v_ativos,
    'total_alunos_ativos', v_ativos,
    'alunos_pagantes', v_pagantes::integer,
    'total_alunos_pagantes', v_pagantes::integer,
    'matriculas_base_alunos_ativos', v_ativos,
    'matriculas_ativas', v_matriculas,
    'evasoes', v_evasoes_churn,
    'total_evasoes', v_evasoes_churn,
    'churn_rate', v_churn,
    'saldo_liquido', v_novas_matriculas - v_evasoes_churn,
    'ticket_medio', v_ticket,
    'mrr', v_mrr,
    'arr', v_arr,
    'faturamento_previsto', v_mrr,
    'faturamento_estimado', v_mrr,
    'faturamento_realizado', v_realizado,
    'financeiro_ticket_contratual', v_financeiro_ticket,
    'fonte', 'snapshot_retificado_agosto_2026',
    'retificacao_agosto_2026', v_admin_new->'retificacao_agosto_2026'
  );

  insert into public.fechamento_mensal_snapshots (
    ano, mes, escopo, unidade_id, dominio, versao, status,
    fonte, payload, payload_hash, financeiro_realizado_disponivel,
    observacao, capturado_em, capturado_por,
    aprovado_em, aprovado_por, fechado_em, fechado_por
  ) values (
    2026, 8, 'unidade', v_unidade_id, 'alunos_executivo', v_exec.versao + 1, 'fechado',
    'retificacao_agosto_2026_recreio_v1', v_exec_new,
    public.hash_jsonb_canonico(v_exec_new), true,
    format('retificacao append-only; snapshot anterior: %s', v_exec.id),
    v_exec.capturado_em, v_exec.capturado_por,
    now(), auth.uid(), now(), auth.uid()
  ) returning id, payload_hash into v_exec_id, v_exec_hash;

  insert into public.fechamento_mensal_auditoria (
    snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
  ) values (
    v_exec_id, 2026, 8, 'unidade', v_unidade_id, 'snapshot_gravado',
    jsonb_build_object(
      'dominio', 'alunos_executivo', 'snapshot_anterior_id', v_exec.id,
      'payload_anterior_hash', v_exec.payload_hash,
      'evasoes_churn', v_evasoes_churn, 'churn_rate', v_churn,
      'mrr_contratual', v_mrr, 'ticket_medio', v_ticket
    ), auth.uid()
  );

  -- A funcao financeira de competencia fechada relê o denominador no snapshot
  -- executivo. Por isso esta prova vem somente depois de publicar a nova versao
  -- de alunos_executivo; receita contratual, realizado e 345 faturas permanecem.
  v_financeiro := public.get_financeiro_faturas_emusys(v_unidade_id, 2026, 8);
  v_financeiro_totais := v_financeiro->'totais';
  if coalesce((v_financeiro->>'tem_dados')::boolean, false) is not true
     or round(coalesce((v_financeiro_totais->>'faturamento_previsto')::numeric, -1), 2) <> v_mrr
     or coalesce((v_financeiro_totais->>'alunos_pagantes_canonicos')::integer, -1) <> v_pagantes
     or round(coalesce((v_financeiro_totais->>'ticket_medio')::numeric, -1), 2) <> v_ticket
     or round(coalesce((v_financeiro_totais->>'mrr_atual')::numeric, -1), 2) <> v_realizado then
    raise exception 'RETIFICACAO_AGOSTO_RECREIO_FINANCEIRO_RECONCILIACAO_FALHOU';
  end if;

  -- 3) Gerencial: corrige todas as repeticoes do mesmo indicador no payload.
  v_common_patch := jsonb_build_object(
    'alunos_ativos', v_ativos,
    'total_alunos_ativos', v_ativos,
    'alunos_pagantes', v_pagantes::integer,
    'total_alunos_pagantes', v_pagantes::integer,
    'matriculas_base_alunos_ativos', v_ativos,
    'matriculas_ativas', v_matriculas,
    'evasoes', v_evasoes_churn,
    'total_evasoes', v_evasoes_churn,
    'evasoes_base_alunos', v_evasoes_interrompidas,
    'total_evasoes_label', v_evasoes_churn::text,
    'churn_rate', v_churn,
    'saldo_liquido', v_novas_matriculas - v_evasoes_churn,
    'ticket_medio', v_ticket,
    'mrr', v_mrr,
    'arr', v_arr,
    'faturamento_previsto', v_mrr,
    'faturamento_realizado', v_realizado
  );

  v_gestao := (v_gerencial.payload->'kpis_gestao'->0)
    || v_common_patch
    || jsonb_build_object('financeiro_faturas_emusys', v_financeiro_totais);
  v_dados_mes := (v_gerencial.payload->'dados_mes_atual'->0) || v_common_patch;
  v_alunos_totais := (v_gerencial.payload#>'{kpis_alunos_canonicos,totais}') || v_common_patch;
  v_alunos_unidade := (v_gerencial.payload#>'{kpis_alunos_canonicos,por_unidade,0}') || v_common_patch;
  v_retencao := (v_gerencial.payload->'kpis_retencao'->0) || jsonb_build_object(
    'evasoes_base_alunos', v_evasoes_interrompidas,
    'evasoes_interrompidas', v_evasoes_interrompidas,
    'nao_renovacoes', 6,
    'total_evasoes', v_evasoes_churn,
    'total_evasoes_label', v_evasoes_churn::text,
    'churn_rate', v_churn,
    'taxa_evasao', v_churn,
    'mrr_perdido', 11937.50
  );

  -- Motivos representam movimentos de interrupcao, nao o total de churn. Os
  -- sete movimentos preliminares que ja estavam no snapshot sao retirados.
  v_motivos := jsonb_build_array(
    jsonb_build_object('motivo', 'Saúde', 'quantidade', 5, 'percentual', 21.7),
    jsonb_build_object('motivo', 'Concluído e não vai renovar', 'quantidade', 5, 'percentual', 21.7),
    jsonb_build_object('motivo', 'Dificuldade Financeira', 'quantidade', 4, 'percentual', 17.4),
    jsonb_build_object('motivo', 'Mudança de Endereço', 'quantidade', 3, 'percentual', 13.0),
    jsonb_build_object('motivo', 'Falta de tempo', 'quantidade', 2, 'percentual', 8.7),
    jsonb_build_object('motivo', 'Incompatibilidade de Horário', 'quantidade', 1, 'percentual', 4.3),
    jsonb_build_object('motivo', 'Desistência', 'quantidade', 1, 'percentual', 4.3),
    jsonb_build_object('motivo', 'Inadimplência', 'quantidade', 1, 'percentual', 4.3),
    jsonb_build_object('motivo', 'Outros Motivos', 'quantidade', 1, 'percentual', 4.3)
  );

  v_gerencial_new := v_gerencial.payload || jsonb_build_object(
    'matriculas_ativas', v_matriculas,
    'matriculas_banda', 52,
    'matriculas_2_curso', 26,
    'financeiro_faturas_emusys', jsonb_build_object('totais', v_financeiro_totais),
    'financeiro_ticket_contratual', v_financeiro_ticket,
    'motivos_evasao', v_motivos,
    'retificacao_agosto_2026', v_admin_new->'retificacao_agosto_2026'
  );
  v_gerencial_new := jsonb_set(v_gerencial_new, '{kpis_gestao,0}', v_gestao, true);
  v_gerencial_new := jsonb_set(v_gerencial_new, '{dados_mes_atual,0}', v_dados_mes, true);
  v_gerencial_new := jsonb_set(v_gerencial_new, '{kpis_alunos_canonicos,totais}', v_alunos_totais, true);
  v_gerencial_new := jsonb_set(v_gerencial_new, '{kpis_alunos_canonicos,por_unidade,0}', v_alunos_unidade, true);
  v_gerencial_new := jsonb_set(v_gerencial_new, '{kpis_retencao,0}', v_retencao, true);

  insert into public.fechamento_mensal_snapshots (
    ano, mes, escopo, unidade_id, dominio, versao, status,
    fonte, payload, payload_hash, financeiro_realizado_disponivel,
    observacao, capturado_em, capturado_por,
    aprovado_em, aprovado_por, fechado_em, fechado_por
  ) values (
    2026, 8, 'unidade', v_unidade_id, 'relatorio_gerencial', v_gerencial.versao + 1, 'fechado',
    'retificacao_agosto_2026_recreio_v1', v_gerencial_new,
    public.hash_jsonb_canonico(v_gerencial_new), true,
    format('retificacao append-only; snapshot anterior: %s', v_gerencial.id),
    v_gerencial.capturado_em, v_gerencial.capturado_por,
    now(), auth.uid(), now(), auth.uid()
  ) returning id, payload_hash into v_gerencial_id, v_gerencial_hash;

  insert into public.fechamento_mensal_auditoria (
    snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
  ) values (
    v_gerencial_id, 2026, 8, 'unidade', v_unidade_id, 'snapshot_gravado',
    jsonb_build_object(
      'dominio', 'relatorio_gerencial', 'snapshot_anterior_id', v_gerencial.id,
      'payload_anterior_hash', v_gerencial.payload_hash,
      'alunos_ativos', v_ativos, 'alunos_pagantes', v_pagantes,
      'matriculas_ativas', v_matriculas, 'evasoes', v_evasoes_churn,
      'churn_rate', v_churn, 'ticket_medio', v_ticket
    ), auth.uid()
  );

  -- 4) Relatorio administrativo: remove somente os sete movimentos
  -- preliminares que existiam no snapshot. Caetano ocorreu depois da captura.
  select coalesce(jsonb_agg(t.item order by t.ord), '[]'::jsonb)
    into v_evasoes_admin
  from jsonb_array_elements(v_mensal.payload->'evasoes') with ordinality t(item, ord)
  where coalesce((t.item->>'id')::integer, -1) <> all(v_bad_movement_ids);

  if jsonb_array_length(v_evasoes_admin) <> 31 then
    raise exception 'RETIFICACAO_AGOSTO_RECREIO_LISTA_ADMIN_INVALIDA: %/31', jsonb_array_length(v_evasoes_admin);
  end if;

  v_resumo_admin := v_mensal.payload->'resumo' || jsonb_build_object(
    'alunos_ativos', v_ativos,
    'alunos_pagantes', v_pagantes::integer,
    'matriculas_base', v_ativos,
    'matriculas_ativas', v_matriculas,
    'evasoes', jsonb_array_length(v_evasoes_admin)
      + jsonb_array_length(coalesce(v_mensal.payload->'nao_renovacoes', '[]'::jsonb)),
    'ticket_medio', v_ticket,
    'faturamento_previsto', v_mrr,
    'faturamento_realizado', v_realizado,
    'mrr', v_realizado
  );
  v_fontes_admin := coalesce(v_mensal.payload->'fontes', '{}'::jsonb);
  v_fontes_admin := jsonb_set(
    v_fontes_admin, '{alunos_admin}',
    jsonb_build_object('snapshot_id', v_admin_id, 'payload_hash', v_admin_hash), true
  );
  v_fontes_admin := jsonb_set(
    v_fontes_admin, '{relatorio_gerencial}',
    jsonb_build_object('snapshot_id', v_gerencial_id, 'payload_hash', v_gerencial_hash), true
  );
  v_fontes_admin := jsonb_set(
    v_fontes_admin, '{financeiro_ticket_contratual}', v_financeiro_ticket, true
  );

  v_mensal_new := jsonb_set(v_mensal.payload, '{evasoes}', v_evasoes_admin, true);
  v_mensal_new := jsonb_set(v_mensal_new, '{resumo}', v_resumo_admin, true);
  v_mensal_new := jsonb_set(v_mensal_new, '{fontes}', v_fontes_admin, true);
  v_mensal_new := v_mensal_new || jsonb_build_object(
    'retificacao_agosto_2026', v_admin_new->'retificacao_agosto_2026'
  );

  insert into public.fechamento_mensal_snapshots (
    ano, mes, escopo, unidade_id, dominio, versao, status,
    fonte, payload, payload_hash, financeiro_realizado_disponivel,
    observacao, capturado_em, capturado_por,
    aprovado_em, aprovado_por, fechado_em, fechado_por
  ) values (
    2026, 8, 'unidade', v_unidade_id, 'relatorio_admin_mensal', v_mensal.versao + 1, 'fechado',
    'retificacao_agosto_2026_recreio_v1', v_mensal_new,
    public.hash_jsonb_canonico(v_mensal_new), true,
    format('retificacao append-only; snapshot anterior: %s', v_mensal.id),
    v_mensal.capturado_em, v_mensal.capturado_por,
    now(), auth.uid(), now(), auth.uid()
  ) returning id, payload_hash into v_mensal_id, v_mensal_hash;

  insert into public.fechamento_mensal_auditoria (
    snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
  ) values (
    v_mensal_id, 2026, 8, 'unidade', v_unidade_id, 'snapshot_gravado',
    jsonb_build_object(
      'dominio', 'relatorio_admin_mensal', 'snapshot_anterior_id', v_mensal.id,
      'payload_anterior_hash', v_mensal.payload_hash,
      'snapshot_alunos_admin_id', v_admin_id,
      'snapshot_relatorio_gerencial_id', v_gerencial_id,
      'evasoes_detalhadas_restantes', jsonb_array_length(v_evasoes_admin),
      'ticket_medio', v_ticket
    ), auth.uid()
  );

  -- 5) Fideliza: o snapshot trimestral carregava as mesmas oito saidas no
  -- mes 8. O denominador do mes 8 e julho (336); o do mes 9 passa a usar o
  -- fechamento retificado de agosto (334).
  if jsonb_array_length(coalesce(v_fideliza.payload->'farmers', '[]'::jsonb)) <> 1
     or coalesce((v_fideliza.payload#>>'{farmers,0,metricas,churn_bruto,evasoes}')::integer, -1) <> 42 then
    raise exception 'RETIFICACAO_AGOSTO_RECREIO_FIDELIZA_ESTRUTURA_INVALIDA';
  end if;

  select jsonb_agg(
    case (t.item->>'mes')::integer
      when 8 then t.item || jsonb_build_object('evasoes', 28, 'alunos', 336, 'taxa', 8.33)
      when 9 then t.item || jsonb_build_object('evasoes', 0, 'alunos', 334, 'taxa', 0)
      else t.item
    end
    order by t.ord
  ) into v_fideliza_meses
  from jsonb_array_elements(v_fideliza.payload#>'{farmers,0,metricas,churn_bruto,meses}')
       with ordinality t(item, ord);

  v_fideliza_churn := v_fideliza.payload#>'{farmers,0,metricas,churn_bruto}'
    || jsonb_build_object('evasoes', 34, 'alunos_base', 332, 'meses', v_fideliza_meses);
  v_fideliza_metricas := v_fideliza.payload#>'{farmers,0,metricas}'
    || jsonb_build_object('churn_rate', 3.39, 'churn_bruto', v_fideliza_churn);
  v_fideliza_farmer := v_fideliza.payload->'farmers'->0
    || jsonb_build_object('metricas', v_fideliza_metricas);
  v_fideliza_new := jsonb_set(v_fideliza.payload, '{farmers,0}', v_fideliza_farmer, true)
    || jsonb_build_object('retificacao_agosto_2026', v_admin_new->'retificacao_agosto_2026');

  insert into public.fechamento_mensal_snapshots (
    ano, mes, escopo, unidade_id, dominio, versao, status,
    fonte, payload, payload_hash, financeiro_realizado_disponivel,
    observacao, capturado_em, capturado_por,
    aprovado_em, aprovado_por, fechado_em, fechado_por
  ) values (
    2026, 8, 'unidade', v_unidade_id, 'programa_fideliza', v_fideliza.versao + 1, 'fechado',
    'retificacao_agosto_2026_recreio_v1', v_fideliza_new,
    public.hash_jsonb_canonico(v_fideliza_new), v_fideliza.financeiro_realizado_disponivel,
    format('retificacao append-only; snapshot anterior: %s', v_fideliza.id),
    v_fideliza.capturado_em, v_fideliza.capturado_por,
    now(), auth.uid(), now(), auth.uid()
  ) returning id, payload_hash into v_fideliza_id, v_fideliza_hash;

  insert into public.fechamento_mensal_auditoria (
    snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
  ) values (
    v_fideliza_id, 2026, 8, 'unidade', v_unidade_id, 'snapshot_gravado',
    jsonb_build_object(
      'dominio', 'programa_fideliza', 'snapshot_anterior_id', v_fideliza.id,
      'payload_anterior_hash', v_fideliza.payload_hash,
      'evasoes_agosto', 28, 'denominador_agosto', 336, 'taxa_agosto', 8.33
    ), auth.uid()
  );

  -- 6) Coordenacao: remove as oito ocorrencias preliminares da lista
  -- operacional. Nenhuma delas contava para score de professor.
  if coalesce((v_coordenacao.payload#>>'{saidas_retencao,evasoes_validas}')::integer, -1) <> 31
     or coalesce((v_coordenacao.payload#>>'{saidas_retencao,saidas_validas_total}')::integer, -1) <> 37
     or round(coalesce((v_coordenacao.payload#>>'{saidas_retencao,mrr_perdido_total}')::numeric, -1), 2) <> 15312.67 then
    raise exception 'RETIFICACAO_AGOSTO_RECREIO_COORDENACAO_ESTRUTURA_INVALIDA';
  end if;

  select coalesce(jsonb_agg(t.item order by t.ord), '[]'::jsonb)
    into v_coordenacao_movimentos
  from jsonb_array_elements(v_coordenacao.payload#>'{saidas_retencao,movimentos}')
       with ordinality t(item, ord)
  where coalesce((t.item->>'id')::integer, -1) <> all(v_bad_movement_ids);

  if jsonb_array_length(v_coordenacao_movimentos) <> 29 then
    raise exception 'RETIFICACAO_AGOSTO_RECREIO_COORDENACAO_LISTA_INVALIDA: %/29',
      jsonb_array_length(v_coordenacao_movimentos);
  end if;

  v_coordenacao_saidas := v_coordenacao.payload->'saidas_retencao' || jsonb_build_object(
    'movimentos', v_coordenacao_movimentos,
    'evasoes_validas', 23,
    'nao_renovacoes_validas', 6,
    'saidas_validas_total', 29,
    'mrr_perdido_total', 11937.50
  );
  v_coordenacao_auditoria := coalesce(v_coordenacao.payload->'auditoria', '{}'::jsonb)
    || jsonb_build_object(
      'retificacao_agosto_2026', jsonb_build_object(
        'movimentos_preliminares_removidos', 8,
        'score_professor_afetado', false
      )
    );
  v_coordenacao_new := jsonb_set(
    v_coordenacao.payload, '{saidas_retencao}', v_coordenacao_saidas, true
  );
  v_coordenacao_new := jsonb_set(
    v_coordenacao_new, '{auditoria}', v_coordenacao_auditoria, true
  );

  insert into public.fechamento_mensal_snapshots (
    ano, mes, escopo, unidade_id, dominio, versao, status,
    fonte, payload, payload_hash, financeiro_realizado_disponivel,
    observacao, capturado_em, capturado_por,
    aprovado_em, aprovado_por, fechado_em, fechado_por
  ) values (
    2026, 8, 'unidade', v_unidade_id, 'relatorio_coordenacao', v_coordenacao.versao + 1, 'fechado',
    'retificacao_agosto_2026_recreio_v1', v_coordenacao_new,
    public.hash_jsonb_canonico(v_coordenacao_new), v_coordenacao.financeiro_realizado_disponivel,
    format('retificacao append-only; snapshot anterior: %s', v_coordenacao.id),
    v_coordenacao.capturado_em, v_coordenacao.capturado_por,
    now(), auth.uid(), now(), auth.uid()
  ) returning id, payload_hash into v_coordenacao_id, v_coordenacao_hash;

  insert into public.fechamento_mensal_auditoria (
    snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
  ) values (
    v_coordenacao_id, 2026, 8, 'unidade', v_unidade_id, 'snapshot_gravado',
    jsonb_build_object(
      'dominio', 'relatorio_coordenacao', 'snapshot_anterior_id', v_coordenacao.id,
      'payload_anterior_hash', v_coordenacao.payload_hash,
      'saidas_validas_restantes', 29, 'mrr_perdido_restante', 11937.50
    ), auth.uid()
  );

  -- Compatibilidade historica usada pelos cards de Gestao Mensal.
  update public.dados_mensais
     set alunos_ativos = v_ativos,
         alunos_pagantes = v_pagantes::integer,
         matriculas_ativas = v_matriculas,
         evasoes = v_evasoes_churn,
         churn_rate = v_churn,
         ticket_medio = v_ticket,
         updated_at = now()
   where unidade_id = v_unidade_id
     and ano = 2026 and mes = 8
     and alunos_ativos = 335 and alunos_pagantes = 325
     and matriculas_ativas = 413 and evasoes = 36
     and round(churn_rate, 2) = 11.08
     and round(ticket_medio, 2) = 445.38;
  get diagnostics v_qtd = row_count;
  if v_qtd <> 1 then
    raise exception 'RETIFICACAO_AGOSTO_RECREIO_DADOS_MENSAIS_UPDATE_INVALIDO: %/1', v_qtd;
  end if;

  -- faturamento_estimado e coluna gerada (pagantes * ticket_medio) e, por
  -- arredondar o ticket em centavos, nao substitui o MRR contratual congelado.
  if not exists (
    select 1
    from public.dados_mensais dm
    where dm.unidade_id = v_unidade_id
      and dm.ano = 2026 and dm.mes = 8
      and dm.faturamento_estimado = round(v_pagantes * v_ticket, 2)
      and dm.faturamento_estimado = 144748.92
      and dm.saldo_liquido = v_novas_matriculas - v_evasoes_churn
      and dm.saldo_liquido = -5
  ) then
    raise exception 'RETIFICACAO_AGOSTO_RECREIO_FATURAMENTO_GERADO_INVALIDO';
  end if;

  insert into public.fechamento_mensal_auditoria (
    snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
  ) values (
    v_exec_id, 2026, 8, 'unidade', v_unidade_id,
    'compatibilidade_dados_mensais_atualizada',
    jsonb_build_object(
      'alunos_ativos', v_ativos, 'alunos_pagantes', v_pagantes,
      'matriculas_ativas', v_matriculas, 'evasoes', v_evasoes_churn,
      'churn_rate', v_churn,
      'mrr_contratual_snapshot', v_mrr,
      'ticket_medio', v_ticket,
      'faturamento_estimado_gerado', round(v_pagantes * v_ticket, 2),
      'saldo_liquido_gerado', v_novas_matriculas - v_evasoes_churn
    ), auth.uid()
  );

  insert into public.automacao_log (
    aluno_nome, unidade_nome, evento, acao, detalhes,
    workflow_id, execution_id, status, created_at
  ) values (
    'Retificação agosto/2026 — Recreio', 'Recreio',
    'retificacao_fechamento_mensal', 'finalizacoes_preliminares_reclassificadas',
    jsonb_build_object(
      'unidade_id', v_unidade_id,
      'movimentacoes_anuladas', to_jsonb(v_bad_movement_ids),
      'historicos_anulados', to_jsonb(v_bad_history_ids),
      'saidas_setembro_preservadas', 9,
      'snapshot_alunos_admin_id', v_admin_id,
      'snapshot_alunos_executivo_id', v_exec_id,
      'snapshot_gerencial_id', v_gerencial_id,
      'snapshot_admin_mensal_id', v_mensal_id,
      'snapshot_fideliza_id', v_fideliza_id,
      'snapshot_coordenacao_id', v_coordenacao_id
    ),
    'retificacao_agosto_2026_recreio_v1', now()::text, 'ok', now()
  );

  -- Validacao end-to-end dos leitores usados pelos dois relatorios.
  v_rico := public.get_relatorio_admin_mensal_rico_v1(v_unidade_id, 2026, 8);
  if coalesce((v_rico#>>'{payload,resumo,alunos_ativos}')::integer, -1) <> v_ativos
     or coalesce((v_rico#>>'{payload,resumo,alunos_pagantes}')::integer, -1) <> v_pagantes
     or coalesce((v_rico#>>'{payload,resumo,matriculas_ativas}')::integer, -1) <> v_matriculas
     or round(coalesce((v_rico#>>'{payload,indicadores_retencao,churn_rate}')::numeric, -1), 2) <> v_churn
     or round(coalesce((v_rico#>>'{payload,indicadores_financeiros,ticket_medio}')::numeric, -1), 2) <> v_ticket
     or round(coalesce((v_rico#>>'{payload,indicadores_financeiros,faturamento_previsto}')::numeric, -1), 2) <> v_mrr then
    raise exception 'RELATORIO_AGOSTO_RECREIO_VALIDACAO_RICO_FALHOU: %', v_rico;
  end if;

  v_relatorio_gerencial := public.get_relatorio_gerencial_canonico_v1(v_unidade_id, 2026, 8);
  if coalesce((v_relatorio_gerencial#>>'{administrativo,resumo,alunos_ativos}')::integer, -1) <> v_ativos
     or coalesce((v_relatorio_gerencial#>>'{administrativo,resumo,alunos_pagantes}')::integer, -1) <> v_pagantes
     or coalesce((v_relatorio_gerencial#>>'{administrativo,resumo,matriculas_ativas}')::integer, -1) <> v_matriculas
     or round(coalesce((v_relatorio_gerencial#>>'{administrativo,indicadores_retencao,churn_rate}')::numeric, -1), 2) <> v_churn
     or round(coalesce((v_relatorio_gerencial#>>'{administrativo,indicadores_financeiros,ticket_medio}')::numeric, -1), 2) <> v_ticket then
    raise exception 'RELATORIO_AGOSTO_RECREIO_VALIDACAO_GERENCIAL_FALHOU: %', v_relatorio_gerencial;
  end if;

  if not exists (
    select 1
    from public.movimentacoes_admin m
    join public.alunos a on a.id = m.aluno_id and a.unidade_id = m.unidade_id
    where m.unidade_id = v_unidade_id
      and btrim(a.emusys_matricula_id) = '1433'
      and m.data = date '2026-08-25'
      and m.anulado is false
  ) then
    raise exception 'RELATORIO_AGOSTO_RECREIO_VALIDACAO_BANDA_DAVID_FALHOU';
  end if;
end;
$migration$;

commit;
