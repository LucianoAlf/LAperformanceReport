-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Corrigir view vw_kpis_professor_mensal:
-- 1) media_alunos_turma agora é calculada a partir de vw_turmas_implicitas (não mais do campo manual da tabela professores)
-- 2) Mantém todas as outras CTEs e lógica intactas

CREATE OR REPLACE VIEW vw_kpis_professor_mensal AS
WITH carteira AS (
  SELECT 
    a.professor_atual_id AS professor_id,
    a.unidade_id,
    count(*) AS carteira_alunos,
    avg(a.valor_parcela) AS ticket_medio,
    avg(a.percentual_presenca) AS media_presenca,
    sum(a.valor_parcela) AS mrr_carteira
  FROM alunos a
  WHERE a.status::text = 'ativo' AND a.professor_atual_id IS NOT NULL
  GROUP BY a.professor_atual_id, a.unidade_id
),
turmas_calc AS (
  SELECT 
    professor_id,
    unidade_id,
    COUNT(*) AS total_turmas,
    ROUND(AVG(total_alunos)::numeric, 2) AS media_alunos_turma
  FROM vw_turmas_implicitas
  GROUP BY professor_id, unidade_id
),
experimentais AS (
  SELECT 
    l.professor_experimental_id AS professor_id,
    l.unidade_id,
    EXTRACT(year FROM l.data_contato)::integer AS ano,
    EXTRACT(month FROM l.data_contato)::integer AS mes,
    sum(CASE WHEN l.status::text = ANY (ARRAY['experimental_realizada', 'compareceu']::text[]) THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS experimentais,
    sum(CASE WHEN l.status::text = ANY (ARRAY['matriculado', 'convertido']::text[]) THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS matriculas_leads
  FROM leads l
  WHERE l.professor_experimental_id IS NOT NULL
  GROUP BY l.professor_experimental_id, l.unidade_id, EXTRACT(year FROM l.data_contato), EXTRACT(month FROM l.data_contato)
),
matriculas_mes AS (
  SELECT 
    a.professor_experimental_id AS professor_id,
    a.unidade_id,
    EXTRACT(year FROM a.data_matricula)::integer AS ano,
    EXTRACT(month FROM a.data_matricula)::integer AS mes,
    count(*) AS matriculas
  FROM alunos a
  WHERE a.professor_experimental_id IS NOT NULL AND a.data_matricula IS NOT NULL
  GROUP BY a.professor_experimental_id, a.unidade_id, EXTRACT(year FROM a.data_matricula), EXTRACT(month FROM a.data_matricula)
),
renovacoes_mes AS (
  SELECT 
    r.professor_id,
    r.unidade_id,
    EXTRACT(year FROM r.data_renovacao)::integer AS ano,
    EXTRACT(month FROM r.data_renovacao)::integer AS mes,
    count(*) FILTER (WHERE r.status::text = 'realizada') AS renovacoes,
    count(*) FILTER (WHERE r.status::text = 'nao_renovada') AS nao_renovacoes,
    count(*) AS total_renovacoes
  FROM renovacoes r
  WHERE r.professor_id IS NOT NULL
  GROUP BY r.professor_id, r.unidade_id, EXTRACT(year FROM r.data_renovacao), EXTRACT(month FROM r.data_renovacao)
),
evasoes_mes AS (
  SELECT 
    ev.professor_id,
    ev.unidade_id,
    EXTRACT(year FROM ev.data_evasao)::integer AS ano,
    EXTRACT(month FROM ev.data_evasao)::integer AS mes,
    count(*) AS evasoes,
    sum(ev.valor_parcela) AS mrr_perdido
  FROM evasoes_v2 ev
  WHERE ev.professor_id IS NOT NULL
  GROUP BY ev.professor_id, ev.unidade_id, EXTRACT(year FROM ev.data_evasao), EXTRACT(month FROM ev.data_evasao)
)
SELECT 
  p.id AS professor_id,
  p.nome AS professor_nome,
  COALESCE(c.unidade_id, e.unidade_id, m.unidade_id) AS unidade_id,
  COALESCE(e.ano, EXTRACT(year FROM CURRENT_DATE)::integer) AS ano,
  COALESCE(e.mes, EXTRACT(month FROM CURRENT_DATE)::integer) AS mes,
  COALESCE(c.carteira_alunos, 0::bigint)::integer AS carteira_alunos,
  COALESCE(c.ticket_medio, 0::numeric)::numeric(10,2) AS ticket_medio,
  COALESCE(c.media_presenca, 0::numeric)::numeric(5,2) AS media_presenca,
  COALESCE(100::numeric - c.media_presenca, 0::numeric)::numeric(5,2) AS taxa_faltas,
  COALESCE(c.mrr_carteira, 0::numeric)::numeric(12,2) AS mrr_carteira,
  COALESCE(p.nps_medio, 0::numeric)::numeric(5,2) AS nps_medio,
  -- CORRIGIDO: usar turmas_calc em vez de p.media_alunos_turma (que era sempre NULL)
  COALESCE(tc.media_alunos_turma, 0::numeric)::numeric(5,2) AS media_alunos_turma,
  COALESCE(e.experimentais, 0::bigint)::integer AS experimentais,
  COALESCE(m.matriculas, e.matriculas_leads, 0::bigint)::integer AS matriculas,
  CASE
    WHEN COALESCE(e.experimentais, 0::bigint) > 0 
    THEN round(COALESCE(m.matriculas, e.matriculas_leads, 0::bigint)::numeric / e.experimentais::numeric * 100, 2)
    ELSE 0::numeric
  END AS taxa_conversao,
  COALESCE(r.renovacoes, 0::bigint)::integer AS renovacoes,
  COALESCE(r.nao_renovacoes, 0::bigint)::integer AS nao_renovacoes,
  CASE
    WHEN COALESCE(r.total_renovacoes, 0::bigint) > 0 
    THEN round(r.renovacoes::numeric / r.total_renovacoes::numeric * 100, 2)
    ELSE 0::numeric
  END AS taxa_renovacao,
  COALESCE(ev.evasoes, 0::bigint)::integer AS evasoes,
  COALESCE(ev.mrr_perdido, 0::numeric)::numeric(12,2) AS mrr_perdido,
  CASE
    WHEN COALESCE(c.carteira_alunos, 0::bigint) > 0 
    THEN round(COALESCE(ev.evasoes, 0::bigint)::numeric / c.carteira_alunos::numeric * 100, 2)
    ELSE 0::numeric
  END AS taxa_cancelamento,
  rank() OVER (ORDER BY (
    CASE WHEN COALESCE(e.experimentais, 0::bigint) > 0 THEN COALESCE(m.matriculas, 0::bigint)::numeric / e.experimentais::numeric ELSE 0::numeric END
  ) DESC) AS ranking_matriculador,
  rank() OVER (ORDER BY (
    CASE WHEN COALESCE(r.total_renovacoes, 0::bigint) > 0 THEN r.renovacoes::numeric / r.total_renovacoes::numeric ELSE 0::numeric END
  ) DESC) AS ranking_renovador,
  rank() OVER (ORDER BY (
    CASE WHEN COALESCE(c.carteira_alunos, 0::bigint) > 0 THEN COALESCE(ev.evasoes, 0::bigint)::numeric / c.carteira_alunos::numeric ELSE 1::numeric END
  )) AS ranking_churn
FROM professores p
  LEFT JOIN carteira c ON c.professor_id = p.id
  LEFT JOIN turmas_calc tc ON tc.professor_id = p.id AND tc.unidade_id = c.unidade_id
  LEFT JOIN experimentais e ON e.professor_id = p.id
  LEFT JOIN matriculas_mes m ON m.professor_id = p.id AND m.ano = e.ano AND m.mes = e.mes AND m.unidade_id = e.unidade_id
  LEFT JOIN renovacoes_mes r ON r.professor_id = p.id AND r.ano = COALESCE(e.ano, EXTRACT(year FROM CURRENT_DATE)::integer) AND r.mes = COALESCE(e.mes, EXTRACT(month FROM CURRENT_DATE)::integer)
  LEFT JOIN evasoes_mes ev ON ev.professor_id = p.id AND ev.ano = COALESCE(e.ano, EXTRACT(year FROM CURRENT_DATE)::integer) AND ev.mes = COALESCE(e.mes, EXTRACT(month FROM CURRENT_DATE)::integer)
WHERE p.ativo = true;
