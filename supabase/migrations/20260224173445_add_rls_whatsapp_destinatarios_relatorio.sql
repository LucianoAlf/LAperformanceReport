-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Permitir SELECT para usuários autenticados (frontend)
CREATE POLICY "Authenticated users can read destinatarios"
  ON whatsapp_destinatarios_relatorio
  FOR SELECT
  TO authenticated
  USING (true);

-- Permitir INSERT/UPDATE/DELETE para usuários autenticados (admin configura via frontend)
CREATE POLICY "Authenticated users can manage destinatarios"
  ON whatsapp_destinatarios_relatorio
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
