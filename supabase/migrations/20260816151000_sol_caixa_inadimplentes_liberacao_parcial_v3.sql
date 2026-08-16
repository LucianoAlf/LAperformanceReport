-- A Sol consome exclusivamente o contrato v3 publicado pelo LA Report.
-- A verdade financeira permanece D+0; esta fachada aplica somente a carencia
-- operacional D+2 e agrega uma unica acao por pessoa/unidade.

create or replace function public.sol_caixa_inadimplentes(
  p_unidade_id uuid,
  p_carencia_dias int default 2,
  p_multa_pct numeric default 0.02,
  p_mora_pct_mes numeric default 0.01,
  p_grave_dias int default 30,
  p_critico_dias int default 40
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_as_of_date date := (now() at time zone 'America/Sao_Paulo')::date;
  v_canonical jsonb;
  v_canonical_status text;
  v_collection_allowed boolean;
  v_collection_scope text;
  v_policy_valid boolean;
  v_result jsonb;
begin
  if p_unidade_id is null
     or p_carencia_dias is distinct from 2
     or p_multa_pct is distinct from 0.02::numeric
     or p_mora_pct_mes is distinct from 0.01::numeric
     or p_grave_dias is null
     or p_critico_dias is null
     or p_grave_dias < 0
     or p_critico_dias <= p_grave_dias then
    raise exception using
      errcode = '22023',
      message = 'politica financeira invalida: use carencia 2, multa 0.02, mora mensal 0.01 e faixas crescentes';
  end if;

  v_canonical := public.get_inadimplencia_canonica(p_unidade_id, v_as_of_date);
  v_canonical_status := coalesce(v_canonical->>'status', 'error');
  v_collection_allowed := coalesce(
    (v_canonical #>> '{operational,collection_allowed}')::boolean,
    false
  );
  v_collection_scope := coalesce(
    v_canonical #>> '{operational,collection_scope}',
    'blocked'
  );
  v_policy_valid := coalesce(v_canonical #>> '{policy,delinquency_rule}', '') = 'd_plus_0'
    and coalesce((v_canonical #>> '{policy,collection_grace_days}')::integer, -1) = 2
    and coalesce(
      (v_canonical #>> '{operational,consumer_must_apply_collection_grace}')::boolean,
      false
    );

  if v_canonical_status not in ('ok', 'partial')
     or v_collection_allowed is not true
     or v_collection_scope <> 'confirmed_only'
     or v_policy_valid is not true then
    return jsonb_build_object(
      'status', case
        when v_canonical_status in ('stale', 'incomplete', 'error') then v_canonical_status
        else 'error'
      end,
      'canonical_status', v_canonical_status,
      'unidade_id', p_unidade_id,
      'fonte', 'get_inadimplencia_canonica',
      'as_of_date', v_as_of_date,
      'gerado_em', to_char((now() at time zone 'America/Sao_Paulo'), 'DD/MM/YYYY HH24:MI'),
      'canonical_delinquency_rule', 'd_plus_0',
      'carencia_dias', 2,
      'grave_dias', p_grave_dias,
      'critico_dias', p_critico_dias,
      'collection_allowed', false,
      'collection_scope', 'blocked',
      'fresh_until', v_canonical #>> '{freshness,fresh_until}',
      'source_missing_count', coalesce(
        (v_canonical #>> '{reconciliation,source_missing_count}')::integer,
        0
      ),
      'freshness', coalesce(v_canonical->'freshness', '{}'::jsonb),
      'reconciliation', coalesce(v_canonical->'reconciliation', '{}'::jsonb),
      'confirmados', coalesce(v_canonical->'totals', '{}'::jsonb),
      'cadastro_nao_encontrado', 0,
      'total_alunos', 0,
      'total_original', 0,
      'total_atualizado', 0,
      'faixas', jsonb_build_object('critico', 0, 'atencao', 0, 'normal', 0),
      'alunos', '[]'::jsonb
    );
  end if;

  with itens_elegiveis as (
    select
      (item->>'aluno_id_canonico')::bigint as aluno_id_canonico,
      item->>'unidade_id' as unidade_id,
      item->>'canonical_fatura_id' as canonical_fatura_id,
      item->>'emusys_fatura_id' as emusys_fatura_id,
      item->>'emusys_matricula_id' as emusys_matricula_id,
      nullif(item->>'emusys_contrato_id', '') as emusys_contrato_id,
      (item->>'competencia')::date as competencia,
      (item->>'data_vencimento')::date as data_vencimento,
      (item->>'dias_atraso')::integer as dias,
      (item->>'valor_original')::numeric as valor_original,
      (item->>'valor_atualizado')::numeric as valor_atualizado
    from jsonb_array_elements(coalesce(v_canonical->'items', '[]'::jsonb)) as item
    where item->>'unidade_id' = p_unidade_id::text
      and item->>'contact_resolution_status' = 'resolved'
      and coalesce(item->>'aluno_id_canonico', '') ~ '^[1-9][0-9]*$'
      and item->>'status' = 'aberta'
      and coalesce((item->>'source_missing')::boolean, true) is false
      and coalesce((item->>'dias_atraso')::integer, 0) >= p_carencia_dias
  ),
  agrupados as (
    select
      ie.aluno_id_canonico,
      p_unidade_id as unidade_id,
      array_agg(
        distinct ie.emusys_matricula_id
        order by ie.emusys_matricula_id
      ) as emusys_matricula_ids,
      count(*)::integer as parcelas,
      count(distinct ie.competencia)::integer as meses,
      max(ie.dias)::integer as dias,
      min(ie.data_vencimento) as mais_antiga,
      round(sum(ie.valor_original), 2) as valor_original,
      round(sum(ie.valor_atualizado), 2) as valor_atualizado,
      jsonb_agg(
        jsonb_build_object(
          'canonical_fatura_id', ie.canonical_fatura_id,
          'unidade_id', ie.unidade_id,
          'emusys_fatura_id', ie.emusys_fatura_id,
          'emusys_matricula_id', ie.emusys_matricula_id,
          'emusys_contrato_id', ie.emusys_contrato_id,
          'competencia', ie.competencia,
          'data_vencimento', ie.data_vencimento,
          'dias_atraso', ie.dias,
          'valor_original', round(ie.valor_original, 2),
          'valor_atualizado', round(ie.valor_atualizado, 2)
        )
        order by ie.data_vencimento, ie.canonical_fatura_id
      ) as faturas
    from itens_elegiveis ie
    group by ie.aluno_id_canonico
  ),
  enriquecidos as (
    select
      g.*,
      a.id as aluno_id,
      a.nome,
      coalesce(a.whatsapp, a.telefone) as contato,
      c.nome as curso
    from agrupados g
    left join public.alunos a
      on a.id = g.aluno_id_canonico
     and a.unidade_id = g.unidade_id
    left join public.cursos c on c.id = a.curso_id
  )
  select jsonb_build_object(
    'status', case
      when exists (select 1 from enriquecidos e where e.aluno_id is null) then 'partial'
      else v_canonical_status
    end,
    'canonical_status', v_canonical_status,
    'unidade_id', p_unidade_id,
    'fonte', 'get_inadimplencia_canonica',
    'as_of_date', v_as_of_date,
    'gerado_em', to_char((now() at time zone 'America/Sao_Paulo'), 'DD/MM/YYYY HH24:MI'),
    'canonical_delinquency_rule', 'd_plus_0',
    'carencia_dias', 2,
    'grave_dias', p_grave_dias,
    'critico_dias', p_critico_dias,
    'juros', jsonb_build_object(
      'multa_pct', 0.02,
      'mora_pct_mes', 0.01,
      'regra', 'contrato_clausula_2_5'
    ),
    'collection_allowed', true,
    'collection_scope', 'confirmed_only',
    'fresh_until', v_canonical #>> '{freshness,fresh_until}',
    'source_missing_count', coalesce(
      (v_canonical #>> '{reconciliation,source_missing_count}')::integer,
      0
    ),
    'freshness', coalesce(v_canonical->'freshness', '{}'::jsonb),
    'reconciliation', coalesce(v_canonical->'reconciliation', '{}'::jsonb),
    'confirmados', coalesce(v_canonical->'totals', '{}'::jsonb),
    'cadastro_nao_encontrado', (
      select count(*)::integer from enriquecidos e where e.aluno_id is null
    ),
    'total_alunos', (
      select count(*)::integer from enriquecidos e where e.aluno_id is not null
    ),
    'total_original', coalesce((
      select round(sum(e.valor_original), 2)
      from enriquecidos e
      where e.aluno_id is not null
    ), 0),
    'total_atualizado', coalesce((
      select round(sum(e.valor_atualizado), 2)
      from enriquecidos e
      where e.aluno_id is not null
    ), 0),
    'faixas', jsonb_build_object(
      'critico', (
        select count(*)::integer
        from enriquecidos e
        where e.aluno_id is not null and e.dias > p_critico_dias
      ),
      'atencao', (
        select count(*)::integer
        from enriquecidos e
        where e.aluno_id is not null
          and e.dias > p_grave_dias
          and e.dias <= p_critico_dias
      ),
      'normal', (
        select count(*)::integer
        from enriquecidos e
        where e.aluno_id is not null and e.dias <= p_grave_dias
      )
    ),
    'alunos', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'aluno_id_canonico', e.aluno_id_canonico,
          'unidade_id', e.unidade_id,
          'nome', e.nome,
          'curso', coalesce(e.curso, ''),
          'contato', e.contato,
          'emusys_matricula_ids', to_jsonb(e.emusys_matricula_ids),
          'faturas', e.faturas,
          'parcelas', e.parcelas,
          'meses', e.meses,
          'dias', e.dias,
          'mais_antiga', e.mais_antiga,
          'valor_original', e.valor_original,
          'valor_atualizado', e.valor_atualizado,
          'faixa', case
            when e.dias > p_critico_dias then 'critico'
            when e.dias > p_grave_dias then 'atencao'
            else 'normal'
          end
        )
        order by e.dias desc, e.valor_atualizado desc, e.nome, e.aluno_id_canonico
      )
      from enriquecidos e
      where e.aluno_id is not null
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.sol_caixa_inadimplentes(uuid, int, numeric, numeric, int, int)
  from public, anon, authenticated;
grant execute on function public.sol_caixa_inadimplentes(uuid, int, numeric, numeric, int, int)
  to service_role;
