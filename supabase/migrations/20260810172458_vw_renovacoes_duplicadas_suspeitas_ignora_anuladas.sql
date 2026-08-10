-- A view de deteccao de duplicata de renovacao ja existia, mas foi criada antes
-- da coluna `anulado` (20260810134205) e por isso continuava listando as 46
-- duplicatas ja resolvidas: 116 linhas, das quais dezenas eram trabalho feito.
--
-- Uma rede de deteccao que acusa o que ja foi tratado deixa de ser usada -- o
-- operador aprende a ignorar a tela. Filtrar `anulado` devolve a ela o unico
-- valor que tem: mostrar o que falta. 116 -> 50 linhas (23 alunos).
--
-- Replace com guarda em vez de transcricao: a view tem 3 CTEs com window
-- function e a lista de colunas repetida 4 vezes.
--
-- ⚠️ Continua sendo SUSPEITA, nao veredito. O padrao `valor_congelado` (mesmo
-- valor_parcela_anterior repetido) tem falso positivo por construcao. O criterio
-- canonico para decidir e o CONTRATO: o Emusys abre um contrato_id novo a cada
-- renovacao -- ver docs/auditorias/2026-08-10-duplicatas-renovacao-por-contrato.md.

do $$
declare
  v_def text;
  v_novo text;
begin
  select pg_get_viewdef('public.vw_renovacoes_duplicadas_suspeitas'::regclass, true) into v_def;

  if v_def is null then
    raise exception 'VIEW_NAO_ENCONTRADA';
  end if;

  if position('WHERE m.tipo::text = ''renovacao''::text' in v_def) = 0 then
    raise exception 'TRECHO_ESPERADO_AUSENTE: filtro de tipo nao encontrado no CTE base';
  end if;

  v_novo := replace(
    v_def,
    'WHERE m.tipo::text = ''renovacao''::text',
    'WHERE m.tipo::text = ''renovacao''::text AND NOT m.anulado'
  );

  if v_novo = v_def then
    raise exception 'REPLACE_SEM_EFEITO';
  end if;

  execute 'create or replace view public.vw_renovacoes_duplicadas_suspeitas as ' || v_novo;
end $$;

alter view public.vw_renovacoes_duplicadas_suspeitas set (security_invoker = on);

comment on view public.vw_renovacoes_duplicadas_suspeitas is
  'Renovacoes possivelmente duplicadas, ja descontadas as anuladas. SUSPEITA, nao veredito: aluno com dois tempos do mesmo curso, ou com duas matriculas reais no Emusys, aparece aqui legitimamente (caso Perola Madeira, matriculas 519 e 520). Conferir contra o Emusys antes de anular -- o criterio canonico e o contrato: o Emusys abre um contrato_id novo a cada renovacao.';
