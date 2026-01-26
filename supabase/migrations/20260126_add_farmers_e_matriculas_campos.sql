-- ============================================================================
-- MIGRAÇÃO: Adicionar campos para Farmers e Matrículas Detalhadas
-- Data: 26/01/2026
-- Descrição: Adicionar campos necessários para relatórios administrativos
-- ============================================================================

-- ============================================================================
-- 1. ADICIONAR CAMPOS NA TABELA UNIDADES
-- ============================================================================

-- Adicionar campo hunter_nome (para relatórios comerciais)
ALTER TABLE unidades
ADD COLUMN IF NOT EXISTS hunter_nome VARCHAR(100);

-- Adicionar campo farmers_nomes (para relatórios administrativos)
ALTER TABLE unidades
ADD COLUMN IF NOT EXISTS farmers_nomes TEXT[];

-- Comentários explicativos
COMMENT ON COLUMN unidades.hunter_nome IS 'Nome do Hunter responsável pela unidade (aparece nos relatórios comerciais)';
COMMENT ON COLUMN unidades.farmers_nomes IS 'Array com nomes dos Farmers responsáveis pela retenção (aparece nos relatórios administrativos)';

-- ============================================================================
-- 2. POPULAR DADOS INICIAIS
-- ============================================================================

-- Campo Grande - UUID: 2ec861f6-023f-4d7b-9927-3960ad8c2a92
UPDATE unidades 
SET hunter_nome = 'Vitória',
    farmers_nomes = ARRAY['Gabriela', 'Jhonatan']
WHERE codigo = 'CG';

-- Recreio - UUID: 95553e96-971b-4590-a6eb-0201d013c14d
UPDATE unidades 
SET hunter_nome = 'Clayton',
    farmers_nomes = ARRAY['Fernanda', 'Daiana']
WHERE codigo = 'REC';

-- Barra - UUID: 368d47f5-2d88-4475-bc14-ba084a9a348e
UPDATE unidades 
SET hunter_nome = 'Kailane',
    farmers_nomes = ARRAY['Eduarda', 'Arthur']
WHERE codigo = 'BAR';

-- ============================================================================
-- 3. VERIFICAR SE CAMPOS DE MATRÍCULAS EXISTEM NAS VIEWS/TABELAS
-- ============================================================================

-- Nota: Os campos matriculas_ativas, matriculas_banda e matriculas_2_curso
-- devem ser calculados dinamicamente a partir da tabela 'alunos' ou 'matriculas'
-- Não precisam ser campos físicos, mas sim calculados nas queries

-- ============================================================================
-- FIM DA MIGRAÇÃO
-- ============================================================================
