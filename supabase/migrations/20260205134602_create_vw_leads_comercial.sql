-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- =====================================================
-- MIGRAÇÃO: Criar view de compatibilidade para leads
-- Esta view emula a estrutura de leads_diarios usando dados de leads
-- =====================================================

-- Criar view que mapeia leads para o formato esperado pelo frontend comercial
CREATE OR REPLACE VIEW vw_leads_comercial AS
SELECT 
    l.id,
    l.unidade_id,
    l.data_contato::DATE as data,
    -- Mapear status para tipo (compatibilidade com leads_diarios)
    CASE l.status
        WHEN 'novo' THEN 'lead'
        WHEN 'em_contato' THEN 'lead'
        WHEN 'agendado' THEN 'experimental_agendada'
        WHEN 'realizado' THEN 'experimental_realizada'
        WHEN 'convertido' THEN 'matricula'
        WHEN 'arquivado' THEN 'lead'
        WHEN 'perdido' THEN 'lead'
        ELSE 'lead'
    END as tipo,
    l.canal_origem_id,
    l.curso_interesse_id as curso_id,
    1 as quantidade, -- Sempre 1 pois são registros individuais
    l.observacoes,
    l.nome as aluno_nome,
    l.idade as aluno_idade,
    l.professor_experimental_id,
    NULL::INTEGER as professor_fixo_id,
    l.agente_comercial,
    NULL::NUMERIC as valor_passaporte,
    NULL::NUMERIC as valor_parcela,
    NULL::INTEGER as forma_pagamento_id,
    NULL::VARCHAR as tipo_matricula,
    CASE 
        WHEN l.aluno_id IS NOT NULL THEN 'retorno'
        ELSE 'novo'
    END as aluno_novo_retorno,
    l.created_at,
    l.updated_at,
    l.created_by,
    CASE 
        WHEN l.status = 'arquivado' THEN true
        ELSE false
    END as arquivado,
    NULL::DATE as data_arquivamento,
    NULL::INTEGER as motivo_arquivamento_id,
    NULL::INTEGER as motivo_nao_matricula_id,
    NULL::INTEGER as forma_pagamento_passaporte_id,
    NULL::INTEGER as dia_vencimento,
    'pagante'::VARCHAR as tipo_aluno,
    NULL::BOOLEAN as sabia_preco,
    -- Campos extras úteis da tabela leads
    l.status as lead_status,
    l.telefone,
    l.whatsapp,
    l.email,
    l.experimental_agendada,
    l.data_experimental,
    l.horario_experimental,
    l.experimental_realizada,
    l.faltou_experimental,
    l.converteu,
    l.data_conversao,
    l.aluno_id,
    l.motivo_nao_matricula,
    l.data_primeiro_contato,
    l.data_ultimo_contato
FROM leads l
WHERE l.status != 'convertido' OR l.status IS NULL;  -- Exclui convertidos do comercial (já são alunos)

-- Comentário na view
COMMENT ON VIEW vw_leads_comercial IS 'View de compatibilidade que emula leads_diarios usando dados da tabela leads. Criada para migração gradual do frontend.';

-- Garantir que RLS funcione na view (herda da tabela leads)
-- Views no Supabase respeitam RLS da tabela base automaticamente
