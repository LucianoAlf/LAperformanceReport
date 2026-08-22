-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Habilitar RLS na tabela anotacoes_alunos
ALTER TABLE anotacoes_alunos ENABLE ROW LEVEL SECURITY;

-- Política para SELECT: todos podem ver todas as anotações
CREATE POLICY "Permitir leitura de anotações para todos"
ON anotacoes_alunos FOR SELECT
TO authenticated
USING (true);

-- Política para INSERT: todos autenticados podem criar anotações
CREATE POLICY "Permitir criação de anotações para autenticados"
ON anotacoes_alunos FOR INSERT
TO authenticated
WITH CHECK (true);

-- Política para UPDATE: todos autenticados podem atualizar anotações
CREATE POLICY "Permitir atualização de anotações para autenticados"
ON anotacoes_alunos FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Política para DELETE: todos autenticados podem deletar anotações
CREATE POLICY "Permitir exclusão de anotações para autenticados"
ON anotacoes_alunos FOR DELETE
TO authenticated
USING (true);
