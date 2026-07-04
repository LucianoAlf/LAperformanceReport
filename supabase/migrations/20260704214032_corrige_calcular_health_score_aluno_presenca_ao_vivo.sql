CREATE OR REPLACE FUNCTION public.calcular_health_score_aluno(p_aluno_id integer)
 RETURNS TABLE(score integer, status character varying, detalhes jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_aluno RECORD;
  v_feedback VARCHAR;
  v_config RECORD;
  v_score NUMERIC := 0;
  v_status VARCHAR;
  v_detalhes JSONB := '[]'::JSONB;
  v_contrib JSONB;
  v_pag_score NUMERIC;
  v_tempo_score NUMERIC;
  v_fase_score NUMERIC;
  v_fb_score NUMERIC;
  v_pres_score NUMERIC;
  v_tempo INTEGER;
  v_pres INTEGER;
BEGIN
  -- Buscar dados do aluno
  SELECT * INTO v_aluno FROM alunos WHERE id = p_aluno_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 0::INTEGER, 'erro'::VARCHAR, '{"erro": "Aluno não encontrado"}'::JSONB;
    RETURN;
  END IF;

  -- Buscar configuração de pesos (global ou por unidade)
  SELECT * INTO v_config
  FROM config_health_score_aluno
  WHERE unidade_id = v_aluno.unidade_id OR unidade_id IS NULL
  ORDER BY unidade_id NULLS LAST
  LIMIT 1;

  -- Fallback para pesos padrão se não houver config
  IF NOT FOUND THEN
    v_config.peso_pagamento := 30;
    v_config.peso_tempo_casa := 20;
    v_config.peso_fase_jornada := 20;
    v_config.peso_feedback_professor := 20;
    v_config.peso_presenca := 10;
    v_config.limite_saudavel := 70;
    v_config.limite_atencao := 40;
  END IF;

  -- Buscar último feedback do professor
  SELECT feedback INTO v_feedback
  FROM aluno_feedback_professor
  WHERE aluno_id = p_aluno_id
  ORDER BY competencia DESC, respondido_em DESC
  LIMIT 1;

  -- 1. PAGAMENTO (peso configurável, default 30%)
  v_pag_score := CASE v_aluno.status_pagamento
    WHEN 'em_dia' THEN 100
    WHEN 'atrasado' THEN 50
    ELSE 0 -- inadimplente
  END;
  v_score := v_score + (v_pag_score * v_config.peso_pagamento / 100);
  v_contrib := jsonb_build_object('fator', 'Pagamento', 'valor', COALESCE(v_aluno.status_pagamento, 'sem info'), 'score', v_pag_score, 'peso', v_config.peso_pagamento, 'contribuicao', ROUND(v_pag_score * v_config.peso_pagamento / 100, 1));
  v_detalhes := v_detalhes || v_contrib;

  -- 2. TEMPO DE CASA (peso configurável, default 20%)
  v_tempo := COALESCE(v_aluno.tempo_permanencia_meses, 0);
  v_tempo_score := CASE
    WHEN v_tempo > 24 THEN 100
    WHEN v_tempo > 12 THEN 80
    WHEN v_tempo > 6 THEN 60
    WHEN v_tempo > 3 THEN 40
    ELSE 20
  END;
  v_score := v_score + (v_tempo_score * v_config.peso_tempo_casa / 100);
  v_contrib := jsonb_build_object('fator', 'Tempo de Casa', 'valor', v_tempo || ' meses', 'score', v_tempo_score, 'peso', v_config.peso_tempo_casa, 'contribuicao', ROUND(v_tempo_score * v_config.peso_tempo_casa / 100, 1));
  v_detalhes := v_detalhes || v_contrib;

  -- 3. FASE DA JORNADA (peso configurável, default 20%)
  v_fase_score := CASE
    WHEN v_tempo >= 9 THEN 100  -- Renovação (veterano)
    WHEN v_tempo >= 6 THEN 80   -- Encantamento
    WHEN v_tempo >= 3 THEN 60   -- Consolidação
    ELSE 40                      -- Onboarding (risco maior)
  END;
  v_score := v_score + (v_fase_score * v_config.peso_fase_jornada / 100);
  v_contrib := jsonb_build_object('fator', 'Fase Jornada', 'valor',
    CASE
      WHEN v_tempo >= 9 THEN 'Renovação'
      WHEN v_tempo >= 6 THEN 'Encantamento'
      WHEN v_tempo >= 3 THEN 'Consolidação'
      ELSE 'Onboarding'
    END,
    'score', v_fase_score, 'peso', v_config.peso_fase_jornada, 'contribuicao', ROUND(v_fase_score * v_config.peso_fase_jornada / 100, 1));
  v_detalhes := v_detalhes || v_contrib;

  -- 4. FEEDBACK DO PROFESSOR (peso configurável, default 20%)
  v_fb_score := CASE v_feedback
    WHEN 'verde' THEN 100
    WHEN 'amarelo' THEN 50
    WHEN 'vermelho' THEN 0
    ELSE 50 -- Sem feedback = neutro
  END;
  v_score := v_score + (v_fb_score * v_config.peso_feedback_professor / 100);
  v_contrib := jsonb_build_object('fator', 'Feedback Professor', 'valor', COALESCE(v_feedback, 'sem feedback'), 'score', v_fb_score, 'peso', v_config.peso_feedback_professor, 'contribuicao', ROUND(v_fb_score * v_config.peso_feedback_professor / 100, 1));
  v_detalhes := v_detalhes || v_contrib;

  -- 5. PRESENÇA (peso configurável, default 10%) -- calculada ao vivo via vw_absenteismo_aluno (aluno_presenca), nao mais via alunos.percentual_presenca (coluna dessincronizada)
  SELECT CASE WHEN ap.total_aulas > 0
              THEN ROUND(100.0 * (ap.total_aulas - ap.faltas) / ap.total_aulas)
              ELSE NULL END
  INTO v_pres
  FROM vw_absenteismo_aluno ap
  WHERE ap.aluno_id = p_aluno_id;

  v_pres := COALESCE(v_pres, 75); -- Default 75% se não tiver dado (mesmo fallback anterior)
  v_pres_score := LEAST(100, v_pres);
  v_score := v_score + (v_pres_score * v_config.peso_presenca / 100);
  v_contrib := jsonb_build_object('fator', 'Presença', 'valor', v_pres || '%', 'score', v_pres_score, 'peso', v_config.peso_presenca, 'contribuicao', ROUND(v_pres_score * v_config.peso_presenca / 100, 1));
  v_detalhes := v_detalhes || v_contrib;

  -- Determinar status baseado nos limites configurados
  v_status := CASE
    WHEN v_score >= v_config.limite_saudavel THEN 'saudavel'
    WHEN v_score >= v_config.limite_atencao THEN 'atencao'
    ELSE 'critico'
  END;

  RETURN QUERY SELECT ROUND(v_score)::INTEGER, v_status, v_detalhes;
END;
$function$;
