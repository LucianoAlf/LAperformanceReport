-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Criar a função do trigger
CREATE OR REPLACE FUNCTION sync_lead_to_leads_diarios()
RETURNS TRIGGER AS $$
DECLARE
    v_tipo TEXT;
    v_existing_id INTEGER;
BEGIN
    -- Determinar o tipo baseado no status do lead
    CASE NEW.status
        WHEN 'novo' THEN v_tipo := 'lead';
        WHEN 'agendado' THEN v_tipo := 'lead';
        WHEN 'experimental_agendada' THEN v_tipo := 'experimental_agendada';
        WHEN 'experimental_realizada' THEN v_tipo := 'experimental_realizada';
        WHEN 'compareceu' THEN v_tipo := 'experimental_realizada';
        WHEN 'matriculado' THEN v_tipo := 'matricula';
        WHEN 'convertido' THEN v_tipo := 'matricula';
        ELSE v_tipo := 'lead';
    END CASE;

    -- Verificar se já existe um registro em leads_diarios para este lead
    SELECT id INTO v_existing_id
    FROM leads_diarios
    WHERE observacoes LIKE 'lead_id:' || NEW.id::TEXT || '%'
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        -- Atualizar registro existente
        UPDATE leads_diarios
        SET 
            tipo = v_tipo,
            aluno_nome = NEW.nome,
            canal_origem_id = NEW.canal_origem_id,
            curso_id = NEW.curso_interesse_id,
            professor_experimental_id = NEW.professor_experimental_id,
            data = COALESCE(
                CASE 
                    WHEN v_tipo = 'matricula' THEN NEW.data_conversao
                    WHEN v_tipo LIKE 'experimental%' THEN NEW.data_experimental
                    ELSE NEW.data_contato
                END,
                NEW.data_contato
            )::DATE,
            updated_at = NOW()
        WHERE id = v_existing_id;
    ELSE
        -- Inserir novo registro
        INSERT INTO leads_diarios (
            unidade_id,
            data,
            tipo,
            quantidade,
            aluno_nome,
            canal_origem_id,
            curso_id,
            professor_experimental_id,
            observacoes,
            created_at
        ) VALUES (
            NEW.unidade_id,
            NEW.data_contato::DATE,
            v_tipo,
            1,
            NEW.nome,
            NEW.canal_origem_id,
            NEW.curso_interesse_id,
            NEW.professor_experimental_id,
            'lead_id:' || NEW.id::TEXT || ' - Sincronizado do RP-EMUSES',
            NOW()
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar o trigger na tabela leads
DROP TRIGGER IF EXISTS trigger_sync_lead_to_leads_diarios ON leads;

CREATE TRIGGER trigger_sync_lead_to_leads_diarios
    AFTER INSERT OR UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION sync_lead_to_leads_diarios();
