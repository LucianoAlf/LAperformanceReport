# Solução para Vínculo Automático: Lead <-> Aluno

## Contexto
Atualmente, a criação de alunos é feita externamente (pelo n8n ou aplicação), mas o vínculo com o `lead` original não está sendo atualizado na tabela `leads`. Isso gera inconsistência onde temos leads "convertidos" sem o `aluno_id` preenchido.

## Solução Proposta: Trigger de Banco de Dados
Para garantir a consistência dos dados independente da origem da inserção (n8n, API, App), criaremos uma Trigger no banco de dados.

Esta trigger será disparada sempre que um **novo aluno** for inserido na tabela `alunos`. Ela buscará automaticamente um lead correspondente (por telefone, email ou nome normalizado) na mesma unidade e atualizará o campo `aluno_id`.

### Script SQL

```sql
-- 1. Habilita extensão para ignorar acentos na comparação de nomes (se ainda não existir)
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 2. Função que realiza o vínculo
CREATE OR REPLACE FUNCTION public.sync_aluno_to_lead()
RETURNS TRIGGER AS $$
BEGIN
    -- Tenta encontrar e atualizar o lead correspondente
    UPDATE public.leads
    SET 
        aluno_id = NEW.id,
        status = 'convertido', -- Garante que o status esteja atualizado
        converteu = true,
        data_conversao = COALESCE(data_conversao, CURRENT_DATE),
        updated_at = NOW()
    WHERE 
        aluno_id IS NULL -- Apenas se ainda não estiver vinculado
        AND unidade_id = NEW.unidade_id 
        AND (
            -- Tenta casar por Telefone (apenas números, ignorando formatação)
            (telefone IS NOT NULL AND regexp_replace(telefone, '\D','','g') = regexp_replace(NEW.telefone, '\D','','g'))
            OR
            -- Ou por Email (se existir)
            (email IS NOT NULL AND email <> '' AND email = NEW.email)
            OR
            -- Ou por Nome (ignorando acentos e case)
            (nome IS NOT NULL AND unaccent(lower(trim(nome))) = unaccent(lower(trim(NEW.nome))))
        );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Criação do Gatilho (Trigger)
DROP TRIGGER IF EXISTS tr_link_aluno_lead ON public.alunos;

CREATE TRIGGER tr_link_aluno_lead
    AFTER INSERT ON public.alunos
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_aluno_to_lead();
```

### Script para Correção Retroativa (Executar uma vez)

Para corrigir os alunos que já foram criados mas não estão vinculados:

```sql
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT * FROM public.alunos WHERE created_at > (NOW() - INTERVAL '30 days') LOOP
        -- Reutiliza a lógica da query de update
        UPDATE public.leads
        SET 
            aluno_id = r.id,
            status = 'convertido',
            converteu = true,
            updated_at = NOW()
        WHERE 
            aluno_id IS NULL
            AND unidade_id = r.unidade_id 
            AND (
                (telefone IS NOT NULL AND regexp_replace(telefone, '\D','','g') = regexp_replace(r.telefone, '\D','','g'))
                OR
                (email IS NOT NULL AND email <> '' AND email = r.email)
                OR
                (nome IS NOT NULL AND unaccent(lower(trim(nome))) = unaccent(lower(trim(r.nome))))
            );
    END LOOP;
END $$;
```
