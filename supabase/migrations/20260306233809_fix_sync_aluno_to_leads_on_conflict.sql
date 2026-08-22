-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

CREATE OR REPLACE FUNCTION sync_aluno_to_leads()
RETURNS TRIGGER AS $$
DECLARE
    v_lead_id INTEGER;
BEGIN
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.status = 'ativo' AND OLD.status != 'ativo') THEN

        -- Tenta encontrar lead existente
        SELECT id INTO v_lead_id
        FROM public.leads
        WHERE
            aluno_id IS NULL
            AND unidade_id = NEW.unidade_id
            AND (
                (telefone IS NOT NULL AND regexp_replace(telefone, '\D','','g') = regexp_replace(COALESCE(NEW.telefone, ''), '\D','','g') AND NEW.telefone IS NOT NULL)
                OR
                (email IS NOT NULL AND email <> '' AND email = NEW.email AND NEW.email IS NOT NULL)
                OR
                (nome IS NOT NULL AND unaccent(lower(trim(nome))) = unaccent(lower(trim(NEW.nome))))
            )
        ORDER BY
            CASE WHEN status = 'convertido' THEN 1 ELSE 2 END,
            created_at DESC
        LIMIT 1;

        IF v_lead_id IS NOT NULL THEN
            -- Lead encontrado: vincular
            UPDATE public.leads
            SET
                aluno_id = NEW.id,
                status = 'convertido',
                converteu = true,
                data_conversao = COALESCE(data_conversao, NEW.data_matricula::DATE, CURRENT_DATE),
                curso_interesse_id = COALESCE(NEW.curso_id, curso_interesse_id),
                updated_at = NOW()
            WHERE id = v_lead_id;
        ELSE
            -- Nenhum lead encontrado: criar lead organico
            -- ON CONFLICT para evitar erro quando telefone+unidade ja existe (ex: familiares com mesmo telefone)
            INSERT INTO public.leads (
                unidade_id, data_contato, status, converteu, data_conversao,
                nome, telefone, email, aluno_id,
                curso_interesse_id, professor_experimental_id,
                valor_passaporte, valor_parcela,
                tipo_aluno, observacoes, created_at
            ) VALUES (
                NEW.unidade_id,
                COALESCE(NEW.data_matricula::DATE, CURRENT_DATE),
                'convertido', true,
                COALESCE(NEW.data_matricula::DATE, CURRENT_DATE),
                NEW.nome, NEW.telefone, NEW.email, NEW.id,
                NEW.curso_id, NEW.professor_experimental_id,
                NEW.valor_passaporte, NEW.valor_parcela,
                CASE
                    WHEN NEW.is_segundo_curso THEN 'segundo_curso'
                    WHEN NEW.tipo_matricula_id IN (3,4,5) THEN 'bolsista'
                    ELSE 'pagante'
                END,
                'Lead organico - nenhum lead encontrado para vincular com o aluno',
                NOW()
            )
            ON CONFLICT ON CONSTRAINT idx_leads_telefone_unidade_unique DO NOTHING;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
