-- P08D: prepara status canonico de aguardando renovacao vindo do Emusys.
-- O sync so gera divergencia quando o payload trouxer esse campo explicitamente.

ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS aguardando_renovacao boolean;

COMMENT ON COLUMN public.alunos.aguardando_renovacao IS
  'Status canonico vindo do Emusys para contrato/matricula aguardando renovacao. NULL = ainda nao informado/conciliado.';

ALTER TABLE public.alunos_emusys_atributos_divergencias
  DROP CONSTRAINT IF EXISTS alunos_emusys_atributos_divergencias_tipo_divergencia_check;

ALTER TABLE public.alunos_emusys_atributos_divergencias
  ADD CONSTRAINT alunos_emusys_atributos_divergencias_tipo_divergencia_check
  CHECK (tipo_divergencia IN (
    'foto_ausente',
    'instagram_ausente',
    'instagram_divergente',
    'contato_divergente',
    'responsavel_divergente',
    'status_financeiro_divergente',
    'forma_pagamento_divergente',
    'anamnese_pendente',
    'contrato_assinatura_pendente',
    'aguardando_renovacao_divergente'
  ));

CREATE OR REPLACE FUNCTION public.aplicar_conciliacao_aluno_atributo(
  p_divergencia_id bigint,
  p_decisao text,
  p_decidido_por text DEFAULT 'usuario_app'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_div public.alunos_emusys_atributos_divergencias%ROWTYPE;
  v_agora timestamptz := now();
  v_valor text;
  v_bool boolean;
  v_forma_nome text;
  v_forma_id integer;
  v_valor_aplicado jsonb := '{}'::jsonb;
  v_resolver boolean;
BEGIN
  IF p_decisao NOT IN ('aplicar_emusys', 'manter_la', 'ignorar', 'revisar') THEN
    RAISE EXCEPTION 'decisao invalida: %', p_decisao;
  END IF;

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

  IF p_decisao = 'aplicar_emusys' THEN
    IF v_div.aluno_id IS NULL THEN
      RAISE EXCEPTION 'aluno_id obrigatorio para aplicar dado do Emusys';
    END IF;

    CASE v_div.campo
      WHEN 'foto_url' THEN
        v_valor := COALESCE(v_div.sugestao->>'foto_url', v_div.valor_emusys->>'foto_url');
        IF v_valor IS NULL OR btrim(v_valor) = '' THEN
          RAISE EXCEPTION 'foto_url do Emusys ausente';
        END IF;
        UPDATE public.alunos SET foto_url = v_valor, updated_at = v_agora WHERE id = v_div.aluno_id;
        v_valor_aplicado := jsonb_build_object('foto_url', v_valor);

      WHEN 'instagram' THEN
        v_valor := COALESCE(v_div.sugestao->>'instagram', v_div.valor_emusys->>'instagram');
        IF v_valor IS NULL OR btrim(v_valor) = '' THEN
          RAISE EXCEPTION 'instagram do Emusys ausente';
        END IF;
        UPDATE public.alunos SET instagram = v_valor, updated_at = v_agora WHERE id = v_div.aluno_id;
        v_valor_aplicado := jsonb_build_object('instagram', v_valor);

      WHEN 'telefone' THEN
        v_valor := COALESCE(v_div.sugestao->>'telefone', v_div.valor_emusys->>'telefone');
        IF v_valor IS NULL OR btrim(v_valor) = '' THEN
          RAISE EXCEPTION 'telefone do Emusys ausente';
        END IF;
        UPDATE public.alunos SET telefone = v_valor, updated_at = v_agora WHERE id = v_div.aluno_id;
        v_valor_aplicado := jsonb_build_object('telefone', v_valor);

      WHEN 'email' THEN
        v_valor := COALESCE(v_div.sugestao->>'email', v_div.valor_emusys->>'email');
        IF v_valor IS NULL OR btrim(v_valor) = '' THEN
          RAISE EXCEPTION 'email do Emusys ausente';
        END IF;
        UPDATE public.alunos SET email = v_valor, updated_at = v_agora WHERE id = v_div.aluno_id;
        v_valor_aplicado := jsonb_build_object('email', v_valor);

      WHEN 'responsavel_nome' THEN
        v_valor := COALESCE(v_div.sugestao->>'responsavel_nome', v_div.valor_emusys->>'responsavel_nome');
        IF v_valor IS NULL OR btrim(v_valor) = '' THEN
          RAISE EXCEPTION 'responsavel_nome do Emusys ausente';
        END IF;
        UPDATE public.alunos SET responsavel_nome = v_valor, updated_at = v_agora WHERE id = v_div.aluno_id;
        v_valor_aplicado := jsonb_build_object('responsavel_nome', v_valor);

      WHEN 'responsavel_telefone' THEN
        v_valor := COALESCE(v_div.sugestao->>'responsavel_telefone', v_div.valor_emusys->>'responsavel_telefone');
        IF v_valor IS NULL OR btrim(v_valor) = '' THEN
          RAISE EXCEPTION 'responsavel_telefone do Emusys ausente';
        END IF;
        UPDATE public.alunos SET responsavel_telefone = v_valor, updated_at = v_agora WHERE id = v_div.aluno_id;
        v_valor_aplicado := jsonb_build_object('responsavel_telefone', v_valor);

      WHEN 'status_pagamento' THEN
        v_valor := COALESCE(v_div.sugestao->>'status_pagamento', v_div.valor_emusys->>'status_pagamento');
        IF v_valor IS NULL OR btrim(v_valor) = '' THEN
          RAISE EXCEPTION 'status_pagamento do Emusys ausente';
        END IF;
        UPDATE public.alunos SET status_pagamento = v_valor, updated_at = v_agora WHERE id = v_div.aluno_id;
        v_valor_aplicado := jsonb_build_object('status_pagamento', v_valor);

      WHEN 'aguardando_renovacao' THEN
        IF (v_div.sugestao ? 'aguardando_renovacao') THEN
          v_bool := (v_div.sugestao->>'aguardando_renovacao')::boolean;
        ELSIF (v_div.valor_emusys ? 'aguardando_renovacao') THEN
          v_bool := (v_div.valor_emusys->>'aguardando_renovacao')::boolean;
        ELSE
          RAISE EXCEPTION 'aguardando_renovacao do Emusys ausente';
        END IF;
        UPDATE public.alunos SET aguardando_renovacao = v_bool, updated_at = v_agora WHERE id = v_div.aluno_id;
        v_valor_aplicado := jsonb_build_object('aguardando_renovacao', v_bool);

      WHEN 'forma_pagamento_id' THEN
        v_forma_nome := public._normalizar_forma_pagamento_conciliacao(
          COALESCE(v_div.sugestao->>'forma_pagamento', v_div.valor_emusys->>'forma_pagamento')
        );
        SELECT fp.id
          INTO v_forma_id
        FROM public.formas_pagamento fp
        WHERE lower(fp.nome) = lower(v_forma_nome)
        LIMIT 1;

        IF v_forma_id IS NULL THEN
          RAISE EXCEPTION 'forma de pagamento nao mapeada: %', v_forma_nome;
        END IF;

        UPDATE public.alunos SET forma_pagamento_id = v_forma_id, updated_at = v_agora WHERE id = v_div.aluno_id;
        v_valor_aplicado := jsonb_build_object('forma_pagamento_id', v_forma_id, 'forma_pagamento', v_forma_nome);

      ELSE
        RAISE EXCEPTION 'campo % nao pode ser aplicado automaticamente por esta RPC', v_div.campo;
    END CASE;

    v_resolver := true;

  ELSIF p_decisao = 'manter_la' THEN
    IF v_div.aluno_id IS NOT NULL THEN
      INSERT INTO public.matriculas_campos_fixados
        (aluno_id, campo, valor, fixado_por, fixado_em)
      VALUES
        (v_div.aluno_id, v_div.campo, v_div.valor_nosso, COALESCE(p_decidido_por, 'usuario_app'), v_agora)
      ON CONFLICT (aluno_id, campo) DO UPDATE SET
        valor = EXCLUDED.valor,
        fixado_por = EXCLUDED.fixado_por,
        fixado_em = EXCLUDED.fixado_em;
    END IF;
    v_valor_aplicado := v_div.valor_nosso;
    v_resolver := true;

  ELSIF p_decisao = 'ignorar' THEN
    v_resolver := true;

  ELSE
    v_resolver := false;
  END IF;

  INSERT INTO public.alunos_emusys_atributos_decisoes
    (divergencia_id, aluno_id, decisao, campo, valor_nosso, valor_emusys, valor_aplicado, motivo, decidido_por, metadata)
  VALUES
    (
      v_div.id,
      v_div.aluno_id,
      p_decisao,
      v_div.campo,
      COALESCE(v_div.valor_nosso, '{}'::jsonb),
      COALESCE(v_div.valor_emusys, '{}'::jsonb),
      COALESCE(v_valor_aplicado, '{}'::jsonb),
      'Conciliacao atributo aluno: ' || p_decisao,
      COALESCE(p_decidido_por, 'usuario_app'),
      jsonb_build_object(
        'tipo_divergencia', v_div.tipo_divergencia,
        'emusys_student_id', v_div.emusys_student_id,
        'emusys_matricula_id', v_div.emusys_matricula_id,
        'fonte', v_div.fonte
      )
    );

  UPDATE public.alunos_emusys_atributos_divergencias
  SET resolvido = v_resolver,
      decisao = p_decisao,
      decidido_por = COALESCE(p_decidido_por, 'usuario_app'),
      decidido_em = v_agora,
      updated_at = v_agora
  WHERE id = v_div.id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_div.id,
    'aluno_id', v_div.aluno_id,
    'decisao', p_decisao,
    'resolvido', v_resolver,
    'valor_aplicado', v_valor_aplicado
  );
END;
$function$;
