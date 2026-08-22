-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Log de auditoria do sync-professores-emusys
-- Registra eventos de sincronização entre o Emusys e nossa base de professores
CREATE TABLE IF NOT EXISTS professores_sync_log (
  id BIGSERIAL PRIMARY KEY,
  evento VARCHAR(50) NOT NULL,
  -- Tipos: criado_novo | vinculou_unidade_existente | vinculou_emusys_id_por_nome | sumiu_da_lista | sem_match | erro
  unidade_id UUID REFERENCES unidades(id) ON DELETE CASCADE,
  professor_id INTEGER REFERENCES professores(id) ON DELETE SET NULL,
  emusys_id INTEGER,
  nome_emusys TEXT,
  detalhes JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_professores_sync_log_created_at ON professores_sync_log(created_at DESC);
CREATE INDEX idx_professores_sync_log_evento ON professores_sync_log(evento, created_at DESC);
CREATE INDEX idx_professores_sync_log_unidade ON professores_sync_log(unidade_id, created_at DESC);

COMMENT ON TABLE professores_sync_log IS 'Auditoria do sync semanal de professores com o Emusys (edge: sync-professores-emusys)';
COMMENT ON COLUMN professores_sync_log.evento IS 'criado_novo | vinculou_unidade_existente | vinculou_emusys_id_por_nome | sumiu_da_lista | sem_match | erro';
