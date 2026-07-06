-- Recria a RPC com modo "só ontem" (BRT) e corrige o cálculo da 1ª aula:
-- antes o MIN(data_aula) era feito DENTRO da janela (podia rotular a aula recente de um
-- veterano como "1ª aula"); agora é o MIN de TODA a presença do aluno (1ª aula real),
-- e a janela/ontem filtra data_primeira_aula no nível externo.
DROP FUNCTION IF EXISTS public.get_candidatos_pesquisa_primeira_aula(uuid, integer);

CREATE OR REPLACE FUNCTION public.get_candidatos_pesquisa_primeira_aula(
  p_unidade_id uuid DEFAULT NULL::uuid,
  p_janela_dias integer DEFAULT 1,
  p_apenas_ontem boolean DEFAULT false
)
RETURNS TABLE(aluno_id integer, unidade_id uuid, nome text, unidade_nome text, curso_nome text, professor_nome text, data_primeira_aula date, data_matricula date, whatsapp_jid text)
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
      ) AS whatsapp_jid
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
      AND NOT EXISTS (
        SELECT 1 FROM pesquisas_whatsapp pw
        WHERE pw.aluno_id = a.id
          AND pw.tipo = 'pos_primeira_aula'
          AND pw.enviado_ok = true
      )
  )
  SELECT DISTINCT ON (COALESCE(whatsapp_jid, aluno_id::text))
    aluno_id, unidade_id, nome, unidade_nome, curso_nome, professor_nome,
    data_primeira_aula, data_matricula, whatsapp_jid
  FROM candidatos
  ORDER BY COALESCE(whatsapp_jid, aluno_id::text), data_primeira_aula DESC, aluno_id
$function$;
