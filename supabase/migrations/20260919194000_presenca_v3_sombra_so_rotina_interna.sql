-- 19/09/2026: get_professor_presenca_v3_sombra (LA Report) é SECURITY DEFINER, não
-- confere papel e devolve a presença de TODOS os professores — mas tinha EXECUTE
-- para `authenticated`. Os professores do LA Teacher logam neste mesmo projeto:
-- qualquer um alcançava os números dos colegas pelo PostgREST. Quem usa de verdade
-- é a rotina interna (fn_materializar_health_score_professor_v3, cron como
-- postgres); o site do LA Report não chama (só o tipo gerado). Fecha o acesso.
-- Espelhar no repositório do LA Report (combinado com o agente de lá).
revoke execute on function public.get_professor_presenca_v3_sombra(date, uuid) from authenticated, anon, public;
grant execute on function public.get_professor_presenca_v3_sombra(date, uuid) to service_role;
