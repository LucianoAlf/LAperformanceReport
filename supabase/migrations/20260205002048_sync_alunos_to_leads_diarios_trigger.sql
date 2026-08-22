-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Criar a função do trigger para sincronizar alunos (matrículas) para leads_diarios
CREATE OR REPLACE FUNCTION sync_aluno_to_leads_diarios()
RETURNS TRIGGER AS $$
DECLARE
    v_existing_id INTEGER;
BEGIN
    -- Só sincronizar se for uma nova matrícula (INSERT) ou mudança de status para ativo
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.status = 'ativo' AND OLD.status != 'ativo') THEN
        
        -- Verificar se já existe um registro em leads_diarios para este aluno
        SELECT id INTO v_existing_id
        FROM leads_diarios
        WHERE observacoes LIKE 'aluno_id:' || NEW.id::TEXT || '%'
        LIMIT 1;

        IF v_existing_id IS NULL THEN
            -- Inserir novo registro de matrícula
            INSERT INTO leads_diarios (
                unidade_id,
                data,
                tipo,
                quantidade,
                aluno_nome,
                curso_id,
                professor_experimental_id,
                valor_passaporte,
                valor_parcela,
                observacoes,
                created_at
            ) VALUES (
                NEW.unidade_id,
                NEW.data_matricula::DATE,
                'matricula',
                1,
                NEW.nome,
                NEW.curso_id,
                NEW.professor_experimental_id,
                NEW.valor_passaporte,
                NEW.valor_parcela,
                'aluno_id:' || NEW.id::TEXT || ' - Sincronizado do RP-EMUSES',
                NOW()
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar o trigger na tabela alunos
DROP TRIGGER IF EXISTS trigger_sync_aluno_to_leads_diarios ON alunos;

CREATE TRIGGER trigger_sync_aluno_to_leads_diarios
    AFTER INSERT OR UPDATE ON alunos
    FOR EACH ROW
    EXECUTE FUNCTION sync_aluno_to_leads_diarios();
