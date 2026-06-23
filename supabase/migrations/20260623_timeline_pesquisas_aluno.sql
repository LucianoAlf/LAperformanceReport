-- Timeline de pesquisas do aluno: comentário, status e RPCs de leitura/gravação.

-- 1. Colunas novas
ALTER TABLE pesquisas_whatsapp
  ADD COLUMN IF NOT EXISTS comentario text,
  ADD COLUMN IF NOT EXISTS status text;

-- 2. Backfill de status nos registros existentes
UPDATE pesquisas_whatsapp
SET status = CASE WHEN nota IS NOT NULL THEN 'respondida' ELSE 'pendente' END
WHERE status IS NULL;

-- 3. Leitura: régua fixa de marcos com o estado de cada um (1 registro por tipo via DISTINCT ON)
CREATE OR REPLACE FUNCTION public.get_timeline_pesquisas_aluno(p_aluno_id integer)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH regua(ord, tipo, label, ativo) AS (
    VALUES
      (1, 'pos_primeira_aula', '1ª aula', true),
      (2, 'tres_meses', '3 meses', false),
      (3, 'evasao', 'Evasão', false)
  ),
  reg AS (
    SELECT DISTINCT ON (pw.tipo)
      pw.tipo, pw.nota, pw.comentario, pw.status, pw.respondido_em, pw.enviado_em
    FROM pesquisas_whatsapp pw
    WHERE pw.aluno_id = p_aluno_id
    ORDER BY pw.tipo, (pw.nota IS NOT NULL) DESC, pw.respondido_em DESC NULLS LAST, pw.created_at DESC
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'tipo', r.tipo,
      'label', r.label,
      'ativo', r.ativo,
      'nota', reg.nota,
      'comentario', reg.comentario,
      'status', reg.status,
      'respondido_em', reg.respondido_em,
      'enviado_em', reg.enviado_em
    ) ORDER BY r.ord
  ), '[]'::jsonb)
  FROM regua r
  LEFT JOIN reg ON reg.tipo = r.tipo;
$function$;

GRANT EXECUTE ON FUNCTION public.get_timeline_pesquisas_aluno(integer) TO authenticated;

-- 4. Gravação: assinatura nova (a antiga de 3 params some)
DROP FUNCTION IF EXISTS public.registrar_resposta_pesquisa_manual(integer, integer, date);

CREATE OR REPLACE FUNCTION public.registrar_resposta_pesquisa_manual(
  p_aluno_id integer,
  p_data date,
  p_tipo text DEFAULT 'pos_primeira_aula',
  p_nota integer DEFAULT NULL,
  p_comentario text DEFAULT NULL,
  p_nao_respondeu boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_unidade_id uuid;
  v_data_matricula date;
  v_id uuid;
  v_ts timestamptz;
  v_status text;
BEGIN
  IF p_tipo NOT IN ('pos_primeira_aula', 'tres_meses', 'evasao') THEN
    RAISE EXCEPTION 'Tipo de pesquisa inválido: %', p_tipo;
  END IF;
  IF NOT p_nao_respondeu AND (p_nota IS NULL OR p_nota < 1 OR p_nota > 5) THEN
    RAISE EXCEPTION 'Nota deve estar entre 1 e 5 quando respondida (recebido: %)', p_nota;
  END IF;

  SELECT unidade_id, data_inicio_contrato INTO v_unidade_id, v_data_matricula
  FROM alunos WHERE id = p_aluno_id;
  IF v_unidade_id IS NULL THEN
    RAISE EXCEPTION 'Aluno % não encontrado', p_aluno_id;
  END IF;

  v_data_matricula := COALESCE(v_data_matricula, p_data);

  v_ts := (p_data::timestamp + interval '15 hours') AT TIME ZONE 'UTC';
  v_status := CASE WHEN p_nao_respondeu THEN 'nao_respondida' ELSE 'respondida' END;

  -- Upsert lógico por (aluno_id, tipo): atualiza o registro mais relevante; só insere se não houver
  SELECT id INTO v_id
  FROM pesquisas_whatsapp
  WHERE aluno_id = p_aluno_id AND tipo = p_tipo
  ORDER BY (nota IS NOT NULL) DESC, respondido_em DESC NULLS LAST, created_at DESC
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE pesquisas_whatsapp
    SET nota = CASE WHEN p_nao_respondeu THEN NULL ELSE p_nota END,
        comentario = p_comentario,
        status = v_status,
        respondido_em = v_ts,
        manual = true
    WHERE id = v_id;
  ELSE
    INSERT INTO pesquisas_whatsapp (
      aluno_id, unidade_id, tipo, data_matricula, enviado_em, enviado_ok,
      nota, comentario, status, respondido_em, manual
    ) VALUES (
      p_aluno_id, v_unidade_id, p_tipo, v_data_matricula, v_ts, true,
      CASE WHEN p_nao_respondeu THEN NULL ELSE p_nota END,
      p_comentario, v_status, v_ts, true
    )
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.registrar_resposta_pesquisa_manual(integer, date, text, integer, text, boolean) TO authenticated;
