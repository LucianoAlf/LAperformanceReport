-- ============================================================================
-- Reapuracao jan-mai/2026 v3 — ticket contratual + permanencia da base viva
--
-- O que a v2 errou (apontado pela Super Folha na releitura):
--   * ticket_medio dividiu o mrr/faturamento_previsto do payload v1 (numerador
--     de outra regua) pelos pagantes reconstruidos — o ticket crescia mes a mes
--     ate encostar em junho, partindo de ~metade do real.
--   * tempo_permanencia mediu a media das passagens ENCERRADAS com saida <= fim
--     do mes — amostra minuscula e instavel (REC fev = 5,68; CG jan = 9,35).
--
-- Correcao (mesma regua de pessoa no numerador e no denominador):
--   * ticket_medio = mrr_asof / alunos_pagantes, onde mrr_asof = soma de
--     valor_parcela das matriculas academicas pagantes vivas no fim do mes
--     (a chave mrr_asof ja existia no payload v2 — agora ela tambem alimenta
--     o ticket).
--   * tempo_permanencia = tenure medio, em meses (fim - data_matricula da
--     entrada vigente / 30.44), das pessoas ATIVAS no fim do mes — a base
--     viva reconstruida, nao os evadidos.
--   * ltv_medio = ticket_medio * tempo_permanencia (mesma formula do
--     canonico).
--
-- Ativos, pagantes, novos, evasoes, churn, mrr (faturamento previsto da
-- competencia) e todo o resto dos payloads ficam como estao na v2 — a v3 e
-- um merge cirurgico de 6 chaves sobre os payloads v2.
--
-- Trilha: snapshots versao 3 fechados + retificacao com o payload_v2 inteiro
-- em evidencias + auditoria + dados_mensais (ticket_medio,
-- ticket_medio_contratual, mrr_contratual, tempo_permanencia). v2 e v1
-- permanecem intactas.
-- ============================================================================

create or replace function pg_temp._reapurar_asof_v3(p_ano integer, p_mes integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inicio date := make_date(p_ano, p_mes, 1);
  v_fim    date := (v_inicio + interval '1 month - 1 day')::date;
  r record;
  v_snap_a fechamento_mensal_snapshots%rowtype;
  v_snap_e fechamento_mensal_snapshots%rowtype;
  v_payload_a jsonb;
  v_payload_e jsonb;
  v_meta jsonb;
  v_id_a uuid;
  v_id_e uuid;
  v_versao_a integer;
  v_versao_e integer;
  v_ticket numeric;
  v_ltv numeric;
  v_obs constant text := 'Reapuracao AS-OF jan-mai/2026 (v3): ticket = mrr contratual as-of / pagantes as-of; permanencia = tenure medio da base ativa no fim do mes. Posicao da v2 mantida. Autorizado Alf 03/10/2026.';
begin
  v_meta := jsonb_build_object(
    'reapuracao_asof_jan_mai_2026', jsonb_build_object(
      'regua', 'v1.3.1_corrigida_2026-08-08 as-of fim do mes',
      'autorizacao', 'Alf 2026-10-03',
      'corrige', 'v2 dividiu faturamento_previsto pelos pagantes as-of e mediu permanencia so nas passagens encerradas; v3 usa mrr_asof/pagantes e tenure medio da base viva',
      'origem', 'migration 20261004140000_reapuracao_asof_v3_ticket_permanencia'
    )
  );

  for r in
    with p as (select v_fim as fim, v_inicio as ini),
    saida_row as (
      select ma.aluno_id, min(ma.data) d
      from movimentacoes_admin_vigentes ma, p
      where ma.tipo in ('evasao','nao_renovacao') and ma.data <= p.fim
        and ma.aluno_id is not null
      group by 1
      union all
      select a.id, min(ma.data)
      from movimentacoes_admin_vigentes ma
      join alunos a on a.emusys_matricula_id = ma.emusys_matricula_id
      join p on true
      where ma.tipo in ('evasao','nao_renovacao') and ma.data <= p.fim
        and ma.aluno_id is null
        and ma.emusys_matricula_id is not null and ma.emusys_matricula_id <> ''
      group by a.id
      union all
      select a.id, min(ah.data_saida)
      from alunos_historico ah
      join alunos a on a.id = any(coalesce(ah.aluno_ids, array[ah.aluno_id]))
      join p on true
      where ah.anulado = false and ah.data_saida is not null and ah.data_saida <= p.fim
      group by a.id
    ),
    sp as (
      select ma.unidade_id, lower(btrim(ma.aluno_nome)) nome_key, min(ma.data) d
      from movimentacoes_admin_vigentes ma join p on true
      where ma.tipo in ('evasao','nao_renovacao') and ma.data <= p.fim
        and ma.aluno_id is null
        and (ma.emusys_matricula_id is null or ma.emusys_matricula_id = '')
      group by 1, 2
    ),
    tranc as (
      select ma.aluno_id, ma.data d_ini,
        coalesce(ma.previsao_retorno,
          (select min(m2.data) from movimentacoes_admin_vigentes m2
            where m2.aluno_id = ma.aluno_id and m2.data > ma.data),
          '9999-12-31'::date) d_fim
      from movimentacoes_admin_vigentes ma join p on true
      where ma.tipo = 'trancamento' and ma.data <= p.fim
    ),
    base as (
      select a.id, a.unidade_id, a.data_matricula,
        case when coalesce(nullif(btrim(a.emusys_student_id),''),
                    ea.emusys_aluno_id::text, j.emusys_aluno_id::text) is not null
          then 'emusys:' || coalesce(nullif(btrim(a.emusys_student_id),''),
                    ea.emusys_aluno_id::text, j.emusys_aluno_id::text)
          else 'local:' || a.id::text end as pessoa_key,
        coalesce(a.valor_parcela, 0)::numeric as valor_parcela,
        coalesce(tm.codigo, '') as tipo_codigo,
        coalesce(tm.entra_ticket_medio, false) as entra_ticket_medio,
        exists (select 1 from tranc t
          where t.aluno_id = a.id and t.d_ini <= p.fim and t.d_fim > p.fim) as trancada,
        (not (coalesce(c.is_projeto_banda, false) or coalesce(tm.codigo,'') = 'BANDA')
          and not (lower(coalesce(c.nome,'')) like '%coral%')) as is_academica
      from alunos a
      join p on true
      left join cursos c on c.id = a.curso_id
      left join tipos_matricula tm on tm.id = a.tipo_matricula_id
      left join saida_row sr on sr.aluno_id = a.id
      left join sp on sp.unidade_id = a.unidade_id
        and sp.nome_key = lower(btrim(a.nome))
      left join lateral (
        select estado.emusys_aluno_id
        from emusys_matriculas_estado_atual estado
        where estado.unidade_id = a.unidade_id and estado.emusys_aluno_id is not null
          and (estado.emusys_matricula_id = case
                 when btrim(coalesce(a.emusys_matricula_id,'')) ~ '^[0-9]+$'
                   then btrim(a.emusys_matricula_id)::bigint end
               or estado.aluno_id = a.id)
        order by (estado.emusys_matricula_id = case
                 when btrim(coalesce(a.emusys_matricula_id,'')) ~ '^[0-9]+$'
                   then btrim(a.emusys_matricula_id)::bigint end) desc,
                 estado.sincronizado_em desc
        limit 1
      ) ea on true
      left join lateral (
        select jornada.emusys_aluno_id
        from aluno_jornada_matricula_disciplina jornada
        where jornada.unidade_id = a.unidade_id and jornada.emusys_aluno_id is not null
          and (jornada.emusys_matricula_id = case
                 when btrim(coalesce(a.emusys_matricula_id,'')) ~ '^[0-9]+$'
                   then btrim(a.emusys_matricula_id)::bigint end
               or jornada.aluno_id = a.id)
        order by (jornada.emusys_matricula_id = case
                 when btrim(coalesce(a.emusys_matricula_id,'')) ~ '^[0-9]+$'
                   then btrim(a.emusys_matricula_id)::bigint end) desc,
                 jornada.ultima_sincronizacao_emusys desc
        limit 1
      ) j on true
      where (a.data_matricula is null or a.data_matricula <= p.fim)
        and (a.arquivado_em is null or a.arquivado_em::date > p.fim)
        and (a.data_saida is null or a.data_saida > p.fim)
        and (sr.d is null or (a.data_matricula is not null and a.data_matricula > sr.d))
        and (sp.d is null or (a.data_matricula is not null and a.data_matricula > sp.d))
        and (a.status not in ('evadido','inativo') or a.updated_at::date > p.fim)
    ),
    pessoas as (
      select unidade_id, pessoa_key,
        min(data_matricula) as entrada,
        bool_or(is_academica and not trancada) as ativa,
        bool_or(is_academica and not trancada and entra_ticket_medio
          and valor_parcela > 0
          and tipo_codigo not in ('BOLSISTA_INT','BOLSISTA_PARC','BANDA')) as pagante,
        sum(case when is_academica and not trancada and entra_ticket_medio
              and valor_parcela > 0
              and tipo_codigo not in ('BOLSISTA_INT','BOLSISTA_PARC','BANDA')
            then valor_parcela else 0 end) as mrr_asof
      from base
      group by 1, 2
    ),
    agg as (
      select unidade_id,
        count(*) filter (where ativa)::integer as ativos,
        count(*) filter (where ativa and pagante)::integer as pagantes,
        round(coalesce(sum(mrr_asof) filter (where ativa and pagante), 0), 2) as mrr_asof,
        round((avg(v_fim - entrada) filter (where ativa and entrada is not null))::numeric / 30.44, 2) as perm_ativos
      from pessoas
      group by 1
    )
    select u.id as unidade_id, u.nome as unidade_nome, u.codigo as unidade_codigo,
      coalesce(ag.ativos, 0) as ativos,
      coalesce(ag.pagantes, 0) as pagantes,
      coalesce(ag.mrr_asof, 0) as mrr_asof,
      ag.perm_ativos as perm
    from unidades u
    left join agg ag on ag.unidade_id = u.id
    where u.ativo = true
    order by u.codigo
  loop
    -- Sanidade: ativos/pagantes recomputados devem bater com o payload v2.
    select * into v_snap_a
    from fechamento_mensal_snapshots s
    where s.unidade_id = r.unidade_id and s.ano = p_ano and s.mes = p_mes
      and s.dominio = 'alunos_admin' and s.status = 'fechado'
    order by s.versao desc
    limit 1;

    select * into v_snap_e
    from fechamento_mensal_snapshots s
    where s.unidade_id = r.unidade_id and s.ano = p_ano and s.mes = p_mes
      and s.dominio = 'alunos_executivo' and s.status = 'fechado'
    order by s.versao desc
    limit 1;

    if v_snap_a.id is null or v_snap_e.id is null then
      raise exception 'reapuracao_asof_v3 %/%: snapshot v2 ausente para %',
        p_mes, p_ano, r.unidade_nome;
    end if;

    if (v_snap_a.payload->>'alunos_ativos')::integer <> r.ativos
       or (v_snap_a.payload->>'alunos_pagantes')::integer <> r.pagantes
       or round((v_snap_a.payload->>'mrr_asof')::numeric, 2) <> r.mrr_asof then
      raise exception 'reapuracao_asof_v3 %/%: divergencia de base em % (asof %/%/% vs v2 %/%/%)',
        p_mes, p_ano, r.unidade_codigo,
        r.ativos, r.pagantes, r.mrr_asof,
        v_snap_a.payload->>'alunos_ativos', v_snap_a.payload->>'alunos_pagantes',
        v_snap_a.payload->>'mrr_asof';
    end if;

    v_ticket := case when r.pagantes > 0
      then round(r.mrr_asof / r.pagantes, 2) else null end;
    v_ltv := case when v_ticket is not null and r.perm is not null
      then round(v_ticket * r.perm, 2) else null end;

    -- Merge cirurgico: so as chaves corrigidas + metadados da correcao.
    v_payload_a := v_snap_a.payload || jsonb_build_object(
      'ticket_medio', v_ticket,
      'ticket_denominador_pagantes', r.pagantes,
      'ticket_numerador', 'mrr_contratual_asof',
      'tempo_permanencia', r.perm,
      'permanencia_metodo', 'tenure_medio_base_ativa_asof',
      'fonte', 'asof_movimentacoes_v3'
    ) || v_meta;

    v_payload_e := v_snap_e.payload || jsonb_build_object(
      'ticket_medio', v_ticket,
      'ticket_denominador_pagantes', r.pagantes,
      'ticket_numerador', 'mrr_contratual_asof',
      'tempo_permanencia', r.perm,
      'tempo_permanencia_medio', r.perm,
      'permanencia_metodo', 'tenure_medio_base_ativa_asof',
      'ltv', v_ltv,
      'ltv_medio', v_ltv,
      'fonte', 'asof_movimentacoes_v3'
    ) || v_meta;

    -- ---------- snapshots versao 3 (mesmo layout da v2) ----------
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
      'retificacao_asof_jan_mai_2026_v3', v_payload_a,
      hash_jsonb_canonico(v_payload_a), false, v_obs, now()
    ) returning id into v_id_a;

    insert into fechamento_mensal_snapshots (
      ano, mes, escopo, unidade_id, dominio, versao, status, fonte,
      payload, payload_hash, financeiro_realizado_disponivel,
      observacao, aprovado_em
    ) values (
      p_ano, p_mes, 'unidade', r.unidade_id, 'alunos_executivo', v_versao_e, 'aprovado',
      'retificacao_asof_jan_mai_2026_v3', v_payload_e,
      hash_jsonb_canonico(v_payload_e), false, v_obs, now()
    ) returning id into v_id_e;

    update fechamento_mensal_snapshots
    set status = 'fechado', fechado_em = now()
    where id in (v_id_a, v_id_e);

    insert into fechamento_mensal_auditoria (
      snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
    ) values
      (v_id_a, p_ano, p_mes, 'unidade', r.unidade_id, 'snapshot_gravado',
       jsonb_build_object('dominio','alunos_admin','fonte','retificacao_asof_jan_mai_2026_v3',
         'versao',v_versao_a,'origem','reapuracao_asof_jan_mai_2026','motivo',v_obs), auth.uid()),
      (v_id_e, p_ano, p_mes, 'unidade', r.unidade_id, 'snapshot_gravado',
       jsonb_build_object('dominio','alunos_executivo','fonte','retificacao_asof_jan_mai_2026_v3',
         'versao',v_versao_e,'origem','reapuracao_asof_jan_mai_2026','motivo',v_obs), auth.uid());

    -- ---------- dados_mensais ----------
    update dados_mensais dm set
      ticket_medio            = v_ticket,
      ticket_medio_contratual = v_ticket,
      mrr_contratual          = r.mrr_asof,
      tempo_permanencia       = r.perm
    where dm.unidade_id = r.unidade_id and dm.ano = p_ano and dm.mes = p_mes;

    -- ---------- retificacao (v2 inteira preservada em evidencias) ----------
    insert into fechamento_mensal_retificacoes (
      snapshot_id, base_payload_hash, payload_corrigido, payload_corrigido_hash,
      motivo, evidencias, created_by
    ) values (
      v_id_a,
      v_snap_a.payload_hash,
      v_payload_a,
      hash_jsonb_canonico(v_payload_a),
      'reapuracao_asof_jan_mai_2026_v3',
      jsonb_build_object(
        'snapshot_v2_id', v_snap_a.id,
        'snapshot_v2_versao', v_snap_a.versao,
        'payload_v2_admin', v_snap_a.payload,
        'payload_v2_exec', v_snap_e.payload,
        'metodo', 'ticket = mrr_contratual_asof / pagantes_asof; permanencia = tenure medio (fim - data_matricula) da base ativa; posicao da v2 mantida',
        'dados_mensais_anterior', (select to_jsonb(d.*) from dados_mensais d
           where d.unidade_id = r.unidade_id and d.ano = p_ano and d.mes = p_mes),
        'autorizacao', 'Alf 2026-10-03'
      ),
      auth.uid()
    );
  end loop;
end;
$$;

select pg_temp._reapurar_asof_v3(2026, 1);
select pg_temp._reapurar_asof_v3(2026, 2);
select pg_temp._reapurar_asof_v3(2026, 3);
select pg_temp._reapurar_asof_v3(2026, 4);
select pg_temp._reapurar_asof_v3(2026, 5);
