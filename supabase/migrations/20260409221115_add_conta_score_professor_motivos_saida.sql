-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Adicionar flag para configurar quais motivos de evasão contam no score do professor
ALTER TABLE motivos_saida ADD COLUMN IF NOT EXISTS conta_score_professor BOOLEAN DEFAULT true;

-- Motivos fora do controle do professor = não conta
UPDATE motivos_saida SET conta_score_professor = false WHERE categoria IN ('financeiro', 'mudanca', 'saude', 'estudos', 'tempo');
-- desistencia, inadimplencia, outro = conta (default true)
