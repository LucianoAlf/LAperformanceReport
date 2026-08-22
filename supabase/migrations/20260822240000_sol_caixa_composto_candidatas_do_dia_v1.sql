-- Sol Caixa V3 — composto considera somente a cobrança atual.
-- Uma fatura paga só é candidata no próprio dia do pagamento: o Emusys pode
-- baixá-la antes do comprovante chegar ao grupo, mas pagamentos antigos não
-- podem criar subconjuntos artificiais para o comprovante de hoje.

create or replace function public.sol_caixa_resolver_composto_aluno_v1(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_unidade uuid := nullif(p_payload->>'unidade_id','')::uuid;
  v_nome text := nullif(btrim(p_payload->>'aluno_nome'),'');
  v_competencia text := nullif(btrim(p_payload->>'competencia'),'');
  v_total numeric := nullif(p_payload->>'valor_total','')::numeric;
  v_as_of date := coalesce(nullif(p_payload->>'as_of','')::date, (now() at time zone 'America/Sao_Paulo')::date);
  v_env jsonb;
  v_status text;
  v_pessoa jsonb;
  v_pessoa_count integer;
  v_student_id text;
  v_aluno_nome text;
  v_responsavel jsonb;
  v_candidatos jsonb;
  v_match_count integer;
  v_match jsonb;
  v_itens jsonb;
begin
  if v_unidade is null then
    return jsonb_build_object('ok', false, 'motivo', 'unidade_invalida');
  elsif v_nome is null or length(v_nome) < 2 then
    return jsonb_build_object('ok', false, 'motivo', 'aluno_obrigatorio');
  elsif v_total is null or v_total <= 0 then
    return jsonb_build_object('ok', false, 'motivo', 'valor_total_invalido');
  end if;

  v_env := public.sol_faturas_alunos_v1(v_unidade, extract(year from v_as_of)::int, extract(month from v_as_of)::int, 'janela_3', 'todas', v_as_of);
  v_status := v_env->>'status';
  if v_status not in ('ok', 'partial') then
    return jsonb_build_object('ok', false, 'motivo', 'fonte_indisponivel', 'status_fonte', v_status);
  end if;

  -- Nome escolhe uma pessoa, nunca uma matrícula. Matrículas da mesma pessoa
  -- compartilham emusys_student_id e não tornam a resolução ambígua.
  with nomes as (
    select nullif(btrim(x->>'emusys_student_id'),'') as emusys_student_id,
           nullif(x->'aluno'->>'nome','') as aluno_nome,
           word_similarity(unaccent(lower(v_nome)), unaccent(lower(coalesce(x->'aluno'->>'nome',''))))::numeric as sim
    from jsonb_array_elements(coalesce(v_env->'items','[]'::jsonb)) x
    where nullif(btrim(x->>'emusys_student_id'),'') is not null
      and nullif(x->'aluno'->>'nome','') is not null
  ), pessoas as (
    select emusys_student_id,
           (array_agg(aluno_nome order by sim desc, aluno_nome))[1] as aluno_nome,
           max(sim) as sim
    from nomes
    where sim >= 0.72
    group by emusys_student_id
  ), topo as (
    select * from pessoas where sim = (select max(sim) from pessoas)
  )
  select count(*), (jsonb_agg(jsonb_build_object('emusys_student_id', emusys_student_id, 'aluno_nome', aluno_nome) order by emusys_student_id)->0)
    into v_pessoa_count, v_pessoa
  from topo;

  if coalesce(v_pessoa_count, 0) = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'aluno_nao_encontrado');
  elsif v_pessoa_count <> 1 then
    return jsonb_build_object('ok', false, 'motivo', 'aluno_ambiguo');
  end if;

  v_student_id := v_pessoa->>'emusys_student_id';
  v_aluno_nome := v_pessoa->>'aluno_nome';
  v_responsavel := public.sol_caixa_responsavel_aluno(v_unidade, v_aluno_nome);

  -- A cobrança que chega no grupo é de agora: aberta, ou já baixada hoje.
  -- Pagas em dias anteriores não entram no conjunto combinatório.
  with candidatos as (
    select x
    from jsonb_array_elements(coalesce(v_env->'items','[]'::jsonb)) x
    where nullif(btrim(x->>'emusys_student_id'),'') = v_student_id
      and nullif(x->'aluno'->>'id','') ~ '^[0-9]+$'
      and (x->>'status' = 'aberta'
           or (x->>'status' = 'paga' and nullif(x->>'data_pagamento','')::date = v_as_of))
      and (v_competencia is null or to_char((x->>'competencia')::date, 'MM/YYYY') = v_competencia)
      and coalesce(x->>'tipo_fatura','') in ('parcela','passaporte_taxa_matricula','matricula')
      and coalesce(case when x->>'status' = 'paga' then nullif(x->'valores'->>'valor_pago','')::numeric end,
                   nullif(x->'valores'->>'valor_hoje','')::numeric,
                   nullif(x->'valores'->>'valor_com_desconto','')::numeric) > 0
    order by (x->>'data_vencimento')::date, x->>'canonical_fatura_id'
    limit 13
  )
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_candidatos from candidatos;

  if jsonb_array_length(v_candidatos) < 2 then
    return jsonb_build_object('ok', false, 'motivo', 'composicao_exige_duas_faturas');
  elsif jsonb_array_length(v_candidatos) > 12 then
    return jsonb_build_object('ok', false, 'motivo', 'composicao_complexa_revisao_manual');
  end if;

  with recursive cand as (
    select row_number() over (order by (x->>'data_vencimento')::date, x->>'canonical_fatura_id')::int as ord,
           x,
           coalesce(case when x->>'status' = 'paga' then nullif(x->'valores'->>'valor_pago','')::numeric end,
                    nullif(x->'valores'->>'valor_hoje','')::numeric,
                    nullif(x->'valores'->>'valor_com_desconto','')::numeric) as valor
    from jsonb_array_elements(v_candidatos) x
  ), combinacoes as (
    select array[ord]::int[] as ordens, valor as soma from cand
    union all
    select c0.ordens || c.ord, c0.soma + c.valor
    from combinacoes c0
    join cand c on c.ord > c0.ordens[array_length(c0.ordens, 1)]
    where array_length(c0.ordens, 1) < 12 and c0.soma + c.valor <= v_total + 0.01
  ), matches as (
    select ordens from combinacoes
    where array_length(ordens, 1) >= 2 and abs(soma - v_total) < 0.01
  )
  select count(*), coalesce(jsonb_agg(to_jsonb(ordens)), '[]'::jsonb) into v_match_count, v_match from matches;

  if v_match_count = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'composicao_sem_match_exato', 'valor_total', v_total);
  elsif v_match_count > 1 then
    return jsonb_build_object('ok', false, 'motivo', 'composicao_ambigua', 'matches', v_match_count);
  end if;

  with cand as (
    select row_number() over (order by (x->>'data_vencimento')::date, x->>'canonical_fatura_id')::int as ord, x
    from jsonb_array_elements(v_candidatos) x
  ), escolhidas as (
    select c.ord, c.x from cand c
    where c.ord = any(array(select jsonb_array_elements_text(v_match->0)::int))
    order by c.ord
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'ordem', ord,
    'aluno_id', (x->'aluno'->>'id')::integer,
    'aluno_nome', x->'aluno'->>'nome',
    'responsavel_financeiro', nullif(v_responsavel->>'responsavel_nome',''),
    'competencia', to_char((x->>'competencia')::date, 'MM/YYYY'),
    'categoria', case when x->>'tipo_fatura' = 'parcela' then 'parcela' when x->>'tipo_fatura' in ('passaporte_taxa_matricula','matricula') then 'passaporte' else null end,
    'valor', coalesce(case when x->>'status' = 'paga' then nullif(x->'valores'->>'valor_pago','')::numeric end,
                      nullif(x->'valores'->>'valor_hoje','')::numeric,
                      nullif(x->'valores'->>'valor_com_desconto','')::numeric),
    'canonical_fatura_id', x->>'canonical_fatura_id',
    'descricao', x->>'descricao',
    'fatura', jsonb_build_object('canonical_fatura_id', x->>'canonical_fatura_id', 'descricao', x->>'descricao', 'tipo_fatura', x->>'tipo_fatura', 'competencia', x->>'competencia', 'status', x->>'status', 'data_pagamento', x->>'data_pagamento', 'forma_pagamento', x->'forma_pagamento', 'valor_pago', x->'valores'->>'valor_pago', 'valor_hoje', x->'valores'->>'valor_hoje')
  ) order by ord), '[]'::jsonb) into v_itens from escolhidas;

  return jsonb_build_object('ok', true, 'itens', v_itens, 'soma_itens', v_total, 'valor_total', v_total);
end;
$function$;

revoke all on function public.sol_caixa_resolver_composto_aluno_v1(jsonb) from public, anon, authenticated;
grant execute on function public.sol_caixa_resolver_composto_aluno_v1(jsonb) to service_role, sol_acesso_restrito;
