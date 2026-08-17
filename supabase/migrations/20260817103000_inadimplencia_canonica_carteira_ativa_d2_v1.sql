-- A leitura canônica é a fonte da Sol. Ela precisa devolver uma carteira já
-- operacional: somente aluno atualmente ativo, até três competências e com a
-- carência D+2 já aplicada. Trancados, evadidos, arquivados e históricos
-- continuam no histórico de faturas, mas nunca nesta fila de cobrança.

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
  v_base jsonb;
  v_items jsonb;
  v_total_faturas integer := 0;
  v_total_matriculas integer := 0;
  v_total_original numeric := 0;
  v_total_atualizado numeric := 0;
  v_maior_atraso integer := 0;
  v_inicio_competencia date := (
    date_trunc('month', p_as_of_date)::date - interval '2 months'
  )::date;
  v_fim_competencia date := date_trunc('month', p_as_of_date)::date;
  v_collection_allowed boolean := false;
begin
  -- A função-base preserva autorização, frescor, identidade exata, quarentena
  -- e a leitura parcial. Esta camada somente fecha a régua operacional D+2 e
  -- reforça que o aluno deve estar ativo agora.
  v_base := public.get_inadimplencia_canonica_v3_base(p_unidade_id, p_as_of_date);
  v_collection_allowed := coalesce(
    (v_base #>> '{operational,collection_allowed}')::boolean,
    false
  );

  with itens_brutos as (
    select item, ordinality
    from jsonb_array_elements(coalesce(v_base -> 'items', '[]'::jsonb))
      with ordinality as linhas(item, ordinality)
  ),
  itens_elegiveis as (
    select ib.item, ib.ordinality
    from itens_brutos ib
    left join lateral (
      select bool_or(
        coalesce(estado.entra_financeiro_ativo, false)
        and aluno.arquivado_em is null
      ) as aluno_financeiro_ativo
      from public.alunos aluno
      join public.vw_alunos_estado_operacional_v131 estado
        on estado.aluno_id = aluno.id
      where aluno.id = case
        when coalesce(ib.item ->> 'aluno_id_canonico', '') ~ '^[0-9]+$'
          then (ib.item ->> 'aluno_id_canonico')::integer
        else null
      end
        and aluno.unidade_id = (ib.item ->> 'unidade_id')::uuid
        and nullif(btrim(aluno.emusys_matricula_id), '')
          = nullif(btrim(ib.item ->> 'emusys_matricula_id'), '')
    ) estado_atual on true
    where coalesce(estado_atual.aluno_financeiro_ativo, false)
      and coalesce((ib.item ->> 'source_missing')::boolean, false) is false
      and coalesce(ib.item ->> 'status', '') = 'aberta'
      and coalesce((ib.item ->> 'dias_atraso')::integer, 0) >= 2
      and (ib.item ->> 'competencia')::date between v_inicio_competencia and v_fim_competencia
  ),
  recalculados as (
    select
      ie.ordinality,
      ie.item || jsonb_build_object(
        'valor_com_desconto', valores.calculo -> 'valor_com_desconto',
        'valor_sem_desconto_condicional', valores.calculo -> 'valor_sem_desconto_condicional',
        'multa', valores.calculo -> 'multa',
        'mora', valores.calculo -> 'mora',
        'valor_atualizado', valores.calculo -> 'valor_hoje'
      ) as item
    from itens_elegiveis ie
    left join lateral (
      select i.desconto_fixo
      from public.sync_run_items i
      where i.run_id = (ie.item ->> 'run_id')::uuid
        and i.unidade_id = (ie.item ->> 'unidade_id')::uuid
        and i.canonical_fatura_id::text = ie.item ->> 'canonical_fatura_id'
        and i.emusys_fatura_id::text = ie.item ->> 'emusys_fatura_id'
        and i.competencia = (ie.item ->> 'competencia')::date
      limit 1
    ) snapshot on true
    cross join lateral (
      select public.calcular_valores_fatura_financeiro_v1(
        (ie.item ->> 'valor_original')::numeric,
        snapshot.desconto_fixo,
        coalesce(
          nullif(ie.item ->> 'desconto_condicional_perdido', '')::numeric,
          nullif(ie.item ->> 'desconto_condicional', '')::numeric,
          0
        ),
        (ie.item ->> 'data_vencimento')::date,
        coalesce(ie.item ->> 'status', 'aberta'),
        p_as_of_date
      ) as calculo
    ) valores
  )
  select
    coalesce(jsonb_agg(item order by ordinality), '[]'::jsonb),
    count(*)::integer,
    count(distinct nullif(item ->> 'emusys_matricula_id', ''))::integer,
    coalesce(round(sum((item ->> 'valor_original')::numeric), 2), 0),
    coalesce(round(sum((item ->> 'valor_atualizado')::numeric), 2), 0),
    coalesce(max((item ->> 'dias_atraso')::integer), 0)
  into
    v_items,
    v_total_faturas,
    v_total_matriculas,
    v_total_original,
    v_total_atualizado,
    v_maior_atraso
  from recalculados;

  v_base := jsonb_set(v_base, '{items}', v_items, true);
  v_base := jsonb_set(v_base, '{totals}', jsonb_build_object(
    'total_faturas', v_total_faturas,
    'total_matriculas', v_total_matriculas,
    'total_original', v_total_original,
    'total_atualizado', v_total_atualizado,
    'maior_atraso', v_maior_atraso
  ), true);
  v_base := jsonb_set(v_base, '{policy,student_scope}', to_jsonb(
    'exact_invoice_enrollment + aluno_ativo_atual; trancado, evadido e arquivado fora da carteira D+2'::text
  ), true);
  v_base := jsonb_set(v_base, '{policy,delinquency_rule}', '"d_plus_2"'::jsonb, true);
  v_base := jsonb_set(v_base, '{policy,competencias_inicio}', to_jsonb(v_inicio_competencia), true);
  v_base := jsonb_set(v_base, '{policy,competencia_fim}', to_jsonb(v_fim_competencia), true);
  v_base := jsonb_set(v_base, '{operational,consumer_must_apply_collection_grace}', 'false'::jsonb, true);
  v_base := jsonb_set(v_base, '{operational,collection_scope}', to_jsonb(case
    when v_collection_allowed then 'confirmed_active_d2_3_competencias'
    else 'blocked'
  end::text), true);

  return v_base;
end;
$function$;

comment on function public.get_inadimplencia_canonica(uuid, date) is
  'Carteira canônica acionável: confirmado, aluno ativo atual, D+2 e janela das três competências; source_missing, trancado, evadido, arquivado e histórico ficam fora.';

revoke all on function public.get_inadimplencia_canonica(uuid, date)
  from public, anon;
grant execute on function public.get_inadimplencia_canonica(uuid, date)
  to authenticated, service_role;
