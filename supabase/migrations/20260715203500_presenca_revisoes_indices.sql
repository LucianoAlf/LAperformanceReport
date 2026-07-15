-- Indices de suporte para as chaves estrangeiras da trilha de revisao.

CREATE INDEX IF NOT EXISTS idx_presenca_revisoes_politica
  ON public.aluno_presenca_revisoes_operacionais (politica_confiabilidade_id);

CREATE INDEX IF NOT EXISTS idx_presenca_revisoes_usuario
  ON public.aluno_presenca_revisoes_operacionais (revisado_por_usuario_id);
