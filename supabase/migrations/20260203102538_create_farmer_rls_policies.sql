-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- ============================================
-- PAINEL FARMER - RLS POLICIES
-- ============================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE farmer_rotinas ENABLE ROW LEVEL SECURITY;
ALTER TABLE farmer_rotinas_execucao ENABLE ROW LEVEL SECURITY;
ALTER TABLE farmer_tarefas ENABLE ROW LEVEL SECURITY;
ALTER TABLE farmer_recados ENABLE ROW LEVEL SECURITY;
ALTER TABLE farmer_templates ENABLE ROW LEVEL SECURITY;

-- ========== farmer_rotinas ==========
-- Farmers veem suas próprias rotinas, gerentes/admin veem da unidade
CREATE POLICY "farmer_rotinas_select" ON farmer_rotinas FOR SELECT
USING (
  colaborador_id IN (SELECT id FROM colaboradores WHERE usuario_id = auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM colaboradores c 
    WHERE c.usuario_id = auth.uid() 
    AND c.tipo IN ('gerente', 'admin')
    AND (c.unidade_id = farmer_rotinas.unidade_id OR c.tipo = 'admin')
  )
  OR
  -- Permitir acesso se não há colaborador vinculado (desenvolvimento)
  NOT EXISTS (SELECT 1 FROM colaboradores WHERE usuario_id = auth.uid())
);

CREATE POLICY "farmer_rotinas_insert" ON farmer_rotinas FOR INSERT
WITH CHECK (
  colaborador_id IN (SELECT id FROM colaboradores WHERE usuario_id = auth.uid())
  OR
  NOT EXISTS (SELECT 1 FROM colaboradores WHERE usuario_id = auth.uid())
);

CREATE POLICY "farmer_rotinas_update" ON farmer_rotinas FOR UPDATE
USING (
  colaborador_id IN (SELECT id FROM colaboradores WHERE usuario_id = auth.uid())
  OR
  NOT EXISTS (SELECT 1 FROM colaboradores WHERE usuario_id = auth.uid())
);

CREATE POLICY "farmer_rotinas_delete" ON farmer_rotinas FOR DELETE
USING (
  colaborador_id IN (SELECT id FROM colaboradores WHERE usuario_id = auth.uid())
  OR
  NOT EXISTS (SELECT 1 FROM colaboradores WHERE usuario_id = auth.uid())
);

-- ========== farmer_rotinas_execucao ==========
CREATE POLICY "farmer_rotinas_exec_select" ON farmer_rotinas_execucao FOR SELECT
USING (
  colaborador_id IN (SELECT id FROM colaboradores WHERE usuario_id = auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM colaboradores c 
    WHERE c.usuario_id = auth.uid() 
    AND c.tipo IN ('gerente', 'admin')
  )
  OR
  NOT EXISTS (SELECT 1 FROM colaboradores WHERE usuario_id = auth.uid())
);

CREATE POLICY "farmer_rotinas_exec_insert" ON farmer_rotinas_execucao FOR INSERT
WITH CHECK (
  colaborador_id IN (SELECT id FROM colaboradores WHERE usuario_id = auth.uid())
  OR
  NOT EXISTS (SELECT 1 FROM colaboradores WHERE usuario_id = auth.uid())
);

CREATE POLICY "farmer_rotinas_exec_update" ON farmer_rotinas_execucao FOR UPDATE
USING (
  colaborador_id IN (SELECT id FROM colaboradores WHERE usuario_id = auth.uid())
  OR
  NOT EXISTS (SELECT 1 FROM colaboradores WHERE usuario_id = auth.uid())
);

-- ========== farmer_tarefas ==========
CREATE POLICY "farmer_tarefas_select" ON farmer_tarefas FOR SELECT
USING (
  colaborador_id IN (SELECT id FROM colaboradores WHERE usuario_id = auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM colaboradores c 
    WHERE c.usuario_id = auth.uid() 
    AND c.tipo IN ('gerente', 'admin')
    AND (c.unidade_id = farmer_tarefas.unidade_id OR c.tipo = 'admin')
  )
  OR
  NOT EXISTS (SELECT 1 FROM colaboradores WHERE usuario_id = auth.uid())
);

CREATE POLICY "farmer_tarefas_insert" ON farmer_tarefas FOR INSERT
WITH CHECK (
  colaborador_id IN (SELECT id FROM colaboradores WHERE usuario_id = auth.uid())
  OR
  NOT EXISTS (SELECT 1 FROM colaboradores WHERE usuario_id = auth.uid())
);

CREATE POLICY "farmer_tarefas_update" ON farmer_tarefas FOR UPDATE
USING (
  colaborador_id IN (SELECT id FROM colaboradores WHERE usuario_id = auth.uid())
  OR
  NOT EXISTS (SELECT 1 FROM colaboradores WHERE usuario_id = auth.uid())
);

CREATE POLICY "farmer_tarefas_delete" ON farmer_tarefas FOR DELETE
USING (
  colaborador_id IN (SELECT id FROM colaboradores WHERE usuario_id = auth.uid())
  OR
  NOT EXISTS (SELECT 1 FROM colaboradores WHERE usuario_id = auth.uid())
);

-- ========== farmer_recados ==========
CREATE POLICY "farmer_recados_select" ON farmer_recados FOR SELECT
USING (
  colaborador_id IN (SELECT id FROM colaboradores WHERE usuario_id = auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM colaboradores c 
    WHERE c.usuario_id = auth.uid() 
    AND c.tipo IN ('gerente', 'admin')
  )
  OR
  NOT EXISTS (SELECT 1 FROM colaboradores WHERE usuario_id = auth.uid())
);

CREATE POLICY "farmer_recados_insert" ON farmer_recados FOR INSERT
WITH CHECK (
  colaborador_id IN (SELECT id FROM colaboradores WHERE usuario_id = auth.uid())
  OR
  NOT EXISTS (SELECT 1 FROM colaboradores WHERE usuario_id = auth.uid())
);

-- ========== farmer_templates ==========
-- Templates são públicos para leitura (globais ou da unidade)
CREATE POLICY "farmer_templates_select" ON farmer_templates FOR SELECT
USING (
  unidade_id IS NULL -- globais
  OR
  unidade_id IN (SELECT unidade_id FROM colaboradores WHERE usuario_id = auth.uid())
  OR
  NOT EXISTS (SELECT 1 FROM colaboradores WHERE usuario_id = auth.uid())
);

-- Apenas admin pode criar/editar templates
CREATE POLICY "farmer_templates_insert" ON farmer_templates FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM colaboradores WHERE usuario_id = auth.uid() AND tipo = 'admin')
  OR
  NOT EXISTS (SELECT 1 FROM colaboradores WHERE usuario_id = auth.uid())
);

CREATE POLICY "farmer_templates_update" ON farmer_templates FOR UPDATE
USING (
  EXISTS (SELECT 1 FROM colaboradores WHERE usuario_id = auth.uid() AND tipo = 'admin')
  OR
  NOT EXISTS (SELECT 1 FROM colaboradores WHERE usuario_id = auth.uid())
);
