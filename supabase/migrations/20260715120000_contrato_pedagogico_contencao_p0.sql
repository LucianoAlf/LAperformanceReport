-- Contencao P0 do contrato canonico pedagogico.
-- Preserva os scores existentes, mas impede que sejam publicados como fato
-- enquanto as features de presenca ainda usam semantica ambigua do Emusys.

CREATE OR REPLACE VIEW public.vw_risco_evasao_atual
WITH (security_invoker = true) AS
SELECT DISTINCT ON (aluno_id)
  aluno_id,
  unidade_id,
  probabilidade,
  faixa,
  fatores,
  modelo_versao,
  calculado_em,
  'baixa'::text AS confianca_dado,
  'Modelo em auditoria: as features de presenca ainda misturam falta com chamada nao registrada.'::text
    AS motivo_confianca
FROM public.risco_evasao
ORDER BY aluno_id, calculado_em DESC;

COMMENT ON VIEW public.vw_risco_evasao_atual IS
  'Ultimo score de risco por aluno. Scores atuais ficam preservados, mas com baixa confianca ate o cutover da presenca canonica.';

-- O navegador continua lendo a view sob RLS da tabela base. O score nao pode ser
-- alterado por meio desta camada de leitura.
REVOKE ALL ON TABLE public.vw_risco_evasao_atual FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.vw_risco_evasao_atual TO authenticated, service_role;

-- O pente-fino ainda depende de presenca ambigua. Service role permanece com
-- acesso para diagnostico, mas o agente nao pode publica-lo antes da liberacao.
REVOKE ALL ON FUNCTION public.fabio_pente_fino_unidade(integer, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fabio_pente_fino_unidade(integer, text, integer)
  TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabio_agent') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.fabio_pente_fino_unidade(integer, text, integer) FROM fabio_agent';
  END IF;
END;
$$;
