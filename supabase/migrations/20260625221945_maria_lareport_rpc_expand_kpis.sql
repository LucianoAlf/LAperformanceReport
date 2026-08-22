-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

grant execute on function public.get_kpis_comercial_canonicos_v2(uuid, integer, integer, text, date) to maria_lareport_rpc;
grant execute on function public.get_tempo_permanencia(uuid, integer, integer) to maria_lareport_rpc;
grant execute on function public.get_kpis_evolucao_mensal(text, integer) to maria_lareport_rpc;
grant execute on function public.get_kpis_consolidados(integer) to maria_lareport_rpc;
grant execute on function public.get_kpis_unidade(character varying, integer) to maria_lareport_rpc;
grant execute on function public.get_resumo_renovacoes_proximas(uuid) to maria_lareport_rpc;
grant execute on function public.get_kpis_experimentais_professor(integer, integer, uuid) to maria_lareport_rpc;
