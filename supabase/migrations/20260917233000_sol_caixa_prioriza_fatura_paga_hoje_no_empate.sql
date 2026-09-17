-- Incidente Barra, 17/09/2026 (dados pessoais removidos).
--
-- Duas parcelas tinham o mesmo valor (R$ 465): 09/2026 aberta e vencida;
-- 10/2026 paga no dia. A regra antiga so usava valor exato quando havia UMA
-- candidata. No empate, voltava para "a mais atrasada" e escolhia setembro,
-- embora a evidencia financeira forte fosse a baixa de outubro naquele dia.
--
-- Regra: entre faturas de mesmo valor, UMA fatura paga no `p_as_of` vence a
-- heuristica de atraso. Duas ou mais pagas no dia continuam ambiguas e falham
-- fechado; nunca escolhem por ordem de vencimento.

begin;

do $mig$
declare
  v_def text := replace(pg_get_functiondef(
    'public.sol_caixa_parcela_canonica_env_v1(jsonb,uuid,text,numeric,date)'::regprocedure
  ), chr(13), '');
  v_anchor text := '  -- RAIZ (31/08): valor exato do comprovante manda sobre "a mais atrasada".';
  v_block text := $block$  -- RAIZ (17/09): no empate de valor, a baixa feita HOJE e evidencia
  -- mais forte que a parcela aberta mais antiga. So escolhe quando e unica.
  if p_valor is not null then
    select count(*) into v_n_valor
    from jsonb_array_elements(v_itens) x
    where x->>'status' = 'paga'
      and nullif(x->>'data_pagamento','')::date = v_as_of
      and abs(coalesce((x->'valores'->>'valor_pago')::numeric, -1) - p_valor) < 0.01;

    if v_n_valor > 1 then
      return jsonb_build_object(
        'ok', false,
        'motivo', 'fatura_paga_hoje_ambigua',
        'aluno_nome', v_alu.nome,
        'responsavel_nome', v_alu.responsavel_nome,
        'total_candidatas', v_n_valor
      );
    end if;

    if v_n_valor = 1 then
      select x into v_esc
      from jsonb_array_elements(v_itens) x
      where x->>'status' = 'paga'
        and nullif(x->>'data_pagamento','')::date = v_as_of
        and abs(coalesce((x->'valores'->>'valor_pago')::numeric, -1) - p_valor) < 0.01
      limit 1;
      v_motivo := 'paga_hoje_valor_exato';
    end if;
  end if;

$block$;
  v_n int;
begin
  v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 then
    raise exception 'CANONICA_PAGA_HOJE: ancora esperava 1 ocorrencia, encontrou %', v_n;
  end if;
  if position('paga_hoje_valor_exato' in v_def) > 0 then
    raise exception 'CANONICA_PAGA_HOJE: regra ja presente antes da migration';
  end if;

  v_def := replace(v_def, v_anchor, v_block || v_anchor);
  execute v_def;
end $mig$;

revoke execute on function public.sol_caixa_parcela_canonica_env_v1(jsonb,uuid,text,numeric,date)
  from public, anon, authenticated;
grant execute on function public.sol_caixa_parcela_canonica_env_v1(jsonb,uuid,text,numeric,date)
  to service_role, sol_acesso_restrito;

commit;
