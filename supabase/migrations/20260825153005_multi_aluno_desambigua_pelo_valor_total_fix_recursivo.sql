-- Corrige a v1 (aplicada minutos antes): faltava WITH RECURSIVE no CTE de combinações, e
-- o acumulador de escolhas era array de jsonb, que não casa com jsonb_array_elements na
-- leitura. A função subiu sem erro e só estourava em runtime — por isso o teste veio antes
-- de qualquer uso real.
create or replace function public.sol_caixa_derivar_valores_multi_aluno_v1(
  p_unidade_id uuid, p_itens jsonb, p_valor_total numeric, p_as_of date)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_env jsonb; v_status text;
  v_ordem int := 0; v_item jsonb; v_nome text;
  v_alu record; v_cands jsonb; v_todas jsonb := '[]'::jsonb;
  v_n int; v_match_count int; v_match jsonb;
begin
  if p_valor_total is null or p_valor_total <= 0 then return null; end if;
  v_n := jsonb_array_length(coalesce(p_itens,'[]'::jsonb));
  if v_n < 2 or v_n > 6 then return null; end if;

  if exists (select 1 from jsonb_array_elements(p_itens) x
              where nullif(x->>'valor','') is not null) then
    return null;
  end if;

  v_env := public.sol_faturas_alunos_v1(
    p_unidade_id, extract(year from p_as_of)::int, extract(month from p_as_of)::int,
    'janela_3', 'todas', p_as_of);
  v_status := v_env->>'status';
  if v_status is null or v_status not in ('ok','partial') then return null; end if;

  for v_item in select value from jsonb_array_elements(p_itens) loop
    v_ordem := v_ordem + 1;
    v_nome := nullif(btrim(coalesce(v_item->>'aluno_nome','')),'');
    if v_nome is null then return null; end if;

    select a.id, a.nome, a.emusys_student_id,
           word_similarity(unaccent(lower(v_nome)), unaccent(lower(a.nome_normalizado))) sim
      into v_alu
    from public.alunos a
    where a.unidade_id = p_unidade_id and a.nome_normalizado is not null
      and (a.status ilike 'ativo%' or a.status is null)
    order by word_similarity(unaccent(lower(v_nome)), unaccent(lower(a.nome_normalizado))) desc
    limit 1;
    if v_alu.id is null or coalesce(v_alu.sim,0) < 0.45 then return null; end if;

    select coalesce(jsonb_agg(jsonb_build_object(
             'ordem', v_ordem,
             'valor', coalesce(nullif(x->'valores'->>'valor_pago','')::numeric,
                               nullif(x->'valores'->>'valor_hoje','')::numeric,
                               nullif(x->'valores'->>'valor_com_desconto','')::numeric),
             'canonical_fatura_id', x->>'canonical_fatura_id')), '[]'::jsonb)
      into v_cands
      from jsonb_array_elements(coalesce(v_env->'items','[]'::jsonb)) x
     where x->>'emusys_student_id' = v_alu.emusys_student_id
       and x->>'status' = 'paga'
       and nullif(x->>'data_pagamento','')::date >= p_as_of - 7
       and nullif(x->>'data_pagamento','')::date <= p_as_of
       and coalesce(nullif(x->'valores'->>'valor_pago','')::numeric,
                    nullif(x->'valores'->>'valor_hoje','')::numeric,
                    nullif(x->'valores'->>'valor_com_desconto','')::numeric) > 0;

    if jsonb_array_length(v_cands) = 0 or jsonb_array_length(v_cands) > 8 then
      return null;
    end if;
    v_todas := v_todas || v_cands;
  end loop;

  with recursive c as (
    select value x, (value->>'ordem')::int ord, (value->>'valor')::numeric val
      from jsonb_array_elements(v_todas)
  ), combos as (
    select array[ord] ordens, jsonb_build_array(x) escolhas, val soma from c where ord = 1
    union all
    select k.ordens || c.ord, k.escolhas || c.x, k.soma + c.val
      from combos k join c on c.ord = array_length(k.ordens,1) + 1
     where k.soma + c.val <= p_valor_total + 0.01
  ), fecham as (
    select escolhas from combos
     where array_length(ordens,1) = v_n and abs(soma - p_valor_total) < 0.01
  )
  select count(*), (array_agg(escolhas))[1] into v_match_count, v_match from fecham;

  if coalesce(v_match_count,0) <> 1 then return null; end if;

  return (
    select jsonb_agg((p_itens->(m.ord-1)) || jsonb_build_object('valor', m.val) order by m.ord)
    from (select (e->>'ordem')::int ord, (e->>'valor')::numeric val
            from jsonb_array_elements(v_match) e) m
  );
end;
$function$;

revoke all on function public.sol_caixa_derivar_valores_multi_aluno_v1(uuid,jsonb,numeric,date)
  from public, anon, authenticated;
grant execute on function public.sol_caixa_derivar_valores_multi_aluno_v1(uuid,jsonb,numeric,date)
  to service_role, sol_acesso_restrito;;
