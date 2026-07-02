-- ============================================================================
-- P09L - Retificacao controlada Recreio Junho/2026
-- Projeto alvo: ouqwbbermlzqqvtqwlul
--
-- Contexto operacional validado pela equipe:
-- - Bolsista integral em 2o curso nao entra no total principal de bolsistas
--   do relatorio administrativo; fica apenas como diagnostico.
-- - 2o curso operacional nao deve contar linhas REGULAR marcadas
--   indevidamente como is_segundo_curso.
-- - Ricardo Alfonso Moreno Ruiz estava com a linha regular vinculada ao
--   Emusys 965 (Garage Band zero), enquanto a matricula regular correta e 917.
--
-- Nao faz:
-- - Nao roda sync Emusys.
-- - Nao cria tabela nova.
-- - Nao altera outras unidades.
-- - Nao recalcula competencia inteira.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_kpis_alunos_admin_operacional(
  p_unidade_id uuid DEFAULT NULL::uuid,
  p_ano integer DEFAULT (EXTRACT(year FROM (now() AT TIME ZONE 'America/Sao_Paulo')))::integer,
  p_mes integer DEFAULT (EXTRACT(month FROM (now() AT TIME ZONE 'America/Sao_Paulo')))::integer
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
WITH params AS (
  SELECT
    make_date(p_ano, p_mes, 1)::date AS inicio_mes,
    LEAST(
      (now() AT TIME ZONE 'America/Sao_Paulo')::date,
      (make_date(p_ano, p_mes, 1) + interval '1 month' - interval '1 day')::date
    ) AS data_corte
),
unidades_base AS (
  SELECT u.id AS unidade_id, u.nome AS unidade_nome
  FROM public.unidades u
  WHERE u.ativo = true
    AND (p_unidade_id IS NULL OR u.id = p_unidade_id)
),
alunos_base AS (
  SELECT
    a.id,
    a.unidade_id,
    a.nome,
    a.status,
    a.data_matricula,
    a.data_saida,
    COALESCE(a.valor_parcela, 0)::numeric AS valor_parcela,
    COALESCE(a.is_segundo_curso, false) AS is_segundo_curso,
    CASE
      WHEN btrim(COALESCE(a.nome, '')) <> ''
        THEN lower(btrim(a.nome)) || '|' || a.unidade_id::text
      ELSE a.id::text || '|' || a.unidade_id::text
    END AS pessoa_key,
    COALESCE(c.is_projeto_banda, false) AS curso_banda,
    lower(COALESCE(c.nome, '')) LIKE '%coral%' AS is_coral,
    COALESCE(tm.codigo, '') AS tipo_codigo,
    COALESCE(tm.conta_como_pagante, false) AS conta_como_pagante,
    COALESCE(tm.entra_ticket_medio, false) AS entra_ticket_medio
  FROM public.alunos a
  JOIN unidades_base ub ON ub.unidade_id = a.unidade_id
  LEFT JOIN public.cursos c ON c.id = a.curso_id
  LEFT JOIN public.tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE a.arquivado_em IS NULL
),
alunos_classificados AS (
  SELECT
    ab.*,
    (ab.curso_banda = true OR ab.tipo_codigo = 'BANDA') AS is_banda_operacional,
    (ab.is_segundo_curso = true AND ab.tipo_codigo <> 'REGULAR') AS is_segundo_operacional,
    (
      ab.status = 'ativo'
      OR (
        ab.status = 'trancado'
        AND (ab.curso_banda = false AND ab.tipo_codigo <> 'BANDA')
        AND ab.is_coral = false
      )
    ) AS entra_carteira_operacional
  FROM alunos_base ab
),
pessoas_ativas AS (
  SELECT
    ac.unidade_id,
    ac.pessoa_key,
    SUM(
      CASE
        WHEN ac.entra_ticket_medio = true
          AND ac.valor_parcela > 0
          AND ac.tipo_codigo NOT IN ('BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA')
        THEN ac.valor_parcela
        ELSE 0
      END
    ) AS mrr,
    BOOL_OR(
      ac.tipo_codigo = 'BOLSISTA_INT'
      AND ac.is_banda_operacional = false
      AND ac.is_segundo_operacional = false
    ) AS bolsista_integral_regular,
    BOOL_OR(
      ac.tipo_codigo = 'BOLSISTA_INT'
      AND ac.is_banda_operacional = false
      AND ac.is_segundo_operacional = true
    ) AS bolsista_integral_segundo,
    BOOL_OR(
      ac.tipo_codigo = 'BOLSISTA_PARC'
      AND ac.is_banda_operacional = false
    ) AS bolsista_parcial,
    COUNT(*) FILTER (
      WHERE ac.is_segundo_operacional = true
        AND ac.is_banda_operacional = false
        AND ac.is_coral = false
    )::integer AS segundos_cursos
  FROM alunos_classificados ac
  WHERE ac.entra_carteira_operacional = true
  GROUP BY ac.unidade_id, ac.pessoa_key
),
matriculas_ativas AS (
  SELECT
    ub.unidade_id,
    COUNT(ac.id) FILTER (
      WHERE ac.status = 'ativo'
        AND ac.is_banda_operacional = true
    )::integer AS matriculas_banda,
    COUNT(ac.id) FILTER (
      WHERE ac.entra_carteira_operacional = true
        AND ac.is_segundo_operacional = true
        AND ac.is_banda_operacional = false
        AND ac.is_coral = false
    )::integer AS matriculas_2_curso,
    COUNT(DISTINCT ac.pessoa_key) FILTER (
      WHERE ac.entra_carteira_operacional = true
        AND ac.is_segundo_operacional = true
        AND ac.is_banda_operacional = false
        AND ac.is_coral = false
    )::integer AS alunos_com_2_curso,
    COUNT(ac.id) FILTER (
      WHERE ac.status = 'ativo'
        AND ac.is_coral = true
    )::integer AS matriculas_coral
  FROM unidades_base ub
  LEFT JOIN alunos_classificados ac ON ac.unidade_id = ub.unidade_id
  GROUP BY ub.unidade_id
),
trancados AS (
  SELECT
    ub.unidade_id,
    COUNT(DISTINCT ac.pessoa_key) FILTER (
      WHERE ac.status = 'trancado'
        AND ac.is_banda_operacional = false
        AND ac.is_coral = false
    )::integer AS alunos_trancados
  FROM unidades_base ub
  LEFT JOIN alunos_classificados ac ON ac.unidade_id = ub.unidade_id
  GROUP BY ub.unidade_id
),
novas AS (
  SELECT
    ub.unidade_id,
    COUNT(DISTINCT ac.pessoa_key) FILTER (
      WHERE ac.status = 'ativo'
        AND ac.data_matricula >= p.inicio_mes
        AND ac.data_matricula <= p.data_corte
        AND ac.is_banda_operacional = false
        AND ac.is_segundo_operacional = false
        AND ac.is_coral = false
        AND ac.tipo_codigo NOT IN ('BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA', 'SEGUNDO_CURSO', 'TRANSFERENCIA')
        AND (ac.conta_como_pagante = true OR ac.entra_ticket_medio = true)
        AND ac.valor_parcela > 0
    )::integer AS novas_matriculas
  FROM unidades_base ub
  CROSS JOIN params p
  LEFT JOIN alunos_classificados ac ON ac.unidade_id = ub.unidade_id
  GROUP BY ub.unidade_id
),
por_unidade AS (
  SELECT
    ub.unidade_id,
    ub.unidade_nome,
    p_ano AS ano,
    p_mes AS mes,
    COUNT(pa.pessoa_key)::integer AS alunos_ativos,
    COUNT(pa.pessoa_key) FILTER (WHERE pa.mrr > 0)::integer AS alunos_pagantes,
    GREATEST(COUNT(pa.pessoa_key)::integer - COUNT(pa.pessoa_key) FILTER (WHERE pa.mrr > 0)::integer, 0)::integer AS alunos_nao_pagantes,
    COUNT(pa.pessoa_key) FILTER (WHERE pa.bolsista_integral_regular = true)::integer AS bolsistas_integrais,
    COUNT(pa.pessoa_key) FILTER (WHERE pa.bolsista_integral_regular = true)::integer AS bolsistas_integrais_regulares,
    COUNT(pa.pessoa_key) FILTER (
      WHERE pa.bolsista_integral_segundo = true AND pa.bolsista_integral_regular = false
    )::integer AS bolsistas_integrais_segundo_curso,
    COUNT(pa.pessoa_key) FILTER (WHERE pa.bolsista_parcial = true)::integer AS bolsistas_parciais,
    COALESCE(t.alunos_trancados, 0)::integer AS alunos_trancados,
    COALESCE(n.novas_matriculas, 0)::integer AS novas_matriculas,
    COUNT(pa.pessoa_key)::integer AS matriculas_base_alunos_ativos,
    COALESCE(ma.matriculas_banda, 0)::integer AS matriculas_banda,
    COALESCE(ma.matriculas_2_curso, 0)::integer AS matriculas_2_curso,
    COALESCE(ma.alunos_com_2_curso, 0)::integer AS alunos_com_2_curso,
    GREATEST(COALESCE(ma.matriculas_2_curso, 0) - COALESCE(ma.alunos_com_2_curso, 0), 0)::integer AS matriculas_2_curso_extras,
    COALESCE(ma.matriculas_coral, 0)::integer AS matriculas_coral,
    (
      COUNT(pa.pessoa_key)::integer
      + COALESCE(ma.matriculas_banda, 0)
      + COALESCE(ma.matriculas_2_curso, 0)
      + COALESCE(ma.matriculas_coral, 0)
    )::integer AS matriculas_ativas
  FROM unidades_base ub
  LEFT JOIN pessoas_ativas pa ON pa.unidade_id = ub.unidade_id
  LEFT JOIN matriculas_ativas ma ON ma.unidade_id = ub.unidade_id
  LEFT JOIN trancados t ON t.unidade_id = ub.unidade_id
  LEFT JOIN novas n ON n.unidade_id = ub.unidade_id
  GROUP BY
    ub.unidade_id,
    ub.unidade_nome,
    ma.matriculas_banda,
    ma.matriculas_2_curso,
    ma.alunos_com_2_curso,
    ma.matriculas_coral,
    t.alunos_trancados,
    n.novas_matriculas
),
totais AS (
  SELECT
    SUM(alunos_ativos)::integer AS alunos_ativos,
    SUM(alunos_pagantes)::integer AS alunos_pagantes,
    SUM(alunos_nao_pagantes)::integer AS alunos_nao_pagantes,
    SUM(bolsistas_integrais)::integer AS bolsistas_integrais,
    SUM(bolsistas_integrais_regulares)::integer AS bolsistas_integrais_regulares,
    SUM(bolsistas_integrais_segundo_curso)::integer AS bolsistas_integrais_segundo_curso,
    SUM(bolsistas_parciais)::integer AS bolsistas_parciais,
    SUM(alunos_trancados)::integer AS alunos_trancados,
    SUM(novas_matriculas)::integer AS novas_matriculas,
    SUM(matriculas_base_alunos_ativos)::integer AS matriculas_base_alunos_ativos,
    SUM(matriculas_banda)::integer AS matriculas_banda,
    SUM(matriculas_2_curso)::integer AS matriculas_2_curso,
    SUM(alunos_com_2_curso)::integer AS alunos_com_2_curso,
    SUM(matriculas_2_curso_extras)::integer AS matriculas_2_curso_extras,
    SUM(matriculas_coral)::integer AS matriculas_coral,
    SUM(matriculas_ativas)::integer AS matriculas_ativas
  FROM por_unidade
)
SELECT jsonb_build_object(
  'fonte', 'admin_operacional_vivo',
  'periodo', jsonb_build_object(
    'ano', p_ano,
    'mes', p_mes,
    'unidade_id', p_unidade_id
  ),
  'totais', to_jsonb(totais.*),
  'por_unidade', COALESCE(
    (SELECT jsonb_agg(to_jsonb(por_unidade.*) ORDER BY unidade_nome) FROM por_unidade),
    '[]'::jsonb
  ),
  'alertas_fonte', jsonb_build_array(
    'Relatorio administrativo operacional: aluno regular trancado permanece na carteira; banda/projeto conta apenas quando ativo; bolsa integral em 2o curso fica diagnostico.'
  )
)
FROM totais;
$function$;

COMMENT ON FUNCTION public.get_kpis_alunos_admin_operacional(uuid, integer, integer)
IS 'KPIs vivos para relatorio administrativo: aluno regular trancado permanece na carteira; banda/projeto conta apenas ativo; bolsista integral em 2o curso fica diagnostico.';

REVOKE ALL ON FUNCTION public.get_kpis_alunos_admin_operacional(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_kpis_alunos_admin_operacional(uuid, integer, integer) TO authenticated, service_role;

DO $$
DECLARE
  v_recreio uuid;
  v_tipo_regular integer;
  v_tipo_banda integer;
  v_curso_teclado integer;
  v_curso_garage integer;
  v_prof_renan integer;
  v_prof_matheus integer;
  v_regular_id integer;
  v_banda_id integer;
  v_count integer;
  v_payload_917 jsonb;
  v_payload_965 jsonb;
  v_admin_snapshot_id uuid;
  v_exec_snapshot_id uuid;
  v_admin_old jsonb;
  v_exec_old jsonb;
  v_admin_new jsonb;
  v_exec_new jsonb;
  v_dm_old jsonb;
  v_dm_after jsonb;
  v_mrr numeric := 145550.73 + 431.20;
  v_ticket numeric := (145550.73 + 431.20) / 327;
  v_faturamento_realizado numeric := (145550.73 + 431.20) - 420;
  v_ltv numeric := ((145550.73 + 431.20) / 327) * 14.9;
BEGIN
  SELECT id INTO v_recreio
  FROM public.unidades
  WHERE lower(nome) = 'recreio'
  LIMIT 1;

  SELECT id INTO v_tipo_regular
  FROM public.tipos_matricula
  WHERE codigo = 'REGULAR'
  LIMIT 1;

  SELECT id INTO v_tipo_banda
  FROM public.tipos_matricula
  WHERE codigo = 'BANDA'
  LIMIT 1;

  SELECT id INTO v_curso_teclado
  FROM public.cursos
  WHERE nome = 'Teclado'
  LIMIT 1;

  SELECT id INTO v_curso_garage
  FROM public.cursos
  WHERE nome = 'GarageBand'
    AND is_projeto_banda IS true
  LIMIT 1;

  SELECT id INTO v_prof_renan
  FROM public.professores
  WHERE unaccent(lower(nome)) = unaccent(lower('Renan Amorim Guimaraes'))
    AND ativo IS true
  LIMIT 1;

  SELECT id INTO v_prof_matheus
  FROM public.professores
  WHERE unaccent(lower(nome)) = unaccent(lower('Matheus dos Santos Silva de Oliveira'))
    AND ativo IS true
  LIMIT 1;

  IF v_recreio IS NULL
     OR v_tipo_regular IS NULL
     OR v_tipo_banda IS NULL
     OR v_curso_teclado IS NULL
     OR v_curso_garage IS NULL
     OR v_prof_renan IS NULL
     OR v_prof_matheus IS NULL THEN
    RAISE EXCEPTION 'P09L: referencias canonicas ausentes.';
  END IF;

  SELECT payload INTO v_payload_917
  FROM public.emusys_api_payload
  WHERE unidade_codigo = 'recreio'
    AND endpoint = 'matriculas'
    AND emusys_id = 917
  ORDER BY synced_at DESC
  LIMIT 1;

  SELECT payload INTO v_payload_965
  FROM public.emusys_api_payload
  WHERE unidade_codigo = 'recreio'
    AND endpoint = 'matriculas'
    AND emusys_id = 965
  ORDER BY synced_at DESC
  LIMIT 1;

  IF v_payload_917 IS NULL OR v_payload_965 IS NULL THEN
    RAISE EXCEPTION 'P09L: payload Emusys 917/965 ausente para Recreio.';
  END IF;

  IF unaccent(lower(v_payload_917 #>> '{aluno,nome}')) <> unaccent(lower('Ricardo Alfonso Moreno Ruiz'))
     OR (v_payload_917->>'status') <> 'ativa'
     OR COALESCE((v_payload_917 #>> '{contrato_atual,valor_mensalidade}')::numeric, 0) <> 480
     OR COALESCE((v_payload_917 #>> '{contrato_atual,desconto_condicional}')::numeric, 0) <> 48.8 THEN
    RAISE EXCEPTION 'P09L: payload 917 nao confere com a matricula regular esperada.';
  END IF;

  IF unaccent(lower(v_payload_965 #>> '{aluno,nome}')) <> unaccent(lower('Ricardo Alfonso Moreno Ruiz'))
     OR (v_payload_965->>'status') <> 'ativa'
     OR COALESCE((v_payload_965 #>> '{contrato_atual,valor_mensalidade}')::numeric, 0) <> 0
     OR NOT EXISTS (
       SELECT 1
       FROM jsonb_array_elements(COALESCE(v_payload_965 #> '{contrato_atual,disciplinas}', '[]'::jsonb)) AS d(item)
       WHERE lower(COALESCE(d.item->>'nome', '')) LIKE '%garage band%'
     ) THEN
    RAISE EXCEPTION 'P09L: payload 965 nao confere com a matricula de banda esperada.';
  END IF;

  SELECT count(*), min(a.id)
  INTO v_count, v_regular_id
  FROM public.alunos a
  WHERE a.unidade_id = v_recreio
    AND a.arquivado_em IS NULL
    AND unaccent(lower(a.nome)) = unaccent(lower('Ricardo Alfonso Moreno Ruiz'))
    AND a.tipo_matricula_id = v_tipo_regular
    AND a.emusys_matricula_id = '965';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'P09L: esperado 1 Ricardo REGULAR vinculado ao Emusys 965, encontrado %.', v_count;
  END IF;

  SELECT count(*)
  INTO v_count
  FROM public.alunos a
  WHERE a.unidade_id = v_recreio
    AND a.arquivado_em IS NULL
    AND a.emusys_matricula_id = '917'
    AND a.id <> v_regular_id;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'P09L: Emusys 917 ja esta vinculado a outra linha no LA Report.';
  END IF;

  SELECT count(*), min(a.id)
  INTO v_count, v_banda_id
  FROM public.alunos a
  WHERE a.unidade_id = v_recreio
    AND a.arquivado_em IS NULL
    AND unaccent(lower(a.nome)) = unaccent(lower('Ricardo Alfonso Moreno Ruiz'))
    AND a.tipo_matricula_id = v_tipo_banda
    AND (a.emusys_matricula_id IS NULL OR a.emusys_matricula_id = '965');

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'P09L: esperado 1 Ricardo BANDA para receber Emusys 965, encontrado %.', v_count;
  END IF;

  SELECT id, payload INTO v_admin_snapshot_id, v_admin_old
  FROM public.fechamento_mensal_snapshots
  WHERE ano = 2026
    AND mes = 6
    AND escopo = 'unidade'
    AND unidade_id = v_recreio
    AND dominio = 'alunos_admin'
    AND status IN ('aprovado', 'fechado')
  ORDER BY versao DESC, aprovado_em DESC NULLS LAST, created_at DESC
  LIMIT 1;

  SELECT id, payload INTO v_exec_snapshot_id, v_exec_old
  FROM public.fechamento_mensal_snapshots
  WHERE ano = 2026
    AND mes = 6
    AND escopo = 'unidade'
    AND unidade_id = v_recreio
    AND dominio = 'alunos_executivo'
    AND status IN ('aprovado', 'fechado')
  ORDER BY versao DESC, aprovado_em DESC NULLS LAST, created_at DESC
  LIMIT 1;

  IF v_admin_snapshot_id IS NULL OR v_exec_snapshot_id IS NULL THEN
    RAISE EXCEPTION 'P09L: snapshots alunos_admin/alunos_executivo ausentes para Recreio Jun/2026.';
  END IF;

  SELECT to_jsonb(dm.*) INTO v_dm_old
  FROM public.dados_mensais dm
  WHERE dm.unidade_id = v_recreio
    AND dm.ano = 2026
    AND dm.mes = 6;

  IF v_dm_old IS NULL THEN
    RAISE EXCEPTION 'P09L: dados_mensais ausente para Recreio Jun/2026.';
  END IF;

  UPDATE public.alunos
  SET
    emusys_matricula_id = '917',
    emusys_student_id = '1414',
    curso_id = v_curso_teclado,
    professor_atual_id = v_prof_renan,
    valor_cheio = 480,
    desconto_fixo = 0,
    desconto_condicional = 48.8,
    valor_parcela = 431.20,
    status_pagamento = 'em_dia',
    dia_aula = 'Quarta',
    horario_aula = '14:00'::time,
    updated_at = now(),
    updated_by = 'p09l_retificacao_recreio_junho'
  WHERE id = v_regular_id;

  UPDATE public.alunos
  SET
    emusys_matricula_id = '965',
    emusys_student_id = '1414',
    curso_id = v_curso_garage,
    professor_atual_id = v_prof_matheus,
    valor_cheio = 0,
    desconto_fixo = 0,
    desconto_condicional = 0,
    valor_parcela = 0,
    status_pagamento = 'sem_parcela',
    dia_aula = 'Terça',
    horario_aula = '20:00'::time,
    updated_at = now(),
    updated_by = 'p09l_retificacao_recreio_junho'
  WHERE id = v_banda_id;

  INSERT INTO public.matriculas_emusys_decisoes_canonicas (
    unidade_id,
    emusys_matricula_id,
    aluno_id,
    tipo_decisao,
    campos_bloqueados,
    tipo_matricula_codigo,
    status_pagamento,
    valor_parcela,
    ignorar_sync,
    motivo,
    snapshot_emusys,
    created_by,
    updated_by,
    updated_at
  )
  VALUES
    (
      v_recreio,
      '917',
      v_regular_id,
      'aplicar_emusys',
      ARRAY[]::text[],
      'REGULAR',
      'em_dia',
      431.20,
      false,
      'Retificacao Recreio Jun/2026: matricula regular correta; 965 e Garage Band sem MRR.',
      v_payload_917,
      'p09l_retificacao_recreio_junho',
      'p09l_retificacao_recreio_junho',
      now()
    ),
    (
      v_recreio,
      '965',
      v_banda_id,
      'banda_sem_mrr',
      ARRAY['tipo_matricula_id', 'valor_cheio', 'desconto_fixo', 'desconto_condicional', 'valor_parcela', 'status_pagamento'],
      'BANDA',
      'sem_parcela',
      0,
      false,
      'Retificacao Recreio Jun/2026: Garage Band zero, nao entra em MRR/ticket.',
      v_payload_965,
      'p09l_retificacao_recreio_junho',
      'p09l_retificacao_recreio_junho',
      now()
    )
  ON CONFLICT (unidade_id, emusys_matricula_id) DO UPDATE SET
    aluno_id = EXCLUDED.aluno_id,
    tipo_decisao = EXCLUDED.tipo_decisao,
    campos_bloqueados = EXCLUDED.campos_bloqueados,
    tipo_matricula_codigo = EXCLUDED.tipo_matricula_codigo,
    status_pagamento = EXCLUDED.status_pagamento,
    valor_parcela = EXCLUDED.valor_parcela,
    ignorar_sync = EXCLUDED.ignorar_sync,
    motivo = EXCLUDED.motivo,
    snapshot_emusys = EXCLUDED.snapshot_emusys,
    updated_by = EXCLUDED.updated_by,
    updated_at = EXCLUDED.updated_at;

  INSERT INTO public.matriculas_campos_fixados (aluno_id, campo, valor, fixado_por, fixado_em)
  SELECT v_banda_id, campo, valor, 'p09l_retificacao_recreio_junho', now()
  FROM (
    VALUES
      ('tipo_matricula_id', to_jsonb(v_tipo_banda)),
      ('valor_cheio', to_jsonb(0)),
      ('desconto_fixo', to_jsonb(0)),
      ('desconto_condicional', to_jsonb(0)),
      ('valor_parcela', to_jsonb(0)),
      ('status_pagamento', to_jsonb('sem_parcela'::text))
  ) AS fix(campo, valor)
  ON CONFLICT (aluno_id, campo) DO UPDATE SET
    valor = EXCLUDED.valor,
    fixado_por = EXCLUDED.fixado_por,
    fixado_em = EXCLUDED.fixado_em;

  v_admin_new := v_admin_old || jsonb_build_object(
    'alunos_pagantes', 327,
    'alunos_nao_pagantes', 9,
    'bolsistas_integrais', 7,
    'bolsistas_integrais_regulares', 7,
    'bolsistas_integrais_segundo_curso', 2,
    'bolsistas_parciais', 2,
    'matriculas_ativas', 419,
    'matriculas_2_curso', 24,
    'alunos_com_2_curso', 23,
    'matriculas_2_curso_extras', 1
  );

  v_exec_new := v_exec_old || jsonb_build_object(
    'alunos_pagantes', 327,
    'total_alunos_pagantes', 327,
    'alunos_nao_pagantes', 9,
    'bolsistas_integrais', 7,
    'total_bolsistas_integrais', 7,
    'bolsistas_integrais_regulares', 7,
    'bolsistas_integrais_segundo_curso', 2,
    'bolsistas_parciais', 2,
    'total_bolsistas_parciais', 2,
    'matriculas_ativas', 419,
    'matriculas_2_curso', 24,
    'alunos_com_2_curso', 23,
    'matriculas_2_curso_extras', 1,
    'mrr', v_mrr,
    'faturamento_previsto', v_mrr,
    'faturamento_estimado', v_mrr,
    'faturamento_realizado', v_faturamento_realizado,
    'ticket_medio', v_ticket,
    'arr', v_mrr * 12,
    'ltv_medio', v_ltv,
    'ltv', v_ltv,
    'inadimplencia_pct', round((1::numeric / 327::numeric) * 100, 2),
    'inadimplencia', round((1::numeric / 327::numeric) * 100, 2)
  );

  UPDATE public.fechamento_mensal_snapshots
  SET
    payload = v_admin_new,
    payload_hash = public.hash_jsonb_canonico(v_admin_new),
    observacao = concat_ws(' | ', observacao, 'P09L: retificacao controlada Recreio Jun/2026 - bolsistas/2o curso/Ricardo.'),
    updated_at = now()
  WHERE id = v_admin_snapshot_id;

  UPDATE public.fechamento_mensal_snapshots
  SET
    payload = v_exec_new,
    payload_hash = public.hash_jsonb_canonico(v_exec_new),
    observacao = concat_ws(' | ', observacao, 'P09L: retificacao controlada Recreio Jun/2026 - bolsistas/2o curso/Ricardo.'),
    updated_at = now()
  WHERE id = v_exec_snapshot_id;

  UPDATE public.dados_mensais
  SET
    alunos_ativos = 336,
    alunos_pagantes = 327,
    ticket_medio = v_ticket,
    matriculas_ativas = 419,
    matriculas_banda = 59,
    matriculas_2_curso = 24,
    bolsistas_integrais = 7,
    bolsistas_parciais = 2,
    updated_at = now()
  WHERE unidade_id = v_recreio
    AND ano = 2026
    AND mes = 6;

  SELECT to_jsonb(dm.*) INTO v_dm_after
  FROM public.dados_mensais dm
  WHERE dm.unidade_id = v_recreio
    AND dm.ano = 2026
    AND dm.mes = 6;

  INSERT INTO public.dados_mensais_retificacoes (
    unidade_id,
    ano,
    mes,
    motivo,
    solicitado_por,
    aprovado_por,
    origem,
    snapshot_antes,
    snapshot_depois,
    diff,
    observacoes,
    status,
    aplicada_em,
    aplicada_por
  )
  VALUES (
    v_recreio,
    2026,
    6,
    'Retificacao Recreio Jun/2026: regra administrativa de bolsistas, 2o curso operacional e vinculo Ricardo 917/965.',
    'Luciano Alf',
    'Luciano Alf',
    'p09l_retificacao_controlada',
    jsonb_build_object(
      'dados_mensais', v_dm_old,
      'snapshot_alunos_admin', v_admin_old,
      'snapshot_alunos_executivo', v_exec_old,
      'ricardo_regular_antes', jsonb_build_object('aluno_id', v_regular_id, 'emusys_matricula_id', '965', 'valor_parcela', 0),
      'ricardo_banda_antes', jsonb_build_object('aluno_id', v_banda_id, 'emusys_matricula_id', null, 'valor_parcela', 0)
    ),
    jsonb_build_object(
      'dados_mensais', v_dm_after,
      'snapshot_alunos_admin', v_admin_new,
      'snapshot_alunos_executivo', v_exec_new,
      'ricardo_regular_depois', jsonb_build_object('aluno_id', v_regular_id, 'emusys_matricula_id', '917', 'valor_parcela', 431.20),
      'ricardo_banda_depois', jsonb_build_object('aluno_id', v_banda_id, 'emusys_matricula_id', '965', 'valor_parcela', 0)
    ),
    jsonb_build_object(
      'alunos_pagantes', jsonb_build_object('de', 326, 'para', 327),
      'alunos_nao_pagantes', jsonb_build_object('de', 10, 'para', 9),
      'bolsistas_integrais_total_principal', jsonb_build_object('de', 9, 'para', 7),
      'bolsistas_integrais_segundo_curso_diagnostico', jsonb_build_object('mantido', 2),
      'matriculas_2_curso', jsonb_build_object('de', 25, 'para', 24),
      'alunos_com_2_curso', jsonb_build_object('de', 24, 'para', 23),
      'matriculas_ativas', jsonb_build_object('de', 420, 'para', 419),
      'mrr', jsonb_build_object('de', 145550.73, 'para', v_mrr),
      'ricardo_regular_emusys', jsonb_build_object('de', '965', 'para', '917'),
      'ricardo_banda_emusys', jsonb_build_object('de', null, 'para', '965')
    ),
    'Retificacao aplicada com evidencia do payload Emusys cacheado; nao executou sync.',
    'aplicada',
    now(),
    'Codex / Luciano Alf'
  );

  INSERT INTO public.fechamento_mensal_auditoria (
    snapshot_id,
    ano,
    mes,
    escopo,
    unidade_id,
    acao,
    detalhes,
    actor_id
  )
  VALUES (
    v_exec_snapshot_id,
    2026,
    6,
    'unidade',
    v_recreio,
    'retificacao_solicitada',
    jsonb_build_object(
      'status', 'aplicada',
      'migration', '20260702153000_p09l_retificar_recreio_junho_bolsistas_segundo_curso',
      'snapshot_alunos_admin_id', v_admin_snapshot_id,
      'snapshot_alunos_executivo_id', v_exec_snapshot_id,
      'sem_sync', true,
      'motivo', 'Ajuste Recreio Jun/2026 validado pela equipe: bolsistas, 2o curso, Ricardo 917/965.'
    ),
    auth.uid()
  );
END $$;
