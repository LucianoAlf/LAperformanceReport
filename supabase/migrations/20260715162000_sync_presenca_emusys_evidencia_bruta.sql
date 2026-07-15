-- O Emusys nao informa quando a chamada foi feita e usa "ausente" tambem
-- quando nao houve chamada. Estes campos preservam o estado bruto sem fingir
-- que o instante do sync e o instante real da resposta.

ALTER TABLE public.aluno_presenca
  ADD COLUMN IF NOT EXISTS emusys_presenca_bruta text,
  ADD COLUMN IF NOT EXISTS sincronizado_emusys_em timestamptz;

COMMENT ON COLUMN public.aluno_presenca.emusys_presenca_bruta IS
  'Valor bruto de alunos[].presenca no GET /aulas do Emusys. Nao equivale sozinho a falta confirmada.';

COMMENT ON COLUMN public.aluno_presenca.sincronizado_emusys_em IS
  'Instante em que o LA Report leu o estado no Emusys; nao e o instante real da chamada.';

CREATE OR REPLACE FUNCTION public.upsert_presenca_emusys_bruta(
  p_aluno_id integer,
  p_aula_emusys_id integer,
  p_professor_id integer,
  p_unidade_id uuid,
  p_data_aula date,
  p_horario_aula time without time zone,
  p_status_origem text,
  p_curso_nome text,
  p_turma_nome text,
  p_sala_nome text,
  p_sincronizado_em timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_status text;
  v_status_presenca text;
  v_status_bruto text;
BEGIN
  v_status_bruto := lower(btrim(COALESCE(p_status_origem, 'ausente')));
  v_status := CASE WHEN v_status_bruto = 'presente' THEN 'presente' ELSE 'ausente' END;
  v_status_presenca := CASE WHEN v_status = 'presente' THEN 'presente' ELSE 'falta' END;

  INSERT INTO public.aluno_presenca (
    aluno_id,
    aula_emusys_id,
    professor_id,
    unidade_id,
    data_aula,
    horario_aula,
    status,
    status_presenca,
    curso_nome,
    turma_nome,
    sala_nome,
    respondido_por,
    respondido_em,
    emusys_presenca_bruta,
    sincronizado_emusys_em
  ) VALUES (
    p_aluno_id,
    p_aula_emusys_id,
    p_professor_id,
    p_unidade_id,
    p_data_aula,
    p_horario_aula,
    v_status,
    v_status_presenca,
    p_curso_nome,
    p_turma_nome,
    p_sala_nome,
    'emusys',
    NULL,
    v_status_bruto,
    COALESCE(p_sincronizado_em, now())
  )
  ON CONFLICT (aluno_id, aula_emusys_id) DO UPDATE
  SET
    professor_id = EXCLUDED.professor_id,
    unidade_id = EXCLUDED.unidade_id,
    data_aula = EXCLUDED.data_aula,
    horario_aula = EXCLUDED.horario_aula,
    curso_nome = EXCLUDED.curso_nome,
    turma_nome = EXCLUDED.turma_nome,
    sala_nome = EXCLUDED.sala_nome,
    status = CASE
      WHEN aluno_presenca.status = 'presente' AND EXCLUDED.status = 'ausente'
        THEN aluno_presenca.status
      ELSE EXCLUDED.status
    END,
    status_presenca = CASE
      WHEN aluno_presenca.status = 'presente' AND EXCLUDED.status = 'ausente'
        THEN aluno_presenca.status_presenca
      ELSE EXCLUDED.status_presenca
    END,
    emusys_presenca_bruta = CASE
      WHEN aluno_presenca.status = 'presente' AND EXCLUDED.status = 'ausente'
        THEN COALESCE(aluno_presenca.emusys_presenca_bruta, 'presente')
      ELSE EXCLUDED.emusys_presenca_bruta
    END,
    sincronizado_emusys_em = EXCLUDED.sincronizado_emusys_em,
    respondido_por = 'emusys',
    respondido_em = NULL
  WHERE aluno_presenca.respondido_por IS NULL
     OR aluno_presenca.respondido_por IN ('emusys', 'sistema')
  RETURNING aluno_presenca.id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.upsert_presenca_emusys_bruta(
  integer, integer, integer, uuid, date, time without time zone,
  text, text, text, text, timestamptz
) IS
  'Reconcilia evidencia bruta do Emusys. Atualiza linhas automaticas, preserva respostas humanas e permite que presente tardio corrija ausente default.';

REVOKE ALL ON FUNCTION public.upsert_presenca_emusys_bruta(
  integer, integer, integer, uuid, date, time without time zone,
  text, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.upsert_presenca_emusys_bruta(
  integer, integer, integer, uuid, date, time without time zone,
  text, text, text, text, timestamptz
) TO service_role;
