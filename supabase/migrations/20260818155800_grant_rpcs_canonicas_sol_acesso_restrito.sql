-- Sol (papel sol_acesso_restrito) passa a chamar as RPCs canonicas em vez de
-- montar SELECT a mao. Aprovado pelo Alf em 2026-08-18.
--
-- Motivo: a Sol nao tinha EXECUTE nas RPCs canonicas, entao caia em SQL manual e
-- devolvia numero errado. Medido na Barra/ago-2026, mesma pergunta ("alunos ativos"):
--   get_kpis_alunos_admin_operacional -> 246  (canonico, igual ao relatorio das 20h)
--   count(*) from alunos status='ativo' -> 271
--   idem, is_segundo_curso=false        -> 257
--   count(distinct nome)                -> 246 na Barra, 418 em CG (canonico 417)
-- Nenhuma aproximacao manual e confiavel.
--
-- Escopo: somente EXECUTE de funcoes de LEITURA. Nenhuma escrita, nenhum GRANT de tabela.
-- As 5 abaixo ja rodavam em conexao direta (sem guard de JWT); faltava apenas o GRANT.
--
-- NAO entram aqui, de proposito: get_faturas_alunos_financeiro_v1 (a Sol JA tem o GRANT e
-- mesmo assim falha) e get_inadimplencia_canonica / sol_caixa_inadimplentes. As tres exigem
-- auth.role() in ('authenticated','service_role'); auth.role() le o claim do JWT, nao o papel
-- do Postgres, entao conexao direta devolve NULL e cai em 42501. GRANT nao resolve — exige
-- decisao sobre o guard, ainda pendente.

grant execute on function public.get_kpis_alunos_admin_operacional(uuid, integer, integer)            to sol_acesso_restrito;
grant execute on function public.get_kpis_alunos_canonicos(uuid, integer, integer)                    to sol_acesso_restrito;
grant execute on function public.get_kpis_comercial_canonicos_v2(uuid, integer, integer, text, date)  to sol_acesso_restrito;
grant execute on function public.buscar_alunos_ativos_atuais_canonicos(text, uuid, integer)           to sol_acesso_restrito;
grant execute on function public.maria_lareport_buscar_alunos(text, uuid, integer)                    to sol_acesso_restrito;
