-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- 1. Expandir respondido_por para incluir 'emusys'
ALTER TABLE aluno_presenca DROP CONSTRAINT IF EXISTS aluno_presenca_respondido_por_check;
ALTER TABLE aluno_presenca ADD CONSTRAINT aluno_presenca_respondido_por_check
  CHECK (respondido_por IN ('professor_whatsapp', 'manual', 'sistema', 'emusys'));

-- 2. Tabela de log de sincronização
CREATE TABLE IF NOT EXISTS emusys_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id UUID REFERENCES unidades(id),
  unidade_nome TEXT,
  data_sync DATE NOT NULL,
  total_aulas INTEGER DEFAULT 0,
  total_registros INTEGER DEFAULT 0,
  presentes INTEGER DEFAULT 0,
  ausentes INTEGER DEFAULT 0,
  alunos_matched INTEGER DEFAULT 0,
  alunos_nao_encontrados INTEGER DEFAULT 0,
  nomes_nao_encontrados JSONB DEFAULT '[]',
  executado_em TIMESTAMPTZ DEFAULT now()
);

-- 3. RPC: recalcular percentual_presenca (janela de 3 meses)
CREATE OR REPLACE FUNCTION atualizar_percentual_presenca(p_unidade_id UUID DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE v_count INTEGER;
BEGIN
  UPDATE alunos a SET percentual_presenca = sub.pct, updated_at = now()
  FROM (
    SELECT aluno_id,
      ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'presente')
        / NULLIF(COUNT(*), 0))::INTEGER as pct
    FROM aluno_presenca
    WHERE data_aula >= CURRENT_DATE - 90
      AND status IN ('presente', 'ausente')
      AND (p_unidade_id IS NULL OR unidade_id = p_unidade_id)
    GROUP BY aluno_id
  ) sub WHERE a.id = sub.aluno_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
