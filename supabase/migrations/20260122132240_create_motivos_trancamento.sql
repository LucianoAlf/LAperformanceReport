-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Tabela de motivos de trancamento
CREATE TABLE IF NOT EXISTS motivos_trancamento (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  nome_normalizado VARCHAR(100) NOT NULL,
  categoria VARCHAR(50) DEFAULT 'outro',
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Inserir motivos de trancamento
INSERT INTO motivos_trancamento (nome, nome_normalizado, categoria) VALUES
  ('Viagem', 'VIAGEM', 'pessoal'),
  ('Problemas de saúde', 'PROBLEMAS DE SAÚDE', 'saude'),
  ('Cirurgia', 'CIRURGIA', 'saude'),
  ('Falta de tempo temporária', 'FALTA DE TEMPO TEMPORÁRIA', 'tempo'),
  ('Problemas financeiros temporários', 'PROBLEMAS FINANCEIROS TEMPORÁRIOS', 'financeiro'),
  ('Férias escolares', 'FÉRIAS ESCOLARES', 'estudos'),
  ('Vestibular/ENEM', 'VESTIBULAR/ENEM', 'estudos'),
  ('Mudança temporária', 'MUDANÇA TEMPORÁRIA', 'mudanca'),
  ('Questões familiares', 'QUESTÕES FAMILIARES', 'pessoal'),
  ('Outro', 'OUTRO', 'outro');

-- Adicionar coluna motivo_saida_id na tabela movimentacoes_admin se não existir
ALTER TABLE movimentacoes_admin 
ADD COLUMN IF NOT EXISTS motivo_saida_id INTEGER REFERENCES motivos_saida(id);

-- Adicionar coluna motivo_trancamento_id na tabela movimentacoes_admin se não existir
ALTER TABLE movimentacoes_admin 
ADD COLUMN IF NOT EXISTS motivo_trancamento_id INTEGER REFERENCES motivos_trancamento(id);

-- Habilitar RLS
ALTER TABLE motivos_trancamento ENABLE ROW LEVEL SECURITY;

-- Política de leitura pública
CREATE POLICY "Motivos trancamento são públicos para leitura" ON motivos_trancamento
  FOR SELECT USING (true);
