-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Tornar bucket crm-midia público para que a UAZAPI consiga acessar as URLs
UPDATE storage.buckets SET public = true WHERE name = 'crm-midia';

-- Remover policies existentes para evitar conflito
DROP POLICY IF EXISTS "Permitir upload crm-midia" ON storage.objects;
DROP POLICY IF EXISTS "Permitir leitura publica crm-midia" ON storage.objects;
DROP POLICY IF EXISTS "Permitir update crm-midia" ON storage.objects;

-- Policy para permitir upload (INSERT) por usuários autenticados
CREATE POLICY "Permitir upload crm-midia" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'crm-midia');

-- Policy para permitir leitura pública (SELECT)
CREATE POLICY "Permitir leitura publica crm-midia" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'crm-midia');

-- Policy para permitir update por autenticados
CREATE POLICY "Permitir update crm-midia" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'crm-midia');
