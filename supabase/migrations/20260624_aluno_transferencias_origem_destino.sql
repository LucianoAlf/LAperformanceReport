-- Camada canonica de transferencias internas entre unidades.
-- Transferencia nao e matricula nova comercial e nao e evasao/churn da unidade de origem.

CREATE TABLE IF NOT EXISTS public.aluno_transferencias (
  id BIGSERIAL PRIMARY KEY,
  aluno_id BIGINT NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  unidade_origem_id UUID NULL REFERENCES public.unidades(id),
  unidade_destino_id UUID NOT NULL REFERENCES public.unidades(id),
  data_transferencia DATE NOT NULL DEFAULT CURRENT_DATE,
  observacao TEXT NULL,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT aluno_transferencias_origem_destino_distintas
    CHECK (unidade_origem_id IS NULL OR unidade_origem_id <> unidade_destino_id),
  CONSTRAINT aluno_transferencias_unica_por_competencia
    UNIQUE (aluno_id, unidade_destino_id, data_transferencia)
);

CREATE INDEX IF NOT EXISTS idx_aluno_transferencias_aluno
  ON public.aluno_transferencias (aluno_id);

CREATE INDEX IF NOT EXISTS idx_aluno_transferencias_origem_data
  ON public.aluno_transferencias (unidade_origem_id, data_transferencia);

CREATE INDEX IF NOT EXISTS idx_aluno_transferencias_destino_data
  ON public.aluno_transferencias (unidade_destino_id, data_transferencia);

ALTER TABLE public.aluno_transferencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aluno_transferencias_select_authenticated" ON public.aluno_transferencias;
CREATE POLICY "aluno_transferencias_select_authenticated"
  ON public.aluno_transferencias
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "aluno_transferencias_write_authenticated" ON public.aluno_transferencias;
CREATE POLICY "aluno_transferencias_write_authenticated"
  ON public.aluno_transferencias
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.aluno_transferencias IS
  'Movimentacoes internas de alunos entre unidades. Nao contam como matricula nova comercial nem evasao.';

COMMENT ON COLUMN public.aluno_transferencias.unidade_origem_id IS
  'Unidade de onde o aluno saiu. Nao deve gerar evasao/churn por si so.';

COMMENT ON COLUMN public.aluno_transferencias.unidade_destino_id IS
  'Unidade para onde o aluno foi recebido. Nao deve gerar matricula nova comercial por si so.';
