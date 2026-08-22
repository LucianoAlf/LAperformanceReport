-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

CREATE OR REPLACE FUNCTION public.upsert_lead(p_nome text, p_telefone text, p_email text, p_unidade_id uuid, p_curso text, p_canal text, p_source_id integer, p_source_type text DEFAULT 'emusys'::text, p_arquivar boolean DEFAULT false, p_data_contato date DEFAULT NULL::date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_lead_id       INTEGER;
  v_curso_id      INTEGER;
  v_canal_id      INTEGER;
  v_telefone_safe TEXT;
  v_action        TEXT;
  v_detalhes      JSONB;
  v_log_nome      TEXT;
BEGIN
  IF UPPER(TRIM(COALESCE(p_nome, ''))) = 'NÃO INFORMADO' THEN
    p_nome := NULL;
  END IF;

  v_log_nome := COALESCE(NULLIF(TRIM(p_nome), ''), '(sem nome)');

  -- 1. Resolver curso_interesse_id
  v_curso_id := CASE UPPER(TRIM(unaccent(COALESCE(p_curso, ''))))
    WHEN 'TECLADO' THEN 16 WHEN 'PIANO' THEN 18
    WHEN 'VIOLAO' THEN 10 WHEN 'GUITARRA' THEN 14
    WHEN 'CANTO' THEN 6  WHEN 'BATERIA' THEN 27
    WHEN 'MUSICALIZACAO' THEN 4 WHEN 'UKULELE' THEN 8
    WHEN 'VIOLINO' THEN 12 WHEN 'FLAUTA DOCE' THEN 20
    WHEN 'CONTRABAIXO' THEN 21 WHEN 'SAX' THEN 31
    WHEN 'CAVAQUINHO' THEN 35 WHEN 'FLAUTA TRANSVERSA' THEN 37
    WHEN 'VOZ' THEN 6
    WHEN 'MUSICA' THEN 4
    WHEN 'MUSICALIZACAO INFANTIL' THEN 4
    WHEN 'MUSICALIZACAO BEBES' THEN 2
    WHEN 'MUSICALIZACAO PARA BEBES' THEN 2
    WHEN 'MUSICALIZACAO PREPARATORIA' THEN 40
    WHEN 'SAXOFONE' THEN 31
    WHEN 'FLAUTA TRANSVERSAL' THEN 37
    ELSE NULL
  END;

  -- 2. Normalizar aliases do Emusys para nomes do canais_origem
  p_canal := CASE UPPER(TRIM(p_canal))
    WHEN 'WHATSAPP' THEN 'Facebook'
    WHEN 'SITE DA ESCOLA' THEN 'Google'
    WHEN 'INTERNET' THEN 'Google'
    WHEN 'E-MAIL MARKETING' THEN 'Google'
    WHEN 'EX ALUNO' THEN 'Ex-aluno'
    WHEN 'PLACA DA FACHADA' THEN 'Visita/Placa'
    WHEN 'AMIGO' THEN 'Indicação'
    WHEN 'VISITA' THEN 'Visita/Placa'
    WHEN 'PROFESSOR' THEN 'Indicação'
    WHEN 'ALUNO DA ESCOLA' THEN 'Indicação'
    WHEN 'DIGITAL INFLUENCER' THEN 'Instagram'
    WHEN 'TELEFONE' THEN 'Ligação'
    WHEN 'SMS' THEN 'Convênios'
    WHEN 'PANFLETOS' THEN 'Convênios'
    WHEN 'PESQUISA DE RUA' THEN 'Convênios'
    WHEN 'SHOPPING' THEN 'Convênios'
    WHEN 'COMERCIOS' THEN 'Convênios'
    WHEN 'LOJA DE MÚSICA' THEN 'Convênios'
    WHEN 'IGREJA' THEN 'Convênios'
    WHEN 'RECITAL' THEN 'Convênios'
    WHEN 'JORNAL' THEN 'Convênios'
    WHEN 'RÁDIO' THEN 'Convênios'
    WHEN 'REVISTA' THEN 'Convênios'
    WHEN 'TWITTER' THEN 'Convênios'
    WHEN 'POLO UNIVERSITARIO' THEN 'Convênios'
    WHEN 'PATROCINADORES' THEN 'Convênios'
    ELSE p_canal
  END;

  SELECT id INTO v_canal_id FROM canais_origem WHERE LOWER(nome) = LOWER(TRIM(p_canal)) LIMIT 1;

  -- 4. Buscar lead existente (SEMPRE filtrar por unidade para evitar conflito entre escolas)
  IF p_source_type = 'emusys' THEN
    SELECT id INTO v_lead_id FROM leads WHERE emusys_lead_id = p_source_id AND unidade_id = p_unidade_id AND p_source_id IS NOT NULL LIMIT 1;
    IF v_lead_id IS NULL AND p_telefone IS NOT NULL THEN
      SELECT id INTO v_lead_id FROM leads WHERE telefone = p_telefone AND unidade_id = p_unidade_id AND arquivado = false LIMIT 1;
    END IF;
  ELSIF p_source_type = 'nocodb' THEN
    SELECT id INTO v_lead_id FROM leads WHERE nocodb_lead_id = p_source_id AND unidade_id = p_unidade_id AND p_source_id IS NOT NULL LIMIT 1;
    IF v_lead_id IS NULL AND p_telefone IS NOT NULL THEN
      SELECT id INTO v_lead_id FROM leads WHERE telefone = p_telefone AND unidade_id = p_unidade_id AND arquivado = false LIMIT 1;
    END IF;
  END IF;

  v_detalhes := json_build_object(
    'source_id', p_source_id, 'telefone', p_telefone, 'canal', p_canal, 'curso', p_curso,
    'sem_nome', (p_nome IS NULL OR TRIM(p_nome) = ''), 'sem_telefone', (p_telefone IS NULL OR TRIM(p_telefone) = '')
  )::jsonb;

  -- 5. Arquivamento
  IF p_arquivar AND v_lead_id IS NOT NULL THEN
    UPDATE leads SET arquivado = true, status = 'arquivado', updated_at = NOW() WHERE id = v_lead_id;
    v_action := 'archived';
    INSERT INTO leads_automacao_log (lead_nome, lead_id, unidade_nome, evento, acao, detalhes, created_at)
    VALUES (v_log_nome, v_lead_id, p_unidade_id::text, p_source_type, v_action, v_detalhes, NOW());
    RETURN json_build_object('action', v_action, 'lead_id', v_lead_id);
  END IF;

  -- 6. UPDATE
  IF v_lead_id IS NOT NULL THEN
    v_telefone_safe := NULL;
    IF p_telefone IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM leads WHERE telefone = p_telefone AND unidade_id = p_unidade_id AND id != v_lead_id AND arquivado = false) THEN
        v_telefone_safe := p_telefone;
      END IF;
    END IF;

    IF p_source_type = 'emusys' THEN
      UPDATE leads SET
        emusys_lead_id = COALESCE(p_source_id, emusys_lead_id), nome = COALESCE(NULLIF(p_nome, ''), nome),
        telefone = COALESCE(v_telefone_safe, telefone), email = COALESCE(p_email, email),
        curso_interesse_id = COALESCE(v_curso_id, curso_interesse_id), canal_origem_id = COALESCE(v_canal_id, canal_origem_id),
        data_contato = COALESCE(p_data_contato, data_contato),
        updated_at = NOW(), data_ultimo_contato = NOW()
      WHERE id = v_lead_id;
    ELSIF p_source_type = 'nocodb' THEN
      UPDATE leads SET
        nocodb_lead_id = COALESCE(p_source_id, nocodb_lead_id), nome = COALESCE(NULLIF(p_nome, ''), nome),
        telefone = COALESCE(v_telefone_safe, telefone), email = COALESCE(p_email, email),
        curso_interesse_id = COALESCE(v_curso_id, curso_interesse_id), canal_origem_id = COALESCE(v_canal_id, canal_origem_id),
        data_contato = COALESCE(p_data_contato, data_contato),
        updated_at = NOW(), data_ultimo_contato = NOW()
      WHERE id = v_lead_id;
    END IF;

    v_action := 'updated';
    INSERT INTO leads_automacao_log (lead_nome, lead_id, unidade_nome, evento, acao, detalhes, created_at)
    VALUES (v_log_nome, v_lead_id, p_unidade_id::text, p_source_type, v_action, v_detalhes, NOW());
    RETURN json_build_object('action', v_action, 'lead_id', v_lead_id);
  END IF;

  -- 7. INSERT com ON CONFLICT para race condition
  IF p_source_type = 'emusys' THEN
    INSERT INTO leads (nome, telefone, email, unidade_id, emusys_lead_id, curso_interesse_id, canal_origem_id, etapa_pipeline_id, status, data_contato, created_at, updated_at)
    VALUES (p_nome, p_telefone, p_email, p_unidade_id, p_source_id, v_curso_id, v_canal_id, 1, 'novo', COALESCE(p_data_contato, (NOW() AT TIME ZONE 'America/Sao_Paulo')::date), NOW(), NOW())
    ON CONFLICT (telefone, unidade_id) WHERE telefone IS NOT NULL AND arquivado = false
    DO UPDATE SET
      emusys_lead_id = COALESCE(EXCLUDED.emusys_lead_id, leads.emusys_lead_id),
      nome = COALESCE(NULLIF(EXCLUDED.nome, ''), leads.nome),
      email = COALESCE(EXCLUDED.email, leads.email),
      curso_interesse_id = COALESCE(EXCLUDED.curso_interesse_id, leads.curso_interesse_id),
      canal_origem_id = COALESCE(EXCLUDED.canal_origem_id, leads.canal_origem_id),
      data_contato = COALESCE(EXCLUDED.data_contato, leads.data_contato),
      updated_at = NOW(), data_ultimo_contato = NOW()
    RETURNING id INTO v_lead_id;
  ELSIF p_source_type = 'nocodb' THEN
    INSERT INTO leads (nome, telefone, email, unidade_id, nocodb_lead_id, curso_interesse_id, canal_origem_id, etapa_pipeline_id, status, data_contato, created_at, updated_at)
    VALUES (p_nome, p_telefone, p_email, p_unidade_id, p_source_id, v_curso_id, v_canal_id, 1, 'novo', COALESCE(p_data_contato, (NOW() AT TIME ZONE 'America/Sao_Paulo')::date), NOW(), NOW())
    ON CONFLICT (telefone, unidade_id) WHERE telefone IS NOT NULL AND arquivado = false
    DO UPDATE SET
      nocodb_lead_id = COALESCE(EXCLUDED.nocodb_lead_id, leads.nocodb_lead_id),
      nome = COALESCE(NULLIF(EXCLUDED.nome, ''), leads.nome),
      email = COALESCE(EXCLUDED.email, leads.email),
      curso_interesse_id = COALESCE(EXCLUDED.curso_interesse_id, leads.curso_interesse_id),
      canal_origem_id = COALESCE(EXCLUDED.canal_origem_id, leads.canal_origem_id),
      data_contato = COALESCE(EXCLUDED.data_contato, leads.data_contato),
      updated_at = NOW(), data_ultimo_contato = NOW()
    RETURNING id INTO v_lead_id;
  END IF;

  v_action := 'inserted';
  INSERT INTO leads_automacao_log (lead_nome, lead_id, unidade_nome, evento, acao, detalhes, created_at)
  VALUES (v_log_nome, v_lead_id, p_unidade_id::text, p_source_type, v_action, v_detalhes, NOW());
  RETURN json_build_object('action', v_action, 'lead_id', v_lead_id);
END;
$function$;
