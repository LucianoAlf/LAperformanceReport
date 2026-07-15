-- Contrato de publicacao da frequencia do professor.
-- O agregado confirmado permanece disponivel para auditoria, mas um percentual
-- so pode alimentar tela, ranking ou score quando a confianca for alta.

CREATE OR REPLACE FUNCTION public.get_frequencia_professor_periodo_publicavel_v1(
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid DEFAULT NULL,
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL
)
RETURNS TABLE(
  professor_id integer,
  unidade_id uuid,
  ano integer,
  mes integer,
  media_presenca numeric,
  taxa_faltas numeric,
  cobertura_resultado_confirmado numeric,
  confianca_presenca text,
  publicavel boolean,
  eventos_resultado_confirmado integer,
  eventos_incertos integer,
  regra_versao text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    f.professor_id,
    f.unidade_id,
    f.ano,
    f.mes,
    CASE WHEN f.confianca_presenca = 'alta' THEN f.media_presenca ELSE NULL END
      AS media_presenca,
    CASE WHEN f.confianca_presenca = 'alta' THEN f.taxa_faltas ELSE NULL END
      AS taxa_faltas,
    f.cobertura_resultado_confirmado,
    f.confianca_presenca,
    f.confianca_presenca = 'alta' AS publicavel,
    f.eventos_resultado_confirmado,
    f.faltas_provaveis + f.chamadas_indeterminadas AS eventos_incertos,
    'frequencia-professor-publicavel-v1'::text AS regra_versao
  FROM public.get_frequencia_professor_periodo_canonica_v1(
    p_ano,
    p_mes,
    p_unidade_id,
    p_data_inicio,
    p_data_fim
  ) f;
$$;

COMMENT ON FUNCTION public.get_frequencia_professor_periodo_publicavel_v1(
  integer, integer, uuid, date, date
) IS
  'Publica percentual de frequencia somente com confianca alta; caso contrario devolve NULL e cobertura auditavel.';

REVOKE ALL ON FUNCTION public.get_frequencia_professor_periodo_publicavel_v1(
  integer, integer, uuid, date, date
) FROM PUBLIC, anon, authenticated, fabio_agent;
GRANT EXECUTE ON FUNCTION public.get_frequencia_professor_periodo_publicavel_v1(
  integer, integer, uuid, date, date
) TO service_role;
