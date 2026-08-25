-- Pluga `sol_caixa_derivar_valores_multi_aluno_v1` no resolver.
--
-- Sem isto a função auxiliar existe e ninguém chama — o caso da Mayra continuaria caindo
-- em `alocacao_nao_derivavel`.
--
-- Uma pré-passada, antes do loop que decide aluno a aluno: se NINGUÉM informou valor e
-- existe UMA combinação de faturas pagas na janela que fecha o total, os valores entram
-- resolvidos e o loop segue pelo caminho normal (que já casa a fatura pelo valor).
--
-- ⚠️ A auxiliar devolve NULL em qualquer dúvida (zero ou 2+ combinações, aluno não achado,
-- fonte indisponível, mais de 8 candidatas, mais de 6 alunos). NULL mantém `p_itens` como
-- veio, e o comportamento antigo — inclusive a recusa — fica idêntico. Ou seja: isto só
-- ADICIONA casos resolvidos, nunca muda um que já resolvia.
do $mig$
declare v_def text; v_new text;
begin
  select pg_get_functiondef(p.oid) into strict v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'sol_caixa_resolver_multi_aluno_v1';

  if position('sol_caixa_derivar_valores_multi_aluno_v1' in v_def) > 0 then
    raise notice 'resolver ja desambigua pelo total'; return;
  end if;

  v_new := replace(v_def,
$a$  for v_item in select value from jsonb_array_elements(p_itens) loop
    v_ordem := v_ordem + 1;
    v_nome := nullif(trim(coalesce(v_item->>'aluno_nome', '')), '');$a$,
$a$  -- Desambiguacao pelo TOTAL, antes de decidir aluno a aluno.
  -- Caso Mayra/CG 25/08: irmaos Ramos Coelho, cada um com Taxa de Matricula de 360 E de
  -- 20 pagas no mesmo dia. Aluno a aluno da 2 candidatas e recusa; o total (40) so fecha
  -- com 20+20. Devolve NULL em qualquer duvida, e ai nada muda.
  p_itens := coalesce(
    public.sol_caixa_derivar_valores_multi_aluno_v1(p_unidade_id, p_itens, p_valor_total, v_as_of),
    p_itens);

  for v_item in select value from jsonb_array_elements(p_itens) loop
    v_ordem := v_ordem + 1;
    v_nome := nullif(trim(coalesce(v_item->>'aluno_nome', '')), '');$a$);
  if v_new = v_def then raise exception 'ancora do loop nao encontrada'; end if;

  execute v_new;
end $mig$;;
