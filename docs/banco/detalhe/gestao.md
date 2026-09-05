<!-- GERADO POR scripts/gerar-mapa-banco.mjs — NÃO EDITE À MÃO.
     Banco: ouqwbbermlzqqvtqwlul · Gerado em: 2026-09-05 -->

<!-- fim do cabecalho gerado -->
# Detalhe do banco — gestao

38 objetos. Resumo de todos os domínios em `../TABELAS.gerado.md`.

## bi_agent_config_lamusic

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `provider` | text | sim | 'openai'::text |  |
| `model` | text | sim | 'gpt-4o-mini'::text |  |
| `temperature` | numeric | sim | 0.1 |  |
| `max_tokens` | integer | sim | 4096 |  |
| `max_results_per_query` | integer | sim | 200 |  |
| `system_prompt_override` | text | sim |  |  |
| `cache_enabled` | boolean | sim | true |  |
| `cache_ttl_minutes` | integer | sim | 60 |  |
| `is_active` | boolean | sim | true |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `bi_agent_config_lamusic_pkey`

## bi_ai_query_playbooks

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `intent` | text | não |  |  |
| `description` | text | não |  |  |
| `example_questions` | text[] | não | '{}'::text[] |  |
| `allowed_roles` | text[] | não | '{}'::text[] |  |
| `required_scope` | text | não | 'unit'::text |  |
| `tables_used` | text[] | não | '{}'::text[] |  |
| `columns_used` | jsonb | não | '{}'::jsonb |  |
| `query_type` | text | não | 'select'::text |  |
| `query_template` | text | não |  |  |
| `params_schema` | jsonb | não | '{}'::jsonb |  |
| `safety_notes` | text | sim |  |  |
| `confidence` | numeric | não | 0.5 |  |
| `usage_count` | integer | não | 0 |  |
| `review_status` | text | não | 'draft'::text |  |
| `created_by` | text | não | 'sol'::text |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |
| `last_used_at` | timestamp with time zone | sim |  |  |

**Únicos:**
- `bi_ai_query_playbooks_intent_key`
- `bi_ai_query_playbooks_pkey`

**Triggers:**
- `trg_bi_ai_query_playbooks_updated_at → set_updated_at()`

## bi_conversations_lamusic

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `user_id` | uuid | sim |  | users.id |
| `title` | text | sim |  |  |
| `total_tokens` | integer | sim | 0 |  |
| `total_cost_usd` | numeric | sim | 0 |  |
| `is_archived` | boolean | sim | false |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `colaborador_id` | integer | sim |  | colaboradores.id |
| `colaborador_tipo` | text | sim |  |  |

**Únicos:**
- `bi_conversations_lamusic_pkey`

**Triggers:**
- `trg_bi_conversation_autofill → fn_bi_conversation_autofill()`
- `trg_bi_conversations_updated_at → set_updated_at()`

## bi_messages_lamusic

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `conversation_id` | uuid | sim |  | bi_conversations_lamusic.id |
| `role` | text | não |  |  |
| `content` | text | sim |  |  |
| `sql_query` | text | sim |  |  |
| `sql_result` | jsonb | sim |  |  |
| `sql_row_count` | integer | sim |  |  |
| `visualization_type` | text | sim |  |  |
| `visualization_config` | jsonb | sim |  |  |
| `tool_calls` | jsonb | sim |  |  |
| `prompt_tokens` | integer | sim |  |  |
| `completion_tokens` | integer | sim |  |  |
| `cost_usd` | numeric | sim |  |  |
| `feedback_rating` | integer | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `status` | text | não | 'done'::text |  |
| `error_message` | text | sim |  |  |
| `attempt_count` | integer | não | 0 |  |
| `locked_at` | timestamp with time zone | sim |  |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `bi_messages_lamusic_pkey`

**Triggers:**
- `trg_bi_messages_updated_at → set_updated_at()`

## bi_query_cache_lamusic

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `user_id` | uuid | sim |  |  |
| `query_hash` | character varying(64) | sim |  |  |
| `original_sql` | text | sim |  |  |
| `result` | jsonb | sim |  |  |
| `row_count` | integer | sim |  |  |
| `hit_count` | integer | sim | 0 |  |
| `expires_at` | timestamp with time zone | sim | (now() + '01:00:00'::interval) |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `bi_query_cache_lamusic_pkey`
- `bi_query_cache_lamusic_user_id_query_hash_key`

## bi_query_templates_lamusic

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `name` | text | sim |  |  |
| `description` | text | sim |  |  |
| `question_pattern` | text | sim |  |  |
| `sql_template` | text | sim |  |  |
| `default_visualization` | text | sim |  |  |
| `usage_count` | integer | sim | 0 |  |
| `is_active` | boolean | sim | true |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `bi_query_templates_lamusic_pkey`

## competencias_bloqueios_log

> Log persistente de tentativas bloqueadas ou pendencias de retificacao em competencias fechadas.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `ano` | integer | não |  |  |
| `mes` | integer | não |  |  |
| `origem` | text | não |  |  |
| `operacao` | text | não |  |  |
| `motivo` | text | não |  |  |
| `payload` | jsonb | sim |  |  |
| `resolvido` | boolean | não | false |  |
| `resolvido_em` | timestamp with time zone | sim |  |  |
| `resolvido_por` | text | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `competencias_bloqueios_log_pkey`

## competencias_mensais

> Governanca de fechamento mensal por unidade/ano/mes. dados_mensais continua sendo o snapshot historico.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `ano` | integer | não |  |  |
| `mes` | integer | não |  |  |
| `status` | text | não | 'aberto'::text |  |
| `fechamento_lote_id` | uuid | sim |  |  |
| `fechado_em` | timestamp with time zone | sim |  |  |
| `fechado_por` | text | sim |  |  |
| `motivo` | text | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `competencias_mensais_pkey`
- `competencias_mensais_unidade_ano_mes_key`

## dados_comerciais_legado

> LEGADO (aposentada 2026-07-05). Agregacao comercial mensal inflada por trigger incremental bugado (3-17x). Substituida por calculo vivo de leads no Dashboard e alerta CONVERSAO_BAIXA. Historico canonico mensal = dados_mensais + fechamento_mensal_snapshots. Nao usar.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('dados_comerciais_id_seq'::regclass) |  |
| `competencia` | date | não |  |  |
| `unidade` | character varying(50) | não |  |  |
| `total_leads` | integer | sim | 0 |  |
| `aulas_experimentais` | integer | sim | 0 |  |
| `novas_matriculas_total` | integer | sim | 0 |  |
| `novas_matriculas_lamk` | integer | sim | 0 |  |
| `novas_matriculas_emla` | integer | sim | 0 |  |
| `ticket_medio_parcelas` | numeric(10,2) | sim |  |  |
| `ticket_medio_passaporte` | numeric(10,2) | sim |  |  |
| `faturamento_passaporte` | numeric(10,2) | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `soma_passaportes` | numeric | sim | 0 |  |
| `qtd_matriculas_passaporte` | integer | sim | 0 |  |
| `soma_parcelas` | numeric | sim | 0 |  |
| `qtd_matriculas_parcela` | integer | sim | 0 |  |

**Únicos:**
- `dados_comerciais_competencia_unidade_key`
- `dados_comerciais_pkey`

## dados_mensais

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | uuid_generate_v4() |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `ano` | integer | não |  |  |
| `mes` | integer | não |  |  |
| `alunos_pagantes` | integer | sim | 0 |  |
| `novas_matriculas` | integer | sim | 0 |  |
| `evasoes` | integer | sim | 0 |  |
| `churn_rate` | numeric(5,2) | sim | 0 |  |
| `ticket_medio` | numeric(10,2) | sim | 0 |  |
| `taxa_renovacao` | numeric(5,2) | sim | 0 |  |
| `tempo_permanencia` | numeric(5,1) | sim | 0 |  |
| `inadimplencia` | numeric(5,2) | sim | 0 |  |
| `reajuste_parcelas` | numeric(5,2) | sim | 0 |  |
| `faturamento_estimado` | numeric(12,2) | sim | ((alunos_pagantes)::numeric * ticket_medio) |  |
| `saldo_liquido` | integer | sim | (novas_matriculas - evasoes) |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `ticket_medio_passaporte` | numeric | sim |  |  |
| `faturamento_passaporte` | numeric | sim |  |  |
| `alunos_ativos` | integer | sim |  |  |
| `matriculas_ativas` | integer | sim |  |  |
| `matriculas_banda` | integer | sim |  |  |
| `matriculas_2_curso` | integer | sim |  |  |
| `bolsistas_integrais` | integer | sim | 0 |  |
| `bolsistas_parciais` | integer | sim | 0 |  |

**Únicos:**
- `dados_mensais_pkey`
- `dados_mensais_unidade_id_ano_mes_key`

**Triggers:**
- `tr_audit_dados_mensais → audit_dados_mensais()`
- `tr_dados_mensais_updated_at → update_updated_at()`
- `trg_audit → fn_audit_log()`

## dados_mensais_retificacoes

> Auditoria de retificações em dados_mensais. Cada registro representa uma retificação aplicada com antes/depois/diff.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | não |  |  |
| `ano` | integer | não |  |  |
| `mes` | integer | não |  |  |
| `motivo` | text | não |  |  |
| `solicitado_por` | text | não |  |  |
| `aprovado_por` | text | não |  |  |
| `origem` | text | não | 'retificacao_controlada'::text |  |
| `snapshot_antes` | jsonb | não |  |  |
| `snapshot_depois` | jsonb | não |  |  |
| `diff` | jsonb | não |  |  |
| `observacoes` | text | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `status` | text | não | 'solicitada'::text |  |
| `rollback_de` | uuid | sim |  | dados_mensais_retificacoes.id |
| `aplicada_em` | timestamp with time zone | sim |  |  |
| `aplicada_por` | text | sim |  |  |

**Únicos:**
- `dados_mensais_retificacoes_pkey`

## dashboard_config

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | uuid_generate_v4() |  |
| `chave` | character varying(100) | não |  |  |
| `valor` | jsonb | não | '{}'::jsonb |  |
| `descricao` | text | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `dashboard_config_chave_key`
- `dashboard_config_pkey`

**Triggers:**
- `tr_dashboard_config_updated_at → update_updated_at()`

## insights_salvos

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `user_id` | uuid | sim |  | users.id |
| `tipo` | character varying(50) | não |  |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `ano` | integer | não |  |  |
| `mes` | integer | não |  |  |
| `dados` | jsonb | não |  |  |
| `titulo` | character varying(255) | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `insights_salvos_pkey`

**Triggers:**
- `trigger_update_insights_salvos_timestamp → update_insights_salvos_timestamp()`

## metas

> Metas e OKRs unificados por unidade - mensais, trimestrais e anuais.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('metas_id_seq'::regclass) |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `ano` | integer | não |  |  |
| `mes` | integer | sim |  |  |
| `trimestre` | integer | sim |  |  |
| `tipo_periodo` | character varying(20) | não | 'mensal'::character varying |  |
| `meta_leads` | integer | sim |  |  |
| `meta_experimentais` | integer | sim |  |  |
| `meta_matriculas` | integer | sim |  |  |
| `meta_taxa_conversao_experimental` | numeric(5,2) | sim |  |  |
| `meta_taxa_conversao_lead` | numeric(5,2) | sim |  |  |
| `meta_faturamento_passaportes` | numeric(12,2) | sim |  |  |
| `meta_renovacoes` | integer | sim |  |  |
| `meta_taxa_renovacao` | numeric(5,2) | sim |  |  |
| `meta_churn_maximo` | numeric(5,2) | sim |  |  |
| `meta_evasoes_maximo` | integer | sim |  |  |
| `meta_ltv_meses` | numeric(5,1) | sim |  |  |
| `meta_faturamento_parcelas` | numeric(12,2) | sim |  |  |
| `meta_ticket_medio` | numeric(10,2) | sim |  |  |
| `meta_inadimplencia_maxima` | numeric(5,2) | sim |  |  |
| `meta_alunos_ativos` | integer | sim |  |  |
| `meta_alunos_pagantes` | integer | sim |  |  |
| `ativo` | boolean | sim | true |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `created_by` | integer | sim |  |  |

**Únicos:**
- `idx_metas_unique`
- `metas_pkey1`

**Triggers:**
- `trg_audit → fn_audit_log()`
- `update_metas_updated_at → update_updated_at_column()`

## metas_comerciais

> BACKUP: Metas comerciais originais. Dados consolidados na nova tabela metas em 2026-01-16. Pode ser removida após 30 dias de validação.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('metas_comerciais_id_seq'::regclass) |  |
| `ano` | integer | não |  |  |
| `unidade` | character varying(50) | não |  |  |
| `meta_leads` | integer | sim |  |  |
| `meta_experimentais` | integer | sim |  |  |
| `meta_matriculas` | integer | sim |  |  |
| `meta_taxa_conversao` | numeric(5,2) | sim |  |  |
| `meta_ticket_medio` | numeric(10,2) | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `metas_comerciais_ano_unidade_key`
- `metas_comerciais_pkey`

## metas_kpi

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('metas_kpi_id_seq'::regclass) |  |
| `ano` | integer | não |  |  |
| `mes` | integer | não |  |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `tipo` | character varying(50) | não |  |  |
| `valor` | numeric(15,2) | não |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `metas_kpi_ano_mes_unidade_id_tipo_key`
- `metas_kpi_pkey`

**Triggers:**
- `trg_audit → fn_audit_log()`

## metas_legado

> BACKUP: Tabela metas original (estrutura anual). Dados migrados para nova tabela metas em 2026-01-16. Pode ser removida após 30 dias de validação.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | uuid_generate_v4() |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `ano` | integer | não |  |  |
| `meta_alunos` | integer | sim | 0 |  |
| `meta_matriculas_mes` | integer | sim | 0 |  |
| `meta_evasoes_max` | integer | sim | 0 |  |
| `meta_churn` | numeric(5,2) | sim | 3.5 |  |
| `meta_renovacao` | numeric(5,2) | sim | 90 |  |
| `meta_ticket` | numeric(10,2) | sim | 0 |  |
| `meta_permanencia` | integer | sim | 0 |  |
| `meta_inadimplencia` | numeric(5,2) | sim | 2 |  |
| `meta_faturamento` | numeric(12,2) | sim | 0 |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `metas_pkey`
- `metas_unidade_id_ano_key`

**Triggers:**
- `tr_audit_metas → audit_metas()`
- `tr_metas_updated_at → update_updated_at()`

## metas_professor_turma

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `professor_id` | integer | não |  | professores.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `ano` | integer | não |  |  |
| `mes` | integer | não |  |  |
| `media_meta` | numeric(4,2) | não |  |  |
| `media_atual` | numeric(4,2) | sim |  |  |
| `total_alunos` | integer | sim |  |  |
| `total_turmas` | integer | sim |  |  |
| `atingida` | boolean | sim | false |  |
| `data_atingida` | timestamp with time zone | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `metas_professor_turma_pkey`
- `metas_professor_turma_professor_id_ano_mes_key`

## projecao_aulas

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `aluno_id` | integer | não |  | alunos.id |
| `matricula_disciplina_id` | bigint | não |  |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `sequencia` | integer | não |  |  |
| `data_projetada` | date | não |  |  |
| `dia_semana` | text | não |  |  |
| `status` | text | não | 'projetada'::text |  |
| `versao` | integer | não | 1 |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |
| `is_provisional` | boolean | não | false |  |

**Únicos:**
- `projecao_aulas_aluno_id_matricula_disciplina_id_sequencia_key`
- `projecao_aulas_pkey`

## projecao_recaculo_log

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `aluno_id` | integer | não |  |  |
| `matricula_disciplina_id` | bigint | não |  |  |
| `trigger_evento` | text | não |  |  |
| `versao_anterior` | integer | não |  |  |
| `versao_nova` | integer | não |  |  |
| `detalhes` | jsonb | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `projecao_recaculo_log_pkey`

## relatorios_diarios

> Snapshot diário dos números de cada unidade - histórico para análise

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('relatorios_diarios_id_seq'::regclass) |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `data_referencia` | date | não | CURRENT_DATE |  |
| `total_alunos_ativos` | integer | sim |  |  |
| `total_alunos_pagantes` | integer | sim |  |  |
| `total_bolsistas_integral` | integer | sim |  |  |
| `total_bolsistas_parcial` | integer | sim |  |  |
| `total_matriculas_ativas` | integer | sim |  |  |
| `total_matriculas_banda` | integer | sim |  |  |
| `total_matriculas_segundo_curso` | integer | sim |  |  |
| `leads_novos_dia` | integer | sim | 0 |  |
| `leads_acumulado_mes` | integer | sim |  |  |
| `experimentais_agendadas_dia` | integer | sim | 0 |  |
| `experimentais_realizadas_dia` | integer | sim | 0 |  |
| `faltaram_experimental_dia` | integer | sim | 0 |  |
| `matriculas_dia` | integer | sim | 0 |  |
| `matriculas_acumulado_mes` | integer | sim |  |  |
| `visitas_escola_dia` | integer | sim | 0 |  |
| `renovacoes_dia` | integer | sim | 0 |  |
| `renovacoes_acumulado_mes` | integer | sim |  |  |
| `nao_renovacoes_dia` | integer | sim | 0 |  |
| `nao_renovacoes_acumulado_mes` | integer | sim |  |  |
| `evasoes_dia` | integer | sim | 0 |  |
| `evasoes_acumulado_mes` | integer | sim |  |  |
| `avisos_previos_mes` | integer | sim |  |  |
| `ticket_medio_atual` | numeric(10,2) | sim |  |  |
| `faturamento_previsto_mes` | numeric(12,2) | sim |  |  |
| `faturamento_realizado_mes` | numeric(12,2) | sim |  |  |
| `inadimplencia_valor` | numeric(12,2) | sim |  |  |
| `inadimplencia_percentual` | numeric(5,2) | sim |  |  |
| `churn_rate_mes` | numeric(5,2) | sim |  |  |
| `taxa_renovacao_mes` | numeric(5,2) | sim |  |  |
| `taxa_conversao_experimental_mes` | numeric(5,2) | sim |  |  |
| `ltv_atual` | numeric(5,1) | sim |  |  |
| `observacoes` | text | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `created_by` | integer | sim |  | usuarios.id |

**Únicos:**
- `idx_relatorios_unique`
- `relatorios_diarios_pkey`

## relatorios_pedagogicos

> Historico de relatorios pedagogicos gerados por IA (Gemini) a partir das anotacoes de aula. Rascunho editavel + reuso pelo agente Fabio.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `aluno_id` | integer | não |  |  |
| `pessoa_nome` | text | não |  |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `periodo_tipo` | text | não |  |  |
| `data_inicio` | date | sim |  |  |
| `data_fim` | date | sim |  |  |
| `conteudo_json` | jsonb | sim |  |  |
| `conteudo_editado` | text | sim |  |  |
| `modelo_ia` | text | sim |  |  |
| `status` | text | não | 'rascunho'::text |  |
| `gerado_por` | uuid | sim |  |  |
| `gerado_em` | timestamp with time zone | não | now() |  |
| `editado_em` | timestamp with time zone | sim |  |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `relatorios_pedagogicos_pkey`

**Triggers:**
- `trg_relped_updated_at → set_updated_at()`

## simulacoes_metas

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | text | não |  |  |
| `ano` | integer | não |  |  |
| `nome` | text | não | 'Cenário Principal'::text |  |
| `descricao` | text | sim |  |  |
| `alunos_atual` | integer | não |  |  |
| `alunos_objetivo` | integer | não |  |  |
| `mes_objetivo` | integer | sim | 12 |  |
| `churn_projetado` | numeric(5,2) | não |  |  |
| `ticket_medio` | numeric(10,2) | não |  |  |
| `taxa_lead_exp` | numeric(5,2) | não |  |  |
| `taxa_exp_mat` | numeric(5,2) | não |  |  |
| `inadimplencia_pct` | numeric(5,2) | sim | 0 |  |
| `evasoes_mensais` | integer | sim |  |  |
| `matriculas_mensais` | integer | sim |  |  |
| `experimentais_mensais` | integer | sim |  |  |
| `leads_mensais` | integer | sim |  |  |
| `mrr_projetado` | numeric(12,2) | sim |  |  |
| `faturamento_anual` | numeric(14,2) | sim |  |  |
| `ltv_projetado` | numeric(10,2) | sim |  |  |
| `alertas` | jsonb | sim | '[]'::jsonb |  |
| `score_viabilidade` | integer | sim | 0 |  |
| `criado_por` | uuid | sim |  |  |
| `criado_em` | timestamp with time zone | sim | now() |  |
| `atualizado_em` | timestamp with time zone | sim | now() |  |
| `aplicado_em` | timestamp with time zone | sim |  |  |
| `tipo_objetivo` | text | sim | 'alunos'::text |  |
| `tipo_meta_financeira` | text | sim | 'mensal'::text |  |
| `mrr_objetivo` | numeric(12,2) | sim | 0 |  |

**Únicos:**
- `simulacoes_metas_pkey`
- `simulacoes_metas_unidade_id_ano_nome_key`

## simulacoes_turma

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `ano` | integer | não |  |  |
| `mes` | integer | não |  |  |
| `nome` | character varying(255) | não | 'Cenário Principal'::character varying |  |
| `descricao` | text | sim |  |  |
| `media_atual` | numeric(4,2) | não |  |  |
| `media_meta` | numeric(4,2) | não |  |  |
| `valor_base` | numeric(10,2) | não |  |  |
| `incremento` | numeric(10,2) | não |  |  |
| `percentual_folha_atual` | numeric(5,2) | sim |  |  |
| `percentual_folha_meta` | numeric(5,2) | sim |  |  |
| `margem_atual` | numeric(5,2) | sim |  |  |
| `margem_meta` | numeric(5,2) | sim |  |  |
| `economia_mensal` | numeric(12,2) | sim |  |  |
| `economia_anual` | numeric(12,2) | sim |  |  |
| `total_alunos` | integer | sim |  |  |
| `ticket_medio` | numeric(10,2) | sim |  |  |
| `mrr_total` | numeric(12,2) | sim |  |  |
| `alertas` | jsonb | sim | '[]'::jsonb |  |
| `score_viabilidade` | integer | sim | 0 |  |
| `aplicado_em` | timestamp with time zone | sim |  |  |
| `criado_por` | uuid | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `simulacoes_turma_pkey`

## vw_alertas

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `tipo_alerta` | text | sim |  |  |
| `unidade` | character varying(100) | sim |  |  |
| `descricao` | text | sim |  |  |
| `valor` | numeric(5,2) | sim |  |  |
| `data_referencia` | date | sim |  |  |

## vw_alertas_inteligentes

> Alertas do Dashboard. Desde 2026-07-05, o alerta CONVERSAO_BAIXA e calculado ao vivo de leads (formula do Dashboard: exp realizadas -> convertidos), nao mais de dados_comerciais (tabela legado, inflada por trigger incremental bugado).

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `tipo_alerta` | text | sim |  |  |
| `severidade` | text | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `unidade_nome` | character varying(100) | sim |  |  |
| `quantidade` | integer | sim |  |  |
| `descricao` | text | sim |  |  |
| `detalhe` | text | sim |  |  |
| `valor_atual` | numeric | sim |  |  |
| `valor_meta` | numeric | sim |  |  |
| `data_referencia` | date | sim |  |  |

## vw_consolidado_anual

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `ano` | integer | sim |  |  |
| `alunos_dezembro` | bigint | sim |  |  |
| `total_matriculas` | bigint | sim |  |  |
| `total_evasoes` | bigint | sim |  |  |
| `churn_medio` | numeric | sim |  |  |
| `ticket_medio` | numeric | sim |  |  |
| `renovacao_media` | numeric | sim |  |  |
| `permanencia_media` | numeric | sim |  |  |
| `inadimplencia_media` | numeric | sim |  |  |
| `faturamento_total` | numeric | sim |  |  |

## vw_dashboard_unidade

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade_id` | uuid | sim |  |  |
| `unidade_nome` | character varying(100) | sim |  |  |
| `codigo` | character varying(20) | sim |  |  |
| `alunos_ativos` | integer | sim |  |  |
| `alunos_pagantes` | integer | sim |  |  |
| `ticket_medio` | numeric(10,2) | sim |  |  |
| `mrr` | numeric(12,2) | sim |  |  |
| `matriculas_mes` | integer | sim |  |  |
| `evasoes_mes` | integer | sim |  |  |
| `churn_rate` | numeric(5,2) | sim |  |  |
| `taxa_renovacao` | numeric(5,2) | sim |  |  |
| `inadimplencia_pct` | numeric(5,2) | sim |  |  |
| `tempo_permanencia` | numeric(5,1) | sim |  |  |
| `reajuste_medio` | numeric(5,2) | sim |  |  |

## vw_kpis_comercial_historico

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | sim |  |  |
| `competencia` | date | sim |  |  |
| `unidade_nome` | character varying(50) | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `ano` | integer | sim |  |  |
| `mes` | integer | sim |  |  |
| `total_leads` | integer | sim |  |  |
| `experimentais_realizadas` | integer | sim |  |  |
| `novas_matriculas_total` | integer | sim |  |  |
| `novas_matriculas_lamk` | integer | sim |  |  |
| `novas_matriculas_emla` | integer | sim |  |  |
| `ticket_medio_parcelas` | numeric(10,2) | sim |  |  |
| `ticket_medio_passaporte` | numeric(10,2) | sim |  |  |
| `faturamento_passaporte` | numeric(10,2) | sim |  |  |
| `taxa_lead_exp` | numeric | sim |  |  |
| `taxa_exp_mat` | numeric | sim |  |  |
| `taxa_lead_mat` | numeric | sim |  |  |

## vw_kpis_comercial_mensal

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade_id` | uuid | sim |  |  |
| `unidade_nome` | character varying(100) | sim |  |  |
| `ano` | integer | sim |  |  |
| `mes` | integer | sim |  |  |
| `total_leads` | integer | sim |  |  |
| `leads_arquivados` | integer | sim |  |  |
| `experimentais_agendadas` | integer | sim |  |  |
| `experimentais_realizadas` | integer | sim |  |  |
| `faltaram` | integer | sim |  |  |
| `taxa_showup` | numeric | sim |  |  |
| `novas_matriculas` | integer | sim |  |  |
| `taxa_conversao_lead_exp` | numeric | sim |  |  |
| `taxa_conversao_exp_mat` | numeric | sim |  |  |
| `taxa_conversao_geral` | numeric | sim |  |  |
| `faturamento_novos` | numeric(12,2) | sim |  |  |
| `ticket_medio_novos` | numeric(10,2) | sim |  |  |

## vw_kpis_gestao_mensal

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade_id` | uuid | sim |  |  |
| `unidade_nome` | character varying(100) | sim |  |  |
| `ano` | integer | sim |  |  |
| `mes` | integer | sim |  |  |
| `total_alunos_ativos` | integer | sim |  |  |
| `total_alunos_pagantes` | integer | sim |  |  |
| `total_bolsistas_integrais` | integer | sim |  |  |
| `total_bolsistas_parciais` | integer | sim |  |  |
| `total_banda` | integer | sim |  |  |
| `total_segundo_curso` | integer | sim |  |  |
| `ticket_medio` | numeric(10,2) | sim |  |  |
| `mrr` | numeric(12,2) | sim |  |  |
| `arr` | numeric(14,2) | sim |  |  |
| `tempo_permanencia_medio` | numeric(5,1) | sim |  |  |
| `ltv_medio` | numeric(12,2) | sim |  |  |
| `inadimplencia_pct` | numeric(5,2) | sim |  |  |
| `faturamento_previsto` | numeric(12,2) | sim |  |  |
| `faturamento_realizado` | numeric(12,2) | sim |  |  |
| `total_leads` | integer | sim |  |  |
| `experimentais_agendadas` | integer | sim |  |  |
| `experimentais_realizadas` | integer | sim |  |  |
| `novas_matriculas` | integer | sim |  |  |
| `total_evasoes` | integer | sim |  |  |
| `churn_rate` | numeric(5,2) | sim |  |  |
| `renovacoes` | integer | sim |  |  |
| `taxa_renovacao` | numeric(5,2) | sim |  |  |
| `reajuste_medio` | numeric(5,2) | sim |  |  |

## vw_kpis_mensais

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade` | character varying(100) | sim |  |  |
| `ano_mes` | text | sim |  |  |
| `matriculas` | bigint | sim |  |  |
| `renovacoes` | bigint | sim |  |  |
| `evasoes` | bigint | sim |  |  |
| `transferencias` | bigint | sim |  |  |

## vw_metas_vs_realizado

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade` | character varying(100) | sim |  |  |
| `ano` | integer | sim |  |  |
| `mes` | integer | sim |  |  |
| `ano_mes` | text | sim |  |  |
| `meta_matriculas` | integer | sim |  |  |
| `matriculas_realizadas` | integer | sim |  |  |
| `pct_matriculas` | numeric | sim |  |  |
| `meta_renovacoes` | integer | sim |  |  |
| `renovacoes_realizadas` | integer | sim |  |  |
| `pct_renovacoes` | numeric | sim |  |  |
| `meta_churn_maximo` | numeric(5,2) | sim |  |  |
| `churn_realizado` | numeric | sim |  |  |
| `status_churn` | text | sim |  |  |
| `meta_faturamento_parcelas` | numeric(12,2) | sim |  |  |
| `faturamento_realizado` | numeric | sim |  |  |
| `pct_faturamento` | numeric | sim |  |  |
| `meta_alunos_ativos` | integer | sim |  |  |
| `alunos_ativos` | integer | sim |  |  |
| `pct_alunos` | numeric | sim |  |  |

## vw_projecao_metas

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade` | character varying(100) | sim |  |  |
| `ano` | integer | sim |  |  |
| `mes` | integer | sim |  |  |
| `dias_passados` | integer | sim |  |  |
| `dias_no_mes` | integer | sim |  |  |
| `meta_matriculas` | integer | sim |  |  |
| `matriculas_ate_agora` | integer | sim |  |  |
| `matriculas_projetadas` | numeric | sim |  |  |
| `status_matriculas` | text | sim |  |  |
| `meta_faturamento_parcelas` | numeric(12,2) | sim |  |  |
| `faturamento_ate_agora` | numeric | sim |  |  |
| `faturamento_projetado` | numeric | sim |  |  |
| `status_faturamento` | text | sim |  |  |

## vw_ranking_professores_evasoes

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `professor` | character varying(100) | sim |  |  |
| `unidade` | character varying(50) | sim |  |  |
| `ano` | integer | sim |  |  |
| `evasoes` | integer | sim |  |  |
| `matriculas` | integer | sim |  |  |
| `taxa_conversao` | numeric(5,1) | sim |  |  |
| `renovacoes` | integer | sim |  |  |
| `taxa_renovacao` | numeric(5,1) | sim |  |  |
| `nivel_risco` | text | sim |  |  |

## vw_ranking_professores_retencao

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade` | character varying(100) | sim |  |  |
| `professor` | character varying(100) | sim |  |  |
| `total_alunos` | bigint | sim |  |  |
| `alunos_ativos` | bigint | sim |  |  |
| `alunos_perdidos` | bigint | sim |  |  |
| `tempo_medio_permanencia` | numeric | sim |  |  |
| `presenca_media` | numeric | sim |  |  |
| `ticket_medio` | numeric | sim |  |  |

## vw_ranking_unidades

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade` | character varying(100) | sim |  |  |
| `codigo` | character varying(20) | sim |  |  |
| `ano` | integer | sim |  |  |
| `alunos_dezembro` | integer | sim |  |  |
| `churn_medio` | numeric | sim |  |  |
| `renovacao_media` | numeric | sim |  |  |
| `inadimplencia_media` | numeric | sim |  |  |
| `ticket_medio` | numeric | sim |  |  |
| `permanencia` | numeric | sim |  |  |

## vw_sazonalidade

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade` | character varying(100) | sim |  |  |
| `codigo` | character varying(20) | sim |  |  |
| `ano` | integer | sim |  |  |
| `mes` | integer | sim |  |  |
| `novas_matriculas` | integer | sim |  |  |
| `evasoes` | integer | sim |  |  |
| `churn_rate` | numeric(5,2) | sim |  |  |
| `saldo_liquido` | integer | sim |  |  |

