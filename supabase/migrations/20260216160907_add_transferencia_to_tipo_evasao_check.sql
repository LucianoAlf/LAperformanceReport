-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Adicionar 'transferencia' à constraint de tipo_evasao
ALTER TABLE movimentacoes_admin 
DROP CONSTRAINT movimentacoes_admin_tipo_evasao_check;

ALTER TABLE movimentacoes_admin 
ADD CONSTRAINT movimentacoes_admin_tipo_evasao_check 
CHECK (tipo_evasao IN ('interrompido', 'nao_renovou', 'interrompido_2_curso', 'interrompido_bolsista', 'interrompido_banda', 'transferencia'));
