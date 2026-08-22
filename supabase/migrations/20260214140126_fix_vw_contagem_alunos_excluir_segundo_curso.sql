-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


CREATE OR REPLACE VIEW vw_contagem_alunos AS
SELECT u.nome AS unidade,
  u.codigo AS unidade_codigo,
  a.classificacao,
  a.status,
  count(*) FILTER (WHERE (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)) AS total,
  count(*) FILTER (WHERE tm.conta_como_pagante = true AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)) AS pagantes,
  round(avg(a.valor_parcela) FILTER (WHERE tm.entra_ticket_medio = true), 2) AS ticket_medio,
  round(avg(a.tempo_permanencia_meses) FILTER (WHERE (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)), 1) AS tempo_medio_meses
FROM alunos a
LEFT JOIN unidades u ON a.unidade_id = u.id
LEFT JOIN tipos_matricula tm ON a.tipo_matricula_id = tm.id
GROUP BY u.nome, u.codigo, a.classificacao, a.status;
