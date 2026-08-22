-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Corrigir alunos_pagantes de Fev/2026 na Barra (219 -> 217)
UPDATE dados_mensais
SET alunos_pagantes = 217,
    updated_at = NOW()
WHERE id = '8494478c-b64b-4a31-a526-6bf12cc536d6';
