-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Criar tabela motivos_arquivamento para leads arquivados
CREATE TABLE IF NOT EXISTS motivos_arquivamento (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  descricao TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inserir motivos padrão
INSERT INTO motivos_arquivamento (nome, descricao) VALUES
  ('Não respondeu', 'Lead não respondeu após múltiplas tentativas de contato'),
  ('Desistiu', 'Lead informou que desistiu de fazer aulas'),
  ('Fora do perfil', 'Lead não se encaixa no perfil de aluno da escola'),
  ('Preço', 'Lead achou o valor muito alto'),
  ('Horário incompatível', 'Não há horário disponível que atenda o lead'),
  ('Distância', 'Lead mora muito longe da unidade'),
  ('Outro', 'Outro motivo não listado');

-- Habilitar RLS
ALTER TABLE motivos_arquivamento ENABLE ROW LEVEL SECURITY;

-- Política de leitura para usuários autenticados
CREATE POLICY "Usuários autenticados podem ler motivos_arquivamento"
  ON motivos_arquivamento FOR SELECT
  TO authenticated
  USING (true);

-- Comentário na tabela
COMMENT ON TABLE motivos_arquivamento IS 'Motivos para arquivamento de leads que não converteram';
