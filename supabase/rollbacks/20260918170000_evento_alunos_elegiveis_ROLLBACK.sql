-- ROLLBACK de 20260918170000_evento_alunos_elegiveis.sql (LAPE-39)
--
-- Derrubar a view faz a aba Alunos do evento parar de carregar (a lista de candidatos vem
-- so dela). Nada mais no sistema a consome — ela nasceu neste modulo.

drop view if exists public.vw_evento_aluno_elegivel_v1;
