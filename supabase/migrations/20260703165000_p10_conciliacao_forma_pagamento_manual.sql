-- P10: decisao manual auditada para forma de pagamento na conciliacao Emusys.
-- A UI nao deve atualizar alunos diretamente; a escolha manual passa por RPC.

ALTER TABLE public.alunos_emusys_atributos_decisoes
  DROP CONSTRAINT IF EXISTS alunos_emusys_atributos_decisoes_decisao_check;

ALTER TABLE public.alunos_emusys_atributos_decisoes
  ADD CONSTRAINT alunos_emusys_atributos_decisoes_decisao_check
  CHECK (decisao IN ('aplicar_emusys', 'manter_la', 'ignorar', 'revisar', 'definir_manual'));

CREATE OR REPLACE FUNCTION public.definir_forma_pagamento_conciliacao_aluno(
  p_divergencia_id bigint,
  p_forma_pagamento_id integer,
  p_decidido_por text DEFAULT 'usuario_app'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_div public.alunos_emusys_atributos_divergencias%ROWTYPE;
  v_forma public.formas_pagamento%ROWTYPE;
  v_agora timestamptz := now();
  v_valor_aplicado jsonb;
BEGIN
  SELECT *
    INTO v_div
  FROM public.alunos_emusys_atributos_divergencias
  WHERE id = p_divergencia_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'divergencia % nao encontrada', p_divergencia_id;
  END IF;

  IF v_div.resolvido THEN
    RETURN jsonb_build_object('ok', true, 'ja_resolvido', true, 'id', p_divergencia_id);
  END IF;

  IF v_div.aluno_id IS NULL THEN
    RAISE EXCEPTION 'aluno_id obrigatorio para definir forma de pagamento';
  END IF;

  IF v_div.campo <> 'forma_pagamento_id' THEN
    RAISE EXCEPTION 'campo % nao pode ser alterado por esta RPC', v_div.campo;
  END IF;

  SELECT *
    INTO v_forma
  FROM public.formas_pagamento
  WHERE id = p_forma_pagamento_id
    AND ativo IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'forma de pagamento % nao encontrada ou inativa', p_forma_pagamento_id;
  END IF;

  UPDATE public.alunos
  SET forma_pagamento_id = v_forma.id,
      updated_at = v_agora
  WHERE id = v_div.aluno_id;

  v_valor_aplicado := jsonb_build_object(
    'forma_pagamento_id', v_forma.id,
    'forma_pagamento', v_forma.nome,
    'sigla', v_forma.sigla
  );

  INSERT INTO public.alunos_emusys_atributos_decisoes
    (divergencia_id, aluno_id, decisao, campo, valor_nosso, valor_emusys, valor_aplicado, motivo, decidido_por, metadata)
  VALUES
    (
      v_div.id,
      v_div.aluno_id,
      'definir_manual',
      v_div.campo,
      COALESCE(v_div.valor_nosso, '{}'::jsonb),
      COALESCE(v_div.valor_emusys, '{}'::jsonb),
      v_valor_aplicado,
      'Conciliacao atributo aluno: definir forma de pagamento manual',
      COALESCE(p_decidido_por, 'usuario_app'),
      jsonb_build_object(
        'tipo_divergencia', v_div.tipo_divergencia,
        'emusys_student_id', v_div.emusys_student_id,
        'emusys_matricula_id', v_div.emusys_matricula_id,
        'fonte', v_div.fonte
      )
    );

  UPDATE public.alunos_emusys_atributos_divergencias
  SET resolvido = true,
      decisao = 'definir_manual',
      decidido_por = COALESCE(p_decidido_por, 'usuario_app'),
      decidido_em = v_agora,
      updated_at = v_agora
  WHERE id = v_div.id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_div.id,
    'aluno_id', v_div.aluno_id,
    'decisao', 'definir_manual',
    'resolvido', true,
    'valor_aplicado', v_valor_aplicado
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.definir_forma_pagamento_conciliacao_aluno(bigint, integer, text) TO authenticated;
