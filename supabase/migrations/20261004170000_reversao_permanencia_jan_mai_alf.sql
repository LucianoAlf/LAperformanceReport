-- ============================================================================
-- REVERSAO da permanencia jan-mai/2026 — pedido do Alf
--
-- A reapuracao v3 (migration 20261004140000) gravou tempo_permanencia como
-- tenure medio da base ativa as-of (~14 / ~17,6 / ~19,5-20). O Alf determinou
-- que a regua antiga e a certa — jan-mai volta ao valor que a tela mostrava
-- ANTES da reapuracao, guardado na v1 em
--   retificacoes.evidencias->'dados_mensais_anterior'->>'tempo_permanencia'
-- (BARRA 12,6/12,6/12,4/12,7/12,6 · CG 15,5/15,5/15,4/15,4/15,4 ·
--  REC 15,9/15,9/15,6/15,8/16,1).
--
-- Por unidade x mes (15 casos), nova versao dos DOIS dominios:
--   * alunos_admin     -> tempo_permanencia (o admin vence o merge do export)
--   * alunos_executivo -> tempo_permanencia, tempo_permanencia_medio,
--                         ltv, ltv_medio = round(ticket_v3 x perm_legada, 2)
-- Todo o resto da reapuracao FICA: ativos, pagantes, ticket_medio, churn,
-- novos, evasoes, inadimplencia, mrr — nada e recalculado.
--
-- dados_mensais.tempo_permanencia volta ao valor legado.
-- Retificacao registrada como reversao; v1/v2/v3 permanecem intactas.
--
-- Guarda de sanidade: aborta se o valor legado extraido das evidencias
-- divergir da tabela esperada acima.
-- ============================================================================

create or replace function pg_temp._reverter_perm_jan_mai(p_ano integer, p_mes integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_snap_a fechamento_mensal_snapshots%rowtype;
  v_snap_e fechamento_mensal_snapshots%rowtype;
  v_snap_v1 fechamento_mensal_snapshots%rowtype;
  v_ret_v1 fechamento_mensal_retificacoes%rowtype;
  v_payload_a jsonb;
  v_payload_e jsonb;
  v_perm_legada numeric;
  v_perm_esperada numeric;
  v_ticket numeric;
  v_ltv numeric;
  v_id_a uuid;
  v_id_e uuid;
  v_versao_a integer;
  v_versao_e integer;
  v_obs constant text := 'Reversao da permanencia jan-mai/2026 — pedido do Alf: regua antiga e a certa. Restaura o tempo_permanencia legado (dados_mensais_anterior das evidencias da reapuracao v1); ltv/ltv_medio = ticket v3 x permanencia legada. Demais campos da reapuracao mantidos.';
  v_meta jsonb;
  -- tabela esperada de permanencia legada (unidade x mes), extraida das
  -- evidencias da reapuracao v1 e conferida com o pedido do Alf
  v_esperada jsonb := '{
    "BARRA": {"1":12.6,"2":12.6,"3":12.4,"4":12.7,"5":12.6},
    "CG":    {"1":15.5,"2":15.5,"3":15.4,"4":15.4,"5":15.4},
    "REC":   {"1":15.9,"2":15.9,"3":15.6,"4":15.8,"5":16.1}
  }'::jsonb;
begin
  v_meta := jsonb_build_object(
    'reversao_permanencia_jan_mai_2026', jsonb_build_object(
      'motivo', 'pedido do Alf: regua antiga e a certa',
      'reverte', 'tempo_permanencia as-of da v3 -> valor legado de dados_mensais (evidencias da reapuracao v1)',
      'origem', 'migration 20261004170000_reversao_permanencia_jan_mai_alf'
    )
  );

  for r in
    select u.id as unidade_id, u.nome as unidade_nome, u.codigo as unidade_codigo
    from unidades u where u.ativo order by u.codigo
  loop
    v_perm_esperada := (v_esperada->r.unidade_codigo->>p_mes::text)::numeric;
    if v_perm_esperada is null then
      raise exception 'reversao %/%: sem valor esperado para %', p_mes, p_ano, r.unidade_codigo;
    end if;

    -- snapshots vigentes (v3)
    select * into v_snap_a
    from fechamento_mensal_snapshots s
    where s.unidade_id = r.unidade_id and s.ano = p_ano and s.mes = p_mes
      and s.dominio = 'alunos_admin' and s.status <> 'preview'
    order by s.versao desc limit 1;

    select * into v_snap_e
    from fechamento_mensal_snapshots s
    where s.unidade_id = r.unidade_id and s.ano = p_ano and s.mes = p_mes
      and s.dominio = 'alunos_executivo' and s.status <> 'preview'
    order by s.versao desc limit 1;

    if v_snap_a.id is null or v_snap_e.id is null then
      raise exception 'reversao %/%: snapshot v3 ausente para %', p_mes, p_ano, r.unidade_nome;
    end if;

    if v_snap_a.fonte is distinct from 'retificacao_asof_jan_mai_2026_v3'
       or v_snap_e.fonte is distinct from 'retificacao_asof_jan_mai_2026_v3' then
      raise exception 'reversao %/%: snapshot vigente de % nao e o da v3 (admin=%, exec=%)',
        p_mes, p_ano, r.unidade_codigo, v_snap_a.fonte, v_snap_e.fonte;
    end if;

    -- snapshot v1 admin (a quem a retificacao da reapuracao foi anexada)
    select * into v_snap_v1
    from fechamento_mensal_snapshots s
    where s.unidade_id = r.unidade_id and s.ano = p_ano and s.mes = p_mes
      and s.dominio = 'alunos_admin' and s.versao = 1
    limit 1;

    select * into v_ret_v1
    from fechamento_mensal_retificacoes rt
    where rt.snapshot_id = v_snap_v1.id
      and rt.motivo = 'reapuracao_jan_mai_2026_regua_corrigida_0808'
    limit 1;

    if v_ret_v1.id is null then
      raise exception 'reversao %/%: retificacao v1 nao encontrada para %',
        p_mes, p_ano, r.unidade_nome;
    end if;

    v_perm_legada := nullif(
      v_ret_v1.evidencias->'dados_mensais_anterior'->>'tempo_permanencia', '')::numeric;

    if v_perm_legada is null then
      raise exception 'reversao %/%: tempo_permanencia legado ausente nas evidencias v1 de %',
        p_mes, p_ano, r.unidade_nome;
    end if;

    if v_perm_legada <> v_perm_esperada then
      raise exception 'reversao %/%: legado de % diverge do esperado (% <> %)',
        p_mes, p_ano, r.unidade_codigo, v_perm_legada, v_perm_esperada;
    end if;

    -- ltv acompanha: ticket ja corrigido da v3 x permanencia legada
    v_ticket := nullif(v_snap_a.payload->>'ticket_medio','')::numeric;
    v_ltv := case when v_ticket is not null
      then round(v_ticket * v_perm_legada, 2) else null end;

    -- merge cirurgico: so permanencia/ltv + marca do metodo legado.
    -- fonte permanece a da v3 (o resto do payload continua v3).
    v_payload_a := v_snap_a.payload || jsonb_build_object(
      'tempo_permanencia', v_perm_legada,
      'permanencia_metodo', 'canonico_legado_dados_mensais'
    ) || v_meta;

    v_payload_e := v_snap_e.payload || jsonb_build_object(
      'tempo_permanencia', v_perm_legada,
      'tempo_permanencia_medio', v_perm_legada,
      'permanencia_metodo', 'canonico_legado_dados_mensais',
      'ltv', v_ltv,
      'ltv_medio', v_ltv
    ) || v_meta;

    v_versao_a := coalesce((select max(s.versao) from fechamento_mensal_snapshots s
      where s.unidade_id = r.unidade_id and s.ano = p_ano and s.mes = p_mes
        and s.dominio = 'alunos_admin' and s.status <> 'preview'), 0) + 1;
    v_versao_e := coalesce((select max(s.versao) from fechamento_mensal_snapshots s
      where s.unidade_id = r.unidade_id and s.ano = p_ano and s.mes = p_mes
        and s.dominio = 'alunos_executivo' and s.status <> 'preview'), 0) + 1;

    insert into fechamento_mensal_snapshots (
      ano, mes, escopo, unidade_id, dominio, versao, status, fonte,
      payload, payload_hash, financeiro_realizado_disponivel,
      observacao, aprovado_em
    ) values (
      p_ano, p_mes, 'unidade', r.unidade_id, 'alunos_admin', v_versao_a, 'aprovado',
      'reversao_permanencia_jan_mai_2026_alf', v_payload_a,
      hash_jsonb_canonico(v_payload_a), false, v_obs, now()
    ) returning id into v_id_a;

    insert into fechamento_mensal_snapshots (
      ano, mes, escopo, unidade_id, dominio, versao, status, fonte,
      payload, payload_hash, financeiro_realizado_disponivel,
      observacao, aprovado_em
    ) values (
      p_ano, p_mes, 'unidade', r.unidade_id, 'alunos_executivo', v_versao_e, 'aprovado',
      'reversao_permanencia_jan_mai_2026_alf', v_payload_e,
      hash_jsonb_canonico(v_payload_e), false, v_obs, now()
    ) returning id into v_id_e;

    update fechamento_mensal_snapshots
    set status = 'fechado', fechado_em = now()
    where id in (v_id_a, v_id_e);

    insert into fechamento_mensal_auditoria (
      snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
    ) values
      (v_id_a, p_ano, p_mes, 'unidade', r.unidade_id, 'snapshot_gravado',
       jsonb_build_object('dominio','alunos_admin','fonte','reversao_permanencia_jan_mai_2026_alf',
         'versao',v_versao_a,'origem','reversao_pedido_alf','motivo',v_obs), auth.uid()),
      (v_id_e, p_ano, p_mes, 'unidade', r.unidade_id, 'snapshot_gravado',
       jsonb_build_object('dominio','alunos_executivo','fonte','reversao_permanencia_jan_mai_2026_alf',
         'versao',v_versao_e,'origem','reversao_pedido_alf','motivo',v_obs), auth.uid());

    update dados_mensais dm set
      tempo_permanencia = v_perm_legada
    where dm.unidade_id = r.unidade_id and dm.ano = p_ano and dm.mes = p_mes;

    insert into fechamento_mensal_retificacoes (
      snapshot_id, base_payload_hash, payload_corrigido, payload_corrigido_hash,
      motivo, evidencias, created_by
    ) values (
      v_id_a,
      v_snap_a.payload_hash,
      v_payload_a,
      hash_jsonb_canonico(v_payload_a),
      'reversao_permanencia_jan_mai_2026_alf',
      jsonb_build_object(
        'tipo', 'reversao',
        'reverte_snapshot_admin_id', v_snap_a.id,
        'reverte_snapshot_admin_versao', v_snap_a.versao,
        'reverte_snapshot_exec_id', v_snap_e.id,
        'reverte_snapshot_exec_versao', v_snap_e.versao,
        'payload_admin_v3', v_snap_a.payload,
        'payload_exec_v3', v_snap_e.payload,
        'payload_exec_revertido', v_payload_e,
        'permanencia_revertida', v_snap_a.payload->>'tempo_permanencia',
        'permanencia_restaurada', v_perm_legada,
        'ltv_recalculado', v_ltv,
        'ticket_usado', v_ticket,
        'legado_extraido_de', jsonb_build_object(
          'retificacao_v1_id', v_ret_v1.id,
          'caminho', 'evidencias.dados_mensais_anterior.tempo_permanencia'),
        'motivo_legivel', 'pedido do Alf: regua antiga e a certa — volta ao tempo_permanencia que a tela mostrava antes da reapuracao',
        'dados_mensais_anterior', (select to_jsonb(d.*) from dados_mensais d
           where d.unidade_id = r.unidade_id and d.ano = p_ano and d.mes = p_mes)
      ),
      auth.uid()
    );
  end loop;
end;
$$;

select pg_temp._reverter_perm_jan_mai(2026, 1);
select pg_temp._reverter_perm_jan_mai(2026, 2);
select pg_temp._reverter_perm_jan_mai(2026, 3);
select pg_temp._reverter_perm_jan_mai(2026, 4);
select pg_temp._reverter_perm_jan_mai(2026, 5);
