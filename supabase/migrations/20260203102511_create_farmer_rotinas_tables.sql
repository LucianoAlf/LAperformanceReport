-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- ============================================
-- PAINEL FARMER - TABELAS PRINCIPAIS
-- ============================================

-- Tabela: farmer_rotinas (definição de rotinas customizáveis)
CREATE TABLE IF NOT EXISTS farmer_rotinas (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  unidade_id UUID NOT NULL REFERENCES unidades(id),
  descricao VARCHAR(255) NOT NULL,
  frequencia VARCHAR(20) NOT NULL CHECK (frequencia IN ('diario', 'semanal', 'mensal')),
  dias_semana INTEGER[] DEFAULT NULL, -- [1,2,3,4,5,6] para semanal (1=seg, 7=dom)
  dia_mes INTEGER DEFAULT NULL CHECK (dia_mes IS NULL OR (dia_mes >= 1 AND dia_mes <= 31)),
  prioridade VARCHAR(10) DEFAULT 'normal' CHECK (prioridade IN ('normal', 'alta')),
  lembrete_whatsapp BOOLEAN DEFAULT false,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para farmer_rotinas
CREATE INDEX IF NOT EXISTS idx_farmer_rotinas_colaborador ON farmer_rotinas(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_farmer_rotinas_unidade ON farmer_rotinas(unidade_id);
CREATE INDEX IF NOT EXISTS idx_farmer_rotinas_ativo ON farmer_rotinas(ativo) WHERE ativo = true;

-- Tabela: farmer_rotinas_execucao (execução diária das rotinas)
CREATE TABLE IF NOT EXISTS farmer_rotinas_execucao (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  rotina_id UUID NOT NULL REFERENCES farmer_rotinas(id) ON DELETE CASCADE,
  colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id),
  data_execucao DATE NOT NULL,
  concluida BOOLEAN DEFAULT false,
  concluida_em TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(rotina_id, data_execucao)
);

-- Índices para farmer_rotinas_execucao
CREATE INDEX IF NOT EXISTS idx_farmer_rotinas_exec_data ON farmer_rotinas_execucao(data_execucao);
CREATE INDEX IF NOT EXISTS idx_farmer_rotinas_exec_colaborador ON farmer_rotinas_execucao(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_farmer_rotinas_exec_rotina ON farmer_rotinas_execucao(rotina_id);

-- Tabela: farmer_tarefas (to-do list manual)
CREATE TABLE IF NOT EXISTS farmer_tarefas (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  unidade_id UUID NOT NULL REFERENCES unidades(id),
  descricao VARCHAR(500) NOT NULL,
  data_prazo DATE DEFAULT NULL,
  prioridade VARCHAR(10) DEFAULT 'media' CHECK (prioridade IN ('alta', 'media', 'baixa')),
  aluno_id INTEGER DEFAULT NULL REFERENCES alunos(id),
  observacoes TEXT DEFAULT NULL,
  concluida BOOLEAN DEFAULT false,
  concluida_em TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para farmer_tarefas
CREATE INDEX IF NOT EXISTS idx_farmer_tarefas_colaborador ON farmer_tarefas(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_farmer_tarefas_unidade ON farmer_tarefas(unidade_id);
CREATE INDEX IF NOT EXISTS idx_farmer_tarefas_prazo ON farmer_tarefas(data_prazo);
CREATE INDEX IF NOT EXISTS idx_farmer_tarefas_pendentes ON farmer_tarefas(concluida) WHERE concluida = false;

-- Tabela: farmer_recados (mensagens para professores)
CREATE TABLE IF NOT EXISTS farmer_recados (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id),
  unidade_id UUID NOT NULL REFERENCES unidades(id),
  professor_id INTEGER NOT NULL REFERENCES professores(id),
  aluno_id INTEGER DEFAULT NULL REFERENCES alunos(id),
  assunto VARCHAR(100) DEFAULT NULL,
  mensagem TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'enviado' CHECK (status IN ('enviado', 'entregue', 'lido', 'erro')),
  whatsapp_message_id VARCHAR(100) DEFAULT NULL,
  enviado_em TIMESTAMPTZ DEFAULT NOW(),
  entregue_em TIMESTAMPTZ DEFAULT NULL,
  lido_em TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para farmer_recados
CREATE INDEX IF NOT EXISTS idx_farmer_recados_colaborador ON farmer_recados(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_farmer_recados_professor ON farmer_recados(professor_id);
CREATE INDEX IF NOT EXISTS idx_farmer_recados_status ON farmer_recados(status);
CREATE INDEX IF NOT EXISTS idx_farmer_recados_data ON farmer_recados(enviado_em DESC);

-- Tabela: farmer_templates (templates de mensagens)
CREATE TABLE IF NOT EXISTS farmer_templates (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  unidade_id UUID DEFAULT NULL REFERENCES unidades(id), -- NULL = global
  categoria VARCHAR(50) NOT NULL, -- 'aniversario', 'boas_vindas', 'renovacao', 'cobranca', 'experimental', 'faltoso'
  nome VARCHAR(100) NOT NULL,
  mensagem TEXT NOT NULL,
  variaveis TEXT[] DEFAULT NULL, -- ['{nome}', '{instrumento}', '{data}', '{horario}']
  ativo BOOLEAN DEFAULT true,
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para farmer_templates
CREATE INDEX IF NOT EXISTS idx_farmer_templates_categoria ON farmer_templates(categoria);
CREATE INDEX IF NOT EXISTS idx_farmer_templates_unidade ON farmer_templates(unidade_id);

-- Comentários nas tabelas
COMMENT ON TABLE farmer_rotinas IS 'Rotinas customizáveis dos Farmers (diárias, semanais, mensais)';
COMMENT ON TABLE farmer_rotinas_execucao IS 'Registro de execução diária das rotinas';
COMMENT ON TABLE farmer_tarefas IS 'To-do list manual dos Farmers';
COMMENT ON TABLE farmer_recados IS 'Mensagens enviadas para professores via WhatsApp';
COMMENT ON TABLE farmer_templates IS 'Templates de mensagens para comunicação com alunos/responsáveis';
