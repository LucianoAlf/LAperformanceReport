-- =============================================
-- Migração: Tabelas de Gestão de Projetos Pedagógicos
-- Data: 2026-01-28
-- ATUALIZADO: Reflete a estrutura REAL do banco de dados
-- =============================================

-- Tipos de Projeto (Semana Temática, Recital, Show, etc.)
CREATE TABLE IF NOT EXISTS projeto_tipos (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  icone VARCHAR(10) DEFAULT '📁',
  cor VARCHAR(20) DEFAULT 'violet',
  descricao TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Template de Fases por Tipo de Projeto
CREATE TABLE IF NOT EXISTS projeto_tipo_fases_template (
  id SERIAL PRIMARY KEY,
  tipo_id INTEGER NOT NULL REFERENCES projeto_tipos(id) ON DELETE CASCADE,
  nome VARCHAR(100) NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 1,
  duracao_sugerida_dias INTEGER DEFAULT 7,
  descricao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Template de Tarefas por Fase Template
CREATE TABLE IF NOT EXISTS projeto_tipo_tarefas_template (
  id SERIAL PRIMARY KEY,
  fase_template_id INTEGER NOT NULL REFERENCES projeto_tipo_fases_template(id) ON DELETE CASCADE,
  titulo VARCHAR(200) NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 1,
  descricao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Projetos
CREATE TABLE IF NOT EXISTS projetos (
  id SERIAL PRIMARY KEY,
  tipo_id INTEGER NOT NULL REFERENCES projeto_tipos(id),
  nome VARCHAR(200) NOT NULL,
  descricao TEXT,
  responsavel_tipo VARCHAR(20) CHECK (responsavel_tipo IN ('usuario', 'professor')),
  responsavel_id INTEGER,
  unidade_id UUID REFERENCES unidades(id),
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'planejamento' CHECK (status IN ('planejamento', 'em_andamento', 'em_revisao', 'concluido', 'cancelado', 'pausado')),
  prioridade VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (prioridade IN ('baixa', 'normal', 'alta', 'urgente')),
  orcamento DECIMAL(10,2),
  arquivado BOOLEAN DEFAULT false,
  created_by INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fases do Projeto
CREATE TABLE IF NOT EXISTS projeto_fases (
  id SERIAL PRIMARY KEY,
  projeto_id INTEGER NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  nome VARCHAR(100) NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 1,
  data_inicio DATE,
  data_fim DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_andamento', 'concluida', 'cancelada')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tarefas do Projeto
CREATE TABLE IF NOT EXISTS projeto_tarefas (
  id SERIAL PRIMARY KEY,
  projeto_id INTEGER NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  fase_id INTEGER REFERENCES projeto_fases(id) ON DELETE CASCADE,
  tarefa_pai_id INTEGER REFERENCES projeto_tarefas(id),
  titulo VARCHAR(200) NOT NULL,
  descricao TEXT,
  responsavel_tipo VARCHAR(20) CHECK (responsavel_tipo IN ('usuario', 'professor')),
  responsavel_id INTEGER,
  prazo DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_andamento', 'concluida', 'cancelada')),
  prioridade VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (prioridade IN ('baixa', 'normal', 'alta', 'urgente')),
  dependencia_id INTEGER REFERENCES projeto_tarefas(id),
  ordem INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Equipe do Projeto
CREATE TABLE IF NOT EXISTS projeto_equipe (
  id SERIAL PRIMARY KEY,
  projeto_id INTEGER NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  pessoa_tipo VARCHAR(20) NOT NULL CHECK (pessoa_tipo IN ('usuario', 'professor')),
  pessoa_id INTEGER NOT NULL,
  papel VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(projeto_id, pessoa_tipo, pessoa_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_projetos_tipo ON projetos(tipo_id);
CREATE INDEX IF NOT EXISTS idx_projetos_status ON projetos(status);
CREATE INDEX IF NOT EXISTS idx_projetos_unidade ON projetos(unidade_id);
CREATE INDEX IF NOT EXISTS idx_projeto_fases_projeto ON projeto_fases(projeto_id);
CREATE INDEX IF NOT EXISTS idx_projeto_tarefas_fase ON projeto_tarefas(fase_id);
CREATE INDEX IF NOT EXISTS idx_projeto_tarefas_projeto ON projeto_tarefas(projeto_id);
CREATE INDEX IF NOT EXISTS idx_projeto_tarefas_status ON projeto_tarefas(status);
CREATE INDEX IF NOT EXISTS idx_projeto_tarefas_prazo ON projeto_tarefas(prazo);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_projeto_tipos_updated_at ON projeto_tipos;
CREATE TRIGGER update_projeto_tipos_updated_at
  BEFORE UPDATE ON projeto_tipos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_projetos_updated_at ON projetos;
CREATE TRIGGER update_projetos_updated_at
  BEFORE UPDATE ON projetos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_projeto_fases_updated_at ON projeto_fases;
CREATE TRIGGER update_projeto_fases_updated_at
  BEFORE UPDATE ON projeto_fases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_projeto_tarefas_updated_at ON projeto_tarefas;
CREATE TRIGGER update_projeto_tarefas_updated_at
  BEFORE UPDATE ON projeto_tarefas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- Dados iniciais: Tipos de Projeto
-- =============================================
INSERT INTO projeto_tipos (nome, descricao, icone, cor) VALUES
  ('Semana Temática', 'Eventos temáticos semanais como Semana do Baterista, Semana do Violão, etc.', '🎉', 'violet'),
  ('Recital', 'Apresentações de alunos em formato recital', '🎵', 'cyan'),
  ('Show de Banda', 'Apresentações de bandas formadas por alunos', '🎸', 'rose'),
  ('Material Didático', 'Criação de apostilas, vídeo-aulas e materiais de apoio', '📚', 'emerald'),
  ('Produção de Conteúdo', 'Conteúdo para redes sociais, marketing e comunicação', '📱', 'amber'),
  ('Vídeo Aulas', 'Gravação e edição de vídeo-aulas para cursos online', '🎬', 'blue')
ON CONFLICT DO NOTHING;

-- =============================================
-- Dados iniciais: Templates de Fases para Semana Temática
-- =============================================
INSERT INTO projeto_tipo_fases_template (tipo_id, nome, descricao, ordem, duracao_sugerida_dias)
SELECT id, 'Planejamento', 'Definição de tema, datas, professores envolvidos e orçamento', 1, 14
FROM projeto_tipos WHERE nome = 'Semana Temática'
ON CONFLICT DO NOTHING;

INSERT INTO projeto_tipo_fases_template (tipo_id, nome, descricao, ordem, duracao_sugerida_dias)
SELECT id, 'Divulgação', 'Criação de artes, posts e comunicação com alunos', 2, 7
FROM projeto_tipos WHERE nome = 'Semana Temática'
ON CONFLICT DO NOTHING;

INSERT INTO projeto_tipo_fases_template (tipo_id, nome, descricao, ordem, duracao_sugerida_dias)
SELECT id, 'Preparação', 'Organização de materiais, ensaios e logística', 3, 14
FROM projeto_tipos WHERE nome = 'Semana Temática'
ON CONFLICT DO NOTHING;

INSERT INTO projeto_tipo_fases_template (tipo_id, nome, descricao, ordem, duracao_sugerida_dias)
SELECT id, 'Execução', 'Realização do evento', 4, 7
FROM projeto_tipos WHERE nome = 'Semana Temática'
ON CONFLICT DO NOTHING;

INSERT INTO projeto_tipo_fases_template (tipo_id, nome, descricao, ordem, duracao_sugerida_dias)
SELECT id, 'Pós-Evento', 'Avaliação, fotos, vídeos e relatório final', 5, 7
FROM projeto_tipos WHERE nome = 'Semana Temática'
ON CONFLICT DO NOTHING;

-- =============================================
-- Dados iniciais: Templates de Fases para Recital
-- =============================================
INSERT INTO projeto_tipo_fases_template (tipo_id, nome, descricao, ordem, duracao_sugerida_dias)
SELECT id, 'Planejamento', 'Definição de repertório, alunos participantes e local', 1, 21
FROM projeto_tipos WHERE nome = 'Recital'
ON CONFLICT DO NOTHING;

INSERT INTO projeto_tipo_fases_template (tipo_id, nome, descricao, ordem, duracao_sugerida_dias)
SELECT id, 'Divulgação', 'Convites, artes e comunicação com famílias', 2, 14
FROM projeto_tipos WHERE nome = 'Recital'
ON CONFLICT DO NOTHING;

INSERT INTO projeto_tipo_fases_template (tipo_id, nome, descricao, ordem, duracao_sugerida_dias)
SELECT id, 'Ensaios', 'Ensaios individuais e coletivos', 3, 30
FROM projeto_tipos WHERE nome = 'Recital'
ON CONFLICT DO NOTHING;

INSERT INTO projeto_tipo_fases_template (tipo_id, nome, descricao, ordem, duracao_sugerida_dias)
SELECT id, 'Passagem de Som', 'Teste de som e ensaio geral', 4, 1
FROM projeto_tipos WHERE nome = 'Recital'
ON CONFLICT DO NOTHING;

INSERT INTO projeto_tipo_fases_template (tipo_id, nome, descricao, ordem, duracao_sugerida_dias)
SELECT id, 'Evento', 'Dia do recital', 5, 1
FROM projeto_tipos WHERE nome = 'Recital'
ON CONFLICT DO NOTHING;

INSERT INTO projeto_tipo_fases_template (tipo_id, nome, descricao, ordem, duracao_sugerida_dias)
SELECT id, 'Pós-Evento', 'Fotos, vídeos, agradecimentos e avaliação', 6, 7
FROM projeto_tipos WHERE nome = 'Recital'
ON CONFLICT DO NOTHING;

-- =============================================
-- RLS Policies
-- =============================================
ALTER TABLE projeto_tipos ENABLE ROW LEVEL SECURITY;
ALTER TABLE projeto_tipo_fases_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE projeto_tipo_tarefas_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE projetos ENABLE ROW LEVEL SECURITY;
ALTER TABLE projeto_fases ENABLE ROW LEVEL SECURITY;
ALTER TABLE projeto_tarefas ENABLE ROW LEVEL SECURITY;
ALTER TABLE projeto_equipe ENABLE ROW LEVEL SECURITY;

-- Políticas de leitura (todos autenticados podem ler)
CREATE POLICY "Usuários autenticados podem ler tipos" ON projeto_tipos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Usuários autenticados podem ler fases template" ON projeto_tipo_fases_template
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Usuários autenticados podem ler tarefas template" ON projeto_tipo_tarefas_template
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Usuários autenticados podem ler projetos" ON projetos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Usuários autenticados podem ler fases" ON projeto_fases
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Usuários autenticados podem ler tarefas" ON projeto_tarefas
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Usuários autenticados podem ler equipe" ON projeto_equipe
  FOR SELECT TO authenticated USING (true);

-- Políticas de escrita (todos autenticados podem escrever por enquanto)
CREATE POLICY "Usuários autenticados podem inserir projetos" ON projetos
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar projetos" ON projetos
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Usuários autenticados podem inserir fases" ON projeto_fases
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar fases" ON projeto_fases
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Usuários autenticados podem inserir tarefas" ON projeto_tarefas
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar tarefas" ON projeto_tarefas
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Usuários autenticados podem gerenciar equipe" ON projeto_equipe
  FOR ALL TO authenticated USING (true);
