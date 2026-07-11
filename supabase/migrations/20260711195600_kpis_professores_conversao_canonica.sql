-- P26.1 - Completa a fonte canonica de professores com a conciliacao
-- oficial de experimentais do Emusys.

ALTER FUNCTION public.get_kpis_professor_periodo_canonico(
  integer, integer, uuid, date, date
)
RENAME TO get_kpis_professor_periodo_canonico_base_20260711;

CREATE FUNCTION public.get_kpis_professor_periodo_canonico(
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid DEFAULT NULL,
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL
)
RETURNS TABLE(
  professor_id integer,
  professor_nome text,
  unidade_id uuid,
  ano integer,
  mes integer,
  carteira_alunos integer,
  ticket_medio numeric,
  media_presenca numeric,
  taxa_faltas numeric,
  mrr_carteira numeric,
  nps_medio numeric,
  media_alunos_turma numeric,
  experimentais integer,
  experimentais_agendadas integer,
  experimentais_faltas integer,
  matriculas integer,
  matriculas_pos_exp integer,
  matriculas_diretas integer,
  taxa_conversao numeric,
  renovacoes integer,
  nao_renovacoes integer,
  taxa_renovacao numeric,
  evasoes integer,
  mrr_perdido numeric,
  taxa_cancelamento numeric,
  total_turmas integer,
  alunos_via_turmas integer,
  turmas_elegiveis_media integer
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  WITH base AS (
    SELECT *
    FROM public.get_kpis_professor_periodo_canonico_base_20260711(
      p_ano,
      p_mes,
      p_unidade_id,
      p_data_inicio,
      p_data_fim
    )
  ),
  conversao AS (
    SELECT
      c.professor_id,
      c.unidade_id,
      SUM(c.realizadas_emusys)::integer AS realizadas_emusys,
      SUM(c.faltas_emusys)::integer AS faltas_emusys,
      SUM(c.canceladas_emusys)::integer AS canceladas_emusys,
      SUM(c.matriculas_pos_exp)::integer AS matriculas_pos_exp
    FROM public.get_experimentais_professor_canonicos_v1(
      p_unidade_id,
      p_ano,
      EXTRACT(MONTH FROM COALESCE(p_data_inicio, make_date(p_ano, p_mes, 1)))::integer,
      EXTRACT(MONTH FROM COALESCE(
        p_data_fim,
        (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date
      ))::integer
    ) c
    GROUP BY c.professor_id, c.unidade_id
  )
  SELECT
    COALESCE(b.professor_id, c.professor_id)::integer AS professor_id,
    COALESCE(b.professor_nome, p.nome)::text AS professor_nome,
    COALESCE(b.unidade_id, c.unidade_id)::uuid AS unidade_id,
    COALESCE(b.ano, p_ano)::integer AS ano,
    COALESCE(b.mes, p_mes)::integer AS mes,
    COALESCE(b.carteira_alunos, 0)::integer AS carteira_alunos,
    COALESCE(b.ticket_medio, 0)::numeric AS ticket_medio,
    COALESCE(b.media_presenca, 0)::numeric AS media_presenca,
    COALESCE(b.taxa_faltas, 0)::numeric AS taxa_faltas,
    COALESCE(b.mrr_carteira, 0)::numeric AS mrr_carteira,
    COALESCE(b.nps_medio, 0)::numeric AS nps_medio,
    COALESCE(b.media_alunos_turma, 0)::numeric AS media_alunos_turma,
    COALESCE(c.realizadas_emusys, 0)::integer AS experimentais,
    COALESCE(
      c.realizadas_emusys + c.faltas_emusys + c.canceladas_emusys,
      0
    )::integer AS experimentais_agendadas,
    COALESCE(c.faltas_emusys, 0)::integer AS experimentais_faltas,
    COALESCE(c.matriculas_pos_exp, 0)::integer AS matriculas,
    COALESCE(c.matriculas_pos_exp, 0)::integer AS matriculas_pos_exp,
    COALESCE(b.matriculas_diretas, 0)::integer AS matriculas_diretas,
    CASE WHEN COALESCE(c.realizadas_emusys, 0) > 0
      THEN ROUND(c.matriculas_pos_exp::numeric / c.realizadas_emusys * 100, 2)
      ELSE 0
    END::numeric AS taxa_conversao,
    COALESCE(b.renovacoes, 0)::integer AS renovacoes,
    COALESCE(b.nao_renovacoes, 0)::integer AS nao_renovacoes,
    COALESCE(b.taxa_renovacao, 0)::numeric AS taxa_renovacao,
    COALESCE(b.evasoes, 0)::integer AS evasoes,
    COALESCE(b.mrr_perdido, 0)::numeric AS mrr_perdido,
    COALESCE(b.taxa_cancelamento, 0)::numeric AS taxa_cancelamento,
    COALESCE(b.total_turmas, 0)::integer AS total_turmas,
    COALESCE(b.alunos_via_turmas, 0)::integer AS alunos_via_turmas,
    COALESCE(b.turmas_elegiveis_media, 0)::integer AS turmas_elegiveis_media
  FROM base b
  FULL JOIN conversao c
    ON c.professor_id = b.professor_id
   AND c.unidade_id = b.unidade_id
  LEFT JOIN public.professores p
    ON p.id = COALESCE(b.professor_id, c.professor_id)
  ORDER BY COALESCE(b.professor_id, c.professor_id), COALESCE(b.unidade_id, c.unidade_id);
$$;

COMMENT ON FUNCTION public.get_kpis_professor_periodo_canonico(
  integer, integer, uuid, date, date
)
IS 'Fonte canonica mensal de professores: carteira/turmas por competencia e conversao pela conciliacao oficial do Emusys.';

GRANT EXECUTE ON FUNCTION public.get_kpis_professor_periodo_canonico(
  integer, integer, uuid, date, date
) TO authenticated, service_role;

