-- FASE 2 da LAPE-43: constroi a tabela deduplicada AO LADO. Nao apaga, nao troca, nao
-- altera `sync_run_items`. Rollback = `drop table sync_run_items_dedup`.
--
-- CONTEXTO (medido em 23/09/2026):
--   sync_run_items = 8.474.624 linhas / 12,4 GB (8 GB heap + 4,4 GB indices) = 60% do banco.
--   Guarda uma FOTO COMPLETA de cada fatura a CADA run. 7.740+ runs para 13.592 faturas
--   distintas -> cada fatura refotografada ~622x. Exemplo real: a fatura 0ac6d6bc (Parcela
--   07/2026 Power Kids, R$ 447, paga em 20/07) foi gravada 1.366 vezes para registrar
--   2 estados. Sem retencao: ~257 mil linhas/dia, >100 GB em um ano.
--
-- POR QUE DEDUP POR CONTEUDO E NAO POR IDADE:
--   Retencao por janela descarta a versao antiga de uma fatura que mudou de estado fora da
--   janela -- justamente a TRANSICAO, que e' a informacao com valor. Dedup por conteudo
--   preserva todas as transicoes E corta mais: 20.890 linhas contra 489.221 da janela de 1 dia.
--
-- AS 4 PROVAS (fase 1, read-only, todas passaram):
--   1. linhas do ultimo run por competencia que sobrevivem: 13.603 de 13.603
--   2. EXCEPT sobre essas linhas: 0 sumiriam
--   3. resolver_reconciliacao_fatura (a unica que NAO filtra por run_id, usa
--      `order by created_at desc limit 1`): 13.593 pares (unidade,fatura), 0 sumiriam
--   4. baseline das funcoes capturado e validado estavel
--
-- 🔴 `source_last_seen_at` FICA FORA da definicao de versao: medido, tem 7.768 valores
--    distintos (~1 por run) porque e' reescrito a cada passada. Incluido, cada linha viraria
--    versao unica e a dedup NAO REDUZIRIA NADA. Mesma razao de `created_at` e `run_id`:
--    registram QUANDO/QUAL PASSADA viu, nunca O QUE a fatura e'.
--
-- `payload` ENTRA (via md5): custa 5.324 linhas (15.565 -> 20.889), ~8 MB, e cobre o caso em
-- que o jsonb cru mudou sem os campos extraidos mudarem. Erro seguro: guardar a mais se
-- conserta, guardar a menos e' perda definitiva.
--
-- O indice UNIQUE (run_id, competencia, unidade_id, emusys_fatura_id) nao pode ser violado:
-- a dedup so REMOVE linhas, nunca cria, e no mesmo run uma fatura aparece uma unica vez.

create table if not exists public.sync_run_items_dedup
  (like public.sync_run_items including all);

alter table public.sync_run_items_dedup
  add column if not exists primeira_vez_visto timestamptz,
  add column if not exists ultima_vez_visto   timestamptz;

comment on table public.sync_run_items_dedup is
  'LAPE-43 fase 2: sync_run_items deduplicada por conteudo (23 campos). Uma linha por versao '
  'distinta de cada fatura, mantendo a ocorrencia mais recente. primeira/ultima_vez_visto '
  'preservam o intervalo em que aquela versao esteve vigente. NAO esta em uso -- construida '
  'ao lado para validacao antes do swap.';

insert into public.sync_run_items_dedup
select distinct on (
    i.canonical_fatura_id, i.competencia, i.unidade_id, i.unidade_codigo,
    i.emusys_fatura_id, i.emusys_matricula_id, i.emusys_contrato_id, i.emusys_student_id,
    i.descricao, i.status, i.data_vencimento, i.data_pagamento,
    i.valor_original, i.valor_pago, i.juros_e_multa,
    i.desconto_aplicado, i.desconto_fixo, i.desconto_condicional,
    i.source_missing, i.source_missing_reason,
    i.source_missing_detected_at, i.source_missing_resolved_at,
    md5(i.payload::text))
  i.*,
  min(i.created_at) over (partition by
    i.canonical_fatura_id, i.competencia, i.unidade_id, i.unidade_codigo,
    i.emusys_fatura_id, i.emusys_matricula_id, i.emusys_contrato_id, i.emusys_student_id,
    i.descricao, i.status, i.data_vencimento, i.data_pagamento,
    i.valor_original, i.valor_pago, i.juros_e_multa,
    i.desconto_aplicado, i.desconto_fixo, i.desconto_condicional,
    i.source_missing, i.source_missing_reason,
    i.source_missing_detected_at, i.source_missing_resolved_at,
    md5(i.payload::text)) as primeira_vez_visto,
  max(i.created_at) over (partition by
    i.canonical_fatura_id, i.competencia, i.unidade_id, i.unidade_codigo,
    i.emusys_fatura_id, i.emusys_matricula_id, i.emusys_contrato_id, i.emusys_student_id,
    i.descricao, i.status, i.data_vencimento, i.data_pagamento,
    i.valor_original, i.valor_pago, i.juros_e_multa,
    i.desconto_aplicado, i.desconto_fixo, i.desconto_condicional,
    i.source_missing, i.source_missing_reason,
    i.source_missing_detected_at, i.source_missing_resolved_at,
    md5(i.payload::text)) as ultima_vez_visto
from public.sync_run_items i
order by
    i.canonical_fatura_id, i.competencia, i.unidade_id, i.unidade_codigo,
    i.emusys_fatura_id, i.emusys_matricula_id, i.emusys_contrato_id, i.emusys_student_id,
    i.descricao, i.status, i.data_vencimento, i.data_pagamento,
    i.valor_original, i.valor_pago, i.juros_e_multa,
    i.desconto_aplicado, i.desconto_fixo, i.desconto_condicional,
    i.source_missing, i.source_missing_reason,
    i.source_missing_detected_at, i.source_missing_resolved_at,
    md5(i.payload::text),
    i.created_at desc;
