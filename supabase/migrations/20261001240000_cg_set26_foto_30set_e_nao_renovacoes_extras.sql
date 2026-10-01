-- supabase/migrations/20261001240000_cg_set26_foto_30set_e_nao_renovacoes_extras.sql
--
-- Campo Grande set/2026 (decisao do Hugo, 01/10/2026, confirmada pelo John/ADM CG):
--
-- (1) O relatorio mensal de CG nao saia (RELATORIO_ADMIN_MENSAL_DIVERGENTE:nao_renovacoes): a
--     lista de nao renovacoes levava banda (Vinicius Lopa, Leticia Turques) e bolsista (Elisete
--     Davila), mas resumo.nao_renovacoes e resumo.evasoes ja os excluem. Recreio e Barra nao
--     tiveram esse caso em setembro. Agora a lista de nao renovacoes sai sem banda/bolsista
--     (classificacao da fonte unica classificar_saidas_churn_v1), igual ao total.
--
-- (2) Setembro de CG foi fotografado em 01/10 11h30 (1o fechamento automatico falhou), depois
--     de o Jhonatan finalizar no Emusys 9 dos 11 alunos que estavam de aviso previo com saida
--     prevista 01/10. O contador de ativos le o status ATUAL, entao eles sumiram dos ativos de
--     setembro sem entrar nas evasoes de setembro (a evasao deles e 01/10 = outubro, o que o
--     John confirmou). O aviso da Anna Duarte Martins tambem foi remarcado pelo Emusys em 01/10
--     12h35 (saida 01/10 -> 03/11) e saiu do aviso de setembro.
--     Aqui, numa transacao so: restaura o estado de 30/09 (os 11 ativos e o aviso da Anna para
--     outubro), regrava setembro de CG como nova versao (ja com o churn por pessoa) e devolve
--     tudo exatamente ao estado de hoje. Nada alem do snapshot/dados_mensais fica diferente.
-- Guardas (= simulacao com rollback): ativos 398, pagantes 371, churn 8,63, MRR perdido 12459,
-- renovacoes previstas 28, avisos 9; e o estado de hoje restaurado bit a bit.

do $$
declare
  d text;
  n int;
  v_ancora text;
begin
  d := pg_get_functiondef('public.montar_relatorio_admin_mensal_payload_v1(uuid,integer,integer)'::regprocedure);
  v_ancora := '    v_payload := jsonb_set(v_payload, ''{nao_renovacoes}'', v_nao_renov, true);';
  n := (length(d) - length(replace(d, v_ancora, ''))) / length(v_ancora);
  if n <> 1 then raise exception 'montar: ancora da lista de nao renovacoes esperava 1, achou %', n; end if;
  d := replace(d, v_ancora,
       '    -- banda e bolsista ficam fora do total de nao renovacoes; a lista acompanha o total' || chr(10)
    || '    select coalesce(jsonb_agg(x order by o), ''[]''::jsonb) into v_nao_renov' || chr(10)
    || '    from jsonb_array_elements(v_nao_renov) with ordinality t(x, o)' || chr(10)
    || '    where coalesce(x->>''classificacao_churn'', '''') not in (''banda'', ''bolsista'');' || chr(10)
    || v_ancora);
  execute d;
end $$;

do $$
declare
  v_u uuid := '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
  v_ids int[] := array[2600,1637,1884,2474,2583,2363,2519,2178,2112,2366,1636];
  v_obs text := 'Recaptura CG set/26: foto de 30/09 (11 finalizados no Emusys em 01/10 contam como ativos; aviso da Anna Duarte em outubro) + churn por pessoa; migration 20261001240000';
  v_backup jsonb; v_backup_anna jsonb; v_depois jsonb; v_depois_anna jsonb;
  v_prev jsonb; v_un jsonb; v_dom text; v_key text; v_fonte text; v_payload jsonb; v_ver int; v_id uuid;
  v_bloco jsonb; v_n int; v_p jsonb;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('app.fechamento_competencia_viva', '2026-9', true);

  -- estado de hoje, para devolver no fim
  select jsonb_agg(to_jsonb(e) order by e.emusys_matricula_id) into v_backup
  from (select emusys_matricula_id, status_emusys, status_emusys_bruto, status_local_resolvido, status_jornada_resolvido, motivo_inativa
        from public.emusys_matriculas_estado_atual where unidade_id = v_u and emusys_matricula_id = any(v_ids)) e;
  if jsonb_array_length(v_backup) <> 11
     or exists (select 1 from jsonb_array_elements(v_backup) x where x->>'status_local_resolvido' <> 'evadido') then
    raise exception 'estado dos 11 nao e o esperado: %', v_backup;
  end if;
  select to_jsonb(m) into v_backup_anna from (select mes_saida, data_prevista_saida from public.movimentacoes_admin where id = 3629) m;
  if v_backup_anna is distinct from '{"mes_saida": "2026-11-01", "data_prevista_saida": "2026-11-03"}'::jsonb then
    raise exception 'aviso da Anna nao e o esperado: %', v_backup_anna;
  end if;

  -- foto de 30/09 22h
  update public.emusys_matriculas_estado_atual
     set status_emusys = 'ativa', status_emusys_bruto = 'ativa', status_local_resolvido = 'ativo',
         status_jornada_resolvido = 'ativa', motivo_inativa = null
   where unidade_id = v_u and emusys_matricula_id = any(v_ids);
  get diagnostics v_n = row_count;
  if v_n <> 11 then raise exception 'esperava 11 matriculas, mexeu em %', v_n; end if;
  update public.movimentacoes_admin set mes_saida = '2026-10-01', data_prevista_saida = '2026-10-01' where id = 3629;

  update public.competencias_mensais set status = 'aberto'
  where unidade_id = v_u and ano = 2026 and mes = 9 and status = 'fechado';
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'esperava reabrir 1 competencia, reabriu %', v_n; end if;

  v_prev := public.preview_fechamento_mensal(2026, 9, null, true);
  select value into v_un from jsonb_array_elements(v_prev->'unidades') where value->>'unidade_id' = v_u::text;
  if v_un is null then raise exception 'preview sem Campo Grande'; end if;
  if jsonb_array_length(coalesce(v_un->'bloqueios', '[]')) > 0 then
    raise exception 'preview de Campo Grande bloqueado: %', v_un->'bloqueios';
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
            jsonb_build_object('dominio', v_dom, 'fonte', v_fonte, 'versao', v_ver, 'origem', '20261001240000'));
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
            jsonb_build_object('dominio', v_dom, 'fonte', v_fonte, 'versao', v_ver, 'origem', '20261001240000'));
  end loop;

  perform public.fechar_competencia_mensal_canonica_v2(2026, 9, v_obs, v_u, null);
  perform public.atualizar_dados_mensais_por_snapshot(2026, 9, v_u, false);
  if (select status from public.competencias_mensais where unidade_id = v_u and ano = 2026 and mes = 9) <> 'fechado' then
    raise exception 'competencia nao voltou a fechado';
  end if;

  v_p := (public.get_relatorio_admin_mensal_rico_v1(v_u, 2026, 9))->'payload';
  if (v_p#>>'{resumo,alunos_ativos}')::int <> 398
     or (v_p#>>'{resumo,alunos_pagantes}')::int <> 371
     or (v_p#>>'{indicadores_retencao,churn_rate}')::numeric <> 8.63
     or (v_p#>>'{indicadores_retencao,mrr_perdido}')::numeric <> 12459.00
     or (v_p#>>'{indicadores_retencao,renovacoes_previstas}')::int <> 28
     or (v_p#>>'{resumo,avisos_previos}')::int <> 9
     or jsonb_array_length(v_p->'nao_renovacoes') <> (v_p#>>'{resumo,nao_renovacoes}')::int
     or jsonb_array_length(v_p->'evasoes') + jsonb_array_length(v_p->'nao_renovacoes') <> (v_p#>>'{resumo,evasoes}')::int then
    raise exception 'Campo Grande fora do simulado: % / %', v_p->'indicadores_retencao', v_p->'resumo';
  end if;

  -- devolve o estado de hoje
  update public.emusys_matriculas_estado_atual e
     set status_emusys = b.status_emusys, status_emusys_bruto = b.status_emusys_bruto,
         status_local_resolvido = b.status_local_resolvido, status_jornada_resolvido = b.status_jornada_resolvido,
         motivo_inativa = b.motivo_inativa
    from jsonb_to_recordset(v_backup) as b(emusys_matricula_id int, status_emusys text, status_emusys_bruto text,
         status_local_resolvido text, status_jornada_resolvido text, motivo_inativa text)
   where e.unidade_id = v_u and e.emusys_matricula_id = b.emusys_matricula_id;
  update public.movimentacoes_admin set mes_saida = '2026-11-01', data_prevista_saida = '2026-11-03' where id = 3629;

  select jsonb_agg(to_jsonb(e) order by e.emusys_matricula_id) into v_depois
  from (select emusys_matricula_id, status_emusys, status_emusys_bruto, status_local_resolvido, status_jornada_resolvido, motivo_inativa
        from public.emusys_matriculas_estado_atual where unidade_id = v_u and emusys_matricula_id = any(v_ids)) e;
  select to_jsonb(m) into v_depois_anna from (select mes_saida, data_prevista_saida from public.movimentacoes_admin where id = 3629) m;
  if v_depois is distinct from v_backup or v_depois_anna is distinct from v_backup_anna then
    raise exception 'estado de hoje nao foi restaurado';
  end if;

  raise notice 'CG set/26 regravado com a foto de 30/09; estado de hoje restaurado';
end $$;
