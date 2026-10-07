-- Reapuração de jan–mai/2026 dos KPIs de alunos sob a régua corrigida de 08/08/2026
-- (ativo sem trancado e sem só-banda, churn sobre pagantes, novos_alunos por pessoa).
-- Autorizada pelo Alf em 03/10/2026 para que export-kpis-mensais emita
-- status_fechamento='fechado' nesses meses.
--
-- Por que não usamos gravar_snapshot_fechamento_mensal: o preview bloqueia com
-- 'admin_vs_canonico_divergente' — a divergência é justamente a correção pedida
-- (admin na régua nova vs canônico lendo dados_mensais legado). Bloqueio
-- auto-referente: só destrava depois de dados_mensais corrigido.
--
-- Trilha de retificação:
--   * fechamento_mensal_snapshots: versão 1 por unidade×mês, append-only, com hash
--     canônico e metadado 'reapuracao_jan_mai_2026' no payload (mesmo padrão da
--     retificação de agosto do Recreio).
--   * fechamento_mensal_retificacoes: vincula cada snapshot novo à linha legada de
--     dados_mensais (hash + conteúdo anterior em evidencias) — nada é sobrescrito
--     sem registro.
--   * fechamento_mensal_auditoria: 'snapshot_gravado' por domínio.
--   * dados_mensais recebe os valores corrigidos com o mesmo mapeamento de
--     precedência de atualizar_dados_mensais_por_snapshot (admin → executivo → dm).
--   * competencias_mensais sai intacta do commit: jan–abr seguem 'aberto' e mai
--     volta a 'fechado'. Mai precisou de reabertura TRANSACIONAL (status
--     'aberto'→leitura do canônico vivo→restaura 'fechado' na mesma tx) porque
--     a competência fechada desde 07/06 fazia o canônico ler dados_mensais
--     legado. Snapshots saem com status='fechado' (transição aprovado→fechado,
--     a única que o trigger de imutabilidade permite).

create or replace function pg_temp._reapurar_kpis_mes(p_ano integer, p_mes integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin jsonb;
  v_exec jsonb;
  v_u jsonb;
  v_e jsonb;
  v_payload_admin jsonb;
  v_payload_exec jsonb;
  v_meta jsonb;
  v_snap_admin uuid;
  v_snap_exec uuid;
  v_dm dados_mensais%rowtype;
  v_comp_status text;
  v_obs constant text := 'Reapuracao jan-mai/2026 sob regua corrigida de 08/08/2026 (ativo sem trancado e sem so-banda, churn sobre pagantes, novos_alunos por pessoa). Autorizado Alf 03/10/2026. Valores legados de dados_mensais preservados em fechamento_mensal_retificacoes.';
begin
  -- Força o canônico a apurar VIVO para esta competência (mesmo escape hatch da
  -- própria RPC — o valor entra na chave de cache, não contamina o cache normal).
  perform set_config('app.fechamento_competencia_viva', format('%s-%s', p_ano, p_mes), true);

  -- mai/2026 está 'fechado' em competencias_mensais desde 07/06 — o canônico
  -- leria dados_mensais legado em vez de apurar vivo. Reabrimos dentro desta
  -- transação só para a leitura e restauramos em seguida (o estado original
  -- volta antes do commit; qualquer exceção desfaz tudo junto).
  v_comp_status := null;
  select cm.status into v_comp_status
  from competencias_mensais cm
  where cm.ano = p_ano and cm.mes = p_mes
  for update of cm;

  if v_comp_status is not null and v_comp_status is distinct from 'aberto' then
    update competencias_mensais set status = 'aberto'
    where ano = p_ano and mes = p_mes;
  end if;

  v_admin := get_kpis_alunos_admin_operacional(null, p_ano, p_mes);
  v_exec := get_kpis_alunos_canonicos(null, p_ano, p_mes);

  if v_comp_status is not null and v_comp_status is distinct from 'aberto' then
    update competencias_mensais set status = v_comp_status
    where ano = p_ano and mes = p_mes;
  end if;

  if v_admin is null or jsonb_array_length(coalesce(v_admin->'por_unidade','[]'::jsonb)) = 0 then
    raise exception 'reapuracao %/%: admin RPC sem por_unidade', p_mes, p_ano;
  end if;

  v_meta := jsonb_build_object(
    'reapuracao_jan_mai_2026', jsonb_build_object(
      'regua', 'v1.3.1_corrigida_2026-08-08',
      'autorizacao', 'Alf 2026-10-03',
      'substitui', 'dados_mensais legado (regua pre-08/08)',
      'origem', 'migration 20261003120000_reapuracao_kpis_alunos_jan_mai_2026'
    )
  );

  for v_u in
    select value from jsonb_array_elements(v_admin->'por_unidade') t(value)
  loop
    select value into v_e
    from jsonb_array_elements(coalesce(v_exec->'por_unidade','[]'::jsonb)) t(value)
    where value->>'unidade_id' = v_u->>'unidade_id'
    limit 1;

    if v_e is null then
      raise exception 'reapuracao %/%: canonico sem unidade %', p_mes, p_ano, v_u->>'unidade_nome';
    end if;
    if v_e->>'fonte' <> 'vivo' then
      raise exception 'reapuracao %/%: canonico nao veio vivo (fonte=%) para %',
        p_mes, p_ano, v_e->>'fonte', v_u->>'unidade_nome';
    end if;
    if coalesce((v_u->>'alunos_ativos')::integer, 0) = 0 then
      raise exception 'reapuracao %/%: admin alunos_ativos=0 para % — abortando',
        p_mes, p_ano, v_u->>'unidade_nome';
    end if;

    select * into v_dm
    from dados_mensais dm
    where dm.ano = p_ano and dm.mes = p_mes
      and dm.unidade_id = (v_u->>'unidade_id')::uuid;

    if not found then
      raise exception 'reapuracao %/%: dados_mensais ausente para %',
        p_mes, p_ano, v_u->>'unidade_nome';
    end if;

    v_payload_admin := v_u || v_meta;
    v_payload_exec := v_e || v_meta;

    insert into fechamento_mensal_snapshots (
      ano, mes, escopo, unidade_id, dominio, versao, status, fonte,
      payload, payload_hash, financeiro_realizado_disponivel,
      observacao, aprovado_em
    ) values (
      p_ano, p_mes, 'unidade', (v_u->>'unidade_id')::uuid, 'alunos_admin', 1, 'aprovado',
      'get_kpis_alunos_admin_operacional', v_payload_admin,
      hash_jsonb_canonico(v_payload_admin), false, v_obs, now()
    ) returning id into v_snap_admin;

    insert into fechamento_mensal_snapshots (
      ano, mes, escopo, unidade_id, dominio, versao, status, fonte,
      payload, payload_hash, financeiro_realizado_disponivel,
      observacao, aprovado_em
    ) values (
      p_ano, p_mes, 'unidade', (v_u->>'unidade_id')::uuid, 'alunos_executivo', 1, 'aprovado',
      'get_kpis_alunos_canonicos', v_payload_exec,
      hash_jsonb_canonico(v_payload_exec), false, v_obs, now()
    ) returning id into v_snap_exec;

    -- Transição controlada aprovado → fechado (única permitida pelo trigger de
    -- imutabilidade): conteúdo idêntico, só ganha status/fechado_em. É o que
    -- faz o export emitir status_fechamento='fechado' como nos meses jun–set.
    update fechamento_mensal_snapshots
    set status = 'fechado', fechado_em = now()
    where id in (v_snap_admin, v_snap_exec);

    insert into fechamento_mensal_auditoria (
      snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
    ) values
      (v_snap_admin, p_ano, p_mes, 'unidade', (v_u->>'unidade_id')::uuid, 'snapshot_gravado',
       jsonb_build_object('dominio','alunos_admin','fonte','get_kpis_alunos_admin_operacional',
         'versao',1,'origem','reapuracao_jan_mai_2026','motivo',v_obs), auth.uid()),
      (v_snap_exec, p_ano, p_mes, 'unidade', (v_u->>'unidade_id')::uuid, 'snapshot_gravado',
       jsonb_build_object('dominio','alunos_executivo','fonte','get_kpis_alunos_canonicos',
         'versao',1,'origem','reapuracao_jan_mai_2026','motivo',v_obs), auth.uid());

    -- Trilha: vincula o snapshot novo à linha legada que está sendo substituída.
    insert into fechamento_mensal_retificacoes (
      snapshot_id, base_payload_hash, payload_corrigido, payload_corrigido_hash,
      motivo, evidencias, created_by
    ) values (
      v_snap_admin,
      hash_jsonb_canonico(to_jsonb(v_dm)),
      v_payload_admin,
      hash_jsonb_canonico(v_payload_admin),
      'reapuracao_jan_mai_2026_regua_corrigida_0808',
      jsonb_build_object(
        'dados_mensais_anterior', to_jsonb(v_dm),
        'regua_nova', 'v1.3.1_corrigida_2026-08-08',
        'autorizacao', 'Alf 2026-10-03'
      ),
      auth.uid()
    );

    -- Propaga valores corrigidos a dados_mensais (mesma precedência de
    -- atualizar_dados_mensais_por_snapshot: admin p/ contagens de pessoas,
    -- executivo p/ dinâmica/financeiro; sem gerencial → campos que ele cobre
    -- ficam com o valor existente: taxa_renovacao, passaporte).
    update dados_mensais dm set
      alunos_ativos        = coalesce((v_u->>'alunos_ativos')::integer,
                                      (v_e->>'alunos_ativos')::integer, dm.alunos_ativos, 0),
      alunos_pagantes      = coalesce((v_e->>'alunos_pagantes')::integer,
                                      (v_u->>'alunos_pagantes')::integer, dm.alunos_pagantes, 0),
      novas_matriculas     = coalesce((v_u->>'novas_matriculas')::integer,
                                      (v_e->>'novas_matriculas')::integer, dm.novas_matriculas, 0),
      evasoes              = coalesce((v_e->>'evasoes')::integer, dm.evasoes, 0),
      churn_rate           = coalesce((v_e->>'churn_rate')::numeric, dm.churn_rate, 0),
      ticket_medio         = coalesce((v_e->>'ticket_medio')::numeric, dm.ticket_medio, 0),
      tempo_permanencia    = coalesce((v_e->>'tempo_permanencia')::numeric, dm.tempo_permanencia, 0),
      inadimplencia        = coalesce((v_e->>'inadimplencia_pct')::numeric,
                                      (v_e->>'inadimplencia')::numeric, dm.inadimplencia, 0),
      reajuste_parcelas    = coalesce((v_e->>'reajuste_pct')::numeric, dm.reajuste_parcelas, 0),
      -- faturamento_estimado e saldo_liquido são colunas GERADAS — derivam das
      -- colunas base atualizadas acima e não se escrevem.
      matriculas_ativas    = coalesce((v_u->>'matriculas_ativas')::integer,
                                      (v_e->>'matriculas_ativas')::integer, dm.matriculas_ativas, 0),
      matriculas_banda     = coalesce((v_u->>'matriculas_banda')::integer,
                                      (v_e->>'matriculas_banda')::integer, dm.matriculas_banda, 0),
      matriculas_2_curso   = coalesce((v_u->>'matriculas_2_curso')::integer,
                                      (v_e->>'matriculas_2_curso')::integer, dm.matriculas_2_curso, 0),
      bolsistas_integrais  = coalesce((v_u->>'bolsistas_integrais')::integer,
                                      (v_e->>'bolsistas_integrais')::integer, dm.bolsistas_integrais, 0),
      bolsistas_parciais   = coalesce((v_u->>'bolsistas_parciais')::integer,
                                      (v_e->>'bolsistas_parciais')::integer, dm.bolsistas_parciais, 0),
      updated_at           = now()
    where dm.ano = p_ano and dm.mes = p_mes
      and dm.unidade_id = (v_u->>'unidade_id')::uuid;
  end loop;
end;
$$;

select pg_temp._reapurar_kpis_mes(2026, 1);
select pg_temp._reapurar_kpis_mes(2026, 2);
select pg_temp._reapurar_kpis_mes(2026, 3);
select pg_temp._reapurar_kpis_mes(2026, 4);
select pg_temp._reapurar_kpis_mes(2026, 5);
