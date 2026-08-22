-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Adicionar campo para registrar minutos de atraso nas ocorrências de pontualidade
ALTER TABLE professor_360_ocorrencias ADD COLUMN IF NOT EXISTS minutos_atraso INTEGER DEFAULT NULL;

-- Comentário explicativo
COMMENT ON COLUMN professor_360_ocorrencias.minutos_atraso IS 'Minutos de atraso para ocorrências de pontualidade. Se > 10 min, perde ponto direto sem tolerância.';

-- Atualizar descrição do critério Pontualidade
UPDATE professor_360_criterios 
SET descricao = 'Atrasos acima de 10 minutos'
WHERE codigo = 'atrasos';
