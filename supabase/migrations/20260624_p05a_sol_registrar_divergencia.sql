-- Escrita ESCOPADA da Sol (auditora IA): único ponto pelo qual ela grava na conciliação.
-- SECURITY DEFINER (escreve como owner) → o role da Sol (sol_acesso_restrito, read-only)
-- só precisa de EXECUTE. A função SÓ toca matriculas_divergencias — nunca alunos/cadastro.
-- Coexistência com a edge: numa linha já existente (criada pelo scanner) ela só anexa
-- `analise_sol` (NÃO sobrescreve valor_api/candidatos/fonte); linha nova entra com fonte='sol'.

CREATE OR REPLACE FUNCTION public.sol_registrar_divergencia(
  p_aluno_id integer,
  p_unidade_id uuid,
  p_emusys_matricula_id text,
  p_tipo_divergencia text,
  p_analise text,
  p_campo text DEFAULT '',
  p_valor_api jsonb DEFAULT '{}'::jsonb,
  p_sugestao jsonb DEFAULT NULL,
  p_severidade text DEFAULT 'media'
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO matriculas_divergencias
    (aluno_id, unidade_id, emusys_matricula_id, tipo_divergencia, campo,
     valor_api, sugestao, severidade, fonte, analise_sol, resolvido, updated_at)
  VALUES
    (p_aluno_id, p_unidade_id, p_emusys_matricula_id, p_tipo_divergencia, COALESCE(p_campo, ''),
     p_valor_api, p_sugestao, COALESCE(p_severidade, 'media'), 'sol', p_analise, false, now())
  ON CONFLICT (aluno_id, tipo_divergencia, campo) DO UPDATE SET
     -- só anexa a análise da Sol; preserva o que o scanner (edge) gravou
     analise_sol = EXCLUDED.analise_sol,
     updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.sol_registrar_divergencia(integer, uuid, text, text, text, text, jsonb, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sol_registrar_divergencia(integer, uuid, text, text, text, text, jsonb, jsonb, text) TO sol_acesso_restrito;
