-- Endurece os objetos da politica de presenca contra grants padrao do banco.
-- O front acessa a fila apenas pelas RPCs com verificacao de permissao.

DO $$
DECLARE
  v_role text;
  v_object text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY[
    'fabio_agent',
    'lia_acesso_restrito',
    'mila_acesso_restrito',
    'sol_acesso_restrito'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      FOREACH v_object IN ARRAY ARRAY[
        'presenca_politicas_confiabilidade',
        'aluno_presenca_revisoes_operacionais',
        'vw_aluno_presenca_semantica_v1',
        'vw_aluno_presenca_conciliacao_operacional'
      ]
      LOOP
        EXECUTE format(
          'REVOKE ALL ON TABLE public.%I FROM %I',
          v_object,
          v_role
        );
      END LOOP;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON TABLE public.presenca_politicas_confiabilidade
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.aluno_presenca_revisoes_operacionais
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.vw_aluno_presenca_semantica_v1
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.vw_aluno_presenca_conciliacao_operacional
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.presenca_politicas_confiabilidade TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.aluno_presenca_revisoes_operacionais TO service_role;
GRANT SELECT ON TABLE public.vw_aluno_presenca_semantica_v1 TO service_role;
GRANT SELECT ON TABLE public.vw_aluno_presenca_conciliacao_operacional TO service_role;
