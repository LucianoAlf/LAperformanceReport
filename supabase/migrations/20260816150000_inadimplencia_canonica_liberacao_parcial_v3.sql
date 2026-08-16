-- Contrato v3 da inadimplencia canonica.
-- Somente faturas confirmadas de matriculas operacionalmente ativas podem ser
-- acionadas. source_missing permanece em quarentena e nao contamina os totais.

create or replace function public.get_inadimplencia_canonica(
  p_unidade_id uuid default null,
  p_as_of_date date default (now() at time zone 'America/Sao_Paulo')::date
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_role text := coalesce(auth.role(), '');
  v_service_role boolean := false;
  v_is_admin boolean := false;
  v_result jsonb;
begin
  if p_as_of_date is null
     or p_as_of_date > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception using
      errcode = '22023',
      message = 'p_as_of_date nao pode estar no futuro';
  end if;

  if v_role not in ('authenticated', 'service_role') then
    raise exception using
      errcode = '42501',
      message = 'papel nao autorizado para consultar inadimplencia';
  end if;

  v_service_role := v_role = 'service_role';

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

  with unidades_autorizadas as (
    select u.id
    from public.unidades u
    where u.ativo is true
      and (p_unidade_id is null or u.id = p_unidade_id)
      and (
        v_service_role
        or v_is_admin
        or u.id in (select public.get_user_unidade_ids())
      )
  ),
  janela_competencias as (
    select
      (date_trunc('month', p_as_of_date)::date - interval '2 months')::date as inicio,
      date_trunc('month', p_as_of_date)::date as fim
  ),
  matriculas_financeiras_ativas as (
    select distinct
      estado.unidade_id,
      btrim(estado.emusys_matricula_id) as emusys_matricula_id
    from public.vw_alunos_estado_operacional_v131 estado
    join public.alunos a on a.id = estado.aluno_id
    join unidades_autorizadas ua on ua.id = estado.unidade_id
    where estado.entra_financeiro_ativo is true
      and nullif(btrim(estado.emusys_matricula_id), '') is not null
      and a.arquivado_em is null
      and a.data_saida is null
  ),
  candidatos_ativos_por_student_id as (
    select distinct
      estado.unidade_id,
      btrim(a.emusys_student_id) as emusys_student_id
    from public.vw_alunos_estado_operacional_v131 estado
    join public.alunos a on a.id = estado.aluno_id
    join unidades_autorizadas ua on ua.id = estado.unidade_id
    where estado.entra_financeiro_ativo is true
      and nullif(btrim(a.emusys_student_id), '') is not null
      and a.arquivado_em is null
      and a.data_saida is null
  ),
  matriculas_locais_conhecidas as (
    select distinct
      a.unidade_id,
      btrim(a.emusys_matricula_id) as emusys_matricula_id
    from public.alunos a
    join unidades_autorizadas ua on ua.id = a.unidade_id
    where nullif(btrim(a.emusys_matricula_id), '') is not null
  ),
  runs_elegiveis as (
    select
      sr.id,
      sr.competencia,
      sr.completed_at,
      sr.stale_after,
      row_number() over (
        partition by sr.competencia
        order by sr.completed_at desc nulls last, sr.id desc
      ) as ordem
    from public.sync_runs sr
    cross join janela_competencias jc
    where sr.run_type = 'live'
      and sr.status = 'succeeded'
      and sr.snapshot_complete is true
      and sr.unidades_concluidas = 3
      and sr.completed_at is not null
      and sr.competencia between jc.inicio and jc.fim
  ),
  ultimo_run_por_competencia as (
    select
      re.id,
      re.competencia,
      re.completed_at,
      re.stale_after
    from runs_elegiveis re
    where re.ordem = 1
  ),
  linhas_ultimo_snapshot as (
    select
      i.canonical_fatura_id,
      i.unidade_id,
      i.unidade_codigo,
      i.competencia,
      i.run_id,
      ur.completed_at as sync_completed_at,
      ur.stale_after as sync_fresh_until,
      i.emusys_fatura_id,
      i.emusys_matricula_id,
      i.emusys_contrato_id,
      i.emusys_student_id,
      i.descricao,
      i.status,
      i.data_vencimento,
      i.data_pagamento,
      i.valor_original,
      i.desconto_condicional,
      i.source_missing,
      i.source_missing_reason,
      i.source_missing_detected_at,
      case
        when i.payload #> '{_la_report,validation_issues}' is null
          then '[]'::jsonb
        when jsonb_typeof(i.payload #> '{_la_report,validation_issues}') = 'array'
          then i.payload #> '{_la_report,validation_issues}'
        else jsonb_build_array(jsonb_build_object(
          'field', 'validation_issues',
          'code', 'invalid_validation_metadata'
        ))
      end as validation_issues,
      exists (
        select 1
        from matriculas_financeiras_ativas mfa
        where mfa.unidade_id = i.unidade_id
          and i.emusys_matricula_id is not null
          and mfa.emusys_matricula_id = btrim(i.emusys_matricula_id::text)
      ) as tem_matricula_ativa,
      exists (
        select 1
        from matriculas_locais_conhecidas mlc
        where mlc.unidade_id = i.unidade_id
          and i.emusys_matricula_id is not null
          and mlc.emusys_matricula_id = btrim(i.emusys_matricula_id::text)
      ) as tem_matricula_local_conhecida,
      exists (
        select 1
        from candidatos_ativos_por_student_id cap
        where cap.unidade_id = i.unidade_id
          and i.emusys_student_id is not null
          and cap.emusys_student_id = btrim(i.emusys_student_id::text)
      ) as tem_candidato_ativo_por_student_id
    from ultimo_run_por_competencia ur
    join public.sync_run_items i on i.run_id = ur.id
    join unidades_autorizadas ua on ua.id = i.unidade_id
    cross join janela_competencias jc
    where i.competencia between jc.inicio and jc.fim
      and i.data_vencimento < p_as_of_date
  ),
  linhas_avaliadas as (
    select
      lus.*,
      (
        jsonb_array_length(lus.validation_issues) > 0
        or lus.emusys_matricula_id is null
        or (
          lus.emusys_matricula_id is not null
          and lus.tem_matricula_ativa is false
          and lus.tem_matricula_local_conhecida is false
        )
      ) as identidade_invalida,
      btrim(lus.status) not in ('aberta', 'paga', 'cancelada')
        as status_nao_suportado
    from linhas_ultimo_snapshot lus
  ),
  grupos_fatura_todos as (
    select
      la.unidade_id,
      la.canonical_fatura_id,
      bool_or(la.tem_matricula_ativa is true) as tem_matricula_ativa,
      bool_or(la.source_missing is true) as tem_source_missing,
      count(*) filter (
        where la.source_missing is false
          and la.status = 'aberta'
      )::integer as confirmed_count,
      bool_or(la.identidade_invalida is true) as tem_identidade_invalida,
      bool_or(la.status_nao_suportado is true) as tem_status_nao_suportado,
      coalesce(
        bool_or(la.status = 'aberta') filter (where la.source_missing is true),
        false
      ) as tem_last_known_aberta,
      count(*)::integer as linhas
    from linhas_avaliadas la
    group by la.unidade_id, la.canonical_fatura_id
  ),
  grupos_fatura as (
    select gft.*
    from grupos_fatura_todos gft
    where (
        gft.tem_matricula_ativa is true
        or gft.tem_identidade_invalida is true
      )
      and (
        gft.tem_source_missing is true
        or gft.confirmed_count > 0
        or gft.tem_identidade_invalida is true
        or (
          gft.tem_matricula_ativa is true
          and gft.tem_status_nao_suportado is true
        )
      )
  ),
  linhas_relevantes as (
    select la.*
    from linhas_avaliadas la
    join grupos_fatura gf
      on gf.unidade_id = la.unidade_id
     and gf.canonical_fatura_id = la.canonical_fatura_id
  ),
  competencias_necessarias as (
    select distinct
      lr.competencia,
      lr.run_id,
      lr.sync_completed_at,
      lr.sync_fresh_until
    from linhas_relevantes lr
  ),
  frescor as (
    select
      cn.competencia,
      cn.run_id,
      cn.sync_completed_at as completed_at,
      cn.sync_fresh_until as fresh_until,
      now() <= cn.sync_fresh_until as is_fresh
    from competencias_necessarias cn
  ),
  duplicatas_canonicas as (
    select
      gf.unidade_id,
      gf.canonical_fatura_id,
      gf.confirmed_count,
      gf.linhas
    from grupos_fatura gf
    where gf.tem_source_missing is false
      and gf.confirmed_count > 1
  ),
  grupos_status_nao_suportado as (
    select
      gf.unidade_id,
      gf.canonical_fatura_id
    from grupos_fatura gf
    where gf.tem_matricula_ativa is true
      and gf.tem_status_nao_suportado is true
  ),
  linhas_unknown_ranqueadas as (
    select
      lr.*,
      row_number() over (
        partition by lr.unidade_id, lr.canonical_fatura_id
        order by lr.source_missing desc,
                 lr.source_missing_detected_at desc nulls last,
                 lr.sync_completed_at desc nulls last,
                 lr.emusys_fatura_id desc nulls last
      ) as rn
    from linhas_relevantes lr
  ),
  itens_indeterminados as (
    select lur.*
    from linhas_unknown_ranqueadas lur
    join grupos_fatura gf
      on gf.unidade_id = lur.unidade_id
     and gf.canonical_fatura_id = lur.canonical_fatura_id
    where gf.tem_source_missing is true
      and lur.rn = 1
  ),
  linhas_invalidas_ranqueadas as (
    select
      lr.*,
      row_number() over (
        partition by lr.unidade_id, lr.canonical_fatura_id
        order by lr.identidade_invalida desc,
                 lr.source_missing desc,
                 lr.sync_completed_at desc nulls last,
                 lr.emusys_fatura_id desc nulls last
      ) as rn
    from linhas_relevantes lr
  ),
  itens_identidade_invalida as (
    select lir.*
    from linhas_invalidas_ranqueadas lir
    join grupos_fatura gf
      on gf.unidade_id = lir.unidade_id
     and gf.canonical_fatura_id = lir.canonical_fatura_id
    where gf.tem_identidade_invalida is true
      and lir.rn = 1
  ),
  linhas_confirmadas_ranqueadas as (
    select
      lr.*,
      row_number() over (
        partition by lr.unidade_id, lr.canonical_fatura_id
        order by lr.competencia desc,
                 lr.data_vencimento,
                 lr.emusys_fatura_id desc nulls last
      ) as rn
    from linhas_relevantes lr
    where lr.status = 'aberta'
      and lr.source_missing is false
      and lr.tem_matricula_ativa is true
      and lr.identidade_invalida is false
  ),
  itens_confirmados as (
    select
      lcr.*,
      greatest(p_as_of_date - lcr.data_vencimento, 0) as dias_atraso,
      round(
        lcr.valor_original * (
          1::numeric
          + 0.02::numeric
          + 0.01::numeric
            * greatest(p_as_of_date - lcr.data_vencimento, 0)::numeric
            / 30::numeric
        ),
        2
      ) as valor_atualizado
    from linhas_confirmadas_ranqueadas lcr
    join grupos_fatura gf
      on gf.unidade_id = lcr.unidade_id
     and gf.canonical_fatura_id = lcr.canonical_fatura_id
    where lcr.rn = 1
      and gf.tem_source_missing is false
      and gf.confirmed_count = 1
      and gf.tem_identidade_invalida is false
      and gf.tem_status_nao_suportado is false
  ),
  resumo_frescor as (
    select
      count(*)::integer as competencias_necessarias,
      count(*) filter (where f.is_fresh)::integer as competencias_frescas,
      count(*) filter (where not f.is_fresh)::integer as competencias_stale,
      min(f.completed_at) as ultimo_sync_mais_antigo,
      min(f.fresh_until) as fresh_until
    from frescor f
  ),
  resumo_source_missing as (
    select
      count(*) filter (where gf.tem_source_missing)::integer as source_missing_count,
      count(*) filter (
        where gf.tem_source_missing and gf.tem_last_known_aberta
      )::integer as source_missing_open_count,
      count(*) filter (
        where gf.tem_source_missing and not gf.tem_last_known_aberta
      )::integer as source_missing_other_count
    from grupos_fatura gf
  ),
  resumo_integridade as (
    select
      (select count(*)::integer from duplicatas_canonicas) as duplicate_fatura_count,
      (select count(*)::integer from itens_identidade_invalida) as invalid_identity_invoice_count,
      (select count(*)::integer from grupos_status_nao_suportado)
        as unsupported_invoice_status_count,
      coalesce((
        select sum(jsonb_array_length(iii.validation_issues))::integer
        from itens_identidade_invalida iii
      ), 0) as validation_issue_count
  ),
  resumo_itens as (
    select
      count(*)::integer as total_faturas,
      count(distinct (ic.unidade_id, ic.emusys_matricula_id))::integer as total_matriculas,
      coalesce(sum(ic.valor_original), 0)::numeric as total_original,
      coalesce(sum(ic.valor_atualizado), 0)::numeric as total_atualizado,
      coalesce(max(ic.dias_atraso), 0)::integer as maior_atraso
    from itens_confirmados ic
  ),
  estado_global as (
    select
      case
        when rf.competencias_stale > 0 then 'stale'
        when ri.unsupported_invoice_status_count > 0 then 'error'
        when ri.duplicate_fatura_count > 0
          or ri.invalid_identity_invoice_count > 0 then 'incomplete'
        when rsm.source_missing_count > 0 then 'partial'
        else 'ok'
      end as status,
      array_remove(array[
        case when rf.competencias_stale > 0 then 'stale_competencia' end,
        case when ri.duplicate_fatura_count > 0 then 'duplicate_confirmed_fatura' end,
        case when ri.invalid_identity_invoice_count > 0 then 'invalid_invoice_identity' end
      ]::text[], null) as block_reasons
    from resumo_frescor rf
    cross join resumo_integridade ri
    cross join resumo_source_missing rsm
  )
  select jsonb_build_object(
    'schema_version', 3,
    'policy', jsonb_build_object(
      'student_scope', 'vw_alunos_estado_operacional_v131.entra_financeiro_ativo=true AND arquivado_em IS NULL AND data_saida IS NULL',
      'competencias_inicio', jc.inicio,
      'competencia_fim', jc.fim
    ),
    'status', eg.status,
    'error', case
      when ri.unsupported_invoice_status_count > 0 then 'unsupported_invoice_status'
      else null
    end,
    'fonte', 'sync_run_items',
    'avaliado_em', now(),
    'unidade_id', p_unidade_id,
    'as_of_date', p_as_of_date,
    'operational', jsonb_build_object(
      'collection_allowed', eg.status in ('ok', 'partial'),
      'collection_scope', case
        when eg.status in ('ok', 'partial') then 'confirmed_only'
        else 'blocked'
      end,
      'block_reasons', to_jsonb(eg.block_reasons)
    ),
    'freshness', jsonb_build_object(
      'policy', 'sync_runs.stale_after',
      'competencias_necessarias', rf.competencias_necessarias,
      'competencias_frescas', rf.competencias_frescas,
      'competencias_stale', rf.competencias_stale,
      'ultimo_sync_mais_antigo', rf.ultimo_sync_mais_antigo,
      'fresh_until', rf.fresh_until,
      'competencias', coalesce((
        select jsonb_agg(jsonb_build_object(
          'competencia', f.competencia,
          'run_id', f.run_id,
          'completed_at', f.completed_at,
          'fresh_until', f.fresh_until,
          'is_fresh', f.is_fresh
        ) order by f.competencia)
        from frescor f
      ), '[]'::jsonb)
    ),
    'reconciliation', jsonb_build_object(
      'status', case
        when rsm.source_missing_count > 0
          or ri.duplicate_fatura_count > 0
          or ri.invalid_identity_invoice_count > 0 then 'pending'
        else 'clear'
      end,
      'source_missing_count', rsm.source_missing_count,
      'source_missing_open_count', rsm.source_missing_open_count,
      'source_missing_other_count', rsm.source_missing_other_count,
      'duplicate_fatura_count', ri.duplicate_fatura_count,
      'invalid_identity_invoice_count', ri.invalid_identity_invoice_count,
      'validation_issue_count', ri.validation_issue_count,
      'unknown_invoices', coalesce((
        select jsonb_agg(jsonb_build_object(
          'unidade_id', ii.unidade_id,
          'canonical_fatura_id', ii.canonical_fatura_id,
          'emusys_fatura_id', ii.emusys_fatura_id,
          'emusys_matricula_id', ii.emusys_matricula_id,
          'emusys_student_id', ii.emusys_student_id,
          'competencia', ii.competencia,
          'data_vencimento', ii.data_vencimento,
          'last_known_status', ii.status,
          'last_known_valor_original', round(ii.valor_original, 2),
          'source_missing_reason', ii.source_missing_reason,
          'source_missing_detected_at', ii.source_missing_detected_at,
          'sync_completed_at', ii.sync_completed_at
        ) order by ii.unidade_id, ii.data_vencimento, ii.canonical_fatura_id)
        from itens_indeterminados ii
      ), '[]'::jsonb),
      'duplicate_invoices', coalesce((
        select jsonb_agg(jsonb_build_object(
          'unidade_id', dc.unidade_id,
          'canonical_fatura_id', dc.canonical_fatura_id,
          'confirmed_count', dc.confirmed_count,
          'linhas', dc.linhas
        ) order by dc.unidade_id, dc.canonical_fatura_id)
        from duplicatas_canonicas dc
      ), '[]'::jsonb),
      'invalid_identity_invoices', coalesce((
        select jsonb_agg(jsonb_build_object(
          'unidade_id', iii.unidade_id,
          'canonical_fatura_id', iii.canonical_fatura_id,
          'emusys_fatura_id', iii.emusys_fatura_id,
          'emusys_matricula_id', iii.emusys_matricula_id,
          'emusys_student_id', iii.emusys_student_id,
          'competencia', iii.competencia,
          'data_vencimento', iii.data_vencimento,
          'validation_issues', iii.validation_issues,
          'active_candidate_by_student_id', iii.tem_candidato_ativo_por_student_id,
          'sync_completed_at', iii.sync_completed_at
        ) order by iii.unidade_id, iii.data_vencimento, iii.canonical_fatura_id)
        from itens_identidade_invalida iii
      ), '[]'::jsonb)
    ),
    'totals', case
      when eg.status in ('stale', 'incomplete', 'error') then jsonb_build_object(
        'total_faturas', 0,
        'total_matriculas', 0,
        'total_original', 0,
        'total_atualizado', 0,
        'maior_atraso', 0
      )
      else jsonb_build_object(
        'total_faturas', rit.total_faturas,
        'total_matriculas', rit.total_matriculas,
        'total_original', round(rit.total_original, 2),
        'total_atualizado', round(rit.total_atualizado, 2),
        'maior_atraso', rit.maior_atraso
      )
    end,
    'items', case
      when eg.status in ('stale', 'incomplete', 'error') then '[]'::jsonb
      else coalesce((
        select jsonb_agg(jsonb_build_object(
          'canonical_fatura_id', ic.canonical_fatura_id,
          'unidade_id', ic.unidade_id,
          'unidade_codigo', ic.unidade_codigo,
          'competencia', ic.competencia,
          'run_id', ic.run_id,
          'sync_completed_at', ic.sync_completed_at,
          'sync_fresh_until', ic.sync_fresh_until,
          'emusys_fatura_id', ic.emusys_fatura_id,
          'emusys_matricula_id', ic.emusys_matricula_id,
          'emusys_contrato_id', ic.emusys_contrato_id,
          'descricao', ic.descricao,
          'status', ic.status,
          'data_vencimento', ic.data_vencimento,
          'data_pagamento', ic.data_pagamento,
          'dias_atraso', ic.dias_atraso,
          'valor_original', round(ic.valor_original, 2),
          'desconto_condicional_perdido', round(coalesce(ic.desconto_condicional, 0), 2),
          'multa_pct', 0.02,
          'mora_pct_mes', 0.01,
          'valor_atualizado', ic.valor_atualizado,
          'source_missing', false
        ) order by ic.unidade_id, ic.data_vencimento, ic.canonical_fatura_id)
        from itens_confirmados ic
      ), '[]'::jsonb)
    end
  ) into v_result
  from janela_competencias jc
  cross join resumo_frescor rf
  cross join resumo_source_missing rsm
  cross join resumo_integridade ri
  cross join resumo_itens rit
  cross join estado_global eg;

  return v_result;
end;
$function$;

comment on function public.get_inadimplencia_canonica(uuid, date) is
  'Contrato v3: inadimplencia confirmada, gate de frescor e quarentena source_missing.';

revoke all on function public.get_inadimplencia_canonica(uuid, date)
  from public, anon;
grant execute on function public.get_inadimplencia_canonica(uuid, date)
  to authenticated, service_role;
