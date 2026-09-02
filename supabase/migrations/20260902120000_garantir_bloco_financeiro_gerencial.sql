-- supabase/migrations/20260902120000_garantir_bloco_financeiro_gerencial.sql
--
-- O snapshot relatorio_gerencial nasce SEM o bloco de faturas do Emusys, porque
-- get_dados_relatorio_gerencial produz ticket_medio/faturamento_previsto/mrr do
-- cadastro local (fonte: "vivo") e nunca consulta financeiro_faturas_emusys.
-- Sem o bloco, get_relatorio_admin_mensal_rico_base_v1 levanta
-- RELATORIO_ADMIN_MENSAL_INDICADORES_AUSENTES e o relatorio mensal nao abre.
--
-- Retificar NAO resolve: a leitura consome v_gerencial.payload (cru) e nunca
-- consulta fechamento_mensal_retificacoes. Provado em 01/09/2026 -- as 3
-- retificacoes aplicadas ficaram corretas e inertes. O que destravou agosto foi
-- regravar o snapshot como versao 2.

create or replace function public.garantir_bloco_financeiro_gerencial_v1(
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot record;
  v_financeiro jsonb;
  v_totais jsonb;
  v_gestao jsonb;
  v_payload jsonb;
  v_pagantes numeric;
  v_inadimplentes numeric;
  v_pct numeric;
  v_novo_id uuid;
  v_versao integer;
begin
  if auth.role() <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'ACESSO_NEGADO_BLOCO_FINANCEIRO_GERENCIAL: ano=%, mes=%, unidade_id=%',
      p_ano, p_mes, p_unidade_id;
  end if;

  select s.id, s.payload, s.versao, s.capturado_em, s.status
    into v_snapshot
  from public.fechamento_mensal_snapshots s
  where s.ano = p_ano
    and s.mes = p_mes
    and s.escopo = 'unidade'
    and s.unidade_id = p_unidade_id
    and s.dominio = 'relatorio_gerencial'
    and s.status in ('aprovado', 'fechado')
  order by s.versao desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', false, 'acao', 'snapshot_ausente',
      'motivo', 'nenhum snapshot relatorio_gerencial aprovado/fechado na competencia'
    );
  end if;

  -- Ja presente em qualquer das 3 formas que a leitura aceita.
  if coalesce(
       v_snapshot.payload #> '{financeiro_faturas_emusys,totais}',
       v_snapshot.payload #> '{kpis_gestao,0,financeiro_faturas_emusys}',
       v_snapshot.payload #> '{dados_mes_atual,0,financeiro_faturas_emusys}'
     ) is not null then
    return jsonb_build_object(
      'ok', true, 'acao', 'ja_presente',
      'snapshot_id', v_snapshot.id, 'versao', v_snapshot.versao
    );
  end if;

  v_financeiro := public.get_financeiro_faturas_emusys(p_unidade_id, p_ano, p_mes);

  if coalesce((v_financeiro->>'tem_dados')::boolean, false) is not true then
    return jsonb_build_object(
      'ok', false, 'acao', 'fonte_indisponivel',
      'motivo', coalesce(v_financeiro->>'status', 'sem status'),
      'integrity', v_financeiro->'integrity'
    );
  end if;

  v_totais := v_financeiro->'totais';

  -- tem_dados=true nao garante totais preenchido -- fail-closed tambem aqui,
  -- senao gravamos campos numericos nulos e devolvemos sucesso silenciosamente errado.
  if v_totais is null or jsonb_typeof(v_totais) <> 'object' then
    return jsonb_build_object(
      'ok', false, 'acao', 'fonte_indisponivel',
      'motivo', 'totais ausente ou nao e um objeto jsonb'
    );
  end if;

  if v_totais->'ticket_medio' is null then
    return jsonb_build_object(
      'ok', false, 'acao', 'fonte_indisponivel',
      'motivo', 'totais sem o campo ticket_medio'
    );
  end if;

  if v_totais->'faturamento_previsto' is null then
    return jsonb_build_object(
      'ok', false, 'acao', 'fonte_indisponivel',
      'motivo', 'totais sem o campo faturamento_previsto'
    );
  end if;

  if v_totais->'mrr_atual' is null then
    return jsonb_build_object(
      'ok', false, 'acao', 'fonte_indisponivel',
      'motivo', 'totais sem o campo mrr_atual'
    );
  end if;

  if jsonb_typeof(v_snapshot.payload->'kpis_gestao') <> 'array'
     or v_snapshot.payload->'kpis_gestao'->0 is null then
    return jsonb_build_object(
      'ok', false, 'acao', 'snapshot_ausente',
      'snapshot_id', v_snapshot.id,
      'motivo', 'payload sem kpis_gestao[0]'
    );
  end if;

  v_gestao := v_snapshot.payload->'kpis_gestao'->0;
  v_pagantes := nullif((v_gestao->>'alunos_pagantes')::numeric, 0);
  v_inadimplentes := coalesce((v_totais->>'faturas_parcela_abertas')::numeric, 0);
  v_pct := case when v_pagantes is null then null
                else round(v_inadimplentes / v_pagantes * 100, 2) end;

  v_gestao := v_gestao
    || jsonb_build_object(
         'financeiro_faturas_emusys', v_totais,
         'faturamento_previsto',  (v_totais->>'faturamento_previsto')::numeric,
         'faturamento_realizado', (v_totais->>'mrr_atual')::numeric,
         'inadimplentes',         v_inadimplentes::integer,
         'inadimplencia_valor',   (v_totais->>'valor_aberto_parcelas')::numeric
       );

  if v_pct is not null then
    v_gestao := v_gestao || jsonb_build_object(
      'inadimplencia', v_pct, 'inadimplencia_pct', v_pct
    );
  end if;

  v_payload := jsonb_set(v_snapshot.payload, '{kpis_gestao,0}', v_gestao, false);

  select coalesce(max(s.versao), 0) + 1 into v_versao
  from public.fechamento_mensal_snapshots s
  where s.ano = p_ano and s.mes = p_mes and s.escopo = 'unidade'
    and s.unidade_id = p_unidade_id and s.dominio = 'relatorio_gerencial';

  insert into public.fechamento_mensal_snapshots (
    ano, mes, escopo, unidade_id, dominio, versao, status,
    fonte, payload, payload_hash, observacao,
    capturado_em, capturado_por, aprovado_em, aprovado_por,
    financeiro_realizado_disponivel
  ) values (
    p_ano, p_mes, 'unidade', p_unidade_id, 'relatorio_gerencial', v_versao,
    'aprovado', 'garantir_bloco_financeiro_gerencial_v1',
    v_payload, public.hash_jsonb_canonico(v_payload),
    format('Bloco financeiro do Emusys embutido na captura (versao anterior: %s)', v_snapshot.versao),
    v_snapshot.capturado_em,  -- corte preservado de proposito
    auth.uid(), now(), auth.uid(),
    true  -- so chega aqui depois das guardas de tem_dados e dos 3 campos obrigatorios de totais
  ) returning id into v_novo_id;

  insert into public.fechamento_mensal_auditoria (
    snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
  ) values (
    v_novo_id, p_ano, p_mes, 'unidade', p_unidade_id, 'snapshot_gravado',
    jsonb_build_object(
      'dominio', 'relatorio_gerencial', 'versao', v_versao,
      'origem', 'garantir_bloco_financeiro_gerencial_v1',
      'versao_anterior', v_snapshot.versao
    ),
    auth.uid()
  );

  return jsonb_build_object(
    'ok', true, 'acao', 'gravado',
    'snapshot_id', v_novo_id, 'versao', v_versao
  );
end;
$$;

revoke all on function public.garantir_bloco_financeiro_gerencial_v1(integer, integer, uuid) from public;
revoke execute on function public.garantir_bloco_financeiro_gerencial_v1(integer, integer, uuid) from anon;
grant execute on function public.garantir_bloco_financeiro_gerencial_v1(integer, integer, uuid) to service_role;

comment on function public.garantir_bloco_financeiro_gerencial_v1(integer, integer, uuid) is
  'Embute financeiro_faturas_emusys.totais em kpis_gestao[0] do snapshot relatorio_gerencial quando ausente, gravando nova versao. Fail-closed se a fonte nao tiver dados. Nunca sobrescreve bloco existente.';
