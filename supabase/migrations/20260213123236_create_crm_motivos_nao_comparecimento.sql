-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Tabela de lookup para motivos de não comparecimento (sem "Outro" — forçar categorização)
CREATE TABLE crm_motivos_nao_comparecimento (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  descricao TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed: 10 motivos padronizados
INSERT INTO crm_motivos_nao_comparecimento (nome, descricao) VALUES
  ('Esqueceu',                'Lead esqueceu do compromisso agendado'),
  ('Chuva / Clima',           'Condições climáticas impediram o comparecimento'),
  ('Trânsito / Transporte',   'Problemas de deslocamento ou transporte'),
  ('Doença',                  'Lead ou dependente ficou doente'),
  ('Compromisso pessoal',     'Surgiu compromisso pessoal de última hora'),
  ('Compromisso profissional','Surgiu compromisso de trabalho'),
  ('Desistiu antes',          'Lead avisou que desistiu antes da data'),
  ('Não respondeu confirmação','Lead não respondeu a mensagem de confirmação'),
  ('Horário incompatível',    'Descobriu que o horário não funciona mais'),
  ('Mudou de ideia sobre curso','Lead decidiu que não quer mais aquele curso');

CREATE INDEX idx_crm_motivos_nao_comparecimento_ativo ON crm_motivos_nao_comparecimento(id) WHERE ativo = true;
