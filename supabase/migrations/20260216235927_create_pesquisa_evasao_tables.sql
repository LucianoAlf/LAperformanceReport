-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Tabela principal de pesquisa de evasão
CREATE TABLE IF NOT EXISTS pesquisa_evasao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Vínculos
  aluno_id INTEGER REFERENCES alunos(id),
  evasao_id INTEGER REFERENCES evasoes_v2(id),
  unidade_id UUID NOT NULL REFERENCES unidades(id),
  
  -- Snapshot do aluno no momento da evasão (preenchido na hora)
  aluno_nome TEXT NOT NULL,
  aluno_telefone TEXT NOT NULL,
  aluno_curso TEXT,
  aluno_professor TEXT,
  tempo_permanencia_meses INTEGER,
  data_evasao DATE,
  motivo_cadastrado TEXT,
  
  -- Status da pesquisa
  status VARCHAR(30) DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'enviado', 'respondido', 'sem_whatsapp', 'falha_envio', 'ignorado')),
  
  -- Envio
  enviado_em TIMESTAMPTZ,
  enviado_por TEXT,
  mensagem_uazapi_id VARCHAR(100),
  
  -- Resposta
  resposta_texto TEXT,
  resposta_audio_url TEXT,
  resposta_tipo VARCHAR(20) CHECK (resposta_tipo IN ('texto', 'audio')),
  respondido_em TIMESTAMPTZ,
  
  -- Categorização automática (via IA ou keywords)
  categoria_resposta VARCHAR(50),
  sentimento VARCHAR(20) CHECK (sentimento IN ('positivo', 'neutro', 'negativo')),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_pesquisa_evasao_unidade ON pesquisa_evasao(unidade_id);
CREATE INDEX IF NOT EXISTS idx_pesquisa_evasao_status ON pesquisa_evasao(status);
CREATE INDEX IF NOT EXISTS idx_pesquisa_evasao_evasao_id ON pesquisa_evasao(evasao_id);
CREATE INDEX IF NOT EXISTS idx_pesquisa_evasao_telefone ON pesquisa_evasao(aluno_telefone);

-- Tabela de estado de conversa WhatsApp (genérica)
CREATE TABLE IF NOT EXISTS conversa_estado_whatsapp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_numero TEXT NOT NULL UNIQUE,
  estado VARCHAR(50) NOT NULL DEFAULT 'idle',
  contexto JSONB DEFAULT '{}',
  expira_em TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS tr_updated_at_pesquisa_evasao ON pesquisa_evasao;
CREATE TRIGGER tr_updated_at_pesquisa_evasao
  BEFORE UPDATE ON pesquisa_evasao
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS tr_updated_at_conversa_estado ON conversa_estado_whatsapp;
CREATE TRIGGER tr_updated_at_conversa_estado
  BEFORE UPDATE ON conversa_estado_whatsapp
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE pesquisa_evasao ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversa_estado_whatsapp ENABLE ROW LEVEL SECURITY;

-- Policies permissivas (ajustar para produção)
CREATE POLICY "pesquisa_evasao_all" ON pesquisa_evasao FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "conversa_estado_all" ON conversa_estado_whatsapp FOR ALL USING (true) WITH CHECK (true);
