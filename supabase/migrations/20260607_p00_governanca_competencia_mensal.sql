-- ============================================================
-- P0.0 - Governanca de competencia mensal / dados_mensais
-- LA Performance Report
--
-- Status deste arquivo:
--   - Arquivo executavel quando houver APPROVE explicito do Alf.
--   - NAO foi executado por este agente.
--   - Fase 1 altera schema e executa UPDATE de migracao em
--     dados_mensais_retificacoes para marcar legado como aplicada.
--     Nao faz fechamento/backfill/recalculo/KPI.
--   - Fase 2+ contem blocos comentados para rollout posterior.
--   - Nao executar sem APPROVE explicito do Alf.
--
-- Decisoes aprovadas:
--   - dados_mensais = snapshot historico.
--   - competencias_mensais = governanca/fechamento.
--   - dados_mensais_retificacoes = fluxo formal de retificacao.
--   - Cada unidade tem uma linha propria por ano/mes.
--   - fechamento_lote_id agrupa unidades fechadas na mesma janela.
--   - fechado_por e text operacional em P0.0.
--   - Status P0.0: aberto, fechado, retificacao_pendente.
--   - Piloto tecnico: Campo Grande / Maio 2026.
--   - Nao fechar Jun/2026.
--   - Nao fazer backfill.
--   - Nao recalcular dados_mensais.
--   - Nao alterar KPI live ou views.
--
-- Antes de executar qualquer fase:
--   1. Revisar este arquivo.
--   2. Confirmar cron legado ausente/inativo.
--   3. Confirmar assinaturas reais das funcoes escritoras.
--   4. Validar snapshot CG/Maio 2026.
-- ============================================================

BEGIN;

-- ============================================================
-- FASE 1 - Estrutura sem comportamento destrutivo
-- ============================================================

-- ------------------------------------------------------------
-- 1. competencias_mensais
-- ------------------------------------------------------------
-- Uma linha por unidade/ano/mes.
-- Fechamento operacional real das 3 unidades deve compartilhar
-- o mesmo fechamento_lote_id.
-- No piloto tecnico, Campo Grande / Maio 2026 pode usar lote
-- proprio sem fechar as demais unidades.

CREATE TABLE IF NOT EXISTS public.competencias_mensais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  unidade_id uuid NOT NULL REFERENCES public.unidades(id),
  ano integer NOT NULL,
  mes integer NOT NULL CHECK (mes BETWEEN 1 AND 12),

  status text NOT NULL DEFAULT 'aberto'
    CHECK (status IN ('aberto', 'fechado', 'retificacao_pendente')),

  fechamento_lote_id uuid,
  fechado_em timestamptz,
  fechado_por text,
  motivo text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT competencias_mensais_unidade_ano_mes_key
    UNIQUE (unidade_id, ano, mes),

  CONSTRAINT competencias_mensais_fechamento_campos_chk
    CHECK (
      status = 'aberto'
      OR (fechado_em IS NOT NULL AND fechado_por IS NOT NULL)
    )
);

COMMENT ON TABLE public.competencias_mensais IS
  'Governanca de fechamento mensal por unidade/ano/mes. dados_mensais continua sendo o snapshot historico.';

COMMENT ON COLUMN public.competencias_mensais.fechamento_lote_id IS
  'UUID compartilhado pelas unidades fechadas na mesma janela operacional.';

COMMENT ON COLUMN public.competencias_mensais.fechado_por IS
  'Texto/e-mail operacional em P0.0. Pode evoluir para FK/user_id no futuro.';

CREATE INDEX IF NOT EXISTS idx_competencias_mensais_lookup
  ON public.competencias_mensais (unidade_id, ano, mes, status);

CREATE INDEX IF NOT EXISTS idx_competencias_mensais_lote
  ON public.competencias_mensais (fechamento_lote_id)
  WHERE fechamento_lote_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_competencias_mensais_status
  ON public.competencias_mensais (ano, mes, status);

-- RLS intentionally not enabled in Fase 1.
-- Do not depend on public.is_admin() until it is confirmed in the real DB.
GRANT SELECT ON public.competencias_mensais TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competencias_mensais TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competencias_mensais TO postgres;


-- ------------------------------------------------------------
-- 2. Evolucao de dados_mensais_retificacoes
-- ------------------------------------------------------------
-- A tabela ja existe e nao deve ser recriada.
-- P0.0 adiciona status/rollback/aplicacao formal.
-- Snapshot completo antes/depois continua armazenado nas colunas existentes.
-- UI deve exibir apenas diff dos campos alterados.
--
-- Importante:
-- Ja existem retificacoes historicas que foram aplicadas. Por isso status
-- nao pode entrar com DEFAULT 'solicitada' direto. A coluna entra nullable,
-- o legado e marcado como 'aplicada', e so depois recebe DEFAULT/NOT NULL/CHECK.

ALTER TABLE public.dados_mensais_retificacoes
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS rollback_de uuid
    REFERENCES public.dados_mensais_retificacoes(id),
  ADD COLUMN IF NOT EXISTS aplicada_em timestamptz,
  ADD COLUMN IF NOT EXISTS aplicada_por text;

UPDATE public.dados_mensais_retificacoes
SET status = 'aplicada'
WHERE status IS NULL;

ALTER TABLE public.dados_mensais_retificacoes
  ALTER COLUMN status SET DEFAULT 'solicitada',
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.dados_mensais_retificacoes
  DROP CONSTRAINT IF EXISTS dados_mensais_retificacoes_status_chk,
  ADD CONSTRAINT dados_mensais_retificacoes_status_chk
    CHECK (status IN (
      'solicitada',
      'aprovada',
      'aplicada',
      'rejeitada',
      'rollback_aplicado'
    ));

COMMENT ON COLUMN public.dados_mensais_retificacoes.status IS
  'Estado formal da retificacao. P0.0 permite autoaprovacao pelo Alf/admin master.';

COMMENT ON COLUMN public.dados_mensais_retificacoes.rollback_de IS
  'Referencia a retificacao original quando uma nova retificacao funciona como rollback.';

COMMENT ON COLUMN public.dados_mensais_retificacoes.aplicada_por IS
  'Texto/e-mail operacional de quem aplicou a retificacao em P0.0.';

CREATE INDEX IF NOT EXISTS idx_dados_mensais_retificacoes_status
  ON public.dados_mensais_retificacoes (status, ano, mes, unidade_id);

CREATE INDEX IF NOT EXISTS idx_dados_mensais_retificacoes_rollback_de
  ON public.dados_mensais_retificacoes (rollback_de)
  WHERE rollback_de IS NOT NULL;


-- ------------------------------------------------------------
-- 3. Log persistente de bloqueios/pendencias
-- ------------------------------------------------------------
-- Usado quando uma rotina tenta alterar dados_mensais de competencia
-- fechada ou em retificacao_pendente.
-- Especialmente importante para sync_evasao_to_dados_mensais:
-- a operacao em movimentacoes_admin nao deve falhar, mas o snapshot
-- fechado nao pode ser alterado.

CREATE TABLE IF NOT EXISTS public.competencias_bloqueios_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  unidade_id uuid NOT NULL REFERENCES public.unidades(id),
  ano integer NOT NULL,
  mes integer NOT NULL CHECK (mes BETWEEN 1 AND 12),

  origem text NOT NULL,
  operacao text NOT NULL,
  motivo text NOT NULL,
  payload jsonb,

  resolvido boolean NOT NULL DEFAULT false,
  resolvido_em timestamptz,
  resolvido_por text,

  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.competencias_bloqueios_log IS
  'Log persistente de tentativas bloqueadas ou pendencias de retificacao em competencias fechadas.';

CREATE INDEX IF NOT EXISTS idx_competencias_bloqueios_log_lookup
  ON public.competencias_bloqueios_log (unidade_id, ano, mes, resolvido, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_competencias_bloqueios_log_origem
  ON public.competencias_bloqueios_log (origem, operacao, created_at DESC);

GRANT SELECT ON public.competencias_bloqueios_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competencias_bloqueios_log TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competencias_bloqueios_log TO postgres;


-- ------------------------------------------------------------
-- 4. Guarda unica
-- ------------------------------------------------------------
-- SECURITY DEFINER sempre com search_path fixo.
-- Linha inexistente em competencias_mensais significa "aberto" em P0.0.

CREATE OR REPLACE FUNCTION public.assert_competencia_aberta(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
  v_unidade_nome text;
BEGIN
  SELECT status
    INTO v_status
  FROM public.competencias_mensais
  WHERE unidade_id = p_unidade_id
    AND ano = p_ano
    AND mes = p_mes;

  IF v_status IS NULL OR v_status = 'aberto' THEN
    RETURN;
  END IF;

  IF v_status IN ('fechado', 'retificacao_pendente') THEN
    SELECT nome
      INTO v_unidade_nome
    FROM public.unidades
    WHERE id = p_unidade_id;

    RAISE EXCEPTION
      'Competencia bloqueada: unidade %, ano %, mes %, status %. Use retificacao formal.',
      COALESCE(v_unidade_nome, p_unidade_id::text),
      p_ano,
      p_mes,
      v_status;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.assert_competencia_aberta(uuid, integer, integer) IS
  'Guarda unica para impedir escrita direta em dados_mensais quando competencia estiver fechada ou com retificacao pendente.';

REVOKE ALL ON FUNCTION public.assert_competencia_aberta(uuid, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_competencia_aberta(uuid, integer, integer)
  TO service_role, postgres;


-- ------------------------------------------------------------
-- 5. Helper de log sem bloquear a operacao principal
-- ------------------------------------------------------------
-- Pode ser usado por trigger functions como sync_evasao_to_dados_mensais.

CREATE OR REPLACE FUNCTION public.log_competencia_bloqueio(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_origem text,
  p_operacao text,
  p_motivo text,
  p_payload jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.competencias_bloqueios_log (
    unidade_id,
    ano,
    mes,
    origem,
    operacao,
    motivo,
    payload
  )
  VALUES (
    p_unidade_id,
    p_ano,
    p_mes,
    p_origem,
    p_operacao,
    p_motivo,
    p_payload
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.log_competencia_bloqueio(uuid, integer, integer, text, text, text, jsonb) IS
  'Registra bloqueio/pendencia persistente sem alterar o snapshot fechado.';

REVOKE ALL ON FUNCTION public.log_competencia_bloqueio(uuid, integer, integer, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_competencia_bloqueio(uuid, integer, integer, text, text, text, jsonb)
  TO service_role, postgres;


-- ------------------------------------------------------------
-- 6. Funcao futura de fechamento de uma unidade
-- ------------------------------------------------------------
-- Incluida na Fase 1 para revisao/uso controlado posterior.
-- Nao fecha nenhuma competencia automaticamente.
-- Nao chamar para Jun/2026.

CREATE OR REPLACE FUNCTION public.fechar_competencia(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_fechado_por text,
  p_motivo text DEFAULT 'Fechamento mensal regular',
  p_lote_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_snap record;
  v_lote_id uuid;
  v_result jsonb;
  v_status_atual text;
  v_lote_existente uuid;
BEGIN
  IF p_fechado_por IS NULL OR btrim(p_fechado_por) = '' THEN
    RAISE EXCEPTION 'fechado_por e obrigatorio';
  END IF;

  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'motivo e obrigatorio';
  END IF;

  IF p_ano = EXTRACT(YEAR FROM CURRENT_DATE)::int
     AND p_mes = EXTRACT(MONTH FROM CURRENT_DATE)::int THEN
    RAISE EXCEPTION 'Nao e permitido fechar o mes atual: ano %, mes %', p_ano, p_mes;
  END IF;

  -- Verificar estado atual antes de consultar/validar dados_mensais.
  SELECT status, fechamento_lote_id
    INTO v_status_atual, v_lote_existente
  FROM public.competencias_mensais
  WHERE unidade_id = p_unidade_id
    AND ano = p_ano
    AND mes = p_mes;

  -- Ja fechada: nao alterar nada nem reler snapshot.
  IF v_status_atual = 'fechado' THEN
    RAISE NOTICE
      'Competencia ja fechada: unidade %, ano %, mes %. Nenhuma alteracao feita.',
      p_unidade_id, p_ano, p_mes;
    RETURN jsonb_build_object(
      'status', 'fechado',
      'unidade_id', p_unidade_id,
      'ano', p_ano,
      'mes', p_mes,
      'fechamento_lote_id', v_lote_existente,
      'aviso', 'ja_fechada_sem_alteracao'
    );
  END IF;

  -- Retificacao em andamento: bloquear ate resolucao formal.
  IF v_status_atual = 'retificacao_pendente' THEN
    RAISE EXCEPTION
      'Competencia com retificacao pendente: unidade %, ano %, mes %. Resolva a retificacao antes de fechar novamente.',
      p_unidade_id, p_ano, p_mes;
  END IF;

  -- Status aberto ou linha inexistente: validar snapshot e fechar.
  SELECT
    id,
    alunos_pagantes,
    alunos_ativos,
    ticket_medio,
    faturamento_estimado,
    evasoes,
    churn_rate,
    inadimplencia
  INTO v_snap
  FROM public.dados_mensais
  WHERE unidade_id = p_unidade_id
    AND ano = p_ano
    AND mes = p_mes;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Snapshot ausente em dados_mensais: unidade %, ano %, mes %',
      p_unidade_id, p_ano, p_mes;
  END IF;

  IF COALESCE(v_snap.alunos_pagantes, 0) <= 0 THEN
    RAISE EXCEPTION 'Snapshot invalido: alunos_pagantes deve ser > 0';
  END IF;

  IF v_snap.alunos_ativos IS NULL THEN
    RAISE EXCEPTION 'Snapshot invalido: alunos_ativos nao pode ser NULL';
  END IF;

  IF v_snap.alunos_ativos < v_snap.alunos_pagantes THEN
    RAISE EXCEPTION 'Snapshot invalido: alunos_ativos (%) < alunos_pagantes (%)',
      v_snap.alunos_ativos,
      v_snap.alunos_pagantes;
  END IF;

  IF COALESCE(v_snap.ticket_medio, 0) <= 0 THEN
    RAISE EXCEPTION 'Snapshot invalido: ticket_medio deve ser > 0';
  END IF;

  IF COALESCE(v_snap.faturamento_estimado, 0) <= 0 THEN
    RAISE EXCEPTION 'Snapshot invalido: faturamento_estimado/MRR deve ser > 0';
  END IF;

  IF v_snap.evasoes IS NULL THEN
    RAISE EXCEPTION 'Snapshot invalido: evasoes nao pode ser NULL';
  END IF;

  IF v_snap.churn_rate IS NULL THEN
    RAISE EXCEPTION 'Snapshot invalido: churn_rate nao pode ser NULL';
  END IF;

  -- inadimplencia = 0 e legitimo; NULL nao e.
  IF v_snap.inadimplencia IS NULL THEN
    RAISE EXCEPTION 'Snapshot invalido: inadimplencia nao pode ser NULL';
  END IF;

  v_lote_id := COALESCE(p_lote_id, gen_random_uuid());

  INSERT INTO public.competencias_mensais (
    unidade_id,
    ano,
    mes,
    status,
    fechamento_lote_id,
    fechado_em,
    fechado_por,
    motivo
  )
  VALUES (
    p_unidade_id,
    p_ano,
    p_mes,
    'fechado',
    v_lote_id,
    now(),
    p_fechado_por,
    p_motivo
  )
  ON CONFLICT (unidade_id, ano, mes) DO UPDATE SET
    status             = 'fechado',
    fechamento_lote_id = EXCLUDED.fechamento_lote_id,
    fechado_em         = now(),
    fechado_por        = EXCLUDED.fechado_por,
    motivo             = EXCLUDED.motivo,
    updated_at         = now()
  WHERE competencias_mensais.status = 'aberto';

  SELECT fechamento_lote_id
    INTO v_lote_existente
  FROM public.competencias_mensais
  WHERE unidade_id = p_unidade_id
    AND ano = p_ano
    AND mes = p_mes;

  v_result := jsonb_build_object(
    'status', 'fechado',
    'unidade_id', p_unidade_id,
    'ano', p_ano,
    'mes', p_mes,
    'fechamento_lote_id', v_lote_existente,
    'fechado_por', p_fechado_por
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.fechar_competencia(uuid, integer, integer, text, text, uuid) IS
  'Fecha uma competencia apos validar snapshot. Em fechamento operacional real, chamar as 3 unidades com o mesmo fechamento_lote_id.';

REVOKE ALL ON FUNCTION public.fechar_competencia(uuid, integer, integer, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fechar_competencia(uuid, integer, integer, text, text, uuid)
  TO service_role, postgres;


COMMIT;


-- ============================================================
-- FASE 2 - Guards nos writers existentes
-- ============================================================
-- NAO executar nesta Fase 1.
-- Estes blocos devem virar uma migration separada depois de validar
-- o impacto operacional e preparar o frontend/admin.
-- Os snippets de guards abaixo sao fragmentos a inserir nas funcoes
-- existentes; nao sao SQL standalone.

/*
-- ------------------------------------------------------------
-- 0. REVOKE/GRANT para escritores legados
-- ------------------------------------------------------------
-- Decisao:
--   - fechar_dados_mensais e snapshot_dados_mensais ficam apenas backend.
--   - recalcular_dados_mensais vira operacao administrativa.
--   - upsert_dados_mensais vira backend/admin controlado.
--
-- Observacao:
--   Revogar apenas de anon nao basta quando ha GRANT para PUBLIC.
--   Por isso o REVOKE inclui PUBLIC, anon e authenticated.
--   Service_role/postgres permanecem para operacao controlada.
--
-- Importante:
--   Nao aplicar este bloco antes de adaptar o fluxo administrativo,
--   pois recalcular_dados_mensais ainda e chamado pelo frontend atual.

REVOKE EXECUTE ON FUNCTION public.fechar_dados_mensais(integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fechar_dados_mensais(integer, integer)
  TO service_role, postgres;

REVOKE EXECUTE ON FUNCTION public.snapshot_dados_mensais(integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.snapshot_dados_mensais(integer, integer)
  TO service_role, postgres;

REVOKE EXECUTE ON FUNCTION public.recalcular_dados_mensais(integer, integer, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalcular_dados_mensais(integer, integer, uuid)
  TO service_role, postgres;

REVOKE EXECUTE ON FUNCTION public.upsert_dados_mensais(
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
GRANT EXECUTE ON FUNCTION public.upsert_dados_mensais(
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

-- Trigger function: revogar chamada direta por usuarios.
-- A execucao via trigger do PostgreSQL continua funcionando.
REVOKE EXECUTE ON FUNCTION public.sync_evasao_to_dados_mensais()
  FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- Guards nos writers existentes
-- ------------------------------------------------------------
-- Fragmentos de corpo de funcao. Inserir nos pontos indicados dentro
-- das funcoes existentes; nao executar como SQL standalone.

-- 1. recalcular_dados_mensais
-- Adicionar no inicio do corpo, apos calcular/validar parametros:
PERFORM public.assert_competencia_aberta(p_unidade_id, p_ano, p_mes);

-- 2. upsert_dados_mensais
-- Adicionar depois de resolver v_unidade_id:
PERFORM public.assert_competencia_aberta(v_unidade_id, p_ano, p_mes);

-- 3. fechar_dados_mensais
-- Dentro do loop de unidades, antes do INSERT/ON CONFLICT:
PERFORM public.assert_competencia_aberta(v_unidade.id, p_ano, p_mes);

-- 4. snapshot_dados_mensais
-- Se unidade estiver fechada, nao escrever silenciosamente.
-- Registrar log e retornar/emitir resultado explicito.
IF EXISTS (
  SELECT 1
  FROM public.competencias_mensais
  WHERE unidade_id = v_unidade.id
    AND ano = p_ano
    AND mes = p_mes
    AND status IN ('fechado', 'retificacao_pendente')
) THEN
  PERFORM public.log_competencia_bloqueio(
    v_unidade.id,
    p_ano,
    p_mes,
    'snapshot_dados_mensais',
    'pulada_competencia_fechada',
    'Snapshot nao atualizado porque a competencia esta bloqueada.',
    jsonb_build_object('unidade_nome', v_unidade.nome)
  );
  CONTINUE;
END IF;

-- 5. sync_evasao_to_dados_mensais
-- Regra obrigatoria:
--   - movimentacoes_admin nao falha.
--   - dados_mensais fechado nao e alterado.
--   - log persistente e criado.
--   - se o log falhar, a trigger nao aborta movimentacoes_admin.
IF EXISTS (
  SELECT 1
  FROM public.competencias_mensais
  WHERE unidade_id = v_unidade
    AND ano = v_ano
    AND mes = v_mes
    AND status IN ('fechado', 'retificacao_pendente')
) THEN
  BEGIN
    PERFORM public.log_competencia_bloqueio(
      v_unidade,
      v_ano,
      v_mes,
      'sync_evasao_to_dados_mensais',
      TG_OP,
      'Movimentacao retroativa requer retificacao formal; snapshot fechado nao foi alterado.',
      jsonb_build_object(
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
*/


-- ============================================================
-- FASE 3 - Frontend / UX
-- ============================================================
-- NAO executar neste SQL.
-- Alteracao futura permitida apenas na UX do botao de fechamento/recalculo,
-- sem mexer em KPI live, views ou regras de indicador.

/*
-- AlunosPage.tsx e TabGestao.tsx:
-- 1. Consultar competencias_mensais por unidade/ano/mes.
-- 2. Se status in ('fechado', 'retificacao_pendente'):
--      - desabilitar "Recalcular";
--      - mostrar mensagem: "Competencia fechada. Use retificacao formal.";
-- 3. Se status ausente ou 'aberto':
--      - permitir fluxo preliminar conforme regra administrativa;
--      - alvo futuro: preview antes de aplicar.
*/


-- ============================================================
-- FASE 4 - Trigger hard em dados_mensais
-- ============================================================
-- NAO executar antes do piloto e da estabilizacao dos writers.

/*
CREATE OR REPLACE FUNCTION public.travar_dados_mensais_fechados()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.assert_competencia_aberta(
    COALESCE(NEW.unidade_id, OLD.unidade_id),
    COALESCE(NEW.ano, OLD.ano),
    COALESCE(NEW.mes, OLD.mes)
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_travar_dados_mensais_fechados
BEFORE UPDATE OR DELETE ON public.dados_mensais
FOR EACH ROW
EXECUTE FUNCTION public.travar_dados_mensais_fechados();
*/


-- ============================================================
-- FASE 5 - Piloto tecnico CG / Maio 2026
-- ============================================================
-- NAO executar nesta migration.
-- Nao usar Jun/2026.
-- Nao usar 2025.
-- O piloto CG/Maio 2026 NAO pode rodar antes da Fase 2
-- estar ativa com guards nos writers existentes.

/*
-- 1. Confirmar snapshot CG/Maio 2026.
SELECT
  u.nome,
  d.ano,
  d.mes,
  d.alunos_pagantes,
  d.alunos_ativos,
  d.ticket_medio,
  d.faturamento_estimado,
  d.evasoes,
  d.churn_rate,
  d.inadimplencia
FROM public.dados_mensais d
JOIN public.unidades u ON u.id = d.unidade_id
WHERE u.nome = 'Campo Grande'
  AND d.ano = 2026
  AND d.mes = 5;

-- 2. Piloto tecnico: fechar somente Campo Grande / Maio 2026.
--    Isto testa trava, audit log e rollback tecnico.
--    Nao e fechamento operacional completo das 3 unidades.
SELECT public.fechar_competencia(
  (SELECT id FROM public.unidades WHERE nome = 'Campo Grande'),
  2026,
  5,
  'lucianoalf.la@gmail.com',
  'Piloto P0.0 - teste de trava, audit log e rollback',
  NULL
);

-- 3. Confirmar fechamento.
SELECT *
FROM public.competencias_mensais
WHERE unidade_id = (SELECT id FROM public.unidades WHERE nome = 'Campo Grande')
  AND ano = 2026
  AND mes = 5;
*/


-- ============================================================
-- CHECKLIST SELECT-only antes de executar Fase 1
-- ============================================================

/*
-- 1. Cron legado ausente/inativo.
SELECT jobid, jobname, schedule, command, active
FROM cron.job
WHERE jobname = 'snapshot_dados_mensais_mensal'
   OR command ILIKE '%snapshot_dados_mensais%'
   OR command ILIKE '%dados_mensais%';

-- 2. Tabelas de governanca ainda ausentes.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'competencias_mensais',
    'competencias_bloqueios_log'
  );

-- 3. Estrutura atual de dados_mensais_retificacoes.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'dados_mensais_retificacoes'
ORDER BY ordinal_position;

-- 4. Assinaturas reais das funcoes escritoras.
SELECT p.proname, pg_get_function_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'fechar_dados_mensais',
    'snapshot_dados_mensais',
    'recalcular_dados_mensais',
    'upsert_dados_mensais',
    'sync_evasao_to_dados_mensais'
  )
ORDER BY p.proname;

-- 5. Permissoes atuais das funcoes escritoras.
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE specific_schema = 'public'
  AND routine_name IN (
    'fechar_dados_mensais',
    'snapshot_dados_mensais',
    'recalcular_dados_mensais',
    'upsert_dados_mensais',
    'sync_evasao_to_dados_mensais'
  )
ORDER BY routine_name, grantee;

-- 6. public.is_admin() deve ser apenas inspecionado.
--    Nao usar em RLS/funcoes enquanto nao estiver validado.
SELECT n.nspname, p.proname, pg_get_function_arguments(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'is_admin';

-- 7. Snapshot do piloto CG/Maio 2026.
SELECT
  u.nome,
  d.alunos_pagantes,
  d.alunos_ativos,
  d.ticket_medio,
  d.faturamento_estimado,
  d.evasoes,
  d.churn_rate,
  d.inadimplencia
FROM public.dados_mensais d
JOIN public.unidades u ON u.id = d.unidade_id
WHERE u.nome = 'Campo Grande'
  AND d.ano = 2026
  AND d.mes = 5;
*/


-- ============================================================
-- CHECKLIST depois de executar Fase 1
-- ============================================================

/*
-- 1. Confirmar tabelas.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'competencias_mensais',
    'competencias_bloqueios_log',
    'dados_mensais_retificacoes'
  )
ORDER BY table_name;

-- 2. Confirmar colunas novas em retificacoes.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'dados_mensais_retificacoes'
  AND column_name IN ('status', 'rollback_de', 'aplicada_em', 'aplicada_por')
ORDER BY column_name;

-- 3. Confirmar funcoes novas.
SELECT p.proname, pg_get_function_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'assert_competencia_aberta',
    'log_competencia_bloqueio',
    'fechar_competencia'
  )
ORDER BY p.proname;

-- 4. Confirmar que Jun/2026 nao foi fechado.
SELECT *
FROM public.competencias_mensais
WHERE ano = 2026
  AND mes = 6;

-- 5. Confirmar que dados_mensais nao recebeu backfill/recalculo por esta migration.
--    Deve ser comparado com snapshot/audit antes da execucao.
SELECT *
FROM public.audit_log
WHERE tabela = 'dados_mensais'
  AND created_at >= now() - interval '10 minutes'
ORDER BY created_at DESC;
*/


-- ============================================================
-- ROLLBACK Fase 1
-- ============================================================
-- Usar somente se a Fase 1 for aplicada e precisar ser revertida
-- antes de usar qualquer funcao nova em producao.

/*
BEGIN;

REVOKE ALL ON FUNCTION public.fechar_competencia(uuid, integer, integer, text, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role, postgres;
DROP FUNCTION IF EXISTS public.fechar_competencia(uuid, integer, integer, text, text, uuid);

REVOKE ALL ON FUNCTION public.log_competencia_bloqueio(uuid, integer, integer, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role, postgres;
DROP FUNCTION IF EXISTS public.log_competencia_bloqueio(uuid, integer, integer, text, text, text, jsonb);

REVOKE ALL ON FUNCTION public.assert_competencia_aberta(uuid, integer, integer)
  FROM PUBLIC, anon, authenticated, service_role, postgres;
DROP FUNCTION IF EXISTS public.assert_competencia_aberta(uuid, integer, integer);

DROP TABLE IF EXISTS public.competencias_bloqueios_log;
DROP TABLE IF EXISTS public.competencias_mensais;

ALTER TABLE public.dados_mensais_retificacoes
  DROP COLUMN IF EXISTS aplicada_por,
  DROP COLUMN IF EXISTS aplicada_em,
  DROP COLUMN IF EXISTS rollback_de,
  DROP COLUMN IF EXISTS status;

-- Se os REVOKE/GRANT de writers legados foram aplicados, restaurar
-- conforme permissao anterior validada em routine_privileges.
-- Nao restaurar PUBLIC/anon automaticamente sem decisao do Alf.

COMMIT;
*/


-- ============================================================
-- RISCOS RESIDUAIS
-- ============================================================
-- 1. Revoke de recalcular_dados_mensais quebra botoes atuais ate
--    existir fluxo admin/service_role ou UX ajustada.
-- 2. Fase 1 cria fechar_competencia, mas nao deve ser chamada para
--    Jun/2026 nem antes do piloto aprovado.
-- 3. Fase 1 nao altera sync_evasao_to_dados_mensais; o risco de
--    reescrita historica so fecha na Fase 2.
-- 4. Trigger hard em dados_mensais nao entra aqui; fica para Fase 4.
-- 5. RLS nao usa public.is_admin() ate validacao real.
-- 6. Fechamento operacional das 3 unidades exige orquestracao
--    transacional/lote para evitar fechamento parcial.
