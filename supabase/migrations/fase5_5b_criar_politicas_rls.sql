-- ============================================
-- FASE 5.5b: POLÍTICAS RLS (Row Level Security)
-- Controle de Acesso por Unidade
-- ============================================

-- Habilitar RLS em todas as tabelas principais
ALTER TABLE alunos ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimentacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE renovacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE evasoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE relatorios_diarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE metas ENABLE ROW LEVEL SECURITY;

-- ============================================
-- FUNÇÃO AUXILIAR: Verificar se é Admin
-- ============================================
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM usuarios 
    WHERE id = auth.uid() 
    AND perfil = 'admin' 
    AND ativo = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNÇÃO AUXILIAR: Obter Unidade do Usuário
-- ============================================
CREATE OR REPLACE FUNCTION get_user_unidade_id()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT unidade_id FROM usuarios 
    WHERE id = auth.uid() 
    AND ativo = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- POLÍTICAS PARA TABELA: alunos
-- ============================================
DROP POLICY IF EXISTS "alunos_select_policy" ON alunos;
CREATE POLICY "alunos_select_policy" ON alunos
  FOR SELECT USING (
    is_admin() OR unidade_id = get_user_unidade_id()
  );

DROP POLICY IF EXISTS "alunos_insert_policy" ON alunos;
CREATE POLICY "alunos_insert_policy" ON alunos
  FOR INSERT WITH CHECK (
    is_admin() OR unidade_id = get_user_unidade_id()
  );

DROP POLICY IF EXISTS "alunos_update_policy" ON alunos;
CREATE POLICY "alunos_update_policy" ON alunos
  FOR UPDATE USING (
    is_admin() OR unidade_id = get_user_unidade_id()
  );

DROP POLICY IF EXISTS "alunos_delete_policy" ON alunos;
CREATE POLICY "alunos_delete_policy" ON alunos
  FOR DELETE USING (
    is_admin()
  );

-- ============================================
-- POLÍTICAS PARA TABELA: leads
-- ============================================
DROP POLICY IF EXISTS "leads_select_policy" ON leads;
CREATE POLICY "leads_select_policy" ON leads
  FOR SELECT USING (
    is_admin() OR unidade_id = get_user_unidade_id()
  );

DROP POLICY IF EXISTS "leads_insert_policy" ON leads;
CREATE POLICY "leads_insert_policy" ON leads
  FOR INSERT WITH CHECK (
    is_admin() OR unidade_id = get_user_unidade_id()
  );

DROP POLICY IF EXISTS "leads_update_policy" ON leads;
CREATE POLICY "leads_update_policy" ON leads
  FOR UPDATE USING (
    is_admin() OR unidade_id = get_user_unidade_id()
  );

DROP POLICY IF EXISTS "leads_delete_policy" ON leads;
CREATE POLICY "leads_delete_policy" ON leads
  FOR DELETE USING (
    is_admin()
  );

-- ============================================
-- POLÍTICAS PARA TABELA: movimentacoes
-- ============================================
DROP POLICY IF EXISTS "movimentacoes_select_policy" ON movimentacoes;
CREATE POLICY "movimentacoes_select_policy" ON movimentacoes
  FOR SELECT USING (
    is_admin() OR unidade_id = get_user_unidade_id()
  );

DROP POLICY IF EXISTS "movimentacoes_insert_policy" ON movimentacoes;
CREATE POLICY "movimentacoes_insert_policy" ON movimentacoes
  FOR INSERT WITH CHECK (
    is_admin() OR unidade_id = get_user_unidade_id()
  );

DROP POLICY IF EXISTS "movimentacoes_update_policy" ON movimentacoes;
CREATE POLICY "movimentacoes_update_policy" ON movimentacoes
  FOR UPDATE USING (
    is_admin() OR unidade_id = get_user_unidade_id()
  );

-- ============================================
-- POLÍTICAS PARA TABELA: renovacoes
-- ============================================
DROP POLICY IF EXISTS "renovacoes_select_policy" ON renovacoes;
CREATE POLICY "renovacoes_select_policy" ON renovacoes
  FOR SELECT USING (
    is_admin() OR unidade_id = get_user_unidade_id()
  );

DROP POLICY IF EXISTS "renovacoes_insert_policy" ON renovacoes;
CREATE POLICY "renovacoes_insert_policy" ON renovacoes
  FOR INSERT WITH CHECK (
    is_admin() OR unidade_id = get_user_unidade_id()
  );

DROP POLICY IF EXISTS "renovacoes_update_policy" ON renovacoes;
CREATE POLICY "renovacoes_update_policy" ON renovacoes
  FOR UPDATE USING (
    is_admin() OR unidade_id = get_user_unidade_id()
  );

-- ============================================
-- POLÍTICAS PARA TABELA: evasoes
-- ============================================
DROP POLICY IF EXISTS "evasoes_select_policy" ON evasoes;
CREATE POLICY "evasoes_select_policy" ON evasoes
  FOR SELECT USING (
    is_admin() OR unidade_id = get_user_unidade_id()
  );

DROP POLICY IF EXISTS "evasoes_insert_policy" ON evasoes;
CREATE POLICY "evasoes_insert_policy" ON evasoes
  FOR INSERT WITH CHECK (
    is_admin() OR unidade_id = get_user_unidade_id()
  );

DROP POLICY IF EXISTS "evasoes_update_policy" ON evasoes;
CREATE POLICY "evasoes_update_policy" ON evasoes
  FOR UPDATE USING (
    is_admin() OR unidade_id = get_user_unidade_id()
  );

-- ============================================
-- POLÍTICAS PARA TABELA: relatorios_diarios
-- ============================================
DROP POLICY IF EXISTS "relatorios_diarios_select_policy" ON relatorios_diarios;
CREATE POLICY "relatorios_diarios_select_policy" ON relatorios_diarios
  FOR SELECT USING (
    is_admin() OR unidade_id = get_user_unidade_id()
  );

DROP POLICY IF EXISTS "relatorios_diarios_insert_policy" ON relatorios_diarios;
CREATE POLICY "relatorios_diarios_insert_policy" ON relatorios_diarios
  FOR INSERT WITH CHECK (
    is_admin() OR unidade_id = get_user_unidade_id()
  );

DROP POLICY IF EXISTS "relatorios_diarios_update_policy" ON relatorios_diarios;
CREATE POLICY "relatorios_diarios_update_policy" ON relatorios_diarios
  FOR UPDATE USING (
    is_admin() OR unidade_id = get_user_unidade_id()
  );

-- ============================================
-- POLÍTICAS PARA TABELA: metas
-- ============================================
DROP POLICY IF EXISTS "metas_select_policy" ON metas;
CREATE POLICY "metas_select_policy" ON metas
  FOR SELECT USING (
    is_admin() OR unidade_id = get_user_unidade_id()
  );

DROP POLICY IF EXISTS "metas_insert_policy" ON metas;
CREATE POLICY "metas_insert_policy" ON metas
  FOR INSERT WITH CHECK (
    is_admin()
  );

DROP POLICY IF EXISTS "metas_update_policy" ON metas;
CREATE POLICY "metas_update_policy" ON metas
  FOR UPDATE USING (
    is_admin()
  );

-- ============================================
-- POLÍTICAS PARA TABELA: usuarios (apenas admin gerencia)
-- ============================================
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios_select_policy" ON usuarios;
CREATE POLICY "usuarios_select_policy" ON usuarios
  FOR SELECT USING (
    is_admin() OR id = auth.uid()
  );

DROP POLICY IF EXISTS "usuarios_insert_policy" ON usuarios;
CREATE POLICY "usuarios_insert_policy" ON usuarios
  FOR INSERT WITH CHECK (
    is_admin()
  );

DROP POLICY IF EXISTS "usuarios_update_policy" ON usuarios;
CREATE POLICY "usuarios_update_policy" ON usuarios
  FOR UPDATE USING (
    is_admin() OR id = auth.uid()
  );

DROP POLICY IF EXISTS "usuarios_delete_policy" ON usuarios;
CREATE POLICY "usuarios_delete_policy" ON usuarios
  FOR DELETE USING (
    is_admin()
  );

-- ============================================
-- TABELAS DE REFERÊNCIA: Acesso público para leitura
-- ============================================
ALTER TABLE unidades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "unidades_select_policy" ON unidades;
CREATE POLICY "unidades_select_policy" ON unidades
  FOR SELECT USING (true);

ALTER TABLE cursos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cursos_select_policy" ON cursos;
CREATE POLICY "cursos_select_policy" ON cursos
  FOR SELECT USING (true);

ALTER TABLE professores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "professores_select_policy" ON professores;
CREATE POLICY "professores_select_policy" ON professores
  FOR SELECT USING (true);

ALTER TABLE canais_origem ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "canais_origem_select_policy" ON canais_origem;
CREATE POLICY "canais_origem_select_policy" ON canais_origem
  FOR SELECT USING (true);

ALTER TABLE motivos_evasao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "motivos_evasao_select_policy" ON motivos_evasao;
CREATE POLICY "motivos_evasao_select_policy" ON motivos_evasao
  FOR SELECT USING (true);

-- ============================================
-- COMENTÁRIOS
-- ============================================
COMMENT ON FUNCTION is_admin() IS 'Verifica se o usuário autenticado é admin';
COMMENT ON FUNCTION get_user_unidade_id() IS 'Retorna o unidade_id do usuário autenticado';
