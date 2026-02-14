-- =====================================================
-- MIGRATION: Sucesso do Aluno - Fase 1
-- Data: 2026-02-14
-- Descrição: Criar tabelas, views, RPCs e RLS para feature Sucesso do Aluno
-- =====================================================

-- =====================================================
-- 1. TABELA: config_health_score_aluno
-- Configuração de pesos do Health Score de Alunos (igual professores)
-- =====================================================
CREATE TABLE IF NOT EXISTS config_health_score_aluno (
  id SERIAL PRIMARY KEY,
  unidade_id UUID REFERENCES unidades(id) ON DELETE CASCADE,
  -- Pesos dos fatores (total = 100%)
  peso_pagamento INTEGER DEFAULT 30,
  peso_tempo_casa INTEGER DEFAULT 20,
  peso_fase_jornada INTEGER DEFAULT 20,
  peso_feedback_professor INTEGER DEFAULT 20,
  peso_presenca INTEGER DEFAULT 10,
  -- Limites de classificação
  limite_saudavel INTEGER DEFAULT 70,
  limite_atencao INTEGER DEFAULT 40,
  -- Auditoria
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(unidade_id) -- Uma config por unidade (NULL = global)
);

-- Inserir configuração padrão global
INSERT INTO config_health_score_aluno (unidade_id, peso_pagamento, peso_tempo_casa, peso_fase_jornada, peso_feedback_professor, peso_presenca, limite_saudavel, limite_atencao)
VALUES (NULL, 30, 20, 20, 20, 10, 70, 40)
ON CONFLICT (unidade_id) DO NOTHING;

COMMENT ON TABLE config_health_score_aluno IS 'Configuração de pesos do Health Score de Alunos - ajustável por unidade';

-- =====================================================
-- 2. TABELA: aluno_feedback_sessoes
-- Controle de envios de link de feedback para professores
-- =====================================================
CREATE TABLE IF NOT EXISTS aluno_feedback_sessoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id INTEGER NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  unidade_id UUID NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  competencia DATE NOT NULL, -- primeiro dia do mês (2026-02-01)
  token TEXT UNIQUE NOT NULL, -- UUID v4 para o link público
  status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente', 'parcial', 'concluido')),
  total_alunos INTEGER NOT NULL DEFAULT 0,
  respondidos INTEGER NOT NULL DEFAULT 0,
  enviado_em TIMESTAMPTZ,
  concluido_em TIMESTAMPTZ,
  enviado_por UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_sessoes_professor ON aluno_feedback_sessoes(professor_id, competencia);
CREATE INDEX IF NOT EXISTS idx_feedback_sessoes_token ON aluno_feedback_sessoes(token);
CREATE INDEX IF NOT EXISTS idx_feedback_sessoes_status ON aluno_feedback_sessoes(status) WHERE status != 'concluido';

COMMENT ON TABLE aluno_feedback_sessoes IS 'Sessões de coleta de feedback do professor sobre seus alunos';

-- =====================================================
-- 3. TABELA: aluno_feedback_professor
-- Feedback individual por aluno (coraçãozinho verde/amarelo/vermelho)
-- =====================================================
CREATE TABLE IF NOT EXISTS aluno_feedback_professor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  professor_id INTEGER NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  unidade_id UUID NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  competencia DATE NOT NULL,
  feedback VARCHAR(20) NOT NULL CHECK (feedback IN ('verde', 'amarelo', 'vermelho')),
  observacao TEXT,
  sessao_id UUID REFERENCES aluno_feedback_sessoes(id) ON DELETE SET NULL,
  respondido_em TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(aluno_id, professor_id, competencia) -- Um feedback por aluno/professor/mês
);

CREATE INDEX IF NOT EXISTS idx_feedback_aluno ON aluno_feedback_professor(aluno_id, competencia DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_sessao ON aluno_feedback_professor(sessao_id);
CREATE INDEX IF NOT EXISTS idx_feedback_professor_comp ON aluno_feedback_professor(professor_id, competencia);

COMMENT ON TABLE aluno_feedback_professor IS 'Feedback do professor sobre cada aluno (verde/amarelo/vermelho)';

-- =====================================================
-- 4. TABELA: aluno_acoes
-- Histórico de intervenções/ações realizadas com o aluno
-- =====================================================
CREATE TABLE IF NOT EXISTS aluno_acoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  unidade_id UUID NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('ligacao', 'whatsapp', 'reuniao', 'observacao', 'plano_ia', 'email', 'visita', 'outro')),
  descricao TEXT NOT NULL,
  resultado TEXT,
  realizado_por UUID REFERENCES auth.users(id),
  realizado_por_nome VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acoes_aluno ON aluno_acoes(aluno_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_acoes_unidade ON aluno_acoes(unidade_id, created_at DESC);

COMMENT ON TABLE aluno_acoes IS 'Histórico de intervenções realizadas com alunos (ligação, WhatsApp, reunião, etc.)';

-- =====================================================
-- 5. TABELA: aluno_metas
-- Metas individuais por aluno
-- =====================================================
CREATE TABLE IF NOT EXISTS aluno_metas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  unidade_id UUID NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  titulo VARCHAR(200) NOT NULL,
  descricao TEXT,
  tipo VARCHAR(30) DEFAULT 'custom' CHECK (tipo IN ('presenca', 'pagamento', 'engajamento', 'renovacao', 'custom')),
  valor_meta NUMERIC,
  valor_atual NUMERIC DEFAULT 0,
  prazo DATE,
  status VARCHAR(20) DEFAULT 'ativa' CHECK (status IN ('ativa', 'concluida', 'cancelada')),
  criado_por UUID REFERENCES auth.users(id),
  criado_por_nome VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_metas_aluno ON aluno_metas(aluno_id, status);
CREATE INDEX IF NOT EXISTS idx_metas_unidade ON aluno_metas(unidade_id, status);

COMMENT ON TABLE aluno_metas IS 'Metas individuais definidas para cada aluno';

-- =====================================================
-- 6. TABELA: aluno_presenca (para Fase 7)
-- Tracking de presença via WhatsApp
-- =====================================================
CREATE TABLE IF NOT EXISTS aluno_presenca (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  professor_id INTEGER NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  unidade_id UUID NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  data_aula DATE NOT NULL,
  horario_aula TIME,
  status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('presente', 'ausente', 'remarcou', 'pendente')),
  respondido_por VARCHAR(30) CHECK (respondido_por IN ('professor_whatsapp', 'manual', 'sistema')),
  respondido_em TIMESTAMPTZ,
  mensagem_uazapi_id VARCHAR(100),
  token VARCHAR(100), -- Para link de turma
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(aluno_id, data_aula) -- Uma presença por aluno/dia
);

CREATE INDEX IF NOT EXISTS idx_presenca_aluno ON aluno_presenca(aluno_id, data_aula DESC);
CREATE INDEX IF NOT EXISTS idx_presenca_professor ON aluno_presenca(professor_id, data_aula);
CREATE INDEX IF NOT EXISTS idx_presenca_token ON aluno_presenca(token) WHERE token IS NOT NULL;

COMMENT ON TABLE aluno_presenca IS 'Registro de presença dos alunos (tracking via WhatsApp)';

-- =====================================================
-- 7. ADICIONAR COLUNA health_score_numerico NA TABELA alunos
-- Score numérico 0-100 (a coluna varchar existente é mantida para compatibilidade)
-- =====================================================
ALTER TABLE alunos 
ADD COLUMN IF NOT EXISTS health_score_numerico INTEGER DEFAULT NULL;

ALTER TABLE alunos 
ADD COLUMN IF NOT EXISTS fase_jornada VARCHAR(20) GENERATED ALWAYS AS (
  CASE 
    WHEN tempo_permanencia_meses IS NULL THEN 'onboarding'
    WHEN tempo_permanencia_meses < 3 THEN 'onboarding'
    WHEN tempo_permanencia_meses < 6 THEN 'consolidacao'
    WHEN tempo_permanencia_meses < 9 THEN 'encantamento'
    ELSE 'renovacao'
  END
) STORED;

COMMENT ON COLUMN alunos.health_score_numerico IS 'Health Score numérico 0-100 calculado automaticamente';
COMMENT ON COLUMN alunos.fase_jornada IS 'Fase da jornada do aluno (calculada pelo tempo de permanência)';

-- =====================================================
-- 8. RPC: calcular_health_score_aluno
-- Calcula o Health Score de um aluno individual
-- =====================================================
CREATE OR REPLACE FUNCTION calcular_health_score_aluno(p_aluno_id INTEGER)
RETURNS TABLE(score INTEGER, status VARCHAR, detalhes JSONB)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_aluno RECORD;
  v_feedback VARCHAR;
  v_config RECORD;
  v_score NUMERIC := 0;
  v_status VARCHAR;
  v_detalhes JSONB := '[]'::JSONB;
  v_contrib JSONB;
BEGIN
  -- Buscar dados do aluno
  SELECT * INTO v_aluno FROM alunos WHERE id = p_aluno_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT 0::INTEGER, 'erro'::VARCHAR, '{"erro": "Aluno não encontrado"}'::JSONB;
    RETURN;
  END IF;
  
  -- Buscar configuração de pesos (global ou por unidade)
  SELECT * INTO v_config 
  FROM config_health_score_aluno 
  WHERE unidade_id = v_aluno.unidade_id OR unidade_id IS NULL
  ORDER BY unidade_id NULLS LAST
  LIMIT 1;
  
  -- Fallback para pesos padrão se não houver config
  IF NOT FOUND THEN
    v_config := ROW(1, NULL, 30, 20, 20, 20, 10, 70, 40, now(), now())::config_health_score_aluno;
  END IF;
  
  -- Buscar último feedback do professor
  SELECT feedback INTO v_feedback
  FROM aluno_feedback_professor
  WHERE aluno_id = p_aluno_id
  ORDER BY competencia DESC, respondido_em DESC
  LIMIT 1;
  
  -- 1. PAGAMENTO (peso configurável, default 30%)
  DECLARE
    v_pag_score NUMERIC;
  BEGIN
    v_pag_score := CASE v_aluno.status_pagamento
      WHEN 'em_dia' THEN 100
      WHEN 'atrasado' THEN 50
      ELSE 0 -- inadimplente
    END;
    v_score := v_score + (v_pag_score * v_config.peso_pagamento / 100);
    v_contrib := jsonb_build_object('fator', 'Pagamento', 'valor', v_aluno.status_pagamento, 'score', v_pag_score, 'peso', v_config.peso_pagamento, 'contribuicao', v_pag_score * v_config.peso_pagamento / 100);
    v_detalhes := v_detalhes || v_contrib;
  END;
  
  -- 2. TEMPO DE CASA (peso configurável, default 20%)
  DECLARE
    v_tempo_score NUMERIC;
    v_tempo INTEGER := COALESCE(v_aluno.tempo_permanencia_meses, 0);
  BEGIN
    v_tempo_score := CASE 
      WHEN v_tempo > 24 THEN 100
      WHEN v_tempo > 12 THEN 80
      WHEN v_tempo > 6 THEN 60
      WHEN v_tempo > 3 THEN 40
      ELSE 20
    END;
    v_score := v_score + (v_tempo_score * v_config.peso_tempo_casa / 100);
    v_contrib := jsonb_build_object('fator', 'Tempo de Casa', 'valor', v_tempo || ' meses', 'score', v_tempo_score, 'peso', v_config.peso_tempo_casa, 'contribuicao', v_tempo_score * v_config.peso_tempo_casa / 100);
    v_detalhes := v_detalhes || v_contrib;
  END;
  
  -- 3. FASE DA JORNADA (peso configurável, default 20%)
  DECLARE
    v_fase_score NUMERIC;
    v_tempo INTEGER := COALESCE(v_aluno.tempo_permanencia_meses, 0);
  BEGIN
    v_fase_score := CASE 
      WHEN v_tempo >= 9 THEN 100  -- Renovação (veterano)
      WHEN v_tempo >= 6 THEN 80   -- Encantamento
      WHEN v_tempo >= 3 THEN 60   -- Consolidação
      ELSE 40                      -- Onboarding (risco maior)
    END;
    v_score := v_score + (v_fase_score * v_config.peso_fase_jornada / 100);
    v_contrib := jsonb_build_object('fator', 'Fase Jornada', 'valor', 
      CASE 
        WHEN v_tempo >= 9 THEN 'Renovação'
        WHEN v_tempo >= 6 THEN 'Encantamento'
        WHEN v_tempo >= 3 THEN 'Consolidação'
        ELSE 'Onboarding'
      END, 
      'score', v_fase_score, 'peso', v_config.peso_fase_jornada, 'contribuicao', v_fase_score * v_config.peso_fase_jornada / 100);
    v_detalhes := v_detalhes || v_contrib;
  END;
  
  -- 4. FEEDBACK DO PROFESSOR (peso configurável, default 20%)
  DECLARE
    v_fb_score NUMERIC;
  BEGIN
    v_fb_score := CASE v_feedback
      WHEN 'verde' THEN 100
      WHEN 'amarelo' THEN 50
      WHEN 'vermelho' THEN 0
      ELSE 50 -- Sem feedback = neutro
    END;
    v_score := v_score + (v_fb_score * v_config.peso_feedback_professor / 100);
    v_contrib := jsonb_build_object('fator', 'Feedback Professor', 'valor', COALESCE(v_feedback, 'sem feedback'), 'score', v_fb_score, 'peso', v_config.peso_feedback_professor, 'contribuicao', v_fb_score * v_config.peso_feedback_professor / 100);
    v_detalhes := v_detalhes || v_contrib;
  END;
  
  -- 5. PRESENÇA (peso configurável, default 10%)
  DECLARE
    v_pres_score NUMERIC;
    v_pres INTEGER := COALESCE(v_aluno.percentual_presenca, 75); -- Default 75% se não tiver dado
  BEGIN
    v_pres_score := LEAST(100, v_pres);
    v_score := v_score + (v_pres_score * v_config.peso_presenca / 100);
    v_contrib := jsonb_build_object('fator', 'Presença', 'valor', v_pres || '%', 'score', v_pres_score, 'peso', v_config.peso_presenca, 'contribuicao', v_pres_score * v_config.peso_presenca / 100);
    v_detalhes := v_detalhes || v_contrib;
  END;
  
  -- Determinar status baseado nos limites configurados
  v_status := CASE 
    WHEN v_score >= v_config.limite_saudavel THEN 'saudavel'
    WHEN v_score >= v_config.limite_atencao THEN 'atencao'
    ELSE 'critico'
  END;
  
  RETURN QUERY SELECT ROUND(v_score)::INTEGER, v_status, v_detalhes;
END;
$$;

COMMENT ON FUNCTION calcular_health_score_aluno IS 'Calcula o Health Score de um aluno individual com base nos pesos configurados';

-- =====================================================
-- 9. RPC: calcular_health_score_alunos_batch
-- Calcula e atualiza o Health Score de todos os alunos ativos
-- =====================================================
CREATE OR REPLACE FUNCTION calcular_health_score_alunos_batch(p_unidade_id UUID DEFAULT NULL)
RETURNS TABLE(total_processados INTEGER, saudaveis INTEGER, atencao INTEGER, criticos INTEGER)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count INTEGER := 0;
  v_saudaveis INTEGER := 0;
  v_atencao INTEGER := 0;
  v_criticos INTEGER := 0;
  v_aluno RECORD;
  v_result RECORD;
BEGIN
  FOR v_aluno IN 
    SELECT id FROM alunos 
    WHERE status IN ('ativo', 'trancado')
      AND (p_unidade_id IS NULL OR unidade_id = p_unidade_id)
      AND (is_segundo_curso IS NULL OR is_segundo_curso = false)
  LOOP
    SELECT * INTO v_result FROM calcular_health_score_aluno(v_aluno.id);
    
    UPDATE alunos SET 
      health_score_numerico = v_result.score,
      health_score = v_result.status,
      health_score_updated_at = now()
    WHERE id = v_aluno.id;
    
    v_count := v_count + 1;
    
    IF v_result.status = 'saudavel' THEN
      v_saudaveis := v_saudaveis + 1;
    ELSIF v_result.status = 'atencao' THEN
      v_atencao := v_atencao + 1;
    ELSE
      v_criticos := v_criticos + 1;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT v_count, v_saudaveis, v_atencao, v_criticos;
END;
$$;

COMMENT ON FUNCTION calcular_health_score_alunos_batch IS 'Calcula e atualiza o Health Score de todos os alunos ativos (batch)';

-- =====================================================
-- 10. VIEW: vw_aluno_sucesso_lista
-- Lista completa de alunos para a tabela de Sucesso do Cliente
-- =====================================================
CREATE OR REPLACE VIEW vw_aluno_sucesso_lista AS
SELECT 
  a.id,
  a.nome,
  a.unidade_id,
  u.codigo AS unidade_codigo,
  u.nome AS unidade_nome,
  a.professor_atual_id,
  p.nome AS professor_nome,
  a.curso_id,
  c.nome AS curso_nome,
  a.tempo_permanencia_meses,
  a.status_pagamento,
  a.valor_parcela,
  a.percentual_presenca,
  a.data_matricula,
  a.dia_aula,
  a.horario_aula,
  a.modalidade,
  a.status,
  
  -- Fase da Jornada (calculada)
  CASE 
    WHEN a.tempo_permanencia_meses IS NULL THEN 'onboarding'
    WHEN a.tempo_permanencia_meses < 3 THEN 'onboarding'
    WHEN a.tempo_permanencia_meses < 6 THEN 'consolidacao'
    WHEN a.tempo_permanencia_meses < 9 THEN 'encantamento'
    ELSE 'renovacao'
  END AS fase_jornada,
  
  -- Health Score
  a.health_score_numerico,
  a.health_score AS health_status,
  a.health_score_updated_at,
  
  -- Último feedback do professor
  fb.feedback AS ultimo_feedback,
  fb.observacao AS ultimo_feedback_obs,
  fb.respondido_em AS ultimo_feedback_data,
  fb.professor_id AS ultimo_feedback_professor_id,
  
  -- Contadores
  COALESCE(ac.total_acoes, 0) AS total_acoes,
  COALESCE(mt.metas_ativas, 0) AS metas_ativas,
  
  -- Dados do responsável (para menores)
  a.responsavel_nome,
  a.responsavel_telefone,
  a.whatsapp

FROM alunos a
LEFT JOIN unidades u ON a.unidade_id = u.id
LEFT JOIN professores p ON a.professor_atual_id = p.id
LEFT JOIN cursos c ON a.curso_id = c.id
LEFT JOIN LATERAL (
  SELECT feedback, observacao, respondido_em, professor_id
  FROM aluno_feedback_professor
  WHERE aluno_id = a.id
  ORDER BY competencia DESC, respondido_em DESC
  LIMIT 1
) fb ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS total_acoes
  FROM aluno_acoes
  WHERE aluno_id = a.id
) ac ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS metas_ativas
  FROM aluno_metas
  WHERE aluno_id = a.id AND status = 'ativa'
) mt ON true

WHERE a.status IN ('ativo', 'trancado')
  AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false);

COMMENT ON VIEW vw_aluno_sucesso_lista IS 'View completa de alunos para a feature Sucesso do Cliente';

-- =====================================================
-- 11. VIEW: vw_aluno_sucesso_resumo
-- KPIs resumidos por unidade para o dashboard
-- =====================================================
CREATE OR REPLACE VIEW vw_aluno_sucesso_resumo AS
SELECT 
  unidade_id,
  unidade_codigo,
  unidade_nome,
  COUNT(*) AS total_alunos,
  
  -- Por Health Score
  COUNT(*) FILTER (WHERE health_status = 'saudavel') AS saudaveis,
  COUNT(*) FILTER (WHERE health_status = 'atencao') AS atencao,
  COUNT(*) FILTER (WHERE health_status = 'critico') AS criticos,
  COUNT(*) FILTER (WHERE health_status IS NULL) AS sem_score,
  
  -- Por Fase da Jornada
  COUNT(*) FILTER (WHERE fase_jornada = 'onboarding') AS onboarding,
  COUNT(*) FILTER (WHERE fase_jornada = 'consolidacao') AS consolidacao,
  COUNT(*) FILTER (WHERE fase_jornada = 'encantamento') AS encantamento,
  COUNT(*) FILTER (WHERE fase_jornada = 'renovacao') AS renovacao,
  
  -- Por Status de Pagamento
  COUNT(*) FILTER (WHERE status_pagamento = 'em_dia') AS pagamento_em_dia,
  COUNT(*) FILTER (WHERE status_pagamento = 'atrasado') AS pagamento_atrasado,
  COUNT(*) FILTER (WHERE status_pagamento = 'inadimplente') AS pagamento_inadimplente,
  
  -- Por Feedback
  COUNT(*) FILTER (WHERE ultimo_feedback = 'verde') AS feedback_verde,
  COUNT(*) FILTER (WHERE ultimo_feedback = 'amarelo') AS feedback_amarelo,
  COUNT(*) FILTER (WHERE ultimo_feedback = 'vermelho') AS feedback_vermelho,
  COUNT(*) FILTER (WHERE ultimo_feedback IS NULL) AS sem_feedback,
  
  -- Médias
  ROUND(AVG(tempo_permanencia_meses)::NUMERIC, 1) AS media_tempo_permanencia,
  ROUND(AVG(valor_parcela)::NUMERIC, 2) AS ticket_medio,
  ROUND(AVG(health_score_numerico)::NUMERIC, 1) AS health_score_medio,
  ROUND(AVG(percentual_presenca)::NUMERIC, 1) AS presenca_media

FROM vw_aluno_sucesso_lista
GROUP BY unidade_id, unidade_codigo, unidade_nome;

COMMENT ON VIEW vw_aluno_sucesso_resumo IS 'KPIs resumidos de Sucesso do Cliente por unidade';

-- =====================================================
-- 12. RLS POLICIES
-- =====================================================

-- config_health_score_aluno
ALTER TABLE config_health_score_aluno ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read config" ON config_health_score_aluno
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage config" ON config_health_score_aluno
  FOR ALL USING (auth.role() = 'authenticated');

-- aluno_feedback_sessoes
ALTER TABLE aluno_feedback_sessoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage feedback sessions" ON aluno_feedback_sessoes
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Public can read sessions by token" ON aluno_feedback_sessoes
  FOR SELECT USING (true); -- Token validation happens in Edge Function

-- aluno_feedback_professor
ALTER TABLE aluno_feedback_professor ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read all feedback" ON aluno_feedback_professor
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage feedback" ON aluno_feedback_professor
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Public can insert feedback via session" ON aluno_feedback_professor
  FOR INSERT WITH CHECK (true); -- Validation happens in Edge Function

-- aluno_acoes
ALTER TABLE aluno_acoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage actions" ON aluno_acoes
  FOR ALL USING (auth.role() = 'authenticated');

-- aluno_metas
ALTER TABLE aluno_metas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage goals" ON aluno_metas
  FOR ALL USING (auth.role() = 'authenticated');

-- aluno_presenca
ALTER TABLE aluno_presenca ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage attendance" ON aluno_presenca
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Public can update attendance via token" ON aluno_presenca
  FOR UPDATE USING (token IS NOT NULL AND status = 'pendente');

-- =====================================================
-- 13. GRANTS
-- =====================================================
GRANT SELECT ON vw_aluno_sucesso_lista TO authenticated;
GRANT SELECT ON vw_aluno_sucesso_resumo TO authenticated;
GRANT EXECUTE ON FUNCTION calcular_health_score_aluno TO authenticated;
GRANT EXECUTE ON FUNCTION calcular_health_score_alunos_batch TO authenticated;

-- =====================================================
-- FIM DA MIGRATION
-- =====================================================
