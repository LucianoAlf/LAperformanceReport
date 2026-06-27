-- Auditoria: Emusys (emusys_api_payload) × banco (alunos)
-- Mostra matrículas ATIVAS no Emusys cuja PESSOA não tem nenhuma linha ativa no banco.
-- Ignora casos em que a pessoa tem pelo menos 1 curso ativo (ex: 2º curso inativo é normal).
--
-- Tipos de resultado:
--   SEM_MATCH   → existe no Emusys, não existe no banco (nem por nome nem por vínculo)
--   VINCULADO   → emusys_matricula_id aponta para essa matrícula, mas status != ativo
--   MATCH_NOME  → nome bate mas sem vínculo e nenhuma linha ativa no banco
--
-- Fonte Emusys: snapshot emusys_api_payload (atualizado manualmente ou pelo sync).
-- Última validação: 2026-06-27.

WITH unidade_map AS (
  SELECT 'cg'      AS codigo, '2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid AS unidade_id
  UNION ALL SELECT 'recreio', '95553e96-971b-4590-a6eb-0201d013c14d'
  UNION ALL SELECT 'barra',   '368d47f5-2d88-4475-bc14-ba084a9a348e'
),
-- pessoas que já têm pelo menos 1 linha ativa no banco (por nome normalizado + unidade)
pessoas_ativas AS (
  SELECT um.codigo, lower(unaccent(trim(a.nome))) AS nome_norm
  FROM alunos a
  JOIN unidade_map um ON um.unidade_id = a.unidade_id
  WHERE a.status = 'ativo' AND a.arquivado_em IS NULL
)
SELECT
  e.unidade_codigo,
  e.emusys_id,
  e.aluno_nome          AS nome_emusys,
  e.status              AS status_emusys,
  e.curso_nome          AS curso_emusys,
  a.id                  AS aluno_id,
  a.nome                AS nome_base,
  a.status              AS status_base,
  a.emusys_matricula_id,
  CASE
    WHEN a.id IS NULL                              THEN 'SEM_MATCH'
    WHEN a.emusys_matricula_id = e.emusys_id::text THEN 'VINCULADO'
    ELSE 'MATCH_NOME'
  END AS tipo_match
FROM emusys_api_payload e
JOIN unidade_map um ON um.codigo = e.unidade_codigo
-- exclui quem já tem linha ativa no banco com mesmo nome normalizado
LEFT JOIN pessoas_ativas pa
  ON pa.codigo   = e.unidade_codigo
  AND pa.nome_norm = lower(unaccent(trim(e.aluno_nome)))
LEFT JOIN alunos a
  ON a.unidade_id    = um.unidade_id
  AND a.arquivado_em IS NULL
  AND (
    a.emusys_matricula_id = e.emusys_id::text
    OR (
      a.emusys_matricula_id IS NULL
      AND lower(unaccent(trim(a.nome))) = lower(unaccent(trim(e.aluno_nome)))
    )
  )
WHERE e.status = 'ativa'
  AND pa.nome_norm IS NULL  -- pessoa NÃO tem nenhuma linha ativa no banco
ORDER BY e.unidade_codigo, tipo_match DESC, e.aluno_nome;
