-- ============================================================================
-- P09C - Estrutura de snapshots mensais canonicos
-- Projeto alvo: ouqwbbermlzqqvtqwlul
--
-- Objetivo:
-- - Criar uma camada imutavel/auditavel para preservar o fechamento mensal
--   por dominio do LA Report.
-- - Dar suporte a snapshots por unidade e consolidado.
-- - Manter dados_mensais apenas como compatibilidade compacta.
--
-- Nao faz:
-- - Nao grava Junho/2026.
-- - Nao altera dados_mensais.
-- - Nao fecha competencia.
-- - Nao roda sync/backfill/recalculo.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.hash_jsonb_canonico(p_payload jsonb)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $function$
  SELECT encode(extensions.digest(convert_to(COALESCE(p_payload, '{}'::jsonb)::text, 'UTF8'), 'sha256'::text), 'hex');
$function$;

REVOKE ALL ON FUNCTION public.hash_jsonb_canonico(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hash_jsonb_canonico(jsonb) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.fechamento_mensal_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ano integer NOT NULL CHECK (ano BETWEEN 2020 AND 2100),
  mes integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  escopo text NOT NULL DEFAULT 'unidade' CHECK (escopo IN ('unidade', 'consolidado')),
  unidade_id uuid REFERENCES public.unidades(id),
  dominio text NOT NULL CHECK (dominio IN (
    'alunos_admin',
    'alunos_executivo',
    'comercial',
    'retencao',
    'renovacoes',
    'professores',
    'relatorio_admin',
    'relatorio_gerencial',
    'relatorio_coordenacao',
    'metas',
    'programa_matriculador',
    'programa_fideliza',
    'compatibilidade_dados_mensais'
  )),
  versao integer NOT NULL DEFAULT 1 CHECK (versao > 0),
  status text NOT NULL DEFAULT 'preview' CHECK (status IN ('preview', 'aprovado', 'fechado', 'retificado')),
  fonte text NOT NULL,
  payload jsonb NOT NULL,
  payload_hash text NOT NULL,
  financeiro_realizado_disponivel boolean NOT NULL DEFAULT false,
  observacao text,
  capturado_em timestamptz NOT NULL DEFAULT now(),
  capturado_por uuid,
  aprovado_em timestamptz,
  aprovado_por uuid,
  fechado_em timestamptz,
  fechado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fechamento_mensal_snapshots_escopo_unidade_chk CHECK (
    (escopo = 'unidade' AND unidade_id IS NOT NULL)
    OR (escopo = 'consolidado' AND unidade_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_fechamento_mensal_snapshots_competencia_dominio
  ON public.fechamento_mensal_snapshots (
    ano,
    mes,
    escopo,
    COALESCE(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid),
    dominio,
    versao
  );

CREATE INDEX IF NOT EXISTS idx_fechamento_mensal_snapshots_lookup
  ON public.fechamento_mensal_snapshots (ano, mes, escopo, unidade_id, dominio, status);

CREATE INDEX IF NOT EXISTS idx_fechamento_mensal_snapshots_payload_gin
  ON public.fechamento_mensal_snapshots USING gin (payload);

CREATE TABLE IF NOT EXISTS public.fechamento_mensal_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid REFERENCES public.fechamento_mensal_snapshots(id),
  ano integer NOT NULL CHECK (ano BETWEEN 2020 AND 2100),
  mes integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  escopo text NOT NULL DEFAULT 'unidade' CHECK (escopo IN ('unidade', 'consolidado')),
  unidade_id uuid REFERENCES public.unidades(id),
  acao text NOT NULL CHECK (acao IN (
    'preview_gerado',
    'snapshot_gravado',
    'snapshot_aprovado',
    'snapshot_fechado',
    'compatibilidade_dados_mensais_atualizada',
    'writer_legado_bloqueado',
    'retificacao_solicitada'
  )),
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fechamento_mensal_auditoria_escopo_unidade_chk CHECK (
    (escopo = 'unidade' AND unidade_id IS NOT NULL)
    OR (escopo = 'consolidado' AND unidade_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_fechamento_mensal_auditoria_lookup
  ON public.fechamento_mensal_auditoria (ano, mes, escopo, unidade_id, acao, created_at DESC);

ALTER TABLE public.fechamento_mensal_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fechamento_mensal_auditoria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fechamento_mensal_snapshots_select_auth ON public.fechamento_mensal_snapshots;
CREATE POLICY fechamento_mensal_snapshots_select_auth
ON public.fechamento_mensal_snapshots
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS fechamento_mensal_auditoria_select_auth ON public.fechamento_mensal_auditoria;
CREATE POLICY fechamento_mensal_auditoria_select_auth
ON public.fechamento_mensal_auditoria
FOR SELECT
TO authenticated
USING (true);

REVOKE ALL ON TABLE public.fechamento_mensal_snapshots FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.fechamento_mensal_auditoria FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.fechamento_mensal_snapshots TO authenticated, service_role;
GRANT SELECT ON TABLE public.fechamento_mensal_auditoria TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.fechamento_mensal_snapshots TO service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.fechamento_mensal_auditoria TO service_role;

COMMENT ON TABLE public.fechamento_mensal_snapshots IS
  'Snapshot mensal imutavel por dominio do LA Report. Fonte oficial para competencias fechadas.';

COMMENT ON TABLE public.fechamento_mensal_auditoria IS
  'Auditoria das acoes de preview, aprovacao, fechamento, retificacao e compatibilidade mensal.';

COMMENT ON FUNCTION public.hash_jsonb_canonico(jsonb) IS
  'Gera hash sha256 para payload jsonb usado no fechamento mensal.';
