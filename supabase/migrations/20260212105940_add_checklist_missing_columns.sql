-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Adicionar colunas faltantes na tabela farmer_checklists
ALTER TABLE farmer_checklists 
  ADD COLUMN IF NOT EXISTS periodicidade VARCHAR DEFAULT 'pontual',
  ADD COLUMN IF NOT EXISTS departamento VARCHAR DEFAULT 'administrativo',
  ADD COLUMN IF NOT EXISTS tipo_vinculo VARCHAR DEFAULT 'nenhum',
  ADD COLUMN IF NOT EXISTS filtro_vinculo JSONB;

-- Comentários para documentação
COMMENT ON COLUMN farmer_checklists.periodicidade IS 'pontual, diario, semanal, mensal';
COMMENT ON COLUMN farmer_checklists.departamento IS 'administrativo, comercial, pedagogico, geral';
COMMENT ON COLUMN farmer_checklists.tipo_vinculo IS 'nenhum, todos_alunos, por_curso, por_professor, manual';
COMMENT ON COLUMN farmer_checklists.filtro_vinculo IS 'JSON com filtro: {curso_id: 5} ou {professor_id: 12} ou {aluno_ids: [1,2,3]}';
