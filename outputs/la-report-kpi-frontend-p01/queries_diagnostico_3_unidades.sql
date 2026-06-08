-- ============================================================
-- DIAGNÓSTICO DE DIVERGÊNCIAS DE KPI — 3 UNIDADES / JUN 2026
-- Rodar no Supabase SQL Editor (uma vez)
-- Retorna tabela comparativa para Barra, Campo Grande e Recreio
-- ============================================================

-- ---- PARTE 1: IDs das unidades ----
-- (confirma quais IDs usar)
SELECT id, nome FROM unidades ORDER BY nome;

-- ============================================================
-- PARTE 2: Comparativo completo — todas as fontes por unidade
-- ============================================================
WITH unidades_alvo AS (
  SELECT id, nome
  FROM unidades
  WHERE nome ILIKE '%barra%'
     OR nome ILIKE '%campo grande%'
     OR nome ILIKE '%cg%'
     OR nome ILIKE '%recreio%'
),

-- Fonte 1: vw_kpis_gestao_mensal (usada por Analytics e Dashboard cards)
fonte_view_gestao AS (
  SELECT
    v.unidade_id,
    v.total_alunos_ativos  AS view_ativos,
    v.total_alunos_pagantes AS view_pagantes,
    v.ticket_medio          AS view_ticket,
    v.faturamento_previsto  AS view_mrr
  FROM vw_kpis_gestao_mensal v
  WHERE v.ano = 2026 AND v.mes = 6
),

-- Fonte 2: alunos ao vivo — pessoas distintas (usada por AlunosPage e Analytics)
fonte_alunos_pessoas AS (
  SELECT
    a.unidade_id,
    COUNT(DISTINCT LOWER(TRIM(a.nome))) FILTER (
      WHERE a.status IN ('ativo','trancado') AND NOT a.is_segundo_curso
    ) AS alunos_ativos_pessoas,
    COUNT(a.id) FILTER (
      WHERE a.status IN ('ativo','trancado')
        AND NOT a.is_segundo_curso
        AND tm.conta_como_pagante = true
    ) AS alunos_pagantes_direto,
    COALESCE(SUM(a.valor_parcela) FILTER (
      WHERE a.status IN ('ativo','trancado')
        AND NOT a.is_segundo_curso
        AND tm.conta_como_pagante = true
    ), 0) AS mrr_canonico,
    ROUND(AVG(a.valor_parcela) FILTER (
      WHERE a.status IN ('ativo','trancado')
        AND NOT a.is_segundo_curso
        AND tm.conta_como_pagante = true
    ), 2) AS ticket_canonico,
    COUNT(a.id) FILTER (WHERE a.status = 'aviso_previo' AND NOT a.is_segundo_curso) AS aviso_previo,
    COUNT(a.id) FILTER (
      WHERE a.status IN ('ativo','trancado','aviso_previo')
        AND NOT a.is_segundo_curso
    ) AS ativos_com_aviso
  FROM alunos a
  JOIN tipos_matricula tm ON a.tipo_matricula_id = tm.id
  WHERE a.status IN ('ativo','trancado','aviso_previo')
  GROUP BY a.unidade_id
),

-- Fonte 3: Carteira de professores (aproximação da RPC get_carteira_professores)
fonte_carteira AS (
  SELECT
    a.unidade_id,
    COUNT(DISTINCT a.id) AS carteira_total_matriculas,
    COUNT(DISTINCT LOWER(TRIM(a.nome))) AS carteira_pessoas_distintas,
    COUNT(DISTINCT a.id) FILTER (
      WHERE tm.conta_como_pagante = true AND NOT a.is_segundo_curso
    ) AS carteira_pagantes_direto,
    -- Simulação do round(mrr/ticket) por professor (como o frontend faz — ERRADO)
    SUM(a.valor_parcela) FILTER (
      WHERE tm.conta_como_pagante = true AND NOT a.is_segundo_curso
    ) AS carteira_mrr_com_professor
  FROM alunos a
  JOIN tipos_matricula tm ON a.tipo_matricula_id = tm.id
  JOIN professores p ON a.professor_id = p.id
  WHERE a.status IN ('ativo','trancado')
    AND p.ativo = true
  GROUP BY a.unidade_id
),

-- Fonte 4: Alunos SEM professor (explica diferença de MRR)
fonte_sem_professor AS (
  SELECT
    a.unidade_id,
    COUNT(a.id) AS sem_professor_count,
    COALESCE(SUM(a.valor_parcela), 0) AS sem_professor_mrr
  FROM alunos a
  JOIN tipos_matricula tm ON a.tipo_matricula_id = tm.id
  WHERE a.status IN ('ativo','trancado')
    AND tm.conta_como_pagante = true
    AND NOT a.is_segundo_curso
    AND (
      a.professor_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM professores p WHERE p.id = a.professor_id AND p.ativo = true
      )
    )
  GROUP BY a.unidade_id
),

-- Fonte 5: Movimentações Jun/2026 (explica zeros no Administrativo)
fonte_mov AS (
  SELECT
    unidade_id,
    COUNT(*) FILTER (WHERE tipo = 'renovacao') AS mov_renovacoes,
    COUNT(*) FILTER (WHERE tipo = 'nao_renovacao') AS mov_nao_renovacoes,
    COUNT(*) FILTER (WHERE tipo IN ('evasao','cancelamento')) AS mov_evasoes,
    COUNT(*) FILTER (WHERE tipo = 'aviso_previo') AS mov_avisos,
    COUNT(*) AS mov_total
  FROM movimentacoes_admin
  WHERE EXTRACT(YEAR FROM data) = 2026
    AND EXTRACT(MONTH FROM data) = 6
  GROUP BY unidade_id
)

-- ---- RESULTADO FINAL ----
SELECT
  u.nome                                    AS unidade,

  -- Fonte view (Analytics/Dashboard cards)
  COALESCE(vg.view_ativos, -1)              AS "view: ativos",
  COALESCE(vg.view_pagantes, -1)            AS "view: pagantes",
  COALESCE(vg.view_ticket, 0)              AS "view: ticket",
  COALESCE(vg.view_mrr, 0)                 AS "view: mrr",

  -- Fonte alunos ao vivo (AlunosPage)
  COALESCE(ap.alunos_ativos_pessoas, 0)     AS "alunos: ativos (pessoas)",
  COALESCE(ap.ativos_com_aviso, 0)          AS "alunos: ativos+aviso_previo",
  COALESCE(ap.alunos_pagantes_direto, 0)    AS "alunos: pagantes",
  COALESCE(ap.mrr_canonico, 0)             AS "alunos: mrr",
  COALESCE(ap.ticket_canonico, 0)          AS "alunos: ticket",
  COALESCE(ap.aviso_previo, 0)             AS "alunos: aviso_previo",

  -- Fonte carteira (Prof/Carteira)
  COALESCE(fc.carteira_total_matriculas, 0) AS "carteira: ativos (matric)",
  COALESCE(fc.carteira_pessoas_distintas, 0) AS "carteira: ativos (pessoas)",
  COALESCE(fc.carteira_pagantes_direto, 0)  AS "carteira: pagantes (direto)",
  COALESCE(fc.carteira_mrr_com_professor, 0) AS "carteira: mrr",

  -- Alunos sem professor
  COALESCE(sp.sem_professor_count, 0)       AS "sem_prof: alunos",
  COALESCE(sp.sem_professor_mrr, 0)         AS "sem_prof: mrr",

  -- Divergências calculadas
  COALESCE(ap.alunos_pagantes_direto, 0) - COALESCE(fc.carteira_pagantes_direto, 0)
                                            AS "delta: pagantes (alunos-carteira)",
  COALESCE(ap.alunos_ativos_pessoas, 0) - COALESCE(fc.carteira_pessoas_distintas, 0)
                                            AS "delta: ativos pessoas (alunos-carteira)",
  COALESCE(ap.mrr_canonico, 0) - COALESCE(fc.carteira_mrr_com_professor, 0)
                                            AS "delta: mrr (alunos-carteira)",

  -- Movimentações Jun/2026
  COALESCE(mv.mov_renovacoes, 0)            AS "mov: renovações",
  COALESCE(mv.mov_nao_renovacoes, 0)        AS "mov: não renov",
  COALESCE(mv.mov_evasoes, 0)               AS "mov: evasões",
  COALESCE(mv.mov_total, 0)                 AS "mov: total"

FROM unidades_alvo u
LEFT JOIN fonte_view_gestao   vg ON vg.unidade_id = u.id
LEFT JOIN fonte_alunos_pessoas ap ON ap.unidade_id = u.id
LEFT JOIN fonte_carteira       fc ON fc.unidade_id = u.id
LEFT JOIN fonte_sem_professor  sp ON sp.unidade_id = u.id
LEFT JOIN fonte_mov            mv ON mv.unidade_id = u.id
ORDER BY u.nome;

-- ============================================================
-- PARTE 3: Diagnóstico do bug do Administrativo (zeros)
-- Verifica o que vw_kpis_gestao_mensal retorna para cada unidade
-- e se há linhas com valores zerados (causa provável dos zeros)
-- ============================================================
SELECT
  u.nome AS unidade,
  v.ano,
  v.mes,
  v.total_alunos_ativos,
  v.total_alunos_pagantes,
  v.ticket_medio,
  CASE
    WHEN v.unidade_id IS NULL THEN 'VIEW NÃO RETORNOU LINHA'
    WHEN v.total_alunos_ativos = 0 AND v.total_alunos_pagantes = 0 THEN 'LINHA COM ZEROS — BUG CAUSA ZEROS ADMIN'
    ELSE 'OK'
  END AS diagnostico_admin
FROM unidades_alvo u
LEFT JOIN vw_kpis_gestao_mensal v
  ON v.unidade_id = u.id AND v.ano = 2026 AND v.mes = 6
ORDER BY u.nome;
