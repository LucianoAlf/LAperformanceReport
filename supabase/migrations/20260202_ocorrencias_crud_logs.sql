-- Migração: CRUD de Ocorrências com Histórico e Logs
-- Data: 2026-02-02
-- Descrição: Adiciona suporte para edição/exclusão de ocorrências com logs de auditoria

-- =====================================================
-- 1. TABELA DE LOGS DE OCORRÊNCIAS
-- =====================================================
CREATE TABLE IF NOT EXISTS professor_360_ocorrencias_log (
  id SERIAL PRIMARY KEY,
  ocorrencia_id INTEGER NOT NULL,
  acao VARCHAR(20) NOT NULL CHECK (acao IN ('criado', 'editado', 'revertido', 'restaurado')),
  usuario_id UUID,
  usuario_nome VARCHAR(255) NOT NULL,
  justificativa TEXT, -- Obrigatório para edição/reversão
  dados_anteriores JSONB, -- Snapshot do registro antes da alteração
  dados_novos JSONB, -- Snapshot do registro após a alteração
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_ocorrencias_log_ocorrencia_id ON professor_360_ocorrencias_log(ocorrencia_id);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_log_created_at ON professor_360_ocorrencias_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_log_usuario_id ON professor_360_ocorrencias_log(usuario_id);

-- Comentários
COMMENT ON TABLE professor_360_ocorrencias_log IS 'Log de auditoria para todas as ações em ocorrências do 360°';
COMMENT ON COLUMN professor_360_ocorrencias_log.acao IS 'Tipo de ação: criado, editado, revertido, restaurado';
COMMENT ON COLUMN professor_360_ocorrencias_log.justificativa IS 'Justificativa obrigatória para edições e reversões';
COMMENT ON COLUMN professor_360_ocorrencias_log.dados_anteriores IS 'Snapshot JSON do registro antes da alteração';
COMMENT ON COLUMN professor_360_ocorrencias_log.dados_novos IS 'Snapshot JSON do registro após a alteração';

-- =====================================================
-- 2. ALTERAÇÕES NA TABELA DE OCORRÊNCIAS
-- =====================================================
-- Adicionar campos para soft delete e controle
ALTER TABLE professor_360_ocorrencias 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'ativo' CHECK (status IN ('ativo', 'revertido'));

ALTER TABLE professor_360_ocorrencias 
ADD COLUMN IF NOT EXISTS revertido_em TIMESTAMP WITH TIME ZONE;

ALTER TABLE professor_360_ocorrencias 
ADD COLUMN IF NOT EXISTS revertido_por UUID;

ALTER TABLE professor_360_ocorrencias 
ADD COLUMN IF NOT EXISTS revertido_por_nome VARCHAR(255);

ALTER TABLE professor_360_ocorrencias 
ADD COLUMN IF NOT EXISTS justificativa_reversao TEXT;

-- Índice para filtrar por status
CREATE INDEX IF NOT EXISTS idx_ocorrencias_status ON professor_360_ocorrencias(status);

-- Comentários
COMMENT ON COLUMN professor_360_ocorrencias.status IS 'Status da ocorrência: ativo ou revertido (soft delete)';
COMMENT ON COLUMN professor_360_ocorrencias.revertido_em IS 'Data/hora da reversão';
COMMENT ON COLUMN professor_360_ocorrencias.revertido_por IS 'UUID do usuário que reverteu';
COMMENT ON COLUMN professor_360_ocorrencias.revertido_por_nome IS 'Nome do usuário que reverteu';
COMMENT ON COLUMN professor_360_ocorrencias.justificativa_reversao IS 'Justificativa da reversão';

-- =====================================================
-- 3. FUNÇÃO PARA REGISTRAR LOG AUTOMATICAMENTE
-- =====================================================
CREATE OR REPLACE FUNCTION registrar_log_ocorrencia(
  p_ocorrencia_id INTEGER,
  p_acao VARCHAR(20),
  p_usuario_id UUID,
  p_usuario_nome VARCHAR(255),
  p_justificativa TEXT DEFAULT NULL,
  p_dados_anteriores JSONB DEFAULT NULL,
  p_dados_novos JSONB DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
  v_log_id INTEGER;
BEGIN
  INSERT INTO professor_360_ocorrencias_log (
    ocorrencia_id,
    acao,
    usuario_id,
    usuario_nome,
    justificativa,
    dados_anteriores,
    dados_novos
  ) VALUES (
    p_ocorrencia_id,
    p_acao,
    p_usuario_id,
    p_usuario_nome,
    p_justificativa,
    p_dados_anteriores,
    p_dados_novos
  ) RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 4. FUNÇÃO PARA REVERTER OCORRÊNCIA
-- =====================================================
CREATE OR REPLACE FUNCTION reverter_ocorrencia(
  p_ocorrencia_id INTEGER,
  p_usuario_id UUID,
  p_usuario_nome VARCHAR(255),
  p_justificativa TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_dados_anteriores JSONB;
BEGIN
  -- Capturar dados antes da reversão
  SELECT row_to_json(o.*)::jsonb INTO v_dados_anteriores
  FROM professor_360_ocorrencias o
  WHERE o.id = p_ocorrencia_id;
  
  -- Atualizar status para revertido
  UPDATE professor_360_ocorrencias
  SET 
    status = 'revertido',
    revertido_em = NOW(),
    revertido_por = p_usuario_id,
    revertido_por_nome = p_usuario_nome,
    justificativa_reversao = p_justificativa
  WHERE id = p_ocorrencia_id;
  
  -- Registrar log
  PERFORM registrar_log_ocorrencia(
    p_ocorrencia_id,
    'revertido',
    p_usuario_id,
    p_usuario_nome,
    p_justificativa,
    v_dados_anteriores,
    NULL
  );
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 5. FUNÇÃO PARA RESTAURAR OCORRÊNCIA REVERTIDA
-- =====================================================
CREATE OR REPLACE FUNCTION restaurar_ocorrencia(
  p_ocorrencia_id INTEGER,
  p_usuario_id UUID,
  p_usuario_nome VARCHAR(255),
  p_justificativa TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_dados_anteriores JSONB;
BEGIN
  -- Capturar dados antes da restauração
  SELECT row_to_json(o.*)::jsonb INTO v_dados_anteriores
  FROM professor_360_ocorrencias o
  WHERE o.id = p_ocorrencia_id;
  
  -- Restaurar status para ativo
  UPDATE professor_360_ocorrencias
  SET 
    status = 'ativo',
    revertido_em = NULL,
    revertido_por = NULL,
    revertido_por_nome = NULL,
    justificativa_reversao = NULL
  WHERE id = p_ocorrencia_id;
  
  -- Registrar log
  PERFORM registrar_log_ocorrencia(
    p_ocorrencia_id,
    'restaurado',
    p_usuario_id,
    p_usuario_nome,
    p_justificativa,
    v_dados_anteriores,
    NULL
  );
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 6. FUNÇÃO PARA EDITAR OCORRÊNCIA COM LOG
-- =====================================================
CREATE OR REPLACE FUNCTION editar_ocorrencia(
  p_ocorrencia_id INTEGER,
  p_usuario_id UUID,
  p_usuario_nome VARCHAR(255),
  p_justificativa TEXT,
  p_data_ocorrencia DATE DEFAULT NULL,
  p_descricao TEXT DEFAULT NULL,
  p_minutos_atraso INTEGER DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  v_dados_anteriores JSONB;
  v_dados_novos JSONB;
BEGIN
  -- Capturar dados antes da edição
  SELECT row_to_json(o.*)::jsonb INTO v_dados_anteriores
  FROM professor_360_ocorrencias o
  WHERE o.id = p_ocorrencia_id;
  
  -- Atualizar campos (apenas os que foram passados)
  UPDATE professor_360_ocorrencias
  SET 
    data_ocorrencia = COALESCE(p_data_ocorrencia, data_ocorrencia),
    descricao = COALESCE(p_descricao, descricao),
    minutos_atraso = COALESCE(p_minutos_atraso, minutos_atraso),
    updated_at = NOW()
  WHERE id = p_ocorrencia_id;
  
  -- Capturar dados após a edição
  SELECT row_to_json(o.*)::jsonb INTO v_dados_novos
  FROM professor_360_ocorrencias o
  WHERE o.id = p_ocorrencia_id;
  
  -- Registrar log
  PERFORM registrar_log_ocorrencia(
    p_ocorrencia_id,
    'editado',
    p_usuario_id,
    p_usuario_nome,
    p_justificativa,
    v_dados_anteriores,
    v_dados_novos
  );
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 7. VIEW PARA HISTÓRICO COMPLETO DO PROFESSOR
-- =====================================================
CREATE OR REPLACE VIEW vw_professor_360_historico AS
SELECT 
  l.id as log_id,
  l.ocorrencia_id,
  l.acao,
  l.usuario_nome,
  l.justificativa,
  l.dados_anteriores,
  l.dados_novos,
  l.created_at as data_acao,
  o.professor_id,
  o.avaliacao_id,
  o.criterio_id,
  o.data_ocorrencia,
  o.descricao,
  o.status as status_atual,
  c.nome as criterio_nome,
  c.codigo as criterio_codigo,
  p.nome as professor_nome
FROM professor_360_ocorrencias_log l
JOIN professor_360_ocorrencias o ON l.ocorrencia_id = o.id
JOIN professor_360_criterios c ON o.criterio_id = c.id
JOIN professores p ON o.professor_id = p.id
ORDER BY l.created_at DESC;

-- =====================================================
-- 8. ATUALIZAR OCORRÊNCIAS EXISTENTES
-- =====================================================
-- Garantir que todas as ocorrências existentes tenham status 'ativo'
UPDATE professor_360_ocorrencias 
SET status = 'ativo' 
WHERE status IS NULL;

-- Criar logs para ocorrências existentes que não têm log de criação
INSERT INTO professor_360_ocorrencias_log (ocorrencia_id, acao, usuario_nome, dados_novos, created_at)
SELECT 
  o.id,
  'criado',
  COALESCE(o.registrado_por, 'Sistema'),
  row_to_json(o.*)::jsonb,
  COALESCE(o.created_at, NOW())
FROM professor_360_ocorrencias o
WHERE NOT EXISTS (
  SELECT 1 FROM professor_360_ocorrencias_log l 
  WHERE l.ocorrencia_id = o.id AND l.acao = 'criado'
);

-- =====================================================
-- 9. POLÍTICAS RLS (Row Level Security)
-- =====================================================
-- Habilitar RLS na tabela de logs
ALTER TABLE professor_360_ocorrencias_log ENABLE ROW LEVEL SECURITY;

-- Política: Todos podem ler logs
CREATE POLICY "Todos podem ler logs de ocorrências" ON professor_360_ocorrencias_log
  FOR SELECT USING (true);

-- Política: Apenas sistema pode inserir logs (via funções)
CREATE POLICY "Sistema pode inserir logs" ON professor_360_ocorrencias_log
  FOR INSERT WITH CHECK (true);

-- Logs nunca podem ser atualizados ou deletados
-- (não criar políticas de UPDATE ou DELETE = bloqueado por padrão)

COMMENT ON TABLE professor_360_ocorrencias_log IS 'Tabela de auditoria imutável - logs nunca podem ser alterados ou excluídos';
