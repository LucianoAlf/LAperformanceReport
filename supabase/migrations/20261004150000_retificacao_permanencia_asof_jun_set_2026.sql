-- ============================================================================
-- Retificacao jun-set/2026 — tempo_permanencia na regua as-of da v3
--
-- Pedido da Super Folha (04/10/2026): a serie do ano fica numa regua so.
-- jan-mai medem permanencia como tenure medio das pessoas ATIVAS no fim do
-- mes (v3); jun-set seguiam com a permanencia canonica antiga (media das
-- passagens encerradas — outra metrica, com degrau so de metodo entre mai
-- e jun).
--
-- Escopo cirurgico:
--   * somente dominio alunos_executivo — permanencia e ltv moram so nesse
--     payload (o admin nao carrega a metrica);
--   * sobrescreve 5 chaves: tempo_permanencia, tempo_permanencia_medio,
--     permanencia_metodo, ltv, ltv_medio (ltv = ticket_medio congelado x
--     permanencia nova). Todos os demais campos ficam como estao.
--   * nova versao por unidade x mes (jun -> v3 exec, jul -> v2, ago -> v3/
--     v8 (REC), set -> v3/v5/v3); as versoes anteriores NAO sao tocadas.
--   * dados_mensais.tempo_permanencia atualizado para a mesma regua;
--     linha anterior preservada em evidencias da retificacao.
--
-- Diferenca honesta conhecida: a base as-of reconstruida diverge da base
-- congelada em +-4% nos meses recentes (reativacoes sem movimentacao etc.) —
-- registrada em evidencias.ativos_asof vs ativos_frozen, sem abortar. A
-- permanencia so usa a base viva, que e o que o SF pediu.
-- ============================================================================

create or replace function pg_temp._retifica_perm_asof(p_ano integer, p_mes integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inicio date := make_date(p_ano, p_mes, 1);
  v_fim    date := (v_inicio + interval '1 month - 1 day')::date;
  r record;
  v_snap_e fechamento_mensal_snapshots%rowtype;
  v_payload_e jsonb;
  v_meta jsonb;
  v_id_e uuid;
  v_versao_e integer;
  v_ticket numeric;
  v_ltv numeric;
  v_obs constant text := 'Retificacao jun-set/2026: tempo_permanencia na regua as-of da v3 (tenure medio da base ativa no fim do mes), unificando a serie jan-set. Pedido Super Folha 04/10/2026.';
begin
  v_meta := jsonb_build_object(
    'retificacao_permanencia_asof_2026', jsonb_build_object(
      'regua', 'tenure medio (fim - data_matricula da entrada vigente) da base ativa as-of, mesma da reapuracao v3 jan-mai',
      'pedido', 'Super Folha 2026-10-04 — serie do ano numa regua so',
      'corrige', 'fechamento antigo media as passagens encerradas (metrica diferente); degrau entre mai e jun era so de metodo',
      'origem', 'migration 20261004150000_retificacao_permanencia_asof_jun_set_2026'
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
        (not (coalesce(c.is_projeto_banda, false) or coalesce(tm.codigo,'') = 'BANDA')
          and not (lower(coalesce(c.nome,'')) like '%coral%')) as is_academica,
        exists (select 1 from tranc t
          where t.aluno_id = a.id and t.d_ini <= p.fim and t.d_fim > p.fim) as trancada
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
        bool_or(is_academica and not trancada) as ativa
      from base
      group by 1, 2
    ),
    agg as (
      select pe.unidade_id,
        count(*) filter (where pe.ativa)::integer as ativos_asof,
        round((avg((select fim from p) - pe.entrada)
              filter (where pe.ativa and pe.entrada is not null))::numeric / 30.44, 2) as perm
      from pessoas pe
      group by 1
    )
    select u.id as unidade_id, u.nome as unidade_nome, u.codigo as unidade_codigo,
      coalesce(ag.ativos_asof, 0) as ativos_asof,
      ag.perm as perm
    from unidades u
    left join agg ag on ag.unidade_id = u.id
    where u.ativo = true
    order by u.codigo
  loop
    -- Base = maior versao nao-preview (jun exec esta 'retificado', nao 'fechado')
    select * into v_snap_e
    from fechamento_mensal_snapshots s
    where s.unidade_id = r.unidade_id and s.ano = p_ano and s.mes = p_mes
      and s.dominio = 'alunos_executivo' and s.status <> 'preview'
    order by s.versao desc
    limit 1;

    if v_snap_e.id is null then
      raise exception 'retifica_perm_asof %/%: snapshot exec ausente para %',
        p_mes, p_ano, r.unidade_nome;
    end if;

    if r.perm is null then
      raise exception 'retifica_perm_asof %/%: base as-of vazia para %',
        p_mes, p_ano, r.unidade_nome;
    end if;

    v_ticket := nullif(v_snap_e.payload->>'ticket_medio','')::numeric;
    v_ltv := case when v_ticket is not null
      then round(v_ticket * r.perm, 2) else null end;

    v_payload_e := v_snap_e.payload || jsonb_build_object(
      'tempo_permanencia', r.perm,
      'tempo_permanencia_medio', r.perm,
      'permanencia_metodo', 'tenure_medio_base_ativa_asof',
      'ltv', v_ltv,
      'ltv_medio', v_ltv,
      'fonte', 'retificacao_permanencia_asof_jun_set_2026'
    ) || v_meta;

    v_versao_e := coalesce((select max(s.versao) from fechamento_mensal_snapshots s
      where s.unidade_id = r.unidade_id and s.ano = p_ano and s.mes = p_mes
        and s.dominio = 'alunos_executivo' and s.status <> 'preview'), 0) + 1;

    insert into fechamento_mensal_snapshots (
      ano, mes, escopo, unidade_id, dominio, versao, status, fonte,
      payload, payload_hash, financeiro_realizado_disponivel,
      observacao, aprovado_em
    ) values (
      p_ano, p_mes, 'unidade', r.unidade_id, 'alunos_executivo', v_versao_e, 'aprovado',
      'retificacao_permanencia_asof_jun_set_2026', v_payload_e,
      hash_jsonb_canonico(v_payload_e), false, v_obs, now()
    ) returning id into v_id_e;

    update fechamento_mensal_snapshots
    set status = 'fechado', fechado_em = now()
    where id = v_id_e;

    insert into fechamento_mensal_auditoria (
      snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
    ) values
      (v_id_e, p_ano, p_mes, 'unidade', r.unidade_id, 'snapshot_gravado',
       jsonb_build_object('dominio','alunos_executivo','fonte','retificacao_permanencia_asof_jun_set_2026',
         'versao',v_versao_e,'origem','retificacao_permanencia_asof','motivo',v_obs), auth.uid());

    update dados_mensais dm set
      tempo_permanencia = r.perm
    where dm.unidade_id = r.unidade_id and dm.ano = p_ano and dm.mes = p_mes;

    insert into fechamento_mensal_retificacoes (
      snapshot_id, base_payload_hash, payload_corrigido, payload_corrigido_hash,
      motivo, evidencias, created_by
    ) values (
      v_id_e,
      v_snap_e.payload_hash,
      v_payload_e,
      hash_jsonb_canonico(v_payload_e),
      'retificacao_permanencia_asof_jun_set_2026',
      jsonb_build_object(
        'snapshot_anterior_id', v_snap_e.id,
        'snapshot_anterior_versao', v_snap_e.versao,
        'snapshot_anterior_status', v_snap_e.status,
        'payload_anterior', v_snap_e.payload,
        'permanencia_anterior', v_snap_e.payload->>'tempo_permanencia',
        'permanencia_nova', r.perm,
        'ativos_asof', r.ativos_asof,
        'ativos_frozen', v_snap_e.payload->>'alunos_ativos',
        'metodo', 'tenure medio (fim - data_matricula da entrada vigente) das pessoas ativas no fim do mes; apenas tempo_permanencia/ltv retificados; divergencia de base +-4% esperada nos meses recentes',
        'dados_mensais_anterior', (select to_jsonb(d.*) from dados_mensais d
           where d.unidade_id = r.unidade_id and d.ano = p_ano and d.mes = p_mes),
        'pedido', 'Super Folha 2026-10-04'
      ),
      auth.uid()
    );
  end loop;
end;
$$;

select pg_temp._retifica_perm_asof(2026, 6);
select pg_temp._retifica_perm_asof(2026, 7);
select pg_temp._retifica_perm_asof(2026, 8);
select pg_temp._retifica_perm_asof(2026, 9);
