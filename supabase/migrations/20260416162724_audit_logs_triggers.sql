-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- =============================================================
-- AUDIT LOGS: Trigger genérico para rastrear ações dos usuários
-- =============================================================

-- 1. Expandir tabela audit_log existente
ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS auth_user_id UUID,
  ADD COLUMN IF NOT EXISTS origem TEXT DEFAULT 'system';

-- Garantir que registro_id é TEXT (para cobrir UUID e integer)
-- A coluna já existe como UUID, vamos adicionar uma coluna TEXT separada
ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS registro_id_text TEXT;

-- 2. Criar função trigger genérica
CREATE OR REPLACE FUNCTION fn_audit_log() RETURNS trigger AS $$
DECLARE
  v_auth_uid UUID;
  v_usuario TEXT;
  v_origem TEXT;
  v_old JSONB;
  v_new JSONB;
  v_reg_id TEXT;
BEGIN
  -- Capturar usuário do JWT (null se ação automática/system)
  BEGIN
    v_auth_uid := (current_setting('request.jwt.claims', true)::jsonb->>'sub')::uuid;
    v_usuario := current_setting('request.jwt.claims', true)::jsonb->>'email';
  EXCEPTION WHEN OTHERS THEN
    v_auth_uid := NULL;
    v_usuario := NULL;
  END;

  -- Classificar origem
  v_origem := CASE WHEN v_auth_uid IS NOT NULL THEN 'manual' ELSE 'system' END;

  -- Dados antigos/novos
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old := to_jsonb(OLD);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new := to_jsonb(NEW);
  END IF;

  -- ID do registro
  v_reg_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.id::text
    ELSE NEW.id::text
  END;

  -- Inserir log (ignorar erros para não bloquear a operação original)
  BEGIN
    INSERT INTO audit_log (id, tabela, registro_id_text, acao, dados_antigos, dados_novos, usuario, auth_user_id, origem, created_at)
    VALUES (
      gen_random_uuid(),
      TG_TABLE_NAME,
      v_reg_id,
      TG_OP,
      v_old,
      v_new,
      COALESCE(v_usuario, 'system'),
      v_auth_uid,
      v_origem,
      NOW()
    );
  EXCEPTION WHEN OTHERS THEN
    -- Log falhou — não bloquear a operação original
    RAISE WARNING '[audit_log] Falha ao registrar: %', SQLERRM;
  END;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Aplicar triggers nas 22 tabelas
-- Remover triggers antigos se existirem (evitar duplicatas)
DO $$
DECLARE
  tabelas TEXT[] := ARRAY[
    'alunos', 'leads', 'lead_experimentais', 'movimentacoes_admin', 'renovacoes',
    'professores', 'professor_acoes', 'professor_360_avaliacoes', 'professor_360_ocorrencias',
    'turmas_explicitas', 'turmas_alunos', 'salas', 'cursos', 'unidades',
    'dados_mensais', 'metas', 'metas_kpi', 'loja_produtos',
    'projetos', 'projeto_tarefas', 'config_health_score_professor', 'crm_pipeline_etapas'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION fn_audit_log()',
      t
    );
  END LOOP;
END $$;

-- 4. Índices para performance
CREATE INDEX IF NOT EXISTS idx_audit_log_tabela_created ON audit_log (tabela, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_auth_user ON audit_log (auth_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_origem ON audit_log (origem, created_at DESC);

-- 5. pg_cron: limpeza semanal (domingo 3h BRT = 6h UTC)
SELECT cron.schedule(
  'cleanup-audit-log',
  '0 6 * * 0',
  $$DELETE FROM audit_log WHERE created_at < NOW() - interval '90 days'$$
);
