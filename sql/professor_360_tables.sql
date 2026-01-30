-- ============================================================================
-- PROFESSOR 360° - Estrutura do Banco de Dados
-- LA Music Performance Report
-- Data: 30/01/2026
-- ============================================================================

-- ============================================================================
-- TABELA 1: professor_360_criterios (Critérios Configuráveis)
-- ============================================================================
CREATE TABLE IF NOT EXISTS professor_360_criterios (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(50) UNIQUE NOT NULL,
  nome VARCHAR(100) NOT NULL,
  descricao TEXT,
  tipo VARCHAR(20) NOT NULL DEFAULT 'penalidade', -- 'penalidade' ou 'bonus'
  peso INTEGER DEFAULT 10,
  pontos_perda INTEGER DEFAULT 10,
  tolerancia INTEGER DEFAULT 0,
  regra_detalhada TEXT,
  ativo BOOLEAN DEFAULT true,
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Dados iniciais dos critérios
INSERT INTO professor_360_criterios (codigo, nome, descricao, tipo, peso, pontos_perda, tolerancia, regra_detalhada, ordem) VALUES
('atrasos', 'Pontualidade', 'Atrasos acima de 10 minutos', 'penalidade', 15, 10, 2, 
 'Se o professor chegar acima de 10 min atrasado, perde ponto. Tem direito a 2 atrasos menores que 10 min, a partir do 3º também perde ponto.', 1),
('faltas', 'Assiduidade', 'Faltas sem justificativa', 'penalidade', 20, 20, 0, 
 'Se o professor faltar sem justificativa, perde ponto.', 2),
('organizacao_sala', 'Organização de Salas', 'Sala desorganizada após aula', 'penalidade', 15, 10, 0, 
 'Ao final da aula o professor deve manter a sala organizada, luz apagada, ar desligado. Se a Farmer ou próximo professor encontrar desorganização, perde ponto.', 3),
('uniforme', 'Dresscode', 'Não seguir código de vestimenta', 'penalidade', 10, 10, 0, 
 'A LA Music tem um dresscode que o professor precisa seguir. Caso não esteja dentro dos padrões, perde ponto.', 4),
('prazos', 'Cumprimento de Prazos', 'Descumprimento de prazos', 'penalidade', 15, 15, 0, 
 'Caso o professor descumpra qualquer prazo estabelecido, perde ponto. Prazo da ADM = perde na unidade. Prazo da Coordenação = perde em todas as unidades.', 5),
('emusys', 'Preenchimento EMUSYS', 'Sistema não preenchido 100%', 'penalidade', 25, 25, 0, 
 'O professor precisa preencher todas as presenças (dele e dos alunos) e anotações de todas as aulas. Se não tiver 100% de aproveitamento no mês, perde ponto.', 6),
('projetos', 'Engajamento em Projetos', 'Participação em mini projetos pedagógicos', 'bonus', 0, 0, 0, 
 'Critério de pontuação EXTRA. O professor que fizer projetos pedagógicos com seus alunos ou participar de projetos do curso ganha ponto extra.', 7)
ON CONFLICT (codigo) DO NOTHING;

-- ============================================================================
-- TABELA 2: professor_360_ocorrencias (Registro de Ocorrências)
-- ============================================================================
CREATE TABLE IF NOT EXISTS professor_360_ocorrencias (
  id SERIAL PRIMARY KEY,
  professor_id INTEGER NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  unidade_id UUID NOT NULL REFERENCES unidades(id),
  criterio_id INTEGER NOT NULL REFERENCES professor_360_criterios(id),
  competencia VARCHAR(7) NOT NULL,
  data_ocorrencia DATE NOT NULL,
  descricao TEXT,
  escopo VARCHAR(20) DEFAULT 'unidade', -- 'unidade' ou 'todas' (para prazos da coordenação)
  registrado_por UUID REFERENCES usuarios(id),
  notificado BOOLEAN DEFAULT false,
  data_notificacao TIMESTAMP WITH TIME ZONE,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ocorrencias_professor ON professor_360_ocorrencias(professor_id);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_competencia ON professor_360_ocorrencias(competencia);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_unidade ON professor_360_ocorrencias(unidade_id);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_criterio ON professor_360_ocorrencias(criterio_id);

-- ============================================================================
-- TABELA 3: professor_360_ocorrencias_log (Histórico de Edições)
-- ============================================================================
CREATE TABLE IF NOT EXISTS professor_360_ocorrencias_log (
  id SERIAL PRIMARY KEY,
  ocorrencia_id INTEGER NOT NULL,
  acao VARCHAR(20) NOT NULL, -- 'criacao', 'edicao', 'exclusao'
  dados_anteriores JSONB,
  dados_novos JSONB,
  usuario_id UUID REFERENCES usuarios(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ocorrencias_log_ocorrencia ON professor_360_ocorrencias_log(ocorrencia_id);

-- ============================================================================
-- TABELA 4: professor_360_avaliacoes (Avaliação Mensal Consolidada)
-- ============================================================================
CREATE TABLE IF NOT EXISTS professor_360_avaliacoes (
  id SERIAL PRIMARY KEY,
  professor_id INTEGER NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  unidade_id UUID NOT NULL REFERENCES unidades(id),
  competencia VARCHAR(7) NOT NULL,
  
  -- Pontuação por critério (calculado automaticamente das ocorrências)
  pontos_atrasos INTEGER DEFAULT 100,
  pontos_faltas INTEGER DEFAULT 100,
  pontos_organizacao_sala INTEGER DEFAULT 100,
  pontos_uniforme INTEGER DEFAULT 100,
  pontos_prazos INTEGER DEFAULT 100,
  pontos_emusys INTEGER DEFAULT 100,
  pontos_projetos INTEGER DEFAULT 0,
  
  -- Contagem de ocorrências por critério
  qtd_atrasos INTEGER DEFAULT 0,
  qtd_faltas INTEGER DEFAULT 0,
  qtd_organizacao_sala INTEGER DEFAULT 0,
  qtd_uniforme INTEGER DEFAULT 0,
  qtd_prazos INTEGER DEFAULT 0,
  qtd_emusys INTEGER DEFAULT 0,
  qtd_projetos INTEGER DEFAULT 0,
  
  -- Totais
  nota_base DECIMAL(5,2) DEFAULT 100,
  bonus_projetos DECIMAL(5,2) DEFAULT 0,
  nota_final DECIMAL(5,2) DEFAULT 100,
  
  -- Status
  status VARCHAR(20) DEFAULT 'pendente', -- 'pendente', 'avaliado', 'fechado'
  avaliador_id UUID REFERENCES usuarios(id),
  data_fechamento TIMESTAMP WITH TIME ZONE,
  observacoes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(professor_id, unidade_id, competencia)
);

CREATE INDEX IF NOT EXISTS idx_avaliacoes_professor ON professor_360_avaliacoes(professor_id);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_competencia ON professor_360_avaliacoes(competencia);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_unidade ON professor_360_avaliacoes(unidade_id);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_status ON professor_360_avaliacoes(status);

-- ============================================================================
-- TABELA 5: professor_360_config (Configuração Global)
-- ============================================================================
CREATE TABLE IF NOT EXISTS professor_360_config (
  id SERIAL PRIMARY KEY,
  chave VARCHAR(50) UNIQUE NOT NULL,
  valor TEXT NOT NULL,
  descricao TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Configurações iniciais
INSERT INTO professor_360_config (chave, valor, descricao) VALUES
('peso_health_score', '20', 'Peso do 360° no Health Score final (%)'),
('bonus_max_projetos', '10', 'Máximo de pontos extras por projetos'),
('pontos_por_projeto', '5', 'Pontos ganhos por cada projeto realizado')
ON CONFLICT (chave) DO NOTHING;

-- ============================================================================
-- FUNÇÃO: Trigger para atualizar updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para updated_at
DROP TRIGGER IF EXISTS update_professor_360_criterios_updated_at ON professor_360_criterios;
CREATE TRIGGER update_professor_360_criterios_updated_at
    BEFORE UPDATE ON professor_360_criterios
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_professor_360_ocorrencias_updated_at ON professor_360_ocorrencias;
CREATE TRIGGER update_professor_360_ocorrencias_updated_at
    BEFORE UPDATE ON professor_360_ocorrencias
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_professor_360_avaliacoes_updated_at ON professor_360_avaliacoes;
CREATE TRIGGER update_professor_360_avaliacoes_updated_at
    BEFORE UPDATE ON professor_360_avaliacoes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- FUNÇÃO: Trigger para log de ocorrências
-- ============================================================================
CREATE OR REPLACE FUNCTION log_ocorrencia_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO professor_360_ocorrencias_log (ocorrencia_id, acao, dados_novos, usuario_id)
        VALUES (NEW.id, 'criacao', to_jsonb(NEW), NEW.registrado_por);
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO professor_360_ocorrencias_log (ocorrencia_id, acao, dados_anteriores, dados_novos, usuario_id)
        VALUES (NEW.id, 'edicao', to_jsonb(OLD), to_jsonb(NEW), NEW.registrado_por);
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO professor_360_ocorrencias_log (ocorrencia_id, acao, dados_anteriores, usuario_id)
        VALUES (OLD.id, 'exclusao', to_jsonb(OLD), OLD.registrado_por);
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS log_ocorrencia_changes_trigger ON professor_360_ocorrencias;
CREATE TRIGGER log_ocorrencia_changes_trigger
    AFTER INSERT OR UPDATE OR DELETE ON professor_360_ocorrencias
    FOR EACH ROW EXECUTE FUNCTION log_ocorrencia_changes();

-- ============================================================================
-- POLÍTICAS RLS (Row Level Security)
-- ============================================================================
ALTER TABLE professor_360_criterios ENABLE ROW LEVEL SECURITY;
ALTER TABLE professor_360_ocorrencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE professor_360_ocorrencias_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE professor_360_avaliacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE professor_360_config ENABLE ROW LEVEL SECURITY;

-- Políticas para leitura (todos os usuários autenticados podem ler)
CREATE POLICY "Leitura criterios" ON professor_360_criterios FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura ocorrencias" ON professor_360_ocorrencias FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura ocorrencias_log" ON professor_360_ocorrencias_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura avaliacoes" ON professor_360_avaliacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura config" ON professor_360_config FOR SELECT TO authenticated USING (true);

-- Políticas para escrita (todos os usuários autenticados podem escrever - controle feito na aplicação)
CREATE POLICY "Escrita criterios" ON professor_360_criterios FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escrita ocorrencias" ON professor_360_ocorrencias FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escrita avaliacoes" ON professor_360_avaliacoes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escrita config" ON professor_360_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- VIEW: vw_professor_360_resumo (Resumo mensal por professor/unidade)
-- ============================================================================
CREATE OR REPLACE VIEW vw_professor_360_resumo AS
SELECT 
  a.id,
  a.professor_id,
  p.nome as professor_nome,
  p.foto_url as professor_foto,
  a.unidade_id,
  u.nome as unidade_nome,
  u.codigo as unidade_codigo,
  a.competencia,
  a.pontos_atrasos,
  a.pontos_faltas,
  a.pontos_organizacao_sala,
  a.pontos_uniforme,
  a.pontos_prazos,
  a.pontos_emusys,
  a.pontos_projetos,
  a.qtd_atrasos,
  a.qtd_faltas,
  a.qtd_organizacao_sala,
  a.qtd_uniforme,
  a.qtd_prazos,
  a.qtd_emusys,
  a.qtd_projetos,
  a.nota_base,
  a.bonus_projetos,
  a.nota_final,
  a.status,
  a.avaliador_id,
  a.data_fechamento,
  a.observacoes,
  a.created_at,
  a.updated_at
FROM professor_360_avaliacoes a
JOIN professores p ON p.id = a.professor_id
JOIN unidades u ON u.id = a.unidade_id;

-- ============================================================================
-- FIM DO SCRIPT
-- ============================================================================
