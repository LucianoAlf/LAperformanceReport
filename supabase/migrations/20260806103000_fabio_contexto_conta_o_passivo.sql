-- O Fabio contava o que cobra e negava o resto
--
-- Achado CONVERSANDO com ele em 06/08/2026 (metodologia da casa: mexeu no
-- Fabio, pergunta pra ele antes de dizer que esta pronto):
--
--   > tem alguma aula minha sem lancamento de conteudo?
--   Fabio: nenhuma pendente                      certo
--   > e as minhas aulas de julho, ficou alguma sem lancar o conteudo?
--   Fabio: em julho nao ficou nenhuma            ERRADO — eram 12, de 29/06 a 09/07
--
-- O contexto do professor levava UM numero (pendencias_cobraveis) e o prompt
-- manda usar o contexto_json quando perguntarem de pendencia. Sem nada sobre o
-- passivo, o modelo leu 0 e afirmou a negativa. A fronteira da COBRANCA (nao
-- encher o saco com o passivo, decidida na 041 do la-teacher) vazou para a
-- fronteira da RESPOSTA (negar que ele existe). Nao sao a mesma coisa: uma
-- protege o professor de cobranca injusta, a outra mente pra ele.
--
-- O conserto e DADO, nao regra de prompt: a regra viaja junto, no campo nota.
--
-- fn_pendencias_do_professor(id, true) ja sabia devolver o passivo desde
-- sempre; o contexto so nunca perguntou. A cobranca segue intocada — o mutante
-- N3 existe justamente pra provar que o passivo nao entrou nela de carona.
--
-- Teste e mutantes: 20260806103000_fabio_contexto_conta_o_passivo.test.sql
-- e D:/la-teacher/scripts/mutantes-042.mjs (o runner da casa mora la).

CREATE OR REPLACE FUNCTION public.fabio_contexto_professor(p_professor_id integer, p_data date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_nome text;
  v_res jsonb;
BEGIN
  SELECT nome
    INTO v_nome
  FROM public.professores
  WHERE id = p_professor_id
    AND COALESCE(ativo, true);

  IF v_nome IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'motivo', 'professor_nao_encontrado'
    );
  END IF;

  SELECT jsonb_build_object(
    'ok', true,
    'professor_id', p_professor_id,
    'nome', v_nome,
    'primeiro_nome', split_part(btrim(v_nome), ' ', 1),
    'unidades', COALESCE((
      SELECT jsonb_agg(x.nome ORDER BY x.nome)
      FROM (
        SELECT DISTINCT u.nome
        FROM public.vw_professor_carteira_pessoa_canonica_sombra c
        JOIN public.unidades u ON u.id = c.unidade_id
        WHERE c.professor_id = p_professor_id
      ) x
    ), '[]'::jsonb),
    'total_alunos_carteira', (
      SELECT count(*)
      FROM public.vw_professor_carteira_pessoa_canonica_sombra c
      WHERE c.professor_id = p_professor_id
    ),
    'fonte_carteira', 'vw_professor_carteira_pessoa_canonica_sombra',
    'hoje', jsonb_build_object(
      'data', p_data,
      'total_aulas', (
        SELECT count(DISTINCT (ae.data_hora_inicio, ae.data_hora_fim))
        FROM public.aulas_emusys ae
        WHERE ae.professor_id = p_professor_id
          AND ae.data_aula = p_data
          AND COALESCE(ae.cancelada, false) = false
      ),
      'aulas', COALESCE((
        WITH slots AS (
          SELECT
            data_hora_inicio,
            data_hora_fim,
            array_agg(id ORDER BY CASE WHEN tipo = 'turma' THEN 0 ELSE 1 END, id) AS aula_ids,
            (array_agg(id ORDER BY CASE WHEN tipo = 'turma' THEN 0 ELSE 1 END, id))[1] AS aula_ancora
          FROM public.aulas_emusys
          WHERE professor_id = p_professor_id
            AND data_aula = p_data
            AND COALESCE(cancelada, false) = false
          GROUP BY data_hora_inicio, data_hora_fim
        )
        SELECT jsonb_agg(
          jsonb_build_object(
            'hora', to_char(
              ae.data_hora_inicio AT TIME ZONE 'America/Sao_Paulo',
              'HH24:MI'
            ),
            'curso', ae.curso_nome,
            'alunos', COALESCE((
              SELECT jsonb_agg(roster.nome ORDER BY roster.nome)
              FROM (
                SELECT DISTINCT a.id, a.nome
                FROM public.aula_alunos_emusys r
                JOIN public.alunos a ON a.id = r.aluno_id
                WHERE r.aula_emusys_id = ANY(s.aula_ids)
              ) roster
            ), '[]'::jsonb),
            'chamada_feita', EXISTS (
              SELECT 1
              FROM public.vw_aluno_presenca_semantica_v1 ps
              WHERE ps.aula_emusys_id = ANY(s.aula_ids)
                AND ps.resultado_pedagogico IN ('presente', 'falta_confirmada')
            ),
            'chamada_situacao', CASE
              WHEN EXISTS (
                SELECT 1
                FROM public.vw_aluno_presenca_semantica_v1 ps
                WHERE ps.aula_emusys_id = ANY(s.aula_ids)
                  AND ps.resultado_pedagogico IN ('presente', 'falta_confirmada')
              ) THEN 'confirmada'
              WHEN EXISTS (
                SELECT 1
                FROM public.vw_aluno_presenca_semantica_v1 ps
                WHERE ps.aula_emusys_id = ANY(s.aula_ids)
              ) THEN 'evidencia_inconclusiva'
              ELSE 'nao_registrada'
            END
          )
          ORDER BY ae.data_hora_inicio
        )
        FROM slots s
        JOIN public.aulas_emusys ae ON ae.id = s.aula_ancora
      ), '[]'::jsonb)
    ),
    'pendencias_cobraveis', (
      SELECT COALESCE(
        (public.fn_pendencias_do_professor(p_professor_id, false))->>'total_alunos',
        '0'
      )::integer
    ),
    -- O passivo EXISTE e nao se cobra. Sao duas coisas diferentes, e o Fabio
    -- precisava das duas: com so o numero de cobraveis no contexto, ele leu 0 e
    -- respondeu ao Matheus que "em julho nao ficou nenhuma aula pendente" —
    -- eram 12, de 29/06 a 09/07. Numero ausente do contexto vira negativa
    -- afirmada na resposta.
    -- Mesma fonte da cobranca (vw_registro_pendencia), lado de la do corte.
    'registro_fora_da_cobranca', (
      select jsonb_build_object(
               'aulas',  count(distinct aula_ancora_id),
               'alunos', count(*),
               'de',     min(data_aula),
               'ate',    max(data_aula),
               'corte',  public.fn_data_corte_cobranca(),
               'nota',   'Aulas sem conteudo lancado ANTERIORES a data de corte. Nao entram em cobranca nem em escalonamento, mas existem: se perguntarem por esse periodo, informe o numero em vez de dizer que nao ha nada.')
        from public.vw_registro_pendencia
       where professor_id = p_professor_id and not cobravel
    )
  )
  INTO v_res;

  RETURN v_res;
END
$function$;
