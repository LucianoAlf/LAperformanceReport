-- ============================================================================
-- DIAGNÓSTICO: Professor 360° - Verificação de Tabelas e Dados
-- ============================================================================

-- 1. Verificar se a tabela existe
SELECT 
  table_name,
  table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name = 'professor_360_criterios';

-- 2. Verificar estrutura da tabela
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'professor_360_criterios'
ORDER BY ordinal_position;

-- 3. Verificar dados cadastrados
SELECT 
  id,
  codigo,
  nome,
  tipo,
  peso,
  pontos_perda,
  tolerancia,
  ativo,
  ordem
FROM professor_360_criterios
ORDER BY ordem;

-- 4. Verificar políticas RLS
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'professor_360_criterios';

-- 5. Verificar se RLS está habilitado
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename = 'professor_360_criterios';

-- 6. Contar registros ativos
SELECT 
  COUNT(*) as total_criterios,
  COUNT(*) FILTER (WHERE ativo = true) as criterios_ativos,
  COUNT(*) FILTER (WHERE tipo = 'penalidade') as penalidades,
  COUNT(*) FILTER (WHERE tipo = 'bonus') as bonus
FROM professor_360_criterios;

-- ============================================================================
-- CORREÇÃO: Se não houver dados, inserir critérios padrão
-- ============================================================================

-- Verificar se precisa inserir dados
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM professor_360_criterios LIMIT 1) THEN
    -- Inserir critérios padrão
    INSERT INTO professor_360_criterios (codigo, nome, descricao, tipo, peso, pontos_perda, tolerancia, ativo, ordem) VALUES
    ('atrasos', 'Atrasos', 'Atrasos nas aulas ou reuniões', 'penalidade', 15, 5, 2, true, 1),
    ('faltas', 'Faltas', 'Faltas não justificadas', 'penalidade', 25, 10, 0, true, 2),
    ('organizacao_sala', 'Organização de Sala', 'Sala desorganizada ou suja', 'penalidade', 15, 5, 0, true, 3),
    ('uniforme', 'Uniforme', 'Não utilização do uniforme', 'penalidade', 10, 5, 0, true, 4),
    ('prazos', 'Prazos', 'Não cumprimento de prazos administrativos', 'penalidade', 15, 5, 1, true, 5),
    ('emusys', 'EMUSYS', 'Pendências no sistema EMUSYS', 'penalidade', 20, 5, 0, true, 6),
    ('projetos', 'Projetos Pedagógicos', 'Participação em projetos pedagógicos (bônus)', 'bonus', 0, 0, 0, true, 7);
    
    RAISE NOTICE 'Critérios padrão inseridos com sucesso!';
  ELSE
    RAISE NOTICE 'Critérios já existem na tabela.';
  END IF;
END $$;

-- ============================================================================
-- CORREÇÃO: Políticas RLS (se necessário)
-- ============================================================================

-- Habilitar RLS se não estiver habilitado
ALTER TABLE professor_360_criterios ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas (se existirem)
DROP POLICY IF EXISTS "Permitir leitura de critérios ativos" ON professor_360_criterios;
DROP POLICY IF EXISTS "Permitir gestão de critérios para admins" ON professor_360_criterios;

-- Criar política de leitura para todos os usuários autenticados
CREATE POLICY "Permitir leitura de critérios ativos"
ON professor_360_criterios
FOR SELECT
TO authenticated
USING (ativo = true);

-- Criar política de gestão para admins/coordenadores
CREATE POLICY "Permitir gestão de critérios para admins"
ON professor_360_criterios
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM usuarios
    WHERE usuarios.id = auth.uid()
    AND usuarios.role IN ('admin', 'coordenador')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM usuarios
    WHERE usuarios.id = auth.uid()
    AND usuarios.role IN ('admin', 'coordenador')
  )
);

-- Verificar políticas criadas
SELECT 
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE tablename = 'professor_360_criterios';
