-- Checkpoint 2: leitura canônica de inadimplência.
--
-- Contrato da leitura:
--   * uma linha por fatura canônica (canonical_fatura_id);
--   * somente snapshot live completo, status aberta, vencimento passado e
--     source_missing IS FALSE;
--   * qualquer competência conhecida com fatura aberta/indeterminada precisa
--     estar fresca. Se uma estiver velha ou sem snapshot completo, items=[];
--   * source_missing é reconciliação pendente, nunca pagamento;
--   * juros centralizados: valor_original + multa de 2% + mora de 1% ao mês
--     pro rata die. A taxa está no contrato da função e só muda via migration.
--
-- Esta função é uma leitura. O sync, a fila e os consumidores serão migrados em
-- checkpoints separados. Ela não chama nem altera nenhuma RPC operacional da Sol.

create or replace function public.get_inadimplencia_canonica(
  p_unidade_id uuid default null,
  p_max_age_minutes integer default 30,
  p_as_of_date date default current_date
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_service_role boolean := coalesce(auth.role(), '') = 'service_role';
  v_is_admin boolean := false;
  v_result jsonb;
begin
  if p_max_age_minutes is null or p_max_age_minutes < 1 or p_max_age_minutes > 1440 then
    raise exception using
      errcode = '22023',
      message = 'p_max_age_minutes deve estar entre 1 e 1440';
  end if;

  if p_as_of_date is null or p_as_of_date > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception using
      errcode = '22023',
      message = 'p_as_of_date não pode estar no futuro';
  end if;

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
        message = 'usuário não autorizado para esta unidade';
    end if;
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
  ),
  ultimo_run_por_competencia as (
    select distinct on (sr.competencia)
           sr.id,
           sr.competencia,
           sr.completed_at,
           sr.stale_after
    from public.sync_runs sr
    where sr.run_type = 'live'
      and sr.status = 'succeeded'
      and sr.snapshot_complete = true
      and sr.unidades_concluidas = 3
    order by sr.competencia, sr.completed_at desc nulls last, sr.id desc
  ),
  competencias_necessarias as (
    select distinct i.unidade_id, i.competencia
    from public.sync_run_items i
    join unidades_autorizadas ua on ua.id = i.unidade_id
    where i.status = 'aberta'
       or i.source_missing is true
  ),
  frescor as (
    select cn.unidade_id,
           cn.competencia,
           ur.id as run_id,
           ur.completed_at,
           case
             when ur.id is null then null::timestamptz
             else least(
               ur.stale_after,
               ur.completed_at + make_interval(mins => p_max_age_minutes)
             )
           end as fresh_until,
           (
             ur.id is not null
             and now() <= least(
               ur.stale_after,
               ur.completed_at + make_interval(mins => p_max_age_minutes)
             )
           ) as is_fresh
    from competencias_necessarias cn
    left join ultimo_run_por_competencia ur on ur.competencia = cn.competencia
  ),
  itens_confirmados as (
    select i.canonical_fatura_id,
           i.unidade_id,
           i.unidade_codigo,
           i.competencia,
           i.run_id,
           f.completed_at as sync_completed_at,
           f.fresh_until as sync_fresh_until,
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
           i.juros_e_multa as juros_e_multa_fonte,
           greatest(p_as_of_date - i.data_vencimento, 0) as dias_atraso,
           round(
             i.valor_original * (
               1 + 0.02 +
               0.01 * (greatest(p_as_of_date - i.data_vencimento, 0)::numeric / 30.0)
             ),
             2
           ) as valor_atualizado
    from frescor f
    join public.sync_run_items i
      on i.run_id = f.run_id
     and i.unidade_id = f.unidade_id
     and i.competencia = f.competencia
    where f.is_fresh
      and i.status = 'aberta'
      and i.source_missing is false
      and i.data_vencimento <= p_as_of_date
  ),
  itens_indeterminados as (
    select i.canonical_fatura_id,
           i.unidade_id,
           i.unidade_codigo,
           i.competencia,
           i.run_id,
           f.completed_at as sync_completed_at,
           f.fresh_until as sync_fresh_until,
           i.emusys_fatura_id,
           i.emusys_matricula_id,
           i.emusys_contrato_id,
           i.emusys_student_id,
           i.data_vencimento,
           i.source_missing_reason,
           i.source_missing_detected_at
    from frescor f
    join public.sync_run_items i
      on i.run_id = f.run_id
     and i.unidade_id = f.unidade_id
     and i.competencia = f.competencia
    where f.is_fresh
      and i.source_missing is true
  ),
  resumo_itens as (
    select count(*)::integer as total_faturas,
           (count(distinct (unidade_id, emusys_matricula_id))
             filter (where emusys_matricula_id is not null))::integer as total_matriculas,
           coalesce(sum(valor_original), 0)::numeric as total_original,
           coalesce(sum(valor_atualizado), 0)::numeric as total_atualizado,
           coalesce(max(dias_atraso), 0)::integer as maior_atraso
    from itens_confirmados
  ),
  resumo_frescor as (
    select count(*)::integer as competencias_necessarias,
           (count(*) filter (where is_fresh))::integer as competencias_frescas,
           (count(*) filter (where not is_fresh))::integer as competencias_stale,
           min(completed_at) as ultimo_sync_mais_antigo,
           min(fresh_until) as frescor_valido_ate
    from frescor
  ),
  resumo_indeterminado as (
    select count(*)::integer as source_missing_count
    from itens_indeterminados
  )
  select jsonb_build_object(
    'schema_version', 1,
    'status', case
      when rf.competencias_stale > 0 then 'stale'
      when ri.source_missing_count > 0 then 'incomplete'
      else 'ok'
    end,
    'fonte', 'sync_run_items',
    'avaliado_em', now(),
    'unidade_id', p_unidade_id,
    'as_of_date', p_as_of_date,
    'freshness', jsonb_build_object(
      'max_age_minutes', p_max_age_minutes,
      'competencias_necessarias', rf.competencias_necessarias,
      'competencias_frescas', rf.competencias_frescas,
      'competencias_stale', rf.competencias_stale,
      'ultimo_sync_mais_antigo', rf.ultimo_sync_mais_antigo,
      'fresh_until', rf.frescor_valido_ate,
      'competencias', coalesce((
        select jsonb_agg(jsonb_build_object(
          'unidade_id', f.unidade_id,
          'competencia', f.competencia,
          'run_id', f.run_id,
          'completed_at', f.completed_at,
          'fresh_until', f.fresh_until,
          'is_fresh', f.is_fresh
        ) order by f.unidade_id, f.competencia)
        from frescor f
      ), '[]'::jsonb)
    ),
    'reconciliation', jsonb_build_object(
      'status', case when ri.source_missing_count > 0 then 'pending' else 'clear' end,
      'source_missing_count', ri.source_missing_count,
      'unknown_invoices', coalesce((
        select jsonb_agg(jsonb_build_object(
          'canonical_fatura_id', i.canonical_fatura_id,
          'unidade_id', i.unidade_id,
          'unidade_codigo', i.unidade_codigo,
          'competencia', i.competencia,
          'run_id', i.run_id,
          'emusys_fatura_id', i.emusys_fatura_id,
          'emusys_matricula_id', i.emusys_matricula_id,
          'emusys_contrato_id', i.emusys_contrato_id,
          'emusys_student_id', i.emusys_student_id,
          'data_vencimento', i.data_vencimento,
          'source_missing_reason', i.source_missing_reason,
          'source_missing_detected_at', i.source_missing_detected_at,
          'sync_completed_at', i.sync_completed_at,
          'sync_fresh_until', i.sync_fresh_until
        ) order by i.data_vencimento, i.canonical_fatura_id)
        from itens_indeterminados i
      ), '[]'::jsonb)
    ),
    'totals', case
      when rf.competencias_stale > 0 then jsonb_build_object(
        'total_faturas', 0,
        'total_matriculas', 0,
        'total_original', 0,
        'total_atualizado', 0,
        'maior_atraso', 0
      )
      else jsonb_build_object(
        'total_faturas', rs.total_faturas,
        'total_matriculas', rs.total_matriculas,
        'total_original', round(rs.total_original, 2),
        'total_atualizado', round(rs.total_atualizado, 2),
        'maior_atraso', rs.maior_atraso
      )
    end,
    'items', case
      when rf.competencias_stale > 0 then '[]'::jsonb
      else coalesce((
        select jsonb_agg(jsonb_build_object(
          'canonical_fatura_id', i.canonical_fatura_id,
          'unidade_id', i.unidade_id,
          'unidade_codigo', i.unidade_codigo,
          'competencia', i.competencia,
          'run_id', i.run_id,
          'sync_completed_at', i.sync_completed_at,
          'sync_fresh_until', i.sync_fresh_until,
          'emusys_fatura_id', i.emusys_fatura_id,
          'emusys_matricula_id', i.emusys_matricula_id,
          'emusys_contrato_id', i.emusys_contrato_id,
          'emusys_student_id', i.emusys_student_id,
          'descricao', i.descricao,
          'status', i.status,
          'data_vencimento', i.data_vencimento,
          'data_pagamento', i.data_pagamento,
          'dias_atraso', i.dias_atraso,
          'valor_original', round(i.valor_original, 2),
          'desconto_condicional_perdido', round(coalesce(i.desconto_condicional, 0), 2),
          'juros_e_multa_fonte', round(i.juros_e_multa_fonte, 2),
          'multa_pct', 0.02,
          'mora_pct_mes', 0.01,
          'valor_atualizado', i.valor_atualizado,
          'source_missing', false
        ) order by i.data_vencimento, i.canonical_fatura_id)
        from itens_confirmados i
      ), '[]'::jsonb)
    end
  )
  into v_result
  from resumo_frescor rf
  cross join resumo_itens rs
  cross join resumo_indeterminado ri;

  return v_result;
end;
$function$;

comment on function public.get_inadimplencia_canonica(uuid, integer, date)
is 'Leitura canônica por fatura/matrícula; falha fechada em snapshot stale, source_missing é reconciliação pendente e juros seguem multa 2% + mora 1% ao mês pro rata die.';

revoke all on function public.get_inadimplencia_canonica(uuid, integer, date)
  from public, anon;
grant execute on function public.get_inadimplencia_canonica(uuid, integer, date)
  to authenticated, service_role;
