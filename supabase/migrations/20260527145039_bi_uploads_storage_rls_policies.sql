-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


CREATE POLICY "bi_uploads_insert_authenticated"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'bi-uploads');

CREATE POLICY "bi_uploads_select_authenticated"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'bi-uploads');
