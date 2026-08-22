-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Porta estreita de escrita do Fábio.
-- SECURITY DEFINER: roda com privilégios da função, então o Fábio NÃO precisa (e não deve ter)
-- UPDATE livre em aulas_emusys. Ele só executa esta função, que só toca anotacoes_fabio.
CREATE OR REPLACE FUNCTION public.registrar_aula_fabio(
  p_aula_id      integer,
  p_texto        text,
  p_origem       text    DEFAULT 'audio',
  p_professor_id integer DEFAULT NULL,
  p_modo         text    DEFAULT 'novo'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_texto_anterior text;
  v_texto_novo     text;
  v_achou          boolean := false;
BEGIN
  -- Validações de entrada
  IF p_texto IS NULL OR btrim(p_texto) = '' THEN
    RAISE EXCEPTION 'Texto do registro não pode ser vazio';
  END IF;
  IF p_origem NOT IN ('audio','texto') THEN
    RAISE EXCEPTION 'Origem inválida: % (use audio ou texto)', p_origem;
  END IF;
  IF p_modo NOT IN ('novo','substituir','complementar') THEN
    RAISE EXCEPTION 'Modo inválido: % (use novo, substituir ou complementar)', p_modo;
  END IF;

  -- Buscar texto anterior e confirmar que a aula existe
  SELECT anotacoes_fabio INTO v_texto_anterior
  FROM public.aulas_emusys WHERE id = p_aula_id;
  GET DIAGNOSTICS v_achou = ROW_COUNT;

  IF NOT v_achou THEN
    RAISE EXCEPTION 'Aula % não encontrada', p_aula_id;
  END IF;

  -- Idempotência: texto idêntico ao já gravado → não regrava, não polui o log
  IF v_texto_anterior IS NOT DISTINCT FROM p_texto THEN
    RETURN jsonb_build_object(
      'status','sem_mudanca',
      'aula_id', p_aula_id,
      'mensagem','Texto idêntico ao já registrado; nada gravado'
    );
  END IF;

  -- Aplicar modo
  IF p_modo = 'complementar'
     AND v_texto_anterior IS NOT NULL
     AND btrim(v_texto_anterior) <> '' THEN
    v_texto_novo := v_texto_anterior || E'\n\n--- (complemento) ---\n\n' || p_texto;
  ELSE
    v_texto_novo := p_texto;
  END IF;

  -- Gravar SOMENTE em anotacoes_fabio (jamais em anotacoes)
  UPDATE public.aulas_emusys
  SET anotacoes_fabio = v_texto_novo
  WHERE id = p_aula_id;

  -- Trilha de auditoria
  INSERT INTO public.aula_registros_fabio_log
    (aula_id, professor_id, texto_anterior, texto_novo, origem, modo)
  VALUES
    (p_aula_id, p_professor_id, v_texto_anterior, v_texto_novo, p_origem, p_modo);

  RETURN jsonb_build_object(
    'status','gravado',
    'aula_id', p_aula_id,
    'modo', p_modo,
    'origem', p_origem,
    'tinha_anterior', (v_texto_anterior IS NOT NULL AND btrim(v_texto_anterior) <> '')
  );
END;
$$;

-- Menor privilégio: ninguém executa por padrão.
-- O GRANT EXECUTE para o role específico do Fábio é o passo seguinte (liberar escrita),
-- feito de forma estreita — nunca UPDATE aberto na tabela.
REVOKE ALL ON FUNCTION public.registrar_aula_fabio(integer, text, text, integer, text) FROM PUBLIC;

COMMENT ON FUNCTION public.registrar_aula_fabio(integer, text, text, integer, text) IS
  'Única via de escrita do Fábio no registro de aula. Grava só em anotacoes_fabio, nunca em anotacoes. Mantém audit log. SECURITY DEFINER + REVOKE de PUBLIC garantem que o Fábio escreve apenas por aqui, sem UPDATE livre.';
