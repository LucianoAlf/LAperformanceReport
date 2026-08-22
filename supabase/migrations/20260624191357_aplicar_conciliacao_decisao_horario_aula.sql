-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

CREATE OR REPLACE FUNCTION public.aplicar_conciliacao_decisao(p_divergencia_id bigint, p_aluno_id integer, p_decisao text, p_patch jsonb DEFAULT '{}'::jsonb, p_emusys_matricula_id text DEFAULT NULL::text, p_decidido_por text DEFAULT 'usuario_app'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_unidade uuid;
  v_conflito integer;
  v_agora timestamptz := now();
BEGIN
  IF p_decisao NOT IN ('aprovar', 'vincular', 'manter', 'ignorar') THEN
    RAISE EXCEPTION 'decisao inválida: %', p_decisao;
  END IF;

  IF p_decisao IN ('aprovar', 'vincular') THEN
    IF p_aluno_id IS NULL THEN
      RAISE EXCEPTION 'aluno_id obrigatório para %', p_decisao;
    END IF;

    SELECT unidade_id INTO v_unidade FROM alunos WHERE id = p_aluno_id;

    IF p_decisao = 'vincular' AND p_emusys_matricula_id IS NOT NULL THEN
      SELECT count(*) INTO v_conflito FROM alunos
       WHERE emusys_matricula_id = p_emusys_matricula_id
         AND unidade_id IS NOT DISTINCT FROM v_unidade
         AND id <> p_aluno_id;
      IF v_conflito > 0 THEN
        RAISE EXCEPTION 'matrícula % já está vinculada a outro aluno desta unidade', p_emusys_matricula_id;
      END IF;
    END IF;

    UPDATE alunos SET
      curso_id             = CASE WHEN p_patch ? 'curso_id'             THEN NULLIF(p_patch->>'curso_id','')::int     ELSE curso_id END,
      professor_atual_id   = CASE WHEN p_patch ? 'professor_atual_id'   THEN NULLIF(p_patch->>'professor_atual_id','')::int ELSE professor_atual_id END,
      valor_cheio          = CASE WHEN p_patch ? 'valor_cheio'          THEN NULLIF(p_patch->>'valor_cheio','')::numeric ELSE valor_cheio END,
      desconto_fixo        = CASE WHEN p_patch ? 'desconto_fixo'        THEN NULLIF(p_patch->>'desconto_fixo','')::numeric ELSE desconto_fixo END,
      desconto_condicional = CASE WHEN p_patch ? 'desconto_condicional' THEN NULLIF(p_patch->>'desconto_condicional','')::numeric ELSE desconto_condicional END,
      data_fim_contrato    = CASE WHEN p_patch ? 'data_fim_contrato'    THEN NULLIF(p_patch->>'data_fim_contrato','')::date ELSE data_fim_contrato END,
      dia_aula             = CASE WHEN p_patch ? 'dia_aula'             THEN NULLIF(p_patch->>'dia_aula','')           ELSE dia_aula END,
      horario_aula         = CASE WHEN p_patch ? 'horario_aula'         THEN NULLIF(p_patch->>'horario_aula','')::time ELSE horario_aula END,
      status               = CASE WHEN p_patch ? 'status'               THEN NULLIF(p_patch->>'status','')             ELSE status END,
      data_saida           = CASE WHEN p_patch ? 'data_saida'           THEN NULLIF(p_patch->>'data_saida','')::date   ELSE data_saida END,
      emusys_matricula_id  = COALESCE(p_emusys_matricula_id, emusys_matricula_id),
      updated_at = v_agora
    WHERE id = p_aluno_id;
  END IF;

  INSERT INTO matriculas_divergencias_decisoes
    (divergencia_id, aluno_id, decisao, valor_escolhido, motivo, decidido_por, metadata, updated_at)
  VALUES
    (p_divergencia_id, p_aluno_id, p_decisao, p_patch,
     'Conciliação: ' || p_decisao, COALESCE(p_decidido_por, 'usuario_app'),
     jsonb_build_object('emusys_matricula_id', p_emusys_matricula_id), v_agora)
  ON CONFLICT (divergencia_id) DO UPDATE SET
    decisao = EXCLUDED.decisao,
    aluno_id = EXCLUDED.aluno_id,
    valor_escolhido = EXCLUDED.valor_escolhido,
    motivo = EXCLUDED.motivo,
    decidido_por = EXCLUDED.decidido_por,
    metadata = EXCLUDED.metadata,
    updated_at = EXCLUDED.updated_at;

  UPDATE matriculas_divergencias SET resolvido = true, updated_at = v_agora
  WHERE id = p_divergencia_id;

  RETURN jsonb_build_object('ok', true, 'decisao', p_decisao, 'aluno_id', p_aluno_id);
END;
$function$;
