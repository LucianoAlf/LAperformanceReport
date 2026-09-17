-- Incidente Barra, 17/09/2026 — segunda camada da causa raiz.
--
-- A regra `paga_hoje_valor_exato` estava correta, mas a casca da canônica
-- construía apenas `janela_3`: mês de referência + dois meses anteriores. Um
-- pagamento antecipado da competência seguinte, embora já sincronizado e
-- consultável pela fonte canônica, nunca chegava ao conjunto de candidatas.
--
-- Escopo estreito: somente chamadas da casca (p_env_in nulo) e com valor
-- declarado consultam também a competência seguinte. Envelope explícito segue
-- hermético para ensaios/consumidores que já montaram seu próprio universo.

begin;

do $mig$
declare
  v_def text := replace(pg_get_functiondef(
    'public.sol_caixa_parcela_canonica_env_v1(jsonb,uuid,text,numeric,date)'::regprocedure
  ), chr(13), '');
  v_decl text := '  v_n_valor int;';
  v_decl_novo text := $decl$  v_n_valor int;
  v_env_futura jsonb;
  v_proxima_competencia date;
  v_n_pago_hoje_atual int;$decl$;
  v_anchor text := '  if jsonb_array_length(v_itens) = 0 then';
  v_block text := $block$  -- RAIZ (17/09b): `janela_3` termina no mes de referencia. Uma
  -- baixa antecipada da competencia seguinte precisa entrar antes da escolha.
  if p_env_in is null and p_valor is not null then
    select count(*) into v_n_pago_hoje_atual
    from jsonb_array_elements(v_itens) x
    where x->>'status' = 'paga'
      and nullif(x->>'data_pagamento','')::date = v_as_of
      and abs(coalesce((x->'valores'->>'valor_pago')::numeric, -1) - p_valor) < 0.01;

    v_proxima_competencia := (date_trunc('month', v_as_of) + interval '1 month')::date;
    v_env_futura := public.sol_faturas_alunos_v1(
      p_unidade_id,
      extract(year from v_proxima_competencia)::int,
      extract(month from v_proxima_competencia)::int,
      'competencia', 'todas', v_as_of
    );

    if coalesce(v_env_futura->>'status','') in ('ok','partial') then
      select coalesce(jsonb_agg(q.item order by (q.item->>'data_vencimento')::date,
                                               q.item->>'canonical_fatura_id'), '[]'::jsonb)
        into v_itens
      from (
        select x as item from jsonb_array_elements(v_itens) x
        union
        select x as item
        from jsonb_array_elements(coalesce(v_env_futura->'items','[]'::jsonb)) x
        where x->>'emusys_student_id' = v_alu.emusys_student_id
          and coalesce(x->>'status','') <> 'cancelada'
      ) q;
    elsif v_n_pago_hoje_atual <> 1 then
      return jsonb_build_object(
        'ok', false,
        'motivo', 'fonte_competencia_futura_indisponivel',
        'aluno_nome', v_alu.nome,
        'responsavel_nome', v_alu.responsavel_nome,
        'status_fonte', v_env_futura->>'status'
      );
    end if;
  end if;

$block$;
  v_n int;
begin
  if position('paga_hoje_valor_exato' in v_def) = 0 then
    raise exception 'CANONICA_FUTURA: regra paga_hoje ainda nao instalada';
  end if;
  if position('RAIZ (17/09b)' in v_def) > 0 then
    raise exception 'CANONICA_FUTURA: bloco ja presente antes da migration';
  end if;

  v_n := (length(v_def) - length(replace(v_def, v_decl, ''))) / length(v_decl);
  if v_n <> 1 then
    raise exception 'CANONICA_FUTURA: declaracao esperava 1 ocorrencia, encontrou %', v_n;
  end if;
  v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 then
    raise exception 'CANONICA_FUTURA: ancora esperava 1 ocorrencia, encontrou %', v_n;
  end if;

  v_def := replace(v_def, v_decl, v_decl_novo);
  v_def := replace(v_def, v_anchor, v_block || v_anchor);
  execute v_def;
end $mig$;

revoke execute on function public.sol_caixa_parcela_canonica_env_v1(jsonb,uuid,text,numeric,date)
  from public, anon, authenticated;
grant execute on function public.sol_caixa_parcela_canonica_env_v1(jsonb,uuid,text,numeric,date)
  to service_role, sol_acesso_restrito;

commit;
