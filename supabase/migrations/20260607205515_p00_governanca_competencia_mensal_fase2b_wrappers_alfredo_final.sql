-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- ============================================================
-- P0.0 - Fase 2B - Wrappers/guards dos writers de dados_mensais
-- LA Performance Report
--
-- Status deste arquivo:
--   - Arquivo para REVISAO HUMANA.
--   - NAO executar sem APPROVE explicito do Alf.
--   - Projeto alvo esperado: ouqwbbermlzqqvtqwlul.
--   - Antes de executar, confirmar na ferramenta ativa que o projeto e
--     https://ouqwbbermlzqqvtqwlul.supabase.co.
--
-- Escopo ativo desta migration:
--   - Criar wrappers cirurgicos para:
--       recalcular_dados_mensais
--       upsert_dados_mensais
--       fechar_dados_mensais
--       snapshot_dados_mensais
--   - Recriar sync_evasao_to_dados_mensais com guard baseado na definicao
--     live inspecionada via pg_get_functiondef.
--   - Nao copiar corpo de calculo nas quatro funcoes wrapper.
--   - Nao corrigir divergencia de KPI.
--   - Nao fechar competencia.
--   - Nao recalcular dados_mensais.
--   - Nao fazer backfill.
--   - Nao executar piloto CG/Maio 2026.
--   - Nao alterar KPI, view ou frontend.
--   - Nao aplicar hardening de permissoes dos nomes publicos antigos.
--
-- Nota de seguranca:
--   - As funcoes legadas renomeadas para *_unguarded sao helpers internos.
--   - Esta migration revoga EXECUTE publico desses helpers internos para
--     impedir bypass direto dos wrappers.
--   - O bloco de hardening dos nomes publicos continua separado/comentado.
--
-- Dependencias da Fase 1:
--   - public.competencias_mensais
--   - public.competencias_bloqueios_log
--   - public.assert_competencia_aberta(uuid, integer, integer)
--   - public.log_competencia_bloqueio(uuid, integer, integer, text, text, text, jsonb)
-- ============================================================

BEGIN;


-- ============================================================
-- 1. Preservar funcoes legadas como helpers internos
-- ============================================================
-- Idempotencia parcial:
--   - Se *_unguarded ainda nao existir, renomeia a funcao atual.
--   - Se ja existir, assume que a migration ja preparou o helper e segue.
--   - Os wrappers com os nomes publicos sao recriados abaixo.

DO $$
BEGIN
  IF to_regprocedure('public.recalcular_dados_mensais_unguarded(integer, integer, uuid)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.recalcular_dados_mensais(integer, integer, uuid) RENAME TO recalcular_dados_mensais_unguarded';
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.upsert_dados_mensais_unguarded(character varying, integer, integer, integer, integer, integer, numeric, numeric, numeric, integer, numeric, numeric)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.upsert_dados_mensais(character varying, integer, integer, integer, integer, integer, numeric, numeric, numeric, integer, numeric, numeric) RENAME TO upsert_dados_mensais_unguarded';
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.fechar_dados_mensais_unguarded(integer, integer)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.fechar_dados_mensais(integer, integer) RENAME TO fechar_dados_mensais_unguarded';
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.snapshot_dados_mensais_unguarded(integer, integer)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.snapshot_dados_mensais(integer, integer) RENAME TO snapshot_dados_mensais_unguarded';
  END IF;
END;
$$;


-- Bloqueio de bypass direto dos helpers internos.
-- Nao altera permissoes dos nomes publicos antigos, que agora serao wrappers.

REVOKE ALL ON FUNCTION public.recalcular_dados_mensais_unguarded(integer, integer, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalcular_dados_mensais_unguarded(integer, integer, uuid)
  TO service_role, postgres;

REVOKE ALL ON FUNCTION public.upsert_dados_mensais_unguarded(
  character varying,
  integer,
  integer,
  integer,
  integer,
  integer,
  numeric,
  numeric,
  numeric,
  integer,
  numeric,
  numeric
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_dados_mensais_unguarded(
  character varying,
  integer,
  integer,
  integer,
  integer,
  integer,
  numeric,
  numeric,
  numeric,
  integer,
  numeric,
  numeric
) TO service_role, postgres;

REVOKE ALL ON FUNCTION public.fechar_dados_mensais_unguarded(integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fechar_dados_mensais_unguarded(integer, integer)
  TO service_role, postgres;

REVOKE ALL ON FUNCTION public.snapshot_dados_mensais_unguarded(integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.snapshot_dados_mensais_unguarded(integer, integer)
  TO service_role, postgres;


-- ============================================================
-- 2. Wrapper: recalcular_dados_mensais
-- ============================================================
-- Antes: recalculava e sobrescrevia dados_mensais para a unidade/ano/mes.
-- Depois: chama assert_competencia_aberta antes de delegar para o helper
-- legado _unguarded.

CREATE OR REPLACE FUNCTION public.recalcular_dados_mensais(
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.assert_competencia_aberta(p_unidade_id, p_ano, p_mes);

  RETURN public.recalcular_dados_mensais_unguarded(
    p_ano,
    p_mes,
    p_unidade_id
  );
END;
$$;

COMMENT ON FUNCTION public.recalcular_dados_mensais(integer, integer, uuid) IS
  'Wrapper P0.0 Fase 2B: bloqueia competencia fechada antes de chamar recalcular_dados_mensais_unguarded.';


-- ============================================================
-- 3. Wrapper: upsert_dados_mensais
-- ============================================================
-- Antes: upsert manual podia alterar snapshot historico diretamente.
-- Depois: resolve v_unidade_id e chama assert_competencia_aberta antes de
-- delegar para o helper legado _unguarded.

CREATE OR REPLACE FUNCTION public.upsert_dados_mensais(
  p_unidade_codigo character varying,
  p_ano integer,
  p_mes integer,
  p_alunos_pagantes integer DEFAULT NULL::integer,
  p_novas_matriculas integer DEFAULT NULL::integer,
  p_evasoes integer DEFAULT NULL::integer,
  p_churn_rate numeric DEFAULT NULL::numeric,
  p_ticket_medio numeric DEFAULT NULL::numeric,
  p_taxa_renovacao numeric DEFAULT NULL::numeric,
  p_tempo_permanencia integer DEFAULT NULL::integer,
  p_inadimplencia numeric DEFAULT NULL::numeric,
  p_reajuste_parcelas numeric DEFAULT NULL::numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_unidade_id uuid;
BEGIN
  SELECT id
    INTO v_unidade_id
  FROM public.unidades
  WHERE codigo = p_unidade_codigo;

  IF v_unidade_id IS NULL THEN
    RAISE EXCEPTION 'Unidade com codigo % nao encontrada.', p_unidade_codigo;
  END IF;

  PERFORM public.assert_competencia_aberta(v_unidade_id, p_ano, p_mes);

  RETURN public.upsert_dados_mensais_unguarded(
    p_unidade_codigo,
    p_ano,
    p_mes,
    p_alunos_pagantes,
    p_novas_matriculas,
    p_evasoes,
    p_churn_rate,
    p_ticket_medio,
    p_taxa_renovacao,
    p_tempo_permanencia,
    p_inadimplencia,
    p_reajuste_parcelas
  );
END;
$$;

COMMENT ON FUNCTION public.upsert_dados_mensais(
  character varying,
  integer,
  integer,
  integer,
  integer,
  integer,
  numeric,
  numeric,
  numeric,
  integer,
  numeric,
  numeric
) IS
  'Wrapper P0.0 Fase 2B: bloqueia competencia fechada antes de chamar upsert_dados_mensais_unguarded.';


-- ============================================================
-- 4. Wrapper: fechar_dados_mensais
-- ============================================================
-- Antes: a funcao legado processava Barra, Campo Grande e Recreio.
-- Depois: o wrapper faz preflight nas MESMAS unidades da funcao
-- legado/unguarded e so entao delega para fechar_dados_mensais_unguarded.
--
-- Importante:
--   - Nao tentar descobrir outra lista nova nesta fase.
--   - Lista mantida por compatibilidade: Barra, Campo Grande, Recreio.
--   - Se alguma unidade estiver fechada/retificacao_pendente,
--     assert_competencia_aberta falha explicitamente.
--   - Como o helper legado so roda depois do preflight completo, nao ha
--     fechamento parcial silencioso por competencia bloqueada.

CREATE OR REPLACE FUNCTION public.fechar_dados_mensais(
  p_ano integer,
  p_mes integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_unidade record;
BEGIN
  FOR v_unidade IN
    SELECT id, nome
    FROM public.unidades
    WHERE nome IN ('Barra', 'Campo Grande', 'Recreio')
  LOOP
    PERFORM public.assert_competencia_aberta(v_unidade.id, p_ano, p_mes);
  END LOOP;

  PERFORM public.fechar_dados_mensais_unguarded(p_ano, p_mes);
END;
$$;

COMMENT ON FUNCTION public.fechar_dados_mensais(integer, integer) IS
  'Wrapper P0.0 Fase 2B: preflight usa a mesma lista de unidades da funcao legado/unguarded antes de delegar.';


-- ============================================================
-- 5. Wrapper: snapshot_dados_mensais all-or-nothing
-- ============================================================
-- Antes: a funcao legado processava unidades ativas e podia sobrescrever
-- dados_mensais por unidade.
-- Depois:
--   - Preflight em todas as unidades ativas, mesma base da funcao legado.
--   - Se nenhuma unidade estiver bloqueada, delega para o helper legado.
--   - Se uma ou mais unidades estiverem bloqueadas, NAO chama o helper.
--   - Unidades bloqueadas retornam registros_afetados = 0.
--   - Unidades abertas puladas por causa do all-or-nothing retornam
--     registros_afetados = -1.
--   - NOTICE deixa claro que nenhuma unidade foi processada.

CREATE OR REPLACE FUNCTION public.snapshot_dados_mensais(
  p_ano integer,
  p_mes integer
)
RETURNS TABLE(unidade_nome text, registros_afetados integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_unidade record;
  v_bloqueadas integer;
BEGIN
  SELECT count(*)
    INTO v_bloqueadas
  FROM public.unidades u
  JOIN public.competencias_mensais c
    ON c.unidade_id = u.id
   AND c.ano = p_ano
   AND c.mes = p_mes
   AND c.status IN ('fechado', 'retificacao_pendente')
  WHERE u.ativo = true;

  IF COALESCE(v_bloqueadas, 0) > 0 THEN
    RAISE NOTICE
      'snapshot_dados_mensais bloqueado em modo all-or-nothing; nenhuma unidade foi processada. Motivo: competencia bloqueada em uma ou mais unidades.';

    FOR v_unidade IN
      SELECT u.id, u.nome, c.status
      FROM public.unidades u
      LEFT JOIN public.competencias_mensais c
        ON c.unidade_id = u.id
       AND c.ano = p_ano
       AND c.mes = p_mes
      WHERE u.ativo = true
      ORDER BY u.nome
    LOOP
      IF v_unidade.status IN ('fechado', 'retificacao_pendente') THEN
        BEGIN
          PERFORM public.log_competencia_bloqueio(
            v_unidade.id,
            p_ano,
            p_mes,
            'snapshot_dados_mensais',
            'snapshot_all_or_nothing_bloqueado',
            'Snapshot nao executado: competencia bloqueada em uma ou mais unidades.',
            jsonb_build_object(
              'unidade_nome', v_unidade.nome,
              'status_competencia', v_unidade.status,
              'modo', 'all_or_nothing',
              'resultado_unidade', 'bloqueada'
            )
          );
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING
            'snapshot_dados_mensais: falha ao registrar bloqueio para %: %',
            v_unidade.nome, SQLERRM;
        END;
      END IF;
    END LOOP;

    RETURN QUERY
    SELECT
      u.nome::text AS unidade_nome,
      CASE
        WHEN c.status IN ('fechado', 'retificacao_pendente') THEN 0
        ELSE -1
      END::integer AS registros_afetados
    FROM public.unidades u
    LEFT JOIN public.competencias_mensais c
      ON c.unidade_id = u.id
     AND c.ano = p_ano
     AND c.mes = p_mes
    WHERE u.ativo = true
    ORDER BY u.nome;

    RETURN;
  END IF;

  RETURN QUERY
  SELECT s.unidade_nome, s.registros_afetados
  FROM public.snapshot_dados_mensais_unguarded(p_ano, p_mes) AS s;

  RETURN;
END;
$$;

COMMENT ON FUNCTION public.snapshot_dados_mensais(integer, integer) IS
  'Wrapper P0.0 Fase 2B: snapshot all-or-nothing; se qualquer unidade ativa estiver bloqueada, nenhuma unidade e processada.';


-- ============================================================
-- 6. sync_evasao_to_dados_mensais
-- ============================================================
-- Trigger function recriada com base na definicao live inspecionada via
-- pg_get_functiondef, adicionando guard para competencia fechada.
--
-- Antes: trigger em movimentacoes_admin atualizava evasoes/churn de
-- dados_mensais retroativamente.
-- Depois:
--   - Se mes aberto/inexistente: fluxo atual segue.
--   - Se fechado/retificacao_pendente: nao altera dados_mensais.
--   - Registra bloqueio persistente.
--   - Se o log falhar, emite WARNING e permite a operacao original em
--     movimentacoes_admin.

CREATE OR REPLACE FUNCTION public.sync_evasao_to_dados_mensais()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ano int;
  v_mes int;
  v_unidade uuid;
  v_count int;
  v_pagantes int;
  v_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.tipo NOT IN ('evasao', 'nao_renovacao', 'aviso_previo') THEN
      RETURN OLD;
    END IF;

    v_ano := EXTRACT(YEAR FROM OLD.data);
    v_mes := EXTRACT(MONTH FROM OLD.data);
    v_unidade := OLD.unidade_id;
  ELSE
    IF NEW.tipo NOT IN ('evasao', 'nao_renovacao', 'aviso_previo') THEN
      RETURN NEW;
    END IF;

    v_ano := EXTRACT(YEAR FROM NEW.data);
    v_mes := EXTRACT(MONTH FROM NEW.data);
    v_unidade := NEW.unidade_id;
  END IF;

  SELECT status
    INTO v_status
  FROM public.competencias_mensais
  WHERE unidade_id = v_unidade
    AND ano = v_ano
    AND mes = v_mes;

  IF v_status IN ('fechado', 'retificacao_pendente') THEN
    BEGIN
      PERFORM public.log_competencia_bloqueio(
        v_unidade,
        v_ano,
        v_mes,
        'sync_evasao_to_dados_mensais',
        TG_OP,
        'Movimentacao retroativa requer retificacao formal; snapshot fechado nao foi alterado.',
        jsonb_build_object(
          'status_competencia', v_status,
          'movimentacao_id', CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
          'tipo', CASE WHEN TG_OP = 'DELETE' THEN OLD.tipo ELSE NEW.tipo END,
          'aluno_nome', CASE WHEN TG_OP = 'DELETE' THEN OLD.aluno_nome ELSE NEW.aluno_nome END,
          'data', CASE WHEN TG_OP = 'DELETE' THEN OLD.data ELSE NEW.data END
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING
        'Falha ao registrar bloqueio de sync_evasao_to_dados_mensais: %',
        SQLERRM;
    END;

    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.movimentacoes_admin
  WHERE unidade_id = v_unidade
    AND tipo IN ('evasao', 'nao_renovacao')
    AND EXTRACT(YEAR FROM data) = v_ano
    AND EXTRACT(MONTH FROM data) = v_mes;

  SELECT alunos_pagantes INTO v_pagantes
  FROM public.dados_mensais
  WHERE unidade_id = v_unidade
    AND ((ano = v_ano AND mes = v_mes - 1) OR (ano = v_ano - 1 AND mes = 12 AND v_mes = 1))
  LIMIT 1;

  UPDATE public.dados_mensais
  SET evasoes = v_count,
      churn_rate = CASE
        WHEN COALESCE(v_pagantes, 0) > 0 THEN ROUND((v_count::numeric / v_pagantes) * 100, 2)
        ELSE 0
      END,
      updated_at = NOW()
  WHERE unidade_id = v_unidade
    AND ano = v_ano
    AND mes = v_mes;

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.sync_evasao_to_dados_mensais() IS
  'P0.0 Fase 2B: trigger sync evasao nao altera dados_mensais quando competencia esta fechada ou em retificacao_pendente.';

COMMIT;
