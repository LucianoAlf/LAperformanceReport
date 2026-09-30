-- Decisao do Hugo (30/09/2026): "uma matricula e uma matricula, independente de ter sido
-- ex-aluno ou nao". Quem sai e volta paga de novo e conta como matricula comercial.
-- Tira is_ex_aluno e is_aluno_retorno de kpis_comercial_v2_sem_cache_20260923 (heranca da
-- auditoria P02.G2 de 15/06, sem decisao registrada). Diverge de
-- get_matriculas_comerciais_resumo_v1, que sempre contou. Caso: Adam Sales, CG, 09/2026.
-- Mes fechado nao muda (le do fechamento gravado). Aplicado via MCP em 30/09/2026 com
-- trava: aborta se a ancora nao casar exatamente 1x. Cache kpis_comercial_v2_cache limpo.
do $$
declare
  v_def text;
  v_a text := E'      AND coalesce(a.is_ex_aluno, false) = false\n';
  v_b text := E'      AND coalesce(a.is_aluno_retorno, false) = false\n';
begin
  select pg_get_functiondef('public.kpis_comercial_v2_sem_cache_20260923(uuid,integer,integer,text,date)'::regprocedure)
    into v_def;
  if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then
    raise exception 'ancora is_ex_aluno nao casou exatamente 1x';
  end if;
  if (length(v_def) - length(replace(v_def, v_b, ''))) / length(v_b) <> 1 then
    raise exception 'ancora is_aluno_retorno nao casou exatamente 1x';
  end if;
  execute replace(replace(v_def, v_a, ''), v_b, '');
end $$;

delete from public.kpis_comercial_v2_cache;
