-- supabase/migrations/20261005120000_recreio_set26_regrava_inadimplencia_regra_4_6.sql
--
-- Recreio set/2026: o fechamento publicou inadimplencia 3,12%, que era o percentual de BOLSISTAS
-- (11 nao pagantes / 353 ativos) - a formula foi corrigida em 20261002170000, mas o snapshot
-- fechado continuou com o valor velho (Fernanda/Recreio, 02/10/2026).
--
-- Regra §4.6: inadimplentes / pagantes, por pessoa, fonte = inadimplencia canonica por faturas.
-- A propria captura guardou a foto canonica (financeiro_faturas_emusys.inadimplencia_canonica):
-- 2 pessoas com parcela vencida em aberto no fechamento - Lucas Bello da Costa (1613, venc. 05/09,
-- pago 02/10) e Helena Moreira Ferrari (1005, venc. 10/09) -, R$ 835,00 (405 + 430 com desconto).
-- 2 / 342 pagantes = 0,58%.
--
-- So o Recreio (decisao do Hugo, 05/10). Nova versao do relatorio_gerencial, copiada da ultima,
-- trocando SO os campos de inadimplencia; guarda aborta se qualquer outro campo mudar.
-- O relatorio mensal administrativo le kpis_gestao[0].inadimplencia daqui.

do $$
declare
  v_uni uuid := (select id from unidades where nome = 'Recreio');
  v_ant record;
  v_payload jsonb;
  v_versao int;
  v_novo uuid;
  v_inad int := 2;
  v_valor numeric := 835.00;
  v_pag numeric;
  v_pct numeric;
  v_campos jsonb;
  v_caminho text[];
  v_caminhos text[] := array['{kpis_gestao,0}', '{dados_mes_atual,0}',
                             '{kpis_alunos_canonicos,por_unidade,0}', '{kpis_alunos_canonicos,totais}'];
  i int;
begin
  select * into v_ant from fechamento_mensal_snapshots
   where ano = 2026 and mes = 9 and escopo = 'unidade' and unidade_id = v_uni
     and dominio = 'relatorio_gerencial' and status = 'fechado'
   order by versao desc limit 1;
  if v_ant.id is null then raise exception 'snapshot gerencial fechado do Recreio set/26 nao encontrado'; end if;
  if v_ant.payload #>> '{kpis_gestao,0,inadimplencia}' <> '3.12' then
    raise exception 'esperava inadimplencia 3.12 na versao %, achou %', v_ant.versao, v_ant.payload #>> '{kpis_gestao,0,inadimplencia}';
  end if;
  if jsonb_array_length(v_ant.payload #> '{financeiro_faturas_emusys,inadimplencia_canonica,items}') <> v_inad then
    raise exception 'foto canonica nao tem % itens', v_inad;
  end if;

  v_pag := (v_ant.payload #>> '{kpis_gestao,0,alunos_pagantes}')::numeric;
  if v_pag <> 342 then raise exception 'esperava 342 pagantes, achou %', v_pag; end if;
  v_pct := round(v_inad / v_pag * 100, 2);
  v_campos := jsonb_build_object('inadimplencia', v_pct, 'inadimplencia_pct', v_pct,
                                 'inadimplentes', v_inad, 'inadimplencia_valor', v_valor);

  v_payload := v_ant.payload;
  for i in 1 .. array_length(v_caminhos, 1) loop
    v_caminho := v_caminhos[i]::text[];
    if v_payload #> v_caminho is null then raise exception 'caminho % ausente', v_caminho; end if;
    v_payload := jsonb_set(v_payload, v_caminho, (v_payload #> v_caminho) || v_campos, false);
  end loop;
  v_payload := v_payload || jsonb_build_object('kpis_inadimplencia_fonte', 'inadimplencia_canonica_faturas_regra_4_6');

  -- guarda: fora os campos trocados, payload identico
  declare v_a jsonb := v_ant.payload; v_b jsonb := v_payload; k text[];
  begin
    v_a := v_a - 'kpis_inadimplencia_fonte'; v_b := v_b - 'kpis_inadimplencia_fonte';
    for i in 1 .. array_length(v_caminhos, 1) loop
      k := v_caminhos[i]::text[];
      v_a := jsonb_set(v_a, k, (v_a #> k) - 'inadimplencia' - 'inadimplencia_pct' - 'inadimplentes' - 'inadimplencia_valor');
      v_b := jsonb_set(v_b, k, (v_b #> k) - 'inadimplencia' - 'inadimplencia_pct' - 'inadimplentes' - 'inadimplencia_valor');
    end loop;
    if v_a <> v_b then raise exception 'ESCOPO_EXCEDIDO: payload mudou fora da inadimplencia'; end if;
  end;

  select max(versao) + 1 into v_versao from fechamento_mensal_snapshots
   where ano = 2026 and mes = 9 and escopo = 'unidade' and unidade_id = v_uni and dominio = 'relatorio_gerencial';

  insert into fechamento_mensal_snapshots (
    ano, mes, escopo, unidade_id, dominio, versao, status, fonte, payload, payload_hash, observacao,
    capturado_em, capturado_por, aprovado_em, aprovado_por, financeiro_realizado_disponivel
  ) values (
    2026, 9, 'unidade', v_uni, 'relatorio_gerencial', v_versao, 'aprovado',
    '20261005120000_recreio_set26_regrava_inadimplencia', v_payload, hash_jsonb_canonico(v_payload),
    format('Inadimplencia pela regra 4.6 (inadimplentes/pagantes, faturas): 3,12%% -> %s%% (versao anterior: %s)', v_pct, v_ant.versao),
    v_ant.capturado_em, null, now(), null, v_ant.financeiro_realizado_disponivel
  ) returning id into v_novo;

  update fechamento_mensal_snapshots set status = 'fechado', fechado_em = now() where id = v_novo;

  insert into fechamento_mensal_auditoria (snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id)
  values (v_novo, 2026, 9, 'unidade', v_uni, 'snapshot_gravado',
          jsonb_build_object('dominio', 'relatorio_gerencial', 'versao', v_versao,
                             'origem', '20261005120000_recreio_set26_regrava_inadimplencia',
                             'versao_anterior', v_ant.versao, 'inadimplencia_antes', 3.12, 'inadimplencia_depois', v_pct),
          null);
  raise notice 'gravado % versao % inadimplencia %', v_novo, v_versao, v_pct;

  -- O relatorio mensal administrativo fixa o gerencial por snapshot_id + hash em payload.fontes:
  -- nova versao dele, identica, so apontando para a versao nova do gerencial.
  declare
    v_m record; v_mp jsonb; v_mv int; v_mid uuid;
  begin
    select * into v_m from fechamento_mensal_snapshots
     where ano = 2026 and mes = 9 and escopo = 'unidade' and unidade_id = v_uni
       and dominio = 'relatorio_admin_mensal' and status = 'fechado'
     order by versao desc limit 1;
    if v_m.payload #>> '{fontes,relatorio_gerencial,snapshot_id}' <> v_ant.id::text then
      raise exception 'mensal aponta para %, esperava %', v_m.payload #>> '{fontes,relatorio_gerencial,snapshot_id}', v_ant.id;
    end if;
    v_mp := jsonb_set(v_m.payload, '{fontes,relatorio_gerencial}',
              jsonb_build_object('snapshot_id', v_novo, 'payload_hash', hash_jsonb_canonico(v_payload)), false);
    if (v_mp - 'fontes') <> (v_m.payload - 'fontes') then raise exception 'ESCOPO_EXCEDIDO no mensal'; end if;
    select max(versao) + 1 into v_mv from fechamento_mensal_snapshots
     where ano = 2026 and mes = 9 and escopo = 'unidade' and unidade_id = v_uni and dominio = 'relatorio_admin_mensal';
    insert into fechamento_mensal_snapshots (
      ano, mes, escopo, unidade_id, dominio, versao, status, fonte, payload, payload_hash, observacao,
      capturado_em, capturado_por, aprovado_em, aprovado_por, financeiro_realizado_disponivel
    ) values (
      2026, 9, 'unidade', v_uni, 'relatorio_admin_mensal', v_mv, 'aprovado',
      '20261005120000_recreio_set26_regrava_inadimplencia', v_mp, hash_jsonb_canonico(v_mp),
      format('Aponta para o gerencial versao %s (inadimplencia regra 4.6) - versao anterior: %s', v_versao, v_m.versao),
      v_m.capturado_em, null, now(), null, v_m.financeiro_realizado_disponivel
    ) returning id into v_mid;
    update fechamento_mensal_snapshots set status = 'fechado', fechado_em = now() where id = v_mid;
    insert into fechamento_mensal_auditoria (snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id)
    values (v_mid, 2026, 9, 'unidade', v_uni, 'snapshot_gravado',
            jsonb_build_object('dominio', 'relatorio_admin_mensal', 'versao', v_mv,
                               'origem', '20261005120000_recreio_set26_regrava_inadimplencia',
                               'versao_anterior', v_m.versao, 'gerencial_snapshot_id', v_novo), null);
    raise notice 'mensal gravado % versao %', v_mid, v_mv;
  end;
end $$;
