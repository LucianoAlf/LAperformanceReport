-- Checkpoint 5: relatorios financeiros passam a ler o snapshot imutavel.
--
-- Regras de seguranca operacional:
--   * nunca le public.emusys_faturas (espelho mutavel);
--   * escolhe somente o ultimo run live completo da competencia;
--   * snapshot stale, source_missing, identidade invalida ou duplicidade
--     falham fechados (tem_dados=false);
--   * source_missing continua sendo pendencia de reconciliacao, nunca pagamento;
--   * inadimplencia e anexada pela RPC canonica, com o calculo contratual unico;
--   * snapshots mensais ja fechados nao sao regravados por esta migration.

create or replace function public.get_financeiro_faturas_emusys(
  p_unidade_id uuid default null::uuid,
  p_ano integer default (extract(year from (now() at time zone 'America/Sao_Paulo')))::integer,
  p_mes integer default (extract(month from (now() at time zone 'America/Sao_Paulo')))::integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_competencia date;
  v_service_role boolean := coalesce(auth.role(), '') = 'service_role';
  v_is_admin boolean := false;
  v_run public.sync_runs%rowtype;
  v_is_fresh boolean := false;
  v_source_missing_count integer := 0;
  v_validation_issue_count integer := 0;
  v_duplicate_fatura_count integer := 0;
  v_unknown_status_count integer := 0;
  v_por_unidade jsonb := '[]'::jsonb;
  v_totais jsonb := '{}'::jsonb;
  v_inadimplencia jsonb := '{}'::jsonb;
begin
  if p_ano is null or p_ano < 2000 or p_ano > 2100
     or p_mes is null or p_mes < 1 or p_mes > 12 then
    raise exception using
      errcode = '22023',
      message = 'ano/mes invalidos';
  end if;
  v_competencia := make_date(p_ano, p_mes, 1);

  if not v_service_role then
    v_is_admin := public.is_admin();
    if not v_is_admin
       and p_unidade_id is not null
       and not exists (
         select 1
         from public.get_user_unidade_ids() as unidade_autorizada(id)
         where unidade_autorizada.id = p_unidade_id
       ) then
      raise exception using
        errcode = '42501',
        message = 'usuario nao autorizado para esta unidade';
    end if;
  end if;

  v_inadimplencia := public.get_inadimplencia_canonica(p_unidade_id);

  select sr.*
  into v_run
  from public.sync_runs sr
  where sr.competencia = v_competencia
    and sr.run_type = 'live'
    and sr.status = 'succeeded'
    and sr.snapshot_complete = true
    and sr.unidades_concluidas = 3
    and sr.completed_at is not null
  order by sr.completed_at desc, sr.id desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'schema_version', 2,
      'status', 'unavailable',
      'ano', p_ano,
      'mes', p_mes,
      'competencia', v_competencia,
      'tem_dados', false,
      'fonte', 'sync_run_items',
      'freshness', jsonb_build_object(
        'sync_run_id', null,
        'sync_completed_at', null,
        'stale_after', null,
        'is_fresh', false
      ),
      'integrity', jsonb_build_object(
        'source_missing_count', 0,
        'validation_issue_count', 0,
        'duplicate_fatura_count', 0,
        'unknown_status_count', 0
      ),
      'por_unidade', '[]'::jsonb,
      'totais', '{}'::jsonb,
      'inadimplencia_canonica', v_inadimplencia
    );
  end if;

  v_is_fresh := now() <= v_run.stale_after;

  with unidades_autorizadas as (
    select u.id
    from public.unidades u
    where u.ativo = true
      and (p_unidade_id is null or u.id = p_unidade_id)
      and (
        v_service_role
        or v_is_admin
        or u.id in (select public.get_user_unidade_ids())
      )
  ), itens_escopo as (
    select i.*
    from public.sync_run_items i
    join unidades_autorizadas ua on ua.id = i.unidade_id
    where i.run_id = v_run.id
      and i.competencia = v_competencia
  ), duplicatas as (
    select i.canonical_fatura_id
    from itens_escopo i
    group by i.canonical_fatura_id
    having count(*) > 1
  )
  select
    (count(*) filter (where i.source_missing is true))::integer,
    coalesce(sum(
      case
        when i.payload #> '{_la_report,validation_issues}' is null then 0
        when jsonb_typeof(i.payload #> '{_la_report,validation_issues}') = 'array'
          then jsonb_array_length(i.payload #> '{_la_report,validation_issues}')
        else 1
      end
    ), 0)::integer,
    (select count(*)::integer from duplicatas),
    (count(*) filter (where i.status not in ('aberta', 'paga', 'cancelada')))::integer
  into
    v_source_missing_count,
    v_validation_issue_count,
    v_duplicate_fatura_count,
    v_unknown_status_count
  from itens_escopo i;

  if not v_is_fresh
     or v_source_missing_count > 0
     or v_validation_issue_count > 0
     or v_duplicate_fatura_count > 0
     or v_unknown_status_count > 0 then
    return jsonb_build_object(
      'schema_version', 2,
      'status', case when not v_is_fresh then 'stale' else 'incomplete' end,
      'ano', p_ano,
      'mes', p_mes,
      'competencia', v_competencia,
      'tem_dados', false,
      'fonte', 'sync_run_items',
      'freshness', jsonb_build_object(
        'sync_run_id', v_run.id,
        'sync_completed_at', v_run.completed_at,
        'stale_after', v_run.stale_after,
        'is_fresh', v_is_fresh
      ),
      'integrity', jsonb_build_object(
        'source_missing_count', v_source_missing_count,
        'validation_issue_count', v_validation_issue_count,
        'duplicate_fatura_count', v_duplicate_fatura_count,
        'unknown_status_count', v_unknown_status_count
      ),
      'por_unidade', '[]'::jsonb,
      'totais', '{}'::jsonb,
      'inadimplencia_canonica', v_inadimplencia
    );
  end if;

  with unidades_autorizadas as (
    select u.id
    from public.unidades u
    where u.ativo = true
      and (p_unidade_id is null or u.id = p_unidade_id)
      and (
        v_service_role
        or v_is_admin
        or u.id in (select public.get_user_unidade_ids())
      )
  ), aluno_por_matricula as (
    select distinct on (a.unidade_id, btrim(a.emusys_matricula_id))
      a.unidade_id,
      btrim(a.emusys_matricula_id) as emusys_matricula_id,
      a.id as aluno_id,
      coalesce(tm.conta_como_pagante, false) as conta_como_pagante,
      coalesce(tm.entra_ticket_medio, false) as entra_ticket_medio,
      coalesce(a.is_segundo_curso, false) as is_segundo_curso,
      coalesce(c.is_projeto_banda, false) as is_projeto_banda
    from public.alunos a
    join unidades_autorizadas ua on ua.id = a.unidade_id
    left join public.tipos_matricula tm on tm.id = a.tipo_matricula_id
    left join public.cursos c on c.id = a.curso_id
    where nullif(btrim(a.emusys_matricula_id), '') is not null
    order by
      a.unidade_id,
      btrim(a.emusys_matricula_id),
      case when a.arquivado_em is null then 0 else 1 end,
      case
        when a.status in ('ativo', 'aviso_previo', 'trancado') then 0
        when a.status = 'evadido' then 1
        else 2
      end,
      case
        when coalesce(tm.conta_como_pagante, false)
          and coalesce(tm.entra_ticket_medio, false)
          and not coalesce(a.is_segundo_curso, false)
          and not coalesce(c.is_projeto_banda, false)
          then 0
        else 1
      end,
      a.data_saida desc nulls last,
      a.id desc
  ), base as (
    select
      i.*,
      u.nome as unidade_nome,
      apm.aluno_id as aluno_local_id,
      apm.conta_como_pagante,
      apm.entra_ticket_medio,
      apm.is_segundo_curso,
      apm.is_projeto_banda,
      (
        apm.aluno_id is not null
        and apm.conta_como_pagante
        and apm.entra_ticket_medio
        and not apm.is_segundo_curso
        and not apm.is_projeto_banda
      ) as ticket_elegivel,
      (lower(btrim(i.descricao)) like 'parcela %') as eh_parcela,
      case
        when i.status = 'paga' then coalesce(i.valor_pago, 0)
        when i.status = 'aberta' then
          coalesce(i.valor_original, 0)
          + coalesce(i.juros_e_multa, 0)
          - coalesce(i.desconto_aplicado, 0)
        else 0
      end as valor_competencia,
      case when i.status = 'paga' then coalesce(i.valor_pago, 0) else 0 end as valor_recebido
    from public.sync_run_items i
    join unidades_autorizadas ua on ua.id = i.unidade_id
    join public.unidades u on u.id = i.unidade_id
    left join aluno_por_matricula apm
      on apm.unidade_id = i.unidade_id
     and apm.emusys_matricula_id = i.emusys_matricula_id::text
    where i.run_id = v_run.id
      and i.competencia = v_competencia
      and i.source_missing is false
  ), agregada as (
    select
      unidade_id,
      max(unidade_nome) as unidade_nome,
      max(unidade_codigo) as unidade_codigo,
      count(*) filter (where eh_parcela) as faturas_parcela,
      count(*) filter (where eh_parcela and status = 'paga') as faturas_parcela_pagas,
      count(*) filter (where eh_parcela and status = 'aberta') as faturas_parcela_abertas,
      count(distinct emusys_student_id) filter (where eh_parcela) as alunos_emusys_com_parcela,
      count(distinct emusys_student_id) filter (where eh_parcela and status = 'paga') as alunos_emusys_com_parcela_paga,
      count(distinct emusys_student_id) filter (where eh_parcela and ticket_elegivel) as alunos_locais_com_parcela,
      count(distinct emusys_student_id) filter (
        where eh_parcela and status = 'paga' and ticket_elegivel
      ) as alunos_locais_com_parcela_paga,
      count(distinct aluno_local_id) filter (
        where eh_parcela and aluno_local_id is not null
      ) as vinculos_locais_com_parcela,
      count(distinct aluno_local_id) filter (
        where eh_parcela and status = 'paga' and aluno_local_id is not null
      ) as vinculos_locais_com_parcela_paga,
      count(distinct emusys_matricula_id) filter (
        where eh_parcela and aluno_local_id is null
      ) as matriculas_sem_match,
      sum(valor_recebido) filter (where eh_parcela) as total_recebido_parcelas,
      sum(valor_competencia) filter (
        where eh_parcela and status in ('paga', 'aberta')
      ) as faturamento_previsto_parcelas,
      sum(valor_competencia) filter (
        where eh_parcela and status = 'aberta'
      ) as valor_aberto_parcelas,
      sum(coalesce(valor_pago, 0)) filter (
        where not eh_parcela and status = 'paga'
      ) as total_recebido_nao_parcelas
    from base
    group by unidade_id
  ), por_unidade as (
    select
      unidade_id,
      unidade_nome,
      unidade_codigo,
      faturas_parcela,
      faturas_parcela_pagas,
      faturas_parcela_abertas,
      alunos_emusys_com_parcela,
      alunos_emusys_com_parcela_paga,
      alunos_locais_com_parcela,
      alunos_locais_com_parcela_paga,
      vinculos_locais_com_parcela,
      vinculos_locais_com_parcela_paga,
      matriculas_sem_match,
      coalesce(total_recebido_parcelas, 0)::numeric(12,2) as mrr_atual,
      coalesce(faturamento_previsto_parcelas, 0)::numeric(12,2) as faturamento_previsto,
      coalesce(valor_aberto_parcelas, 0)::numeric(12,2) as valor_aberto_parcelas,
      coalesce(total_recebido_nao_parcelas, 0)::numeric(12,2) as total_recebido_nao_parcelas,
      case
        when coalesce(alunos_locais_com_parcela_paga, 0) > 0
          then round(coalesce(total_recebido_parcelas, 0)::numeric / alunos_locais_com_parcela_paga, 2)
        when coalesce(alunos_emusys_com_parcela_paga, 0) > 0
          then round(coalesce(total_recebido_parcelas, 0)::numeric / alunos_emusys_com_parcela_paga, 2)
        else 0::numeric
      end as ticket_medio,
      case
        when coalesce(alunos_locais_com_parcela, 0) > 0
          then round(coalesce(faturamento_previsto_parcelas, 0)::numeric / alunos_locais_com_parcela, 2)
        when coalesce(alunos_emusys_com_parcela, 0) > 0
          then round(coalesce(faturamento_previsto_parcelas, 0)::numeric / alunos_emusys_com_parcela, 2)
        else 0::numeric
      end as ticket_medio_previsto
    from agregada
  )
  select
    coalesce(jsonb_agg(to_jsonb(pu) order by unidade_nome), '[]'::jsonb),
    coalesce(jsonb_build_object(
      'unidade_id', null,
      'unidade_nome', case when p_unidade_id is null then 'Consolidado' else max(unidade_nome) end,
      'unidade_codigo', case when p_unidade_id is null then null else max(unidade_codigo) end,
      'faturas_parcela', coalesce(sum(faturas_parcela), 0),
      'faturas_parcela_pagas', coalesce(sum(faturas_parcela_pagas), 0),
      'faturas_parcela_abertas', coalesce(sum(faturas_parcela_abertas), 0),
      'alunos_emusys_com_parcela', coalesce(sum(alunos_emusys_com_parcela), 0),
      'alunos_emusys_com_parcela_paga', coalesce(sum(alunos_emusys_com_parcela_paga), 0),
      'alunos_locais_com_parcela', coalesce(sum(alunos_locais_com_parcela), 0),
      'alunos_locais_com_parcela_paga', coalesce(sum(alunos_locais_com_parcela_paga), 0),
      'vinculos_locais_com_parcela', coalesce(sum(vinculos_locais_com_parcela), 0),
      'vinculos_locais_com_parcela_paga', coalesce(sum(vinculos_locais_com_parcela_paga), 0),
      'matriculas_sem_match', coalesce(sum(matriculas_sem_match), 0),
      'mrr_atual', coalesce(sum(mrr_atual), 0)::numeric(12,2),
      'faturamento_previsto', coalesce(sum(faturamento_previsto), 0)::numeric(12,2),
      'valor_aberto_parcelas', coalesce(sum(valor_aberto_parcelas), 0)::numeric(12,2),
      'total_recebido_nao_parcelas', coalesce(sum(total_recebido_nao_parcelas), 0)::numeric(12,2),
      'ticket_medio', case
        when coalesce(sum(alunos_locais_com_parcela_paga), 0) > 0
          then round(coalesce(sum(mrr_atual), 0)::numeric / sum(alunos_locais_com_parcela_paga), 2)
        when coalesce(sum(alunos_emusys_com_parcela_paga), 0) > 0
          then round(coalesce(sum(mrr_atual), 0)::numeric / sum(alunos_emusys_com_parcela_paga), 2)
        else 0::numeric
      end,
      'ticket_medio_previsto', case
        when coalesce(sum(alunos_locais_com_parcela), 0) > 0
          then round(coalesce(sum(faturamento_previsto), 0)::numeric / sum(alunos_locais_com_parcela), 2)
        when coalesce(sum(alunos_emusys_com_parcela), 0) > 0
          then round(coalesce(sum(faturamento_previsto), 0)::numeric / sum(alunos_emusys_com_parcela), 2)
        else 0::numeric
      end
    ), '{}'::jsonb)
  into v_por_unidade, v_totais
  from por_unidade pu;

  return jsonb_build_object(
    'schema_version', 2,
    'status', 'ok',
    'ano', p_ano,
    'mes', p_mes,
    'competencia', v_competencia,
    'tem_dados', jsonb_array_length(v_por_unidade) > 0,
    'fonte', 'sync_run_items',
    'regra', 'Ultimo snapshot live completo e fresco; source_missing nunca e pagamento; parcela cancelada nao compoe aberto/previsto; inadimplencia usa a leitura canonica contratual.',
    'freshness', jsonb_build_object(
      'sync_run_id', v_run.id,
      'sync_completed_at', v_run.completed_at,
      'stale_after', v_run.stale_after,
      'is_fresh', true
    ),
    'integrity', jsonb_build_object(
      'source_missing_count', 0,
      'validation_issue_count', 0,
      'duplicate_fatura_count', 0,
      'unknown_status_count', 0
    ),
    'por_unidade', v_por_unidade,
    'totais', v_totais,
    'inadimplencia_canonica', v_inadimplencia
  );
end;
$function$;

revoke all on function public.get_financeiro_faturas_emusys(uuid, integer, integer)
  from public, anon;
grant execute on function public.get_financeiro_faturas_emusys(uuid, integer, integer)
  to authenticated, service_role;

comment on function public.get_financeiro_faturas_emusys(uuid, integer, integer) is
  'Relatorio financeiro por snapshot imutavel completo e fresco; falha fechado em stale/integridade e anexa get_inadimplencia_canonica sem regravar fechamentos.';
