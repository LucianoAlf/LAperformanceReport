-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'maria_lareport_rpc') then
    create role maria_lareport_rpc login;
  end if;
end $$;

grant usage on schema public to maria_lareport_rpc;
grant select on public.unidades to maria_lareport_rpc;

grant execute on function public.get_kpis_alunos_canonicos(uuid, integer, integer) to maria_lareport_rpc;
grant execute on function public.get_kpis_alunos_financeiro_vivo_canonico(uuid, integer, integer) to maria_lareport_rpc;
grant execute on function public.get_kpis_alunos_vinculos_vivo_canonico(uuid, integer, integer) to maria_lareport_rpc;
grant execute on function public.get_faltas_periodo(uuid, date, date) to maria_lareport_rpc;

-- Essas funções ficam mapeadas no contrato, mas só devem ser expostas quando forem SECURITY DEFINER
-- ou quando houver grants mínimos revisados para suas dependências internas.
-- public.get_kpis_comercial_canonicos_v2(uuid, integer, integer, text, date)
-- public.get_kpis_professor_periodo(integer, integer, uuid, date, date)
-- public.get_experimentais_professor_canonicos_v1(uuid, integer, integer, integer)
-- public.get_resumo_renovacoes_proximas(uuid)
-- public.get_kpis_evolucao_mensal(text, integer)
-- public.get_kpis_consolidados(integer)
