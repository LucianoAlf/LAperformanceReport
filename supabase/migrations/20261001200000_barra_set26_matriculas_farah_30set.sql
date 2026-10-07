-- supabase/migrations/20261001200000_barra_set26_matriculas_farah_30set.sql
--
-- Barra set/2026: Antonia e Mateus Monteiro Farah (alunos 2553/2554, matriculas Emusys 890/891)
-- foram matriculados em 30/09 e lancados no Emusys em 01/10 12h27/12h30. O webhook chegou com
-- data_matricula 01/10 (provado pela idempotency_key em automacao_log) e depois a data foi
-- corrigida no Emusys para 30/09 (GET /matriculas em 01/10 ~13h BRT devolve 2026-09-30). Nenhum
-- caminho propaga essa correcao para alunos.data_matricula, entao o fechamento de setembro
-- (capturado 01/10 11h30) ficou sem os dois. Pedido do Arthur, OK do Hugo.
--
-- O que faz, so para Barra set/2026:
--   1. alunos.data_matricula = 2026-09-30 (o trg_audit registra antes/depois);
--   2. reabre competencias_mensais da Barra na transacao (fechada, a canonica le dados_mensais
--      em vez de recalcular) e recaptura os 7 dominios + 2 mensais como NOVA versao, pelo mesmo
--      caminho do fechamento (preview -> snapshots aprovados -> garantir bloco -> fechar v2);
--   3. atualiza dados_mensais pelo snapshot novo.
-- As versoes anteriores ficam intactas (o leitor usa a versao mais alta).
-- Guarda: o resultado tem de ser exatamente ativos 271 / pagantes 267 / novas 21 (= antes +2),
-- e o relatorio admin tem de sair; senao a migration inteira volta.
-- Fora do escopo: snapshots consolidados da rede (recapturar hoje levaria o desvio de status de
-- Campo Grande, que recalculado em 01/10 ja da 387 contra os 389 corretos de 30/09).

do $$
declare
  v_u uuid := '368d47f5-2d88-4475-bc14-ba084a9a348e';
  v_obs text := 'Recaptura Barra set/26: matriculas Farah (Emusys 890/891) com data 30/09 corrigida no Emusys apos o webhook; migration 20261001200000';
  v_prev jsonb; v_un jsonb; v_dom text; v_key text; v_fonte text; v_payload jsonb; v_ver int; v_id uuid;
  v_bloco jsonb; v_fech jsonb; v_dm record; v_rel jsonb; v_n int;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('app.fechamento_competencia_viva', '2026-9', true);

  update public.alunos set data_matricula = '2026-09-30'
  where id in (2553, 2554) and unidade_id = v_u and emusys_matricula_id in ('890', '891') and data_matricula = '2026-10-01';
  get diagnostics v_n = row_count;
  if v_n <> 2 then raise exception 'esperava atualizar 2 matriculas, atualizou %', v_n; end if;

  update public.competencias_mensais set status = 'aberto'
  where unidade_id = v_u and ano = 2026 and mes = 9 and status = 'fechado';
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'esperava reabrir 1 competencia, reabriu %', v_n; end if;

  v_prev := public.preview_fechamento_mensal(2026, 9, null, true);
  select value into v_un from jsonb_array_elements(v_prev->'unidades') where value->>'unidade_id' = v_u::text;
  if v_un is null then raise exception 'preview sem a Barra'; end if;
  if jsonb_array_length(coalesce(v_un->'bloqueios', '[]')) > 0 then
    raise exception 'preview da Barra bloqueado: %', v_un->'bloqueios';
  end if;

  for v_dom, v_key, v_fonte in select * from (values
      ('alunos_admin', 'admin_operacional', 'get_kpis_alunos_admin_operacional'),
      ('alunos_executivo', 'alunos_canonicos', 'get_kpis_alunos_canonicos'),
      ('comercial', 'comercial_canonico', 'get_kpis_comercial_canonicos_v2'),
      ('relatorio_gerencial', 'relatorio_gerencial', 'get_dados_relatorio_gerencial'),
      ('relatorio_coordenacao', 'relatorio_coordenacao', 'get_dados_relatorio_coordenacao'),
      ('programa_matriculador', 'programa_matriculador', 'get_programa_matriculador_dados'),
      ('programa_fideliza', 'programa_fideliza', 'get_programa_fideliza_dados')) t(a, b, c)
  loop
    v_payload := v_un->'fontes'->v_key;
    if v_payload is null or v_payload = 'null'::jsonb or v_payload ? 'erro' then
      raise exception 'payload % invalido', v_dom;
    end if;
    select coalesce(max(versao), 0) + 1 into v_ver from public.fechamento_mensal_snapshots
      where ano = 2026 and mes = 9 and escopo = 'unidade' and unidade_id = v_u and dominio = v_dom;
    insert into public.fechamento_mensal_snapshots
      (ano, mes, escopo, unidade_id, dominio, versao, status, fonte, payload, payload_hash,
       financeiro_realizado_disponivel, observacao, aprovado_em)
    values (2026, 9, 'unidade', v_u, v_dom, v_ver, 'aprovado', v_fonte, v_payload,
            public.hash_jsonb_canonico(v_payload), false, v_obs, now())
    returning id into v_id;
    insert into public.fechamento_mensal_auditoria (snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes)
    values (v_id, 2026, 9, 'unidade', v_u, 'snapshot_gravado',
            jsonb_build_object('dominio', v_dom, 'fonte', v_fonte, 'versao', v_ver, 'origem', '20261001200000'));
  end loop;

  v_bloco := public.garantir_bloco_financeiro_gerencial_v1(2026, 9, v_u);
  if coalesce((v_bloco->>'ok')::boolean, false) is not true then
    raise exception 'bloco financeiro: %', v_bloco;
  end if;

  for v_dom, v_fonte, v_payload in select * from (values
      ('relatorio_admin_mensal', 'montar_relatorio_admin_mensal_payload_v1', public.montar_relatorio_admin_mensal_payload_v1(v_u, 2026, 9)),
      ('relatorio_comercial_mensal', 'montar_relatorio_comercial_mensal_payload_v1', public.montar_relatorio_comercial_mensal_payload_v1(v_u, 2026, 9))) t(a, b, c)
  loop
    select coalesce(max(versao), 0) + 1 into v_ver from public.fechamento_mensal_snapshots
      where ano = 2026 and mes = 9 and escopo = 'unidade' and unidade_id = v_u and dominio = v_dom;
    insert into public.fechamento_mensal_snapshots
      (ano, mes, escopo, unidade_id, dominio, versao, status, fonte, payload, payload_hash, observacao, aprovado_em)
    values (2026, 9, 'unidade', v_u, v_dom, v_ver, 'aprovado', v_fonte, v_payload,
            public.hash_jsonb_canonico(v_payload), v_obs, now())
    returning id into v_id;
    insert into public.fechamento_mensal_auditoria (snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes)
    values (v_id, 2026, 9, 'unidade', v_u, 'snapshot_gravado',
            jsonb_build_object('dominio', v_dom, 'fonte', v_fonte, 'versao', v_ver, 'origem', '20261001200000'));
  end loop;

  v_fech := public.fechar_competencia_mensal_canonica_v2(2026, 9, v_obs, v_u, null);
  perform public.atualizar_dados_mensais_por_snapshot(2026, 9, v_u, false);

  select alunos_ativos, alunos_pagantes, novas_matriculas into v_dm
  from public.dados_mensais where unidade_id = v_u and ano = 2026 and mes = 9;
  if (v_dm.alunos_ativos, v_dm.alunos_pagantes, v_dm.novas_matriculas) is distinct from (271, 267, 21) then
    raise exception 'resultado inesperado: ativos % pagantes % novas %', v_dm.alunos_ativos, v_dm.alunos_pagantes, v_dm.novas_matriculas;
  end if;

  v_rel := public.get_relatorio_admin_mensal_rico_v1(v_u, 2026, 9);
  if (v_rel#>>'{payload,resumo,alunos_ativos}')::int <> 271 or (v_rel#>>'{payload,resumo,novos_alunos}')::int <> 21 then
    raise exception 'relatorio admin nao refletiu: %', v_rel#>'{payload,resumo}';
  end if;
  if (select status from public.competencias_mensais where unidade_id = v_u and ano = 2026 and mes = 9) <> 'fechado' then
    raise exception 'competencia nao voltou a fechado';
  end if;
  raise notice 'Barra set/26 recapturada: % snapshots fechados', v_fech->>'snapshots_fechados';
end $$;
