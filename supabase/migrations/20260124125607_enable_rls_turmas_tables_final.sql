-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Habilitar RLS nas tabelas de turmas
ALTER TABLE alunos_turmas ENABLE ROW LEVEL SECURITY;
ALTER TABLE turmas ENABLE ROW LEVEL SECURITY;
ALTER TABLE turmas_alunos ENABLE ROW LEVEL SECURITY;
ALTER TABLE turmas_explicitas ENABLE ROW LEVEL SECURITY;
ALTER TABLE turmas_historico ENABLE ROW LEVEL SECURITY;

-- Políticas para alunos_turmas
CREATE POLICY "alunos_turmas_select_policy" ON alunos_turmas
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND perfil = 'admin' AND unidade_id IS NULL)
    OR
    EXISTS (
      SELECT 1 FROM alunos a
      JOIN usuarios u ON u.auth_user_id = auth.uid()
      WHERE a.id = alunos_turmas.aluno_id
      AND a.unidade_id = u.unidade_id
    )
  );

CREATE POLICY "alunos_turmas_insert_policy" ON alunos_turmas
  FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND perfil = 'admin' AND unidade_id IS NULL)
    OR
    EXISTS (
      SELECT 1 FROM alunos a
      JOIN usuarios u ON u.auth_user_id = auth.uid()
      WHERE a.id = alunos_turmas.aluno_id
      AND a.unidade_id = u.unidade_id
    )
  );

CREATE POLICY "alunos_turmas_update_policy" ON alunos_turmas
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND perfil = 'admin' AND unidade_id IS NULL)
    OR
    EXISTS (
      SELECT 1 FROM alunos a
      JOIN usuarios u ON u.auth_user_id = auth.uid()
      WHERE a.id = alunos_turmas.aluno_id
      AND a.unidade_id = u.unidade_id
    )
  );

CREATE POLICY "alunos_turmas_delete_policy" ON alunos_turmas
  FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND perfil = 'admin' AND unidade_id IS NULL)
    OR
    EXISTS (
      SELECT 1 FROM alunos a
      JOIN usuarios u ON u.auth_user_id = auth.uid()
      WHERE a.id = alunos_turmas.aluno_id
      AND a.unidade_id = u.unidade_id
    )
  );

-- Políticas para turmas
CREATE POLICY "turmas_select_policy" ON turmas
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND perfil = 'admin' AND unidade_id IS NULL)
    OR
    EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND unidade_id = turmas.unidade_id)
  );

CREATE POLICY "turmas_insert_policy" ON turmas
  FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND perfil = 'admin' AND unidade_id IS NULL)
    OR
    EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND unidade_id = turmas.unidade_id)
  );

CREATE POLICY "turmas_update_policy" ON turmas
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND perfil = 'admin' AND unidade_id IS NULL)
    OR
    EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND unidade_id = turmas.unidade_id)
  );

CREATE POLICY "turmas_delete_policy" ON turmas
  FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND perfil = 'admin' AND unidade_id IS NULL)
    OR
    EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND unidade_id = turmas.unidade_id)
  );

-- Políticas para turmas_alunos
CREATE POLICY "turmas_alunos_select_policy" ON turmas_alunos
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND perfil = 'admin' AND unidade_id IS NULL)
    OR
    EXISTS (
      SELECT 1 FROM turmas t
      JOIN usuarios u ON u.auth_user_id = auth.uid()
      WHERE t.id = turmas_alunos.turma_id
      AND t.unidade_id = u.unidade_id
    )
  );

CREATE POLICY "turmas_alunos_insert_policy" ON turmas_alunos
  FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND perfil = 'admin' AND unidade_id IS NULL)
    OR
    EXISTS (
      SELECT 1 FROM turmas t
      JOIN usuarios u ON u.auth_user_id = auth.uid()
      WHERE t.id = turmas_alunos.turma_id
      AND t.unidade_id = u.unidade_id
    )
  );

CREATE POLICY "turmas_alunos_update_policy" ON turmas_alunos
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND perfil = 'admin' AND unidade_id IS NULL)
    OR
    EXISTS (
      SELECT 1 FROM turmas t
      JOIN usuarios u ON u.auth_user_id = auth.uid()
      WHERE t.id = turmas_alunos.turma_id
      AND t.unidade_id = u.unidade_id
    )
  );

CREATE POLICY "turmas_alunos_delete_policy" ON turmas_alunos
  FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND perfil = 'admin' AND unidade_id IS NULL)
    OR
    EXISTS (
      SELECT 1 FROM turmas t
      JOIN usuarios u ON u.auth_user_id = auth.uid()
      WHERE t.id = turmas_alunos.turma_id
      AND t.unidade_id = u.unidade_id
    )
  );

-- Políticas para turmas_explicitas
CREATE POLICY "turmas_explicitas_select_policy" ON turmas_explicitas
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND perfil = 'admin' AND unidade_id IS NULL)
    OR
    EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND unidade_id = turmas_explicitas.unidade_id)
  );

CREATE POLICY "turmas_explicitas_insert_policy" ON turmas_explicitas
  FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND perfil = 'admin' AND unidade_id IS NULL)
    OR
    EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND unidade_id = turmas_explicitas.unidade_id)
  );

CREATE POLICY "turmas_explicitas_update_policy" ON turmas_explicitas
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND perfil = 'admin' AND unidade_id IS NULL)
    OR
    EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND unidade_id = turmas_explicitas.unidade_id)
  );

CREATE POLICY "turmas_explicitas_delete_policy" ON turmas_explicitas
  FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND perfil = 'admin' AND unidade_id IS NULL)
    OR
    EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND unidade_id = turmas_explicitas.unidade_id)
  );

-- Políticas para turmas_historico (usa relacionamento com turmas)
CREATE POLICY "turmas_historico_select_policy" ON turmas_historico
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND perfil = 'admin' AND unidade_id IS NULL)
    OR
    EXISTS (
      SELECT 1 FROM turmas t
      JOIN usuarios u ON u.auth_user_id = auth.uid()
      WHERE t.id = turmas_historico.turma_id
      AND t.unidade_id = u.unidade_id
    )
  );

CREATE POLICY "turmas_historico_insert_policy" ON turmas_historico
  FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND perfil = 'admin' AND unidade_id IS NULL)
    OR
    EXISTS (
      SELECT 1 FROM turmas t
      JOIN usuarios u ON u.auth_user_id = auth.uid()
      WHERE t.id = turmas_historico.turma_id
      AND t.unidade_id = u.unidade_id
    )
  );

CREATE POLICY "turmas_historico_update_policy" ON turmas_historico
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND perfil = 'admin' AND unidade_id IS NULL)
    OR
    EXISTS (
      SELECT 1 FROM turmas t
      JOIN usuarios u ON u.auth_user_id = auth.uid()
      WHERE t.id = turmas_historico.turma_id
      AND t.unidade_id = u.unidade_id
    )
  );

CREATE POLICY "turmas_historico_delete_policy" ON turmas_historico
  FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = auth.uid() AND perfil = 'admin' AND unidade_id IS NULL)
    OR
    EXISTS (
      SELECT 1 FROM turmas t
      JOIN usuarios u ON u.auth_user_id = auth.uid()
      WHERE t.id = turmas_historico.turma_id
      AND t.unidade_id = u.unidade_id
    )
  );
