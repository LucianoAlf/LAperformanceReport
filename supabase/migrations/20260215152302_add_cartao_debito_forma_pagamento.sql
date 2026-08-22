-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Adicionar Cartão de Débito como forma de pagamento
INSERT INTO formas_pagamento (id, nome, sigla, ativo)
VALUES (7, 'Cartão de Débito', 'DEB', true);
