<!-- GERADO POR scripts/gerar-mapa-banco.mjs — NÃO EDITE À MÃO.
     Banco: ouqwbbermlzqqvtqwlul · Gerado em: 2026-09-06 -->

<!-- fim do cabecalho gerado -->
# Detalhe do banco — financeiro

31 objetos. Resumo de todos os domínios em `../TABELAS.gerado.md`.

## caixa_categorias

> Categorias operacionais do caixa diario. Substitui lista fixa do frontend e permite novas categorias pela UI.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `slug` | text | não |  |  |
| `nome` | text | não |  |  |
| `ambiente` | text | não | 'ambos'::text |  |
| `ativo` | boolean | não | true |  |
| `ordem` | integer | não | 1000 |  |
| `criado_por` | text | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `caixa_categorias_pkey`
- `caixa_categorias_slug_key`

**Triggers:**
- `tr_caixa_categorias_updated_at → set_updated_at_caixa()`

## caixa_financeiro_grupos_whatsapp

> JIDs dos grupos financeiros por unidade para envio manual do fechamento de caixa.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `nome_grupo` | text | não |  |  |
| `grupo_jid` | text | não |  |  |
| `ativo` | boolean | não | true |  |
| `observacoes` | text | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `caixa_financeiro_grupos_unidade_unique`
- `caixa_financeiro_grupos_whatsapp_pkey`

**Triggers:**
- `tr_caixa_financeiro_grupos_updated_at → set_updated_at_caixa()`

## caixa_movimentacoes

> Lancamentos manuais do caixa diario/cofre. Ambiente cofre afeta saldo fisico em dinheiro; ambiente venda alimenta resumo.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `caixa_diario_id` | uuid | não |  | caixas_diarios.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `data_movimento` | date | não |  |  |
| `ambiente` | text | não |  |  |
| `tipo` | text | não |  |  |
| `forma_pagamento` | text | não |  |  |
| `categoria` | text | não | 'outro'::text |  |
| `descricao` | text | não |  |  |
| `valor` | numeric(12,2) | não |  |  |
| `responsavel` | text | sim |  |  |
| `criado_por` | text | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |
| `cartao_modalidade` | text | sim |  |  |
| `cartao_parcelas` | integer | sim |  |  |
| `link_pagamento` | text | sim |  |  |
| `aluno_id` | integer | sim |  | alunos.id |
| `fatura_id` | uuid | sim |  | emusys_faturas.id |

**Únicos:**
- `caixa_movimentacoes_pkey`

**Triggers:**
- `tr_caixa_movimentacoes_updated_at → set_updated_at_caixa()`
- `trg_audit_caixa_movimentacoes → fn_audit_log()`

## caixa_reaberturas_log

> Log auditavel de reaberturas do caixa diario. Guarda snapshot do cabecalho e das movimentacoes antes da reabertura.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `caixa_diario_id` | uuid | não |  | caixas_diarios.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `data_caixa` | date | não |  |  |
| `motivo` | text | não |  |  |
| `reaberto_por` | text | não |  |  |
| `reaberto_em` | timestamp with time zone | não | now() |  |
| `fechado_em_anterior` | timestamp with time zone | sim |  |  |
| `fechado_por_anterior` | text | sim |  |  |
| `saldo_final_conferido_anterior` | numeric(12,2) | sim |  |  |
| `saldo_final_calculado_anterior` | numeric(12,2) | sim |  |  |
| `observacoes_anteriores` | text | sim |  |  |
| `caixa_snapshot` | jsonb | não |  |  |
| `movimentacoes_snapshot` | jsonb | não |  |  |
| `created_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `caixa_reaberturas_log_pkey`

## caixas_diarios

> Cabecalho do fechamento de caixa diario por unidade. Fase 1 manual.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `data_caixa` | date | não |  |  |
| `status` | text | não | 'aberto'::text |  |
| `saldo_inicial_cofre` | numeric(12,2) | não | 0 |  |
| `saldo_final_calculado` | numeric(12,2) | não | 0 |  |
| `saldo_final_conferido` | numeric(12,2) | sim |  |  |
| `aberto_em` | timestamp with time zone | não | now() |  |
| `aberto_por` | text | sim |  |  |
| `fechado_em` | timestamp with time zone | sim |  |  |
| `fechado_por` | text | sim |  |  |
| `observacoes` | text | sim |  |  |
| `ultimo_envio_whatsapp_em` | timestamp with time zone | sim |  |  |
| `ultimo_envio_whatsapp_por` | text | sim |  |  |
| `ultimo_envio_whatsapp_status` | text | sim |  |  |
| `ultimo_envio_whatsapp_erro` | text | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `caixas_diarios_pkey`
- `caixas_diarios_unidade_data_unique`

**Triggers:**
- `tr_caixas_diarios_updated_at → set_updated_at_caixa()`

## contrato_assinatura_sync_execucoes

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `unidade_slug` | text | não |  |  |
| `status` | text | não | 'running'::text |  |
| `paginas` | integer | não | 0 |  |
| `matriculas_recebidas` | integer | não | 0 |  |
| `com_contrato` | integer | não | 0 |  |
| `assinadas` | integer | não | 0 |  |
| `nao_assinadas` | integer | não | 0 |  |
| `sem_contrato` | integer | não | 0 |  |
| `erro` | text | sim |  |  |
| `started_at` | timestamp with time zone | não | now() |  |
| `completed_at` | timestamp with time zone | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `contrato_assinatura_sync_execucoes_pkey`

## fechamento_mensal_auditoria

> Auditoria das acoes de preview, aprovacao, fechamento, retificacao e compatibilidade mensal.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `snapshot_id` | uuid | sim |  | fechamento_mensal_snapshots.id |
| `ano` | integer | não |  |  |
| `mes` | integer | não |  |  |
| `escopo` | text | não | 'unidade'::text |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `acao` | text | não |  |  |
| `detalhes` | jsonb | não | '{}'::jsonb |  |
| `actor_id` | uuid | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `fechamento_mensal_auditoria_pkey`

## fechamento_mensal_execucoes

> Placar do fechamento mensal automatico. Alimenta o vigia da la-hq, que le daqui o motivo da falha por unidade.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `ano` | integer | não |  |  |
| `mes` | integer | não |  |  |
| `origem` | text | não | 'cron_dia1'::text |  |
| `iniciado_em` | timestamp with time zone | não | now() |  |
| `concluido_em` | timestamp with time zone | sim |  |  |
| `unidades_fechadas` | integer | não | 0 |  |
| `unidades_com_erro` | integer | não | 0 |  |
| `detalhes` | jsonb | não | '[]'::jsonb |  |
| `created_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `fechamento_mensal_execucoes_pkey`

## fechamento_mensal_retificacoes

> Retificacoes append-only aplicadas somente na leitura de relatorios mensais fechados; o snapshot original permanece imutavel.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `snapshot_id` | uuid | não |  | fechamento_mensal_snapshots.id |
| `base_payload_hash` | text | não |  |  |
| `payload_corrigido` | jsonb | não |  |  |
| `payload_corrigido_hash` | text | não |  |  |
| `motivo` | text | não |  |  |
| `evidencias` | jsonb | não | '{}'::jsonb |  |
| `created_by` | uuid | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `fechamento_mensal_retificacoe_snapshot_id_payload_corrigido_key`
- `fechamento_mensal_retificacoes_pkey`

**Triggers:**
- `fechamento_mensal_retificacoes_append_only → bloquear_mutacao_retificacao_mensal_v1()`

## fechamento_mensal_snapshots

> Snapshot mensal imutavel por dominio do LA Report. Fonte oficial para competencias fechadas.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `ano` | integer | não |  |  |
| `mes` | integer | não |  |  |
| `escopo` | text | não | 'unidade'::text |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `dominio` | text | não |  |  |
| `versao` | integer | não | 1 |  |
| `status` | text | não | 'preview'::text |  |
| `fonte` | text | não |  |  |
| `payload` | jsonb | não |  |  |
| `payload_hash` | text | não |  |  |
| `financeiro_realizado_disponivel` | boolean | não | false |  |
| `observacao` | text | sim |  |  |
| `capturado_em` | timestamp with time zone | não | now() |  |
| `capturado_por` | uuid | sim |  |  |
| `aprovado_em` | timestamp with time zone | sim |  |  |
| `aprovado_por` | uuid | sim |  |  |
| `fechado_em` | timestamp with time zone | sim |  |  |
| `fechado_por` | uuid | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `fechamento_mensal_snapshots_pkey`
- `ux_fechamento_mensal_snapshots_competencia_dominio`

**Triggers:**
- `trg_fechamento_mensal_snapshot_imutavel → proteger_fechamento_mensal_snapshot_imutavel_v1()`

## fechamento_snapshots_backup_20260808

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | sim |  |  |
| `ano` | integer | sim |  |  |
| `mes` | integer | sim |  |  |
| `escopo` | text | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `dominio` | text | sim |  |  |
| `versao` | integer | sim |  |  |
| `status` | text | sim |  |  |
| `fonte` | text | sim |  |  |
| `payload` | jsonb | sim |  |  |
| `payload_hash` | text | sim |  |  |
| `financeiro_realizado_disponivel` | boolean | sim |  |  |
| `observacao` | text | sim |  |  |
| `capturado_em` | timestamp with time zone | sim |  |  |
| `capturado_por` | uuid | sim |  |  |
| `aprovado_em` | timestamp with time zone | sim |  |  |
| `aprovado_por` | uuid | sim |  |  |
| `fechado_em` | timestamp with time zone | sim |  |  |
| `fechado_por` | uuid | sim |  |  |
| `created_at` | timestamp with time zone | sim |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |
| `backup_em` | timestamp with time zone | sim |  |  |

## financeiro_fatura_reconciliacao_decisoes

> Auditoria append-only das decisoes operacionais da conciliacao de faturas. Nunca altera o status do snapshot Emusys.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não |  |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `canonical_fatura_id` | uuid | sim |  |  |
| `competencia` | date | não |  |  |
| `emusys_fatura_id` | bigint | não |  |  |
| `emusys_matricula_id` | bigint | sim |  |  |
| `emusys_student_id` | bigint | sim |  |  |
| `tipo_decisao` | text | não |  |  |
| `forma_pagamento_id` | integer | sim |  | formas_pagamento.id |
| `observacao` | text | não |  |  |
| `decidido_por` | text | não | 'usuario_app'::text |  |
| `decidido_em` | timestamp with time zone | não | now() |  |
| `metadata` | jsonb | não | '{}'::jsonb |  |

**Únicos:**
- `financeiro_fatura_reconciliacao_decisoes_pkey`

**Triggers:**
- `financeiro_fatura_reconciliacao_decisao_immutavel → financeiro_fatura_reconciliacao_decisao_immutavel()`

## financeiro_sync_queue

> Fila unica do sync financeiro Emusys. Um job publica uma competencia completa das tres unidades.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `competencia` | date | não |  |  |
| `status` | text | não | 'pending'::text |  |
| `priority` | integer | não | 100 |  |
| `trigger_source` | text | não |  |  |
| `requested_by` | text | sim |  |  |
| `attempt_count` | integer | não | 0 |  |
| `max_attempts` | integer | não | 12 |  |
| `next_attempt_at` | timestamp with time zone | não | now() |  |
| `lease_expires_at` | timestamp with time zone | sim |  |  |
| `worker_id` | uuid | sim |  |  |
| `sync_run_id` | uuid | sim |  | sync_runs.id |
| `last_http_status` | integer | sim |  |  |
| `last_error_code` | text | sim |  |  |
| `last_error_detail` | text | sim |  |  |
| `last_retry_after_seconds` | integer | sim |  |  |
| `started_at` | timestamp with time zone | sim |  |  |
| `completed_at` | timestamp with time zone | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `financeiro_sync_queue_competencia_active_uniq`
- `financeiro_sync_queue_one_running_uniq`
- `financeiro_sync_queue_pkey`

## formas_pagamento

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('formas_pagamento_id_seq'::regclass) |  |
| `nome` | character varying(50) | não |  |  |
| `sigla` | character varying(10) | sim |  |  |
| `ativo` | boolean | sim | true |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `formas_pagamento_pkey`
- `uk_formas_nome`

## historico_pagamentos

> Histórico mensal de status de pagamento dos alunos (snapshot antes do reset)

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('historico_pagamentos_id_seq'::regclass) |  |
| `aluno_id` | integer | não |  | alunos.id |
| `ano` | integer | não |  |  |
| `mes` | integer | não |  |  |
| `status_pagamento` | character varying(50) | sim |  |  |
| `valor_parcela` | numeric(10,2) | sim |  |  |
| `dia_vencimento` | integer | sim |  |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `created_at` | timestamp with time zone | sim | now() |  |
| `created_by` | character varying(255) | sim |  |  |

**Únicos:**
- `historico_pagamentos_aluno_id_ano_mes_key`
- `historico_pagamentos_pkey`

## inadimplencia_emusys_cache_legado

> APOSENTADA 2026-07-28. Cache de inadimplencia por matricula. Os 9 crons nunca funcionaram (401 no gateway: mandavam so x-sync-token contra edge com verify_jwt=true). Dados congelados em 15/07/2026 e Campo Grande sempre vazia. Fonte viva = aluno_jornada_matricula_disciplina.inadimplente_emusys. NAO USAR.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade_id` | uuid | não |  | unidades.id |
| `emusys_matricula_id` | text | não |  |  |
| `inadimplente` | boolean | não | false |  |
| `valor_mensalidade_emusys` | numeric | sim |  |  |
| `forma_pagamento_emusys` | text | sim |  |  |
| `atualizado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `inadimplencia_emusys_cache_pkey`

## matriculas_campos_fixados

> Campos editados manualmente que o sync deve respeitar (não sobrescrever).

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não | nextval('matriculas_campos_fixados_id_seq'::regclass) |  |
| `aluno_id` | integer | não |  | alunos.id |
| `campo` | text | não |  |  |
| `valor` | jsonb | não |  |  |
| `fixado_por` | text | não |  |  |
| `fixado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `matriculas_campos_fixados_aluno_id_campo_key`
- `matriculas_campos_fixados_pkey`

## sol_caixa_abertura_pendente

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | não |  |  |
| `chat_id` | text | não |  |  |
| `data_caixa` | date | não |  |  |
| `tipo` | text | não |  |  |
| `status` | text | não | 'aguardando'::text |  |
| `preview_message_id` | text | sim |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |
| `resolvido_em` | timestamp with time zone | sim |  |  |
| `resolvido_por` | text | sim |  |  |

**Únicos:**
- `sol_caixa_abertura_pendente_pkey`
- `sol_caixa_abertura_pendente_unidade_id_data_caixa_tipo_key`

## sol_caixa_autorizados

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | não |  |  |
| `numero` | text | não |  |  |
| `nome` | text | sim |  |  |
| `papel` | text | sim |  |  |
| `ativo` | boolean | não | true |  |
| `criado_em` | timestamp with time zone | não | now() |  |
| `operacoes` | text[] | não | ARRAY['preview'::text, 'aprovar_preview'::text, 'corrigir_preview'::text, 'consulta_caixa'::text] |  |
| `origem` | text | não | 'manual'::text |  |
| `atualizado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `sol_caixa_autorizados_pkey`
- `sol_caixa_autorizados_unidade_id_numero_key`

## sol_caixa_ingestao_recebimentos

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `chat_id` | text | não |  |  |
| `message_id` | text | não |  |  |
| `unidade_id` | uuid | sim |  |  |
| `status` | text | não | 'recebido'::text |  |
| `motivo_ignorado` | text | sim |  |  |
| `valor_extraido` | numeric | sim |  |  |
| `forma_extraida` | text | sim |  |  |
| `categoria_extraida` | text | sim |  |  |
| `aluno_extraido` | text | sim |  |  |
| `raw_text` | text | sim |  |  |
| `media_ref` | text | sim |  |  |
| `preview_json` | jsonb | sim |  |  |
| `preview_message_id` | text | sim |  |  |
| `idempotency_key` | text | não |  |  |
| `fingerprint` | text | sim |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |
| `atualizado_em` | timestamp with time zone | não | now() |  |
| `movimentacao_id` | uuid | sim |  |  |
| `lancado_em` | timestamp with time zone | sim |  |  |
| `lancado_por` | text | sim |  |  |

**Únicos:**
- `sol_caixa_ingestao_recebimentos_chat_id_message_id_key`
- `sol_caixa_ingestao_recebimentos_idempotency_key_key`
- `sol_caixa_ingestao_recebimentos_pkey`

## sol_caixa_lancamento_auditoria

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `ator_numero` | text | sim |  |  |
| `ator_papel` | text | sim |  |  |
| `chat_id` | text | sim |  |  |
| `origem_message_id` | text | sim |  |  |
| `preview_message_id` | text | sim |  |  |
| `idempotency_key` | text | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `data_caixa` | date | sim |  |  |
| `payload` | jsonb | sim |  |  |
| `resultado` | text | sim |  |  |
| `motivo` | text | sim |  |  |
| `movimentacao_id` | uuid | sim |  |  |
| `caixa_diario_id` | uuid | sim |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `sol_caixa_lancamento_auditoria_pkey`

## sol_caixa_lote_itens_v1

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `lote_id` | uuid | não |  | sol_caixa_lotes_v1.id |
| `ordem` | smallint | não |  |  |
| `aluno_nome` | text | não |  |  |
| `responsavel_financeiro` | text | sim |  |  |
| `competencia` | text | sim |  |  |
| `categoria` | text | não |  |  |
| `valor` | numeric | não |  |  |
| `canonical_fatura_id` | text | sim |  |  |
| `movimentacao_id` | uuid | não |  | caixa_movimentacoes.id |
| `item_json` | jsonb | não |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `sol_caixa_lote_itens_v1_lote_id_ordem_key`
- `sol_caixa_lote_itens_v1_movimentacao_id_key`
- `sol_caixa_lote_itens_v1_pkey`

## sol_caixa_lotes_v1

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `caixa_diario_id` | uuid | não |  | caixas_diarios.id |
| `preview_id` | uuid | não |  | sol_caixa_shadow_previews_v1.id |
| `approval_id` | uuid | não |  | sol_caixa_shadow_approvals_v1.id |
| `idempotency_key` | text | não |  |  |
| `valor_total` | numeric | não |  |  |
| `forma_pagamento` | text | não |  |  |
| `categoria` | text | não |  |  |
| `ator_numero` | text | sim |  |  |
| `payload` | jsonb | não |  |  |
| `status` | text | não | 'lancado'::text |  |
| `criado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `sol_caixa_lotes_v1_idempotency_key_key`
- `sol_caixa_lotes_v1_pkey`

## sol_caixa_operacoes_auditoria_v1

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `operacao` | text | não |  |  |
| `idempotency_key` | text | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `caixa_diario_id` | uuid | sim |  |  |
| `movimentacao_id` | uuid | sim |  |  |
| `movimentacao_estorno_id` | uuid | sim |  |  |
| `ator_numero_hash` | text | sim |  |  |
| `ator_numero_tail` | text | sim |  |  |
| `ator_papel` | text | sim |  |  |
| `grupo_jid_hash` | text | sim |  |  |
| `chat_id_hash` | text | sim |  |  |
| `origem_message_id` | text | sim |  |  |
| `preview_message_id` | text | sim |  |  |
| `motivo` | text | sim |  |  |
| `payload` | jsonb | não | '{}'::jsonb |  |
| `antes` | jsonb | sim |  |  |
| `depois` | jsonb | sim |  |  |
| `resultado` | text | não |  |  |
| `erro` | text | sim |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `sol_caixa_operacoes_auditoria_v1_idem_uniq`
- `sol_caixa_operacoes_auditoria_v1_pkey`

## sol_caixa_shadow_approvals_v1

> Sol Caixa V3 shadow privado: decisões de aprovação observadas, sem acionar write financeiro.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `preview_id` | uuid | não |  | sol_caixa_shadow_previews_v1.id |
| `approval_event_hash` | text | não |  |  |
| `actor_id_hash` | text | sim |  |  |
| `decision` | text | não |  |  |
| `decision_json` | jsonb | não | '{}'::jsonb |  |
| `criado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `sol_caixa_shadow_approvals_v1_pkey`
- `sol_caixa_shadow_approvals_v1_preview_id_approval_event_has_key`

## sol_caixa_shadow_eventos_v1

> Sol Caixa V3 shadow privado: eventos reais observados sem resposta pública e sem mutação financeira.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `event_id_hash` | text | não |  |  |
| `chat_id_hash` | text | não |  |  |
| `sender_id_hash` | text | sim |  |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `observed_at` | timestamp with time zone | sim |  |  |
| `source` | text | não | 'sol_whatsapp_group_observe'::text |  |
| `mode` | text | não | 'shadow_inline_private'::text |  |
| `status` | text | não | 'observed'::text |  |
| `raw_ref` | jsonb | não | '{}'::jsonb |  |
| `resolver_json` | jsonb | não | '{}'::jsonb |  |
| `warnings` | text[] | não | '{}'::text[] |  |
| `blocks` | text[] | não | '{}'::text[] |  |
| `criado_em` | timestamp with time zone | não | now() |  |
| `atualizado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `sol_caixa_shadow_eventos_v1_event_id_hash_key`
- `sol_caixa_shadow_eventos_v1_pkey`

## sol_caixa_shadow_previews_v1

> Sol Caixa V3 shadow privado: previews calculados para auditoria, nunca enviados ao WhatsApp por esta tabela.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `evento_id` | uuid | não |  | sol_caixa_shadow_eventos_v1.id |
| `preview_hash` | text | não |  |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `operacao` | text | sim |  |  |
| `categoria` | text | sim |  |  |
| `valor_centavos` | integer | sim |  |  |
| `forma` | text | sim |  |  |
| `status` | text | não | 'shadow_private'::text |  |
| `preview_json` | jsonb | não | '{}'::jsonb |  |
| `criado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `sol_caixa_shadow_previews_v1_evento_id_preview_hash_key`
- `sol_caixa_shadow_previews_v1_pkey`

## sol_caixa_unidade_policy

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade_id` | uuid | não |  |  |
| `autoriza_qualquer_membro` | boolean | não | false |  |
| `atualizado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `sol_caixa_unidade_policy_pkey`

## sol_caixa_v3_approval_consumos_v1

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `approval_id` | uuid | não |  | sol_caixa_shadow_approvals_v1.id |
| `preview_id` | uuid | não |  | sol_caixa_shadow_previews_v1.id |
| `unidade_id` | uuid | não |  |  |
| `operacao` | text | não |  |  |
| `idempotency_key` | text | sim |  |  |
| `payload_hash` | text | sim |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `sol_caixa_v3_approval_consumos_v1_pkey`

## sol_caixa_v3_caixa_operacoes_v1

> Ledger V3 de abrir/fechar. Reabertura fica explicitamente fora deste contrato; fluxo humano usa caixa_reaberturas_log.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `data_caixa` | date | não |  |  |
| `operacao` | text | não |  |  |
| `caixa_diario_id` | uuid | sim |  | caixas_diarios.id |
| `preview_id` | uuid | não |  | sol_caixa_shadow_previews_v1.id |
| `approval_id` | uuid | não |  | sol_caixa_shadow_approvals_v1.id |
| `idempotency_key` | text | não |  |  |
| `snapshot_hash` | text | não |  |  |
| `resultado` | jsonb | não | '{}'::jsonb |  |
| `criado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `sol_caixa_v3_caixa_operacoes__unidade_id_data_caixa_operaca_key`
- `sol_caixa_v3_caixa_operacoes_v1_idempotency_key_key`
- `sol_caixa_v3_caixa_operacoes_v1_pkey`

## vw_contratos_vencendo

> Matriculas ativas com data da ultima aula do contrato, aulas restantes e vencimento da ultima fatura derivado. Grao = matricula/disciplina. Join com alunos por a.id = j.aluno_id (mesma chave que vw_jornada_aluno_atual usa internamente) -- garante que todas as colunas de alunos vem da mesma pessoa que aluno_nome/telefone/whatsapp da jornada.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade_id` | uuid | sim |  |  |
| `unidade_nome` | character varying(100) | sim |  |  |
| `aluno_id` | integer | sim |  |  |
| `aluno_nome` | character varying(200) | sim |  |  |
| `emusys_matricula_id` | bigint | sim |  |  |
| `emusys_matricula_disciplina_id` | bigint | sim |  |  |
| `curso_nome` | character varying | sim |  |  |
| `professor_nome` | character varying | sim |  |  |
| `data_matricula` | date | sim |  |  |
| `data_ultima_aula` | timestamp with time zone | sim |  |  |
| `dias_ate_vencimento` | integer | sim |  |  |
| `nr_aulas_futuras` | integer | sim |  |  |
| `venc_ultima_fatura` | date | sim |  |  |
| `valor_parcela` | numeric(10,2) | sim |  |  |
| `inadimplente` | boolean | sim |  |  |
| `telefone` | character varying(20) | sim |  |  |
| `whatsapp` | character varying(20) | sim |  |  |
| `ultima_sincronizacao_emusys` | timestamp with time zone | sim |  |  |
| `dias_ate_venc_fatura` | integer | sim |  |  |
| `faturas_vencidas_abertas` | integer | sim |  |  |
| `nr_faturas` | integer | sim |  |  |

