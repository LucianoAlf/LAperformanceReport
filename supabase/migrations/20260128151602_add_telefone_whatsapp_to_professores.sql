-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Adicionar campo telefone_whatsapp na tabela professores
ALTER TABLE professores 
ADD COLUMN IF NOT EXISTS telefone_whatsapp VARCHAR(20);

-- Comentário explicativo
COMMENT ON COLUMN professores.telefone_whatsapp IS 'Número de WhatsApp do professor para notificações do sistema de projetos';
