-- ============================================
-- Migration: hardening sistêmico de atividades extras em evasões/churn/renovação
-- Contexto: garantir que Coral/Power Kids/Minha Banda/GarageBand/Percussion Kids não entrem em métricas legadas.
-- Segurança: não altera dados. Apenas redefine helper, funções e views.
-- ============================================

CREATE OR REPLACE FUNCTION public.is_movimentacao_admin_retencao_valida(p_movimentacao_id integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
  SELECT COALESCE(
    NOT public.is_atividade_extra_curso(COALESCE(m.curso_id, a.curso_id)),
    true
  )
  FROM public.movimentacoes_admin m
  LEFT JOIN public.alunos a ON a.id = m.aluno_id
  WHERE m.id = p_movimentacao_id;
$$;

COMMENT ON FUNCTION public.is_movimentacao_admin_retencao_valida(integer)
IS 'Retorna false para movimentações de retenção ligadas a atividades extras (Coral, Power Kids, Minha Banda/GarageBand/Percussion Kids etc.).';

-- ---- function: snapshot_dados_mensais_unguarded_integer_integer.sql ----
CREATE OR REPLACE FUNCTION public.snapshot_dados_mensais_unguarded(p_ano integer, p_mes integer)
 RETURNS TABLE(unidade_nome text, registros_afetados integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_unidade RECORD;
BEGIN
  FOR v_unidade IN SELECT id, nome FROM unidades WHERE ativo = true LOOP
    INSERT INTO dados_mensais (
      unidade_id, ano, mes, alunos_pagantes, alunos_ativos, matriculas_ativas,
      matriculas_2_curso, matriculas_banda,
      novas_matriculas, evasoes,
      churn_rate, ticket_medio, taxa_renovacao, tempo_permanencia, inadimplencia
    )
    SELECT 
      v_unidade.id, p_ano, p_mes,
      (SELECT COUNT(*) FROM alunos a 
       LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
       WHERE a.unidade_id = v_unidade.id AND a.status = 'ativo' 
       AND COALESCE(a.is_segundo_curso, false) = false
       AND (tm.conta_como_pagante = true OR tm.id IS NULL))::INTEGER,
      (SELECT COUNT(*) FROM alunos 
       WHERE unidade_id = v_unidade.id AND status = 'ativo' 
       AND COALESCE(is_segundo_curso, false) = false)::INTEGER,
      (SELECT COUNT(*) FROM alunos 
       WHERE unidade_id = v_unidade.id AND status = 'ativo')::INTEGER,
      (SELECT COUNT(*) FROM alunos 
       WHERE unidade_id = v_unidade.id AND status = 'ativo' 
       AND COALESCE(is_segundo_curso, false) = true)::INTEGER,
      (SELECT COUNT(*) FROM alunos a2
       LEFT JOIN cursos c ON c.id = a2.curso_id
       WHERE a2.unidade_id = v_unidade.id AND a2.status = 'ativo' 
       AND c.is_projeto_banda = true)::INTEGER,
      (SELECT COALESCE(SUM(COALESCE(quantidade, 1)), 0) FROM leads 
       WHERE unidade_id = v_unidade.id AND status IN ('matriculado','convertido')
       AND EXTRACT(YEAR FROM data_contato) = p_ano AND EXTRACT(MONTH FROM data_contato) = p_mes)::INTEGER,
      (SELECT COUNT(*) FROM movimentacoes_admin WHERE unidade_id = v_unidade.id
       AND tipo IN ('evasao', 'nao_renovacao')
       AND public.is_movimentacao_admin_retencao_valida(id)
       AND EXTRACT(YEAR FROM data) = p_ano AND EXTRACT(MONTH FROM data) = p_mes)::INTEGER,
      COALESCE((SELECT CASE WHEN dm_ant.alunos_pagantes > 0 
        THEN ROUND(((SELECT COUNT(*) FROM movimentacoes_admin WHERE unidade_id = v_unidade.id 
                     AND tipo IN ('evasao', 'nao_renovacao')
                     AND public.is_movimentacao_admin_retencao_valida(id)
                     AND EXTRACT(YEAR FROM data) = p_ano AND EXTRACT(MONTH FROM data) = p_mes)::NUMERIC 
                    / dm_ant.alunos_pagantes) * 100, 2) ELSE 0 END
        FROM dados_mensais dm_ant WHERE dm_ant.unidade_id = v_unidade.id 
        AND ((dm_ant.ano = p_ano AND dm_ant.mes = p_mes - 1) OR (dm_ant.ano = p_ano - 1 AND dm_ant.mes = 12 AND p_mes = 1))
        LIMIT 1), 0),
      (SELECT COALESCE(ROUND(AVG(a3.valor_parcela), 2), 0) FROM alunos a3
       LEFT JOIN tipos_matricula tm ON tm.id = a3.tipo_matricula_id
       WHERE a3.unidade_id = v_unidade.id AND a3.status = 'ativo' 
       AND COALESCE(a3.is_segundo_curso, false) = false
       AND (tm.entra_ticket_medio = true OR tm.id IS NULL)),
      0,
      (SELECT COALESCE(ROUND(AVG(tempo_permanencia_meses), 1), 0) FROM alunos 
       WHERE unidade_id = v_unidade.id AND status = 'ativo'),
      0
    ON CONFLICT (unidade_id, ano, mes) DO UPDATE SET
      alunos_pagantes = EXCLUDED.alunos_pagantes, 
      alunos_ativos = EXCLUDED.alunos_ativos,
      matriculas_ativas = EXCLUDED.matriculas_ativas,
      matriculas_2_curso = EXCLUDED.matriculas_2_curso,
      matriculas_banda = EXCLUDED.matriculas_banda,
      novas_matriculas = EXCLUDED.novas_matriculas,
      evasoes = EXCLUDED.evasoes, churn_rate = EXCLUDED.churn_rate, 
      ticket_medio = EXCLUDED.ticket_medio,
      tempo_permanencia = EXCLUDED.tempo_permanencia, 
      updated_at = NOW();
    
    unidade_nome := v_unidade.nome;
    registros_afetados := 1;
    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$function$;

-- ---- function: sync_evasao_to_dados_mensais.sql ----
CREATE OR REPLACE FUNCTION public.sync_evasao_to_dados_mensais()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ano int;
  v_mes int;
  v_unidade uuid;
  v_count int;
  v_pagantes int;
  v_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.tipo NOT IN ('evasao', 'nao_renovacao', 'aviso_previo') THEN
      RETURN OLD;
    END IF;

    v_ano := EXTRACT(YEAR FROM OLD.data);
    v_mes := EXTRACT(MONTH FROM OLD.data);
    v_unidade := OLD.unidade_id;
  ELSE
    IF NEW.tipo NOT IN ('evasao', 'nao_renovacao', 'aviso_previo') THEN
      RETURN NEW;
    END IF;

    v_ano := EXTRACT(YEAR FROM NEW.data);
    v_mes := EXTRACT(MONTH FROM NEW.data);
    v_unidade := NEW.unidade_id;
  END IF;

  SELECT status
    INTO v_status
  FROM public.competencias_mensais
  WHERE unidade_id = v_unidade
    AND ano = v_ano
    AND mes = v_mes;

  IF v_status IN ('fechado', 'retificacao_pendente') THEN
    BEGIN
      PERFORM public.log_competencia_bloqueio(
        v_unidade,
        v_ano,
        v_mes,
        'sync_evasao_to_dados_mensais',
        TG_OP,
        'Movimentacao retroativa requer retificacao formal; snapshot fechado nao foi alterado.',
        jsonb_build_object(
          'status_competencia', v_status,
          'movimentacao_id', CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
          'tipo', CASE WHEN TG_OP = 'DELETE' THEN OLD.tipo ELSE NEW.tipo END,
          'aluno_nome', CASE WHEN TG_OP = 'DELETE' THEN OLD.aluno_nome ELSE NEW.aluno_nome END,
          'data', CASE WHEN TG_OP = 'DELETE' THEN OLD.data ELSE NEW.data END
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING
        'Falha ao registrar bloqueio de sync_evasao_to_dados_mensais: %',
        SQLERRM;
    END;

    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.movimentacoes_admin
  WHERE unidade_id = v_unidade
    AND tipo IN ('evasao', 'nao_renovacao')
    AND public.is_movimentacao_admin_retencao_valida(id)
    AND EXTRACT(YEAR FROM data) = v_ano
    AND EXTRACT(MONTH FROM data) = v_mes;

  SELECT alunos_pagantes INTO v_pagantes
  FROM public.dados_mensais
  WHERE unidade_id = v_unidade
    AND ((ano = v_ano AND mes = v_mes - 1) OR (ano = v_ano - 1 AND mes = 12 AND v_mes = 1))
  LIMIT 1;

  UPDATE public.dados_mensais
  SET evasoes = v_count,
      churn_rate = CASE
        WHEN COALESCE(v_pagantes, 0) > 0 THEN ROUND((v_count::numeric / v_pagantes) * 100, 2)
        ELSE 0
      END,
      updated_at = NOW()
  WHERE unidade_id = v_unidade
    AND ano = v_ano
    AND mes = v_mes;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- ---- function: get_dados_relatorio_coordenacao_uuid_integer_integer.sql ----
CREATE OR REPLACE FUNCTION public.get_dados_relatorio_coordenacao(p_unidade_id uuid, p_ano integer, p_mes integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$ 
DECLARE
  v_result JSONB := '{}'::jsonb;
  v_unidade_nome TEXT;
  v_inicio DATE;
  v_fim DATE;
  v_inicio_ant DATE;
  v_fim_ant DATE;
  v_inicio_ano_ant DATE;
  v_fim_ano_ant DATE;
BEGIN
  -- Calcular range de datas do periodo
  v_inicio := make_date(p_ano, p_mes, 1);
  v_fim := (v_inicio + interval '1 month' - interval '1 day')::date;

  -- Mes anterior
  v_inicio_ant := (v_inicio - interval '1 month')::date;
  v_fim_ant := (v_inicio - interval '1 day')::date;

  -- Mesmo mes ano anterior
  v_inicio_ano_ant := make_date(p_ano - 1, p_mes, 1);
  v_fim_ano_ant := (v_inicio_ano_ant + interval '1 month' - interval '1 day')::date;

  -- Buscar nome da unidade
  IF p_unidade_id IS NOT NULL THEN
    SELECT nome INTO v_unidade_nome FROM unidades WHERE id = p_unidade_id;
  ELSE
    v_unidade_nome := 'Consolidado';
  END IF;

  -- Periodo
  v_result := v_result || jsonb_build_object('periodo', jsonb_build_object(
    'unidade_id', p_unidade_id,
    'unidade_nome', v_unidade_nome,
    'ano', p_ano,
    'mes', p_mes,
    'coordenadores', ARRAY['Quintela', 'Juliana']
  ));

  -- KPIs consolidados dos professores (agrupados por professor)
  v_result := v_result || jsonb_build_object('kpis_professores', (
    WITH
      carteira AS (
        SELECT a.professor_atual_id AS professor_id, a.unidade_id,
          COUNT(*) AS carteira_alunos,
          CASE WHEN COUNT(*) FILTER (WHERE a.valor_parcela > 0) > 0
            THEN ROUND(SUM(a.valor_parcela) / COUNT(*) FILTER (WHERE a.valor_parcela > 0), 2) ELSE 0 END AS ticket_medio,
          SUM(CASE WHEN a.valor_parcela > 0 THEN a.valor_parcela ELSE 0 END) AS mrr_carteira
        FROM alunos a
        WHERE a.professor_atual_id IS NOT NULL
          AND a.data_matricula <= v_fim
          AND (a.data_saida IS NULL OR a.data_saida >= v_inicio)
          AND a.status != 'lead'
          AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
        GROUP BY a.professor_atual_id, a.unidade_id
      ),
      presenca AS (
        SELECT ae.professor_id, ae.unidade_id,
          ROUND(COUNT(*) FILTER (WHERE ap.status = 'presente')::numeric / NULLIF(COUNT(*)::numeric, 0) * 100, 2) AS media_presenca
        FROM aulas_emusys ae
        JOIN aluno_presenca ap ON ap.aula_emusys_id = ae.id
        WHERE ae.data_aula BETWEEN v_inicio AND v_fim
          AND ae.cancelada = false
          AND (p_unidade_id IS NULL OR ae.unidade_id = p_unidade_id)
        GROUP BY ae.professor_id, ae.unidade_id
      ),
      turmas_calc AS (
        SELECT ae.professor_id, ae.unidade_id,
          COUNT(DISTINCT ae.turma_nome) AS total_turmas,
          ROUND(COUNT(DISTINCT ap.aluno_id)::numeric / NULLIF(COUNT(DISTINCT ae.turma_nome), 0), 2) AS media_alunos_turma
        FROM aulas_emusys ae
        JOIN aluno_presenca ap ON ap.aula_emusys_id = ae.id
        WHERE ae.data_aula BETWEEN v_inicio AND v_fim
          AND ae.cancelada = false
          AND (p_unidade_id IS NULL OR ae.unidade_id = p_unidade_id)
        GROUP BY ae.professor_id, ae.unidade_id
      ),
      experimentais AS (
        SELECT l.professor_experimental_id AS professor_id, l.unidade_id,
          SUM(CASE WHEN l.experimental_realizada THEN COALESCE(l.quantidade,1) ELSE 0 END) AS experimentais,
          SUM(CASE WHEN l.status IN ('matriculado','convertido') AND (l.experimental_realizada = true OR (l.converteu = true AND l.data_experimental IS NOT NULL AND l.faltou_experimental IS NOT TRUE)) THEN COALESCE(l.quantidade,1) ELSE 0 END) AS matriculas_pos_exp,
          SUM(CASE WHEN l.status IN ('matriculado','convertido') THEN COALESCE(l.quantidade,1) ELSE 0 END) AS matriculas
        FROM leads l
        WHERE l.professor_experimental_id IS NOT NULL
          AND l.data_contato BETWEEN v_inicio AND v_fim
          AND (p_unidade_id IS NULL OR l.unidade_id = p_unidade_id)
        GROUP BY l.professor_experimental_id, l.unidade_id
      ),
      renovacoes AS (
        SELECT COALESCE(m.professor_id, a.professor_atual_id) AS professor_id, m.unidade_id,
          COUNT(*) FILTER (WHERE m.tipo = 'renovacao') AS renovacoes,
          COUNT(*) FILTER (WHERE m.tipo = 'nao_renovacao') AS nao_renovacoes,
          COUNT(*) FILTER (WHERE m.tipo IN ('renovacao','nao_renovacao')) AS total_contratos
        FROM movimentacoes_admin m
        LEFT JOIN alunos a ON a.id = m.aluno_id
        WHERE COALESCE(m.professor_id, a.professor_atual_id) IS NOT NULL
          AND m.tipo IN ('renovacao','nao_renovacao')
          AND public.is_movimentacao_admin_retencao_valida(m.id)
          AND m.data BETWEEN v_inicio AND v_fim
          AND (p_unidade_id IS NULL OR m.unidade_id = p_unidade_id)
        GROUP BY COALESCE(m.professor_id, a.professor_atual_id), m.unidade_id
      ),
      evasoes AS (
        SELECT m.professor_id, m.unidade_id,
          COUNT(*) AS evasoes,
          SUM(COALESCE(m.valor_parcela_evasao, m.valor_parcela_anterior, 0)) AS mrr_perdido
        FROM movimentacoes_admin m
        LEFT JOIN alunos a ON a.id = m.aluno_id
        WHERE m.professor_id IS NOT NULL
          AND m.tipo IN ('evasao','nao_renovacao')
          AND public.is_movimentacao_admin_retencao_valida(m.id)
          AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false OR a.id IS NULL)
          AND m.data BETWEEN v_inicio AND v_fim
          AND (p_unidade_id IS NULL OR m.unidade_id = p_unidade_id)
        GROUP BY m.professor_id, m.unidade_id
      ),
      kpis_por_unidade AS (
        SELECT
          p.id AS professor_id,
          p.nome AS professor_nome,
          COALESCE(c.unidade_id, pr.unidade_id, e.unidade_id, r.unidade_id, ev.unidade_id) AS unidade_id,
          COALESCE(c.carteira_alunos, 0)::integer AS carteira_alunos,
          COALESCE(pr.media_presenca, 0)::numeric(5,2) AS media_presenca,
          COALESCE(tc.media_alunos_turma, 0)::numeric(5,2) AS media_alunos_turma,
          COALESCE(p.nps_medio, 0)::numeric(5,2) AS nps_medio,
          COALESCE(e.experimentais, 0)::integer AS experimentais,
          COALESCE(e.matriculas, 0)::integer AS matriculas,
          COALESCE(e.matriculas_pos_exp, 0)::integer AS matriculas_pos_exp,
          CASE WHEN COALESCE(e.experimentais,0) > 0
            THEN ROUND(COALESCE(e.matriculas_pos_exp,0)::numeric / e.experimentais * 100, 2) ELSE 0 END AS taxa_conversao,
          COALESCE(r.renovacoes, 0)::integer AS renovacoes,
          COALESCE(r.nao_renovacoes, 0)::integer AS nao_renovacoes,
          CASE WHEN COALESCE(r.total_contratos,0) > 0
            THEN ROUND(r.renovacoes::numeric / r.total_contratos * 100, 2) ELSE 0 END AS taxa_renovacao,
          COALESCE(ev.evasoes, 0)::integer AS evasoes,
          COALESCE(c.mrr_carteira, 0)::numeric(12,2) AS mrr_carteira,
          COALESCE(ev.mrr_perdido, 0)::numeric(12,2) AS mrr_perdido,
          CASE WHEN COALESCE(c.carteira_alunos,0) > 0
            THEN ROUND((COALESCE(c.carteira_alunos,0) - COALESCE(ev.evasoes,0))::numeric / c.carteira_alunos * 100, 2) ELSE 100 END AS taxa_retencao,
          0::numeric AS taxa_crescimento
        FROM professores p
        LEFT JOIN carteira c ON c.professor_id = p.id
        LEFT JOIN presenca pr ON pr.professor_id = p.id AND pr.unidade_id = c.unidade_id
        LEFT JOIN turmas_calc tc ON tc.professor_id = p.id AND tc.unidade_id = c.unidade_id
        LEFT JOIN experimentais e ON e.professor_id = p.id AND e.unidade_id = c.unidade_id
        LEFT JOIN renovacoes r ON r.professor_id = p.id AND r.unidade_id = c.unidade_id
        LEFT JOIN evasoes ev ON ev.professor_id = p.id AND ev.unidade_id = c.unidade_id
        WHERE p.ativo = true
          AND (c.professor_id IS NOT NULL OR pr.professor_id IS NOT NULL
               OR e.professor_id IS NOT NULL OR r.professor_id IS NOT NULL OR ev.professor_id IS NOT NULL)
      ),
      kpis_consolidados AS (
        SELECT
          professor_id,
          professor_nome,
          SUM(carteira_alunos) AS carteira_alunos,
          CASE WHEN SUM(carteira_alunos) > 0
            THEN ROUND(SUM(media_presenca * carteira_alunos) / SUM(carteira_alunos), 2)
            ELSE 0 END AS media_presenca,
          CASE WHEN SUM(carteira_alunos) > 0
            THEN ROUND(SUM(media_alunos_turma * carteira_alunos) / SUM(carteira_alunos), 2)
            ELSE 0 END AS media_alunos_turma,
          MAX(nps_medio) AS nps_medio,
          SUM(experimentais) AS experimentais,
          SUM(matriculas) AS matriculas,
          SUM(matriculas_pos_exp) AS matriculas_pos_exp,
          CASE WHEN SUM(experimentais) > 0
            THEN ROUND(SUM(matriculas_pos_exp)::numeric / SUM(experimentais) * 100, 2) ELSE 0 END AS taxa_conversao,
          SUM(renovacoes) AS renovacoes,
          SUM(nao_renovacoes) AS nao_renovacoes,
          CASE WHEN SUM(renovacoes) + SUM(nao_renovacoes) > 0
            THEN ROUND(SUM(renovacoes)::numeric / (SUM(renovacoes) + SUM(nao_renovacoes)) * 100, 2) ELSE 0 END AS taxa_renovacao,
          SUM(evasoes) AS evasoes,
          SUM(mrr_carteira) AS mrr_carteira,
          SUM(mrr_perdido) AS mrr_perdido,
          CASE WHEN SUM(carteira_alunos) > 0
            THEN ROUND((SUM(carteira_alunos) - SUM(evasoes))::numeric / SUM(carteira_alunos) * 100, 2) ELSE 100 END AS taxa_retencao,
          0::numeric AS taxa_crescimento,
          (SELECT COALESCE(array_agg(DISTINCT c.nome), ARRAY[]::text[])
           FROM professores_cursos pc
           JOIN cursos c ON c.id = pc.curso_id
           WHERE pc.professor_id = kpis_por_unidade.professor_id) AS cursos
        FROM kpis_por_unidade
        GROUP BY professor_id, professor_nome
      )
    SELECT COALESCE(jsonb_agg(row_to_json(k) ORDER BY k.carteira_alunos DESC), '[]'::jsonb)
    FROM kpis_consolidados k
  ));

  -- Totais consolidados (do kpis_professores ja consolidado)
  v_result := v_result || jsonb_build_object('totais', (
    SELECT row_to_json(t)
    FROM (
      SELECT
        jsonb_array_length(v_result->'kpis_professores') AS total_professores,
        (SELECT SUM((p->>'carteira_alunos')::int) FROM jsonb_array_elements(v_result->'kpis_professores') p) AS total_alunos,
        (SELECT ROUND(AVG((p->>'carteira_alunos')::numeric), 1) FROM jsonb_array_elements(v_result->'kpis_professores') p) AS media_alunos_professor,
        (SELECT ROUND(AVG(NULLIF((p->>'media_alunos_turma')::numeric, 0)), 2) FROM jsonb_array_elements(v_result->'kpis_professores') p) AS media_alunos_turma,
        (SELECT ROUND(AVG((p->>'media_presenca')::numeric), 1) FROM jsonb_array_elements(v_result->'kpis_professores') p) AS media_presenca,
        (SELECT ROUND(AVG(NULLIF((p->>'nps_medio')::numeric, 0)), 1) FROM jsonb_array_elements(v_result->'kpis_professores') p) AS nps_medio,
        (SELECT ROUND(AVG((p->>'taxa_conversao')::numeric), 1) FROM jsonb_array_elements(v_result->'kpis_professores') p) AS taxa_conversao_media,
        (SELECT ROUND(AVG((p->>'taxa_renovacao')::numeric), 1) FROM jsonb_array_elements(v_result->'kpis_professores') p) AS taxa_renovacao_media,
        (SELECT SUM((p->>'evasoes')::int) FROM jsonb_array_elements(v_result->'kpis_professores') p) AS total_evasoes,
        (SELECT SUM((p->>'matriculas')::int) FROM jsonb_array_elements(v_result->'kpis_professores') p) AS total_matriculas,
        (SELECT SUM((p->>'mrr_carteira')::numeric) FROM jsonb_array_elements(v_result->'kpis_professores') p) AS mrr_total
    ) t
  ));

  -- Top 5 por carteira
  v_result := v_result || jsonb_build_object('top_carteira', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'professor', p->>'professor_nome',
      'alunos', (p->>'carteira_alunos')::int
    )), '[]'::jsonb)
    FROM (
      SELECT p FROM jsonb_array_elements(v_result->'kpis_professores') p
      ORDER BY (p->>'carteira_alunos')::int DESC LIMIT 5
    ) sub
  ));

  -- Top 5 por media turma
  v_result := v_result || jsonb_build_object('top_media_turma', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'professor', p->>'professor_nome',
      'media', (p->>'media_alunos_turma')::numeric
    )), '[]'::jsonb)
    FROM (
      SELECT p FROM jsonb_array_elements(v_result->'kpis_professores') p
      WHERE (p->>'media_alunos_turma')::numeric > 0
      ORDER BY (p->>'media_alunos_turma')::numeric DESC LIMIT 5
    ) sub
  ));

  -- Top 5 por presenca
  v_result := v_result || jsonb_build_object('top_presenca', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'professor', p->>'professor_nome',
      'presenca', (p->>'media_presenca')::numeric
    )), '[]'::jsonb)
    FROM (
      SELECT p FROM jsonb_array_elements(v_result->'kpis_professores') p
      ORDER BY (p->>'media_presenca')::numeric DESC LIMIT 5
    ) sub
  ));

  -- Top 5 matriculadores
  v_result := v_result || jsonb_build_object('top_matriculadores', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'professor', p->>'professor_nome',
      'matriculas', (p->>'matriculas')::int
    )), '[]'::jsonb)
    FROM (
      SELECT p FROM jsonb_array_elements(v_result->'kpis_professores') p
      WHERE (p->>'matriculas')::int > 0
      ORDER BY (p->>'matriculas')::int DESC LIMIT 5
    ) sub
  ));

  -- Top 5 retencao
  v_result := v_result || jsonb_build_object('top_retencao', (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT
        p.nome AS professor,
        ROUND(AVG(a.tempo_permanencia_meses), 1) AS tempo_medio
      FROM alunos a
      JOIN professores p ON a.professor_atual_id = p.id
      WHERE a.data_matricula <= v_fim
        AND (a.data_saida IS NULL OR a.data_saida >= v_inicio)
        AND a.status != 'lead'
        AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
      GROUP BY p.id, p.nome
      HAVING COUNT(*) >= 3
      ORDER BY AVG(a.tempo_permanencia_meses) DESC
      LIMIT 5
    ) t
  ));

  -- Professores em alerta
  v_result := v_result || jsonb_build_object('professores_alerta', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'professor_id', (p->>'professor_id')::int,
      'professor', p->>'professor_nome',
      'presenca', (p->>'media_presenca')::numeric,
      'evasoes', (p->>'evasoes')::int,
      'alunos', (p->>'carteira_alunos')::int,
      'status', CASE
        WHEN (p->>'media_presenca')::numeric < 70 OR (p->>'evasoes')::int > 2 THEN 'critico'
        WHEN (p->>'media_presenca')::numeric < 80 OR (p->>'evasoes')::int > 0 THEN 'atencao'
        ELSE 'ok'
      END
    )), '[]'::jsonb)
    FROM (
      SELECT p FROM jsonb_array_elements(v_result->'kpis_professores') p
      WHERE (p->>'media_presenca')::numeric < 80 OR (p->>'evasoes')::int > 0
      ORDER BY (p->>'media_presenca')::numeric ASC
    ) sub
  ));

  -- Agenda (sem mudanca)
  v_result := v_result || jsonb_build_object('agenda', (
    SELECT row_to_json(a)
    FROM (
      SELECT
        (SELECT COUNT(*) FROM professor_acoes pa
         WHERE pa.tipo = 'treinamento'
           AND (p_unidade_id IS NULL OR pa.unidade_id = p_unidade_id)
           AND EXTRACT(YEAR FROM pa.data_agendada) = p_ano
           AND EXTRACT(MONTH FROM pa.data_agendada) = p_mes) AS treinamentos_agendados,
        (SELECT COUNT(*) FROM professor_acoes pa
         WHERE pa.tipo = 'reuniao'
           AND (p_unidade_id IS NULL OR pa.unidade_id = p_unidade_id)
           AND EXTRACT(YEAR FROM pa.data_agendada) = p_ano
           AND EXTRACT(MONTH FROM pa.data_agendada) = p_mes) AS reunioes_agendadas,
        (SELECT COUNT(*) FROM professor_acoes pa
         WHERE pa.tipo = 'checkpoint'
           AND (p_unidade_id IS NULL OR pa.unidade_id = p_unidade_id)
           AND EXTRACT(YEAR FROM pa.data_agendada) = p_ano
           AND EXTRACT(MONTH FROM pa.data_agendada) = p_mes) AS checkpoints_agendados,
        (SELECT COUNT(*) FROM professor_acoes pa
         WHERE pa.status = 'concluido'
           AND (p_unidade_id IS NULL OR pa.unidade_id = p_unidade_id)
           AND EXTRACT(YEAR FROM pa.data_agendada) = p_ano
           AND EXTRACT(MONTH FROM pa.data_agendada) = p_mes) AS concluidos,
        (SELECT COUNT(*) FROM professor_acoes pa
         WHERE pa.status = 'pendente'
           AND pa.data_agendada < CURRENT_DATE
           AND (p_unidade_id IS NULL OR pa.unidade_id = p_unidade_id)) AS atrasados
    ) a
  ));

  -- Catalogo treinamentos (sem mudanca)
  v_result := v_result || jsonb_build_object('catalogo_treinamentos', (
    SELECT COALESCE(jsonb_agg(row_to_json(ct)), '[]'::jsonb)
    FROM (
      SELECT id, nome, descricao
      FROM catalogo_treinamentos
      WHERE ativo = true
      ORDER BY nome
    ) ct
  ));

  -- Metas professores (sem mudanca)
  v_result := v_result || jsonb_build_object('metas_professores', (
    SELECT COALESCE(jsonb_object_agg(mk.tipo, mk.valor), '{}'::jsonb)
    FROM metas_kpi mk
    WHERE mk.ano = p_ano AND mk.mes = p_mes
      AND (p_unidade_id IS NULL OR mk.unidade_id = p_unidade_id)
      AND mk.tipo IN ('media_alunos_turma', 'media_alunos_professor', 'taxa_renovacao_prof',
                      'nps_medio', 'presenca_media', 'taxa_conversao_exp', 'melhor_retencao')
  ));

  -- Comparativo mes anterior
  v_result := v_result || jsonb_build_object('mes_anterior', (
    WITH
      cart_ant AS (
        SELECT a.professor_atual_id AS professor_id, COUNT(*) AS carteira_alunos
        FROM alunos a
        WHERE a.professor_atual_id IS NOT NULL
          AND a.data_matricula <= v_fim_ant
          AND (a.data_saida IS NULL OR a.data_saida >= v_inicio_ant)
          AND a.status != 'lead'
          AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
        GROUP BY a.professor_atual_id
      ),
      pres_ant AS (
        SELECT ae.professor_id,
          ROUND(COUNT(*) FILTER (WHERE ap.status = 'presente')::numeric / NULLIF(COUNT(*)::numeric, 0) * 100, 2) AS media_presenca
        FROM aulas_emusys ae
        JOIN aluno_presenca ap ON ap.aula_emusys_id = ae.id
        WHERE ae.data_aula BETWEEN v_inicio_ant AND v_fim_ant
          AND ae.cancelada = false
          AND (p_unidade_id IS NULL OR ae.unidade_id = p_unidade_id)
        GROUP BY ae.professor_id
      ),
      exp_ant AS (
        SELECT l.professor_experimental_id AS professor_id,
          SUM(CASE WHEN l.status IN ('matriculado','convertido') THEN COALESCE(l.quantidade,1) ELSE 0 END) AS matriculas
        FROM leads l
        WHERE l.professor_experimental_id IS NOT NULL
          AND l.data_contato BETWEEN v_inicio_ant AND v_fim_ant
          AND (p_unidade_id IS NULL OR l.unidade_id = p_unidade_id)
        GROUP BY l.professor_experimental_id
      ),
      ev_ant AS (
        SELECT m.professor_id, COUNT(*) AS evasoes
        FROM movimentacoes_admin m
        LEFT JOIN alunos a ON a.id = m.aluno_id
        WHERE m.professor_id IS NOT NULL
          AND m.tipo IN ('evasao','nao_renovacao')
          AND public.is_movimentacao_admin_retencao_valida(m.id)
          AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false OR a.id IS NULL)
          AND m.data BETWEEN v_inicio_ant AND v_fim_ant
          AND (p_unidade_id IS NULL OR m.unidade_id = p_unidade_id)
        GROUP BY m.professor_id
      ),
      profs_ant AS (
        SELECT DISTINCT COALESCE(c.professor_id, p.professor_id, e.professor_id, ev.professor_id) AS pid
        FROM cart_ant c
        FULL OUTER JOIN pres_ant p ON p.professor_id = c.professor_id
        FULL OUTER JOIN exp_ant e ON e.professor_id = c.professor_id
        FULL OUTER JOIN ev_ant ev ON ev.professor_id = c.professor_id
      )
    SELECT row_to_json(t)
    FROM (
      SELECT
        COUNT(*) AS total_professores,
        SUM(COALESCE(c.carteira_alunos, 0)) AS total_alunos,
        ROUND(AVG(COALESCE(p.media_presenca, 0)), 1) AS media_presenca,
        SUM(COALESCE(ev.evasoes, 0)) AS total_evasoes,
        SUM(COALESCE(e.matriculas, 0)) AS total_matriculas
      FROM profs_ant pa
      LEFT JOIN cart_ant c ON c.professor_id = pa.pid
      LEFT JOIN pres_ant p ON p.professor_id = pa.pid
      LEFT JOIN exp_ant e ON e.professor_id = pa.pid
      LEFT JOIN ev_ant ev ON ev.professor_id = pa.pid
    ) t
  ));

  -- Comparativo mesmo mes ano anterior
  v_result := v_result || jsonb_build_object('ano_anterior', (
    WITH
      cart_aa AS (
        SELECT a.professor_atual_id AS professor_id, COUNT(*) AS carteira_alunos
        FROM alunos a
        WHERE a.professor_atual_id IS NOT NULL
          AND a.data_matricula <= v_fim_ano_ant
          AND (a.data_saida IS NULL OR a.data_saida >= v_inicio_ano_ant)
          AND a.status != 'lead'
          AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
        GROUP BY a.professor_atual_id
      ),
      pres_aa AS (
        SELECT ae.professor_id,
          ROUND(COUNT(*) FILTER (WHERE ap.status = 'presente')::numeric / NULLIF(COUNT(*)::numeric, 0) * 100, 2) AS media_presenca
        FROM aulas_emusys ae
        JOIN aluno_presenca ap ON ap.aula_emusys_id = ae.id
        WHERE ae.data_aula BETWEEN v_inicio_ano_ant AND v_fim_ano_ant
          AND ae.cancelada = false
          AND (p_unidade_id IS NULL OR ae.unidade_id = p_unidade_id)
        GROUP BY ae.professor_id
      ),
      exp_aa AS (
        SELECT l.professor_experimental_id AS professor_id,
          SUM(CASE WHEN l.status IN ('matriculado','convertido') THEN COALESCE(l.quantidade,1) ELSE 0 END) AS matriculas
        FROM leads l
        WHERE l.professor_experimental_id IS NOT NULL
          AND l.data_contato BETWEEN v_inicio_ano_ant AND v_fim_ano_ant
          AND (p_unidade_id IS NULL OR l.unidade_id = p_unidade_id)
        GROUP BY l.professor_experimental_id
      ),
      ev_aa AS (
        SELECT m.professor_id, COUNT(*) AS evasoes
        FROM movimentacoes_admin m
        LEFT JOIN alunos a ON a.id = m.aluno_id
        WHERE m.professor_id IS NOT NULL
          AND m.tipo IN ('evasao','nao_renovacao')
          AND public.is_movimentacao_admin_retencao_valida(m.id)
          AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false OR a.id IS NULL)
          AND m.data BETWEEN v_inicio_ano_ant AND v_fim_ano_ant
          AND (p_unidade_id IS NULL OR m.unidade_id = p_unidade_id)
        GROUP BY m.professor_id
      ),
      profs_aa AS (
        SELECT DISTINCT COALESCE(c.professor_id, p.professor_id, e.professor_id, ev.professor_id) AS pid
        FROM cart_aa c
        FULL OUTER JOIN pres_aa p ON p.professor_id = c.professor_id
        FULL OUTER JOIN exp_aa e ON e.professor_id = c.professor_id
        FULL OUTER JOIN ev_aa ev ON ev.professor_id = c.professor_id
      )
    SELECT row_to_json(t)
    FROM (
      SELECT
        COUNT(*) AS total_professores,
        SUM(COALESCE(c.carteira_alunos, 0)) AS total_alunos,
        ROUND(AVG(COALESCE(p.media_presenca, 0)), 1) AS media_presenca,
        SUM(COALESCE(ev.evasoes, 0)) AS total_evasoes,
        SUM(COALESCE(e.matriculas, 0)) AS total_matriculas
      FROM profs_aa pa
      LEFT JOIN cart_aa c ON c.professor_id = pa.pid
      LEFT JOIN pres_aa p ON p.professor_id = pa.pid
      LEFT JOIN exp_aa e ON e.professor_id = pa.pid
      LEFT JOIN ev_aa ev ON ev.professor_id = pa.pid
    ) t
  ));

  RETURN v_result;
END;
 $function$;

-- ---- function: get_dados_retencao_ia_uuid_integer_integer.sql ----
CREATE OR REPLACE FUNCTION public.get_dados_retencao_ia(p_unidade_id uuid DEFAULT NULL::uuid, p_ano integer DEFAULT (EXTRACT(year FROM (now() AT TIME ZONE 'America/Sao_Paulo'::text)))::integer, p_mes integer DEFAULT (EXTRACT(month FROM (now() AT TIME ZONE 'America/Sao_Paulo'::text)))::integer)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  resultado jsonb;
  v_kpis jsonb;
  mes_anterior integer;
  ano_anterior integer;
  ano_passado integer;
begin
  if p_mes = 1 then
    mes_anterior := 12;
    ano_anterior := p_ano - 1;
  else
    mes_anterior := p_mes - 1;
    ano_anterior := p_ano;
  end if;

  ano_passado := p_ano - 1;
  v_kpis := public.get_kpis_alunos_canonicos(p_unidade_id, p_ano, p_mes);

  select jsonb_build_object(
    'periodo', jsonb_build_object(
      'ano', p_ano,
      'mes', p_mes,
      'mes_nome', trim(to_char(to_date(p_mes::text, 'MM'), 'Month'))
    ),
    'kpis_gestao', coalesce(v_kpis->'por_unidade', '[]'::jsonb),
    'kpis_alunos_canonicos', v_kpis,
    'kpis_retencao', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'unidade_id', kr.unidade_id,
        'unidade_nome', kr.unidade_nome,
        'total_evasoes', kr.total_evasoes,
        'avisos_previos', kr.avisos_previos,
        'renovacoes_previstas', kr.renovacoes_previstas,
        'renovacoes_realizadas', kr.renovacoes_realizadas,
        'nao_renovacoes', kr.nao_renovacoes,
        'renovacoes_pendentes', kr.renovacoes_pendentes,
        'taxa_renovacao', kr.taxa_renovacao,
        'taxa_nao_renovacao', kr.taxa_nao_renovacao,
        'mrr_perdido', kr.mrr_perdido
      )), '[]'::jsonb)
      from public.vw_kpis_retencao_mensal kr
      where (p_unidade_id is null or kr.unidade_id = p_unidade_id)
        and kr.ano = p_ano
        and kr.mes = p_mes
    ),
    'renovacoes_proximas', (
      select coalesce(jsonb_agg(row_to_json(rp)::jsonb), '[]'::jsonb)
      from public.get_resumo_renovacoes_proximas(p_unidade_id) rp
    ),
    'alunos_renovacao_urgente', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'aluno_nome', sub.aluno_nome,
        'professor_nome', sub.professor_nome,
        'curso_nome', sub.curso_nome,
        'valor_parcela', sub.valor_parcela,
        'dias_ate_vencimento', sub.dias_ate_vencimento,
        'tempo_permanencia_meses', sub.tempo_permanencia_meses,
        'telefone', sub.telefone
      ) order by sub.dias_ate_vencimento), '[]'::jsonb)
      from (
        select rp.aluno_nome,
               rp.professor_nome,
               rp.curso_nome,
               rp.valor_parcela,
               rp.dias_ate_vencimento,
               rp.tempo_permanencia_meses,
               rp.telefone
        from public.vw_renovacoes_proximas rp
        where (p_unidade_id is null or rp.unidade_id = p_unidade_id)
          and rp.status_renovacao in ('vencido', 'urgente_7_dias')
        order by rp.dias_ate_vencimento
        limit 20
      ) sub
    ),
    'mes_anterior', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'alunos_pagantes', dm.alunos_pagantes,
        'churn_rate', dm.churn_rate,
        'ticket_medio', dm.ticket_medio,
        'taxa_renovacao', dm.taxa_renovacao,
        'inadimplencia', dm.inadimplencia,
        'tempo_permanencia', dm.tempo_permanencia,
        'reajuste_parcelas', dm.reajuste_parcelas
      )), '[]'::jsonb)
      from public.dados_mensais dm
      where (p_unidade_id is null or dm.unidade_id = p_unidade_id)
        and dm.ano = ano_anterior
        and dm.mes = mes_anterior
    ),
    'mesmo_mes_ano_passado', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'alunos_pagantes', dm.alunos_pagantes,
        'churn_rate', dm.churn_rate,
        'ticket_medio', dm.ticket_medio,
        'taxa_renovacao', dm.taxa_renovacao,
        'inadimplencia', dm.inadimplencia,
        'tempo_permanencia', dm.tempo_permanencia,
        'reajuste_parcelas', dm.reajuste_parcelas
      )), '[]'::jsonb)
      from public.dados_mensais dm
      where (p_unidade_id is null or dm.unidade_id = p_unidade_id)
        and dm.ano = ano_passado
        and dm.mes = p_mes
    ),
    'metas', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'unidade_id', mt.unidade_id,
        'meta_leads', mt.meta_leads,
        'meta_experimentais', mt.meta_experimentais,
        'meta_matriculas', mt.meta_matriculas,
        'meta_taxa_conversao_experimental', mt.meta_taxa_conversao_experimental,
        'meta_taxa_conversao_lead', mt.meta_taxa_conversao_lead,
        'meta_faturamento_passaportes', mt.meta_faturamento_passaportes,
        'meta_alunos_pagantes', mt.meta_alunos_pagantes,
        'meta_alunos_ativos', mt.meta_alunos_ativos,
        'meta_ticket_medio', mt.meta_ticket_medio,
        'meta_churn_maximo', mt.meta_churn_maximo,
        'meta_evasoes_maximo', mt.meta_evasoes_maximo,
        'meta_renovacoes', mt.meta_renovacoes,
        'meta_taxa_renovacao', mt.meta_taxa_renovacao,
        'meta_inadimplencia_maxima', mt.meta_inadimplencia_maxima,
        'meta_ltv_meses', mt.meta_ltv_meses,
        'meta_faturamento_parcelas', mt.meta_faturamento_parcelas
      )), '[]'::jsonb)
      from public.metas mt
      where (p_unidade_id is null or mt.unidade_id = p_unidade_id or mt.unidade_id is null)
        and mt.ano = p_ano
        and (mt.mes = p_mes or mt.mes is null)
        and mt.ativo = true
    ),
    'evasoes_recentes', (
      -- Bloco operacional para IA/retencao. Inclui aviso_previo para contexto,
      -- portanto nao e fonte canonica de churn/evasao.
      select coalesce(jsonb_agg(jsonb_build_object(
        'aluno_nome', sub.aluno_nome,
        'professor_nome', sub.professor_nome,
        'motivo', sub.motivo,
        'tipo_saida', sub.tipo_saida,
        'valor_parcela', sub.valor_parcela,
        'tempo_permanencia', sub.tempo_permanencia,
        'data_saida', sub.data_saida
      ) order by sub.data_saida desc), '[]'::jsonb)
      from (
        select a.nome as aluno_nome,
               pr.nome as professor_nome,
               ms.nome as motivo,
               m.tipo as tipo_saida,
               coalesce(m.valor_parcela_evasao, m.valor_parcela_anterior) as valor_parcela,
               a.tempo_permanencia_meses as tempo_permanencia,
               m.data as data_saida
        from public.movimentacoes_admin m
        left join public.alunos a on m.aluno_id = a.id
        left join public.professores pr on m.professor_id = pr.id
        left join public.motivos_saida ms on m.motivo_saida_id = ms.id
        where m.tipo in ('evasao', 'nao_renovacao', 'aviso_previo')
           and (m.tipo = 'aviso_previo' or public.is_movimentacao_admin_retencao_valida(m.id))
          and (p_unidade_id is null or m.unidade_id = p_unidade_id)
          and m.data >= (current_date - interval '30 days')
        order by m.data desc
        limit 15
      ) sub
    ),
    'permanencia_por_faixa', (
      -- Bloco operacional preservado para shape. Ainda nao e contrato canonico
      -- de permanencia P0.1.
      select coalesce(jsonb_agg(jsonb_build_object(
        'faixa', faixa,
        'quantidade', quantidade,
        'percentual', round((quantidade::numeric / nullif(total, 0) * 100), 1)
      ) order by ordem), '[]'::jsonb)
      from (
        select
          case
            when tempo_permanencia_meses < 6 then '0-6 meses'
            when tempo_permanencia_meses < 12 then '6-12 meses'
            when tempo_permanencia_meses < 24 then '1-2 anos'
            when tempo_permanencia_meses < 36 then '2-3 anos'
            else '3+ anos'
          end as faixa,
          case
            when tempo_permanencia_meses < 6 then 1
            when tempo_permanencia_meses < 12 then 2
            when tempo_permanencia_meses < 24 then 3
            when tempo_permanencia_meses < 36 then 4
            else 5
          end as ordem,
          count(*) as quantidade,
          sum(count(*)) over () as total
        from public.alunos
        where status = 'ativo'
          and (p_unidade_id is null or unidade_id = p_unidade_id)
        group by faixa, ordem
      ) sub
    ),
    'dados_mes_atual', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'alunos_pagantes', dm.alunos_pagantes,
        'novas_matriculas', dm.novas_matriculas,
        'evasoes', dm.evasoes,
        'churn_rate', dm.churn_rate,
        'ticket_medio', dm.ticket_medio,
        'taxa_renovacao', dm.taxa_renovacao,
        'tempo_permanencia', dm.tempo_permanencia,
        'inadimplencia', dm.inadimplencia,
        'reajuste_parcelas', dm.reajuste_parcelas,
        'faturamento_estimado', dm.faturamento_estimado,
        'saldo_liquido', dm.saldo_liquido
      )), '[]'::jsonb)
      from public.dados_mensais dm
      where (p_unidade_id is null or dm.unidade_id = p_unidade_id)
        and dm.ano = p_ano
        and dm.mes = p_mes
    )
  )
  into resultado;

  return resultado::json;
end;
$function$;

-- ---- function: get_dados_retencao_ia_legacy_p01g_uuid_integer_integer.sql ----
CREATE OR REPLACE FUNCTION public.get_dados_retencao_ia_legacy_p01g(p_unidade_id uuid, p_ano integer, p_mes integer)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
  resultado JSON;
  mes_anterior INT;
  ano_anterior INT;
  ano_passado INT;
BEGIN
  IF p_mes = 1 THEN
    mes_anterior := 12;
    ano_anterior := p_ano - 1;
  ELSE
    mes_anterior := p_mes - 1;
    ano_anterior := p_ano;
  END IF;
  ano_passado := p_ano - 1;

  SELECT json_build_object(
    'periodo', json_build_object('ano', p_ano, 'mes', p_mes, 'mes_nome', TRIM(TO_CHAR(TO_DATE(p_mes::text, 'MM'), 'Month'))),
    'kpis_gestao', (
      SELECT COALESCE(json_agg(json_build_object(
        'unidade_id', kg.unidade_id, 'unidade_nome', kg.unidade_nome,
        'total_alunos_ativos', COALESCE(kg.total_alunos_ativos, 0),
        'total_alunos_pagantes', COALESCE(kg.total_alunos_pagantes, 0),
        'ticket_medio', COALESCE(kg.ticket_medio, 0), 'mrr', COALESCE(kg.mrr, 0),
        'tempo_permanencia_medio', COALESCE(kg.tempo_permanencia_medio, 0),
        'ltv_medio', COALESCE(kg.ltv_medio, 0), 'inadimplencia_pct', COALESCE(kg.inadimplencia_pct, 0),
        'faturamento_previsto', COALESCE(kg.faturamento_previsto, 0),
        'faturamento_realizado', COALESCE(kg.faturamento_realizado, 0),
        'churn_rate', COALESCE(kg.churn_rate, 0), 'total_evasoes', COALESCE(kg.total_evasoes, 0)
      )), '[]'::json) FROM vw_kpis_gestao_mensal kg
      WHERE (p_unidade_id IS NULL OR kg.unidade_id = p_unidade_id) AND kg.ano = p_ano AND kg.mes = p_mes
    ),
    'kpis_retencao', (
      SELECT COALESCE(json_agg(json_build_object(
        'unidade_id', kr.unidade_id, 'unidade_nome', kr.unidade_nome,
        'total_evasoes', kr.total_evasoes, 'avisos_previos', kr.avisos_previos,
        'renovacoes_previstas', kr.renovacoes_previstas, 'renovacoes_realizadas', kr.renovacoes_realizadas,
        'nao_renovacoes', kr.nao_renovacoes, 'renovacoes_pendentes', kr.renovacoes_pendentes,
        'taxa_renovacao', kr.taxa_renovacao, 'taxa_nao_renovacao', kr.taxa_nao_renovacao,
        'mrr_perdido', kr.mrr_perdido
      )), '[]'::json) FROM vw_kpis_retencao_mensal kr
      WHERE (p_unidade_id IS NULL OR kr.unidade_id = p_unidade_id) AND kr.ano = p_ano AND kr.mes = p_mes
    ),
    'renovacoes_proximas', (SELECT COALESCE(json_agg(row_to_json(rp)), '[]'::json) FROM get_resumo_renovacoes_proximas(p_unidade_id) rp),
    'alunos_renovacao_urgente', (
      SELECT COALESCE(json_agg(json_build_object(
        'aluno_nome', rp.aluno_nome, 'professor_nome', rp.professor_nome, 'curso_nome', rp.curso_nome,
        'valor_parcela', rp.valor_parcela, 'dias_ate_vencimento', rp.dias_ate_vencimento,
        'tempo_permanencia_meses', rp.tempo_permanencia_meses, 'telefone', rp.telefone
      ) ORDER BY rp.dias_ate_vencimento), '[]'::json)
      FROM vw_renovacoes_proximas rp
      WHERE (p_unidade_id IS NULL OR rp.unidade_id = p_unidade_id) AND rp.status_renovacao IN ('vencido', 'urgente_7_dias')
      LIMIT 20
    ),
    'mes_anterior', (
      SELECT COALESCE(json_agg(json_build_object(
        'alunos_pagantes', dm.alunos_pagantes, 'churn_rate', dm.churn_rate, 'ticket_medio', dm.ticket_medio,
        'taxa_renovacao', dm.taxa_renovacao, 'inadimplencia', dm.inadimplencia,
        'tempo_permanencia', dm.tempo_permanencia, 'reajuste_parcelas', dm.reajuste_parcelas
      )), '[]'::json) FROM dados_mensais dm
      WHERE (p_unidade_id IS NULL OR dm.unidade_id = p_unidade_id) AND dm.ano = ano_anterior AND dm.mes = mes_anterior
    ),
    'mesmo_mes_ano_passado', (
      SELECT COALESCE(json_agg(json_build_object(
        'alunos_pagantes', dm.alunos_pagantes, 'churn_rate', dm.churn_rate, 'ticket_medio', dm.ticket_medio,
        'taxa_renovacao', dm.taxa_renovacao, 'inadimplencia', dm.inadimplencia,
        'tempo_permanencia', dm.tempo_permanencia, 'reajuste_parcelas', dm.reajuste_parcelas
      )), '[]'::json) FROM dados_mensais dm
      WHERE (p_unidade_id IS NULL OR dm.unidade_id = p_unidade_id) AND dm.ano = ano_passado AND dm.mes = p_mes
    ),
    'metas', (
      SELECT COALESCE(json_agg(json_build_object(
        'unidade_id', mt.unidade_id, 'meta_leads', mt.meta_leads, 'meta_experimentais', mt.meta_experimentais,
        'meta_matriculas', mt.meta_matriculas, 'meta_taxa_conversao_experimental', mt.meta_taxa_conversao_experimental,
        'meta_taxa_conversao_lead', mt.meta_taxa_conversao_lead, 'meta_faturamento_passaportes', mt.meta_faturamento_passaportes,
        'meta_alunos_pagantes', mt.meta_alunos_pagantes, 'meta_alunos_ativos', mt.meta_alunos_ativos,
        'meta_ticket_medio', mt.meta_ticket_medio, 'meta_churn_maximo', mt.meta_churn_maximo,
        'meta_evasoes_maximo', mt.meta_evasoes_maximo, 'meta_renovacoes', mt.meta_renovacoes,
        'meta_taxa_renovacao', mt.meta_taxa_renovacao, 'meta_inadimplencia_maxima', mt.meta_inadimplencia_maxima,
        'meta_ltv_meses', mt.meta_ltv_meses, 'meta_faturamento_parcelas', mt.meta_faturamento_parcelas
      )), '[]'::json) FROM metas mt
      WHERE (p_unidade_id IS NULL OR mt.unidade_id = p_unidade_id OR mt.unidade_id IS NULL)
        AND mt.ano = p_ano AND (mt.mes = p_mes OR mt.mes IS NULL) AND mt.ativo = true
    ),
    'evasoes_recentes', (
      SELECT COALESCE(json_agg(json_build_object(
        'aluno_nome', a.nome, 'professor_nome', pr.nome, 'motivo', ms.nome,
        'tipo_saida', m.tipo, 'valor_parcela', COALESCE(m.valor_parcela_evasao, m.valor_parcela_anterior),
        'tempo_permanencia', a.tempo_permanencia_meses, 'data_saida', m.data
      ) ORDER BY m.data DESC), '[]'::json)
      FROM movimentacoes_admin m
      LEFT JOIN alunos a ON m.aluno_id = a.id
      LEFT JOIN professores pr ON m.professor_id = pr.id
      LEFT JOIN motivos_saida ms ON m.motivo_saida_id = ms.id
      WHERE m.tipo IN ('evasao', 'nao_renovacao', 'aviso_previo')
        AND (p_unidade_id IS NULL OR m.unidade_id = p_unidade_id)
        AND m.data >= (CURRENT_DATE - INTERVAL '30 days')
      LIMIT 15
    ),
    'permanencia_por_faixa', (
      SELECT COALESCE(json_agg(json_build_object(
        'faixa', faixa, 'quantidade', quantidade,
        'percentual', ROUND((quantidade::numeric / NULLIF(total, 0) * 100), 1)
      ) ORDER BY ordem), '[]'::json)
      FROM (
        SELECT CASE WHEN tempo_permanencia_meses < 6 THEN '0-6 meses' WHEN tempo_permanencia_meses < 12 THEN '6-12 meses'
          WHEN tempo_permanencia_meses < 24 THEN '1-2 anos' WHEN tempo_permanencia_meses < 36 THEN '2-3 anos' ELSE '3+ anos' END as faixa,
          CASE WHEN tempo_permanencia_meses < 6 THEN 1 WHEN tempo_permanencia_meses < 12 THEN 2
          WHEN tempo_permanencia_meses < 24 THEN 3 WHEN tempo_permanencia_meses < 36 THEN 4 ELSE 5 END as ordem,
          COUNT(*) as quantidade, SUM(COUNT(*)) OVER () as total
        FROM alunos WHERE status = 'ativo' AND (p_unidade_id IS NULL OR unidade_id = p_unidade_id)
        GROUP BY faixa, ordem
      ) sub
    ),
    'dados_mes_atual', (
      SELECT COALESCE(json_agg(json_build_object(
        'alunos_pagantes', dm.alunos_pagantes, 'novas_matriculas', dm.novas_matriculas,
        'evasoes', dm.evasoes, 'churn_rate', dm.churn_rate, 'ticket_medio', dm.ticket_medio,
        'taxa_renovacao', dm.taxa_renovacao, 'tempo_permanencia', dm.tempo_permanencia,
        'inadimplencia', dm.inadimplencia, 'reajuste_parcelas', dm.reajuste_parcelas,
        'faturamento_estimado', dm.faturamento_estimado, 'saldo_liquido', dm.saldo_liquido
      )), '[]'::json) FROM dados_mensais dm
      WHERE (p_unidade_id IS NULL OR dm.unidade_id = p_unidade_id) AND dm.ano = p_ano AND dm.mes = p_mes
    )
  ) INTO resultado;
  
  RETURN resultado;
END;
$function$;

-- ---- function: get_kpis_professor_periodo_integer_integer_uuid_date_date.sql ----
CREATE OR REPLACE FUNCTION public.get_kpis_professor_periodo(p_ano integer, p_mes integer, p_unidade_id uuid DEFAULT NULL::uuid, p_data_inicio date DEFAULT NULL::date, p_data_fim date DEFAULT NULL::date)
 RETURNS TABLE(professor_id integer, professor_nome text, unidade_id uuid, ano integer, mes integer, carteira_alunos integer, ticket_medio numeric, media_presenca numeric, taxa_faltas numeric, mrr_carteira numeric, nps_medio numeric, media_alunos_turma numeric, experimentais integer, experimentais_agendadas integer, experimentais_faltas integer, matriculas integer, matriculas_pos_exp integer, matriculas_diretas integer, taxa_conversao numeric, renovacoes integer, nao_renovacoes integer, taxa_renovacao numeric, evasoes integer, mrr_perdido numeric, taxa_cancelamento numeric, total_turmas integer, alunos_via_turmas integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_inicio DATE;
  v_fim    DATE;
BEGIN
  v_inicio := COALESCE(p_data_inicio, make_date(p_ano, p_mes, 1));
  v_fim    := COALESCE(p_data_fim, (v_inicio + interval '1 month' - interval '1 day')::date);

  RETURN QUERY
  WITH
    -- Carteira: apenas alunos ATIVOS (alinha com aba Carteira e com turmas_calc)
    carteira AS (
      SELECT a.professor_atual_id AS prof_id, a.unidade_id AS uid,
        COUNT(*)::integer AS carteira_alunos,
        CASE WHEN COUNT(*) FILTER (WHERE a.valor_parcela > 0) > 0
          THEN ROUND(SUM(a.valor_parcela) / COUNT(*) FILTER (WHERE a.valor_parcela > 0), 2)
          ELSE 0 END AS ticket_medio,
        SUM(CASE WHEN a.valor_parcela > 0 THEN a.valor_parcela ELSE 0 END) AS mrr_carteira
      FROM alunos a
        JOIN cursos cur ON a.curso_id = cur.id
      WHERE a.professor_atual_id IS NOT NULL
        AND a.status = 'ativo'
        AND (cur.is_projeto_banda IS NULL OR cur.is_projeto_banda = false)
        AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
      GROUP BY a.professor_atual_id, a.unidade_id
    ),
    presenca AS (
      SELECT ae.professor_id AS prof_id, ae.unidade_id AS uid,
        ROUND(COUNT(*) FILTER (WHERE ap.status = 'presente')::numeric
          / NULLIF(COUNT(*)::numeric, 0) * 100, 2) AS media_presenca
      FROM aulas_emusys ae
        JOIN aluno_presenca ap ON ap.aula_emusys_id = ae.id
      WHERE ae.data_aula BETWEEN v_inicio AND v_fim
        AND ae.cancelada = false
        AND (p_unidade_id IS NULL OR ae.unidade_id = p_unidade_id)
      GROUP BY ae.professor_id, ae.unidade_id
    ),
    -- Turmas: apenas ativos, agrupados por (curso, dia, horário)
    turmas_calc AS (
      SELECT
        a.professor_atual_id AS prof_id,
        a.unidade_id         AS uid,
        COUNT(DISTINCT (a.curso_id::text || '@' || a.dia_aula::text || ':' || a.horario_aula::text))::integer AS total_turmas,
        COUNT(*)::integer AS alunos_via_turmas,
        ROUND(
          COUNT(*)::numeric / NULLIF(
            COUNT(DISTINCT (a.curso_id::text || '@' || a.dia_aula::text || ':' || a.horario_aula::text)),
            0
          ), 2
        ) AS media_alunos_turma
      FROM alunos a
        JOIN cursos cur ON a.curso_id = cur.id
      WHERE a.professor_atual_id IS NOT NULL
        AND a.status = 'ativo'
        AND (cur.is_projeto_banda IS NULL OR cur.is_projeto_banda = false)
        AND a.dia_aula IS NOT NULL
        AND a.horario_aula IS NOT NULL
        AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
      GROUP BY a.professor_atual_id, a.unidade_id
    ),
    experimentais AS (
      SELECT l.professor_experimental_id AS prof_id, l.unidade_id AS uid,
        COUNT(*) FILTER (WHERE l.data_experimental BETWEEN v_inicio AND v_fim)::integer AS experimentais_agendadas,
        SUM(CASE WHEN l.data_experimental BETWEEN v_inicio AND v_fim AND l.experimental_realizada
          THEN COALESCE(l.quantidade,1) ELSE 0 END)::integer AS experimentais,
        COUNT(*) FILTER (
          WHERE l.data_experimental BETWEEN v_inicio AND v_fim
            AND (l.faltou_experimental = true
                 OR ((l.status IN ('matriculado','convertido')) AND l.experimental_realizada = false))
        )::integer AS experimentais_faltas,
        SUM(CASE WHEN l.data_experimental BETWEEN v_inicio AND v_fim
            AND l.status IN ('matriculado','convertido')
            AND (l.experimental_realizada = true OR (l.converteu = true AND l.faltou_experimental IS NOT TRUE))
          THEN COALESCE(l.quantidade,1) ELSE 0 END)::integer AS matriculas_pos_exp,
        SUM(CASE WHEN l.data_conversao BETWEEN v_inicio AND v_fim
            AND l.status IN ('matriculado','convertido')
            AND NOT (l.experimental_realizada = true OR (l.converteu = true AND l.data_experimental IS NOT NULL AND l.faltou_experimental IS NOT TRUE))
          THEN COALESCE(l.quantidade,1) ELSE 0 END)::integer AS matriculas_diretas,
        SUM(CASE WHEN l.status IN ('matriculado','convertido')
            AND (
              (l.data_experimental BETWEEN v_inicio AND v_fim AND (l.experimental_realizada = true OR (l.converteu = true AND l.faltou_experimental IS NOT TRUE)))
              OR (l.data_conversao BETWEEN v_inicio AND v_fim AND NOT (l.experimental_realizada = true OR l.converteu = true))
            )
          THEN COALESCE(l.quantidade,1) ELSE 0 END)::integer AS matriculas
      FROM leads l
      WHERE l.professor_experimental_id IS NOT NULL
        AND (l.data_experimental BETWEEN v_inicio AND v_fim OR l.data_conversao BETWEEN v_inicio AND v_fim)
        AND (p_unidade_id IS NULL OR l.unidade_id = p_unidade_id)
      GROUP BY l.professor_experimental_id, l.unidade_id
    ),
    renovacoes AS (
      SELECT COALESCE(m.professor_id, a.professor_atual_id) AS prof_id, m.unidade_id AS uid,
        COUNT(*) FILTER (WHERE m.tipo = 'renovacao')::integer AS renovacoes,
        COUNT(*) FILTER (WHERE m.tipo = 'nao_renovacao')::integer AS nao_renovacoes,
        COUNT(*) FILTER (WHERE m.tipo IN ('renovacao','nao_renovacao'))::integer AS total_contratos
      FROM movimentacoes_admin m
        LEFT JOIN alunos a ON a.id = m.aluno_id
      WHERE COALESCE(m.professor_id, a.professor_atual_id) IS NOT NULL
        AND m.tipo IN ('renovacao','nao_renovacao')
          AND public.is_movimentacao_admin_retencao_valida(m.id)
        AND m.data BETWEEN v_inicio AND v_fim
        AND (p_unidade_id IS NULL OR m.unidade_id = p_unidade_id)
      GROUP BY COALESCE(m.professor_id, a.professor_atual_id), m.unidade_id
    ),
    evasoes AS (
      SELECT m.professor_id AS prof_id, m.unidade_id AS uid,
        COUNT(*)::integer AS evasoes,
        SUM(COALESCE(m.valor_parcela_evasao, m.valor_parcela_anterior, 0)) AS mrr_perdido
      FROM movimentacoes_admin m
        LEFT JOIN alunos a ON a.id = m.aluno_id
        LEFT JOIN motivos_saida ms ON ms.id = COALESCE(
          m.motivo_saida_id,
          (SELECT ms2.id FROM motivos_saida ms2 WHERE ms2.nome ILIKE m.motivo AND ms2.ativo = true LIMIT 1)
        )
      WHERE m.professor_id IS NOT NULL
        AND m.tipo IN ('evasao','nao_renovacao')
          AND public.is_movimentacao_admin_retencao_valida(m.id)
        AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false OR a.id IS NULL)
        AND ms.conta_score_professor = true
        AND m.data BETWEEN v_inicio AND v_fim
        AND (p_unidade_id IS NULL OR m.unidade_id = p_unidade_id)
      GROUP BY m.professor_id, m.unidade_id
    ),
    unidades_prof AS (
      SELECT prof_id, uid FROM carteira
      UNION SELECT prof_id, uid FROM presenca
      UNION SELECT prof_id, uid FROM turmas_calc
      UNION SELECT prof_id, uid FROM experimentais
      UNION SELECT prof_id, uid FROM renovacoes
      UNION SELECT prof_id, uid FROM evasoes
    )
  SELECT
    p.id AS professor_id,
    p.nome::text AS professor_nome,
    up.uid AS unidade_id,
    p_ano AS ano, p_mes AS mes,
    COALESCE(c.carteira_alunos, 0)::integer,
    COALESCE(c.ticket_medio, 0)::numeric(10,2),
    COALESCE(pr.media_presenca, 0)::numeric(5,2),
    COALESCE(100 - pr.media_presenca, 0)::numeric(5,2),
    COALESCE(c.mrr_carteira, 0)::numeric(12,2),
    COALESCE(p.nps_medio, 0)::numeric(5,2),
    COALESCE(tc.media_alunos_turma, 0)::numeric(5,2),
    COALESCE(ex.experimentais, 0)::integer,
    COALESCE(ex.experimentais_agendadas, 0)::integer,
    COALESCE(ex.experimentais_faltas, 0)::integer,
    COALESCE(ex.matriculas, 0)::integer,
    COALESCE(ex.matriculas_pos_exp, 0)::integer,
    COALESCE(ex.matriculas_diretas, 0)::integer,
    CASE WHEN COALESCE(ex.experimentais,0) > 0
      THEN ROUND(COALESCE(ex.matriculas_pos_exp,0)::numeric / ex.experimentais * 100, 2)
      ELSE 0 END::numeric(5,2),
    COALESCE(r.renovacoes, 0)::integer,
    COALESCE(r.nao_renovacoes, 0)::integer,
    CASE WHEN COALESCE(r.total_contratos,0) > 0
      THEN ROUND(r.renovacoes::numeric / r.total_contratos * 100, 2)
      ELSE 0 END::numeric(5,2),
    COALESCE(ev.evasoes, 0)::integer,
    COALESCE(ev.mrr_perdido, 0)::numeric(12,2),
    CASE WHEN COALESCE(c.carteira_alunos,0) > 0
      THEN ROUND(COALESCE(ev.evasoes,0)::numeric / c.carteira_alunos * 100, 2)
      ELSE 0 END::numeric(5,2),
    COALESCE(tc.total_turmas, 0)::integer,
    COALESCE(tc.alunos_via_turmas, 0)::integer
  FROM unidades_prof up
    JOIN professores p ON p.id = up.prof_id
    LEFT JOIN carteira    c  ON c.prof_id  = p.id AND c.uid  = up.uid
    LEFT JOIN presenca    pr ON pr.prof_id = p.id AND pr.uid = up.uid
    LEFT JOIN turmas_calc tc ON tc.prof_id = p.id AND tc.uid = up.uid
    LEFT JOIN experimentais ex ON ex.prof_id = p.id AND ex.uid = up.uid
    LEFT JOIN renovacoes  r  ON r.prof_id  = p.id AND r.uid  = up.uid
    LEFT JOIN evasoes     ev ON ev.prof_id  = p.id AND ev.uid = up.uid
  WHERE p.ativo = true
  ORDER BY p.id, up.uid;
END;
$function$;

-- ---- function: stats_pesquisa_evasao_uuid_integer_integer.sql ----
CREATE OR REPLACE FUNCTION public.stats_pesquisa_evasao(p_unidade_id uuid, p_ano integer, p_mes integer)
 RETURNS TABLE(total_evadidos bigint, total_com_telefone bigint, total_pendentes bigint, total_enviados bigint, total_respondidos bigint, total_falhas bigint, taxa_resposta numeric, respondidos_texto bigint, respondidos_audio bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  WITH evadidos_mes AS (
    SELECT m.*,
      COALESCE(m.telefone_snapshot, a.whatsapp, a.telefone) AS tel
    FROM movimentacoes_admin m
    LEFT JOIN alunos a ON a.id = m.aluno_id
    WHERE m.tipo IN ('evasao', 'nao_renovacao')
      AND public.is_movimentacao_admin_retencao_valida(m.id)
      AND EXTRACT(YEAR FROM m.data) = p_ano
      AND EXTRACT(MONTH FROM m.data) = p_mes
      AND (p_unidade_id IS NULL OR m.unidade_id = p_unidade_id)
  ),
  stats AS (
    SELECT 
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE tel IS NOT NULL) AS com_telefone,
      COUNT(*) FILTER (WHERE pe.status = 'pendente' OR pe.id IS NULL) AS pendentes,
      COUNT(*) FILTER (WHERE pe.status = 'enviado') AS enviados,
      COUNT(*) FILTER (WHERE pe.status = 'respondido') AS respondidos,
      COUNT(*) FILTER (WHERE pe.status IN ('falha_envio', 'sem_whatsapp')) AS falhas,
      COUNT(*) FILTER (WHERE pe.status = 'respondido' AND pe.resposta_tipo = 'texto') AS resp_texto,
      COUNT(*) FILTER (WHERE pe.status = 'respondido' AND pe.resposta_tipo = 'audio') AS resp_audio
    FROM evadidos_mes em
    LEFT JOIN pesquisa_evasao pe ON pe.evasao_id = em.id
  )
  SELECT 
    s.total AS total_evadidos,
    s.com_telefone AS total_com_telefone,
    s.pendentes AS total_pendentes,
    s.enviados AS total_enviados,
    s.respondidos AS total_respondidos,
    s.falhas AS total_falhas,
    CASE 
      WHEN (s.enviados + s.respondidos) > 0 
      THEN ROUND(s.respondidos::numeric / (s.enviados + s.respondidos) * 100, 1)
      ELSE 0 
    END AS taxa_resposta,
    s.resp_texto AS respondidos_texto,
    s.resp_audio AS respondidos_audio
  FROM stats s;
END;
$function$;

-- ---- function: listar_evadidos_para_pesquisa_uuid_integer_integer_character_varying_integer_integer.sql ----
CREATE OR REPLACE FUNCTION public.listar_evadidos_para_pesquisa(p_unidade_id uuid, p_limite integer, p_offset integer, p_status character varying, p_ano integer, p_mes integer)
 RETURNS TABLE(evasao_id integer, aluno_id integer, nome text, telefone text, curso text, professor text, tempo_meses integer, data_evasao date, motivo_cadastrado text, pesquisa_status text, pesquisa_id uuid, resposta_texto text, resposta_audio_url text, resposta_tipo text, respondido_em timestamp with time zone, is_menor boolean, responsavel_nome text)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    m.id AS evasao_id,
    m.aluno_id,
    COALESCE(m.aluno_nome, a.nome)::TEXT AS nome,
    COALESCE(m.telefone_snapshot, a.whatsapp, a.telefone)::TEXT AS telefone,
    c.nome::TEXT AS curso,
    p.nome::TEXT AS professor,
    GREATEST(0, COALESCE(m.tempo_permanencia_meses, 0))::INTEGER AS tempo_meses,
    m.data AS data_evasao,
    ms.nome::TEXT AS motivo_cadastrado,
    COALESCE(pe.status, 'pendente')::TEXT AS pesquisa_status,
    pe.id AS pesquisa_id,
    pe.resposta_texto,
    pe.resposta_audio_url::TEXT,
    pe.resposta_tipo::TEXT,
    pe.respondido_em,
    CASE 
      WHEN a.data_nascimento IS NOT NULL 
        AND EXTRACT(YEAR FROM age(CURRENT_DATE, a.data_nascimento))::INTEGER < 18 
      THEN TRUE 
      ELSE FALSE 
    END AS is_menor,
    COALESCE(a.responsavel_nome, '—')::TEXT AS responsavel_nome
  FROM movimentacoes_admin m
  LEFT JOIN alunos a ON a.id = m.aluno_id
  LEFT JOIN cursos c ON c.id = a.curso_id
  LEFT JOIN professores p ON p.id = m.professor_id
  LEFT JOIN motivos_saida ms ON ms.id = m.motivo_saida_id
  LEFT JOIN pesquisa_evasao pe ON pe.evasao_id = m.id
  WHERE m.tipo IN ('evasao', 'nao_renovacao')
      AND public.is_movimentacao_admin_retencao_valida(m.id)
    AND (p_unidade_id IS NULL OR m.unidade_id = p_unidade_id)
    AND COALESCE(m.telefone_snapshot, a.whatsapp, a.telefone) IS NOT NULL
    AND (p_status IS NULL OR COALESCE(pe.status, 'pendente') = p_status)
    AND (p_ano IS NULL OR EXTRACT(YEAR FROM m.data)::INTEGER = p_ano)
    AND (p_mes IS NULL OR EXTRACT(MONTH FROM m.data)::INTEGER = p_mes)
  ORDER BY
    CASE COALESCE(pe.status, 'pendente')
      WHEN 'pendente' THEN 1
      WHEN 'enviado' THEN 2
      WHEN 'respondido' THEN 3
      ELSE 4
    END,
    m.data DESC
  LIMIT p_limite OFFSET p_offset;
END;
$function$;

-- ---- function: listar_evadidos_para_pesquisa_uuid_integer_integer_character_varying.sql ----
CREATE OR REPLACE FUNCTION public.listar_evadidos_para_pesquisa(p_unidade_id uuid, p_limite integer, p_offset integer, p_status character varying)
 RETURNS TABLE(evasao_id integer, aluno_id integer, nome text, telefone text, curso text, professor text, tempo_meses integer, data_evasao date, motivo_cadastrado text, pesquisa_status text, pesquisa_id uuid, resposta_texto text, respondido_em timestamp with time zone)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    m.id AS evasao_id,
    m.aluno_id,
    COALESCE(m.aluno_nome, a.nome)::TEXT AS nome,
    COALESCE(m.telefone_snapshot, a.whatsapp, a.telefone)::TEXT AS telefone,
    c.nome::TEXT AS curso,
    p.nome::TEXT AS professor,
    COALESCE(a.tempo_permanencia_meses, 0)::INTEGER AS tempo_meses,
    m.data AS data_evasao,
    ms.nome::TEXT AS motivo_cadastrado,
    COALESCE(pe.status, 'pendente')::TEXT AS pesquisa_status,
    pe.id AS pesquisa_id,
    pe.resposta_texto,
    pe.respondido_em
  FROM movimentacoes_admin m
  LEFT JOIN alunos a ON a.id = m.aluno_id
  LEFT JOIN cursos c ON c.id = COALESCE(m.curso_id, a.curso_id)
  LEFT JOIN professores p ON p.id = COALESCE(m.professor_id, a.professor_atual_id)
  LEFT JOIN motivos_saida ms ON ms.id = m.motivo_saida_id
  LEFT JOIN pesquisa_evasao pe ON pe.evasao_id = m.id
  WHERE m.tipo IN ('evasao', 'nao_renovacao')
      AND public.is_movimentacao_admin_retencao_valida(m.id)
    AND (p_unidade_id IS NULL OR m.unidade_id = p_unidade_id)
    AND COALESCE(m.telefone_snapshot, a.whatsapp, a.telefone) IS NOT NULL
    AND (p_status IS NULL OR COALESCE(pe.status, 'pendente') = p_status)
  ORDER BY 
    CASE COALESCE(pe.status, 'pendente')
      WHEN 'pendente' THEN 1
      WHEN 'enviado' THEN 2
      WHEN 'respondido' THEN 3
      ELSE 4
    END,
    m.data DESC
  LIMIT p_limite OFFSET p_offset;
END;
$function$;

-- ---- view: vw_alertas_inteligentes ----
CREATE OR REPLACE VIEW public.vw_alertas_inteligentes AS
 WITH churn_realtime AS (
         SELECT u.id AS unidade_id,
            u.nome AS unidade_nome,
            COALESCE(em.evasoes, (0)::bigint) AS evasoes,
            COALESCE(ap.alunos_pagantes, (0)::bigint) AS alunos_pagantes,
                CASE
                    WHEN (COALESCE(ap.alunos_pagantes, (0)::bigint) > 0) THEN round((((COALESCE(em.evasoes, (0)::bigint))::numeric / (ap.alunos_pagantes)::numeric) * (100)::numeric), 2)
                    ELSE (0)::numeric
                END AS churn_rate
           FROM ((unidades u
             LEFT JOIN ( SELECT m.unidade_id,
                    count(*) AS evasoes
                   FROM movimentacoes_admin m
                  WHERE (public.is_movimentacao_admin_retencao_valida(m.id) AND (EXTRACT(year FROM m.data) = EXTRACT(year FROM CURRENT_DATE)) AND (EXTRACT(month FROM m.data) = EXTRACT(month FROM CURRENT_DATE)) AND ((m.tipo)::text = ANY ((ARRAY['evasao'::character varying, 'nao_renovacao'::character varying])::text[])))
                  GROUP BY m.unidade_id) em ON ((em.unidade_id = u.id)))
             LEFT JOIN ( SELECT a.unidade_id,
                    count(*) AS alunos_pagantes
                   FROM alunos a
                  WHERE (((a.status)::text = 'ativo'::text) AND (a.valor_parcela > (0)::numeric) AND ((a.is_segundo_curso = false) OR (a.is_segundo_curso IS NULL)))
                  GROUP BY a.unidade_id) ap ON ((ap.unidade_id = u.id)))
          WHERE (u.ativo = true)
        ), ticket_realtime AS (
         SELECT mrr.unidade_id,
                CASE
                    WHEN (COALESCE(pag.pagantes_unicos, (0)::bigint) > 0) THEN (mrr.mrr_total / (pag.pagantes_unicos)::numeric)
                    ELSE (0)::numeric
                END AS ticket_atual
           FROM (( SELECT alunos.unidade_id,
                    sum(alunos.valor_parcela) AS mrr_total
                   FROM alunos
                  WHERE (((alunos.status)::text = 'ativo'::text) AND (alunos.valor_parcela > (0)::numeric))
                  GROUP BY alunos.unidade_id) mrr
             LEFT JOIN ( SELECT alunos.unidade_id,
                    count(*) AS pagantes_unicos
                   FROM alunos
                  WHERE (((alunos.status)::text = 'ativo'::text) AND (alunos.valor_parcela > (0)::numeric) AND ((alunos.is_segundo_curso = false) OR (alunos.is_segundo_curso IS NULL)))
                  GROUP BY alunos.unidade_id) pag ON ((pag.unidade_id = mrr.unidade_id)))
        )
 SELECT tipo_alerta,
    severidade,
    unidade_id,
    unidade_nome,
    quantidade,
    descricao,
    detalhe,
    valor_atual,
    valor_meta,
    data_referencia
   FROM ( SELECT 'CONTRATO_VENCENDO'::text AS tipo_alerta,
            'critico'::text AS severidade,
            a.unidade_id,
            u.nome AS unidade_nome,
            (count(*))::integer AS quantidade,
            'Contratos vencendo em 30 dias sem renovação'::text AS descricao,
            concat(count(*), ' alunos com contrato vencendo até ', to_char((CURRENT_DATE + '30 days'::interval), 'DD/MM'::text)) AS detalhe,
            NULL::numeric AS valor_atual,
            NULL::numeric AS valor_meta,
            CURRENT_DATE AS data_referencia
           FROM ((alunos a
             JOIN unidades u ON ((a.unidade_id = u.id)))
             LEFT JOIN renovacoes r ON (((r.aluno_id = a.id) AND (r.data_fim_novo_contrato > a.data_fim_contrato) AND ((r.status)::text = 'concluida'::text))))
          WHERE (((a.status)::text = 'ativo'::text) AND (a.data_fim_contrato >= CURRENT_DATE) AND (a.data_fim_contrato <= (CURRENT_DATE + '30 days'::interval)) AND (r.id IS NULL))
          GROUP BY a.unidade_id, u.nome
         HAVING (count(*) > 0)
        UNION ALL
         SELECT 'RENOVACOES_PENDENTES'::text,
            'atencao'::text,
            a.unidade_id,
            u.nome,
            (count(*))::integer AS count,
            'Renovações pendentes para este mês'::text,
            concat(count(*), ' contratos vencem este mês') AS concat,
            NULL::numeric,
            NULL::numeric,
            CURRENT_DATE AS "current_date"
           FROM (alunos a
             JOIN unidades u ON ((a.unidade_id = u.id)))
          WHERE (((a.status)::text = 'ativo'::text) AND (EXTRACT(month FROM a.data_fim_contrato) = EXTRACT(month FROM CURRENT_DATE)) AND (EXTRACT(year FROM a.data_fim_contrato) = EXTRACT(year FROM CURRENT_DATE)))
          GROUP BY a.unidade_id, u.nome
         HAVING (count(*) > 0)
        UNION ALL
         SELECT 'CONVERSAO_BAIXA'::text,
                CASE
                    WHEN ((((dc.novas_matriculas_total)::numeric / (NULLIF(dc.aulas_experimentais, 0))::numeric) * (100)::numeric) < (10)::numeric) THEN 'critico'::text
                    ELSE 'atencao'::text
                END AS "case",
            u.id,
            u.nome,
            1,
            'Taxa de conversão abaixo da meta'::text,
            concat('Conversão: ', round((((dc.novas_matriculas_total)::numeric / (NULLIF(dc.aulas_experimentais, 0))::numeric) * (100)::numeric), 1), '% (meta: 13.5%)') AS concat,
            round((((dc.novas_matriculas_total)::numeric / (NULLIF(dc.aulas_experimentais, 0))::numeric) * (100)::numeric), 1) AS round,
            13.5,
            dc.competencia
           FROM (dados_comerciais dc
             JOIN unidades u ON ((lower((u.nome)::text) = lower((dc.unidade)::text))))
          WHERE ((dc.competencia = date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone)) AND (dc.aulas_experimentais > 0) AND ((((dc.novas_matriculas_total)::numeric / (dc.aulas_experimentais)::numeric) * (100)::numeric) < 13.5))
        UNION ALL
         SELECT 'CHURN_ALTO'::text,
                CASE
                    WHEN (cr.churn_rate > (6)::numeric) THEN 'critico'::text
                    ELSE 'atencao'::text
                END AS "case",
            cr.unidade_id,
            cr.unidade_nome,
            1,
            'Churn acima da meta mensal'::text,
            concat('Churn: ', cr.churn_rate, '% (meta: 4%) - ', cr.evasoes, ' evasões / ', cr.alunos_pagantes, ' pagantes') AS concat,
            cr.churn_rate,
            4.0,
            CURRENT_DATE AS "current_date"
           FROM churn_realtime cr
          WHERE (cr.churn_rate > (4)::numeric)
        UNION ALL
         SELECT 'TICKET_CAINDO'::text,
            'atencao'::text,
            tr.unidade_id,
            u.nome,
            1,
            'Ticket médio caindo vs mês anterior'::text,
            concat('Ticket caiu ', round((((dm.ticket_medio - tr.ticket_atual) / NULLIF(dm.ticket_medio, (0)::numeric)) * (100)::numeric), 1), '% (R$', round(dm.ticket_medio), ' → R$', round(tr.ticket_atual), ')') AS concat,
            tr.ticket_atual,
            dm.ticket_medio,
            CURRENT_DATE AS "current_date"
           FROM ((ticket_realtime tr
             JOIN unidades u ON ((u.id = tr.unidade_id)))
             JOIN dados_mensais dm ON (((dm.unidade_id = tr.unidade_id) AND ((((dm.ano)::numeric = EXTRACT(year FROM CURRENT_DATE)) AND ((dm.mes)::numeric = (EXTRACT(month FROM CURRENT_DATE) - (1)::numeric))) OR (((dm.ano)::numeric = (EXTRACT(year FROM CURRENT_DATE) - (1)::numeric)) AND (dm.mes = 12) AND (EXTRACT(month FROM CURRENT_DATE) = (1)::numeric))))))
          WHERE (tr.ticket_atual < dm.ticket_medio)
        UNION ALL
         SELECT 'PROFESSOR_TURMA_BAIXA'::text,
            'informativo'::text,
            pu.unidade_id,
            u.nome,
            (count(DISTINCT t.professor_id))::integer AS count,
            'Professores com média alunos/turma baixa'::text,
            concat(count(DISTINCT t.professor_id), ' professores com média < 1.5 alunos/turma') AS concat,
            NULL::numeric,
            1.5,
            CURRENT_DATE AS "current_date"
           FROM ((( SELECT vw_turmas_implicitas.professor_id,
                    vw_turmas_implicitas.unidade_id,
                    avg(vw_turmas_implicitas.total_alunos) AS media
                   FROM vw_turmas_implicitas
                  GROUP BY vw_turmas_implicitas.professor_id, vw_turmas_implicitas.unidade_id
                 HAVING (avg(vw_turmas_implicitas.total_alunos) < 1.5)) t
             JOIN professores_unidades pu ON (((t.professor_id = pu.professor_id) AND (t.unidade_id = pu.unidade_id))))
             JOIN unidades u ON ((pu.unidade_id = u.id)))
          GROUP BY pu.unidade_id, u.nome
         HAVING (count(DISTINCT t.professor_id) > 0)
        UNION ALL
         SELECT 'META_EM_RISCO'::text,
            'critico'::text,
            mk.unidade_id,
            u.nome,
            1,
            concat('Meta de ', mk.tipo, ' em risco') AS concat,
            concat(mk.tipo, ': realizado abaixo de 70% da meta') AS concat,
            NULL::numeric,
            mk.valor,
            make_date(mk.ano, mk.mes, 1) AS make_date
           FROM (metas_kpi mk
             JOIN unidades u ON ((mk.unidade_id = u.id)))
          WHERE (((mk.ano)::numeric = EXTRACT(year FROM CURRENT_DATE)) AND ((mk.mes)::numeric = EXTRACT(month FROM CURRENT_DATE)) AND ((mk.tipo)::text = ANY ((ARRAY['matriculas'::character varying, 'alunos_ativos'::character varying])::text[])))) alertas
  ORDER BY
        CASE severidade
            WHEN 'critico'::text THEN 1
            WHEN 'atencao'::text THEN 2
            ELSE 3
        END, quantidade DESC;;

-- ---- view: vw_dashboard_unidade ----
CREATE OR REPLACE VIEW public.vw_dashboard_unidade AS
 WITH alunos_ativos AS (
         SELECT a.unidade_id,
            count(*) FILTER (WHERE ((a.is_segundo_curso IS NULL) OR (a.is_segundo_curso = false))) AS total_ativos,
            count(*) FILTER (WHERE ((tm.conta_como_pagante = true) AND ((a.is_segundo_curso IS NULL) OR (a.is_segundo_curso = false)))) AS total_pagantes,
                CASE
                    WHEN (count(*) FILTER (WHERE ((a.valor_parcela > (0)::numeric) AND ((a.is_segundo_curso IS NULL) OR (a.is_segundo_curso = false)))) > 0) THEN (sum(a.valor_parcela) FILTER (WHERE (a.valor_parcela > (0)::numeric)) / (count(*) FILTER (WHERE ((a.valor_parcela > (0)::numeric) AND ((a.is_segundo_curso IS NULL) OR (a.is_segundo_curso = false)))))::numeric)
                    ELSE (0)::numeric
                END AS ticket_medio,
            sum(a.valor_parcela) FILTER (WHERE ((tm.conta_como_pagante = true) AND ((COALESCE(a.status_pagamento, ''::character varying))::text <> 'sem_parcela'::text))) AS mrr
           FROM (alunos a
             LEFT JOIN tipos_matricula tm ON ((tm.id = a.tipo_matricula_id)))
          WHERE ((a.status)::text = ANY (ARRAY[('ativo'::character varying)::text, ('trancado'::character varying)::text]))
          GROUP BY a.unidade_id
        ), permanencia_combinada AS (
         SELECT alunos_historico.unidade_id AS uid,
            alunos_historico.tempo_permanencia_meses AS meses
           FROM alunos_historico
          WHERE (alunos_historico.tempo_permanencia_meses >= (4)::numeric)
        UNION ALL
         SELECT a.unidade_id,
            a.tempo_permanencia_meses
           FROM (alunos a
             LEFT JOIN tipos_matricula tm ON ((tm.id = a.tipo_matricula_id)))
          WHERE (((a.status)::text = ANY (ARRAY[('inativo'::character varying)::text, ('evadido'::character varying)::text])) AND (a.tempo_permanencia_meses >= 4) AND ((tm.codigo IS NULL) OR ((tm.codigo)::text <> ALL (ARRAY[('BOLSISTA_INT'::character varying)::text, ('BOLSISTA_PARC'::character varying)::text, ('BANDA'::character varying)::text]))) AND ((a.is_segundo_curso IS NULL) OR (a.is_segundo_curso = false)))
        ), permanencia_calc AS (
         SELECT permanencia_combinada.uid AS unidade_id,
            round(avg(permanencia_combinada.meses), 1) AS tempo_permanencia_medio
           FROM permanencia_combinada
          GROUP BY permanencia_combinada.uid
        ), evasoes_dedup AS (
         SELECT DISTINCT ON (COALESCE(m.aluno_id, (- m.id)), m.unidade_id) COALESCE(m.aluno_id, (- m.id)) AS aluno_key,
            m.unidade_id
           FROM (movimentacoes_admin m
             LEFT JOIN alunos a ON ((a.id = m.aluno_id)))
          WHERE (public.is_movimentacao_admin_retencao_valida(m.id) AND (EXTRACT(year FROM m.data) = EXTRACT(year FROM CURRENT_DATE)) AND (EXTRACT(month FROM m.data) = EXTRACT(month FROM CURRENT_DATE)) AND ((m.tipo)::text = ANY (ARRAY[('evasao'::character varying)::text, ('nao_renovacao'::character varying)::text])) AND ((a.is_segundo_curso IS NULL) OR (a.is_segundo_curso = false) OR (a.id IS NULL)))
          ORDER BY COALESCE(m.aluno_id, (- m.id)), m.unidade_id
        ), evasoes_mes AS (
         SELECT evasoes_dedup.unidade_id,
            count(*) AS evasoes_realtime
           FROM evasoes_dedup
          GROUP BY evasoes_dedup.unidade_id
        ), matriculas_mes AS (
         SELECT a.unidade_id,
            count(*) AS matriculas_realtime
           FROM (alunos a
             LEFT JOIN tipos_matricula tm ON ((tm.id = a.tipo_matricula_id)))
          WHERE ((a.data_matricula IS NOT NULL) AND (EXTRACT(year FROM a.data_matricula) = EXTRACT(year FROM CURRENT_DATE)) AND (EXTRACT(month FROM a.data_matricula) = EXTRACT(month FROM CURRENT_DATE)) AND ((a.is_segundo_curso IS NULL) OR (a.is_segundo_curso = false)) AND ((tm.conta_como_pagante = true) OR (tm.id IS NULL)))
          GROUP BY a.unidade_id
        ), renovacoes_mes AS (
         SELECT m.unidade_id,
            count(*) FILTER (WHERE ((m.tipo)::text = 'renovacao'::text)) AS renovacoes_realtime,
            count(*) FILTER (WHERE (public.is_movimentacao_admin_retencao_valida(m.id) AND ((m.tipo)::text = ANY (ARRAY[('renovacao'::character varying)::text, ('nao_renovacao'::character varying)::text])))) AS total_contratos,
            avg(
                CASE
                    WHEN (((m.tipo)::text = 'renovacao'::text) AND (m.valor_parcela_anterior > (0)::numeric)) THEN (((m.valor_parcela_novo - m.valor_parcela_anterior) / m.valor_parcela_anterior) * (100)::numeric)
                    ELSE NULL::numeric
                END) AS reajuste_medio
           FROM movimentacoes_admin m
          WHERE (public.is_movimentacao_admin_retencao_valida(m.id) AND (EXTRACT(year FROM m.data) = EXTRACT(year FROM CURRENT_DATE)) AND (EXTRACT(month FROM m.data) = EXTRACT(month FROM CURRENT_DATE)) AND ((m.tipo)::text = ANY (ARRAY[('renovacao'::character varying)::text, ('nao_renovacao'::character varying)::text])))
          GROUP BY m.unidade_id
        ), alunos_mes_anterior AS (
         SELECT dados_mensais.unidade_id,
            dados_mensais.alunos_pagantes
           FROM dados_mensais
          WHERE ((((dados_mensais.ano)::numeric = EXTRACT(year FROM CURRENT_DATE)) AND ((dados_mensais.mes)::numeric = (EXTRACT(month FROM CURRENT_DATE) - (1)::numeric))) OR (((dados_mensais.ano)::numeric = (EXTRACT(year FROM CURRENT_DATE) - (1)::numeric)) AND (dados_mensais.mes = 12) AND (EXTRACT(month FROM CURRENT_DATE) = (1)::numeric)))
          GROUP BY dados_mensais.unidade_id, dados_mensais.alunos_pagantes
        ), inadimplencia_atual AS (
         SELECT a.unidade_id,
            count(*) FILTER (WHERE ((a.status_pagamento)::text = 'inadimplente'::text)) AS qtd_inadimplentes,
            count(*) FILTER (WHERE ((COALESCE(a.status_pagamento, ''::character varying))::text <> 'sem_parcela'::text)) AS total_pagantes_calc
           FROM (alunos a
             LEFT JOIN tipos_matricula tm ON ((tm.id = a.tipo_matricula_id)))
          WHERE (((a.status)::text = ANY (ARRAY[('ativo'::character varying)::text, ('trancado'::character varying)::text])) AND ((tm.conta_como_pagante = true) OR (tm.id IS NULL)))
          GROUP BY a.unidade_id
        )
 SELECT u.id AS unidade_id,
    u.nome AS unidade_nome,
    u.codigo,
    (COALESCE(aa.total_ativos, (0)::bigint))::integer AS alunos_ativos,
    (COALESCE(aa.total_pagantes, (0)::bigint))::integer AS alunos_pagantes,
    (COALESCE(aa.ticket_medio, (0)::numeric))::numeric(10,2) AS ticket_medio,
    (COALESCE(aa.mrr, (0)::numeric))::numeric(12,2) AS mrr,
    (COALESCE(mm.matriculas_realtime, (0)::bigint))::integer AS matriculas_mes,
    (COALESCE(em.evasoes_realtime, (0)::bigint))::integer AS evasoes_mes,
    (
        CASE
            WHEN (COALESCE(ama.alunos_pagantes, 0) > 0) THEN round((((COALESCE(em.evasoes_realtime, (0)::bigint))::numeric / (ama.alunos_pagantes)::numeric) * (100)::numeric), 2)
            WHEN (COALESCE(aa.total_pagantes, (0)::bigint) > 0) THEN round((((COALESCE(em.evasoes_realtime, (0)::bigint))::numeric / (aa.total_pagantes)::numeric) * (100)::numeric), 2)
            ELSE (0)::numeric
        END)::numeric(5,2) AS churn_rate,
    (
        CASE
            WHEN (COALESCE(rm.total_contratos, (0)::bigint) > 0) THEN round((((COALESCE(rm.renovacoes_realtime, (0)::bigint))::numeric / (rm.total_contratos)::numeric) * (100)::numeric), 2)
            ELSE (0)::numeric
        END)::numeric(5,2) AS taxa_renovacao,
    (
        CASE
            WHEN (COALESCE(ia.total_pagantes_calc, (0)::bigint) > 0) THEN round((((COALESCE(ia.qtd_inadimplentes, (0)::bigint))::numeric / (ia.total_pagantes_calc)::numeric) * (100)::numeric), 2)
            ELSE (0)::numeric
        END)::numeric(5,2) AS inadimplencia_pct,
    (COALESCE(pc.tempo_permanencia_medio, (0)::numeric))::numeric(5,1) AS tempo_permanencia,
    (COALESCE(rm.reajuste_medio, (0)::numeric))::numeric(5,2) AS reajuste_medio
   FROM (((((((unidades u
     LEFT JOIN alunos_ativos aa ON ((aa.unidade_id = u.id)))
     LEFT JOIN permanencia_calc pc ON ((pc.unidade_id = u.id)))
     LEFT JOIN evasoes_mes em ON ((em.unidade_id = u.id)))
     LEFT JOIN matriculas_mes mm ON ((mm.unidade_id = u.id)))
     LEFT JOIN renovacoes_mes rm ON ((rm.unidade_id = u.id)))
     LEFT JOIN alunos_mes_anterior ama ON ((ama.unidade_id = u.id)))
     LEFT JOIN inadimplencia_atual ia ON ((ia.unidade_id = u.id)))
  WHERE (u.ativo = true);;

-- ---- view: vw_evasoes_motivos ----
CREATE OR REPLACE VIEW public.vw_evasoes_motivos AS
 SELECT ms.categoria AS motivo_categoria,
    u.nome AS unidade,
    count(*) AS quantidade,
    sum(COALESCE(m.valor_parcela_evasao, m.valor_parcela_anterior)) AS mrr_perdido,
    round(((100.0 * (count(*))::numeric) / sum(count(*)) OVER (PARTITION BY u.nome)), 1) AS percentual
   FROM ((movimentacoes_admin m
     LEFT JOIN unidades u ON ((u.id = m.unidade_id)))
     LEFT JOIN motivos_saida ms ON ((ms.id = m.motivo_saida_id)))
  WHERE (public.is_movimentacao_admin_retencao_valida(m.id) AND ((m.tipo)::text = ANY ((ARRAY['evasao'::character varying, 'nao_renovacao'::character varying])::text[])))
  GROUP BY ms.categoria, u.nome
  ORDER BY u.nome, (count(*)) DESC;;

-- ---- view: vw_evasoes_professores ----
CREATE OR REPLACE VIEW public.vw_evasoes_professores AS
 WITH evasoes_unificadas AS (
         SELECT (u.nome)::character varying AS unidade,
            (p.nome)::character varying AS professor,
            COALESCE(m.valor_parcela_evasao, m.valor_parcela_anterior) AS parcela,
            ms.categoria AS motivo_categoria
           FROM (((movimentacoes_admin m
             LEFT JOIN unidades u ON ((u.id = m.unidade_id)))
             LEFT JOIN professores p ON ((p.id = m.professor_id)))
             LEFT JOIN motivos_saida ms ON ((ms.id = m.motivo_saida_id)))
          WHERE (public.is_movimentacao_admin_retencao_valida(m.id) AND (m.professor_id IS NOT NULL) AND ((m.tipo)::text = ANY ((ARRAY['evasao'::character varying, 'nao_renovacao'::character varying])::text[])))
        )
 SELECT unidade,
    professor,
    count(*) AS total_evasoes,
    sum(parcela) AS mrr_perdido,
    round(avg(parcela), 2) AS ticket_medio,
    mode() WITHIN GROUP (ORDER BY motivo_categoria) AS motivo_principal
   FROM evasoes_unificadas
  GROUP BY unidade, professor
  ORDER BY (count(*)) DESC;;

-- ---- view: vw_evasoes_resumo ----
CREATE OR REPLACE VIEW public.vw_evasoes_resumo AS
 SELECT (date_trunc('month'::text, (m.data)::timestamp with time zone))::date AS competencia,
    u.nome AS unidade,
    count(*) AS total_evasoes,
    count(
        CASE
            WHEN ((m.tipo)::text = 'evasao'::text) THEN 1
            ELSE NULL::integer
        END) AS interrompidos,
    count(
        CASE
            WHEN ((m.tipo)::text = 'nao_renovacao'::text) THEN 1
            ELSE NULL::integer
        END) AS nao_renovacoes,
    sum(COALESCE(m.valor_parcela_evasao, m.valor_parcela_anterior)) AS mrr_perdido,
    round(avg(COALESCE(m.valor_parcela_evasao, m.valor_parcela_anterior)), 2) AS ticket_medio_evasao,
    count(
        CASE
            WHEN ((ms.categoria)::text = 'Financeiro'::text) THEN 1
            ELSE NULL::integer
        END) AS motivo_financeiro,
    count(
        CASE
            WHEN ((ms.categoria)::text = 'Horário'::text) THEN 1
            ELSE NULL::integer
        END) AS motivo_horario,
    count(
        CASE
            WHEN ((ms.categoria)::text = 'Mudança'::text) THEN 1
            ELSE NULL::integer
        END) AS motivo_mudanca,
    count(
        CASE
            WHEN ((ms.categoria)::text = 'Desinteresse'::text) THEN 1
            ELSE NULL::integer
        END) AS motivo_desinteresse,
    count(
        CASE
            WHEN ((ms.categoria)::text = 'Inadimplência'::text) THEN 1
            ELSE NULL::integer
        END) AS motivo_inadimplencia
   FROM ((movimentacoes_admin m
     LEFT JOIN unidades u ON ((u.id = m.unidade_id)))
     LEFT JOIN motivos_saida ms ON ((ms.id = m.motivo_saida_id)))
  WHERE (public.is_movimentacao_admin_retencao_valida(m.id) AND ((m.tipo)::text = ANY ((ARRAY['evasao'::character varying, 'nao_renovacao'::character varying])::text[])))
  GROUP BY (date_trunc('month'::text, (m.data)::timestamp with time zone)), u.nome
  ORDER BY ((date_trunc('month'::text, (m.data)::timestamp with time zone))::date), u.nome;;

-- ---- view: vw_kpis_gestao_mensal ----
CREATE OR REPLACE VIEW public.vw_kpis_gestao_mensal AS
 WITH matriculas_mes AS (
         SELECT a.unidade_id,
            (EXTRACT(year FROM a.data_matricula))::integer AS ano,
            (EXTRACT(month FROM a.data_matricula))::integer AS mes,
            count(*) AS novas_matriculas
           FROM ((alunos a
             LEFT JOIN tipos_matricula tm ON ((tm.id = a.tipo_matricula_id)))
             LEFT JOIN cursos c ON ((c.id = a.curso_id)))
          WHERE ((a.data_matricula IS NOT NULL) AND ((a.is_segundo_curso IS NULL) OR (a.is_segundo_curso = false)) AND ((c.is_projeto_banda IS NULL) OR (c.is_projeto_banda = false)) AND ((c.nome IS NULL) OR ((c.nome)::text !~~* '%canto coral%'::text)) AND ((tm.codigo IS NULL) OR ((tm.codigo)::text <> ALL ((ARRAY['BOLSISTA_INT'::character varying, 'BOLSISTA_PARC'::character varying])::text[]))))
          GROUP BY a.unidade_id, (EXTRACT(year FROM a.data_matricula)), (EXTRACT(month FROM a.data_matricula))
        ), alunos_ticket AS (
         SELECT a.unidade_id,
            ((lower(TRIM(BOTH FROM a.nome)) || '-'::text) || (a.unidade_id)::text) AS chave_pessoa,
            sum(a.valor_parcela) FILTER (WHERE ((tm.entra_ticket_medio = true) AND (a.valor_parcela > (0)::numeric) AND ((tm.codigo IS NULL) OR ((tm.codigo)::text <> ALL ((ARRAY['BOLSISTA_INT'::character varying, 'BOLSISTA_PARC'::character varying])::text[]))) AND (COALESCE(c.is_projeto_banda, false) = false) AND ((c.nome IS NULL) OR ((c.nome)::text !~~* '%canto coral%'::text)))) AS valor_total
           FROM ((alunos a
             LEFT JOIN tipos_matricula tm ON ((tm.id = a.tipo_matricula_id)))
             LEFT JOIN cursos c ON ((c.id = a.curso_id)))
          WHERE (((a.status)::text = ANY ((ARRAY['ativo'::character varying, 'trancado'::character varying])::text[])) AND (tm.entra_ticket_medio = true) AND (a.valor_parcela > (0)::numeric))
          GROUP BY a.unidade_id, ((lower(TRIM(BOTH FROM a.nome)) || '-'::text) || (a.unidade_id)::text)
         HAVING (sum(a.valor_parcela) FILTER (WHERE ((tm.entra_ticket_medio = true) AND (a.valor_parcela > (0)::numeric) AND ((tm.codigo IS NULL) OR ((tm.codigo)::text <> ALL ((ARRAY['BOLSISTA_INT'::character varying, 'BOLSISTA_PARC'::character varying])::text[]))) AND (COALESCE(c.is_projeto_banda, false) = false) AND ((c.nome IS NULL) OR ((c.nome)::text !~~* '%canto coral%'::text)))) > (0)::numeric)
        ), ticket_por_unidade AS (
         SELECT alunos_ticket.unidade_id,
            count(*) AS total_pessoas_ticket,
            sum(alunos_ticket.valor_total) AS soma_parcelas,
            avg(alunos_ticket.valor_total) AS ticket_medio_calculado
           FROM alunos_ticket
          GROUP BY alunos_ticket.unidade_id
        ), alunos_mes AS (
         SELECT a.unidade_id,
            (EXTRACT(year FROM CURRENT_DATE))::integer AS ano,
            (EXTRACT(month FROM CURRENT_DATE))::integer AS mes,
            count(*) FILTER (WHERE ((a.is_segundo_curso IS NULL) OR (a.is_segundo_curso = false))) AS total_alunos,
            count(*) FILTER (WHERE ((tm.conta_como_pagante = true) AND ((a.is_segundo_curso IS NULL) OR (a.is_segundo_curso = false)))) AS alunos_pagantes,
            count(*) FILTER (WHERE (((tm.codigo)::text = 'BOLSISTA_INT'::text) AND ((a.is_segundo_curso IS NULL) OR (a.is_segundo_curso = false)))) AS bolsistas_integrais,
            count(*) FILTER (WHERE (((tm.codigo)::text = 'BOLSISTA_PARC'::text) AND ((a.is_segundo_curso IS NULL) OR (a.is_segundo_curso = false)))) AS bolsistas_parciais,
            count(*) FILTER (WHERE (((c.nome)::text ~~* '%banda%'::text) OR ((c.nome)::text ~~* '%power kids%'::text))) AS total_banda,
            count(*) FILTER (WHERE (a.is_segundo_curso = true)) AS segundo_curso,
            sum(a.valor_parcela) FILTER (WHERE ((tm.conta_como_pagante = true) AND ((COALESCE(a.status_pagamento, ''::character varying))::text <> 'sem_parcela'::text))) AS mrr,
            count(*) FILTER (WHERE (((a.status_pagamento)::text = 'inadimplente'::text) AND (tm.conta_como_pagante = true) AND ((a.is_segundo_curso IS NULL) OR (a.is_segundo_curso = false)))) AS qtd_inadimplentes,
            COALESCE(sum(a.valor_parcela) FILTER (WHERE (((a.status_pagamento)::text = 'inadimplente'::text) AND (tm.conta_como_pagante = true) AND ((COALESCE(a.status_pagamento, ''::character varying))::text <> 'sem_parcela'::text))), (0)::numeric) AS mrr_inadimplente
           FROM ((alunos a
             LEFT JOIN tipos_matricula tm ON ((tm.id = a.tipo_matricula_id)))
             LEFT JOIN cursos c ON ((c.id = a.curso_id)))
          WHERE ((a.status)::text = ANY ((ARRAY['ativo'::character varying, 'trancado'::character varying])::text[]))
          GROUP BY a.unidade_id
        ), permanencia_combinada AS (
         SELECT alunos_historico.unidade_id,
            alunos_historico.tempo_permanencia_meses AS meses
           FROM alunos_historico
          WHERE (alunos_historico.tempo_permanencia_meses >= (4)::numeric)
        UNION ALL
         SELECT a.unidade_id,
            a.tempo_permanencia_meses
           FROM (alunos a
             LEFT JOIN tipos_matricula tm ON ((tm.id = a.tipo_matricula_id)))
          WHERE (((a.status)::text = ANY ((ARRAY['inativo'::character varying, 'evadido'::character varying])::text[])) AND (a.tempo_permanencia_meses >= 4) AND ((tm.codigo IS NULL) OR ((tm.codigo)::text <> ALL ((ARRAY['BOLSISTA_INT'::character varying, 'BOLSISTA_PARC'::character varying, 'BANDA'::character varying])::text[]))) AND ((a.is_segundo_curso IS NULL) OR (a.is_segundo_curso = false)))
        ), permanencia_calc AS (
         SELECT permanencia_combinada.unidade_id,
            round(avg(permanencia_combinada.meses), 1) AS tempo_permanencia_medio,
            count(*) AS total_evasoes_calc
           FROM permanencia_combinada
          GROUP BY permanencia_combinada.unidade_id
        ), evasoes_dedup AS (
         SELECT DISTINCT ON ((lower(TRIM(BOTH FROM m.aluno_nome))), m.unidade_id, (EXTRACT(year FROM m.data)), (EXTRACT(month FROM m.data))) m.id,
            m.aluno_id,
            m.unidade_id,
            m.data AS data_evasao,
            m.tipo,
            COALESCE(m.valor_parcela_evasao, m.valor_parcela_anterior) AS valor_parcela
           FROM movimentacoes_admin m
          WHERE (public.is_movimentacao_admin_retencao_valida(m.id) AND ((m.tipo)::text = ANY ((ARRAY['evasao'::character varying, 'nao_renovacao'::character varying])::text[])))
          ORDER BY (lower(TRIM(BOTH FROM m.aluno_nome))), m.unidade_id, (EXTRACT(year FROM m.data)), (EXTRACT(month FROM m.data)), m.aluno_id DESC NULLS LAST, m.data DESC
        ), evasoes_mes AS (
         SELECT evasoes_dedup.unidade_id,
            (EXTRACT(year FROM evasoes_dedup.data_evasao))::integer AS ano,
            (EXTRACT(month FROM evasoes_dedup.data_evasao))::integer AS mes,
            count(*) AS total_evasoes
           FROM evasoes_dedup
          GROUP BY evasoes_dedup.unidade_id, (EXTRACT(year FROM evasoes_dedup.data_evasao)), (EXTRACT(month FROM evasoes_dedup.data_evasao))
        ), leads_mes AS (
         SELECT l.unidade_id,
            (EXTRACT(year FROM l.data_contato))::integer AS ano,
            (EXTRACT(month FROM l.data_contato))::integer AS mes,
            sum(
                CASE
                    WHEN ((l.status)::text = ANY ((ARRAY['novo'::character varying, 'agendado'::character varying])::text[])) THEN COALESCE(l.quantidade, 1)
                    ELSE 0
                END) AS total_leads,
            sum(
                CASE
                    WHEN ((l.status)::text = 'experimental_agendada'::text) THEN COALESCE(l.quantidade, 1)
                    ELSE 0
                END) AS experimentais_agendadas,
            sum(
                CASE
                    WHEN ((l.status)::text = ANY ((ARRAY['experimental_realizada'::character varying, 'compareceu'::character varying])::text[])) THEN COALESCE(l.quantidade, 1)
                    ELSE 0
                END) AS experimentais_realizadas,
            sum(
                CASE
                    WHEN ((l.status)::text = 'experimental_faltou'::text) THEN COALESCE(l.quantidade, 1)
                    ELSE 0
                END) AS faltaram,
            sum(
                CASE
                    WHEN (l.arquivado = true) THEN COALESCE(l.quantidade, 1)
                    ELSE 0
                END) AS leads_arquivados
           FROM leads l
          GROUP BY l.unidade_id, (EXTRACT(year FROM l.data_contato)), (EXTRACT(month FROM l.data_contato))
        ), renovacoes_mes AS (
         SELECT m.unidade_id,
            (EXTRACT(year FROM m.data))::integer AS ano,
            (EXTRACT(month FROM m.data))::integer AS mes,
            count(*) FILTER (WHERE ((m.tipo)::text = 'renovacao'::text)) AS renovacoes,
            count(*) FILTER (WHERE (public.is_movimentacao_admin_retencao_valida(m.id) AND ((m.tipo)::text = ANY ((ARRAY['renovacao'::character varying, 'nao_renovacao'::character varying])::text[])))) AS total_contratos,
            count(*) FILTER (WHERE ((m.tipo)::text = 'nao_renovacao'::text)) AS nao_renovacoes,
            round(avg((((m.valor_parcela_novo - m.valor_parcela_anterior) / NULLIF(m.valor_parcela_anterior, (0)::numeric)) * (100)::numeric)) FILTER (WHERE (public.is_movimentacao_admin_retencao_valida(m.id) AND (((m.tipo)::text = 'renovacao'::text) AND (m.valor_parcela_anterior IS NOT NULL) AND (m.valor_parcela_novo IS NOT NULL) AND (m.valor_parcela_anterior > (0)::numeric) AND (m.valor_parcela_novo > m.valor_parcela_anterior)))), 2) AS reajuste_medio
           FROM movimentacoes_admin m
          WHERE (public.is_movimentacao_admin_retencao_valida(m.id) AND ((m.tipo)::text = ANY ((ARRAY['renovacao'::character varying, 'nao_renovacao'::character varying])::text[])))
          GROUP BY m.unidade_id, (EXTRACT(year FROM m.data)), (EXTRACT(month FROM m.data))
        )
 SELECT u.id AS unidade_id,
    u.nome AS unidade_nome,
    COALESCE(lm.ano, am.ano, (EXTRACT(year FROM CURRENT_DATE))::integer) AS ano,
    COALESCE(lm.mes, am.mes, (EXTRACT(month FROM CURRENT_DATE))::integer) AS mes,
    (COALESCE(am.total_alunos, (0)::bigint))::integer AS total_alunos_ativos,
    (COALESCE(am.alunos_pagantes, (0)::bigint))::integer AS total_alunos_pagantes,
    (COALESCE(am.bolsistas_integrais, (0)::bigint))::integer AS total_bolsistas_integrais,
    (COALESCE(am.bolsistas_parciais, (0)::bigint))::integer AS total_bolsistas_parciais,
    (COALESCE(am.total_banda, (0)::bigint))::integer AS total_banda,
    (COALESCE(am.segundo_curso, (0)::bigint))::integer AS total_segundo_curso,
    (COALESCE(tpu.ticket_medio_calculado, (0)::numeric))::numeric(10,2) AS ticket_medio,
    (COALESCE(am.mrr, (0)::numeric))::numeric(12,2) AS mrr,
    ((COALESCE(am.mrr, (0)::numeric) * (12)::numeric))::numeric(14,2) AS arr,
    (COALESCE(pc.tempo_permanencia_medio, (0)::numeric))::numeric(5,1) AS tempo_permanencia_medio,
    ((COALESCE(tpu.ticket_medio_calculado, (0)::numeric) * COALESCE(pc.tempo_permanencia_medio, (0)::numeric)))::numeric(12,2) AS ltv_medio,
    (
        CASE
            WHEN (COALESCE(am.alunos_pagantes, (0)::bigint) > 0) THEN round((((COALESCE(am.qtd_inadimplentes, (0)::bigint))::numeric / (am.alunos_pagantes)::numeric) * (100)::numeric), 2)
            ELSE (0)::numeric
        END)::numeric(5,2) AS inadimplencia_pct,
    (COALESCE(am.mrr, (0)::numeric))::numeric(12,2) AS faturamento_previsto,
    ((COALESCE(am.mrr, (0)::numeric) - COALESCE(am.mrr_inadimplente, (0)::numeric)))::numeric(12,2) AS faturamento_realizado,
    (COALESCE(lm.total_leads, (0)::bigint))::integer AS total_leads,
    (COALESCE(lm.experimentais_agendadas, (0)::bigint))::integer AS experimentais_agendadas,
    (COALESCE(lm.experimentais_realizadas, (0)::bigint))::integer AS experimentais_realizadas,
    (COALESCE(mm.novas_matriculas, (0)::bigint))::integer AS novas_matriculas,
    (COALESCE(em.total_evasoes, (0)::bigint))::integer AS total_evasoes,
    (
        CASE
            WHEN (COALESCE(am.alunos_pagantes, (0)::bigint) > 0) THEN round((((COALESCE(em.total_evasoes, (0)::bigint))::numeric / (am.alunos_pagantes)::numeric) * (100)::numeric), 2)
            ELSE (0)::numeric
        END)::numeric(5,2) AS churn_rate,
    (COALESCE(rm.renovacoes, (0)::bigint))::integer AS renovacoes,
    (
        CASE
            WHEN (COALESCE(rm.total_contratos, (0)::bigint) > 0) THEN round((((rm.renovacoes)::numeric / (rm.total_contratos)::numeric) * (100)::numeric), 2)
            ELSE (0)::numeric
        END)::numeric(5,2) AS taxa_renovacao,
    (COALESCE(rm.reajuste_medio, (0)::numeric))::numeric(5,2) AS reajuste_medio
   FROM (((((((unidades u
     LEFT JOIN leads_mes lm ON ((lm.unidade_id = u.id)))
     LEFT JOIN alunos_mes am ON ((am.unidade_id = u.id)))
     LEFT JOIN ticket_por_unidade tpu ON ((tpu.unidade_id = u.id)))
     LEFT JOIN permanencia_calc pc ON ((pc.unidade_id = u.id)))
     LEFT JOIN matriculas_mes mm ON (((mm.unidade_id = u.id) AND (mm.ano = COALESCE(lm.ano, am.ano, (EXTRACT(year FROM CURRENT_DATE))::integer)) AND (mm.mes = COALESCE(lm.mes, am.mes, (EXTRACT(month FROM CURRENT_DATE))::integer)))))
     LEFT JOIN evasoes_mes em ON (((em.unidade_id = u.id) AND (em.ano = COALESCE(lm.ano, am.ano, (EXTRACT(year FROM CURRENT_DATE))::integer)) AND (em.mes = COALESCE(lm.mes, am.mes, (EXTRACT(month FROM CURRENT_DATE))::integer)))))
     LEFT JOIN renovacoes_mes rm ON (((rm.unidade_id = u.id) AND (rm.ano = COALESCE(lm.ano, am.ano, (EXTRACT(year FROM CURRENT_DATE))::integer)) AND (rm.mes = COALESCE(lm.mes, am.mes, (EXTRACT(month FROM CURRENT_DATE))::integer)))))
  WHERE (u.ativo = true);;

-- ---- view: vw_kpis_professor_mensal ----
CREATE OR REPLACE VIEW public.vw_kpis_professor_mensal AS
 WITH carteira AS (
         SELECT a.professor_atual_id AS professor_id,
            a.unidade_id,
            count(*) AS carteira_alunos,
                CASE
                    WHEN (count(*) FILTER (WHERE (a.valor_parcela > (0)::numeric)) > 0) THEN (sum(a.valor_parcela) / (count(*) FILTER (WHERE (a.valor_parcela > (0)::numeric)))::numeric)
                    ELSE (0)::numeric
                END AS ticket_medio,
            avg(a.percentual_presenca) AS media_presenca,
            sum(
                CASE
                    WHEN (a.valor_parcela > (0)::numeric) THEN a.valor_parcela
                    ELSE (0)::numeric
                END) AS mrr_carteira
           FROM (alunos a
             JOIN cursos c_1 ON ((a.curso_id = c_1.id)))
          WHERE (((a.status)::text = 'ativo'::text) AND (a.professor_atual_id IS NOT NULL) AND ((c_1.is_projeto_banda IS NULL) OR (c_1.is_projeto_banda = false)))
          GROUP BY a.professor_atual_id, a.unidade_id
        ), turmas_calc AS (
         SELECT vt.professor_id,
            vt.unidade_id,
            count(*) AS total_turmas,
            round(avg(vt.total_alunos), 2) AS media_alunos_turma
           FROM vw_turmas_implicitas vt
          GROUP BY vt.professor_id, vt.unidade_id
        ), experimentais_atual AS (
         SELECT l.professor_experimental_id AS professor_id,
            l.unidade_id,
            sum(
                CASE
                    WHEN (l.experimental_realizada = true) THEN COALESCE(l.quantidade, 1)
                    ELSE 0
                END) AS experimentais,
            sum(
                CASE
                    WHEN (((l.status)::text = ANY (ARRAY[('matriculado'::character varying)::text, ('convertido'::character varying)::text])) AND ((l.experimental_realizada = true) OR ((l.converteu = true) AND (l.data_experimental IS NOT NULL) AND (l.faltou_experimental IS NOT TRUE)))) THEN COALESCE(l.quantidade, 1)
                    ELSE 0
                END) AS matriculas_pos_exp,
            sum(
                CASE
                    WHEN (((l.status)::text = ANY (ARRAY[('matriculado'::character varying)::text, ('convertido'::character varying)::text])) AND (NOT ((l.experimental_realizada = true) OR ((l.converteu = true) AND (l.data_experimental IS NOT NULL) AND (l.faltou_experimental IS NOT TRUE))))) THEN COALESCE(l.quantidade, 1)
                    ELSE 0
                END) AS matriculas_diretas,
            sum(
                CASE
                    WHEN ((l.status)::text = ANY (ARRAY[('matriculado'::character varying)::text, ('convertido'::character varying)::text])) THEN COALESCE(l.quantidade, 1)
                    ELSE 0
                END) AS matriculas
           FROM leads l
          WHERE ((l.professor_experimental_id IS NOT NULL) AND (EXTRACT(year FROM l.data_contato) = EXTRACT(year FROM CURRENT_DATE)) AND (EXTRACT(month FROM l.data_contato) = EXTRACT(month FROM CURRENT_DATE)))
          GROUP BY l.professor_experimental_id, l.unidade_id
        ), renovacoes_atual AS (
         SELECT COALESCE(m.professor_id, a.professor_atual_id) AS professor_id,
            m.unidade_id,
            count(*) FILTER (WHERE ((m.tipo)::text = 'renovacao'::text)) AS renovacoes,
            count(*) FILTER (WHERE ((m.tipo)::text = 'nao_renovacao'::text)) AS nao_renovacoes,
            count(*) FILTER (WHERE (public.is_movimentacao_admin_retencao_valida(m.id) AND ((m.tipo)::text = ANY (ARRAY[('renovacao'::character varying)::text, ('nao_renovacao'::character varying)::text])))) AS total_contratos
           FROM (movimentacoes_admin m
             LEFT JOIN alunos a ON ((a.id = m.aluno_id)))
          WHERE (public.is_movimentacao_admin_retencao_valida(m.id) AND (COALESCE(m.professor_id, a.professor_atual_id) IS NOT NULL) AND ((m.tipo)::text = ANY (ARRAY[('renovacao'::character varying)::text, ('nao_renovacao'::character varying)::text])) AND (EXTRACT(year FROM m.data) = EXTRACT(year FROM CURRENT_DATE)) AND (EXTRACT(month FROM m.data) = EXTRACT(month FROM CURRENT_DATE)))
          GROUP BY COALESCE(m.professor_id, a.professor_atual_id), m.unidade_id
        ), evasoes_atual AS (
         SELECT m.professor_id,
            m.unidade_id,
            count(*) AS evasoes,
            sum(
                CASE
                    WHEN (COALESCE(m.valor_parcela_evasao, m.valor_parcela_anterior) > (0)::numeric) THEN COALESCE(m.valor_parcela_evasao, m.valor_parcela_anterior)
                    ELSE (0)::numeric
                END) AS mrr_perdido
           FROM (movimentacoes_admin m
             LEFT JOIN alunos a ON ((a.id = m.aluno_id)))
          WHERE (public.is_movimentacao_admin_retencao_valida(m.id) AND (m.professor_id IS NOT NULL) AND ((m.tipo)::text = ANY (ARRAY[('evasao'::character varying)::text, ('nao_renovacao'::character varying)::text])) AND ((a.is_segundo_curso IS NULL) OR (a.is_segundo_curso = false) OR (a.id IS NULL)) AND (EXTRACT(year FROM m.data) = EXTRACT(year FROM CURRENT_DATE)) AND (EXTRACT(month FROM m.data) = EXTRACT(month FROM CURRENT_DATE)))
          GROUP BY m.professor_id, m.unidade_id
        )
 SELECT DISTINCT ON (p.id, COALESCE(c.unidade_id, ea.unidade_id, ra.unidade_id, ev.unidade_id)) p.id AS professor_id,
    p.nome AS professor_nome,
    COALESCE(c.unidade_id, ea.unidade_id, ra.unidade_id, ev.unidade_id) AS unidade_id,
    (EXTRACT(year FROM CURRENT_DATE))::integer AS ano,
    (EXTRACT(month FROM CURRENT_DATE))::integer AS mes,
    (COALESCE(c.carteira_alunos, (0)::bigint))::integer AS carteira_alunos,
    (COALESCE(c.ticket_medio, (0)::numeric))::numeric(10,2) AS ticket_medio,
    (COALESCE(c.media_presenca, (0)::numeric))::numeric(5,2) AS media_presenca,
    (COALESCE(((100)::numeric - c.media_presenca), (0)::numeric))::numeric(5,2) AS taxa_faltas,
    (COALESCE(c.mrr_carteira, (0)::numeric))::numeric(12,2) AS mrr_carteira,
    (COALESCE(p.nps_medio, (0)::numeric))::numeric(5,2) AS nps_medio,
    (COALESCE(tc.media_alunos_turma, (0)::numeric))::numeric(5,2) AS media_alunos_turma,
    (COALESCE(ea.experimentais, (0)::bigint))::integer AS experimentais,
    (COALESCE(ea.matriculas, (0)::bigint))::integer AS matriculas,
    (COALESCE(ea.matriculas_pos_exp, (0)::bigint))::integer AS matriculas_pos_exp,
    (COALESCE(ea.matriculas_diretas, (0)::bigint))::integer AS matriculas_diretas,
        CASE
            WHEN (COALESCE(ea.experimentais, (0)::bigint) > 0) THEN round((((COALESCE(ea.matriculas_pos_exp, (0)::bigint))::numeric / (ea.experimentais)::numeric) * (100)::numeric), 2)
            ELSE (0)::numeric
        END AS taxa_conversao,
    (COALESCE(ra.renovacoes, (0)::bigint))::integer AS renovacoes,
    (COALESCE(ra.nao_renovacoes, (0)::bigint))::integer AS nao_renovacoes,
        CASE
            WHEN (COALESCE(ra.total_contratos, (0)::bigint) > 0) THEN round((((ra.renovacoes)::numeric / (ra.total_contratos)::numeric) * (100)::numeric), 2)
            ELSE (0)::numeric
        END AS taxa_renovacao,
    (COALESCE(ev.evasoes, (0)::bigint))::integer AS evasoes,
    (COALESCE(ev.mrr_perdido, (0)::numeric))::numeric(12,2) AS mrr_perdido,
        CASE
            WHEN (COALESCE(c.carteira_alunos, (0)::bigint) > 0) THEN round((((COALESCE(ev.evasoes, (0)::bigint))::numeric / (c.carteira_alunos)::numeric) * (100)::numeric), 2)
            ELSE (0)::numeric
        END AS taxa_cancelamento,
    0 AS ranking_matriculador,
    0 AS ranking_renovador,
    0 AS ranking_churn
   FROM (((((professores p
     LEFT JOIN carteira c ON ((c.professor_id = p.id)))
     LEFT JOIN turmas_calc tc ON (((tc.professor_id = p.id) AND (tc.unidade_id = c.unidade_id))))
     LEFT JOIN experimentais_atual ea ON (((ea.professor_id = p.id) AND (ea.unidade_id = c.unidade_id))))
     LEFT JOIN renovacoes_atual ra ON (((ra.professor_id = p.id) AND (ra.unidade_id = c.unidade_id))))
     LEFT JOIN evasoes_atual ev ON (((ev.professor_id = p.id) AND (ev.unidade_id = c.unidade_id))))
  WHERE ((p.ativo = true) AND (COALESCE(c.unidade_id, ea.unidade_id, ra.unidade_id, ev.unidade_id) IS NOT NULL))
  ORDER BY p.id, COALESCE(c.unidade_id, ea.unidade_id, ra.unidade_id, ev.unidade_id), c.carteira_alunos DESC NULLS LAST;;

-- ---- view: vw_professores_performance_atual ----
CREATE OR REPLACE VIEW public.vw_professores_performance_atual AS
 WITH alunos_por_professor AS (
         SELECT p.id AS professor_id,
            p.nome AS professor,
            u.nome AS unidade,
            u.id AS unidade_id,
            count(a.id) AS total_alunos,
            COALESCE(avg(a.valor_parcela), (0)::numeric) AS ticket_medio,
            COALESCE(sum(a.valor_parcela), (0)::numeric) AS mrr,
            COALESCE(avg(a.tempo_permanencia_meses), (0)::numeric) AS tempo_medio,
            COALESCE(avg(a.percentual_presenca), (0)::numeric) AS presenca_media
           FROM (((professores p
             JOIN professores_unidades pu ON ((pu.professor_id = p.id)))
             JOIN unidades u ON ((u.id = pu.unidade_id)))
             LEFT JOIN alunos a ON (((a.professor_atual_id = p.id) AND (a.unidade_id = u.id) AND ((a.status)::text = 'ativo'::text))))
          WHERE (p.ativo = true)
          GROUP BY p.id, p.nome, u.nome, u.id
        ), experimentais_ano AS (
         SELECT experimentais_professor_mensal.professor_id,
            experimentais_professor_mensal.unidade_id,
            sum(experimentais_professor_mensal.experimentais) AS total_experimentais
           FROM experimentais_professor_mensal
          WHERE ((experimentais_professor_mensal.ano)::numeric = EXTRACT(year FROM CURRENT_DATE))
          GROUP BY experimentais_professor_mensal.professor_id, experimentais_professor_mensal.unidade_id
        ), matriculas_ano AS (
         SELECT l.professor_fixo_id AS professor_id,
            l.unidade_id,
            sum(COALESCE(l.quantidade, 1)) AS total_matriculas
           FROM leads l
          WHERE (((l.status)::text = ANY ((ARRAY['matriculado'::character varying, 'convertido'::character varying])::text[])) AND (l.professor_fixo_id IS NOT NULL) AND (EXTRACT(year FROM l.data_contato) = EXTRACT(year FROM CURRENT_DATE)))
          GROUP BY l.professor_fixo_id, l.unidade_id
        ), evasoes_ano AS (
         SELECT m.professor_id,
            m.unidade_id,
            count(*) AS total_evasoes
           FROM movimentacoes_admin m
          WHERE (public.is_movimentacao_admin_retencao_valida(m.id) AND (m.professor_id IS NOT NULL) AND ((m.tipo)::text = ANY ((ARRAY['evasao'::character varying, 'nao_renovacao'::character varying])::text[])) AND (EXTRACT(year FROM m.data) = EXTRACT(year FROM CURRENT_DATE)))
          GROUP BY m.professor_id, m.unidade_id
        )
 SELECT ap.professor_id,
    ap.professor,
    ap.unidade,
    (EXTRACT(year FROM CURRENT_DATE))::integer AS ano,
    ap.total_alunos,
    (ap.ticket_medio)::numeric(10,2) AS ticket_medio,
    (ap.mrr)::numeric(12,2) AS mrr,
    (ap.tempo_medio)::numeric(5,1) AS tempo_permanencia_medio,
    (ap.presenca_media)::numeric(5,1) AS presenca_media,
    (COALESCE(ea.total_experimentais, (0)::bigint))::integer AS experimentais,
    (COALESCE(ma.total_matriculas, (0)::bigint))::integer AS matriculas,
        CASE
            WHEN (COALESCE(ea.total_experimentais, (0)::bigint) > 0) THEN round((((COALESCE(ma.total_matriculas, (0)::bigint))::numeric / (ea.total_experimentais)::numeric) * (100)::numeric), 1)
            ELSE (0)::numeric
        END AS taxa_conversao,
    (COALESCE(ev.total_evasoes, (0)::bigint))::integer AS evasoes
   FROM (((alunos_por_professor ap
     LEFT JOIN experimentais_ano ea ON (((ea.professor_id = ap.professor_id) AND (ea.unidade_id = ap.unidade_id))))
     LEFT JOIN matriculas_ano ma ON (((ma.professor_id = ap.professor_id) AND (ma.unidade_id = ap.unidade_id))))
     LEFT JOIN evasoes_ano ev ON (((ev.professor_id = ap.professor_id) AND (ev.unidade_id = ap.unidade_id))))
  ORDER BY ap.total_alunos DESC;;

-- ---- view: vw_taxa_crescimento_professor ----
CREATE OR REPLACE VIEW public.vw_taxa_crescimento_professor AS
 WITH periodo AS (
         SELECT date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone) AS inicio_mes,
            ((date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone) + '1 mon'::interval) - '1 day'::interval) AS fim_mes,
            (EXTRACT(year FROM CURRENT_DATE))::integer AS ano,
            (EXTRACT(month FROM CURRENT_DATE))::integer AS mes
        ), alunos_iniciais AS (
         SELECT a.professor_atual_id AS professor_id,
            a.unidade_id,
            count(*) AS quantidade
           FROM alunos a,
            periodo p_1
          WHERE (((a.status)::text = 'ativo'::text) AND (a.professor_atual_id IS NOT NULL) AND (a.data_matricula < p_1.inicio_mes))
          GROUP BY a.professor_atual_id, a.unidade_id
        ), matriculas_mes AS (
         SELECT a.professor_experimental_id AS professor_id,
            a.unidade_id,
            count(*) AS quantidade
           FROM alunos a,
            periodo p_1
          WHERE ((a.professor_experimental_id IS NOT NULL) AND (a.data_matricula >= p_1.inicio_mes) AND (a.data_matricula <= p_1.fim_mes))
          GROUP BY a.professor_experimental_id, a.unidade_id
        ), evasoes_mes AS (
         SELECT m.professor_id,
            m.unidade_id,
            count(*) AS quantidade
           FROM movimentacoes_admin m,
            periodo p_1
          WHERE (public.is_movimentacao_admin_retencao_valida(m.id) AND (m.professor_id IS NOT NULL) AND (m.data >= p_1.inicio_mes) AND (m.data <= p_1.fim_mes) AND ((m.tipo)::text = 'evasao'::text))
          GROUP BY m.professor_id, m.unidade_id
        ), nao_renovacoes_mes AS (
         SELECT m.professor_id,
            m.unidade_id,
            count(*) AS quantidade
           FROM movimentacoes_admin m,
            periodo p_1
          WHERE (public.is_movimentacao_admin_retencao_valida(m.id) AND (m.professor_id IS NOT NULL) AND (m.data >= p_1.inicio_mes) AND (m.data <= p_1.fim_mes) AND ((m.tipo)::text = 'nao_renovacao'::text))
          GROUP BY m.professor_id, m.unidade_id
        )
 SELECT p.id AS professor_id,
    p.nome AS professor_nome,
    COALESCE(fdp.unidade_id, ai.unidade_id, mm.unidade_id) AS unidade_id,
    per.ano,
    per.mes,
    (COALESCE(ai.quantidade, (0)::bigint))::integer AS alunos_iniciais,
    (COALESCE(mm.quantidade, (0)::bigint))::integer AS matriculas_mes,
    (COALESCE(em.quantidade, (0)::bigint))::integer AS evasoes_mes,
    (COALESCE(nr.quantidade, (0)::bigint))::integer AS nao_renovacoes_mes,
    COALESCE(fdp.fator_demanda_ponderado, 1.0) AS fator_demanda_ponderado,
        CASE
            WHEN (COALESCE(ai.quantidade, (0)::bigint) > 0) THEN round((((((COALESCE(mm.quantidade, (0)::bigint) - COALESCE(em.quantidade, (0)::bigint)) - COALESCE(nr.quantidade, (0)::bigint)))::numeric / (ai.quantidade)::numeric) * (100)::numeric), 2)
            ELSE (0)::numeric
        END AS taxa_crescimento_bruta,
        CASE
            WHEN (COALESCE(ai.quantidade, (0)::bigint) > 0) THEN round(((((((COALESCE(mm.quantidade, (0)::bigint) - COALESCE(em.quantidade, (0)::bigint)) - COALESCE(nr.quantidade, (0)::bigint)))::numeric / (ai.quantidade)::numeric) * (100)::numeric) * COALESCE(fdp.fator_demanda_ponderado, 1.0)), 2)
            ELSE (0)::numeric
        END AS taxa_crescimento_ajustada,
        CASE
            WHEN (COALESCE(ai.quantidade, (0)::bigint) > 0) THEN GREATEST((0)::numeric, LEAST((100)::numeric, round((((((((((COALESCE(mm.quantidade, (0)::bigint) - COALESCE(em.quantidade, (0)::bigint)) - COALESCE(nr.quantidade, (0)::bigint)))::numeric / (ai.quantidade)::numeric) * (100)::numeric) * COALESCE(fdp.fator_demanda_ponderado, 1.0)) + (10)::numeric) / (30)::numeric) * (100)::numeric), 2)))
            ELSE 33.33
        END AS pontos_crescimento
   FROM ((((((professores p
     CROSS JOIN periodo per)
     LEFT JOIN vw_fator_demanda_professor fdp ON ((fdp.professor_id = p.id)))
     LEFT JOIN alunos_iniciais ai ON (((ai.professor_id = p.id) AND (ai.unidade_id = fdp.unidade_id))))
     LEFT JOIN matriculas_mes mm ON (((mm.professor_id = p.id) AND (mm.unidade_id = COALESCE(fdp.unidade_id, ai.unidade_id)))))
     LEFT JOIN evasoes_mes em ON (((em.professor_id = p.id) AND (em.unidade_id = COALESCE(fdp.unidade_id, ai.unidade_id)))))
     LEFT JOIN nao_renovacoes_mes nr ON (((nr.professor_id = p.id) AND (nr.unidade_id = COALESCE(fdp.unidade_id, ai.unidade_id)))))
  WHERE (p.ativo = true);;

