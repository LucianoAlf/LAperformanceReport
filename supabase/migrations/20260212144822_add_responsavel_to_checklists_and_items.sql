-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Adicionar responsavel_id ao checklist (quem é o dono/responsável)
ALTER TABLE farmer_checklists 
ADD COLUMN responsavel_id integer REFERENCES usuarios(id) ON DELETE SET NULL;

-- Adicionar responsavel_id aos items (tarefa atribuída a pessoa específica)
ALTER TABLE farmer_checklist_items 
ADD COLUMN responsavel_id integer REFERENCES usuarios(id) ON DELETE SET NULL;

-- Preencher responsavel_id dos checklists existentes com o colaborador_id APENAS se existir na tabela usuarios
UPDATE farmer_checklists fc
SET responsavel_id = fc.colaborador_id 
WHERE fc.responsavel_id IS NULL
  AND EXISTS (SELECT 1 FROM usuarios u WHERE u.id = fc.colaborador_id);

-- Índices para performance
CREATE INDEX idx_farmer_checklists_responsavel ON farmer_checklists(responsavel_id);
CREATE INDEX idx_farmer_checklist_items_responsavel ON farmer_checklist_items(responsavel_id);

-- Comentários
COMMENT ON COLUMN farmer_checklists.responsavel_id IS 'Colaborador responsável pelo checklist (pode ser diferente de quem criou)';
COMMENT ON COLUMN farmer_checklist_items.responsavel_id IS 'Colaborador responsável por esta tarefa específica (opcional, herda do checklist se null)';
