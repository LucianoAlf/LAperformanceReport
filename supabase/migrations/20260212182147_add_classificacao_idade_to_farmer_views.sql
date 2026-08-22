-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- 1) Dropar views com CASCADE (remove vw_farmer_resumo_alertas que depende delas)
DROP VIEW IF EXISTS vw_farmer_resumo_alertas CASCADE;
DROP VIEW IF EXISTS vw_farmer_aniversariantes_hoje CASCADE;
DROP VIEW IF EXISTS vw_farmer_novos_matriculados CASCADE;

-- 2) Recriar view de aniversariantes COM classificacao
CREATE VIEW vw_farmer_aniversariantes_hoje AS
SELECT a.id AS aluno_id,
    a.nome AS aluno_nome,
    COALESCE(a.whatsapp, a.telefone) AS whatsapp,
    a.data_nascimento,
    a.unidade_id,
    EXTRACT(year FROM age(a.data_nascimento::timestamp with time zone))::integer AS idade,
    a.classificacao,
    p.id AS professor_id,
    p.nome AS professor_nome,
    c.nome AS instrumento
FROM alunos a
LEFT JOIN professores p ON a.professor_atual_id = p.id
LEFT JOIN cursos c ON a.curso_id = c.id
WHERE EXTRACT(month FROM a.data_nascimento) = EXTRACT(month FROM CURRENT_DATE)
  AND EXTRACT(day FROM a.data_nascimento) = EXTRACT(day FROM CURRENT_DATE)
  AND a.status::text = 'ativo'::text;

-- 3) Recriar view de novos matriculados COM classificacao e idade
CREATE VIEW vw_farmer_novos_matriculados AS
SELECT a.id AS aluno_id,
    a.nome AS aluno_nome,
    COALESCE(a.whatsapp, a.telefone) AS whatsapp,
    a.unidade_id,
    a.data_matricula,
    a.valor_parcela,
    a.classificacao,
    EXTRACT(year FROM age(a.data_nascimento::timestamp with time zone))::integer AS idade,
    p.id AS professor_id,
    p.nome AS professor_nome,
    c.nome AS instrumento,
    a.dia_aula,
    a.horario_aula
FROM alunos a
LEFT JOIN professores p ON a.professor_atual_id = p.id
LEFT JOIN cursos c ON a.curso_id = c.id
WHERE a.data_matricula >= (CURRENT_DATE - '7 days'::interval)
  AND a.status::text = 'ativo'::text;

-- 4) Recriar view de resumo alertas (dependia das anteriores)
CREATE VIEW vw_farmer_resumo_alertas AS
SELECT u.id AS unidade_id,
    u.nome AS unidade_nome,
    (SELECT count(*) FROM vw_farmer_aniversariantes_hoje WHERE vw_farmer_aniversariantes_hoje.unidade_id = u.id) AS aniversariantes_hoje,
    (SELECT count(*) FROM vw_farmer_inadimplentes WHERE vw_farmer_inadimplentes.unidade_id = u.id) AS inadimplentes,
    (SELECT count(*) FROM vw_farmer_novos_matriculados WHERE vw_farmer_novos_matriculados.unidade_id = u.id) AS novos_matriculados,
    (SELECT count(*) FROM vw_farmer_renovacoes_proximas WHERE vw_farmer_renovacoes_proximas.unidade_id = u.id AND vw_farmer_renovacoes_proximas.urgencia = 'vencido') AS renovacoes_vencidas,
    (SELECT count(*) FROM vw_farmer_renovacoes_proximas WHERE vw_farmer_renovacoes_proximas.unidade_id = u.id AND vw_farmer_renovacoes_proximas.urgencia = 'urgente') AS renovacoes_urgentes,
    (SELECT count(*) FROM vw_farmer_renovacoes_proximas WHERE vw_farmer_renovacoes_proximas.unidade_id = u.id AND vw_farmer_renovacoes_proximas.urgencia = 'atencao') AS renovacoes_atencao
FROM unidades u
WHERE u.ativo = true;
