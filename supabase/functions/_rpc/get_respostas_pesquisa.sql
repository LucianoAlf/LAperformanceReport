CREATE OR REPLACE FUNCTION public.get_respostas_pesquisa(
  p_unidade_id uuid DEFAULT NULL,
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL
)
RETURNS TABLE(
  pesquisa_id uuid,
  aluno_id integer,
  nome text,
  nota integer,
  curso_nome text,
  professor_nome text,
  unidade_nome text,
  whatsapp_jid text,
  enviado_em timestamptz,
  respondido_em timestamptz
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
    pw.respondido_em
  FROM pesquisas_whatsapp pw
  JOIN alunos a ON a.id = pw.aluno_id
  JOIN unidades u ON u.id = a.unidade_id
  LEFT JOIN cursos c ON c.id = a.curso_id
  LEFT JOIN professores p ON p.id = a.professor_atual_id
  WHERE pw.tipo = 'pos_primeira_aula'
    AND pw.enviado_ok = true
    AND pw.nota IS NOT NULL
    AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
    AND (p_data_inicio IS NULL OR pw.enviado_em >= p_data_inicio)
    AND (p_data_fim IS NULL OR pw.enviado_em < (p_data_fim + 1))
  ORDER BY pw.respondido_em DESC
$function$;
