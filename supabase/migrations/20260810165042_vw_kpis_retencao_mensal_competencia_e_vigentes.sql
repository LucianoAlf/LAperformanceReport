-- vw_kpis_retencao_mensal contava renovacao por DATA DO LANCAMENTO e lia a tabela
-- crua. Dois defeitos que apareciam juntos no relatorio mensal:
--
--   1. FONTE: lia movimentacoes_admin em vez de movimentacoes_admin_vigentes,
--      entao as 46 renovacoes anuladas como duplicata continuavam contando.
--
--   2. RECORTE: agrupava por EXTRACT(mes FROM m.data) -- o mes em que a equipe
--      LANCOU -- enquanto a LISTA de nomes do mesmo bloco do relatorio usa
--      competencia_referencia (o mes da 1a aula do novo ciclo, que e a regra de
--      negocio confirmada). Numero e lista falavam de universos diferentes.
--
-- Efeito medido no Recreio/julho-2026: o cabecalho dizia "27 previstas / 25
-- realizadas" (25 renovacoes + 2 nao renovacoes pela data, com duplicata) e a
-- lista logo abaixo trazia 23 nomes. A ADM da unidade corrigiu os numeros a mao
-- todo mes para o bloco fechar -- e nao tinha como fechar.
--
-- Depois da correcao (com a competencia da Catarina ja ajustada em 20260810165228):
--   Recreio  jun 14/14 100%   jul 21 previstas / 19 realizadas / 90,48%   ago 46/46
--   Barra    jun 11/11 100%   jul  6 previstas /  4 realizadas / 66,67%
--   CG       jun 28/25  89%   jul 36 previstas / 27 realizadas / 75,00%
--
-- So o CTE renovacoes_mes muda de recorte. Evasao e aviso previo continuam por
-- m.data de proposito: sao eventos que acontecem numa data, nao tem ciclo.
-- competencia_referencia esta preenchida em 100% das nao_renovacoes e em 520 de
-- 522 renovacoes; o coalesce cobre as 2 orfas.
--
-- Feito por replace com guarda sobre pg_get_viewdef, nao transcrevendo a view a
-- mao: ela tem 5 CTEs e uma transcricao erraria algum filtro.
--
-- ⚠️ Snapshots mensais ja fechados NAO mudam com isso -- o relatorio de um mes
-- fechado le o payload congelado. Vale para leitura viva e meses ainda abertos.

do $$
declare
  v_def text;
  v_novo text;
begin
  select pg_get_viewdef('public.vw_kpis_retencao_mensal'::regclass, true) into v_def;

  if v_def is null then
    raise exception 'VIEW_NAO_ENCONTRADA';
  end if;

  -- (1) fonte passa a ser a view que ignora anuladas
  if position('FROM movimentacoes_admin m' in v_def) = 0 then
    raise exception 'TRECHO_FONTE_AUSENTE: a view nao le mais "FROM movimentacoes_admin m"';
  end if;
  v_novo := replace(v_def, 'FROM movimentacoes_admin m', 'FROM movimentacoes_admin_vigentes m');

  -- (2) o CTE de renovacao passa a recortar por competencia.
  -- Ancorado em "renovacoes_realizadas", que so existe nesse CTE.
  if v_novo !~ 'EXTRACT\(year FROM m\.data\)::integer AS ano,\s*\n\s*EXTRACT\(month FROM m\.data\)::integer AS mes,\s*\n\s*count\(\*\) FILTER \(WHERE m\.tipo::text = ''renovacao''::text\) AS renovacoes_realizadas' then
    raise exception 'TRECHO_SELECT_RENOVACOES_AUSENTE';
  end if;
  v_novo := regexp_replace(
    v_novo,
    '(EXTRACT\(year FROM )m\.data(\)::integer AS ano,\s*\n\s*EXTRACT\(month FROM )m\.data(\)::integer AS mes,\s*\n\s*count\(\*\) FILTER \(WHERE m\.tipo::text = ''renovacao''::text\) AS renovacoes_realizadas)',
    '\1COALESCE(m.competencia_referencia, m.data)\2COALESCE(m.competencia_referencia, m.data)\3'
  );

  if v_novo !~ 'GROUP BY m\.unidade_id, \(EXTRACT\(year FROM m\.data\)\), \(EXTRACT\(month FROM m\.data\)\)\s*\n\s*\), periodos AS' then
    raise exception 'TRECHO_GROUPBY_RENOVACOES_AUSENTE';
  end if;
  v_novo := regexp_replace(
    v_novo,
    'GROUP BY m\.unidade_id, \(EXTRACT\(year FROM m\.data\)\), \(EXTRACT\(month FROM m\.data\)\)(\s*\n\s*\), periodos AS)',
    'GROUP BY m.unidade_id, (EXTRACT(year FROM COALESCE(m.competencia_referencia, m.data))), (EXTRACT(month FROM COALESCE(m.competencia_referencia, m.data)))\1'
  );

  if v_novo = v_def then
    raise exception 'REPLACE_SEM_EFEITO';
  end if;

  execute 'create or replace view public.vw_kpis_retencao_mensal as ' || v_novo;
end $$;
