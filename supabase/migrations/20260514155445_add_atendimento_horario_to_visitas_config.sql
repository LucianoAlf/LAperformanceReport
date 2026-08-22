-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


ALTER TABLE visitas_config
  ADD COLUMN atendimento_inicio_seg_sex TIME NOT NULL DEFAULT '11:00:00',
  ADD COLUMN atendimento_fim_seg_sex    TIME NOT NULL DEFAULT '20:00:00',
  ADD COLUMN atendimento_inicio_sab     TIME NOT NULL DEFAULT '08:00:00',
  ADD COLUMN atendimento_fim_sab        TIME NOT NULL DEFAULT '14:00:00';
