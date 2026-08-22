-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Dedup de experimental por chave de negocio, SO para linhas novas (id > 1227).
-- Corrige o futuro sem colapsar o historico: as duplicatas antigas (id <= 1227)
-- ficam fora do indice, entao ele cria sem erro. A partir daqui, os reenvios
-- simultaneos do Emusys (mesma aula, body.id diferente a cada POST) colapsam
-- para 1 linha via ON CONFLICT na RPC registrar_experimental.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_exp_negocio_novo
ON public.lead_experimentais (
  lead_id, data_experimental, horario_experimental, (COALESCE(curso_interesse_id, -1))
)
WHERE id > 1227 AND status::text <> 'cancelada';
