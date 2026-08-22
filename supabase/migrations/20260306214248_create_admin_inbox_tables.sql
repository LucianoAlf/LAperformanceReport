-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- =============================================
-- Caixa de Entrada Administrativa
-- =============================================

-- 1. Tabela de conversas admin (1 por aluno por unidade)
CREATE TABLE admin_conversas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  aluno_id INTEGER NOT NULL REFERENCES alunos(id),
  unidade_id UUID NOT NULL REFERENCES unidades(id),
  caixa_id INTEGER REFERENCES whatsapp_caixas(id),
  whatsapp_jid VARCHAR,
  nao_lidas INTEGER DEFAULT 0,
  ultima_mensagem_at TIMESTAMPTZ,
  ultima_mensagem_preview TEXT,
  status VARCHAR DEFAULT 'aberta',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(aluno_id, unidade_id)
);

COMMENT ON TABLE admin_conversas IS 'Conversas administrativas com alunos via WhatsApp - uma por aluno por unidade';

CREATE INDEX idx_admin_conversas_unidade ON admin_conversas(unidade_id);
CREATE INDEX idx_admin_conversas_ultima_msg ON admin_conversas(ultima_mensagem_at DESC);
CREATE INDEX idx_admin_conversas_nao_lidas ON admin_conversas(nao_lidas) WHERE nao_lidas > 0;
CREATE INDEX idx_admin_conversas_aluno ON admin_conversas(aluno_id);

-- 2. Tabela de mensagens admin
CREATE TABLE admin_mensagens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversa_id UUID NOT NULL REFERENCES admin_conversas(id) ON DELETE CASCADE,
  aluno_id INTEGER NOT NULL REFERENCES alunos(id),
  direcao VARCHAR NOT NULL CHECK (direcao IN ('entrada', 'saida')),
  tipo VARCHAR DEFAULT 'texto' CHECK (tipo IN ('texto', 'imagem', 'audio', 'video', 'documento', 'sticker', 'sistema')),
  conteudo TEXT,
  midia_url TEXT,
  midia_mimetype VARCHAR,
  midia_nome VARCHAR,
  remetente VARCHAR NOT NULL CHECK (remetente IN ('aluno', 'admin', 'sistema')),
  remetente_nome VARCHAR,
  status_entrega VARCHAR DEFAULT 'enviando' CHECK (status_entrega IN ('enviando', 'enviada', 'entregue', 'lida', 'erro')),
  whatsapp_message_id VARCHAR UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE admin_mensagens IS 'Mensagens das conversas administrativas com alunos';

CREATE INDEX idx_admin_mensagens_conversa ON admin_mensagens(conversa_id, created_at);
CREATE INDEX idx_admin_mensagens_whatsapp_id ON admin_mensagens(whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL;

-- 3. RLS
ALTER TABLE admin_conversas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_conversas_policy" ON admin_conversas FOR ALL
  USING (
    unidade_id IN (
      SELECT u.unidade_id FROM usuarios u WHERE u.email = auth.email()
    )
    OR EXISTS (
      SELECT 1 FROM usuarios u WHERE u.email = auth.email() AND u.perfil = 'admin'
    )
  );

ALTER TABLE admin_mensagens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_mensagens_policy" ON admin_mensagens FOR ALL
  USING (
    conversa_id IN (
      SELECT ac.id FROM admin_conversas ac WHERE ac.unidade_id IN (
        SELECT u.unidade_id FROM usuarios u WHERE u.email = auth.email()
      )
    )
    OR EXISTS (
      SELECT 1 FROM usuarios u WHERE u.email = auth.email() AND u.perfil = 'admin'
    )
  );

-- 4. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE admin_conversas;
ALTER PUBLICATION supabase_realtime ADD TABLE admin_mensagens;

-- 5. Nova permissão
INSERT INTO permissoes (codigo, modulo, acao, descricao, categoria, ordem, ativo)
VALUES ('administrativo.caixa-entrada', 'administrativo', 'visualizar',
  'Acesso à caixa de entrada administrativa', 'Administrativo', 10, true);
