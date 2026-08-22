-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Drop views que dependem de dados_mensais.tempo_permanencia
DROP VIEW IF EXISTS vw_consolidado_anual;
DROP VIEW IF EXISTS vw_unidade_anual;
DROP VIEW IF EXISTS vw_ranking_unidades;

-- Alterar coluna de INTEGER para NUMERIC(5,1)
ALTER TABLE dados_mensais
  ALTER COLUMN tempo_permanencia TYPE NUMERIC(5,1);

-- Recriar vw_consolidado_anual
CREATE OR REPLACE VIEW vw_consolidado_anual AS
SELECT ano,
    sum(CASE WHEN mes = 12 THEN alunos_pagantes ELSE 0 END) AS alunos_dezembro,
    sum(novas_matriculas) AS total_matriculas,
    sum(evasoes) AS total_evasoes,
    round(avg(churn_rate), 2) AS churn_medio,
    round(avg(ticket_medio), 2) AS ticket_medio,
    round(avg(taxa_renovacao), 2) AS renovacao_media,
    round(avg(tempo_permanencia), 1) AS permanencia_media,
    round(avg(inadimplencia), 2) AS inadimplencia_media,
    sum(faturamento_estimado) AS faturamento_total
FROM dados_mensais
GROUP BY ano
ORDER BY ano;

-- Recriar vw_unidade_anual
CREATE OR REPLACE VIEW vw_unidade_anual AS
SELECT u.nome AS unidade,
    u.codigo,
    d.ano,
    max(CASE WHEN d.mes = 12 THEN d.alunos_pagantes ELSE 0 END) AS alunos_dezembro,
    max(CASE WHEN d.mes = 1 THEN d.alunos_pagantes ELSE 0 END) AS alunos_janeiro,
    sum(d.novas_matriculas) AS total_matriculas,
    sum(d.evasoes) AS total_evasoes,
    round(avg(d.churn_rate), 2) AS churn_medio,
    round(avg(d.ticket_medio), 2) AS ticket_medio,
    round(avg(d.taxa_renovacao), 2) AS renovacao_media,
    max(d.tempo_permanencia) AS permanencia_atual,
    round(avg(d.inadimplencia), 2) AS inadimplencia_media
FROM dados_mensais d
JOIN unidades u ON d.unidade_id = u.id
GROUP BY u.nome, u.codigo, d.ano
ORDER BY d.ano, u.nome;

-- Recriar vw_ranking_unidades
CREATE OR REPLACE VIEW vw_ranking_unidades AS
SELECT u.nome AS unidade,
    u.codigo,
    d.ano,
    max(CASE WHEN d.mes = 12 THEN d.alunos_pagantes ELSE 0 END) AS alunos_dezembro,
    round(avg(d.churn_rate), 2) AS churn_medio,
    round(avg(d.taxa_renovacao), 2) AS renovacao_media,
    round(avg(d.inadimplencia), 2) AS inadimplencia_media,
    round(avg(d.ticket_medio), 2) AS ticket_medio,
    max(d.tempo_permanencia) AS permanencia
FROM dados_mensais d
JOIN unidades u ON d.unidade_id = u.id
GROUP BY u.nome, u.codigo, d.ano
ORDER BY d.ano DESC, max(CASE WHEN d.mes = 12 THEN d.alunos_pagantes ELSE 0 END) DESC;
