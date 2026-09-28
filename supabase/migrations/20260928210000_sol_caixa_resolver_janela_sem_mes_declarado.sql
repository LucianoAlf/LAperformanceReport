-- sol_caixa_resolver_envelope_v1: sem mês declarado, a janela NÃO avança (28/09/2026).
--
-- 🔴 Defeito introduzido pela 20260928180000 (mesmo dia). `least(NULL, x)` no
--    Postgres devolve x — nulos são ignorados. Sem competência declarada, v_fim
--    virava "mês corrente + 2" e a função sempre somava a janela futura:
--    (1) o universo ganhava faturas de out/nov que ninguém pediu;
--    (2) o status da fonte herdava o `stale` do mês futuro, e toda busca vazia
--        respondia `fonte_indisponivel` em vez de `nenhuma_fatura_aberta`.
--    Medido: dentro do resolver o status saía `stale` nas 3 unidades enquanto a
--    chamada direta dizia ok/partial. Nenhum lançamento foi gravado no intervalo
--    (0 movimentações entre 13:00 UTC e a correção).
do $mig$
declare
  d text := pg_get_functiondef('public.sol_caixa_resolver_envelope_v1(uuid,jsonb)'::regprocedure);
  n int;
  a text := $a$  v_fim := least(v_fim, (date_trunc('month', v_as_of) + interval '2 month')::date);$a$;
  b text := $b$  if v_fim is not null then
    v_fim := least(v_fim, (date_trunc('month', v_as_of) + interval '2 month')::date);
  end if;$b$;
begin
  if position('if v_fim is not null then' in d) > 0 then raise notice 'ja aplicada'; return; end if;
  n := (length(d) - length(replace(d, a, ''))) / length(a);
  if n <> 1 then raise exception 'ancora esperava 1, achou %', n; end if;
  execute replace(d, a, b);
end
$mig$;
