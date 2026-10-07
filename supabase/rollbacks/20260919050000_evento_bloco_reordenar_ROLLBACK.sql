-- ROLLBACK de 20260919050000_evento_bloco_reordenar.sql (LAPE-39)
--
-- A aba Grade para de salvar o arrasto dos BLOCOS (o das apresentacoes continua, e de
-- outra RPC). A ordem ja gravada fica como esta — a funcao so escreve quando chamada.

drop function if exists public.evento_bloco_reordenar_v1(bigint, bigint[]);
