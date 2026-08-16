-- A Sol/Maria consome a mesma leitura canônica usada pelo LA Report.
-- Se a fonte estiver stale ou pendente de reconciliação, a lista operacional
-- fica vazia para impedir cobrança com dado incompleto.

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
as $$
declare
  v_as_of_date date := (now() at time zone 'America/Sao_Paulo')::date;
  v_canonical jsonb;
  v_status text;
  v_result jsonb;
begin
  v_canonical := public.get_inadimplencia_canonica(p_unidade_id, v_as_of_date);
  v_status := coalesce(v_canonical->>'status', 'error');

  if v_status <> 'ok' then
    return jsonb_build_object(
      'status', v_status,
      'unidade_id', p_unidade_id,
      'fonte', 'get_inadimplencia_canonica',
      'as_of_date', v_as_of_date,
      'gerado_em', to_char((now() at time zone 'America/Sao_Paulo'), 'DD/MM/YYYY HH24:MI'),
      'carencia_dias', p_carencia_dias,
      'grave_dias', p_grave_dias,
      'critico_dias', p_critico_dias,
      'juros', jsonb_build_object(
        'multa_pct', 0.02,
        'mora_pct_mes', 0.01,
        'regra', 'contrato_clausula_2_5'
      ),
      'freshness', coalesce(v_canonical->'freshness', '{}'::jsonb),
      'reconciliation', coalesce(v_canonical->'reconciliation', '{}'::jsonb),
      'confirmados', coalesce(v_canonical->'totals', '{}'::jsonb),
      'total_alunos', 0,
      'total_original', 0,
      'total_atualizado', 0,
      'faixas', jsonb_build_object('critico', 0, 'atencao', 0, 'normal', 0),
      'alunos', '[]'::jsonb
    );
  end if;

  with itens as (
    select
      nullif(item->>'emusys_student_id', '')::bigint as emusys_student_id,
      nullif(item->>'emusys_matricula_id', '') as emusys_matricula_id,
      (item->>'competencia')::date as competencia,
      (item->>'data_vencimento')::date as data_vencimento,
      coalesce(nullif(item->>'dias_atraso', '')::integer, 0) as dias,
      coalesce(nullif(item->>'valor_original', '')::numeric, 0) as valor_original,
      coalesce(nullif(item->>'valor_atualizado', '')::numeric, 0) as valor_atualizado
    from jsonb_array_elements(coalesce(v_canonical->'items', '[]'::jsonb)) as item
    where coalesce(nullif(item->>'dias_atraso', '')::integer, 0)
      >= greatest(p_carencia_dias, 0)
  ),
  agrupados as (
    select
      max(i.emusys_student_id) as emusys_student_id,
      max(i.emusys_matricula_id) as emusys_matricula_id,
      count(*)::integer as parcelas,
      count(distinct to_char(i.competencia, 'MM/YYYY'))::integer as meses,
      max(i.dias)::integer as dias,
      min(i.data_vencimento) as mais_antiga,
      sum(i.valor_original)::numeric as valor_original,
      sum(i.valor_atualizado)::numeric as valor_atualizado,
      coalesce(i.emusys_student_id::text, 'matricula:' || i.emusys_matricula_id) as chave
    from itens i
    group by coalesce(i.emusys_student_id::text, 'matricula:' || i.emusys_matricula_id)
  ),
  enriquecidos as (
    select
      g.*,
      a.nome,
      a.contato,
      c.nome as curso
    from agrupados g
    left join lateral (
      select
        al.nome,
        coalesce(al.whatsapp, al.telefone) as contato,
        al.curso_id
      from public.alunos al
      where al.unidade_id = p_unidade_id
        and al.status ilike 'ativo%'
        and (
          (g.emusys_student_id is not null
            and al.emusys_student_id = g.emusys_student_id::text)
          or (g.emusys_student_id is null
            and g.emusys_matricula_id is not null
            and al.emusys_matricula_id = g.emusys_matricula_id)
        )
      order by al.updated_at desc nulls last, al.id desc
      limit 1
    ) a on true
    left join public.cursos c on c.id = a.curso_id
  )
  select jsonb_build_object(
    'status', case
      when exists (select 1 from enriquecidos where nome is null) then 'incomplete'
      else 'ok'
    end,
    'unidade_id', p_unidade_id,
    'fonte', 'get_inadimplencia_canonica',
    'as_of_date', v_as_of_date,
    'gerado_em', to_char((now() at time zone 'America/Sao_Paulo'), 'DD/MM/YYYY HH24:MI'),
    'carencia_dias', p_carencia_dias,
    'grave_dias', p_grave_dias,
    'critico_dias', p_critico_dias,
    'juros', jsonb_build_object(
      'multa_pct', 0.02,
      'mora_pct_mes', 0.01,
      'regra', 'contrato_clausula_2_5'
    ),
    'freshness', coalesce(v_canonical->'freshness', '{}'::jsonb),
    'reconciliation', coalesce(v_canonical->'reconciliation', '{}'::jsonb),
    'confirmados', coalesce(v_canonical->'totals', '{}'::jsonb),
    'cadastro_nao_encontrado', (select count(*) from enriquecidos where nome is null),
    'total_alunos', case
      when exists (select 1 from enriquecidos where nome is null) then 0
      else (select count(*) from enriquecidos)
    end,
    'total_original', case
      when exists (select 1 from enriquecidos where nome is null) then 0
      else coalesce((select round(sum(valor_original), 2) from enriquecidos), 0)
    end,
    'total_atualizado', case
      when exists (select 1 from enriquecidos where nome is null) then 0
      else coalesce((select round(sum(valor_atualizado), 2) from enriquecidos), 0)
    end,
    'faixas', case
      when exists (select 1 from enriquecidos where nome is null)
        then jsonb_build_object('critico', 0, 'atencao', 0, 'normal', 0)
      else jsonb_build_object(
        'critico', (select count(*) from enriquecidos where dias > p_critico_dias),
        'atencao', (select count(*) from enriquecidos where dias > p_grave_dias and dias <= p_critico_dias),
        'normal', (select count(*) from enriquecidos where dias <= p_grave_dias)
      )
    end,
    'alunos', case
      when exists (select 1 from enriquecidos where nome is null) then '[]'::jsonb
      else coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'nome', e.nome,
            'curso', coalesce(e.curso, ''),
            'contato', e.contato,
            'parcelas', e.parcelas,
            'meses', e.meses,
            'dias', e.dias,
            'valor_original', round(e.valor_original, 2),
            'valor_atualizado', round(e.valor_atualizado, 2),
            'faixa', case
              when e.dias > p_critico_dias then 'critico'
              when e.dias > p_grave_dias then 'atencao'
              else 'normal'
            end
          )
          order by e.dias desc, e.valor_atualizado desc, e.nome
        )
        from enriquecidos e
      ), '[]'::jsonb)
    end
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.sol_caixa_inadimplentes(uuid, int, numeric, numeric, int, int)
  from public, anon, authenticated;
grant execute on function public.sol_caixa_inadimplentes(uuid, int, numeric, numeric, int, int)
  to service_role;
