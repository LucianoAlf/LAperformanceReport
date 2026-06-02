-- =============================================================================
-- MIGRACAO_FASE1_NEUTRALIZAR_CRON_SNAPSHOT_DADOS_MENSAIS.sql
--
-- FASE 1 — CONTENÇÃO DE SANGRAMENTO
--
-- OBJETIVO
--   Neutralizar o job automático legado `snapshot_dados_mensais_mensal`
--   para impedir que a função `snapshot_dados_mensais(...)` continue
--   sobrescrevendo `dados_mensais` com regra antiga/incompatível.
--
-- IMPORTANTE
--   - Modo proposta: NÃO executar sem aprovação explícita.
--   - Esta migration NÃO recalcula dados.
--   - Esta migration NÃO altera linhas de `dados_mensais`.
--   - Esta migration NÃO apaga a função `snapshot_dados_mensais`.
--   - Esta migration apenas neutraliza o chamador automático via pg_cron.
--
-- PROBLEMA QUE ELA CONTÉM
--   - Existe um cron `snapshot_dados_mensais_mensal` agendado para `0 3 1 * *`.
--   - Esse job chama `snapshot_dados_mensais(...)`.
--   - A função usa regra antiga/incompatível e sobrescreve `dados_mensais`.
--   - Isso já contaminou o histórico de Campo Grande / Maio 2026 às 03:00.
--
-- ESTRATÉGIA
--   - Desagendar o job automático.
--   - Preservar a função para revisão posterior.
--   - Preservar rollback pronto para recriar exatamente o job legado.
-- =============================================================================


-- =============================================================================
-- BLOCO 1) PRE-CHECK
--
-- Execute estes SELECTs antes da migration para registrar:
--   - estado atual do job no pg_cron
--   - estado atual do snapshot de CG / Maio 2026 em dados_mensais
-- =============================================================================
SELECT
  jobid,
  jobname,
  schedule,
  command,
  active
FROM cron.job
WHERE jobname = 'snapshot_dados_mensais_mensal';

SELECT
  id,
  unidade_id,
  ano,
  mes,
  alunos_ativos,
  alunos_pagantes,
  matriculas_ativas,
  matriculas_banda,
  matriculas_2_curso,
  novas_matriculas,
  evasoes,
  churn_rate,
  ticket_medio,
  updated_at
FROM dados_mensais
WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
  AND ano = 2026
  AND mes = 5;


-- =============================================================================
-- BLOCO 2) MIGRATION
--
-- Apenas neutraliza o chamador automático legado.
--
-- Efeito esperado:
--   - Remove apenas o job do pg_cron.
--   - Não altera a função `snapshot_dados_mensais`.
--   - Não altera dados históricos já gravados.
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'snapshot_dados_mensais_mensal'
  ) THEN
    PERFORM cron.unschedule('snapshot_dados_mensais_mensal');
  END IF;
END $$;


-- =============================================================================
-- BLOCO 3) POST-CHECK
--
-- Resultado esperado:
--   - zero linhas para o job `snapshot_dados_mensais_mensal`
--   - confirmação de que a neutralização foi apenas no agendamento
--   - confirmação de que CG / Maio 2026 permaneceu idêntico
-- =============================================================================
SELECT
  jobid,
  jobname,
  schedule,
  command,
  active
FROM cron.job
WHERE jobname = 'snapshot_dados_mensais_mensal';

SELECT
  id,
  unidade_id,
  ano,
  mes,
  alunos_ativos,
  alunos_pagantes,
  matriculas_ativas,
  matriculas_banda,
  matriculas_2_curso,
  novas_matriculas,
  evasoes,
  churn_rate,
  ticket_medio,
  updated_at
FROM dados_mensais
WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
  AND ano = 2026
  AND mes = 5;


-- =============================================================================
-- BLOCO 4) ROLLBACK — RECRIAR EXATAMENTE O JOB LEGADO
--
-- Use apenas se for necessário restaurar o comportamento anterior.
-- Este rollback recria o job com o mesmo nome, schedule e comando.
-- =============================================================================
-- SELECT cron.schedule(
--   'snapshot_dados_mensais_mensal',
--   '0 3 1 * *',
--   $cron$
--     SELECT snapshot_dados_mensais(
--       EXTRACT(YEAR FROM (CURRENT_DATE - INTERVAL '1 day'))::INTEGER,
--       EXTRACT(MONTH FROM (CURRENT_DATE - INTERVAL '1 day'))::INTEGER
--     );
--   $cron$
-- );


-- =============================================================================
-- CHECKLIST DE VALIDAÇÃO HUMANA
--
-- [ ] O SELECT inicial mostrava o job `snapshot_dados_mensais_mensal`
-- [ ] O DO $$ ... $$ executou sem erro
-- [ ] O SELECT final voltou vazio para esse job
-- [ ] O SELECT em `dados_mensais` retornou os mesmos valores de antes
-- [ ] Nenhum recálculo foi executado
-- [ ] Nenhuma função foi apagada ou alterada
-- =============================================================================
