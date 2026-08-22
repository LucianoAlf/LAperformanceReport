-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- =============================================
-- MIGRAÇÃO: Anexos, Comentários e Log de Alterações
-- Data: 2026-01-29
-- Fase 10: Funcionalidades Avançadas de Projetos
-- =============================================

-- ============================================
-- 1. TABELA: projeto_anexos
-- ============================================
CREATE TABLE IF NOT EXISTS projeto_anexos (
  id SERIAL PRIMARY KEY,
  projeto_id INTEGER REFERENCES projetos(id) ON DELETE CASCADE,
  tarefa_id INTEGER REFERENCES projeto_tarefas(id) ON DELETE CASCADE,
  nome VARCHAR(255) NOT NULL,
  nome_original VARCHAR(255) NOT NULL,
  tipo_mime VARCHAR(100) NOT NULL,
  tamanho_bytes INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  url_publica TEXT,
  uploaded_by_tipo VARCHAR(20) NOT NULL CHECK (uploaded_by_tipo IN ('usuario', 'professor')),
  uploaded_by_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Pelo menos um deve ser preenchido
  CONSTRAINT anexo_vinculo_check CHECK (projeto_id IS NOT NULL OR tarefa_id IS NOT NULL)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_anexos_projeto ON projeto_anexos(projeto_id);
CREATE INDEX IF NOT EXISTS idx_anexos_tarefa ON projeto_anexos(tarefa_id);
CREATE INDEX IF NOT EXISTS idx_anexos_created ON projeto_anexos(created_at);

-- RLS
ALTER TABLE projeto_anexos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados podem ver anexos" ON projeto_anexos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Usuários autenticados podem inserir anexos" ON projeto_anexos
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Usuários podem deletar próprios anexos" ON projeto_anexos
  FOR DELETE TO authenticated 
  USING (uploaded_by_tipo = 'usuario');

-- ============================================
-- 2. TABELA: projeto_comentarios
-- ============================================
CREATE TABLE IF NOT EXISTS projeto_comentarios (
  id SERIAL PRIMARY KEY,
  projeto_id INTEGER REFERENCES projetos(id) ON DELETE CASCADE,
  tarefa_id INTEGER REFERENCES projeto_tarefas(id) ON DELETE CASCADE,
  autor_tipo VARCHAR(20) NOT NULL CHECK (autor_tipo IN ('usuario', 'professor')),
  autor_id INTEGER NOT NULL,
  conteudo TEXT NOT NULL,
  editado BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Pelo menos um deve ser preenchido
  CONSTRAINT comentario_vinculo_check CHECK (projeto_id IS NOT NULL OR tarefa_id IS NOT NULL)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_comentarios_projeto ON projeto_comentarios(projeto_id);
CREATE INDEX IF NOT EXISTS idx_comentarios_tarefa ON projeto_comentarios(tarefa_id);
CREATE INDEX IF NOT EXISTS idx_comentarios_created ON projeto_comentarios(created_at);

-- Trigger para updated_at
CREATE TRIGGER update_comentarios_updated_at
  BEFORE UPDATE ON projeto_comentarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE projeto_comentarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados podem ver comentários" ON projeto_comentarios
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Usuários autenticados podem criar comentários" ON projeto_comentarios
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Usuários podem editar próprios comentários" ON projeto_comentarios
  FOR UPDATE TO authenticated 
  USING (autor_tipo = 'usuario');

CREATE POLICY "Usuários podem deletar próprios comentários" ON projeto_comentarios
  FOR DELETE TO authenticated 
  USING (autor_tipo = 'usuario');

-- ============================================
-- 3. TABELA: projeto_log_alteracoes
-- ============================================
CREATE TABLE IF NOT EXISTS projeto_log_alteracoes (
  id SERIAL PRIMARY KEY,
  projeto_id INTEGER REFERENCES projetos(id) ON DELETE SET NULL,
  tarefa_id INTEGER REFERENCES projeto_tarefas(id) ON DELETE SET NULL,
  acao VARCHAR(50) NOT NULL,
  campo_alterado VARCHAR(100),
  valor_anterior TEXT,
  valor_novo TEXT,
  autor_tipo VARCHAR(20) NOT NULL CHECK (autor_tipo IN ('usuario', 'professor', 'sistema')),
  autor_id INTEGER,
  descricao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_log_projeto ON projeto_log_alteracoes(projeto_id);
CREATE INDEX IF NOT EXISTS idx_log_tarefa ON projeto_log_alteracoes(tarefa_id);
CREATE INDEX IF NOT EXISTS idx_log_created ON projeto_log_alteracoes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_log_acao ON projeto_log_alteracoes(acao);

-- RLS
ALTER TABLE projeto_log_alteracoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados podem ver logs" ON projeto_log_alteracoes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Sistema pode inserir logs" ON projeto_log_alteracoes
  FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================
-- 4. STORAGE BUCKET: projeto-anexos
-- ============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'projeto-anexos', 
  'projeto-anexos', 
  true, 
  10485760, -- 10MB
  ARRAY[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'application/pdf',
    'application/msword', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Policies de Storage
CREATE POLICY "Usuários podem fazer upload de anexos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'projeto-anexos');

CREATE POLICY "Anexos de projetos são públicos" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'projeto-anexos');

CREATE POLICY "Usuários podem deletar anexos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'projeto-anexos');

-- ============================================
-- 5. TRIGGERS DE LOG AUTOMÁTICO
-- ============================================

-- Função para log de projetos
CREATE OR REPLACE FUNCTION log_projeto_alteracao()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO projeto_log_alteracoes (projeto_id, acao, descricao, autor_tipo)
    VALUES (NEW.id, 'criado', 'Projeto criado: ' || NEW.nome, 'sistema');
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Log de mudança de status
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO projeto_log_alteracoes (projeto_id, acao, campo_alterado, valor_anterior, valor_novo, autor_tipo, descricao)
      VALUES (NEW.id, 'status_alterado', 'status', OLD.status, NEW.status, 'sistema', 
              'Status alterado de ' || COALESCE(OLD.status, 'vazio') || ' para ' || NEW.status);
    END IF;
    -- Log de mudança de nome
    IF OLD.nome IS DISTINCT FROM NEW.nome THEN
      INSERT INTO projeto_log_alteracoes (projeto_id, acao, campo_alterado, valor_anterior, valor_novo, autor_tipo, descricao)
      VALUES (NEW.id, 'atualizado', 'nome', OLD.nome, NEW.nome, 'sistema',
              'Nome alterado de "' || OLD.nome || '" para "' || NEW.nome || '"');
    END IF;
    -- Log de arquivamento
    IF OLD.arquivado IS DISTINCT FROM NEW.arquivado THEN
      INSERT INTO projeto_log_alteracoes (projeto_id, acao, campo_alterado, valor_anterior, valor_novo, autor_tipo, descricao)
      VALUES (NEW.id, 'atualizado', 'arquivado', OLD.arquivado::text, NEW.arquivado::text, 'sistema',
              CASE WHEN NEW.arquivado THEN 'Projeto arquivado' ELSE 'Projeto desarquivado' END);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Usar BEFORE DELETE para capturar antes da exclusão
    INSERT INTO projeto_log_alteracoes (projeto_id, acao, descricao, autor_tipo)
    VALUES (NULL, 'excluido', 'Projeto excluído: ' || OLD.nome || ' (ID: ' || OLD.id || ')', 'sistema');
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Função para log de tarefas
CREATE OR REPLACE FUNCTION log_tarefa_alteracao()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO projeto_log_alteracoes (projeto_id, tarefa_id, acao, descricao, autor_tipo)
    VALUES (NEW.projeto_id, NEW.id, 'tarefa_criada', 'Tarefa criada: ' || NEW.titulo, 'sistema');
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Log de mudança de status
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO projeto_log_alteracoes (projeto_id, tarefa_id, acao, campo_alterado, valor_anterior, valor_novo, autor_tipo, descricao)
      VALUES (NEW.projeto_id, NEW.id, 'tarefa_status', 'status', OLD.status, NEW.status, 'sistema',
              'Tarefa "' || NEW.titulo || '": status alterado para ' || NEW.status);
    END IF;
    -- Log de conclusão
    IF OLD.status != 'concluida' AND NEW.status = 'concluida' THEN
      INSERT INTO projeto_log_alteracoes (projeto_id, tarefa_id, acao, descricao, autor_tipo)
      VALUES (NEW.projeto_id, NEW.id, 'tarefa_concluida', 'Tarefa concluída: ' || NEW.titulo, 'sistema');
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO projeto_log_alteracoes (projeto_id, tarefa_id, acao, descricao, autor_tipo)
    VALUES (OLD.projeto_id, NULL, 'tarefa_excluida', 'Tarefa excluída: ' || OLD.titulo || ' (ID: ' || OLD.id || ')', 'sistema');
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Triggers para projetos (BEFORE DELETE para capturar dados)
DROP TRIGGER IF EXISTS trigger_log_projeto ON projetos;
CREATE TRIGGER trigger_log_projeto_insert_update
  AFTER INSERT OR UPDATE ON projetos
  FOR EACH ROW EXECUTE FUNCTION log_projeto_alteracao();

CREATE TRIGGER trigger_log_projeto_delete
  BEFORE DELETE ON projetos
  FOR EACH ROW EXECUTE FUNCTION log_projeto_alteracao();

-- Triggers para tarefas
DROP TRIGGER IF EXISTS trigger_log_tarefa ON projeto_tarefas;
CREATE TRIGGER trigger_log_tarefa_insert_update
  AFTER INSERT OR UPDATE ON projeto_tarefas
  FOR EACH ROW EXECUTE FUNCTION log_tarefa_alteracao();

CREATE TRIGGER trigger_log_tarefa_delete
  BEFORE DELETE ON projeto_tarefas
  FOR EACH ROW EXECUTE FUNCTION log_tarefa_alteracao();
