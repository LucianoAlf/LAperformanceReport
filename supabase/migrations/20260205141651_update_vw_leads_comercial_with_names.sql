-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Atualiza a view vw_leads_comercial para incluir nomes das tabelas relacionadas
-- Isso evita a necessidade de JOINs no frontend via PostgREST

DROP VIEW IF EXISTS vw_leads_comercial;

CREATE OR REPLACE VIEW vw_leads_comercial AS
SELECT 
    l.id,
    l.unidade_id,
    l.data_contato AS data,
    CASE l.status
        WHEN 'novo' THEN 'lead'
        WHEN 'em_contato' THEN 'lead'
        WHEN 'agendado' THEN 'experimental_agendada'
        WHEN 'realizado' THEN 'experimental_realizada'
        WHEN 'convertido' THEN 'matricula'
        WHEN 'arquivado' THEN 'lead'
        WHEN 'perdido' THEN 'lead'
        ELSE 'lead'
    END AS tipo,
    l.canal_origem_id,
    l.curso_interesse_id AS curso_id,
    1 AS quantidade,
    l.observacoes,
    l.nome AS aluno_nome,
    l.idade AS aluno_idade,
    l.professor_experimental_id,
    NULL::INTEGER AS professor_fixo_id,
    l.agente_comercial,
    NULL::NUMERIC AS valor_passaporte,
    NULL::NUMERIC AS valor_parcela,
    NULL::INTEGER AS forma_pagamento_id,
    NULL::VARCHAR AS tipo_matricula,
    CASE WHEN l.aluno_id IS NOT NULL THEN 'retorno' ELSE 'novo' END AS aluno_novo_retorno,
    l.created_at,
    l.updated_at,
    l.created_by,
    CASE WHEN l.status = 'arquivado' THEN TRUE ELSE FALSE END AS arquivado,
    NULL::DATE AS data_arquivamento,
    NULL::INTEGER AS motivo_arquivamento_id,
    NULL::INTEGER AS motivo_nao_matricula_id,
    NULL::INTEGER AS forma_pagamento_passaporte_id,
    NULL::INTEGER AS dia_vencimento,
    'pagante'::VARCHAR AS tipo_aluno,
    NULL::BOOLEAN AS sabia_preco,
    l.status AS lead_status,
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
    l.data_ultimo_contato,
    -- Campos de nomes resolvidos (evita JOINs no frontend)
    co.nome AS canal_origem_nome,
    c.nome AS curso_nome,
    pe.nome AS professor_experimental_nome,
    u.codigo AS unidade_codigo,
    u.nome AS unidade_nome,
    l.motivo_arquivamento AS motivo_arquivamento_texto  -- Usando o campo de texto da tabela leads
FROM leads l
LEFT JOIN canais_origem co ON l.canal_origem_id = co.id
LEFT JOIN cursos c ON l.curso_interesse_id = c.id
LEFT JOIN professores pe ON l.professor_experimental_id = pe.id
LEFT JOIN unidades u ON l.unidade_id = u.id
WHERE l.status <> 'convertido' OR l.status IS NULL;

-- Comentário explicativo
COMMENT ON VIEW vw_leads_comercial IS 'View de compatibilidade que emula a estrutura de leads_diarios. Inclui campos resolvidos (nomes) para evitar JOINs via PostgREST.';
