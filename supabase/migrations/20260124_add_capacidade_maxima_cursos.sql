-- ============================================================
-- Migration: Adicionar capacidade_maxima na tabela cursos
-- Data: 2026-01-24
-- Descrição: Adiciona campo para definir capacidade máxima de alunos por curso
-- ============================================================

-- Adicionar coluna capacidade_maxima
ALTER TABLE cursos 
ADD COLUMN IF NOT EXISTS capacidade_maxima INTEGER DEFAULT NULL;

-- Comentário explicativo
COMMENT ON COLUMN cursos.capacidade_maxima IS 
'Capacidade máxima de alunos por turma deste curso. NULL = sem limite específico do curso. A capacidade efetiva da turma será o menor valor entre capacidade da sala e capacidade do curso.';

-- Criar índice para consultas
CREATE INDEX IF NOT EXISTS idx_cursos_capacidade_maxima ON cursos(capacidade_maxima) WHERE capacidade_maxima IS NOT NULL;

-- Atualizar valores padrão para cursos conhecidos
UPDATE cursos SET capacidade_maxima = 3 WHERE UPPER(TRIM(nome)) = 'BATERIA';
UPDATE cursos SET capacidade_maxima = 5 WHERE UPPER(TRIM(nome)) = 'CANTO';
UPDATE cursos SET capacidade_maxima = 5 WHERE UPPER(TRIM(nome)) LIKE '%MUSICALIZAÇÃO%';

-- ============================================================
-- Políticas RLS para UPDATE e INSERT em cursos
-- ============================================================

-- Política para INSERT (apenas admins podem criar cursos)
DROP POLICY IF EXISTS "cursos_insert_policy" ON cursos;
CREATE POLICY "cursos_insert_policy" ON cursos
  FOR INSERT 
  WITH CHECK (is_admin());

-- Política para UPDATE (apenas admins podem editar cursos)
DROP POLICY IF EXISTS "cursos_update_policy" ON cursos;
CREATE POLICY "cursos_update_policy" ON cursos
  FOR UPDATE 
  USING (is_admin())
  WITH CHECK (is_admin());

-- Política para DELETE (apenas admins podem excluir cursos)
DROP POLICY IF EXISTS "cursos_delete_policy" ON cursos;
CREATE POLICY "cursos_delete_policy" ON cursos
  FOR DELETE 
  USING (is_admin());

-- Log de alterações
DO $$
BEGIN
  RAISE NOTICE 'Coluna capacidade_maxima adicionada à tabela cursos';
  RAISE NOTICE 'Valores padrão configurados: Bateria=3, Canto=5, Musicalização=5';
  RAISE NOTICE 'Políticas RLS criadas: INSERT, UPDATE, DELETE (apenas admins)';
END $$;
