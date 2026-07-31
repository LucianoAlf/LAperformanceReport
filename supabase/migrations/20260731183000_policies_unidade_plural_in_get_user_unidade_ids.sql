-- Troca `unidade_id = get_user_unidade_id()` por
--       `unidade_id IN (select get_user_unidade_ids())` nas policies de unidade.
--
-- EQUIVALENCIA POR CONSTRUCAO: fora da lista `rbac_piloto_usuarios`, a funcao
-- plural devolve exatamente a unica unidade do legado, e `x IN (um valor)` e
-- identico a `x = valor`. Verificado com snapshot antes/depois: 29 usuarios x 11
-- tabelas = 319 medicoes, 0 divergencias.
--
-- Alcance: 40 policies em 13 tabelas (alunos, leads, metas, movimentacoes,
-- salas, relatorios_diarios, relatorios_pedagogicos, renovacoes_legado,
-- risco_evasao, vcards_unidade, aluno_presenca, crm_followups,
-- crm_lead_historico).
--
-- Idempotente: reexecutar nao encontra mais o padrao antigo e nao altera nada.
do $$
declare r record;
begin
  for r in
    select format(
      'alter policy %I on public.%I%s%s;',
      policyname, tablename,
      case when qual is null then ''
           else ' using (' || replace(qual, '= get_user_unidade_id()',
                'IN (select public.get_user_unidade_ids())') || ')' end,
      case when with_check is null then ''
           else ' with check (' || replace(with_check, '= get_user_unidade_id()',
                'IN (select public.get_user_unidade_ids())') || ')' end
    ) as cmd
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual,'') || coalesce(with_check,'')) like '%= get_user_unidade_id()%'
  loop
    execute r.cmd;
  end loop;
end $$;
