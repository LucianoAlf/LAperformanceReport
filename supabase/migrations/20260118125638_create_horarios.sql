-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Criar tabela horarios para faixas de horário de aulas
CREATE TABLE IF NOT EXISTS horarios (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(20) NOT NULL,
  hora_inicio TIME,
  hora_fim TIME,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inserir horários padrão
INSERT INTO horarios (nome, hora_inicio, hora_fim) VALUES
  ('Manhã', '08:00', '12:00'),
  ('Tarde', '12:00', '18:00'),
  ('Noite', '18:00', '22:00');

-- Habilitar RLS
ALTER TABLE horarios ENABLE ROW LEVEL SECURITY;

-- Política de leitura para usuários autenticados
CREATE POLICY "Usuários autenticados podem ler horarios"
  ON horarios FOR SELECT
  TO authenticated
  USING (true);

-- Comentário na tabela
COMMENT ON TABLE horarios IS 'Faixas de horário para aulas (manhã, tarde, noite)';
