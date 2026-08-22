-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- 1. View de aniversariantes (com fallback telefone)
CREATE VIEW vw_farmer_aniversariantes_hoje AS
SELECT 
  a.id AS aluno_id,
  a.nome AS aluno_nome,
  COALESCE(a.whatsapp, a.telefone) AS whatsapp,
  a.data_nascimento,
  a.unidade_id,
  EXTRACT(year FROM age(a.data_nascimento::timestamp with time zone))::integer AS idade,
  p.id AS professor_id,
  p.nome AS professor_nome,
  c.nome AS instrumento
FROM alunos a
LEFT JOIN professores p ON a.professor_atual_id = p.id
LEFT JOIN cursos c ON a.curso_id = c.id
WHERE EXTRACT(month FROM a.data_nascimento) = EXTRACT(month FROM CURRENT_DATE)
  AND EXTRACT(day FROM a.data_nascimento) = EXTRACT(day FROM CURRENT_DATE)
  AND a.status = 'ativo';

-- 2. View de novos matriculados (com fallback telefone)
CREATE VIEW vw_farmer_novos_matriculados AS
SELECT 
  a.id AS aluno_id,
  a.nome AS aluno_nome,
  COALESCE(a.whatsapp, a.telefone) AS whatsapp,
  a.unidade_id,
  a.data_matricula,
  a.valor_parcela,
  p.id AS professor_id,
  p.nome AS professor_nome,
  c.nome AS instrumento,
  a.dia_aula,
  a.horario_aula
FROM alunos a
LEFT JOIN professores p ON a.professor_atual_id = p.id
LEFT JOIN cursos c ON a.curso_id = c.id
WHERE a.data_matricula >= (CURRENT_DATE - interval '7 days')
  AND a.status = 'ativo';

-- 3. View de inadimplentes (com fallback telefone)
CREATE VIEW vw_farmer_inadimplentes AS
SELECT 
  a.id AS aluno_id,
  a.nome AS aluno_nome,
  COALESCE(a.whatsapp, a.telefone) AS whatsapp,
  a.unidade_id,
  a.valor_parcela,
  a.status_pagamento,
  p.id AS professor_id,
  p.nome AS professor_nome,
  c.nome AS instrumento,
  0 AS dias_atraso
FROM alunos a
LEFT JOIN professores p ON a.professor_atual_id = p.id
LEFT JOIN cursos c ON a.curso_id = c.id
WHERE a.status_pagamento = 'inadimplente'
  AND a.status = 'ativo';

-- 4. View de renovações próximas (com fallback telefone)
CREATE VIEW vw_farmer_renovacoes_proximas AS
SELECT 
  a.id AS aluno_id,
  a.nome AS aluno_nome,
  COALESCE(a.whatsapp, a.telefone) AS whatsapp,
  a.unidade_id,
  a.data_fim_contrato,
  a.valor_parcela,
  p.id AS professor_id,
  p.nome AS professor_nome,
  c.nome AS instrumento,
  (a.data_fim_contrato - CURRENT_DATE) AS dias_para_vencer,
  CASE 
    WHEN a.data_fim_contrato < CURRENT_DATE THEN 'vencido'
    WHEN (a.data_fim_contrato - CURRENT_DATE) <= 7 THEN 'urgente'
    WHEN (a.data_fim_contrato - CURRENT_DATE) <= 15 THEN 'atencao'
    ELSE 'normal'
  END AS urgencia
FROM alunos a
LEFT JOIN professores p ON a.professor_atual_id = p.id
LEFT JOIN cursos c ON a.curso_id = c.id
WHERE a.data_fim_contrato IS NOT NULL
  AND a.data_fim_contrato <= (CURRENT_DATE + interval '30 days')
  AND a.status = 'ativo';

-- 5. Recriar view de resumo (depende das 4 acima)
CREATE VIEW vw_farmer_resumo_alertas AS
SELECT 
  u.id AS unidade_id,
  u.nome AS unidade_nome,
  (SELECT count(*) FROM vw_farmer_aniversariantes_hoje WHERE unidade_id = u.id) AS aniversariantes_hoje,
  (SELECT count(*) FROM vw_farmer_inadimplentes WHERE unidade_id = u.id) AS inadimplentes,
  (SELECT count(*) FROM vw_farmer_novos_matriculados WHERE unidade_id = u.id) AS novos_matriculados,
  (SELECT count(*) FROM vw_farmer_renovacoes_proximas WHERE unidade_id = u.id AND urgencia = 'vencido') AS renovacoes_vencidas,
  (SELECT count(*) FROM vw_farmer_renovacoes_proximas WHERE unidade_id = u.id AND urgencia = 'urgente') AS renovacoes_urgentes,
  (SELECT count(*) FROM vw_farmer_renovacoes_proximas WHERE unidade_id = u.id AND urgencia = 'atencao') AS renovacoes_atencao
FROM unidades u
WHERE u.ativo = true;
