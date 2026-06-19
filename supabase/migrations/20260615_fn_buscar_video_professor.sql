-- RPC buscar_video_professor
-- Espelha a query de busca de vídeo do professor do workflow n8n
-- "[ Sucesso do Aluno ] - Nova Matrícula", usada pela edge function
-- enviar-boas-vindas-matricula. Matching por nome do professor + curso + tipo,
-- com unaccent + LIKE (mesma regra do n8n).

CREATE OR REPLACE FUNCTION buscar_video_professor(
  p_nome_professor text,
  p_nome_curso text,
  p_tipo text DEFAULT 'matricula'
) RETURNS text AS $$
  SELECT pv.url
  FROM professor_videos pv
  JOIN professores p ON p.id = pv.professor_id
  JOIN cursos c ON c.id = pv.curso_id
  WHERE lower(unaccent(p.nome)) LIKE lower(unaccent('%' || trim(p_nome_professor) || '%'))
    AND lower(unaccent(trim(p_nome_curso))) LIKE lower(unaccent(c.nome)) || '%'
    AND lower(trim(pv.tipo)) = lower(trim(p_tipo))
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
