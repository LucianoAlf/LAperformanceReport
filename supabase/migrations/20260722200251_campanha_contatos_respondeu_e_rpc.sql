-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Marca idempotente de "já contabilizei a 1ª resposta deste contato"
ALTER TABLE campanha_contatos
  ADD COLUMN IF NOT EXISTS respondeu boolean NOT NULL DEFAULT false;

-- Incremento atômico do contador de respostas da campanha (evita race read-modify-write)
CREATE OR REPLACE FUNCTION incrementar_respondidos_campanha(p_campanha_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE campanhas
     SET respondidos = respondidos + 1,
         updated_at = now()
   WHERE id = p_campanha_id;
$$;
