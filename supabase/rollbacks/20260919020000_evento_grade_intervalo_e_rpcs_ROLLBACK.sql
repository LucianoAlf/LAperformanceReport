-- ROLLBACK de 20260919020000_evento_grade_intervalo_e_rpcs.sql (LAPE-39)
--
-- Derruba as duas RPCs da grade e o intervalo configuravel. A aba Grade para de adicionar
-- apresentacao e de salvar arrasto; o calculo de horario perde a folga entre blocos.
--
-- ⚠️ A coluna guarda configuracao que alguem pode ter mudado por evento. Derruba-la perde
-- esse ajuste sem volta — conferir antes se algum evento tem valor diferente do default:
--   select id, titulo, intervalo_entre_blocos_segundos from evento
--    where intervalo_entre_blocos_segundos <> 2700;

drop function if exists public.evento_grade_reordenar_v1(bigint, jsonb);
drop function if exists public.evento_apresentacao_adicionar_v1(bigint, integer, integer);

alter table public.evento drop constraint if exists evento_intervalo_positivo;
alter table public.evento drop column if exists intervalo_entre_blocos_segundos;
