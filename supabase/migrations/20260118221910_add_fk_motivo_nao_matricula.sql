-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Adicionar foreign key de motivo_nao_matricula_id para motivos_nao_matricula
ALTER TABLE leads_diarios 
DROP CONSTRAINT IF EXISTS leads_diarios_motivo_nao_matricula_id_fkey;

ALTER TABLE leads_diarios 
ADD CONSTRAINT leads_diarios_motivo_nao_matricula_id_fkey 
FOREIGN KEY (motivo_nao_matricula_id) 
REFERENCES motivos_nao_matricula(id);
