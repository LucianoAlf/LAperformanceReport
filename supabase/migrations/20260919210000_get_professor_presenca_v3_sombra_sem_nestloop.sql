-- get_professor_presenca_v3_sombra: o planejador escolhe nested loop entre
-- CTEs materializados porque o CTE params tem `where p_competencia is not null`
-- e parece devolver 1 linha. Medido 19/09/2026 (BEGIN/ROLLBACK, 5 recortes):
-- Barra 3,28s -> 0,61s; Recreio 6,35s -> 0,79s; CG 7,69s -> 0,93s;
-- consolidado 34,37s -> 1,47s; Recreio/ago 3,67s -> 0,65s. jsonb identico
-- nas 5, md5 do corpo intacto. Controle: Recreio set x ago diferem.
--
-- POR QUE ALTER, NAO CREATE OR REPLACE: o corpo nao muda; recriar reabre
-- EXECUTE para anon (ALTER DEFAULT PRIVILEGES) e apagaria este SET se o
-- cabecalho viesse sem ele. Vale so enquanto a funcao roda.
--
-- ⚠️ Proximo CREATE OR REPLACE desta funcao PRECISA de
--    SET enable_nestloop TO 'off'
--    logo abaixo de SET search_path TO 'public', 'pg_temp'.
--    Fonte do corpo continua em 20260718235000.

alter function public.get_professor_presenca_v3_sombra(date, uuid)
  set enable_nestloop = off;

comment on function public.get_professor_presenca_v3_sombra(date, uuid) is
  'Gate 8: presenca pontuavel desde 03/08/2026; observado respeita a politica temporal versionada de auditoria por unidade. SET enable_nestloop=off (2026-09-19): o CTE params com WHERE p_competencia IS NOT NULL faz o planejador nested-loopar CTEs materializados (consolidado 34s -> 1,5s, resposta identica). CREATE OR REPLACE sem este SET apaga o ajuste.';
