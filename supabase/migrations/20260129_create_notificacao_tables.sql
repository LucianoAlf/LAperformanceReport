-- =============================================
-- Migração: Tabelas de Notificações
-- Data: 2026-01-29
-- =============================================

-- Configurações de notificação
CREATE TABLE IF NOT EXISTS notificacao_config (
  id SERIAL PRIMARY KEY,
  tipo VARCHAR(50) NOT NULL UNIQUE, -- 'tarefa_atrasada', 'tarefa_vencendo', 'projeto_parado', 'resumo_semanal'
  ativo BOOLEAN DEFAULT true,
  antecedencia_dias INTEGER DEFAULT 3,
  dias_inatividade INTEGER DEFAULT 7,
  dia_semana INTEGER DEFAULT 1, -- 1=segunda
  hora_envio TIME DEFAULT '09:00',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Destinatários por tipo de notificação
CREATE TABLE IF NOT EXISTS notificacao_destinatarios (
  id SERIAL PRIMARY KEY,
  config_id INTEGER NOT NULL REFERENCES notificacao_config(id) ON DELETE CASCADE,
  pessoa_tipo VARCHAR(20) NOT NULL CHECK (pessoa_tipo IN ('usuario', 'professor')),
  pessoa_id INTEGER NOT NULL,
  canal VARCHAR(20) NOT NULL DEFAULT 'whatsapp' CHECK (canal IN ('whatsapp', 'sistema', 'ambos')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(config_id, pessoa_tipo, pessoa_id)
);

-- Log de notificações enviadas
CREATE TABLE IF NOT EXISTS notificacao_log (
  id SERIAL PRIMARY KEY,
  config_id INTEGER REFERENCES notificacao_config(id) ON DELETE SET NULL,
  tipo VARCHAR(50) NOT NULL,
  destinatario_tipo VARCHAR(20) NOT NULL,
  destinatario_id INTEGER NOT NULL,
  canal VARCHAR(20) NOT NULL,
  mensagem TEXT NOT NULL,
  projeto_id INTEGER REFERENCES projetos(id) ON DELETE SET NULL,
  tarefa_id INTEGER REFERENCES projeto_tarefas(id) ON DELETE SET NULL,
  status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente', 'enviado', 'erro', 'lido')),
  erro_mensagem TEXT,
  enviado_at TIMESTAMPTZ DEFAULT NOW(),
  lido_at TIMESTAMPTZ
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_notificacao_log_status ON notificacao_log(status);
CREATE INDEX IF NOT EXISTS idx_notificacao_log_tipo ON notificacao_log(tipo);
CREATE INDEX IF NOT EXISTS idx_notificacao_log_enviado_at ON notificacao_log(enviado_at);
CREATE INDEX IF NOT EXISTS idx_notificacao_destinatarios_config ON notificacao_destinatarios(config_id);

-- Trigger para updated_at
DROP TRIGGER IF EXISTS update_notificacao_config_updated_at ON notificacao_config;
CREATE TRIGGER update_notificacao_config_updated_at
  BEFORE UPDATE ON notificacao_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE notificacao_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificacao_destinatarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificacao_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados podem ler config" ON notificacao_config
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Usuários autenticados podem gerenciar config" ON notificacao_config
  FOR ALL TO authenticated USING (true);

CREATE POLICY "Usuários autenticados podem ler destinatarios" ON notificacao_destinatarios
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Usuários autenticados podem gerenciar destinatarios" ON notificacao_destinatarios
  FOR ALL TO authenticated USING (true);

CREATE POLICY "Usuários autenticados podem ler log" ON notificacao_log
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Usuários autenticados podem inserir log" ON notificacao_log
  FOR INSERT TO authenticated WITH CHECK (true);

-- Dados iniciais
INSERT INTO notificacao_config (tipo, ativo, antecedencia_dias, dias_inatividade) VALUES
  ('tarefa_atrasada', true, 0, 0),
  ('tarefa_vencendo', true, 3, 0),
  ('projeto_parado', true, 0, 7),
  ('resumo_semanal', true, 0, 0)
ON CONFLICT (tipo) DO NOTHING;
