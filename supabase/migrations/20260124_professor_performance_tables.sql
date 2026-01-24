-- =====================================================
-- MIGRAÇÃO: Tabelas para Performance de Professores
-- Data: 2026-01-24
-- Descrição: Cria tabelas para gestão de metas, ações e checkpoints de professores
-- =====================================================

-- 1. Catálogo de Treinamentos disponíveis
CREATE TABLE IF NOT EXISTS catalogo_treinamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(255) NOT NULL,
  descricao TEXT,
  duracao_minutos INTEGER DEFAULT 60,
  foco VARCHAR(50), -- 'retencao', 'media_turma', 'nps', 'conversao', 'presenca', 'geral'
  icone VARCHAR(10) DEFAULT '📚',
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Metas de professores
CREATE TABLE IF NOT EXISTS professor_metas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id INTEGER NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  unidade_id UUID REFERENCES unidades(id),
  tipo VARCHAR(50) NOT NULL, -- 'media_turma', 'retencao', 'conversao', 'nps', 'presenca'
  valor_atual DECIMAL(10,2),
  valor_meta DECIMAL(10,2) NOT NULL,
  data_inicio DATE NOT NULL,
  data_fim DATE,
  status VARCHAR(20) DEFAULT 'em_andamento', -- 'em_andamento', 'concluida', 'cancelada', 'atrasada'
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- 3. Ações/Agenda de professores
CREATE TABLE IF NOT EXISTS professor_acoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id INTEGER NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  unidade_id UUID REFERENCES unidades(id),
  meta_id UUID REFERENCES professor_metas(id) ON DELETE SET NULL,
  treinamento_id UUID REFERENCES catalogo_treinamentos(id) ON DELETE SET NULL,
  tipo VARCHAR(50) NOT NULL, -- 'treinamento', 'reuniao', 'checkpoint', 'remanejamento', 'feedback', 'mentoria', 'outro'
  titulo VARCHAR(255) NOT NULL,
  descricao TEXT,
  data_agendada TIMESTAMPTZ NOT NULL,
  duracao_minutos INTEGER DEFAULT 60,
  local VARCHAR(255),
  status VARCHAR(20) DEFAULT 'pendente', -- 'pendente', 'concluida', 'cancelada', 'reagendada'
  resultado TEXT,
  data_conclusao TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- 4. Checkpoints/Snapshots de métricas
CREATE TABLE IF NOT EXISTS professor_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id INTEGER NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  unidade_id UUID REFERENCES unidades(id),
  competencia VARCHAR(7) NOT NULL, -- '2026-01'
  metricas JSONB NOT NULL, -- snapshot das métricas no momento
  insights_ia JSONB, -- resposta da Edge Function
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(professor_id, unidade_id, competencia)
);

-- 5. Tabela de vínculo para ações com múltiplos professores
CREATE TABLE IF NOT EXISTS professor_acoes_participantes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acao_id UUID NOT NULL REFERENCES professor_acoes(id) ON DELETE CASCADE,
  professor_id INTEGER NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  confirmado BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(acao_id, professor_id)
);

-- =====================================================
-- ÍNDICES PARA PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_professor_metas_professor ON professor_metas(professor_id);
CREATE INDEX IF NOT EXISTS idx_professor_metas_status ON professor_metas(status);
CREATE INDEX IF NOT EXISTS idx_professor_metas_tipo ON professor_metas(tipo);
CREATE INDEX IF NOT EXISTS idx_professor_acoes_professor ON professor_acoes(professor_id);
CREATE INDEX IF NOT EXISTS idx_professor_acoes_data ON professor_acoes(data_agendada);
CREATE INDEX IF NOT EXISTS idx_professor_acoes_status ON professor_acoes(status);
CREATE INDEX IF NOT EXISTS idx_professor_checkpoints_professor ON professor_checkpoints(professor_id);
CREATE INDEX IF NOT EXISTS idx_professor_checkpoints_competencia ON professor_checkpoints(competencia);

-- =====================================================
-- DADOS INICIAIS - CATÁLOGO DE TREINAMENTOS
-- =====================================================

INSERT INTO catalogo_treinamentos (nome, descricao, duracao_minutos, foco, icone) VALUES
  ('Técnicas de Retenção', 'Estratégias para manter alunos engajados e reduzir evasão. Aborda comunicação com responsáveis, feedback construtivo e identificação de sinais de desengajamento.', 60, 'retencao', '🎯'),
  ('Gestão de Turmas', 'Como otimizar turmas e aumentar a média de alunos. Técnicas para unir alunos compatíveis e gerenciar dinâmicas de grupo.', 45, 'media_turma', '👥'),
  ('Comunicação Efetiva', 'Feedback para alunos e responsáveis de forma assertiva. Técnicas de comunicação não-violenta e gestão de expectativas.', 90, 'nps', '💬'),
  ('Conversão de Experimentais', 'Técnicas para converter alunos experimentais em matriculados. Aborda primeira impressão, demonstração de valor e follow-up.', 45, 'conversao', '🎓'),
  ('Engajamento em Aula', 'Dinâmicas para turmas mistas e técnicas de engajamento. Como manter a atenção e motivação dos alunos.', 60, 'retencao', '🎵'),
  ('Gestão de Tempo', 'Pontualidade e organização de agenda. Técnicas para otimizar o tempo de aula e preparação.', 30, 'presenca', '⏰')
ON CONFLICT DO NOTHING;

-- =====================================================
-- RLS (Row Level Security)
-- =====================================================

ALTER TABLE catalogo_treinamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE professor_metas ENABLE ROW LEVEL SECURITY;
ALTER TABLE professor_acoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE professor_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE professor_acoes_participantes ENABLE ROW LEVEL SECURITY;

-- Políticas para catalogo_treinamentos (leitura para todos autenticados)
DROP POLICY IF EXISTS "catalogo_treinamentos_select" ON catalogo_treinamentos;
CREATE POLICY "catalogo_treinamentos_select" ON catalogo_treinamentos
  FOR SELECT TO authenticated USING (true);

-- Políticas para professor_metas
DROP POLICY IF EXISTS "professor_metas_select" ON professor_metas;
CREATE POLICY "professor_metas_select" ON professor_metas
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM usuarios u 
      WHERE u.auth_user_id = auth.uid() 
      AND (u.perfil = 'admin' OR u.unidade_id = professor_metas.unidade_id OR professor_metas.unidade_id IS NULL)
    )
  );

DROP POLICY IF EXISTS "professor_metas_insert" ON professor_metas;
CREATE POLICY "professor_metas_insert" ON professor_metas
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u 
      WHERE u.auth_user_id = auth.uid() 
      AND (u.perfil = 'admin' OR u.unidade_id = professor_metas.unidade_id)
    )
  );

DROP POLICY IF EXISTS "professor_metas_update" ON professor_metas;
CREATE POLICY "professor_metas_update" ON professor_metas
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM usuarios u 
      WHERE u.auth_user_id = auth.uid() 
      AND (u.perfil = 'admin' OR u.unidade_id = professor_metas.unidade_id)
    )
  );

DROP POLICY IF EXISTS "professor_metas_delete" ON professor_metas;
CREATE POLICY "professor_metas_delete" ON professor_metas
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM usuarios u 
      WHERE u.auth_user_id = auth.uid() 
      AND u.perfil = 'admin'
    )
  );

-- Políticas para professor_acoes
DROP POLICY IF EXISTS "professor_acoes_select" ON professor_acoes;
CREATE POLICY "professor_acoes_select" ON professor_acoes
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM usuarios u 
      WHERE u.auth_user_id = auth.uid() 
      AND (u.perfil = 'admin' OR u.unidade_id = professor_acoes.unidade_id OR professor_acoes.unidade_id IS NULL)
    )
  );

DROP POLICY IF EXISTS "professor_acoes_insert" ON professor_acoes;
CREATE POLICY "professor_acoes_insert" ON professor_acoes
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u 
      WHERE u.auth_user_id = auth.uid() 
      AND (u.perfil = 'admin' OR u.unidade_id = professor_acoes.unidade_id)
    )
  );

DROP POLICY IF EXISTS "professor_acoes_update" ON professor_acoes;
CREATE POLICY "professor_acoes_update" ON professor_acoes
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM usuarios u 
      WHERE u.auth_user_id = auth.uid() 
      AND (u.perfil = 'admin' OR u.unidade_id = professor_acoes.unidade_id)
    )
  );

DROP POLICY IF EXISTS "professor_acoes_delete" ON professor_acoes;
CREATE POLICY "professor_acoes_delete" ON professor_acoes
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM usuarios u 
      WHERE u.auth_user_id = auth.uid() 
      AND u.perfil = 'admin'
    )
  );

-- Políticas para professor_checkpoints
DROP POLICY IF EXISTS "professor_checkpoints_select" ON professor_checkpoints;
CREATE POLICY "professor_checkpoints_select" ON professor_checkpoints
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM usuarios u 
      WHERE u.auth_user_id = auth.uid() 
      AND (u.perfil = 'admin' OR u.unidade_id = professor_checkpoints.unidade_id OR professor_checkpoints.unidade_id IS NULL)
    )
  );

DROP POLICY IF EXISTS "professor_checkpoints_insert" ON professor_checkpoints;
CREATE POLICY "professor_checkpoints_insert" ON professor_checkpoints
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u 
      WHERE u.auth_user_id = auth.uid() 
      AND (u.perfil = 'admin' OR u.unidade_id = professor_checkpoints.unidade_id)
    )
  );

-- Políticas para professor_acoes_participantes
DROP POLICY IF EXISTS "professor_acoes_participantes_select" ON professor_acoes_participantes;
CREATE POLICY "professor_acoes_participantes_select" ON professor_acoes_participantes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "professor_acoes_participantes_insert" ON professor_acoes_participantes;
CREATE POLICY "professor_acoes_participantes_insert" ON professor_acoes_participantes
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u 
      WHERE u.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "professor_acoes_participantes_update" ON professor_acoes_participantes;
CREATE POLICY "professor_acoes_participantes_update" ON professor_acoes_participantes
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM usuarios u 
      WHERE u.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "professor_acoes_participantes_delete" ON professor_acoes_participantes;
CREATE POLICY "professor_acoes_participantes_delete" ON professor_acoes_participantes
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM usuarios u 
      WHERE u.auth_user_id = auth.uid() 
      AND u.perfil = 'admin'
    )
  );
