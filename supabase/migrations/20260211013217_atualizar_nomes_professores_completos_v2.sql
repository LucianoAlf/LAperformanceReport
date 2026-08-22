-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Atualizar nomes dos professores para corresponder aos nomes completos do Emusys
-- Isso permitirá que o matching por nome funcione corretamente no webhook

-- Caso confirmado: Renam → Renan Amorim Guimarães
UPDATE professores 
SET 
    nome = 'Renan Amorim Guimarães',
    updated_at = NOW()
WHERE id = 34 AND nome = 'Renam Amorim';

-- Log das alterações
DO $$
DECLARE
    v_updated INTEGER;
BEGIN
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RAISE NOTICE 'Professor ID 34 atualizado: Renam Amorim → Renan Amorim Guimarães';
END $$;
