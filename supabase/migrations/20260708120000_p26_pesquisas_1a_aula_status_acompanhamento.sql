-- P26: acompanhamento de pesquisas de 1a aula.
-- 1) get_respostas_pesquisa passa a incluir quem foi enviado mas ainda nao respondeu
--    (status='aguardando'), alem de quem ja respondeu (status='respondida').
-- 2) get_candidatos_pesquisa_primeira_aula ganha p_incluir_enviados (default false,
--    comportamento antigo preservado para quem dispara pesquisa) para a aba Pos-1a Aula
--    conseguir mostrar o lote inteiro de ontem (pendente/aguardando/respondido), nao so
--    quem ainda falta enviar.

DROP FUNCTION IF EXISTS public.get_respostas_pesquisa(uuid, date, date);

CREATE OR REPLACE FUNCTION public.get_respostas_pesquisa(
  p_unidade_id uuid DEFAULT NULL::uuid,
  p_data_inicio date DEFAULT NULL::date,
  p_data_fim date DEFAULT NULL::date
)
RETURNS TABLE(
  pesquisa_id uuid, aluno_id integer, nome text, nota integer, curso_nome text,
  professor_nome text, unidade_nome text, whatsapp_jid text, enviado_em timestamp with time zone,
  respondido_em timestamp with time zone, status text
)
LANGUAGE sql
STABLE
AS $function$
  SELECT
    pw.id,
    pw.aluno_id,
    a.nome::text,
    pw.nota,
    c.nome::text,
    p.nome::text,
    u.nome::text,
    pw.remote_jid,
    pw.enviado_em,
    pw.respondido_em,
    CASE WHEN pw.nota IS NOT NULL THEN 'respondida' ELSE 'aguardando' END AS status
  FROM pesquisas_whatsapp pw
  JOIN alunos a ON a.id = pw.aluno_id
  JOIN unidades u ON u.id = a.unidade_id
  LEFT JOIN cursos c ON c.id = a.curso_id
  LEFT JOIN professores p ON p.id = a.professor_atual_id
  WHERE pw.tipo = 'pos_primeira_aula'
    AND pw.enviado_ok = true
    AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
    AND (p_data_inicio IS NULL OR pw.enviado_em >= p_data_inicio)
    AND (p_data_fim IS NULL OR pw.enviado_em < (p_data_fim + 1))
  ORDER BY (pw.nota IS NULL) DESC, COALESCE(pw.respondido_em, pw.enviado_em) DESC
$function$;

DROP FUNCTION IF EXISTS public.get_candidatos_pesquisa_primeira_aula(uuid, integer, boolean);

CREATE OR REPLACE FUNCTION public.get_candidatos_pesquisa_primeira_aula(
  p_unidade_id uuid DEFAULT NULL::uuid,
  p_janela_dias integer DEFAULT 1,
  p_apenas_ontem boolean DEFAULT false,
  p_incluir_enviados boolean DEFAULT false
)
RETURNS TABLE(
  aluno_id integer, unidade_id uuid, nome text, unidade_nome text, curso_nome text,
  professor_nome text, data_primeira_aula date, data_matricula date, whatsapp_jid text,
  status text, nota integer
)
LANGUAGE sql
STABLE
AS $function$
  WITH primeira_aula AS (
    SELECT
      ap.aluno_id,
      MIN(ap.data_aula) AS data_primeira_aula
    FROM aluno_presenca ap
    JOIN alunos a ON a.id = ap.aluno_id
    WHERE ap.status = 'presente'
      AND ap.data_aula >= a.data_matricula
      AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
    GROUP BY ap.aluno_id
  ),
  candidatos AS (
    SELECT
      a.id                   AS aluno_id,
      a.unidade_id           AS unidade_id,
      a.nome::text           AS nome,
      u.nome::text           AS unidade_nome,
      c.nome::text           AS curso_nome,
      p.nome::text           AS professor_nome,
      pa.data_primeira_aula  AS data_primeira_aula,
      a.data_matricula       AS data_matricula,
      COALESCE(
        ac.whatsapp_jid,
        CASE
          WHEN a.whatsapp IS NOT NULL AND a.whatsapp <> ''
            THEN '55' || regexp_replace(a.whatsapp, '[^0-9]', '', 'g') || '@s.whatsapp.net'
          WHEN a.telefone IS NOT NULL AND a.telefone <> ''
            THEN '55' || regexp_replace(a.telefone, '[^0-9]', '', 'g') || '@s.whatsapp.net'
          ELSE NULL
        END
      ) AS whatsapp_jid,
      CASE
        WHEN pwq.nota IS NOT NULL THEN 'respondido'
        WHEN pwq.enviado_ok = true THEN 'aguardando'
        ELSE 'pendente'
      END AS status,
      pwq.nota AS nota
    FROM alunos a
    JOIN primeira_aula pa ON pa.aluno_id = a.id
    JOIN unidades u ON u.id = a.unidade_id
    LEFT JOIN cursos c ON c.id = a.curso_id
    LEFT JOIN professores p ON p.id = a.professor_atual_id
    LEFT JOIN LATERAL (
      SELECT ac2.whatsapp_jid
      FROM admin_conversas ac2
      JOIN whatsapp_caixas wc ON wc.id = ac2.caixa_id
      WHERE ac2.aluno_id = a.id
        AND wc.departamento = 'sucesso_aluno'
      ORDER BY ac2.created_at DESC
      LIMIT 1
    ) ac ON true
    LEFT JOIN LATERAL (
      SELECT pw3.enviado_ok, pw3.nota
      FROM pesquisas_whatsapp pw3
      WHERE pw3.aluno_id = a.id
        AND pw3.tipo = 'pos_primeira_aula'
      ORDER BY pw3.enviado_em DESC NULLS LAST
      LIMIT 1
    ) pwq ON true
    WHERE a.is_segundo_curso = false
      AND a.status = 'ativo'
      AND a.numero_renovacoes = 0
      AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
      AND pa.data_primeira_aula <= a.data_matricula + INTERVAL '4 months'
      AND (
        (p_apenas_ontem
          AND pa.data_primeira_aula = ((now() AT TIME ZONE 'America/Sao_Paulo')::date - 1))
        OR
        (NOT p_apenas_ontem
          AND pa.data_primeira_aula >= (CURRENT_DATE - (p_janela_dias || ' days')::interval)::date)
      )
      AND (
        p_incluir_enviados
        OR NOT EXISTS (
          SELECT 1 FROM pesquisas_whatsapp pw
          WHERE pw.aluno_id = a.id
            AND pw.tipo = 'pos_primeira_aula'
            AND pw.enviado_ok = true
        )
      )
  ),
  dedup AS (
    SELECT DISTINCT ON (COALESCE(whatsapp_jid, aluno_id::text))
      aluno_id, unidade_id, nome, unidade_nome, curso_nome, professor_nome,
      data_primeira_aula, data_matricula, whatsapp_jid, status, nota
    FROM candidatos
    ORDER BY COALESCE(whatsapp_jid, aluno_id::text), data_primeira_aula DESC, aluno_id
  )
  SELECT aluno_id, unidade_id, nome, unidade_nome, curso_nome, professor_nome,
    data_primeira_aula, data_matricula, whatsapp_jid, status, nota
  FROM dedup
  ORDER BY (status = 'pendente') DESC, data_primeira_aula DESC, aluno_id
$function$;

GRANT EXECUTE ON FUNCTION public.get_respostas_pesquisa(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_candidatos_pesquisa_primeira_aula(uuid, integer, boolean, boolean) TO authenticated;
