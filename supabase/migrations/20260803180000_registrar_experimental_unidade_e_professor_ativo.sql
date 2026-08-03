-- Bug 1: registrar_experimental buscava lead por emusys_lead_id SEM filtrar unidade.
--   Como o emusys_lead_id é namespaced por escola (tenant), uma experimental da Barra
--   pode casar num lead do Recreio (caso real: Vanice/7090 × "Joaquim" 8248).
--   A upsert_lead já filtra unidade; só a registrar_experimental não filtrava.
--
-- Bug 3 (guard): rejeitar p_professor_id inativo. O n8n (j41tPbyjGXUQUxrN) resolve
--   professor por nome sem filtrar ativo, e continua criando experimentais no
--   professor 54 ("Erick Osmy (mesclado 54)") e 57 ("Matheus Reis (mesclado 57)"),
--   ambos inativos. O guard fecha a torneira no lado da RPC: rejeita e loga em
--   automacao_log para rastreabilidade. O n8n recebe {"success":false,"reason":"professor_inativo"}.
--   Quando o Hugo corrigir o lookup no n8n (filtrar ativo=true ou resolver por telefone),
--   o guard deixa de disparar — é proteção, não workaround.

CREATE OR REPLACE FUNCTION public.registrar_experimental(
  p_telefone text,
  p_nome_aluno text,
  p_unidade_id uuid,
  p_status text DEFAULT 'experimental_agendada',
  p_etapa integer DEFAULT 5,
  p_data_experimental date DEFAULT NULL,
  p_horario_experimental time without time zone DEFAULT NULL,
  p_professor_id integer DEFAULT NULL,
  p_emusys_lead_id integer DEFAULT NULL,
  p_created_at timestamptz DEFAULT now(),
  p_curso text DEFAULT NULL,
  p_emusys_aula_id integer DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_lead_id INTEGER;
  v_tel_norm TEXT;
  v_exp_id INTEGER;
  v_nome_aluno_safe TEXT;
  v_curso_id INTEGER;
  v_curso_norm TEXT;
BEGIN
  v_tel_norm := regexp_replace(COALESCE(p_telefone, ''), '\D', '', 'g');
  v_nome_aluno_safe := COALESCE(NULLIF(TRIM(p_nome_aluno), ''), '(sem nome)');

  -- 0. Guard: rejeitar professor_id inativo (proteção contra torneira do n8n)
  IF p_professor_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM professores WHERE id = p_professor_id AND ativo = true) THEN
      -- Registrar rejeição para rastreabilidade (não derruba a RPC se o log falhar)
      BEGIN
        INSERT INTO automacao_log (workflow_id, acao, aluno_nome, unidade_nome, evento, detalhes, status)
        VALUES (
          'registrar_experimental',
          'professor_inativo_rejeitado',
          v_nome_aluno_safe,
          (SELECT nome FROM unidades WHERE id = p_unidade_id),
          'aula_experimental',
          jsonb_build_object(
            'professor_id', p_professor_id,
            'emusys_lead_id', p_emusys_lead_id,
            'emusys_aula_id', p_emusys_aula_id,
            'data_experimental', p_data_experimental,
            'curso', p_curso
          ),
          'erro'
        );
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
      RETURN json_build_object('success', false, 'reason', 'professor_inativo', 'professor_id', p_professor_id);
    END IF;
  END IF;

  -- 1. Buscar lead: emusys_lead_id -> telefone -> nome
  --    Bug 1: emusys_lead_id é namespaced por escola — filtrar unidade_id
  IF p_emusys_lead_id IS NOT NULL THEN
    SELECT id INTO v_lead_id FROM leads
    WHERE emusys_lead_id = p_emusys_lead_id AND unidade_id = p_unidade_id LIMIT 1;
  END IF;
  IF v_lead_id IS NULL AND length(v_tel_norm) >= 10 THEN
    SELECT id INTO v_lead_id FROM leads
    WHERE telefone = v_tel_norm AND unidade_id = p_unidade_id AND NOT arquivado LIMIT 1;
  END IF;
  IF v_lead_id IS NULL AND p_nome_aluno IS NOT NULL AND TRIM(p_nome_aluno) != '' THEN
    SELECT id INTO v_lead_id FROM leads
    WHERE lower(trim(nome)) = lower(trim(p_nome_aluno)) AND unidade_id = p_unidade_id AND NOT arquivado
    ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF v_lead_id IS NULL THEN
    RETURN json_build_object('success', false, 'reason', 'lead_not_found');
  END IF;

  -- 2. Cancelamento
  IF p_status IN ('cancelada', 'novo') THEN
    UPDATE lead_experimentais SET status = 'cancelada', updated_at = NOW()
    WHERE lead_id = v_lead_id AND nome_aluno = v_nome_aluno_safe AND status = 'experimental_agendada';

    UPDATE leads SET
      experimental_agendada = false, data_experimental = NULL, horario_experimental = NULL,
      professor_experimental_id = NULL, status = 'novo', etapa_pipeline_id = 1, updated_at = NOW()
    WHERE id = v_lead_id AND status NOT IN ('convertido', 'arquivado')
      AND NOT EXISTS (SELECT 1 FROM lead_experimentais WHERE lead_id = v_lead_id AND status = 'experimental_agendada');

    RETURN json_build_object('success', true, 'action', 'cancelada', 'lead_id', v_lead_id);
  END IF;

  -- 2b. Resolver curso (nome -> curso_id) com a MESMA normalização da edge sync-presenca
  IF p_curso IS NOT NULL AND TRIM(p_curso) <> '' THEN
    v_curso_norm := trim(regexp_replace(
      regexp_replace(
        regexp_replace(lower(unaccent(p_curso)), '\s+para\s+instrumento$', '', 'g'),
        '\s+(t|ind)$', '', 'g'),
      '\s+', ' ', 'g'));
    SELECT id INTO v_curso_id FROM cursos
    WHERE trim(regexp_replace(
        regexp_replace(
          regexp_replace(lower(unaccent(nome)), '\s+para\s+instrumento$', '', 'g'),
          '\s+(t|ind)$', '', 'g'),
        '\s+', ' ', 'g')) = v_curso_norm
    ORDER BY (nome ILIKE '% IND') ASC, id
    LIMIT 1;
  END IF;

  -- 3. UPSERT por CHAVE DE NEGOCIO (lead + data + horario + curso).
  --    O Emusys dispara o webhook varias vezes por experimental; cada POST traz um
  --    body.id/emusys_aula_id de EVENTO diferente (nao e o id da aula), entao dedup
  --    por emusys_aula_id nunca colapsa. O SELECT casa uma linha ja existente (inclui
  --    historico id<=1227, p/ reagendamento). Se nao existir, o INSERT usa ON CONFLICT
  --    no indice parcial uq_lead_exp_negocio_novo (id>1227) para blindar contra a
  --    corrida dos reenvios SIMULTANEOS -- garantia atomica do banco, que substitui o
  --    advisory lock (removido: nao segurava sob a concorrencia real do n8n).
  SELECT id INTO v_exp_id
  FROM lead_experimentais
  WHERE lead_id = v_lead_id
    AND data_experimental IS NOT DISTINCT FROM p_data_experimental
    AND horario_experimental IS NOT DISTINCT FROM p_horario_experimental
    AND COALESCE(curso_interesse_id, -1) = COALESCE(v_curso_id, -1)
    AND status::text <> 'cancelada'
  ORDER BY id
  LIMIT 1;

  IF v_exp_id IS NOT NULL THEN
    UPDATE lead_experimentais SET
      nome_aluno = v_nome_aluno_safe,
      horario_experimental = COALESCE(p_horario_experimental, horario_experimental),
      professor_experimental_id = COALESCE(p_professor_id, professor_experimental_id),
      curso_interesse_id = COALESCE(v_curso_id, curso_interesse_id),
      status = CASE
        WHEN status::text IN ('experimental_realizada','experimental_faltou','matriculado')
             AND p_status = 'experimental_agendada'
        THEN status ELSE p_status END,
      etapa_pipeline_id = p_etapa,
      emusys_lead_id = COALESCE(p_emusys_lead_id, emusys_lead_id),
      emusys_aula_id = COALESCE(emusys_aula_id, p_emusys_aula_id),
      updated_at = NOW()
    WHERE id = v_exp_id;
  ELSE
    INSERT INTO lead_experimentais (
      lead_id, nome_aluno, unidade_id, data_experimental, horario_experimental,
      professor_experimental_id, curso_interesse_id, status, etapa_pipeline_id,
      emusys_lead_id, emusys_aula_id, created_at
    ) VALUES (
      v_lead_id, v_nome_aluno_safe, p_unidade_id, p_data_experimental, p_horario_experimental,
      p_professor_id, v_curso_id, p_status, p_etapa, p_emusys_lead_id, p_emusys_aula_id, p_created_at
    )
    ON CONFLICT (lead_id, data_experimental, horario_experimental, (COALESCE(curso_interesse_id, -1)))
    WHERE id > 1227 AND status::text <> 'cancelada'
    DO UPDATE SET
      nome_aluno = EXCLUDED.nome_aluno,
      professor_experimental_id = COALESCE(EXCLUDED.professor_experimental_id, lead_experimentais.professor_experimental_id),
      curso_interesse_id = COALESCE(EXCLUDED.curso_interesse_id, lead_experimentais.curso_interesse_id),
      status = CASE
        WHEN lead_experimentais.status::text IN ('experimental_realizada','experimental_faltou','matriculado')
             AND EXCLUDED.status = 'experimental_agendada'
        THEN lead_experimentais.status ELSE EXCLUDED.status END,
      etapa_pipeline_id = EXCLUDED.etapa_pipeline_id,
      emusys_lead_id = COALESCE(EXCLUDED.emusys_lead_id, lead_experimentais.emusys_lead_id),
      emusys_aula_id = COALESCE(lead_experimentais.emusys_aula_id, EXCLUDED.emusys_aula_id),
      updated_at = NOW()
    RETURNING id INTO v_exp_id;
  END IF;

  -- 4. Atualizar colunas legadas do lead
  UPDATE leads SET
    experimental_agendada = true,
    data_experimental = COALESCE(p_data_experimental, data_experimental),
    horario_experimental = COALESCE(p_horario_experimental, horario_experimental),
    professor_experimental_id = COALESCE(p_professor_id, professor_experimental_id),
    status = p_status, etapa_pipeline_id = p_etapa, updated_at = NOW()
  WHERE id = v_lead_id AND status NOT IN ('convertido', 'arquivado');

  RETURN json_build_object('success', true, 'action', 'registered', 'lead_id', v_lead_id, 'experimental_id', v_exp_id, 'curso_id', v_curso_id);
END;
$function$;
