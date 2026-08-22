-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Etapa 1: so estrutura. Nenhuma linha nova, nada removido.
-- A insercao dos professores fica para a etapa 2, depois da auditoria
-- das telas que ja leem colaboradores.

ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS departamento varchar(30),
  ADD COLUMN IF NOT EXISTS professor_id integer REFERENCES public.professores(id);

CREATE INDEX IF NOT EXISTS idx_colaboradores_departamento
  ON public.colaboradores(departamento);
CREATE UNIQUE INDEX IF NOT EXISTS uq_colaboradores_professor
  ON public.colaboradores(professor_id) WHERE professor_id IS NOT NULL;

COMMENT ON COLUMN public.colaboradores.departamento IS
  'Departamento da pessoa. Serve para dois fins: filtro da pagina Time e escolha do banco de cenarios da Ficha Tecnica (cargo_contexto).';
COMMENT ON COLUMN public.colaboradores.professor_id IS
  'Vinculo com o cadastro operacional em professores. colaboradores = quem a pessoa e; professores = como ela performa. Nulo para quem nao da aula.';

-- Backfill dos 15 que ja existem, a partir do tipo atual
UPDATE public.colaboradores SET departamento = 'Atendimento'
  WHERE departamento IS NULL AND tipo IN ('farmer','hunter','pre_atendimento');
UPDATE public.colaboradores SET departamento = 'Administrativo'
  WHERE departamento IS NULL AND tipo = 'admin';
