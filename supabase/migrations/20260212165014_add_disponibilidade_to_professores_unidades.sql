-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Adicionar coluna de disponibilidade na tabela professores_unidades
-- Formato JSONB: { "Segunda": { "inicio": "10:00", "fim": "20:00" }, ... }
ALTER TABLE professores_unidades 
ADD COLUMN disponibilidade JSONB DEFAULT NULL;

-- Comentário na coluna para documentação
COMMENT ON COLUMN professores_unidades.disponibilidade IS 
'Dias e horários de disponibilidade do professor nesta unidade. Formato: {"Segunda": {"inicio": "10:00", "fim": "20:00"}, ...}';
