-- P06B: remove ruido da fila de conciliacao sem apagar historico.
-- Divergencias antigas de valor ficam ocultas quando ja existe auto_preview
-- aberto para o mesmo aluno. O dado permanece na tabela para auditoria.

CREATE OR REPLACE FUNCTION public.get_conciliacao_matriculas(p_unidade_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_resumo jsonb;
  v_items  jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(t ORDER BY t.severidade, t.detectado_em), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT d.id, d.aluno_id, a.nome AS aluno_nome, d.unidade_id, u.nome AS unidade_nome,
           d.tipo_divergencia, d.campo, d.valor_nosso, d.valor_api, d.sugestao,
           d.severidade, d.detectado_em, d.emusys_matricula_id,
           d.fonte, d.analise_sol,
           a.curso_id, c.nome AS curso_nome
    FROM public.matriculas_divergencias d
    LEFT JOIN public.alunos a   ON a.id = d.aluno_id
    LEFT JOIN public.unidades u ON u.id = d.unidade_id
    LEFT JOIN public.cursos c   ON c.id = a.curso_id
    LEFT JOIN public.matriculas_divergencias_decisoes dec ON dec.divergencia_id = d.id
    WHERE d.resolvido = false AND dec.id IS NULL
      AND (p_unidade_id IS NULL OR d.unidade_id = p_unidade_id)
      AND NOT (
        d.tipo_divergencia = 'valor_divergente'
        AND EXISTS (
          SELECT 1
          FROM public.matriculas_divergencias n
          LEFT JOIN public.matriculas_divergencias_decisoes ndec ON ndec.divergencia_id = n.id
          WHERE n.aluno_id = d.aluno_id
            AND n.id <> d.id
            AND n.tipo_divergencia = 'auto_preview'
            AND n.resolvido = false
            AND ndec.id IS NULL
        )
      )
  ) t;

  SELECT coalesce(jsonb_object_agg(tipo, qtd), '{}'::jsonb)
  INTO v_resumo
  FROM (
    SELECT d.tipo_divergencia AS tipo, count(*) AS qtd
    FROM public.matriculas_divergencias d
    LEFT JOIN public.matriculas_divergencias_decisoes dec ON dec.divergencia_id = d.id
    WHERE d.resolvido = false AND dec.id IS NULL
      AND (p_unidade_id IS NULL OR d.unidade_id = p_unidade_id)
      AND NOT (
        d.tipo_divergencia = 'valor_divergente'
        AND EXISTS (
          SELECT 1
          FROM public.matriculas_divergencias n
          LEFT JOIN public.matriculas_divergencias_decisoes ndec ON ndec.divergencia_id = n.id
          WHERE n.aluno_id = d.aluno_id
            AND n.id <> d.id
            AND n.tipo_divergencia = 'auto_preview'
            AND n.resolvido = false
            AND ndec.id IS NULL
        )
      )
    GROUP BY d.tipo_divergencia
  ) s;

  RETURN jsonb_build_object('resumo', v_resumo, 'items', v_items);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_conciliacao_matriculas(uuid) TO authenticated;
