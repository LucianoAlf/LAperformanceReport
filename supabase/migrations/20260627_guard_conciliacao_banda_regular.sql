-- Guardrail: impede que a conciliacao aprove payload Emusys de banda/projeto
-- sobre uma matricula regular (ou vice-versa). Isso protege MRR, ticket e
-- contagem de pagantes contra trocas de vinculo por nome parecido.

CREATE OR REPLACE FUNCTION public.aplicar_conciliacao_decisao(
  p_divergencia_id bigint,
  p_aluno_id integer,
  p_decisao text,
  p_patch jsonb DEFAULT '{}'::jsonb,
  p_emusys_matricula_id text DEFAULT NULL,
  p_decidido_por text DEFAULT 'usuario_app'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_aluno public.alunos%ROWTYPE;
  v_unidade uuid;
  v_conflito integer;
  v_agora timestamptz := now();
  v_campos_invalidos text[];
  v_tipo_alvo integer;
  v_tipo_codigo text;
  v_curso_alvo integer;
  v_linha_eh_banda boolean := false;
  v_payload jsonb;
  v_payload_tem_banda boolean := false;
  v_payload_tem_regular boolean := false;
BEGIN
  p_patch := COALESCE(p_patch, '{}'::jsonb) - 'valor_parcela';

  IF p_decisao NOT IN ('aprovar', 'vincular', 'manter', 'ignorar') THEN
    RAISE EXCEPTION 'decisao invalida: %', p_decisao;
  END IF;

  SELECT array_agg(k)
    INTO v_campos_invalidos
  FROM jsonb_object_keys(p_patch) AS k
  WHERE k NOT IN (
    'curso_id',
    'professor_atual_id',
    'tipo_matricula_id',
    'valor_cheio',
    'desconto_fixo',
    'desconto_condicional',
    'data_fim_contrato',
    'dia_aula',
    'horario_aula',
    'status',
    'data_saida'
  );

  IF COALESCE(array_length(v_campos_invalidos, 1), 0) > 0 THEN
    RAISE EXCEPTION 'campo(s) nao permitido(s) no patch: %', array_to_string(v_campos_invalidos, ', ');
  END IF;

  IF p_decisao IN ('aprovar', 'vincular') THEN
    IF p_aluno_id IS NULL THEN
      RAISE EXCEPTION 'aluno_id obrigatorio para %', p_decisao;
    END IF;

    SELECT * INTO v_aluno FROM public.alunos WHERE id = p_aluno_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'aluno % nao encontrado', p_aluno_id;
    END IF;

    v_unidade := v_aluno.unidade_id;
    v_tipo_alvo := CASE
      WHEN p_patch ? 'tipo_matricula_id' THEN NULLIF(p_patch->>'tipo_matricula_id','')::int
      ELSE v_aluno.tipo_matricula_id
    END;
    v_curso_alvo := CASE
      WHEN p_patch ? 'curso_id' THEN NULLIF(p_patch->>'curso_id','')::int
      ELSE v_aluno.curso_id
    END;

    SELECT codigo INTO v_tipo_codigo
    FROM public.tipos_matricula
    WHERE id = v_tipo_alvo;

    SELECT COALESCE(c.is_projeto_banda, false) OR COALESCE(upper(v_tipo_codigo) = 'BANDA', false)
      INTO v_linha_eh_banda
    FROM public.cursos c
    WHERE c.id = v_curso_alvo;

    IF p_decisao = 'vincular' AND p_emusys_matricula_id IS NOT NULL THEN
      SELECT count(*) INTO v_conflito
      FROM public.alunos
      WHERE emusys_matricula_id = p_emusys_matricula_id
        AND unidade_id IS NOT DISTINCT FROM v_unidade
        AND id <> p_aluno_id;

      IF v_conflito > 0 THEN
        RAISE EXCEPTION 'matricula % ja esta vinculada a outro aluno desta unidade', p_emusys_matricula_id;
      END IF;
    END IF;

    IF p_emusys_matricula_id IS NOT NULL THEN
      SELECT payload INTO v_payload
      FROM public.emusys_api_payload
      WHERE endpoint = 'matriculas'
        AND emusys_id::text = p_emusys_matricula_id
      ORDER BY synced_at DESC
      LIMIT 1;

      IF v_payload IS NOT NULL THEN
        WITH disciplinas AS (
          SELECT NULLIF(d->>'disciplina_id', '')::int AS emusys_disciplina_id
          FROM jsonb_array_elements(COALESCE(v_payload #> '{contrato_atual,disciplinas}', '[]'::jsonb)) AS d
          WHERE NULLIF(d->>'disciplina_id', '') IS NOT NULL
        ),
        cursos_payload AS (
          SELECT COALESCE(c.is_projeto_banda, false) AS is_banda
          FROM disciplinas d
          JOIN public.curso_emusys_depara dep
            ON dep.unidade_id IS NOT DISTINCT FROM v_unidade
           AND dep.emusys_disciplina_id = d.emusys_disciplina_id
          JOIN public.cursos c
            ON c.id = dep.curso_id
        )
        SELECT
          COALESCE(bool_or(is_banda), false),
          COALESCE(bool_or(NOT is_banda), false)
        INTO v_payload_tem_banda, v_payload_tem_regular
        FROM cursos_payload;

        IF COALESCE(v_linha_eh_banda, false) AND NOT v_payload_tem_banda THEN
          RAISE EXCEPTION 'matricula Emusys % nao e de banda/projeto; recusado para linha de banda', p_emusys_matricula_id;
        END IF;

        IF NOT COALESCE(v_linha_eh_banda, false) AND v_payload_tem_banda AND NOT v_payload_tem_regular THEN
          RAISE EXCEPTION 'matricula Emusys % e de banda/projeto; recusado para linha regular', p_emusys_matricula_id;
        END IF;
      END IF;
    END IF;

    UPDATE public.alunos SET
      curso_id             = CASE WHEN p_patch ? 'curso_id'             THEN NULLIF(p_patch->>'curso_id','')::int ELSE curso_id END,
      professor_atual_id   = CASE WHEN p_patch ? 'professor_atual_id'   THEN NULLIF(p_patch->>'professor_atual_id','')::int ELSE professor_atual_id END,
      tipo_matricula_id    = CASE WHEN p_patch ? 'tipo_matricula_id'    THEN NULLIF(p_patch->>'tipo_matricula_id','')::int ELSE tipo_matricula_id END,
      valor_cheio          = CASE WHEN p_patch ? 'valor_cheio'          THEN NULLIF(p_patch->>'valor_cheio','')::numeric ELSE valor_cheio END,
      desconto_fixo        = CASE WHEN p_patch ? 'desconto_fixo'        THEN NULLIF(p_patch->>'desconto_fixo','')::numeric ELSE desconto_fixo END,
      desconto_condicional = CASE WHEN p_patch ? 'desconto_condicional' THEN NULLIF(p_patch->>'desconto_condicional','')::numeric ELSE desconto_condicional END,
      data_fim_contrato    = CASE WHEN p_patch ? 'data_fim_contrato'    THEN NULLIF(p_patch->>'data_fim_contrato','')::date ELSE data_fim_contrato END,
      dia_aula             = CASE WHEN p_patch ? 'dia_aula'             THEN NULLIF(p_patch->>'dia_aula','') ELSE dia_aula END,
      horario_aula         = CASE WHEN p_patch ? 'horario_aula'         THEN NULLIF(p_patch->>'horario_aula','')::time ELSE horario_aula END,
      status               = CASE WHEN p_patch ? 'status'               THEN NULLIF(p_patch->>'status','') ELSE status END,
      data_saida           = CASE WHEN p_patch ? 'data_saida'           THEN NULLIF(p_patch->>'data_saida','')::date ELSE data_saida END,
      emusys_matricula_id  = COALESCE(p_emusys_matricula_id, emusys_matricula_id),
      updated_at = v_agora
    WHERE id = p_aluno_id;
  ELSIF p_decisao = 'manter' AND p_aluno_id IS NOT NULL AND p_patch <> '{}'::jsonb THEN
    INSERT INTO public.matriculas_campos_fixados
      (aluno_id, campo, valor, fixado_por, fixado_em)
    SELECT
      p_aluno_id,
      e.key,
      e.value,
      COALESCE(p_decidido_por, 'usuario_app'),
      v_agora
    FROM jsonb_each(p_patch) AS e(key, value)
    ON CONFLICT (aluno_id, campo) DO UPDATE SET
      valor = EXCLUDED.valor,
      fixado_por = EXCLUDED.fixado_por,
      fixado_em = EXCLUDED.fixado_em;
  END IF;

  INSERT INTO public.matriculas_divergencias_decisoes
    (divergencia_id, aluno_id, decisao, valor_escolhido, motivo, decidido_por, metadata, updated_at)
  VALUES
    (p_divergencia_id, p_aluno_id, p_decisao, p_patch,
     'Conciliacao: ' || p_decisao, COALESCE(p_decidido_por, 'usuario_app'),
     jsonb_build_object('emusys_matricula_id', p_emusys_matricula_id), v_agora)
  ON CONFLICT (divergencia_id) DO UPDATE SET
    decisao = EXCLUDED.decisao,
    aluno_id = EXCLUDED.aluno_id,
    valor_escolhido = EXCLUDED.valor_escolhido,
    motivo = EXCLUDED.motivo,
    decidido_por = EXCLUDED.decidido_por,
    metadata = EXCLUDED.metadata,
    updated_at = EXCLUDED.updated_at;

  UPDATE public.matriculas_divergencias
  SET resolvido = true, updated_at = v_agora
  WHERE id = p_divergencia_id;

  RETURN jsonb_build_object('ok', true, 'decisao', p_decisao, 'aluno_id', p_aluno_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.aplicar_conciliacao_decisao(bigint, integer, text, jsonb, text, text) TO authenticated;
