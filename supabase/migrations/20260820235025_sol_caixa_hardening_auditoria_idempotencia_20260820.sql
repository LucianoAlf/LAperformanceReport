-- [RECUPERADA DO HISTORICO 2026-08-22] Migration do Caixa V3 da Sol, aplicada em
-- producao via MCP/Supabase durante o desenvolvimento do V3 (15-21/08/2026) sem o
-- arquivo versionado. SQL extraido byte a byte de supabase_migrations.schema_migrations
-- (statements como aplicados). Consolidacao pedida pelo Alf em 22/08; espelho em
-- docs/sol-caixa-v3/MIGRATIONS_APLICADAS.md no repo da Sol (sol-openclaw-backup).
-- NAO REAPLICAR: ja esta no schema_migrations com esta mesma version.

-- Hardening pontual do bloco Sol Caixa: auditoria + idempotencia + helpers.
-- Escopo propositalmente estreito: nao mexe em tabelas antigas nem em RLS geral do projeto.

-- 1) A tabela de auditoria nova nao deve ter acesso cru por clients ou outros agentes.
revoke all on table public.sol_caixa_operacoes_auditoria_v1 from public;
revoke all on table public.sol_caixa_operacoes_auditoria_v1 from anon;
revoke all on table public.sol_caixa_operacoes_auditoria_v1 from authenticated;
revoke all on table public.sol_caixa_operacoes_auditoria_v1 from sol_acesso_restrito;
revoke all on table public.sol_caixa_operacoes_auditoria_v1 from sol_caixa_readonly;
revoke all on table public.sol_caixa_operacoes_auditoria_v1 from fabio_agent;
revoke all on table public.sol_caixa_operacoes_auditoria_v1 from lia_acesso_restrito;
revoke all on table public.sol_caixa_operacoes_auditoria_v1 from mila_acesso_restrito;

alter table public.sol_caixa_operacoes_auditoria_v1 enable row level security;

-- 2) Idempotencia: garante unicidade real para evitar corrida simples por chave repetida.
create unique index if not exists sol_caixa_operacoes_auditoria_v1_idem_uniq
  on public.sol_caixa_operacoes_auditoria_v1 (idempotency_key)
  where idempotency_key is not null;

-- 3) Helpers/preflights nao ficam publicos. Mantem roles explicitamente necessarias.
revoke execute on function public.sol_caixa_grupo_operacao_ok(uuid,text,text) from public, anon, authenticated;
revoke execute on function public.sol_caixa_ator_operacao_ok(uuid,text,text) from public, anon, authenticated;
revoke execute on function public.sol_caixa_readonly_preflight_v1() from public, anon, authenticated;
revoke execute on function public.sol_caixa_readonly_preflight_v2() from public, anon, authenticated;
revoke execute on function public.sol_caixa_readonly_preflight_v3() from public, anon, authenticated;

-- Grants explicitos mantidos/normalizados para as roles usadas pelos gates.
grant execute on function public.sol_caixa_grupo_operacao_ok(uuid,text,text) to sol_acesso_restrito;
grant execute on function public.sol_caixa_ator_operacao_ok(uuid,text,text) to sol_acesso_restrito;
grant execute on function public.sol_caixa_ator_operacao_ok(uuid,text,text) to sol_caixa_readonly;
grant execute on function public.sol_caixa_readonly_preflight_v1() to sol_caixa_readonly;
grant execute on function public.sol_caixa_readonly_preflight_v2() to sol_caixa_readonly;
grant execute on function public.sol_caixa_readonly_preflight_v2() to sol_acesso_restrito;
grant execute on function public.sol_caixa_readonly_preflight_v3() to sol_acesso_restrito;
