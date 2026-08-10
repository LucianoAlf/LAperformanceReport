-- get_kpis_alunos_financeiro_vivo_canonico calcula o REAJUSTE MEDIO a partir de
-- movimentacoes_admin e era a unica funcao canonica viva que ainda lia a tabela
-- crua para isso -- as 44 renovacoes anuladas continuavam entrando na media.
--
-- Na maioria dos casos a duplicata repete os mesmos valores do registro mantido,
-- entao a media quase nao se move; o problema sao os casos em que ela NAO repete:
-- a Lara Dias trazia 453,60, valor que ela nunca pagou, e varios duplicados vem
-- com valor_parcela_anterior/novo nulos.
--
-- As outras 5 funcoes que ainda leem a tabela crua com tipo='renovacao' sao
-- legado versionado (get_dados_relatorio_coordenacao_legado_20260711,
-- get_dados_relatorio_gerencial_legacy_p19/p20/p21_20260707 e
-- get_kpis_professor_periodo_base_legado_20260713) -- congeladas de proposito,
-- nao se mexe.
--
-- Troca so a REFERENCIA da tabela pela view, via replace com guarda: transcrever
-- o corpo a mao arriscaria alterar a expressao do percentual sem querer. Mesma
-- tecnica de 20260810134413, que ja tinha trocado as 4 funcoes de taxa.
-- CREATE OR REPLACE preserva a ACL (conferido: sem anon).

do $$
declare
  v_def text;
  v_novo text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_kpis_alunos_financeiro_vivo_canonico'
  limit 1;

  if v_def is null then
    raise exception 'FUNCAO_NAO_ENCONTRADA: get_kpis_alunos_financeiro_vivo_canonico';
  end if;

  if position('from public.movimentacoes_admin ma' in v_def) = 0 then
    raise exception 'TRECHO_ESPERADO_AUSENTE: a funcao nao le mais "from public.movimentacoes_admin ma"';
  end if;

  v_novo := replace(v_def, 'from public.movimentacoes_admin ma', 'from public.movimentacoes_admin_vigentes ma');

  if v_novo = v_def then
    raise exception 'REPLACE_SEM_EFEITO';
  end if;

  execute v_novo;
end $$;
