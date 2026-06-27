-- Restaura o preenchimento automatico de data_dia na fila de relatorios.
--
-- Contexto (incidente 2026-06-27): a coluna data_dia e NOT NULL sem default.
-- O INSERT da edge function relatorio-admin-whatsapp (processarCron) nunca
-- preencheu data_dia explicitamente — sempre dependeu do DEFAULT da coluna.
-- O default foi removido em algum momento entre 2026-06-26 23h UTC (ultimo
-- relatorio enfileirado com sucesso) e 2026-06-27 19h UTC, fazendo todos os
-- INSERTs do cron de sabado falharem com:
--   null value in column "data_dia" violates not-null constraint
-- Resultado: 0 relatorios na fila, nenhum relatorio enviado.
--
-- Esta migration espelha o fix ja aplicado em producao via MCP
-- (apply_migration "fila_relatorios_data_dia_default_brt").
ALTER TABLE public.fila_relatorios_whatsapp
  ALTER COLUMN data_dia SET DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date;
