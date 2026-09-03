-- Fecha a última invariável do leitor rico de relatório administrativo.
-- O ticket de agosto/Recreio é receita contratual / 325 pagantes fechados;
-- logo o mrr canônico que o leitor usa precisa carregar a mesma receita.

do $migration$
declare
  v_unidade_id constant uuid := '95553e96-971b-4590-a6eb-0201d013c14d'::uuid;
  v_financeiro jsonb;
  v_totais jsonb;
  v_ticket numeric;
  v_faturamento numeric;
  v_realizado numeric;
  v_pagantes numeric;

  v_exec public.fechamento_mensal_snapshots%rowtype;
  v_gerencial public.fechamento_mensal_snapshots%rowtype;
  v_admin public.fechamento_mensal_snapshots%rowtype;
  v_exec_id uuid;
  v_exec_hash text;
  v_gerencial_id uuid;
  v_gerencial_hash text;
  v_admin_id uuid;
  v_payload jsonb;
  v_gestao jsonb;
  v_kpis_alunos jsonb;
  v_resumo jsonb;
  v_fontes jsonb;
  v_rico jsonb;
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);

  v_financeiro := public.get_financeiro_faturas_emusys(v_unidade_id, 2026, 8);
  if coalesce((v_financeiro->>'tem_dados')::boolean, false) is not true then
    raise exception 'TICKET_MEDIO_RICO_FONTE_INDISPONIVEL';
  end if;

  v_totais := v_financeiro->'totais';
  v_ticket := nullif(v_totais->>'ticket_medio', '')::numeric;
  v_faturamento := nullif(v_totais->>'faturamento_previsto', '')::numeric;
  v_realizado := nullif(v_totais->>'mrr_atual', '')::numeric;
  v_pagantes := nullif(v_totais->>'alunos_pagantes_canonicos', '')::numeric;

  if v_ticket is null or v_faturamento is null or v_realizado is null
     or v_pagantes is null or v_pagantes <= 0
     or round(v_faturamento / v_pagantes, 2) <> round(v_ticket, 2)
     or round(v_ticket, 2) <> 445.38
     or round(v_faturamento, 2) <> 144749.17 then
    raise exception 'TICKET_MEDIO_RICO_PRECONDICAO_INVALIDA';
  end if;

  select *
  into v_exec
  from public.fechamento_mensal_snapshots s
  where s.ano = 2026 and s.mes = 8 and s.escopo = 'unidade'
    and s.unidade_id = v_unidade_id
    and s.dominio = 'alunos_executivo' and s.status = 'fechado'
  order by s.versao desc, s.created_at desc
  limit 1;

  if v_exec.id is null then
    raise exception 'TICKET_MEDIO_RICO_SNAPSHOT_EXECUTIVO_AUSENTE';
  end if;

  if coalesce((v_exec.payload->>'ticket_medio')::numeric, -1) = v_ticket
     and coalesce((v_exec.payload->>'mrr')::numeric, -1) = v_faturamento then
    v_exec_id := v_exec.id;
    v_exec_hash := v_exec.payload_hash;
  else
    v_payload := v_exec.payload || jsonb_build_object(
      'ticket_medio', v_ticket,
      'mrr', v_faturamento,
      'faturamento_previsto', v_faturamento,
      'faturamento_estimado', v_faturamento,
      'financeiro_ticket_contratual', jsonb_build_object(
        'ticket_medio', v_ticket,
        'mrr_contratual', v_faturamento,
        'faturamento_previsto', v_faturamento,
        'alunos_pagantes_canonicos', v_pagantes,
        'fonte', 'get_financeiro_faturas_emusys'
      )
    );

    insert into public.fechamento_mensal_snapshots (
      ano, mes, escopo, unidade_id, dominio, versao, status,
      fonte, payload, payload_hash, financeiro_realizado_disponivel,
      observacao, capturado_em, capturado_por,
      aprovado_em, aprovado_por, fechado_em, fechado_por
    )
    values (
      2026, 8, 'unidade', v_unidade_id, 'alunos_executivo', v_exec.versao + 1, 'fechado',
      'retificacao_ticket_medio_relatorio_rico_v1',
      v_payload, public.hash_jsonb_canonico(v_payload), v_exec.financeiro_realizado_disponivel,
      format('mrr contratual alinhado ao ticket; snapshot anterior: %s', v_exec.id),
      v_exec.capturado_em, auth.uid(), now(), auth.uid(), now(), auth.uid()
    )
    returning id, payload_hash into v_exec_id, v_exec_hash;

    insert into public.fechamento_mensal_auditoria (
      snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
    )
    values (
      v_exec_id, 2026, 8, 'unidade', v_unidade_id, 'snapshot_gravado',
      jsonb_build_object(
        'dominio', 'alunos_executivo',
        'snapshot_anterior_id', v_exec.id,
        'mrr_anterior', v_exec.payload->'mrr',
        'mrr_contratual_novo', v_faturamento,
        'ticket_medio_novo', v_ticket
      ),
      auth.uid()
    );
  end if;

  select *
  into v_gerencial
  from public.fechamento_mensal_snapshots s
  where s.ano = 2026 and s.mes = 8 and s.escopo = 'unidade'
    and s.unidade_id = v_unidade_id
    and s.dominio = 'relatorio_gerencial' and s.status = 'fechado'
  order by s.versao desc, s.created_at desc
  limit 1;

  if v_gerencial.id is null
     or jsonb_typeof(v_gerencial.payload->'kpis_gestao') <> 'array'
     or v_gerencial.payload->'kpis_gestao'->0 is null
     or jsonb_typeof(v_gerencial.payload->'kpis_alunos_canonicos'->'totais') <> 'object' then
    raise exception 'TICKET_MEDIO_RICO_SNAPSHOT_GERENCIAL_INVALIDO';
  end if;

  if coalesce((v_gerencial.payload #>> '{kpis_alunos_canonicos,totais,ticket_medio}')::numeric, -1) = v_ticket
     and coalesce((v_gerencial.payload #>> '{kpis_alunos_canonicos,totais,mrr}')::numeric, -1) = v_faturamento then
    v_gerencial_id := v_gerencial.id;
    v_gerencial_hash := v_gerencial.payload_hash;
  else
    v_gestao := v_gerencial.payload->'kpis_gestao'->0 || jsonb_build_object(
      'ticket_medio', v_ticket,
      'mrr', v_faturamento,
      'faturamento_previsto', v_faturamento,
      'faturamento_realizado', v_realizado,
      'financeiro_faturas_emusys', v_totais
    );
    v_kpis_alunos := v_gerencial.payload #> '{kpis_alunos_canonicos,totais}'
      || jsonb_build_object(
        'ticket_medio', v_ticket,
        'mrr', v_faturamento,
        'faturamento_previsto', v_faturamento,
        'faturamento_realizado', v_realizado
      );
    v_payload := jsonb_set(v_gerencial.payload, '{kpis_gestao,0}', v_gestao, true);
    v_payload := jsonb_set(v_payload, '{kpis_alunos_canonicos,totais}', v_kpis_alunos, true);
    v_payload := jsonb_set(
      v_payload,
      '{financeiro_ticket_contratual}',
      jsonb_build_object(
        'ticket_medio', v_ticket,
        'mrr_contratual', v_faturamento,
        'faturamento_previsto', v_faturamento,
        'alunos_pagantes_canonicos', v_pagantes,
        'fonte', 'get_financeiro_faturas_emusys'
      ),
      true
    );

    insert into public.fechamento_mensal_snapshots (
      ano, mes, escopo, unidade_id, dominio, versao, status,
      fonte, payload, payload_hash, financeiro_realizado_disponivel,
      observacao, capturado_em, capturado_por,
      aprovado_em, aprovado_por, fechado_em, fechado_por
    )
    values (
      2026, 8, 'unidade', v_unidade_id, 'relatorio_gerencial', v_gerencial.versao + 1, 'fechado',
      'retificacao_ticket_medio_relatorio_rico_v1',
      v_payload, public.hash_jsonb_canonico(v_payload), true,
      format('mrr contratual alinhado ao ticket; snapshot anterior: %s', v_gerencial.id),
      v_gerencial.capturado_em, auth.uid(), now(), auth.uid(), now(), auth.uid()
    )
    returning id, payload_hash into v_gerencial_id, v_gerencial_hash;

    insert into public.fechamento_mensal_auditoria (
      snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
    )
    values (
      v_gerencial_id, 2026, 8, 'unidade', v_unidade_id, 'snapshot_gravado',
      jsonb_build_object(
        'dominio', 'relatorio_gerencial',
        'snapshot_anterior_id', v_gerencial.id,
        'mrr_anterior', v_gerencial.payload #> '{kpis_alunos_canonicos,totais,mrr}',
        'mrr_contratual_novo', v_faturamento,
        'ticket_medio_novo', v_ticket
      ),
      auth.uid()
    );
  end if;

  select *
  into v_admin
  from public.fechamento_mensal_snapshots s
  where s.ano = 2026 and s.mes = 8 and s.escopo = 'unidade'
    and s.unidade_id = v_unidade_id
    and s.dominio = 'relatorio_admin_mensal' and s.status = 'fechado'
  order by s.versao desc, s.created_at desc
  limit 1;

  if v_admin.id is null then
    raise exception 'TICKET_MEDIO_RICO_SNAPSHOT_ADMIN_AUSENTE';
  end if;

  if coalesce((v_admin.payload #>> '{resumo,ticket_medio}')::numeric, -1) = v_ticket
     and v_admin.payload #>> '{fontes,relatorio_gerencial,snapshot_id}' = v_gerencial_id::text
     and v_admin.payload #>> '{fontes,relatorio_gerencial,payload_hash}' = v_gerencial_hash then
    null;
  else
    v_resumo := coalesce(v_admin.payload->'resumo', '{}'::jsonb) || jsonb_build_object(
      'ticket_medio', v_ticket,
      'faturamento_previsto', v_faturamento,
      'faturamento_realizado', v_realizado
    );
    v_fontes := coalesce(v_admin.payload->'fontes', '{}'::jsonb);
    v_fontes := jsonb_set(
      v_fontes,
      '{relatorio_gerencial}',
      jsonb_build_object('snapshot_id', v_gerencial_id, 'payload_hash', v_gerencial_hash),
      true
    );
    v_fontes := jsonb_set(
      v_fontes,
      '{financeiro_ticket_contratual}',
      jsonb_build_object(
        'ticket_medio', v_ticket,
        'mrr_contratual', v_faturamento,
        'faturamento_previsto', v_faturamento,
        'faturamento_realizado', v_realizado,
        'fonte', 'get_financeiro_faturas_emusys'
      ),
      true
    );
    v_payload := jsonb_set(v_admin.payload, '{resumo}', v_resumo, true);
    v_payload := jsonb_set(v_payload, '{fontes}', v_fontes, true);

    insert into public.fechamento_mensal_snapshots (
      ano, mes, escopo, unidade_id, dominio, versao, status,
      fonte, payload, payload_hash, financeiro_realizado_disponivel,
      observacao, capturado_em, capturado_por,
      aprovado_em, aprovado_por, fechado_em, fechado_por
    )
    values (
      2026, 8, 'unidade', v_unidade_id, 'relatorio_admin_mensal', v_admin.versao + 1, 'fechado',
      'retificacao_ticket_medio_relatorio_rico_v1',
      v_payload, public.hash_jsonb_canonico(v_payload), true,
      format('mrr contratual alinhado ao ticket; snapshot anterior: %s', v_admin.id),
      v_admin.capturado_em, auth.uid(), now(), auth.uid(), now(), auth.uid()
    )
    returning id into v_admin_id;

    insert into public.fechamento_mensal_auditoria (
      snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
    )
    values (
      v_admin_id,
      2026, 8, 'unidade', v_unidade_id, 'snapshot_gravado',
      jsonb_build_object(
        'dominio', 'relatorio_admin_mensal',
        'snapshot_anterior_id', v_admin.id,
        'snapshot_gerencial_corrigido_id', v_gerencial_id,
        'ticket_medio_novo', v_ticket
      ),
      auth.uid()
    );
  end if;

  v_rico := public.get_relatorio_admin_mensal_rico_v1(v_unidade_id, 2026, 8);
  if coalesce((v_rico #>> '{payload,indicadores_financeiros,ticket_medio}')::numeric, -1) <> v_ticket then
    raise exception 'TICKET_MEDIO_RICO_VALIDACAO_FINAL_FALHOU';
  end if;
end;
$migration$;
