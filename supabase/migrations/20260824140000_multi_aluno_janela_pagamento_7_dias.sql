-- Irmãos (multi-aluno): derivação automática também aceita fatura paga nos últimos 7 dias.
-- Mesma classe de bug corrigida no composto em 20260824130000, encontrada por varredura
-- proativa (pedido do Alf: "não quer ver se tem mais quebrado?") ANTES de a equipe topar
-- com ela no grupo.
--
-- O CASO: quando o comprovante de irmãos não traz o valor de cada um, o resolver deriva
-- pela fatura paga — e exigia `data_pagamento = as_of`. Provado com os irmãos João Victor
-- + Pedro Victor (CG), passaportes pagos em 21/08 (sexta): hoje (segunda) a derivação
-- devolve `alocacao_nao_derivavel` com `candidatas: 0`. Com valor por item o fluxo passa;
-- sem valor, quebra — e é justamente o caso em que a equipe manda só o total.
--
-- A REGRA (idêntica à do composto): paga vale por 7 dias corridos, com teto no as_of.
-- A trava de segurança que motivou o desenho original continua: a derivação só aceita
-- UMA candidata por aluno — 2+ pagas na janela devolvem `alocacao_nao_derivavel` e a
-- conferência volta para o humano, que é o comportamento correto.
--
-- ⚠️ `sol_caixa_validar_multi_aluno_snapshot_v1` NÃO precisa da mesma mudança: ela valida
-- o snapshot por `canonical_fatura_id` (id exato do preview), sem filtro por data de
-- pagamento — conferido na fonte.

do $mig$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into strict v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'sol_caixa_resolver_multi_aluno_v1';

  if position('v_as_of - 7' in v_def) > 0 then
    raise notice 'janela ja aplicada';
    return;
  end if;

  v_new := replace(v_def,
    $$       where x->>'status' = 'paga'
         and nullif(x->>'data_pagamento','')::date = v_as_of;$$,
    $$       where x->>'status' = 'paga'
         and nullif(x->>'data_pagamento','')::date >= v_as_of - 7
         and nullif(x->>'data_pagamento','')::date <= v_as_of;$$);

  if v_new = v_def then
    raise exception 'ancora da derivacao automatica nao encontrada';
  end if;

  -- prioridade de desempate acompanha a janela (paga recente ganha da paga antiga)
  v_new := replace(v_new,
    $$                  when x->>'status' = 'paga' and nullif(x->>'data_pagamento','')::date = v_as_of then 0$$,
    $$                  when x->>'status' = 'paga' and nullif(x->>'data_pagamento','')::date >= v_as_of - 7 then 0$$);

  execute v_new;
end $mig$;
