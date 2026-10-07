-- ============================================================================
-- REVERSAO da retificacao de permanencia jun-set/2026 — pedido do Alf
--
-- A migration 20261004150000 mudou tempo_permanencia de jun-set para o
-- tenure medio da base ativa as-of. O Alf determinou que a regua certa e a
-- canonica antiga (get_tempo_permanencia — media das passagens encerradas).
-- "Estava certo antes."
--
-- Por unidade x mes (jun-set x BARRA/CG/REC, 12 casos):
--   * nova versao do snapshot alunos_executivo restaurando as 5 chaves do
--     payload_anterior guardado nas evidencias da retificacao revertida
--     (tempo_permanencia, tempo_permanencia_medio, permanencia_metodo ->
--     removida, ltv, ltv_medio, fonte);
--   * dados_mensais.tempo_permanencia volta a evidencias.permanencia_anterior
--     (dados_mensais_anterior das evidencias foi capturado APOS o update —
--     contem o valor novo; o anterior correto e permanencia_anterior);
--   * retificacao registrada como reversao.
--
-- Nada mais e tocado: ativos, pagantes, ticket, churn, mrr, jan-mai v3.
-- ============================================================================

create or replace function pg_temp._reverter_perm_jun_set(p_ano integer, p_mes integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_snap_e fechamento_mensal_snapshots%rowtype;
  v_ret fechamento_mensal_retificacoes%rowtype;
  v_payload_e jsonb;
  v_perm_ant numeric;
  v_id_e uuid;
  v_versao_e integer;
  v_obs constant text := 'Reversao da retificacao de permanencia jun-set/2026 — pedido do Alf: a regua antiga (get_tempo_permanencia) e a certa. Restaura o payload_anterior.';
  v_meta jsonb;
begin
  v_meta := jsonb_build_object(
    'reversao_permanencia_jun_set_2026', jsonb_build_object(
      'motivo', 'pedido do Alf: regua antiga e a certa',
      'reverte', 'migration 20261004150000 (tenure as-of) -> restaura get_tempo_permanencia canonico',
      'origem', 'migration 20261004160000_reversao_permanencia_jun_set_alf'
    )
  );

  for r in
    select u.id as unidade_id, u.nome as unidade_nome, u.codigo as unidade_codigo
    from unidades u where u.ativo order by u.codigo
  loop
    -- snapshot exec vigente (o que a retificacao criou)
    select * into v_snap_e
    from fechamento_mensal_snapshots s
    where s.unidade_id = r.unidade_id and s.ano = p_ano and s.mes = p_mes
      and s.dominio = 'alunos_executivo' and s.status <> 'preview'
    order by s.versao desc
    limit 1;

    if v_snap_e.id is null then
      raise exception 'reversao %/%: snapshot exec ausente para %',
        p_mes, p_ano, r.unidade_nome;
    end if;

    if v_snap_e.fonte is distinct from 'retificacao_permanencia_asof_jun_set_2026' then
      raise exception 'reversao %/%: snapshot exec vigente de % nao e o da retificacao (fonte=%)',
        p_mes, p_ano, r.unidade_nome, v_snap_e.fonte;
    end if;

    -- a retificacao que estamos revertendo (guarda o payload_anterior)
    select * into v_ret
    from fechamento_mensal_retificacoes rt
    where rt.snapshot_id = v_snap_e.id
      and rt.motivo = 'retificacao_permanencia_asof_jun_set_2026'
    limit 1;

    if v_ret.id is null then
      raise exception 'reversao %/%: retificacao de origem nao encontrada para %',
        p_mes, p_ano, r.unidade_nome;
    end if;

    v_perm_ant := nullif(v_ret.evidencias->>'permanencia_anterior','')::numeric;

    if v_perm_ant is null then
      raise exception 'reversao %/%: permanencia_anterior ausente nas evidencias de %',
        p_mes, p_ano, r.unidade_nome;
    end if;

    -- payload restaurado: o anterior INTEIRO + meta da reversao.
    -- Remove permanencia_metodo (chave que a retificacao introduziu e o
    -- anterior nao tinha) e restaura fonte anterior.
    v_payload_e := (v_ret.evidencias->'payload_anterior')
      - 'permanencia_metodo'
      || v_meta;

    v_versao_e := coalesce((select max(s.versao) from fechamento_mensal_snapshots s
      where s.unidade_id = r.unidade_id and s.ano = p_ano and s.mes = p_mes
        and s.dominio = 'alunos_executivo' and s.status <> 'preview'), 0) + 1;

    insert into fechamento_mensal_snapshots (
      ano, mes, escopo, unidade_id, dominio, versao, status, fonte,
      payload, payload_hash, financeiro_realizado_disponivel,
      observacao, aprovado_em
    ) values (
      p_ano, p_mes, 'unidade', r.unidade_id, 'alunos_executivo', v_versao_e, 'aprovado',
      'reversao_permanencia_jun_set_2026_alf', v_payload_e,
      hash_jsonb_canonico(v_payload_e), false, v_obs, now()
    ) returning id into v_id_e;

    update fechamento_mensal_snapshots
    set status = 'fechado', fechado_em = now()
    where id = v_id_e;

    insert into fechamento_mensal_auditoria (
      snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
    ) values
      (v_id_e, p_ano, p_mes, 'unidade', r.unidade_id, 'snapshot_gravado',
       jsonb_build_object('dominio','alunos_executivo','fonte','reversao_permanencia_jun_set_2026_alf',
         'versao',v_versao_e,'origem','reversao_pedido_alf','motivo',v_obs), auth.uid());

    update dados_mensais dm set
      tempo_permanencia = v_perm_ant
    where dm.unidade_id = r.unidade_id and dm.ano = p_ano and dm.mes = p_mes;

    insert into fechamento_mensal_retificacoes (
      snapshot_id, base_payload_hash, payload_corrigido, payload_corrigido_hash,
      motivo, evidencias, created_by
    ) values (
      v_id_e,
      v_snap_e.payload_hash,
      v_payload_e,
      hash_jsonb_canonico(v_payload_e),
      'reversao_permanencia_jun_set_2026_alf',
      jsonb_build_object(
        'tipo', 'reversao',
        'reverte_snapshot_id', v_snap_e.id,
        'reverte_snapshot_versao', v_snap_e.versao,
        'reverte_retificacao_id', v_ret.id,
        'payload_revertido', v_snap_e.payload,
        'permanencia_revertida', v_snap_e.payload->>'tempo_permanencia',
        'permanencia_restaurada', v_perm_ant,
        'motivo_legivel', 'pedido do Alf: regua antiga e a certa (get_tempo_permanencia — media das passagens encerradas)',
        'dados_mensais_anterior', (select to_jsonb(d.*) from dados_mensais d
           where d.unidade_id = r.unidade_id and d.ano = p_ano and d.mes = p_mes)
      ),
      auth.uid()
    );
  end loop;
end;
$$;

select pg_temp._reverter_perm_jun_set(2026, 6);
select pg_temp._reverter_perm_jun_set(2026, 7);
select pg_temp._reverter_perm_jun_set(2026, 8);
select pg_temp._reverter_perm_jun_set(2026, 9);
