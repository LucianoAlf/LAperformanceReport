-- Fecha EXECUTE de anon/PUBLIC em tres funcoes do caminho de Professores.
--
-- Encontrado em 08/08/2026 enquanto se diagnosticava a lentidao de Media/Turma.
-- O projeto tem ALTER DEFAULT PRIVILEGES no schema public concedendo EXECUTE em
-- funcoes novas a anon, entao toda funcao recriada nasce aberta -- e por isso a
-- ACL correta para RPC de app ({postgres=X, authenticated=X, service_role=X})
-- precisa ser reafirmada explicitamente. Mesma armadilha ja registrada no
-- CLAUDE.md para get_agenda_dia e get_kpis_alunos_canonicos_base_v131.
--
-- NAO havia vazamento de dado em nenhuma das tres:
--   - fn_health_score_professor_v3_ator_leitura e SECURITY DEFINER, mas e um
--     guarda: com anon, auth.uid() e NULL e ela lanca HEALTH_SCORE_V3_ACESSO_NEGADO.
--   - get_carteira_professores e get_kpis_professor_periodo_base_legado_20260713
--     sao SECURITY INVOKER, entao a RLS ja respondia por elas.
-- Isto e alinhamento com o padrao documentado, nao remediacao de incidente.
--
-- As funcoes de gatilho do mesmo caminho (check_automacao_professor_vinculado,
-- sync_experimentais_professor, update_config_health_score_professor_updated_at)
-- ficam como estao: gatilho nao exige EXECUTE de quem dispara o comando, entao
-- mexer nelas seria risco sem ganho.

revoke execute on function public.fn_health_score_professor_v3_ator_leitura(uuid)
  from public, anon;
grant execute on function public.fn_health_score_professor_v3_ator_leitura(uuid)
  to authenticated, service_role;

revoke execute on function public.get_carteira_professores(uuid)
  from public, anon;
grant execute on function public.get_carteira_professores(uuid)
  to authenticated, service_role;

revoke execute on function public.get_kpis_professor_periodo_base_legado_20260713(integer, integer, uuid, date, date)
  from public, anon;
grant execute on function public.get_kpis_professor_periodo_base_legado_20260713(integer, integer, uuid, date, date)
  to authenticated, service_role;
