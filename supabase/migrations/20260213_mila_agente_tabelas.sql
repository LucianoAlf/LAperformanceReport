-- ============================================================================
-- Migração: Tabelas do Agente SDR Mila
-- Descrição: Cria mila_config (prompt/config por unidade) e mila_message_buffer (debounce)
-- ============================================================================

-- 1. Tabela de configuração da Mila por unidade
CREATE TABLE IF NOT EXISTS mila_config (
  id serial PRIMARY KEY,
  unidade_id uuid NOT NULL REFERENCES unidades(id),
  ativo boolean NOT NULL DEFAULT true,
  
  -- Prompt e modelo
  prompt_sistema text NOT NULL,
  modelo_openai varchar(50) NOT NULL DEFAULT 'gpt-4o',
  temperatura_modelo numeric(3,2) NOT NULL DEFAULT 0.7,
  max_tokens integer NOT NULL DEFAULT 500,
  
  -- Base de conhecimento (diferenciais, FAQ, cursos)
  base_conhecimento text,
  
  -- Horários disponíveis para aulas experimentais (JSON)
  horarios_disponiveis jsonb DEFAULT '{}',
  
  -- Config Emusys
  emusys_token varchar(100),
  emusys_url varchar(255) DEFAULT 'https://sys.emusys.com.br/w2bh99k_/api/criar_lead.php',
  
  -- Config de atendimento
  nome_atendente varchar(100),
  endereco_unidade text,
  horario_funcionamento text,
  cursos_disponiveis jsonb DEFAULT '[]',
  
  -- Debounce
  debounce_segundos integer NOT NULL DEFAULT 8,
  
  -- Limites
  max_mensagens_contexto integer NOT NULL DEFAULT 20,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  CONSTRAINT mila_config_unidade_unique UNIQUE (unidade_id)
);

-- 2. Tabela de buffer de mensagens (debounce sem Redis)
CREATE TABLE IF NOT EXISTS mila_message_buffer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id uuid NOT NULL REFERENCES crm_conversas(id) ON DELETE CASCADE,
  lead_id integer NOT NULL REFERENCES leads(id),
  conteudo text NOT NULL,
  tipo varchar(20) NOT NULL DEFAULT 'texto',
  created_at timestamptz DEFAULT now(),
  processado boolean NOT NULL DEFAULT false,
  processado_at timestamptz
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_mila_buffer_conversa_pendente 
  ON mila_message_buffer(conversa_id, processado) 
  WHERE processado = false;

CREATE INDEX IF NOT EXISTS idx_mila_buffer_created 
  ON mila_message_buffer(created_at);

-- 3. Trigger para updated_at na mila_config
CREATE OR REPLACE FUNCTION update_mila_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_mila_config_updated_at
  BEFORE UPDATE ON mila_config
  FOR EACH ROW
  EXECUTE FUNCTION update_mila_config_updated_at();

-- 4. RLS
ALTER TABLE mila_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE mila_message_buffer ENABLE ROW LEVEL SECURITY;

-- Políticas mila_config: admin pode tudo, usuários veem sua unidade
CREATE POLICY "mila_config_admin_all" ON mila_config
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid()
      AND u.perfil = 'admin'
    )
  );

CREATE POLICY "mila_config_unidade_select" ON mila_config
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid()
      AND u.unidade_id = mila_config.unidade_id
    )
  );

-- Políticas mila_message_buffer: service role only (Edge Functions)
-- Não precisa de policies para usuários normais, só Edge Functions com service_role
CREATE POLICY "mila_buffer_service_role" ON mila_message_buffer
  FOR ALL USING (auth.role() = 'service_role');

-- 5. Limpar buffer antigo automaticamente (mensagens processadas > 24h)
-- Pode ser executado via pg_cron se disponível
CREATE OR REPLACE FUNCTION limpar_mila_buffer_antigo()
RETURNS void AS $$
BEGIN
  DELETE FROM mila_message_buffer
  WHERE processado = true
  AND processado_at < now() - interval '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
