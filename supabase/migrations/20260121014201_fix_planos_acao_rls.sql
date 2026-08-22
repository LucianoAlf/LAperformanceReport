-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Remover políticas antigas
DROP POLICY IF EXISTS "Usuários podem ver planos da sua unidade" ON planos_acao;
DROP POLICY IF EXISTS "Usuários podem criar planos" ON planos_acao;
DROP POLICY IF EXISTS "Usuários podem atualizar planos" ON planos_acao;
DROP POLICY IF EXISTS "Usuários podem deletar planos" ON planos_acao;

-- Criar políticas para roles anon e authenticated
CREATE POLICY "planos_acao_select" ON planos_acao FOR SELECT USING (true);
CREATE POLICY "planos_acao_insert" ON planos_acao FOR INSERT WITH CHECK (true);
CREATE POLICY "planos_acao_update" ON planos_acao FOR UPDATE USING (true);
CREATE POLICY "planos_acao_delete" ON planos_acao FOR DELETE USING (true);

-- Garantir que as roles têm permissão
GRANT ALL ON planos_acao TO anon;
GRANT ALL ON planos_acao TO authenticated;
GRANT ALL ON planos_acao TO service_role;
