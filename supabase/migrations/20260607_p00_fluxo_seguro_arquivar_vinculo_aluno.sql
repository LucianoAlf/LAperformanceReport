-- P0 - Fluxo seguro para "Remover banda/curso" em AlunosPage.
--
-- NAO EXECUTAR SEM APPROVE EXPLICITO DO ALF.
--
-- Objetivo:
-- - Permitir arquivamento logico de uma linha/vinculo em public.alunos.
-- - Evitar DELETE fisico de alunos, que pode falhar por FK ou apagar historico em cascata.
-- - Preservar aluno_presenca, renovacoes, movimentacoes_admin e demais historicos.
--
-- Esta migration altera somente schema/metadados.
-- Nao arquiva Ester, Julia ou qualquer aluno nominalmente.
-- Nao executa UPDATE de dados operacionais.
-- Nao recalcula dados_mensais.
-- Nao fecha competencia.

ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS arquivado_em timestamptz,
  ADD COLUMN IF NOT EXISTS arquivado_por text,
  ADD COLUMN IF NOT EXISTS arquivado_motivo text,
  ADD COLUMN IF NOT EXISTS arquivado_origem text,
  ADD COLUMN IF NOT EXISTS arquivado_aluno_principal_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'alunos_arquivado_aluno_principal_id_fkey'
      AND conrelid = 'public.alunos'::regclass
  ) THEN
    ALTER TABLE public.alunos
      ADD CONSTRAINT alunos_arquivado_aluno_principal_id_fkey
      FOREIGN KEY (arquivado_aluno_principal_id)
      REFERENCES public.alunos(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'alunos_arquivado_origem_check'
      AND conrelid = 'public.alunos'::regclass
  ) THEN
    ALTER TABLE public.alunos
      ADD CONSTRAINT alunos_arquivado_origem_check
      CHECK (
        arquivado_origem IS NULL
        OR arquivado_origem IN (
          'ui-remover-banda',
          'ui-remover-segundo-curso',
          'ui-arquivar-aluno',
          'ajuste-operacional',
          'duplicidade'
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_alunos_nao_arquivados_lista
  ON public.alunos (unidade_id, data_matricula, nome)
  WHERE arquivado_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_alunos_arquivados_lookup
  ON public.alunos (arquivado_em, arquivado_origem, arquivado_aluno_principal_id)
  WHERE arquivado_em IS NOT NULL;

COMMENT ON COLUMN public.alunos.arquivado_em IS
  'Timestamp de arquivamento logico de vinculo/linha. Quando preenchido, a linha deve sair das listas operacionais sem DELETE fisico.';

COMMENT ON COLUMN public.alunos.arquivado_por IS
  'Ator operacional que arquivou o vinculo. Em P0 usa e-mail/nome textual.';

COMMENT ON COLUMN public.alunos.arquivado_motivo IS
  'Motivo textual do arquivamento logico.';

COMMENT ON COLUMN public.alunos.arquivado_origem IS
  'Origem do arquivamento logico, por exemplo ui-remover-banda ou ui-remover-segundo-curso.';

COMMENT ON COLUMN public.alunos.arquivado_aluno_principal_id IS
  'Linha principal mantida quando o arquivamento remove apenas um vinculo/curso/banda duplicado.';

-- Rollback estrutural, se necessario e antes de usar o fluxo:
-- DROP INDEX IF EXISTS public.idx_alunos_arquivados_lookup;
-- DROP INDEX IF EXISTS public.idx_alunos_nao_arquivados_lista;
-- ALTER TABLE public.alunos DROP CONSTRAINT IF EXISTS alunos_arquivado_origem_check;
-- ALTER TABLE public.alunos DROP CONSTRAINT IF EXISTS alunos_arquivado_aluno_principal_id_fkey;
-- ALTER TABLE public.alunos
--   DROP COLUMN IF EXISTS arquivado_aluno_principal_id,
--   DROP COLUMN IF EXISTS arquivado_origem,
--   DROP COLUMN IF EXISTS arquivado_motivo,
--   DROP COLUMN IF EXISTS arquivado_por,
--   DROP COLUMN IF EXISTS arquivado_em;
