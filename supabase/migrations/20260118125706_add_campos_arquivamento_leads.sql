-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Adicionar campos de arquivamento em leads_diarios
ALTER TABLE leads_diarios 
ADD COLUMN IF NOT EXISTS arquivado BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS data_arquivamento DATE,
ADD COLUMN IF NOT EXISTS motivo_arquivamento_id INTEGER REFERENCES motivos_arquivamento(id),
ADD COLUMN IF NOT EXISTS motivo_nao_matricula_id INTEGER REFERENCES motivos_saida(id);

-- Comentários nos campos
COMMENT ON COLUMN leads_diarios.arquivado IS 'Se o lead foi arquivado sem conversão';
COMMENT ON COLUMN leads_diarios.data_arquivamento IS 'Data em que o lead foi arquivado';
COMMENT ON COLUMN leads_diarios.motivo_arquivamento_id IS 'Motivo do arquivamento do lead';
COMMENT ON COLUMN leads_diarios.motivo_nao_matricula_id IS 'Motivo pelo qual a experimental não virou matrícula';
