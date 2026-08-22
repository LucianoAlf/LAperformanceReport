-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- =====================================================
-- MIGRAÇÃO: Sistema de Recados e Health Score
-- =====================================================

-- 1. Adicionar campo health_score na tabela alunos
ALTER TABLE alunos 
ADD COLUMN IF NOT EXISTS health_score VARCHAR(10) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS health_score_updated_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS health_score_updated_by INTEGER DEFAULT NULL;

COMMENT ON COLUMN alunos.health_score IS 'Percepção do professor: verde (saudável), amarelo (alerta), vermelho (emergente)';

-- 2. Criar tabela de histórico de health score
CREATE TABLE IF NOT EXISTS alunos_health_score_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  professor_id INTEGER NOT NULL REFERENCES professores(id),
  health_score VARCHAR(10) NOT NULL CHECK (health_score IN ('verde', 'amarelo', 'vermelho')),
  observacao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_score_historico_aluno ON alunos_health_score_historico(aluno_id);
CREATE INDEX IF NOT EXISTS idx_health_score_historico_professor ON alunos_health_score_historico(professor_id);

-- 3. Criar tabela de campanhas de recados
CREATE TABLE IF NOT EXISTS farmer_recados_campanhas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id UUID NOT NULL REFERENCES unidades(id),
  colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id),
  titulo VARCHAR(200) NOT NULL,
  tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('health_score', 'video', 'relatorio', 'aviso', 'outro')),
  template_id UUID REFERENCES farmer_templates(id),
  mensagem_base TEXT NOT NULL,
  data_limite DATE,
  status VARCHAR(20) DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'agendada', 'enviando', 'concluida', 'cancelada')),
  total_destinatarios INTEGER DEFAULT 0,
  enviados INTEGER DEFAULT 0,
  erros INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- 4. Criar tabela de destinatários da campanha
CREATE TABLE IF NOT EXISTS farmer_recados_destinatarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id UUID NOT NULL REFERENCES farmer_recados_campanhas(id) ON DELETE CASCADE,
  professor_id INTEGER NOT NULL REFERENCES professores(id),
  whatsapp VARCHAR(20),
  mensagem_personalizada TEXT,
  status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente', 'enviado', 'erro', 'cancelado')),
  enviado_at TIMESTAMPTZ,
  erro_mensagem TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recados_campanhas_unidade ON farmer_recados_campanhas(unidade_id);
CREATE INDEX IF NOT EXISTS idx_recados_campanhas_status ON farmer_recados_campanhas(status);
CREATE INDEX IF NOT EXISTS idx_recados_destinatarios_campanha ON farmer_recados_destinatarios(campanha_id);

-- 5. RLS Policies
ALTER TABLE alunos_health_score_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE farmer_recados_campanhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE farmer_recados_destinatarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "health_score_historico_all" ON alunos_health_score_historico FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "recados_campanhas_all" ON farmer_recados_campanhas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "recados_destinatarios_all" ON farmer_recados_destinatarios FOR ALL USING (true) WITH CHECK (true);

-- 6. Function para atualizar health score
CREATE OR REPLACE FUNCTION atualizar_health_score(
  p_aluno_id INTEGER,
  p_professor_id INTEGER,
  p_health_score VARCHAR(10),
  p_observacao TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
  UPDATE alunos 
  SET health_score = p_health_score, health_score_updated_at = NOW(), health_score_updated_by = p_professor_id
  WHERE id = p_aluno_id;
  
  INSERT INTO alunos_health_score_historico (aluno_id, professor_id, health_score, observacao)
  VALUES (p_aluno_id, p_professor_id, p_health_score, p_observacao);
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. View para professores com resumo de carteira
CREATE OR REPLACE VIEW vw_professores_carteira_resumo AS
SELECT 
  p.id as professor_id,
  p.nome as professor_nome,
  p.telefone_whatsapp,
  a.unidade_id,
  COUNT(a.id) as total_alunos,
  COUNT(CASE WHEN a.health_score = 'verde' THEN 1 END) as alunos_verdes,
  COUNT(CASE WHEN a.health_score = 'amarelo' THEN 1 END) as alunos_amarelos,
  COUNT(CASE WHEN a.health_score = 'vermelho' THEN 1 END) as alunos_vermelhos,
  COUNT(CASE WHEN a.health_score IS NULL THEN 1 END) as alunos_sem_avaliacao
FROM professores p
LEFT JOIN alunos a ON a.professor_atual_id = p.id AND a.status = 'ativo'
WHERE p.ativo = true
GROUP BY p.id, p.nome, p.telefone_whatsapp, a.unidade_id;

-- 8. Inserir templates de recados (usando estrutura correta)
INSERT INTO farmer_templates (categoria, nome, mensagem, variaveis, ativo, ordem) VALUES
('recado_professor', 'Avaliação Health Score', 
'Olá, {nome_professor}! 👋

Estamos realizando um acompanhamento dos alunos e gostaríamos de contar com sua avaliação pedagógica.

Por gentileza, atribua um coração correspondente ao lado do nome de cada aluno:

💚 Aluno saudável: acompanha bem as aulas, é participativo e demonstra entusiasmo.
💛 Aluno em alerta: apresenta sinais de desmotivação, faltas frequentes ou queda de rendimento.
❤️ Aluno em situação emergente: apresenta grandes chances de evasão ou desistência.

⚠️ Sua devolutiva é muito importante! Prazo: {data_limite}

*Lista de alunos:*
{lista_alunos}

Obrigado! 🎵',
ARRAY['nome_professor', 'data_limite', 'lista_alunos'], true, 1),

('recado_professor', 'Lembrete de Vídeos', 
'Olá, {nome_professor}! 🎬

Lembrando dos vídeos de evolução dos alunos para este mês.

📹 Grave um vídeo curto (30s a 1min) de cada aluno tocando.

*Alunos pendentes:*
{lista_alunos}

Prazo: {data_limite}

Obrigado! 🎵',
ARRAY['nome_professor', 'data_limite', 'lista_alunos'], true, 2),

('recado_professor', 'Relatório Mensal', 
'Olá, {nome_professor}! 📝

Precisamos do seu relatório de evolução dos alunos.

Por favor, envie um breve feedback sobre cada aluno:
- Progresso técnico
- Comportamento em aula
- Sugestões de repertório

*Seus alunos:*
{lista_alunos}

Prazo: {data_limite}

Obrigado! 🎵',
ARRAY['nome_professor', 'data_limite', 'lista_alunos'], true, 3),

('recado_professor', 'Aviso Geral', 
'Olá, {nome_professor}! 📢

{mensagem_personalizada}

Qualquer dúvida, estamos à disposição!

Equipe LA Music 🎵',
ARRAY['nome_professor', 'mensagem_personalizada'], true, 4)
ON CONFLICT DO NOTHING;
