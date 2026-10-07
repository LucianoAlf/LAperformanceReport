-- 19/09/2026: projecao_aulas (sem RLS, ~52 mil linhas de projeção de aula por aluno)
-- dava TODOS os privilégios a anon e authenticated: qualquer um com a chave anon
-- (que vai no bundle do site) lia, alterava e apagava. Quem usa de verdade:
--   · LA Report TimelineContrato.tsx:43 — só SELECT, como authenticated (equipe);
--   · get_radar_renovacoes / get_watchlist_projecao (INVOKER) — só leitura;
--   · escrita: triggers e rotinas SECURITY DEFINER (dono postgres) e service_role.
-- pg_stat_statements desde 15/09: nenhuma chamada de anon/authenticated.
-- Fica: authenticated só SELECT (o porteiro de requisição, 20260919199000, tira o
-- professor dessa rota); anon e PUBLIC nada; service_role e agentes como estavam.
revoke all on table public.projecao_aulas from anon, public;
revoke insert, update, delete, truncate, references, trigger on table public.projecao_aulas from authenticated;
grant select on table public.projecao_aulas to authenticated;
grant all on table public.projecao_aulas to service_role;
