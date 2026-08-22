-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Criar tabela de motivos de não matrícula
CREATE TABLE IF NOT EXISTS motivos_nao_matricula (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Inserir motivos padrão comuns em escolas de música
INSERT INTO motivos_nao_matricula (nome) VALUES
  ('Valor/Preço'),
  ('Horário incompatível'),
  ('Distância/Localização'),
  ('Vai pensar/Decidir depois'),
  ('Preferiu outra escola'),
  ('Não gostou da aula experimental'),
  ('Desistiu do curso'),
  ('Problemas financeiros'),
  ('Falta de tempo'),
  ('Outro')
ON CONFLICT DO NOTHING;
