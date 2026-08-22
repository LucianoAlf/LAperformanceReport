-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Coluna de dedup/idempotencia para os webhooks matricula_aviso_previo_* (Emusys v1.4.0, 03/08/2026).
-- Mesmo precedente do emusys_matricula_id: o aviso_previo.id do Emusys e a chave estavel
-- (adicionado/editado/removido referenciam o mesmo id), enquanto aluno+mes_saida pode mudar
-- entre edicoes. Permite upsert idempotente e remocao precisa.

ALTER TABLE public.movimentacoes_admin
  ADD COLUMN IF NOT EXISTS emusys_aviso_previo_id integer;

CREATE INDEX IF NOT EXISTS idx_movimentacoes_admin_emusys_aviso_previo
  ON public.movimentacoes_admin (emusys_aviso_previo_id)
  WHERE emusys_aviso_previo_id IS NOT NULL;
