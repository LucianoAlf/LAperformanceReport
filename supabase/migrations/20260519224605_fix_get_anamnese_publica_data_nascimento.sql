-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


DROP FUNCTION IF EXISTS public.get_anamnese_publica(text);

CREATE OR REPLACE FUNCTION public.get_anamnese_publica(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anam anamneses%ROWTYPE;
  v_unidade_nome text;
  v_aluno_nome text;
  v_aluno_data_nascimento date;
  v_professor_nome text;
  v_respostas jsonb;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RETURN NULL;
  END IF;

  SELECT *
    INTO v_anam
    FROM anamneses
   WHERE share_token = p_token
     AND status = 'completa'
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT nome INTO v_unidade_nome FROM unidades WHERE id = v_anam.unidade_id;

  IF v_anam.aluno_id IS NOT NULL THEN
    SELECT a.nome, a.data_nascimento, p.nome
      INTO v_aluno_nome, v_aluno_data_nascimento, v_professor_nome
      FROM alunos a
      LEFT JOIN professores p ON p.id = a.professor_atual_id
     WHERE a.id = v_anam.aluno_id;
  END IF;

  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'pergunta_numero', pergunta_numero,
               'resposta_posicao', resposta_posicao
             ) ORDER BY pergunta_numero
           ),
           '[]'::jsonb
         )
    INTO v_respostas
    FROM anamnese_respostas_perfil
   WHERE anamnese_id = v_anam.id;

  RETURN jsonb_build_object(
    'id', v_anam.id,
    'tipo_formulario', v_anam.tipo_formulario,
    'created_at', v_anam.created_at,
    'modo_resposta', v_anam.modo_resposta,
    'nome_aluno', v_anam.nome_aluno,
    'data_nascimento', v_aluno_data_nascimento,
    'genero', v_anam.genero,
    'telefone_aluno', v_anam.telefone_aluno,
    'aluno_nome_oficial', v_aluno_nome,
    'professor_nome', v_professor_nome,
    'unidade_nome', v_unidade_nome,
    'cursos_escolhidos', v_anam.cursos_escolhidos,
    'possui_instrumento', v_anam.possui_instrumento,
    'objetivos', v_anam.objetivos,
    'tempo_para_metas', v_anam.tempo_para_metas,
    'tempo_disponivel_estudo', v_anam.tempo_disponivel_estudo,
    'generos_musicais', v_anam.generos_musicais,
    'instrumentos_toca', v_anam.instrumentos_toca,
    'experiencia_anterior', v_anam.experiencia_anterior,
    'nivel_conhecimento_musical', v_anam.nivel_conhecimento_musical,
    'nivel_habilidade_instrumento', v_anam.nivel_habilidade_instrumento,
    'interesse_bandas', v_anam.interesse_bandas,
    'motivo_procura_pais', v_anam.motivo_procura_pais,
    'metas_pais', v_anam.metas_pais,
    'fonte_exposicao_musical', v_anam.fonte_exposicao_musical,
    'musicos_na_familia', v_anam.musicos_na_familia,
    'interesse_instrumento_cantar', v_anam.interesse_instrumento_cantar,
    'exposicao_telas', v_anam.exposicao_telas,
    'comunicacao_crianca', v_anam.comunicacao_crianca,
    'sono_crianca', v_anam.sono_crianca,
    'estereotipias', v_anam.estereotipias,
    'quem_traz_crianca', v_anam.quem_traz_crianca,
    'diagnosticos', v_anam.diagnosticos,
    'cuidado_medico', v_anam.cuidado_medico,
    'medicacao_continua', v_anam.medicacao_continua,
    'necessidade_apoio', v_anam.necessidade_apoio,
    'perfil_baby', v_anam.perfil_baby,
    'temperamento_primario', v_anam.temperamento_primario,
    'temperamento_secundario', v_anam.temperamento_secundario,
    'temperamento_codinome', v_anam.temperamento_codinome,
    'respostas_perfil', v_respostas,
    'observacoes_entrevistador', v_anam.observacoes_entrevistador
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_anamnese_publica(text) TO anon, authenticated;
