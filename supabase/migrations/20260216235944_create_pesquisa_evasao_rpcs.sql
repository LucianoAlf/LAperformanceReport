-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- RPC para listar evadidos disponíveis para pesquisa
CREATE OR REPLACE FUNCTION listar_evadidos_para_pesquisa(
  p_unidade_id UUID DEFAULT NULL,
  p_limite INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_status VARCHAR(30) DEFAULT NULL  -- filtro opcional por status da pesquisa
)
RETURNS TABLE (
  evasao_id INTEGER,
  aluno_id INTEGER,
  nome TEXT,
  telefone TEXT,
  curso TEXT,
  professor TEXT,
  tempo_meses INTEGER,
  data_evasao DATE,
  motivo_cadastrado TEXT,
  pesquisa_status TEXT,
  pesquisa_id UUID,
  resposta_texto TEXT,
  respondido_em TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id AS evasao_id,
    e.aluno_id,
    e.aluno_nome AS nome,
    COALESCE(e.telefone_snapshot, a.whatsapp, a.telefone) AS telefone,
    c.nome AS curso,
    p.nome AS professor,
    COALESCE(a.tempo_permanencia_meses, 0) AS tempo_meses,
    e.data_evasao,
    ms.nome AS motivo_cadastrado,
    COALESCE(pe.status, 'pendente')::TEXT AS pesquisa_status,
    pe.id AS pesquisa_id,
    pe.resposta_texto,
    pe.respondido_em
  FROM evasoes_v2 e
  LEFT JOIN alunos a ON a.id = e.aluno_id
  LEFT JOIN cursos c ON c.id = COALESCE(e.curso_id, a.curso_id)
  LEFT JOIN professores p ON p.id = COALESCE(e.professor_id, a.professor_atual_id)
  LEFT JOIN motivos_saida ms ON ms.id = e.motivo_saida_id
  LEFT JOIN pesquisa_evasao pe ON pe.evasao_id = e.id
  WHERE e.tipo_saida_id IN (1, 2)  -- Só Interrompido e Não Renovou
    AND (p_unidade_id IS NULL OR e.unidade_id = p_unidade_id)
    AND COALESCE(e.telefone_snapshot, a.whatsapp, a.telefone) IS NOT NULL
    AND (p_status IS NULL OR COALESCE(pe.status, 'pendente') = p_status)
  ORDER BY 
    CASE COALESCE(pe.status, 'pendente')
      WHEN 'pendente' THEN 1
      WHEN 'enviado' THEN 2
      WHEN 'respondido' THEN 3
      ELSE 4
    END,
    e.data_evasao DESC
  LIMIT p_limite OFFSET p_offset;
END;
$$;

-- RPC para estatísticas da pesquisa de evasão
CREATE OR REPLACE FUNCTION stats_pesquisa_evasao(
  p_unidade_id UUID DEFAULT NULL,
  p_ano INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
  p_mes INTEGER DEFAULT EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER
)
RETURNS TABLE (
  total_evadidos BIGINT,
  total_com_telefone BIGINT,
  total_pendentes BIGINT,
  total_enviados BIGINT,
  total_respondidos BIGINT,
  total_falhas BIGINT,
  taxa_resposta NUMERIC,
  respondidos_texto BIGINT,
  respondidos_audio BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH evadidos_mes AS (
    SELECT e.*
    FROM evasoes_v2 e
    WHERE e.tipo_saida_id IN (1, 2)
      AND EXTRACT(YEAR FROM e.data_evasao) = p_ano
      AND EXTRACT(MONTH FROM e.data_evasao) = p_mes
      AND (p_unidade_id IS NULL OR e.unidade_id = p_unidade_id)
  ),
  stats AS (
    SELECT 
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE telefone_snapshot IS NOT NULL) AS com_telefone,
      COUNT(*) FILTER (WHERE pe.status = 'pendente' OR pe.id IS NULL) AS pendentes,
      COUNT(*) FILTER (WHERE pe.status = 'enviado') AS enviados,
      COUNT(*) FILTER (WHERE pe.status = 'respondido') AS respondidos,
      COUNT(*) FILTER (WHERE pe.status IN ('falha_envio', 'sem_whatsapp')) AS falhas,
      COUNT(*) FILTER (WHERE pe.status = 'respondido' AND pe.resposta_tipo = 'texto') AS resp_texto,
      COUNT(*) FILTER (WHERE pe.status = 'respondido' AND pe.resposta_tipo = 'audio') AS resp_audio
    FROM evadidos_mes em
    LEFT JOIN pesquisa_evasao pe ON pe.evasao_id = em.id
  )
  SELECT 
    s.total AS total_evadidos,
    s.com_telefone AS total_com_telefone,
    s.pendentes AS total_pendentes,
    s.enviados AS total_enviados,
    s.respondidos AS total_respondidos,
    s.falhas AS total_falhas,
    CASE 
      WHEN (s.enviados + s.respondidos) > 0 
      THEN ROUND(s.respondidos::numeric / (s.enviados + s.respondidos) * 100, 1)
      ELSE 0 
    END AS taxa_resposta,
    s.resp_texto AS respondidos_texto,
    s.resp_audio AS respondidos_audio
  FROM stats s;
END;
$$;

-- RPC para criar registro de pesquisa (chamado antes do envio)
CREATE OR REPLACE FUNCTION criar_pesquisa_evasao(
  p_evasao_id INTEGER,
  p_criado_por TEXT DEFAULT 'sistema'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_pesquisa_id UUID;
  v_evasao RECORD;
BEGIN
  -- Buscar dados da evasão
  SELECT 
    e.id,
    e.aluno_id,
    e.unidade_id,
    e.aluno_nome,
    e.telefone_snapshot,
    e.data_evasao,
    ms.nome as motivo,
    c.nome as curso,
    p.nome as professor,
    COALESCE(a.tempo_permanencia_meses, 0) as tempo_meses
  INTO v_evasao
  FROM evasoes_v2 e
  LEFT JOIN alunos a ON a.id = e.aluno_id
  LEFT JOIN cursos c ON c.id = COALESCE(e.curso_id, a.curso_id)
  LEFT JOIN professores p ON p.id = COALESCE(e.professor_id, a.professor_atual_id)
  LEFT JOIN motivos_saida ms ON ms.id = e.motivo_saida_id
  WHERE e.id = p_evasao_id;
  
  IF v_evasao.id IS NULL THEN
    RAISE EXCEPTION 'Evasão não encontrada: %', p_evasao_id;
  END IF;
  
  IF v_evasao.telefone_snapshot IS NULL THEN
    RAISE EXCEPTION 'Evasão sem telefone: %', p_evasao_id;
  END IF;
  
  -- Inserir ou retornar existente
  INSERT INTO pesquisa_evasao (
    evasao_id, aluno_id, unidade_id,
    aluno_nome, aluno_telefone, aluno_curso, aluno_professor,
    tempo_permanencia_meses, data_evasao, motivo_cadastrado,
    status, enviado_em, enviado_por
  ) VALUES (
    v_evasao.id, v_evasao.aluno_id, v_evasao.unidade_id,
    v_evasao.aluno_nome, v_evasao.telefone_snapshot, v_evasao.curso, v_evasao.professor,
    v_evasao.tempo_meses, v_evasao.data_evasao, v_evasao.motivo,
    'enviado', now(), p_criado_por
  )
  ON CONFLICT (evasao_id) DO UPDATE SET
    status = 'enviado',
    enviado_em = now(),
    enviado_por = p_criado_por,
    updated_at = now()
  RETURNING id INTO v_pesquisa_id;
  
  RETURN v_pesquisa_id;
END;
$$;

-- Adicionar UNIQUE constraint para evasao_id
ALTER TABLE pesquisa_evasao 
ADD CONSTRAINT pesquisa_evasao_evasao_id_unique 
UNIQUE (evasao_id);
