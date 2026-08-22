-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Fix: vw_turmas_implicitas não mostrava sala vinculada
-- Causa: faltava LEFT JOIN com turmas_explicitas para herdar sala_id/sala_nome
-- Também adiciona turma_explicita_id e capacidade_maxima para uso no frontend

CREATE OR REPLACE VIEW vw_turmas_implicitas AS
SELECT 
    a.unidade_id,
    u.nome AS unidade_nome,
    a.professor_atual_id AS professor_id,
    p.nome AS professor_nome,
    a.curso_id,
    c.nome AS curso_nome,
    a.dia_aula AS dia_semana,
    a.horario_aula AS horario_inicio,
    count(*) AS total_alunos,
    array_agg(a.nome ORDER BY a.nome) AS nomes_alunos,
    array_agg(a.id ORDER BY a.nome) AS ids_alunos,
    round(avg(a.valor_parcela), 2) AS ticket_medio_turma,
    round(avg(a.tempo_permanencia_meses), 1) AS tempo_medio_turma,
    -- Campos da turma explícita (sala vinculada)
    te.id AS turma_explicita_id,
    te.sala_id,
    s.nome AS sala_nome,
    te.capacidade_maxima
FROM alunos a
LEFT JOIN unidades u ON a.unidade_id = u.id
LEFT JOIN professores p ON a.professor_atual_id = p.id
LEFT JOIN cursos c ON a.curso_id = c.id
LEFT JOIN turmas_explicitas te ON te.unidade_id = a.unidade_id 
    AND te.professor_id = a.professor_atual_id 
    AND te.dia_semana = a.dia_aula 
    AND te.horario_inicio = a.horario_aula
    AND te.ativo = true
LEFT JOIN salas s ON s.id = te.sala_id
WHERE a.status IN ('ativo', 'trancado')
  AND a.professor_atual_id IS NOT NULL 
  AND a.dia_aula IS NOT NULL 
  AND a.horario_aula IS NOT NULL
GROUP BY a.unidade_id, u.nome, a.professor_atual_id, p.nome, a.curso_id, c.nome, 
         a.dia_aula, a.horario_aula, te.id, te.sala_id, s.nome, te.capacidade_maxima
ORDER BY p.nome, a.dia_aula, a.horario_aula;
