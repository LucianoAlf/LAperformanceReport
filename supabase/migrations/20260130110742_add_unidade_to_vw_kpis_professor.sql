-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Criar view com unidade_id para filtro no Dashboard
-- Esta view mantém a relação professor-unidade para permitir filtros

CREATE OR REPLACE VIEW vw_kpis_professor_por_unidade AS
WITH carteira AS (
    SELECT 
        a.professor_atual_id AS professor_id,
        a.unidade_id,
        count(*) AS carteira_alunos,
        avg(a.valor_parcela) AS ticket_medio,
        avg(a.percentual_presenca) AS media_presenca,
        sum(a.valor_parcela) AS mrr_carteira
    FROM alunos a
    WHERE a.status = 'ativo' 
      AND a.professor_atual_id IS NOT NULL
    GROUP BY a.professor_atual_id, a.unidade_id
)
SELECT 
    p.id AS professor_id,
    p.nome AS professor_nome,
    c.unidade_id,
    COALESCE(c.carteira_alunos, 0)::integer AS carteira_alunos,
    COALESCE(c.ticket_medio, 0)::numeric(10,2) AS ticket_medio,
    COALESCE(c.media_presenca, 0)::numeric(5,2) AS media_presenca,
    COALESCE(100 - c.media_presenca, 0)::numeric(5,2) AS taxa_faltas,
    COALESCE(c.mrr_carteira, 0)::numeric(12,2) AS mrr_carteira,
    COALESCE(p.nps_medio, 0)::numeric(5,2) AS nps_medio,
    COALESCE(p.media_alunos_turma, 0)::numeric(5,2) AS media_alunos_turma
FROM professores p
INNER JOIN carteira c ON c.professor_id = p.id
WHERE p.ativo = true;
