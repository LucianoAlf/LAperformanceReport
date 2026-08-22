-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Habilitar RLS na tabela historico_pagamentos
ALTER TABLE historico_pagamentos ENABLE ROW LEVEL SECURITY;

-- Política para SELECT: todos autenticados podem ler
CREATE POLICY "Permitir leitura de histórico para autenticados"
ON historico_pagamentos FOR SELECT
TO authenticated
USING (true);

-- Política para INSERT: todos autenticados podem criar
CREATE POLICY "Permitir criação de histórico para autenticados"
ON historico_pagamentos FOR INSERT
TO authenticated
WITH CHECK (true);

-- Política para UPDATE: todos autenticados podem atualizar
CREATE POLICY "Permitir atualização de histórico para autenticados"
ON historico_pagamentos FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Política para DELETE: todos autenticados podem deletar
CREATE POLICY "Permitir exclusão de histórico para autenticados"
ON historico_pagamentos FOR DELETE
TO authenticated
USING (true);
