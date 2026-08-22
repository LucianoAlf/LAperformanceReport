-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- ============================================
-- FUNÇÃO PARA REGISTRAR MOVIMENTAÇÃO (COM AJUSTES)
-- ============================================

CREATE OR REPLACE FUNCTION registrar_movimentacao(
    p_aluno_id INTEGER,
    p_unidade_id UUID,
    p_tipo VARCHAR(50),
    p_curso_id INTEGER DEFAULT NULL,
    p_professor_id INTEGER DEFAULT NULL,
    p_motivo_saida_id INTEGER DEFAULT NULL,
    p_tipo_saida_id INTEGER DEFAULT NULL,
    p_canal_origem_id INTEGER DEFAULT NULL,
    p_valor_mensalidade NUMERIC DEFAULT NULL,
    p_observacoes TEXT DEFAULT NULL,
    p_created_by VARCHAR DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    v_id INTEGER;
BEGIN
    -- Validar tipo de movimentação
    IF p_tipo NOT IN ('matricula', 'renovacao', 'evasao', 'transferencia', 'troca_curso', 'troca_professor') THEN
        RAISE EXCEPTION 'Tipo de movimentação inválido: %. Tipos válidos: matricula, renovacao, evasao, transferencia, troca_curso, troca_professor', p_tipo;
    END IF;

    -- Inserir movimentação
    INSERT INTO movimentacoes (
        aluno_id, unidade_id, tipo, curso_id, professor_id,
        motivo_saida_id, tipo_saida_id, canal_origem_id,
        valor_mensalidade, observacoes, created_by,
        data_movimentacao, data_referencia
    ) VALUES (
        p_aluno_id, p_unidade_id, p_tipo, p_curso_id, p_professor_id,
        p_motivo_saida_id, p_tipo_saida_id, p_canal_origem_id,
        p_valor_mensalidade, p_observacoes, p_created_by,
        CURRENT_DATE, DATE_TRUNC('month', CURRENT_DATE)
    ) RETURNING id INTO v_id;
    
    -- Se for evasão, atualizar status do aluno (AJUSTE: inclui is_ex_aluno e data_saida)
    IF p_tipo = 'evasao' AND p_aluno_id IS NOT NULL THEN
        UPDATE alunos 
        SET 
            status = 'inativo', 
            is_ex_aluno = true,
            data_saida = CURRENT_DATE,
            motivo_saida_id = p_motivo_saida_id,
            tipo_saida_id = p_tipo_saida_id,
            updated_at = NOW() 
        WHERE id = p_aluno_id;
    END IF;
    
    -- Se for matrícula, garantir que aluno está ativo
    IF p_tipo = 'matricula' AND p_aluno_id IS NOT NULL THEN
        UPDATE alunos 
        SET 
            status = 'ativo', 
            is_ex_aluno = false,
            data_saida = NULL,
            updated_at = NOW() 
        WHERE id = p_aluno_id;
    END IF;
    
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION registrar_movimentacao IS 'Registra uma movimentação e atualiza automaticamente o status do aluno. Em evasão: marca como inativo, is_ex_aluno=true e preenche data_saida. Em matrícula: marca como ativo.';
