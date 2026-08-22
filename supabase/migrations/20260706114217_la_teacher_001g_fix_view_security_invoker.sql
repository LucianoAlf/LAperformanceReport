-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Recriar vw_risco_atual como security_invoker para respeitar o RLS de risco_evasao
-- (risco cru continua visível apenas para coordenação, conforme a policy).
create or replace view public.vw_risco_atual
with (security_invoker = true) as
  select distinct on (aluno_id) *
  from public.risco_evasao
  order by aluno_id, calculado_em desc, id desc;

-- Reforçar o grant de leitura para a role do Hugo (ml_jobs continua lendo o histórico direto)
grant select on public.vw_risco_atual to ml_jobs;
