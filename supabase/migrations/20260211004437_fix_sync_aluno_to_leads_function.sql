-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Habilita extensão para ignorar acentos na comparação de nomes (se ainda não existir)
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Substitui a função sync_aluno_to_leads com a lógica correta
CREATE OR REPLACE FUNCTION public.sync_aluno_to_leads()
RETURNS TRIGGER AS $$
BEGIN
    -- Apenas processa INSERT ou quando status muda para 'ativo'
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.status = 'ativo' AND OLD.status != 'ativo') THEN
        
        -- Tenta encontrar e atualizar o lead correspondente
        -- Prioriza leads com status 'convertido', depois outros status
        UPDATE public.leads
        SET 
            aluno_id = NEW.id,
            status = 'convertido',
            converteu = true,
            data_conversao = COALESCE(data_conversao, NEW.data_matricula::DATE, CURRENT_DATE),
            updated_at = NOW()
        WHERE 
            id = (
                SELECT id 
                FROM public.leads
                WHERE 
                    aluno_id IS NULL -- Apenas se ainda não estiver vinculado
                    AND unidade_id = NEW.unidade_id 
                    AND (
                        -- Tenta casar por Telefone (apenas números, ignorando formatação)
                        (telefone IS NOT NULL AND regexp_replace(telefone, '\D','','g') = regexp_replace(COALESCE(NEW.telefone, ''), '\D','','g') AND NEW.telefone IS NOT NULL)
                        OR
                        -- Ou por Email (se existir)
                        (email IS NOT NULL AND email <> '' AND email = NEW.email AND NEW.email IS NOT NULL)
                        OR
                        -- Ou por Nome (ignorando acentos e case)
                        (nome IS NOT NULL AND unaccent(lower(trim(nome))) = unaccent(lower(trim(NEW.nome))))
                    )
                ORDER BY 
                    -- Prioriza leads convertidos
                    CASE WHEN status = 'convertido' THEN 1 ELSE 2 END,
                    -- Depois os mais recentes
                    created_at DESC
                LIMIT 1
            );
        
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
