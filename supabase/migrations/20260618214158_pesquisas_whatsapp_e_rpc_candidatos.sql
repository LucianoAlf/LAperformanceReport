-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- 1. Coluna telefone_gerente em unidades
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS telefone_gerente text;

-- 2. Tabela pesquisas_whatsapp
CREATE TABLE IF NOT EXISTS pesquisas_whatsapp (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id        integer NOT NULL REFERENCES alunos(id),
  unidade_id      uuid NOT NULL REFERENCES unidades(id),
  tipo            text NOT NULL CHECK (tipo IN ('pos_primeira_aula', 'pos_um_mes', 'pos_tres_meses', 'evasao')),
  data_matricula  date NOT NULL,
  remote_jid      text,
  enviado_em      timestamptz,
  enviado_ok      boolean NOT NULL DEFAULT false,
  erro_detalhes   text,
  nota            integer CHECK (nota BETWEEN 1 AND 5),
  respondido_em   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (aluno_id, tipo, data_matricula)
);

-- 3. RLS
ALTER TABLE pesquisas_whatsapp ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON pesquisas_whatsapp
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_select" ON pesquisas_whatsapp
  FOR SELECT TO authenticated USING (true);

-- 4. RPC get_candidatos_pesquisa_primeira_aula
CREATE OR REPLACE FUNCTION get_candidatos_pesquisa_primeira_aula(
  p_unidade_id  uuid,
  p_janela_dias integer DEFAULT 7
)
RETURNS TABLE (
  aluno_id           integer,
  unidade_id         uuid,
  nome               text,
  unidade_nome       text,
  curso_nome         text,
  professor_nome     text,
  data_primeira_aula date,
  data_matricula     date,
  whatsapp_jid       text
)
LANGUAGE sql
STABLE
AS $$
  WITH primeira_aula AS (
    SELECT
      ap.aluno_id,
      MIN(ap.data_aula) AS data_primeira_aula
    FROM aluno_presenca ap
    JOIN alunos a ON a.id = ap.aluno_id
    WHERE ap.status = 'presente'
      AND ap.data_aula >= a.data_matricula
      AND a.unidade_id = p_unidade_id
      AND ap.data_aula >= (CURRENT_DATE - (p_janela_dias || ' days')::interval)
    GROUP BY ap.aluno_id
  )
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
    )                      AS whatsapp_jid
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
    AND a.unidade_id = p_unidade_id
    AND NOT EXISTS (
      SELECT 1 FROM pesquisas_whatsapp pw
      WHERE pw.aluno_id = a.id
        AND pw.tipo = 'pos_primeira_aula'
        AND pw.enviado_ok = true
    )
$$;
