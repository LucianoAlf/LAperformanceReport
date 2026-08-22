-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- LIBERAR CRUD COMPLETO PARA TODAS AS TABELAS PRINCIPAIS
-- Usuários autenticados podem fazer SELECT, INSERT, UPDATE, DELETE

-- =============================================
-- TABELA: metas (corrigir INSERT/UPDATE)
-- =============================================
DROP POLICY IF EXISTS metas_insert_policy ON metas;
CREATE POLICY metas_insert_policy ON metas
  FOR INSERT
  WITH CHECK (is_admin() OR (unidade_id = get_user_unidade_id()));

DROP POLICY IF EXISTS metas_update_policy ON metas;
CREATE POLICY metas_update_policy ON metas
  FOR UPDATE
  USING (is_admin() OR (unidade_id = get_user_unidade_id()));

DROP POLICY IF EXISTS metas_delete_policy ON metas;
CREATE POLICY metas_delete_policy ON metas
  FOR DELETE
  USING (is_admin() OR (unidade_id = get_user_unidade_id()));

-- =============================================
-- TABELA: usuarios (liberar para admin gerenciar)
-- =============================================
-- usuarios permanece só admin para INSERT/DELETE por segurança
-- mas UPDATE permite o próprio usuário editar seus dados

-- =============================================
-- TABELA: canais_origem (adicionar INSERT/UPDATE/DELETE)
-- =============================================
DROP POLICY IF EXISTS canais_origem_insert ON canais_origem;
CREATE POLICY canais_origem_insert ON canais_origem
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS canais_origem_update ON canais_origem;
CREATE POLICY canais_origem_update ON canais_origem
  FOR UPDATE
  USING (true);

DROP POLICY IF EXISTS canais_origem_delete ON canais_origem;
CREATE POLICY canais_origem_delete ON canais_origem
  FOR DELETE
  USING (true);

-- =============================================
-- TABELA: cursos (adicionar INSERT/UPDATE/DELETE)
-- =============================================
DROP POLICY IF EXISTS cursos_insert ON cursos;
CREATE POLICY cursos_insert ON cursos
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS cursos_update ON cursos;
CREATE POLICY cursos_update ON cursos
  FOR UPDATE
  USING (true);

DROP POLICY IF EXISTS cursos_delete ON cursos;
CREATE POLICY cursos_delete ON cursos
  FOR DELETE
  USING (true);

-- =============================================
-- TABELA: professores (adicionar INSERT/UPDATE/DELETE)
-- =============================================
DROP POLICY IF EXISTS professores_insert ON professores;
CREATE POLICY professores_insert ON professores
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS professores_update ON professores;
CREATE POLICY professores_update ON professores
  FOR UPDATE
  USING (true);

DROP POLICY IF EXISTS professores_delete ON professores;
CREATE POLICY professores_delete ON professores
  FOR DELETE
  USING (true);

-- =============================================
-- TABELA: horarios (adicionar INSERT/UPDATE/DELETE)
-- =============================================
DROP POLICY IF EXISTS horarios_insert ON horarios;
CREATE POLICY horarios_insert ON horarios
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS horarios_update ON horarios;
CREATE POLICY horarios_update ON horarios
  FOR UPDATE
  USING (true);

DROP POLICY IF EXISTS horarios_delete ON horarios;
CREATE POLICY horarios_delete ON horarios
  FOR DELETE
  USING (true);

-- =============================================
-- TABELA: motivos_arquivamento (adicionar INSERT/UPDATE/DELETE)
-- =============================================
DROP POLICY IF EXISTS motivos_arquivamento_insert ON motivos_arquivamento;
CREATE POLICY motivos_arquivamento_insert ON motivos_arquivamento
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS motivos_arquivamento_update ON motivos_arquivamento;
CREATE POLICY motivos_arquivamento_update ON motivos_arquivamento
  FOR UPDATE
  USING (true);

DROP POLICY IF EXISTS motivos_arquivamento_delete ON motivos_arquivamento;
CREATE POLICY motivos_arquivamento_delete ON motivos_arquivamento
  FOR DELETE
  USING (true);

-- =============================================
-- TABELA: motivos_trancamento (adicionar INSERT/UPDATE/DELETE)
-- =============================================
DROP POLICY IF EXISTS motivos_trancamento_insert ON motivos_trancamento;
CREATE POLICY motivos_trancamento_insert ON motivos_trancamento
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS motivos_trancamento_update ON motivos_trancamento;
CREATE POLICY motivos_trancamento_update ON motivos_trancamento
  FOR UPDATE
  USING (true);

DROP POLICY IF EXISTS motivos_trancamento_delete ON motivos_trancamento;
CREATE POLICY motivos_trancamento_delete ON motivos_trancamento
  FOR DELETE
  USING (true);

-- =============================================
-- TABELA: unidades (adicionar INSERT/UPDATE/DELETE para admin)
-- =============================================
DROP POLICY IF EXISTS unidades_insert ON unidades;
CREATE POLICY unidades_insert ON unidades
  FOR INSERT
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS unidades_update ON unidades;
CREATE POLICY unidades_update ON unidades
  FOR UPDATE
  USING (is_admin());

DROP POLICY IF EXISTS unidades_delete ON unidades;
CREATE POLICY unidades_delete ON unidades
  FOR DELETE
  USING (is_admin());
