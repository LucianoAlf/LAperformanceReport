-- Politica temporal de confiabilidade da presenca e conciliacao operacional.
-- Decisao Alf em 15/07/2026: junho/julho publicados nas tres unidades;
-- Campo Grande exige revisao posterior, sem bloquear os indicadores.

CREATE TABLE IF NOT EXISTS public.presenca_politicas_confiabilidade (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id uuid NOT NULL REFERENCES public.unidades(id),
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  ausencia_emusys_resultado text NOT NULL DEFAULT 'falta_confirmada'
    CHECK (ausencia_emusys_resultado IN ('falta_confirmada', 'falta_provavel', 'indeterminado')),
  exige_revisao_operacional boolean NOT NULL DEFAULT false,
  decidido_em date NOT NULL,
  decidido_por text NOT NULL,
  evidencia text NOT NULL,
  regra_versao text NOT NULL,
  ativa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (data_fim >= data_inicio),
  UNIQUE (unidade_id, data_inicio, data_fim, regra_versao)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_presenca_politica_periodo_ativa
  ON public.presenca_politicas_confiabilidade (unidade_id, data_inicio, data_fim)
  WHERE ativa;

CREATE OR REPLACE FUNCTION public.fn_presenca_politica_impedir_sobreposicao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.ativa AND EXISTS (
    SELECT 1
    FROM public.presenca_politicas_confiabilidade p
    WHERE p.unidade_id = NEW.unidade_id
      AND p.ativa
      AND p.id <> NEW.id
      AND daterange(p.data_inicio, p.data_fim, '[]')
        && daterange(NEW.data_inicio, NEW.data_fim, '[]')
  ) THEN
    RAISE EXCEPTION 'politica_presenca_periodo_sobreposto';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_presenca_politica_impedir_sobreposicao
  ON public.presenca_politicas_confiabilidade;
CREATE TRIGGER trg_presenca_politica_impedir_sobreposicao
  BEFORE INSERT OR UPDATE OF unidade_id, data_inicio, data_fim, ativa
  ON public.presenca_politicas_confiabilidade
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_presenca_politica_impedir_sobreposicao();

REVOKE ALL ON FUNCTION public.fn_presenca_politica_impedir_sobreposicao()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_presenca_politica_impedir_sobreposicao()
  TO service_role;

CREATE TABLE IF NOT EXISTS public.aluno_presenca_revisoes_operacionais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_presenca_id uuid NOT NULL REFERENCES public.aluno_presenca(id),
  unidade_id uuid NOT NULL REFERENCES public.unidades(id),
  politica_confiabilidade_id uuid NOT NULL
    REFERENCES public.presenca_politicas_confiabilidade(id),
  status text NOT NULL CHECK (status IN ('confirmada', 'corrigida')),
  status_origem text NOT NULL,
  status_final text NOT NULL CHECK (status_final IN ('falta', 'presente')),
  motivo text NOT NULL CHECK (length(btrim(motivo)) >= 3),
  revisado_por_usuario_id integer NOT NULL REFERENCES public.usuarios(id),
  revisado_por_auth_user_id uuid NOT NULL,
  revisado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (aluno_presenca_id)
);

CREATE INDEX IF NOT EXISTS idx_presenca_revisoes_unidade_status
  ON public.aluno_presenca_revisoes_operacionais (unidade_id, status, revisado_em DESC);

ALTER TABLE public.presenca_politicas_confiabilidade ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aluno_presenca_revisoes_operacionais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS presenca_politicas_service_role
  ON public.presenca_politicas_confiabilidade;
CREATE POLICY presenca_politicas_service_role
  ON public.presenca_politicas_confiabilidade
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS presenca_revisoes_service_role
  ON public.aluno_presenca_revisoes_operacionais;
CREATE POLICY presenca_revisoes_service_role
  ON public.aluno_presenca_revisoes_operacionais
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.presenca_politicas_confiabilidade
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.aluno_presenca_revisoes_operacionais
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.presenca_politicas_confiabilidade TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.aluno_presenca_revisoes_operacionais TO service_role;

WITH decisoes(unidade_nome, exige_revisao, evidencia) AS (
  VALUES
    (
      'barra'::text,
      false,
      'Decisao Alf 15/07/2026; processo confirmado por Arthur (ADM Barra).'
    ),
    (
      'recreio'::text,
      false,
      'Decisao Alf 15/07/2026; processo confirmado por Fernanda (ADM Recreio).'
    ),
    (
      'campo grande'::text,
      true,
      'Decisao Alf 15/07/2026; publicacao imediata com revisao posterior na conciliacao.'
    )
)
INSERT INTO public.presenca_politicas_confiabilidade (
  unidade_id,
  data_inicio,
  data_fim,
  ausencia_emusys_resultado,
  exige_revisao_operacional,
  decidido_em,
  decidido_por,
  evidencia,
  regra_versao,
  ativa
)
SELECT
  u.id,
  DATE '2026-06-01',
  DATE '2026-07-31',
  'falta_confirmada',
  d.exige_revisao,
  DATE '2026-07-15',
  'Alf',
  d.evidencia,
  'presenca-politica-unidade-v1',
  true
FROM decisoes d
JOIN public.unidades u ON lower(btrim(u.nome)) = d.unidade_nome
ON CONFLICT (unidade_id, data_inicio, data_fim, regra_versao)
DO UPDATE SET
  ausencia_emusys_resultado = EXCLUDED.ausencia_emusys_resultado,
  exige_revisao_operacional = EXCLUDED.exige_revisao_operacional,
  decidido_em = EXCLUDED.decidido_em,
  decidido_por = EXCLUDED.decidido_por,
  evidencia = EXCLUDED.evidencia,
  ativa = EXCLUDED.ativa;

CREATE OR REPLACE VIEW public.vw_aluno_presenca_semantica_v1
WITH (security_invoker = true) AS
WITH evidencia AS (
  SELECT
    ap.*,
    COALESCE(NULLIF(lower(ap.emusys_presenca_bruta), ''), lower(ap.status))
      AS estado_emusys_bruto,
    ae.emusys_id AS aula_emusys_evento_id,
    ae.cancelada AS aula_cancelada,
    ae.justificada AS aula_justificada,
    ae.categoria AS aula_categoria,
    ae.tipo AS aula_tipo,
    ae.data_hora_inicio,
    lower(NULLIF(ae.professor_presenca, '')) AS professor_presenca_emusys,
    CASE
      WHEN ap.aula_emusys_id IS NOT NULL THEN
        bool_or(ap.status = 'presente') OVER (PARTITION BY ap.aula_emusys_id)
      ELSE ap.status = 'presente'
    END AS evento_tem_aluno_presente,
    politica.id AS politica_confiabilidade_id,
    politica.ausencia_emusys_resultado,
    politica.exige_revisao_operacional,
    politica.evidencia AS politica_evidencia,
    revisao.status AS revisao_status
  FROM public.aluno_presenca ap
  LEFT JOIN public.aulas_emusys ae ON ae.id = ap.aula_emusys_id
  LEFT JOIN LATERAL (
    SELECT p.*
    FROM public.presenca_politicas_confiabilidade p
    WHERE p.unidade_id = ap.unidade_id
      AND p.ativa
      AND ap.data_aula BETWEEN p.data_inicio AND p.data_fim
    ORDER BY p.data_inicio DESC, p.created_at DESC, p.id
    LIMIT 1
  ) politica ON true
  LEFT JOIN public.aluno_presenca_revisoes_operacionais revisao
    ON revisao.aluno_presenca_id = ap.id
),
classificada AS (
  SELECT
    e.*,
    lower(COALESCE(e.status, 'desconhecido')) AS estado_origem,
    CASE
      WHEN e.respondido_por = 'professor_la_teacher' THEN 'la_teacher'
      WHEN e.respondido_por = 'manual' THEN 'manual'
      WHEN e.respondido_por IN ('emusys', 'sistema') THEN 'emusys'
      ELSE 'desconhecida'
    END AS proveniencia,
    CASE
      WHEN e.status = 'presente' THEN 'registrada'
      WHEN COALESCE(e.aula_cancelada, false) OR COALESCE(e.aula_justificada, false)
        THEN 'nao_aplicavel'
      WHEN e.respondido_por IN ('professor_la_teacher', 'manual')
        AND e.status = 'ausente' THEN 'registrada'
      WHEN e.respondido_por IN ('emusys', 'sistema')
        AND e.estado_emusys_bruto = 'ausente'
        AND e.ausencia_emusys_resultado = 'falta_confirmada'
        THEN 'registrada_atestada'
      WHEN e.respondido_por IN ('emusys', 'sistema')
        AND e.estado_emusys_bruto = 'ausente'
        AND (
          e.evento_tem_aluno_presente
          OR e.professor_presenca_emusys = 'presente'
        ) THEN 'registrada_inferida'
      ELSE 'indeterminada'
    END AS situacao_chamada,
    CASE
      WHEN e.status = 'presente' THEN 'presente'
      WHEN COALESCE(e.aula_cancelada, false) THEN 'aula_cancelada'
      WHEN COALESCE(e.aula_justificada, false) THEN 'aula_justificada'
      WHEN e.respondido_por IN ('professor_la_teacher', 'manual')
        AND e.status = 'ausente' THEN 'falta_confirmada'
      WHEN e.respondido_por IN ('emusys', 'sistema')
        AND e.estado_emusys_bruto = 'ausente'
        AND e.ausencia_emusys_resultado = 'falta_confirmada'
        THEN 'falta_confirmada'
      WHEN e.respondido_por IN ('emusys', 'sistema')
        AND e.estado_emusys_bruto = 'ausente'
        AND (
          e.evento_tem_aluno_presente
          OR e.professor_presenca_emusys = 'presente'
        ) THEN 'falta_provavel'
      ELSE 'indeterminado'
    END AS resultado_pedagogico
  FROM evidencia e
)
SELECT
  c.id AS aluno_presenca_id,
  c.aluno_id,
  c.professor_id,
  c.unidade_id,
  c.aula_emusys_id,
  c.aula_emusys_evento_id,
  c.data_aula,
  c.horario_aula,
  c.data_hora_inicio,
  c.curso_nome,
  c.turma_nome,
  c.aula_categoria,
  c.aula_tipo,
  c.estado_origem,
  c.respondido_por,
  c.respondido_em,
  c.proveniencia,
  c.situacao_chamada,
  c.resultado_pedagogico,
  CASE
    WHEN c.resultado_pedagogico IN (
      'presente', 'aula_cancelada', 'aula_justificada', 'falta_confirmada'
    ) THEN 'confirmada'
    WHEN c.resultado_pedagogico = 'falta_provavel' THEN 'provavel'
    ELSE 'desconhecida'
  END AS confianca,
  c.resultado_pedagogico IN ('presente', 'falta_confirmada')
    AS considera_frequencia_denominador,
  c.resultado_pedagogico = 'presente' AS considera_presenca,
  c.resultado_pedagogico = 'falta_confirmada' AS considera_falta,
  c.resultado_pedagogico IN ('aula_cancelada', 'aula_justificada')
    AS exclui_por_evento,
  c.respondido_por IN ('professor_la_teacher', 'manual')
    AND c.respondido_em IS NOT NULL AS respondido_em_confiavel,
  (
    c.status = 'presente'
    AND (COALESCE(c.aula_cancelada, false) OR COALESCE(c.aula_justificada, false))
  ) AS possui_conflito,
  'presenca-semantica-v1.2'::text AS regra_versao,
  c.estado_emusys_bruto,
  c.sincronizado_emusys_em,
  c.professor_presenca_emusys,
  CASE
    WHEN c.respondido_por IN ('professor_la_teacher', 'manual') THEN c.respondido_em
    ELSE c.sincronizado_emusys_em
  END AS evidencia_registrada_em,
  c.politica_confiabilidade_id,
  CASE
    WHEN c.respondido_por IN ('professor_la_teacher', 'manual')
      THEN 'resposta_humana_explicita'
    WHEN c.estado_emusys_bruto = 'ausente'
      AND c.politica_confiabilidade_id IS NOT NULL
      THEN c.politica_evidencia
    WHEN c.resultado_pedagogico = 'falta_provavel'
      THEN 'evidencia_de_que_a_aula_ocorreu'
    ELSE 'regra_conservadora_sem_atestado'
  END AS fundamento_confianca,
  (
    COALESCE(c.exige_revisao_operacional, false)
    AND c.estado_emusys_bruto = 'ausente'
    AND NOT COALESCE(c.aula_cancelada, false)
    AND NOT COALESCE(c.aula_justificada, false)
  ) AS revisao_operacional_exigida,
  CASE
    WHEN COALESCE(c.exige_revisao_operacional, false)
      AND c.estado_emusys_bruto = 'ausente'
      AND NOT COALESCE(c.aula_cancelada, false)
      AND NOT COALESCE(c.aula_justificada, false)
      THEN COALESCE(c.revisao_status, 'pendente')
    ELSE 'nao_exigida'
  END AS revisao_operacional_status
FROM classificada c;

COMMENT ON VIEW public.vw_aluno_presenca_semantica_v1 IS
  'Presenca semantica v1.2. Politicas temporais podem atestar ausencia Emusys por unidade sem reescrever a evidencia bruta.';

REVOKE ALL ON TABLE public.vw_aluno_presenca_semantica_v1
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.vw_aluno_presenca_semantica_v1 TO service_role;

CREATE OR REPLACE VIEW public.vw_aluno_presenca_conciliacao_operacional
WITH (security_invoker = true) AS
SELECT
  s.aluno_presenca_id,
  s.unidade_id,
  u.nome AS unidade_nome,
  s.aluno_id,
  a.nome AS aluno_nome,
  s.professor_id,
  p.nome AS professor_nome,
  s.aula_emusys_id,
  s.aula_emusys_evento_id,
  s.data_aula,
  s.horario_aula,
  s.data_hora_inicio,
  s.curso_nome,
  s.turma_nome,
  s.estado_emusys_bruto,
  s.resultado_pedagogico,
  s.politica_confiabilidade_id,
  s.revisao_operacional_status,
  r.motivo AS revisao_motivo,
  r.revisado_por_usuario_id,
  r.revisado_em
FROM public.vw_aluno_presenca_semantica_v1 s
JOIN public.unidades u ON u.id = s.unidade_id
JOIN public.alunos a ON a.id = s.aluno_id
LEFT JOIN public.professores p ON p.id = s.professor_id
LEFT JOIN public.aluno_presenca_revisoes_operacionais r
  ON r.aluno_presenca_id = s.aluno_presenca_id
WHERE s.revisao_operacional_exigida
  AND s.estado_emusys_bruto = 'ausente';

COMMENT ON VIEW public.vw_aluno_presenca_conciliacao_operacional IS
  'Fila derivada de ausencias cobertas por politica com revisao posterior. Grao aluno/aula.';

REVOKE ALL ON TABLE public.vw_aluno_presenca_conciliacao_operacional
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.vw_aluno_presenca_conciliacao_operacional TO service_role;

CREATE OR REPLACE FUNCTION public.get_conciliacao_presencas(
  p_unidade_id uuid DEFAULT NULL,
  p_data_inicio date DEFAULT DATE '2026-06-01',
  p_data_fim date DEFAULT DATE '2026-07-31',
  p_status text DEFAULT 'pendente',
  p_busca text DEFAULT NULL,
  p_limite integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario_id integer;
  v_resultado jsonb;
BEGIN
  IF p_data_fim < p_data_inicio THEN
    RAISE EXCEPTION 'periodo_invalido';
  END IF;

  IF p_status NOT IN ('pendente', 'confirmada', 'corrigida', 'todas') THEN
    RAISE EXCEPTION 'status_revisao_invalido';
  END IF;

  IF p_limite < 1 OR p_limite > 100 OR p_offset < 0 THEN
    RAISE EXCEPTION 'paginacao_invalida';
  END IF;

  SELECT id INTO v_usuario_id
  FROM public.usuarios
  WHERE auth_user_id = auth.uid()
    AND COALESCE(ativo, true)
  LIMIT 1;

  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'usuario_nao_autorizado' USING ERRCODE = '42501';
  END IF;

  IF p_unidade_id IS NOT NULL
     AND NOT public.usuario_tem_permissao(
       v_usuario_id, 'professores.editar', p_unidade_id
     ) THEN
    RAISE EXCEPTION 'sem_permissao_na_unidade' USING ERRCODE = '42501';
  END IF;

  WITH filtradas AS (
    SELECT q.*
    FROM public.vw_aluno_presenca_conciliacao_operacional q
    WHERE q.data_aula BETWEEN p_data_inicio AND p_data_fim
      AND (p_unidade_id IS NULL OR q.unidade_id = p_unidade_id)
      AND public.usuario_tem_permissao(
        v_usuario_id, 'professores.editar', q.unidade_id
      )
      AND (p_status = 'todas' OR q.revisao_operacional_status = p_status)
  ),
  grupos AS (
    SELECT
      f.unidade_id,
      min(f.unidade_nome) AS unidade_nome,
      f.aula_emusys_id,
      f.aula_emusys_evento_id,
      f.data_aula,
      f.horario_aula,
      f.data_hora_inicio,
      f.professor_id,
      min(COALESCE(f.professor_nome, 'Sem professor')) AS professor_nome,
      min(COALESCE(f.curso_nome, 'Curso nao informado')) AS curso_nome,
      min(COALESCE(f.turma_nome, 'Sem turma')) AS turma_nome,
      count(*)::integer AS total_alunos,
      count(*) FILTER (
        WHERE f.revisao_operacional_status = 'pendente'
      )::integer AS total_pendentes,
      count(*) FILTER (
        WHERE f.revisao_operacional_status IN ('confirmada', 'corrigida')
      )::integer AS total_revisados,
      string_agg(lower(COALESCE(f.aluno_nome, '')), ' ') AS alunos_busca,
      jsonb_agg(
        jsonb_build_object(
          'aluno_presenca_id', f.aluno_presenca_id,
          'aluno_id', f.aluno_id,
          'aluno_nome', f.aluno_nome,
          'status', f.revisao_operacional_status,
          'revisao_motivo', f.revisao_motivo,
          'revisado_em', f.revisado_em
        )
        ORDER BY f.aluno_nome
      ) AS alunos
    FROM filtradas f
    GROUP BY
      f.unidade_id,
      f.aula_emusys_id,
      f.aula_emusys_evento_id,
      f.data_aula,
      f.horario_aula,
      f.data_hora_inicio,
      f.professor_id
  ),
  grupos_filtrados AS (
    SELECT g.*
    FROM grupos g
    WHERE NULLIF(btrim(COALESCE(p_busca, '')), '') IS NULL
       OR g.alunos_busca LIKE '%' || lower(btrim(p_busca)) || '%'
       OR lower(g.professor_nome) LIKE '%' || lower(btrim(p_busca)) || '%'
       OR lower(g.curso_nome) LIKE '%' || lower(btrim(p_busca)) || '%'
       OR lower(g.turma_nome) LIKE '%' || lower(btrim(p_busca)) || '%'
  ),
  pagina AS (
    SELECT g.*
    FROM grupos_filtrados g
    ORDER BY g.data_aula DESC, g.horario_aula DESC, g.professor_nome
    LIMIT p_limite
    OFFSET p_offset
  )
  SELECT jsonb_build_object(
    'resumo', jsonb_build_object(
      'total_alunos_pendentes', COALESCE((
        SELECT sum(total_pendentes) FROM grupos_filtrados
      ), 0),
      'total_aulas_pendentes', COALESCE((
        SELECT count(*) FROM grupos_filtrados WHERE total_pendentes > 0
      ), 0),
      'total_revisados', COALESCE((
        SELECT sum(total_revisados) FROM grupos_filtrados
      ), 0),
      'total_grupos', (SELECT count(*) FROM grupos_filtrados),
      'limite', p_limite,
      'offset', p_offset
    ),
    'aulas', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'unidade_id', g.unidade_id,
          'unidade_nome', g.unidade_nome,
          'aula_emusys_id', g.aula_emusys_id,
          'aula_emusys_evento_id', g.aula_emusys_evento_id,
          'data_aula', g.data_aula,
          'horario_aula', g.horario_aula,
          'data_hora_inicio', g.data_hora_inicio,
          'professor_id', g.professor_id,
          'professor_nome', g.professor_nome,
          'curso_nome', g.curso_nome,
          'turma_nome', g.turma_nome,
          'total_alunos', g.total_alunos,
          'alunos', g.alunos
        )
        ORDER BY g.data_aula DESC, g.horario_aula DESC, g.professor_nome
      )
      FROM pagina g
    ), '[]'::jsonb)
  ) INTO v_resultado;

  RETURN COALESCE(
    v_resultado,
    jsonb_build_object(
      'resumo', jsonb_build_object(
        'total_alunos_pendentes', 0,
        'total_aulas_pendentes', 0,
        'total_revisados', 0,
        'total_grupos', 0,
        'limite', p_limite,
        'offset', p_offset
      ),
      'aulas', '[]'::jsonb
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_confirmar_presencas_aula(
  p_aula_emusys_id integer,
  p_motivo text DEFAULT 'Chamada conferida pela ADM'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario_id integer;
  v_unidade_id uuid;
  v_inseridos integer := 0;
BEGIN
  IF length(btrim(COALESCE(p_motivo, ''))) < 3 THEN
    RAISE EXCEPTION 'motivo_obrigatorio';
  END IF;

  SELECT id INTO v_usuario_id
  FROM public.usuarios
  WHERE auth_user_id = auth.uid()
    AND COALESCE(ativo, true)
  LIMIT 1;

  SELECT unidade_id INTO v_unidade_id
  FROM public.aulas_emusys
  WHERE id = p_aula_emusys_id;

  IF v_unidade_id IS NULL THEN
    RAISE EXCEPTION 'aula_nao_encontrada';
  END IF;

  IF v_usuario_id IS NULL
     OR NOT public.usuario_tem_permissao(
       v_usuario_id, 'professores.editar', v_unidade_id
     ) THEN
    RAISE EXCEPTION 'sem_permissao_na_unidade' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.aluno_presenca_revisoes_operacionais (
    aluno_presenca_id,
    unidade_id,
    politica_confiabilidade_id,
    status,
    status_origem,
    status_final,
    motivo,
    revisado_por_usuario_id,
    revisado_por_auth_user_id
  )
  SELECT
    q.aluno_presenca_id,
    q.unidade_id,
    q.politica_confiabilidade_id,
    'confirmada',
    q.estado_emusys_bruto,
    'falta',
    btrim(p_motivo),
    v_usuario_id,
    auth.uid()
  FROM public.vw_aluno_presenca_conciliacao_operacional q
  WHERE q.aula_emusys_id = p_aula_emusys_id
    AND q.revisao_operacional_status = 'pendente'
  ON CONFLICT (aluno_presenca_id) DO NOTHING;

  GET DIAGNOSTICS v_inseridos = ROW_COUNT;

  RETURN jsonb_build_object(
    'aula_emusys_id', p_aula_emusys_id,
    'confirmados', v_inseridos,
    'idempotente', v_inseridos = 0
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_revisar_presenca_conciliacao(
  p_aluno_presenca_id uuid,
  p_decisao text,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario_id integer;
  v_unidade_id uuid;
  v_politica_id uuid;
  v_estado_emusys_bruto text;
  v_revisao_exigida boolean;
  v_status text;
  v_status_final text;
BEGIN
  IF p_decisao NOT IN ('confirmar_falta', 'corrigir_presente') THEN
    RAISE EXCEPTION 'decisao_revisao_invalida';
  END IF;

  IF length(btrim(COALESCE(p_motivo, ''))) < 3 THEN
    RAISE EXCEPTION 'motivo_obrigatorio';
  END IF;

  SELECT id INTO v_usuario_id
  FROM public.usuarios
  WHERE auth_user_id = auth.uid()
    AND COALESCE(ativo, true)
  LIMIT 1;

  SELECT ap.unidade_id INTO v_unidade_id
  FROM public.aluno_presenca ap
  WHERE ap.id = p_aluno_presenca_id
  FOR UPDATE;

  IF v_unidade_id IS NULL THEN
    RAISE EXCEPTION 'presenca_nao_encontrada';
  END IF;

  IF v_usuario_id IS NULL
     OR NOT public.usuario_tem_permissao(
       v_usuario_id, 'professores.editar', v_unidade_id
     ) THEN
    RAISE EXCEPTION 'sem_permissao_na_unidade' USING ERRCODE = '42501';
  END IF;

  SELECT
    s.politica_confiabilidade_id,
    s.estado_emusys_bruto,
    s.revisao_operacional_exigida
  INTO
    v_politica_id,
    v_estado_emusys_bruto,
    v_revisao_exigida
  FROM public.vw_aluno_presenca_semantica_v1 s
  WHERE s.aluno_presenca_id = p_aluno_presenca_id;

  IF NOT COALESCE(v_revisao_exigida, false) OR v_politica_id IS NULL THEN
    RAISE EXCEPTION 'presenca_fora_da_conciliacao';
  END IF;

  IF p_decisao = 'corrigir_presente' THEN
    PERFORM public.admin_corrigir_presenca(
      p_aluno_presenca_id,
      'presente',
      btrim(p_motivo)
    );
    v_status := 'corrigida';
    v_status_final := 'presente';
  ELSE
    v_status := 'confirmada';
    v_status_final := 'falta';
  END IF;

  INSERT INTO public.aluno_presenca_revisoes_operacionais (
    aluno_presenca_id,
    unidade_id,
    politica_confiabilidade_id,
    status,
    status_origem,
    status_final,
    motivo,
    revisado_por_usuario_id,
    revisado_por_auth_user_id,
    revisado_em
  ) VALUES (
    p_aluno_presenca_id,
    v_unidade_id,
    v_politica_id,
    v_status,
    COALESCE(v_estado_emusys_bruto, 'desconhecido'),
    v_status_final,
    btrim(p_motivo),
    v_usuario_id,
    auth.uid(),
    now()
  )
  ON CONFLICT (aluno_presenca_id) DO UPDATE SET
    status = EXCLUDED.status,
    status_final = EXCLUDED.status_final,
    motivo = EXCLUDED.motivo,
    revisado_por_usuario_id = EXCLUDED.revisado_por_usuario_id,
    revisado_por_auth_user_id = EXCLUDED.revisado_por_auth_user_id,
    revisado_em = EXCLUDED.revisado_em;

  RETURN jsonb_build_object(
    'aluno_presenca_id', p_aluno_presenca_id,
    'status', v_status,
    'status_final', v_status_final
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_conciliacao_presencas(
  uuid, date, date, text, text, integer, integer
)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_confirmar_presencas_aula(integer, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_revisar_presenca_conciliacao(uuid, text, text)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_conciliacao_presencas(
  uuid, date, date, text, text, integer, integer
)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_confirmar_presencas_aula(integer, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_revisar_presenca_conciliacao(uuid, text, text)
  TO authenticated, service_role;

COMMENT ON TABLE public.presenca_politicas_confiabilidade IS
  'Decisoes temporais e versionadas que qualificam evidencia de presenca por unidade.';
COMMENT ON TABLE public.aluno_presenca_revisoes_operacionais IS
  'Estado auditado da revisao posterior de ausencias publicadas por politica de unidade.';
COMMENT ON FUNCTION public.get_conciliacao_presencas(
  uuid, date, date, text, text, integer, integer
) IS
  'Lista conciliacao de presencas apenas nas unidades permitidas ao usuario autenticado.';
COMMENT ON FUNCTION public.admin_confirmar_presencas_aula(integer, text) IS
  'Confirma em lote uma chamada sem reescrever a evidencia bruta do Emusys.';
COMMENT ON FUNCTION public.admin_revisar_presenca_conciliacao(uuid, text, text) IS
  'Confirma falta ou corrige para presente usando a retificacao administrativa auditada.';
