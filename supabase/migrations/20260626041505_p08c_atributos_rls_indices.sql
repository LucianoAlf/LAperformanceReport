-- P08C: hardening da conciliacao expandida de atributos Emusys.
-- A UI le a fila, mas decisoes e updates passam somente pelas RPCs guardadas.

CREATE INDEX IF NOT EXISTS idx_alunos_emusys_atributos_divergencias_aluno_id
  ON public.alunos_emusys_atributos_divergencias (aluno_id)
  WHERE aluno_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_alunos_emusys_atributos_decisoes_aluno_id
  ON public.alunos_emusys_atributos_decisoes (aluno_id)
  WHERE aluno_id IS NOT NULL;

ALTER TABLE public.alunos_emusys_atributos_divergencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alunos_emusys_atributos_decisoes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.alunos_emusys_atributos_divergencias FROM anon;
REVOKE ALL ON TABLE public.alunos_emusys_atributos_decisoes FROM anon;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.alunos_emusys_atributos_divergencias
  FROM authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.alunos_emusys_atributos_decisoes
  FROM authenticated;

GRANT SELECT ON TABLE public.alunos_emusys_atributos_divergencias TO authenticated;
GRANT SELECT ON TABLE public.alunos_emusys_atributos_decisoes TO authenticated;
GRANT ALL ON TABLE public.alunos_emusys_atributos_divergencias TO service_role;
GRANT ALL ON TABLE public.alunos_emusys_atributos_decisoes TO service_role;

DROP POLICY IF EXISTS alunos_emusys_atributos_divergencias_auth_select
  ON public.alunos_emusys_atributos_divergencias;

CREATE POLICY alunos_emusys_atributos_divergencias_auth_select
  ON public.alunos_emusys_atributos_divergencias
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS alunos_emusys_atributos_decisoes_auth_select
  ON public.alunos_emusys_atributos_decisoes;

CREATE POLICY alunos_emusys_atributos_decisoes_auth_select
  ON public.alunos_emusys_atributos_decisoes
  FOR SELECT
  TO authenticated
  USING (true);
