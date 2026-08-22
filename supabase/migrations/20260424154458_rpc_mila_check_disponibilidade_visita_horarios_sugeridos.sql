-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


CREATE OR REPLACE FUNCTION public.mila_check_disponibilidade_visita(
  p_unidade_id uuid,
  p_data       date,
  p_horario    time,
  p_telefone   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_config       public.visitas_config%ROWTYPE;
  v_feriado_nome text;
  v_dia_semana   integer;
  v_hora_inicio  time;
  v_hora_fim     time;
  v_count        integer;
  v_horarios     text[];
BEGIN
  -- 1. Config da unidade
  SELECT * INTO v_config
  FROM public.visitas_config
  WHERE unidade_id = p_unidade_id AND ativo = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'disponivel', false,
      'motivo', 'Sistema de visitas nao esta ativo para esta unidade'
    );
  END IF;

  -- 2. Feriado (dia inteiro, sem sugestao de horarios)
  SELECT nome INTO v_feriado_nome
  FROM public.feriados
  WHERE data = p_data AND ativo = true
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'disponivel', false,
      'motivo', format('Escola fechada — %s', v_feriado_nome)
    );
  END IF;

  -- 3. Duplicidade por telefone
  IF p_telefone IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.visitas
    WHERE telefone = p_telefone AND status = 'agendada'
  ) THEN
    RETURN jsonb_build_object(
      'disponivel', false,
      'motivo', 'Voce ja possui uma visita agendada. Um consultor entrara em contato caso precise reagendar.'
    );
  END IF;

  -- 4. Dia da semana → define janela de funcionamento (movido pra antes de hora cheia)
  v_dia_semana := EXTRACT(DOW FROM p_data);

  IF v_dia_semana = 0 THEN
    RETURN jsonb_build_object(
      'disponivel', false,
      'motivo', 'Nao atendemos aos domingos'
    );
  ELSIF v_dia_semana = 6 THEN
    v_hora_inicio := v_config.horario_inicio_sab;
    v_hora_fim    := v_config.horario_fim_sab;
  ELSE
    v_hora_inicio := v_config.horario_inicio_seg_sex;
    v_hora_fim    := v_config.horario_fim_seg_sex;
  END IF;

  -- 5. Calcula horarios livres do dia (uma vez, reaproveita em todos os casos de erro de horario)
  SELECT array_agg(to_char(h::time, 'HH24:MI') ORDER BY h) INTO v_horarios
  FROM generate_series(
    (p_data + v_hora_inicio)::timestamp,
    (p_data + v_hora_fim - interval '1 hour')::timestamp,
    interval '1 hour'
  ) AS h
  WHERE (
    SELECT COUNT(*) FROM public.visitas
    WHERE unidade_id = p_unidade_id
      AND data = p_data
      AND horario = h::time
      AND status IN ('agendada', 'realizada')
  ) < v_config.max_visitas_por_horario;

  -- 6. Hora cheia (agora retorna sugestoes)
  IF EXTRACT(MINUTE FROM p_horario) != 0 OR EXTRACT(SECOND FROM p_horario) != 0 THEN
    RETURN jsonb_build_object(
      'disponivel', false,
      'motivo', 'Apenas horarios cheios sao permitidos (ex: 14:00, 15:00)',
      'horarios_disponiveis', COALESCE(v_horarios, ARRAY[]::text[])
    );
  END IF;

  -- 7. Dentro da janela (agora retorna sugestoes)
  IF p_horario < v_hora_inicio OR p_horario >= v_hora_fim THEN
    RETURN jsonb_build_object(
      'disponivel', false,
      'motivo', format(
        'Horario fora do funcionamento (%s as %s)',
        to_char(v_hora_inicio, 'HH24:MI'),
        to_char(v_hora_fim,    'HH24:MI')
      ),
      'horarios_disponiveis', COALESCE(v_horarios, ARRAY[]::text[])
    );
  END IF;

  -- 8. Conta visitas no mesmo horario (lotado)
  SELECT COUNT(*) INTO v_count
  FROM public.visitas
  WHERE unidade_id = p_unidade_id
    AND data = p_data
    AND horario = p_horario
    AND status IN ('agendada', 'realizada');

  IF v_count >= v_config.max_visitas_por_horario THEN
    RETURN jsonb_build_object(
      'disponivel', false,
      'motivo', format('Horario lotado (%s/%s visitas neste horario)',
                       v_count, v_config.max_visitas_por_horario),
      'horarios_disponiveis', COALESCE(v_horarios, ARRAY[]::text[])
    );
  END IF;

  -- 9. Disponivel
  RETURN jsonb_build_object('disponivel', true);
END;
$$;

COMMENT ON FUNCTION public.mila_check_disponibilidade_visita IS
  'Valida disponibilidade de horario de visita. Retorna jsonb com disponivel + motivo + horarios_disponiveis (quando aplicavel).';
