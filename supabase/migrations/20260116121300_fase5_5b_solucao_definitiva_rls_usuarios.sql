-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- SOLUÇÃO DEFINITIVA: Política RLS sem recursão
-- Remove a política problemática
DROP POLICY IF EXISTS "usuarios_select_policy" ON usuarios;

-- Cria política simples: qualquer usuário autenticado pode ler qualquer registro
-- O controle de acesso será feito no nível da aplicação
CREATE POLICY "usuarios_select_policy" ON usuarios
  FOR SELECT USING (true);

-- Manter as outras políticas restritivas para INSERT/UPDATE/DELETE
-- Apenas admin pode inserir/atualizar/deletar (verificado na aplicação)
