-- P08E: camada canonica de decisoes por matricula Emusys.
-- Chave real: unidade_id + emusys_matricula_id. Nao altera historico nem sobrescreve
-- divergencias antigas; serve para o sync respeitar excecoes validadas.

CREATE TABLE IF NOT EXISTS public.matriculas_emusys_decisoes_canonicas (
  id bigserial PRIMARY KEY,
  unidade_id uuid NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
  emusys_matricula_id text NOT NULL,
  aluno_id integer REFERENCES public.alunos(id) ON DELETE SET NULL,
  tipo_decisao text NOT NULL,
  campos_bloqueados text[] NOT NULL DEFAULT ARRAY[]::text[],
  tipo_matricula_codigo text,
  status_pagamento text,
  valor_parcela numeric,
  ignorar_sync boolean NOT NULL DEFAULT false,
  motivo text,
  snapshot_emusys jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL DEFAULT 'sistema',
  updated_by text NOT NULL DEFAULT 'sistema',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT matriculas_emusys_decisoes_canonicas_tipo_check
    CHECK (tipo_decisao IN (
      'aplicar_emusys',
      'manter_la_report',
      'bolsista_integral',
      'bolsista_parcial',
      'banda_sem_mrr',
      'professor_bolsista',
      'responsavel_nao_aluno',
      'ignorar_matricula_api',
      'bloquear_auto_sync',
      'revisar'
    )),
  CONSTRAINT matriculas_emusys_decisoes_canonicas_unique
    UNIQUE (unidade_id, emusys_matricula_id)
);

CREATE INDEX IF NOT EXISTS idx_matriculas_emusys_decisoes_aluno
  ON public.matriculas_emusys_decisoes_canonicas(aluno_id);

CREATE INDEX IF NOT EXISTS idx_matriculas_emusys_decisoes_tipo
  ON public.matriculas_emusys_decisoes_canonicas(tipo_decisao);

COMMENT ON TABLE public.matriculas_emusys_decisoes_canonicas IS
  'Decisoes canonicas por unidade + matricula Emusys. Usada para blindar o sync contra excecoes validadas: bolsista, responsavel, banda, bloqueios e revisoes.';

COMMENT ON COLUMN public.matriculas_emusys_decisoes_canonicas.campos_bloqueados IS
  'Campos que o sync nao pode sobrescrever para esta matricula Emusys, mesmo que a API sugira mudanca.';

ALTER TABLE public.matriculas_emusys_decisoes_canonicas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS matriculas_emusys_decisoes_select_auth
  ON public.matriculas_emusys_decisoes_canonicas;

CREATE POLICY matriculas_emusys_decisoes_select_auth
  ON public.matriculas_emusys_decisoes_canonicas
  FOR SELECT
  TO authenticated
  USING (true);
