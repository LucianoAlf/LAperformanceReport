-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Lista os telefones ativos, para o script de sync gerar a allowlist do canal.
-- SECURITY DEFINER: o sync chama a função sem precisar de SELECT direto na tabela.
create function governanca.listar_allowlist()
returns setof text
language sql
stable
security definer
set search_path = governanca, pg_temp
as $$
  select telefone from governanca.agente_usuarios where ativo = true order by telefone
$$;

revoke execute on function governanca.listar_allowlist() from public;
grant execute on function governanca.listar_allowlist() to lia_acesso_restrito;

comment on function governanca.listar_allowlist() is
  'Retorna telefones ativos para o sync da allowlist do canal (Lia = transversal, todos os colaboradores).';
