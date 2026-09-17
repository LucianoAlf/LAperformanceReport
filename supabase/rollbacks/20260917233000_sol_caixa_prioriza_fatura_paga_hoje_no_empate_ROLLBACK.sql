-- Rollback estreito: remove apenas o bloco de precedencia criado em
-- 20260917233000 e restaura a cascata anterior da funcao _env_v1.

begin;

do $rollback$
declare
  v_def text := replace(pg_get_functiondef(
    'public.sol_caixa_parcela_canonica_env_v1(jsonb,uuid,text,numeric,date)'::regprocedure
  ), chr(13), '');
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
  v_n := (length(v_def) - length(replace(v_def, v_block, ''))) / length(v_block);
  if v_n <> 1 then
    raise exception 'ROLLBACK_CANONICA_PAGA_HOJE: bloco esperava 1 ocorrencia, encontrou %', v_n;
  end if;
  v_def := replace(v_def, v_block, '');
  execute v_def;
end $rollback$;

revoke execute on function public.sol_caixa_parcela_canonica_env_v1(jsonb,uuid,text,numeric,date)
  from public, anon, authenticated;
grant execute on function public.sol_caixa_parcela_canonica_env_v1(jsonb,uuid,text,numeric,date)
  to service_role, sol_acesso_restrito;

commit;
