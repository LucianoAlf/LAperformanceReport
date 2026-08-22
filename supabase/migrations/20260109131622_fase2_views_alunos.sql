-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- 5. VIEWS

-- View: Alunos ativos com dados completos
CREATE OR REPLACE VIEW vw_alunos_ativos AS
SELECT 
  a.id,
  a.nome,
  a.classificacao,
  a.idade_atual,
  u.nome as unidade,
  u.codigo as unidade_codigo,
  p.nome as professor,
  c.nome as curso,
  tm.nome as tipo_matricula,
  tm.entra_ticket_medio,
  tm.conta_como_pagante,
  a.valor_parcela,
  a.tempo_permanencia_meses,
  a.data_matricula,
  a.data_fim_contrato,
  a.status
FROM alunos a
LEFT JOIN unidades u ON a.unidade_id = u.id
LEFT JOIN professores p ON a.professor_atual_id = p.id
LEFT JOIN cursos c ON a.curso_id = c.id
LEFT JOIN tipos_matricula tm ON a.tipo_matricula_id = tm.id
WHERE a.status = 'ativo';

-- View: Contagem por unidade e classificação
CREATE OR REPLACE VIEW vw_contagem_alunos AS
SELECT 
  u.nome as unidade,
  u.codigo as unidade_codigo,
  a.classificacao,
  a.status,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE tm.conta_como_pagante = true) as pagantes,
  ROUND(AVG(a.valor_parcela) FILTER (WHERE tm.entra_ticket_medio = true), 2) as ticket_medio,
  ROUND(AVG(a.tempo_permanencia_meses), 1) as tempo_medio_meses
FROM alunos a
LEFT JOIN unidades u ON a.unidade_id = u.id
LEFT JOIN tipos_matricula tm ON a.tipo_matricula_id = tm.id
GROUP BY u.nome, u.codigo, a.classificacao, a.status;

-- View: LTV por unidade (apenas alunos que já saíram)
CREATE OR REPLACE VIEW vw_ltv_unidade AS
SELECT 
  u.nome as unidade,
  u.codigo as unidade_codigo,
  COUNT(*) as total_alunos_saidos,
  ROUND(AVG(a.tempo_permanencia_meses), 1) as tempo_medio_meses,
  ROUND(AVG(a.valor_parcela) FILTER (WHERE tm.entra_ticket_medio = true), 2) as ticket_medio,
  ROUND(AVG(a.tempo_permanencia_meses * a.valor_parcela) FILTER (WHERE tm.entra_ticket_medio = true), 2) as ltv_medio
FROM alunos a
LEFT JOIN unidades u ON a.unidade_id = u.id
LEFT JOIN tipos_matricula tm ON a.tipo_matricula_id = tm.id
WHERE a.data_saida IS NOT NULL
GROUP BY u.nome, u.codigo;
