-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Previne recriação de item duplicado com mesmo nome (case/trim-insensitive) na mesma sala
-- enquanto ativo. Raiz do bug INVENTORY-DUP-DISAMBIG-LOOP (id 134 recriado pelo Rodrigo).
-- WHERE ativo: dar baixa (ativo=false) libera o nome novamente; itens baixados não bloqueiam.
CREATE UNIQUE INDEX IF NOT EXISTS inventario_nome_sala_ativo_uq
  ON inventario (sala_id, lower(btrim(nome)))
  WHERE ativo;
