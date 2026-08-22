-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Adicionar campo status_pagamento na tabela alunos
ALTER TABLE alunos 
ADD COLUMN IF NOT EXISTS status_pagamento VARCHAR(20) DEFAULT 'em_dia';

-- Adicionar comentário explicativo
COMMENT ON COLUMN alunos.status_pagamento IS 'Status de pagamento: em_dia, inadimplente, parcial';
