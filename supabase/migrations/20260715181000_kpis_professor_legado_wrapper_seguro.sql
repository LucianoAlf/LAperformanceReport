-- Fecha o bypass legado sem quebrar clientes autenticados que ainda usam a assinatura antiga.
-- A regra e a autorizacao permanecem exclusivamente na RPC canonica v2.
CREATE OR REPLACE FUNCTION public.get_kpis_professor_periodo(
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid DEFAULT NULL::uuid,
  p_data_inicio date DEFAULT NULL::date,
  p_data_fim date DEFAULT NULL::date
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
  alunos_via_turmas integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    k.professor_id,
    k.professor_nome,
    k.unidade_id,
    k.ano,
    k.mes,
    k.carteira_alunos,
    k.ticket_medio,
    CASE
      WHEN k.presenca_publicavel THEN k.media_presenca
      ELSE NULL
    END::numeric AS media_presenca,
    CASE
      WHEN k.presenca_publicavel THEN k.taxa_faltas
      ELSE NULL
    END::numeric AS taxa_faltas,
    k.mrr_carteira,
    k.nps_medio,
    k.media_alunos_turma,
    k.experimentais,
    k.experimentais_agendadas,
    k.experimentais_faltas,
    k.matriculas,
    k.matriculas_pos_exp,
    k.matriculas_diretas,
    k.taxa_conversao,
    k.renovacoes,
    k.nao_renovacoes,
    k.taxa_renovacao,
    k.evasoes,
    k.mrr_perdido,
    k.taxa_cancelamento,
    k.total_turmas,
    k.alunos_via_turmas
  FROM public.get_kpis_professor_periodo_canonico_v2(
    p_ano,
    p_mes,
    p_unidade_id,
    p_data_inicio,
    p_data_fim
  ) AS k;
$$;

COMMENT ON FUNCTION public.get_kpis_professor_periodo(
  integer,
  integer,
  uuid,
  date,
  date
) IS
  'Compatibilidade autenticada. Delega para get_kpis_professor_periodo_canonico_v2; presenca sem confianca retorna NULL.';

REVOKE ALL ON FUNCTION public.get_kpis_professor_periodo(
  integer,
  integer,
  uuid,
  date,
  date
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_kpis_professor_periodo(
  integer,
  integer,
  uuid,
  date,
  date
) TO authenticated, service_role;
