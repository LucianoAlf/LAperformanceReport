<!-- GERADO POR scripts/gerar-mapa-banco.mjs — NÃO EDITE À MÃO.
     Banco: ouqwbbermlzqqvtqwlul · Gerado em: 2026-09-02 -->

<!-- fim do cabecalho gerado -->
# Detalhe do banco — integracao

57 objetos. Resumo de todos os domínios em `../TABELAS.gerado.md`.

## admin_conversas

> Conversas administrativas com alunos via WhatsApp - uma por aluno por unidade

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `aluno_id` | integer | sim |  | alunos.id |
| `unidade_id` | uuid | sim |  | unidades.id |
| `caixa_id` | integer | sim |  | whatsapp_caixas.id |
| `whatsapp_jid` | character varying | sim |  |  |
| `nao_lidas` | integer | sim | 0 |  |
| `ultima_mensagem_at` | timestamp with time zone | sim |  |  |
| `ultima_mensagem_preview` | text | sim |  |  |
| `status` | character varying | sim | 'aberta'::character varying |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `telefone_externo` | character varying(20) | sim |  |  |
| `nome_externo` | character varying(255) | sim |  |  |
| `foto_perfil_url` | text | sim |  |  |
| `departamento` | text | não | 'administrativo'::text |  |

**Únicos:** admin_conversas_pkey, idx_admin_conversas_aluno_unidade_depto_sem_jid, idx_admin_conversas_externo_unidade_depto, uq_admin_conversas_jid_depto

## admin_mensagens

> Mensagens das conversas administrativas com alunos

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `conversa_id` | uuid | não |  | admin_conversas.id |
| `aluno_id` | integer | sim |  | alunos.id |
| `direcao` | character varying | não |  |  |
| `tipo` | character varying | sim | 'texto'::character varying |  |
| `conteudo` | text | sim |  |  |
| `midia_url` | text | sim |  |  |
| `midia_mimetype` | character varying | sim |  |  |
| `midia_nome` | character varying | sim |  |  |
| `remetente` | character varying | não |  |  |
| `remetente_nome` | character varying | sim |  |  |
| `status_entrega` | character varying | sim | 'enviando'::character varying |  |
| `whatsapp_message_id` | character varying | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `reacoes` | jsonb | sim | '[]'::jsonb |  |
| `deletada` | boolean | não | false |  |
| `editada` | boolean | não | false |  |

**Únicos:** admin_mensagens_pkey, admin_mensagens_whatsapp_message_id_key

**Triggers:** trg_normalizar_wa_msg_id → normalizar_whatsapp_message_id()

## alunos_emusys_atributos_decisoes

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não | nextval('alunos_emusys_atributos_decisoes_id_seq'::regclass) |  |
| `divergencia_id` | bigint | não |  | alunos_emusys_atributos_divergencias.id |
| `aluno_id` | integer | sim |  | alunos.id |
| `decisao` | text | não |  |  |
| `campo` | text | não |  |  |
| `valor_nosso` | jsonb | não | '{}'::jsonb |  |
| `valor_emusys` | jsonb | não | '{}'::jsonb |  |
| `valor_aplicado` | jsonb | não | '{}'::jsonb |  |
| `motivo` | text | sim |  |  |
| `decidido_por` | text | não | 'usuario_app'::text |  |
| `decidido_em` | timestamp with time zone | não | now() |  |
| `metadata` | jsonb | não | '{}'::jsonb |  |
| `created_at` | timestamp with time zone | não | now() |  |

**Únicos:** alunos_emusys_atributos_decisoes_pkey

## alunos_emusys_atributos_divergencias

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não | nextval('alunos_emusys_atributos_divergencias_id_seq'::regclass) |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `aluno_id` | integer | sim |  | alunos.id |
| `emusys_student_id` | text | sim |  |  |
| `emusys_matricula_id` | text | sim |  |  |
| `tipo_divergencia` | text | não |  |  |
| `campo` | text | não |  |  |
| `valor_nosso` | jsonb | não | '{}'::jsonb |  |
| `valor_emusys` | jsonb | não | '{}'::jsonb |  |
| `sugestao` | jsonb | não | '{}'::jsonb |  |
| `fonte` | text | não | 'emusys_matriculas'::text |  |
| `severidade` | text | não | 'media'::text |  |
| `resolvido` | boolean | não | false |  |
| `decisao` | text | sim |  |  |
| `decidido_por` | text | sim |  |  |
| `decidido_em` | timestamp with time zone | sim |  |  |
| `detectado_em` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:** alunos_emusys_atributos_divergencias_pkey, alunos_emusys_atributos_pendente_uq

**Triggers:** set_updated_at_alunos_emusys_atributos_divergencias → set_updated_at()

## automacao_invariantes

> Registra violações de invariantes de negócio detectadas nos webhooks Emusys (matrícula em tempo real) ou via cron auditor (lead/experimental/alunos).

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não | nextval('automacao_invariantes_id_seq'::regclass) |  |
| `log_id` | bigint | não |  | automacao_log.id |
| `regra` | text | não |  |  |
| `severidade` | text | não |  |  |
| `mensagem` | text | não |  |  |
| `visto_em` | timestamp with time zone | sim |  |  |
| `visto_por` | uuid | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |

**Únicos:** automacao_invariantes_pkey

## automacao_log

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não | nextval('automacao_log_id_seq'::regclass) |  |
| `aluno_nome` | text | não |  |  |
| `aluno_id` | integer | sim |  |  |
| `unidade_nome` | text | sim |  |  |
| `evento` | text | não |  |  |
| `acao` | text | não |  |  |
| `detalhes` | jsonb | sim |  |  |
| `workflow_id` | text | sim |  |  |
| `execution_id` | text | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `status` | text | não | 'ok'::text |  |
| `lead_id` | bigint | sim |  |  |
| `payload_bruto` | jsonb | sim |  |  |
| `idempotency_key` | text | sim |  |  |

**Únicos:** automacao_log_idempotency_key_uq, automacao_log_pkey

**Triggers:** trg_automacao_check_professor → check_automacao_professor_vinculado()

## automacoes_config

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `slug` | text | não |  |  |
| `ativo` | boolean | não | false |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:** automacoes_config_pkey

## base_conhecimento_blocos

> Base de conhecimento da LA Music, em blocos. Consumida pelos agentes SDR Mila (via RPC get_base_conhecimento + edge base-conhecimento) e pela equipe, na subaba Conhecimento em Pré-Atendimento > Configurações.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `titulo` | text | não |  |  |
| `conteudo` | text | não |  |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `ordem` | integer | não | 0 |  |
| `ativo` | boolean | não | true |  |
| `atualizado_por` | uuid | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:** base_conhecimento_blocos_pkey

**Triggers:** trg_base_conhecimento_blocos_updated_at → update_updated_at_column()

## boas_vindas_enviadas

> Idempotencia da boas-vindas de matricula (1 envio por matricula). Ver edge function enviar-boas-vindas-matricula.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `chave_idempotencia` | text | não |  |  |
| `telefone` | text | sim |  |  |
| `nome_aluno` | text | sim |  |  |
| `nome_curso` | text | sim |  |  |
| `tipo` | text | sim |  |  |
| `unidade` | text | sim |  |  |
| `enviado_ok` | boolean | sim |  |  |
| `enviado_em` | timestamp with time zone | não | now() |  |

**Únicos:** boas_vindas_enviadas_chave_idempotencia_key, boas_vindas_enviadas_pkey

## conversa_estado_whatsapp

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `whatsapp_numero` | text | não |  |  |
| `estado` | character varying(50) | não | 'idle'::character varying |  |
| `contexto` | jsonb | sim | '{}'::jsonb |  |
| `expira_em` | timestamp with time zone | não |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:** conversa_estado_whatsapp_pkey, conversa_estado_whatsapp_whatsapp_numero_key

**Triggers:** tr_updated_at_conversa_estado → update_updated_at_column()

## curso_emusys_depara

> De-para (unidade, disciplina_id Emusys) -> curso. Casamento por ID, imune a renomeação. Fonte: GET /disciplinas.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade_id` | uuid | não |  | unidades.id |
| `emusys_disciplina_id` | integer | não |  |  |
| `curso_id` | integer | sim |  | cursos.id |
| `emusys_nome` | text | sim |  |  |
| `atualizado_em` | timestamp with time zone | não | now() |  |
| `status_mapeamento` | text | não | 'pendente'::text |  |

**Únicos:** curso_emusys_depara_pkey

## emusys_api_payload

> Espelho de debug do payload bruto da API Emusys. Sem FK e sem vínculo com o sistema. Uso: comparar Emusys x base manualmente. Não alimenta nada.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não |  |  |
| `endpoint` | text | não |  |  |
| `unidade_codigo` | text | sim |  |  |
| `emusys_id` | bigint | sim |  |  |
| `emusys_student_id` | bigint | sim |  |  |
| `aluno_nome` | text | sim |  |  |
| `aluno_nome_normalizado` | text | sim |  |  |
| `status` | text | sim |  |  |
| `curso_nome` | text | sim |  |  |
| `data_ultima_aula` | date | sim |  |  |
| `payload` | jsonb | não |  |  |
| `synced_at` | timestamp with time zone | não | now() |  |

**Únicos:** emusys_api_payload_pkey

## emusys_aula_alunos_historico_staging_v1

> Linhas distintas de roster observadas no historico; registros existentes nunca sao apagados pelo coletor.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não |  |  |
| `aula_staging_id` | bigint | não |  | emusys_aulas_historico_staging_v1.id |
| `execucao_id` | uuid | não |  | emusys_historico_backfill_execucoes_v1.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `emusys_aula_id` | bigint | não |  |  |
| `emusys_aluno_id` | bigint | sim |  |  |
| `aluno_id` | integer | sim |  |  |
| `aluno_nome_origem` | text | sim |  |  |
| `emusys_matricula_id` | bigint | sim |  |  |
| `emusys_matricula_disciplina_id` | bigint | sim |  |  |
| `presenca_origem` | text | sim |  |  |
| `justificada_origem` | boolean | sim |  |  |
| `linha_hash` | text | não |  |  |
| `payload` | jsonb | não |  |  |
| `coletado_em` | timestamp with time zone | não | now() |  |

**Únicos:** emusys_aula_alunos_historico_sta_aula_staging_id_linha_hash_key, emusys_aula_alunos_historico_staging_v1_pkey

## emusys_aulas_historico_revisoes_v1

> Evidencia append-only das versoes distintas observadas para uma aula do Emusys.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não |  |  |
| `aula_staging_id` | bigint | não |  | emusys_aulas_historico_staging_v1.id |
| `execucao_id` | uuid | não |  | emusys_historico_backfill_execucoes_v1.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `emusys_aula_id` | bigint | não |  |  |
| `payload_hash` | text | não |  |  |
| `payload` | jsonb | não |  |  |
| `primeira_coleta_em` | timestamp with time zone | não | now() |  |
| `ultima_coleta_em` | timestamp with time zone | não | now() |  |
| `vezes_observado` | integer | não | 1 |  |

**Únicos:** emusys_aulas_historico_reviso_unidade_id_emusys_aula_id_pay_key, emusys_aulas_historico_revisoes_v1_pkey

## emusys_aulas_historico_staging_v1

> Ultima versao observada de cada aula historica; versoes anteriores ficam na tabela de revisoes.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não |  |  |
| `execucao_id` | uuid | não |  | emusys_historico_backfill_execucoes_v1.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `emusys_aula_id` | bigint | não |  |  |
| `data_hora_inicio` | timestamp with time zone | sim |  |  |
| `data_hora_inicio_original` | timestamp with time zone | sim |  |  |
| `categoria` | text | sim |  |  |
| `cancelada` | boolean | não | false |  |
| `reagendada` | boolean | não | false |  |
| `justificada` | boolean | não | false |  |
| `emusys_turma_id` | bigint | sim |  |  |
| `turma_nome` | text | sim |  |  |
| `emusys_disciplina_id` | bigint | sim |  |  |
| `disciplina_nome` | text | sim |  |  |
| `emusys_professor_id` | bigint | sim |  |  |
| `professor_nome` | text | sim |  |  |
| `sem_acompanhamento` | boolean | não | false |  |
| `payload` | jsonb | não |  |  |
| `payload_hash` | text | não |  |  |
| `coletado_em` | timestamp with time zone | não | now() |  |
| `atualizado_em` | timestamp with time zone | não | now() |  |

**Únicos:** emusys_aulas_historico_staging_v1_pkey, emusys_aulas_historico_staging_v1_unidade_id_emusys_aula_id_key

## emusys_disciplinas_catalogo

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `emusys_disciplina_id` | integer | não |  |  |
| `nome_emusys` | text | não |  |  |
| `modalidade` | text | não |  |  |
| `ativo_origem` | boolean | não | true |  |
| `primeiro_visto_em` | timestamp with time zone | não | now() |  |
| `ultimo_visto_em` | timestamp with time zone | não | now() |  |
| `sincronizado_em` | timestamp with time zone | não | now() |  |
| `ultima_execucao_id` | uuid | não |  | emusys_professor_disciplinas_sync_execucoes.id |
| `payload_snapshot` | jsonb | não | '{}'::jsonb |  |
| `hash_payload` | text | não |  |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:** emusys_disciplinas_catalogo_pkey, emusys_disciplinas_catalogo_unidade_id_emusys_disciplina_id_key

## emusys_experimentais_raw

> Bruto por aluno das aulas experimentais do Emusys. Nao altera lead_experimentais, status, presenca ou KPI canonico.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não | nextval('emusys_experimentais_raw_id_seq'::regclass) |  |
| `raw_key` | text | não |  |  |
| `emusys_aula_id` | integer | não |  |  |
| `aula_emusys_id` | integer | sim |  | aulas_emusys.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `data_aula` | date | não |  |  |
| `horario_aula` | time without time zone | sim |  |  |
| `aluno_nome` | text | não |  |  |
| `aluno_nome_normalizado` | text | não |  |  |
| `aluno_telefone` | text | não | ''::text |  |
| `responsavel_nome` | text | sim |  |  |
| `responsavel_telefone` | text | sim |  |  |
| `professor_nome` | text | sim |  |  |
| `professor_id` | integer | sim |  | professores.id |
| `curso_nome` | text | sim |  |  |
| `curso_id` | integer | sim |  | cursos.id |
| `presenca_emusys` | text | sim |  |  |
| `situacao_operacional` | text | não | 'desconhecida'::text |  |
| `lead_id` | integer | sim |  | leads.id |
| `aluno_id` | integer | sim |  | alunos.id |
| `lead_experimental_id` | integer | sim |  | lead_experimentais.id |
| `payload` | jsonb | não | '{}'::jsonb |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |
| `emusys_lead_id` | integer | sim |  |  |
| `emusys_aluno_id` | integer | sim |  |  |
| `participante_chave` | text | sim |  |  |
| `snapshot_ativo` | boolean | não | false |  |
| `snapshot_execucao_id` | uuid | sim |  | emusys_experimentais_snapshot_execucoes.id |
| `snapshot_visto_em` | timestamp with time zone | sim |  |  |
| `snapshot_inativado_em` | timestamp with time zone | sim |  |  |
| `emusys_lead_id_zero` | boolean | não | false |  |

**Únicos:** emusys_experimentais_raw_pkey, emusys_experimentais_raw_raw_key_idx, emusys_experimentais_raw_snapshot_ativo_key_idx

**Triggers:** trg_emusys_experimentais_raw_updated_at → update_updated_at_column(), trg_normalizar_payload_emusys_experimental_minimo → normalizar_payload_emusys_experimental_minimo()

## emusys_experimentais_refresh_admissoes

> Single-flight e janela de frescor do refresh Emusys por unidade, intervalo e origem.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `data_inicio` | date | não |  |  |
| `data_fim` | date | não |  |  |
| `origem` | text | não |  |  |
| `bucket_inicio` | timestamp with time zone | não |  |  |
| `status` | text | não |  |  |
| `snapshot_execucao_id` | uuid | não |  |  |
| `lease_ate` | timestamp with time zone | não |  |  |
| `tentativas` | integer | não | 1 |  |
| `erro_codigo` | text | sim |  |  |
| `criado_em` | timestamp with time zone | não | clock_timestamp() |  |
| `atualizado_em` | timestamp with time zone | não | clock_timestamp() |  |
| `concluido_em` | timestamp with time zone | sim |  |  |

**Únicos:** emusys_experimentais_refresh__unidade_id_data_inicio_data_f_key, emusys_experimentais_refresh_admissoes_pkey

## emusys_experimentais_snapshot_execucoes

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não |  |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `data_inicio` | date | não |  |  |
| `data_fim` | date | não |  |  |
| `status` | text | não |  |  |
| `linhas_recebidas` | integer | não |  |  |
| `linhas_ativas` | integer | não |  |  |
| `linhas_inativadas` | integer | não |  |  |
| `iniciado_em` | timestamp with time zone | não |  |  |
| `concluido_em` | timestamp with time zone | não |  |  |

**Únicos:** emusys_experimentais_snapshot_execucoes_pkey

## emusys_experimentais_snapshot_publicacoes_vigentes

> Ponteiro transacional da ultima publicacao completa por unidade para validar leituras admitidas.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade_id` | uuid | não |  | unidades.id |
| `execucao_id` | uuid | não |  | emusys_experimentais_snapshot_execucoes.id |
| `data_inicio` | date | não |  |  |
| `data_fim` | date | não |  |  |
| `origem` | text | não |  |  |
| `atualizado_em` | timestamp with time zone | não | clock_timestamp() |  |

**Únicos:** emusys_experimentais_snapshot_publicacoes_vigentes_pkey

## emusys_fatura_source_events

> Trilha append-only das confirmacoes, ausencias e resolucoes observadas por competencia.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `canonical_fatura_id` | uuid | não |  | emusys_faturas.id |
| `run_id` | uuid | não |  | sync_runs.id |
| `prior_run_id` | uuid | sim |  | sync_runs.id |
| `competencia` | date | não |  |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `emusys_fatura_id` | bigint | não |  |  |
| `event_type` | text | não |  |  |
| `source_missing` | boolean | não |  |  |
| `source_missing_reason` | text | sim |  |  |
| `details` | jsonb | não | '{}'::jsonb |  |
| `created_at` | timestamp with time zone | não | now() |  |

**Únicos:** emusys_fatura_source_events_pkey

**Triggers:** trg_emusys_fatura_source_events_append_only → fn_financeiro_snapshot_append_only()

## emusys_faturas

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `unidade_codigo` | text | não |  |  |
| `emusys_fatura_id` | bigint | não |  |  |
| `emusys_matricula_id` | bigint | sim |  |  |
| `emusys_contrato_id` | bigint | sim |  |  |
| `emusys_student_id` | bigint | sim |  |  |
| `descricao` | text | não | ''::text |  |
| `status` | text | não | ''::text |  |
| `data_vencimento` | date | não |  |  |
| `data_pagamento` | date | sim |  |  |
| `competencia` | date | não |  |  |
| `valor_original` | numeric(12,2) | não | 0 |  |
| `valor_pago` | numeric(12,2) | sim |  |  |
| `juros_e_multa` | numeric(12,2) | não | 0 |  |
| `desconto_aplicado` | numeric(12,2) | não | 0 |  |
| `desconto_fixo` | numeric(12,2) | não | 0 |  |
| `desconto_condicional` | numeric(12,2) | não | 0 |  |
| `payload` | jsonb | não | '{}'::jsonb |  |
| `synced_at` | timestamp with time zone | não | now() |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:** emusys_faturas_pkey, emusys_faturas_unidade_fatura_uniq

**Triggers:** trg_emusys_faturas_updated_at → touch_emusys_faturas_updated_at()

## emusys_historico_backfill_execucoes_v1

> Checkpoint retomavel do coletor historico Emusys do Health Score Professor V3.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `data_inicio` | date | não |  |  |
| `data_fim` | date | não |  |  |
| `janela_inicio_atual` | date | não |  |  |
| `janela_fim_atual` | date | não |  |  |
| `cursor_atual` | text | sim |  |  |
| `status` | text | não | 'pendente'::text |  |
| `paginas_processadas` | integer | não | 0 |  |
| `aulas_recebidas` | integer | não | 0 |  |
| `requisicoes_realizadas` | integer | não | 0 |  |
| `tentativas` | integer | não | 0 |  |
| `ultimo_erro_codigo` | text | sim |  |  |
| `ultimo_erro_contexto` | jsonb | sim |  |  |
| `ultimo_erro_em` | timestamp with time zone | sim |  |  |
| `iniciado_em` | timestamp with time zone | sim |  |  |
| `atualizado_em` | timestamp with time zone | não | now() |  |
| `concluido_em` | timestamp with time zone | sim |  |  |
| `criado_por` | integer | sim |  | usuarios.id |
| `created_at` | timestamp with time zone | não | now() |  |

**Únicos:** emusys_historico_backfill_execucoes_v1_pkey, uq_emusys_historico_backfill_execucao_unidade

## emusys_matriculas_estado_atual

> Fonte bruta backend-only do estado atual de cada matricula Emusys, escopada por unidade.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade_id` | uuid | não |  | unidades.id |
| `emusys_matricula_id` | bigint | não |  |  |
| `emusys_aluno_id` | bigint | sim |  |  |
| `aluno_id` | integer | sim |  | alunos.id |
| `emusys_contrato_id` | bigint | sim |  |  |
| `status_emusys` | text | não |  |  |
| `status_emusys_bruto` | text | sim |  |  |
| `motivo_inativa` | text | sim |  |  |
| `motivo_inativa_bruto` | text | sim |  |  |
| `status_local_resolvido` | text | sim |  |  |
| `status_jornada_resolvido` | text | não | 'desconhecido'::text |  |
| `tipo_movimento_resolvido` | text | sim |  |  |
| `transicao_automatica` | boolean | não | false |  |
| `motivo_auditoria` | text | sim |  |  |
| `trancamento_id` | bigint | sim |  |  |
| `trancamento_motivo` | text | sim |  |  |
| `trancamento_data_inicial` | date | sim |  |  |
| `trancamento_data_final` | date | sim |  |  |
| `payload_snapshot` | jsonb | não | '{}'::jsonb |  |
| `payload_hash` | text | não |  |  |
| `primeiro_sync_em` | timestamp with time zone | não | now() |  |
| `sincronizado_em` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:** emusys_matriculas_estado_atual_pkey

## emusys_matriculas_sync_execucoes

> Manifesto auditavel das fotografias Emusys. Somente execucao operacional concluida e fresca pode alimentar KPIs vivos.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `escopo` | text | não |  |  |
| `status` | text | não | 'running'::text |  |
| `started_at` | timestamp with time zone | não | now() |  |
| `completed_at` | timestamp with time zone | sim |  |  |
| `linhas_recebidas` | integer | não | 0 |  |
| `linhas_ativas` | integer | não | 0 |  |
| `linhas_trancadas` | integer | não | 0 |  |
| `linhas_inativadas` | integer | não | 0 |  |
| `erro` | text | sim |  |  |
| `metadados` | jsonb | não | '{}'::jsonb |  |
| `created_at` | timestamp with time zone | não | now() |  |

**Únicos:** emusys_matriculas_sync_execucoes_pkey, uq_sync_matriculas_execucao_viva_por_unidade

## emusys_professor_disciplinas

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | não |  | emusys_disciplinas_catalogo.unidade_id |
| `emusys_professor_id` | integer | não |  |  |
| `emusys_disciplina_id` | integer | não |  | emusys_disciplinas_catalogo.emusys_disciplina_id |
| `ativo_origem` | boolean | não | true |  |
| `primeiro_visto_em` | timestamp with time zone | não | now() |  |
| `ultimo_visto_em` | timestamp with time zone | não | now() |  |
| `sincronizado_em` | timestamp with time zone | não | now() |  |
| `ultima_execucao_id` | uuid | não |  | emusys_professor_disciplinas_sync_execucoes.id |
| `payload_snapshot` | jsonb | não | '{}'::jsonb |  |
| `hash_payload` | text | não |  |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:** emusys_professor_disciplinas_pkey, emusys_professor_disciplinas_unidade_id_emusys_professor_id_key

## emusys_professor_disciplinas_sync_execucoes

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `origem` | text | não |  |  |
| `status` | text | não | 'em_andamento'::text |  |
| `iniciado_em` | timestamp with time zone | não | now() |  |
| `finalizado_em` | timestamp with time zone | sim |  |  |
| `disciplinas_esperadas` | integer | não | 0 |  |
| `disciplinas_processadas` | integer | não | 0 |  |
| `requisicoes` | integer | não | 0 |  |
| `falhas` | jsonb | não | '[]'::jsonb |  |
| `estatisticas` | jsonb | não | '{}'::jsonb |  |
| `solicitado_por` | integer | sim |  | usuarios.id |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:** emusys_professor_disciplinas_sync_execucoes_pkey, uq_emusys_professor_disciplinas_sync_unidade_em_andamento

## emusys_sync_log

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `unidade_nome` | text | sim |  |  |
| `data_sync` | date | não |  |  |
| `total_aulas` | integer | sim | 0 |  |
| `total_registros` | integer | sim | 0 |  |
| `presentes` | integer | sim | 0 |  |
| `ausentes` | integer | sim | 0 |  |
| `alunos_matched` | integer | sim | 0 |  |
| `alunos_nao_encontrados` | integer | sim | 0 |  |
| `nomes_nao_encontrados` | jsonb | sim | '[]'::jsonb |  |
| `executado_em` | timestamp with time zone | sim | now() |  |
| `experimentais_count` | integer | sim | 0 |  |
| `nomes_experimentais` | jsonb | sim | '[]'::jsonb |  |
| `inativos_count` | integer | sim | 0 |  |
| `nomes_inativos` | jsonb | sim | '[]'::jsonb |  |

**Únicos:** emusys_sync_log_pkey

## fila_anamnese_sol_hermes

> Outbox Sol/Hermes para anamnese_professor. Substitui envio direto WAHA legado.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não | nextval('fila_anamnese_sol_hermes_id_seq'::regclass) |  |
| `anamnese_id` | integer | não |  | anamneses.id |
| `professor_id` | integer | não |  | professores.id |
| `professor_nome` | text | não |  |  |
| `telefone_whatsapp` | text | não |  |  |
| `jid` | text | não |  |  |
| `mensagem` | text | não |  |  |
| `status` | text | não | 'sol_pendente'::text |  |
| `agendada_para` | timestamp with time zone | não | now() |  |
| `enviada_em` | timestamp with time zone | sim |  |  |
| `erro` | text | sim |  |  |
| `message_id` | text | sim |  |  |
| `tentativas` | integer | não | 0 |  |
| `ultima_tentativa_em` | timestamp with time zone | sim |  |  |
| `notificacao_log_id` | integer | sim |  | notificacao_log.id |
| `metadata` | jsonb | não | '{}'::jsonb |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:** fila_anamnese_sol_hermes_pkey, idx_fila_anamnese_sol_hermes_open

## fila_relatorios_sol_hermes

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não | nextval('fila_relatorios_sol_hermes_id_seq'::regclass) |  |
| `tipo_relatorio` | text | não |  |  |
| `origem` | text | não | 'manual'::text |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `unidade_nome` | text | não |  |  |
| `jid` | text | não |  |  |
| `grupo_nome` | text | não |  |  |
| `texto` | text | não |  |  |
| `status` | text | não | 'sol_pendente'::text |  |
| `agendada_para` | timestamp with time zone | não | now() |  |
| `enviada_em` | timestamp with time zone | sim |  |  |
| `erro` | text | sim |  |  |
| `message_id` | text | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `data_dia` | date | não | ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date |  |
| `tentativas` | integer | não | 0 |  |
| `ultima_tentativa_em` | timestamp with time zone | sim |  |  |
| `referencia_tabela` | text | sim |  |  |
| `referencia_id` | uuid | sim |  |  |
| `metadata` | jsonb | não | '{}'::jsonb |  |

**Únicos:** fila_relatorios_sol_hermes_pkey, idx_fila_sol_hermes_dia_tipo

**Triggers:** tr_sync_caixa_envio_from_fila_sol_hermes → sync_caixa_envio_from_fila_sol_hermes(), trg_presenca_fila_proveniencia_rollout → fn_presenca_fila_proveniencia_rollout_v1()

## fila_relatorios_whatsapp

> Fila de envio dos relatórios diários por unidade — processada pelo cron processar-mensagens-agendadas com 1 min de intervalo entre cada envio

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não | nextval('fila_relatorios_whatsapp_id_seq'::regclass) |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `unidade_nome` | text | não |  |  |
| `jid` | text | não |  |  |
| `grupo_nome` | text | não |  |  |
| `texto` | text | não |  |  |
| `status` | text | não | 'pendente'::text |  |
| `agendada_para` | timestamp with time zone | não |  |  |
| `enviada_em` | timestamp with time zone | sim |  |  |
| `erro` | text | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `data_dia` | date | não | ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date |  |
| `tentativas` | integer | não | 0 |  |
| `ultima_tentativa_em` | timestamp with time zone | sim |  |  |
| `tipo_relatorio` | text | não | 'relatorio_admin'::text |  |

**Únicos:** fila_relatorios_whatsapp_pkey, idx_fila_relatorio_dia_tipo

## hermes_patch_status

> Estado do patch local do Hermes por agente (Fabio/Mila/Lia/...). Escrito por um cron root (hermes-patch-guard.sh) e lido por monitor-saude-fabio. Se patched=false ou checado_em velho, alerta no WhatsApp.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `agente` | text | não |  |  |
| `patch_nome` | text | não |  |  |
| `patched` | boolean | não |  |  |
| `detalhe` | text | sim |  |  |
| `checado_em` | timestamp with time zone | não | now() |  |

**Únicos:** hermes_patch_status_pkey

## integracao_tokens

> Tokens de escopo mínimo para integrações que chamam edges por URL. RLS sem policy: só service_role acessa. Rotacionar = UPDATE, sem redeploy.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `nome` | text | não |  |  |
| `token` | text | não |  |  |
| `descricao` | text | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:** integracao_tokens_pkey

**Triggers:** trg_integracao_tokens_updated_at → update_updated_at_column()

## lia_alertas_configuracao

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | smallint | não | 1 |  |
| `app_base_url` | text | não |  |  |
| `alertas_producao_liberados` | boolean | não | false |  |
| `atualizado_em` | timestamp with time zone | não | now() |  |
| `followup_72h_liberado` | boolean | não | false |  |

**Únicos:** lia_alertas_configuracao_pkey

## lia_alertas_privados

> Outbox privada da Lia. Producao nasce bloqueada ate piloto aceito pelo Alf.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `evento_id` | uuid | sim |  | lia_pesquisa_eventos.id |
| `destinatario_usuario_id` | integer | sim |  | usuarios.id |
| `destino_id` | uuid | sim |  | lia_destinos_privados.id |
| `destino_snapshot` | text | sim |  |  |
| `template_codigo` | text | não |  |  |
| `template_versao` | integer | não | 1 |  |
| `mensagem_renderizada` | text | sim |  |  |
| `status` | text | não |  |  |
| `motivo_pendencia` | text | sim |  |  |
| `tentativas` | integer | não | 0 |  |
| `worker_id` | uuid | sim |  |  |
| `claim_token` | uuid | sim |  |  |
| `claimed_em` | timestamp with time zone | sim |  |  |
| `provider_message_id` | text | sim |  |  |
| `enviado_em` | timestamp with time zone | sim |  |  |
| `erro_codigo` | text | sim |  |  |
| `expurgado_em` | timestamp with time zone | sim |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |
| `atualizado_em` | timestamp with time zone | não | now() |  |
| `caixa_id` | integer | não | 3 | whatsapp_caixas.id |
| `followup_resumo_id` | uuid | sim |  | lia_followup_resumos.id |

**Únicos:** lia_alertas_privados_evento_id_key, lia_alertas_privados_followup_resumo_id_key, lia_alertas_privados_pkey

## lia_destinos_privados

> Destinos privados governados da Lia; nunca resolvidos de cadastro operacional em runtime.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `usuario_id` | integer | não |  | usuarios.id |
| `canal` | text | não | 'whatsapp'::text |  |
| `destino_normalizado` | text | não |  |  |
| `fonte_verificacao` | text | não |  |  |
| `verificado_em` | timestamp with time zone | não |  |  |
| `ativo` | boolean | não | true |  |
| `criado_em` | timestamp with time zone | não | now() |  |
| `desativado_em` | timestamp with time zone | sim |  |  |

**Únicos:** lia_destinos_privados_pkey, lia_destinos_privados_usuario_ativo_uidx

## lia_followup_resumo_itens

> Vinculo auditavel dos casos incluidos no resumo, sem duplicar telefone ou resposta.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `resumo_id` | uuid | não |  | lia_followup_resumos.id |
| `pesquisa_id` | uuid | não |  | pesquisa_evasao.id |
| `ambiente` | text | não |  |  |
| `vencido_em_snapshot` | timestamp with time zone | não |  |  |
| `interacao_nao_substantiva_snapshot` | boolean | não |  |  |
| `cancelado_em` | timestamp with time zone | sim |  |  |
| `cancelamento_motivo` | text | sim |  |  |
| `criado_em` | timestamp with time zone | não | clock_timestamp() |  |

**Únicos:** lia_followup_resumo_itens_pesquisa_id_ambiente_key, lia_followup_resumo_itens_pkey

## lia_followup_resumos

> Resumo privado diario por operador, produzido as 09:00 BRT e entregue pela outbox da Lia.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `ambiente` | text | não |  |  |
| `operador_usuario_id` | integer | não |  | usuarios.id |
| `data_corte_brt` | date | não |  |  |
| `total_casos` | integer | não |  |  |
| `idempotency_key` | text | não |  |  |
| `criado_em` | timestamp with time zone | não | clock_timestamp() |  |

**Únicos:** lia_followup_resumos_idempotency_key_key, lia_followup_resumos_pkey, lia_followup_resumos_producao_operador_data_uidx

## lia_pesquisa_eventos

> Fatos imutaveis e sem conteudo da resposta para alertas da pesquisa de evasao.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `tipo` | text | não |  |  |
| `ambiente` | text | não |  |  |
| `pesquisa_id` | uuid | não |  | pesquisa_evasao.id |
| `analise_versao` | integer | não |  |  |
| `operador_usuario_id` | integer | sim |  | usuarios.id |
| `aluno_nome_snapshot` | text | não |  |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `unidade_nome_snapshot` | text | não |  |  |
| `ocorrido_em` | timestamp with time zone | não |  |  |
| `idempotency_key` | text | não |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |

**Únicos:** lia_pesquisa_eventos_idempotency_key_key, lia_pesquisa_eventos_opt_out_rodada_uidx, lia_pesquisa_eventos_pkey, lia_pesquisa_eventos_resposta_rodada_uidx

## matriculas_divergencias

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não | nextval('matriculas_divergencias_id_seq'::regclass) |  |
| `aluno_id` | integer | sim |  | alunos.id |
| `emusys_matricula_id` | text | sim |  |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `tipo_divergencia` | text | não |  |  |
| `campo` | text | sim |  |  |
| `valor_nosso` | jsonb | sim |  |  |
| `valor_api` | jsonb | sim |  |  |
| `sugestao` | jsonb | sim |  |  |
| `severidade` | text | sim | 'media'::text |  |
| `resolvido` | boolean | não | false |  |
| `detectado_em` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |
| `fonte` | text | não | 'sync'::text |  |
| `analise_sol` | text | sim |  |  |

**Únicos:** matriculas_divergencias_aluno_id_tipo_divergencia_campo_key, matriculas_divergencias_pkey

## matriculas_divergencias_decisoes

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não | nextval('matriculas_divergencias_decisoes_id_seq'::regclass) |  |
| `divergencia_id` | bigint | não |  | matriculas_divergencias.id |
| `aluno_id` | integer | sim |  |  |
| `decisao` | text | não |  |  |
| `valor_escolhido` | jsonb | sim |  |  |
| `motivo` | text | não |  |  |
| `decidido_por` | text | não |  |  |
| `decidido_em` | timestamp with time zone | não | now() |  |
| `metadata` | jsonb | não | '{}'::jsonb |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:** matriculas_divergencias_decisoes_divergencia_id_key, matriculas_divergencias_decisoes_pkey

## matriculas_emusys_decisoes_canonicas

> Decisoes canonicas por unidade + matricula Emusys. Usada para blindar o sync contra excecoes validadas: bolsista, responsavel, banda, bloqueios e revisoes.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não | nextval('matriculas_emusys_decisoes_canonicas_id_seq'::regclass) |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `emusys_matricula_id` | text | não |  |  |
| `aluno_id` | integer | sim |  | alunos.id |
| `tipo_decisao` | text | não |  |  |
| `campos_bloqueados` | text[] | não | ARRAY[]::text[] |  |
| `tipo_matricula_codigo` | text | sim |  |  |
| `status_pagamento` | text | sim |  |  |
| `valor_parcela` | numeric | sim |  |  |
| `ignorar_sync` | boolean | não | false |  |
| `motivo` | text | sim |  |  |
| `snapshot_emusys` | jsonb | não | '{}'::jsonb |  |
| `created_by` | text | não | 'sistema'::text |  |
| `updated_by` | text | não | 'sistema'::text |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:** matriculas_emusys_decisoes_canonicas_pkey, matriculas_emusys_decisoes_canonicas_unique

## notificacao_config

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('notificacao_config_id_seq'::regclass) |  |
| `tipo` | character varying(50) | não |  |  |
| `ativo` | boolean | sim | true |  |
| `antecedencia_dias` | integer | sim | 3 |  |
| `dias_inatividade` | integer | sim | 7 |  |
| `dia_semana` | integer | sim | 1 |  |
| `hora_envio` | time without time zone | sim | '09:00:00'::time without time zone |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:** notificacao_config_pkey, notificacao_config_tipo_key

**Triggers:** update_notificacao_config_updated_at → update_updated_at_column()

## notificacao_destinatarios

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('notificacao_destinatarios_id_seq'::regclass) |  |
| `config_id` | integer | não |  | notificacao_config.id |
| `pessoa_tipo` | character varying(20) | não |  |  |
| `pessoa_id` | integer | não |  |  |
| `canal` | character varying(20) | não | 'whatsapp'::character varying |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:** notificacao_destinatarios_config_id_pessoa_tipo_pessoa_id_key, notificacao_destinatarios_pkey

## notificacao_log

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('notificacao_log_id_seq'::regclass) |  |
| `config_id` | integer | sim |  | notificacao_config.id |
| `tipo` | character varying(50) | não |  |  |
| `destinatario_tipo` | character varying(20) | não |  |  |
| `destinatario_id` | integer | não |  |  |
| `canal` | character varying(20) | não |  |  |
| `mensagem` | text | não |  |  |
| `projeto_id` | integer | sim |  | projetos.id |
| `tarefa_id` | integer | sim |  | projeto_tarefas.id |
| `status` | character varying(20) | sim | 'pendente'::character varying |  |
| `erro_mensagem` | text | sim |  |  |
| `enviado_at` | timestamp with time zone | sim | now() |  |
| `lido_at` | timestamp with time zone | sim |  |  |

**Únicos:** notificacao_log_pkey

## orquestracao_locks_v1

> Trava com TTL para orquestradores re-entrantes (cron → edge que precisa de N chamadas). Primeiro uso: orquestrar-historico-professor.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `chave` | text | não |  |  |
| `travado_ate` | timestamp with time zone | não | (now() - '00:00:01'::interval) |  |
| `travado_por` | text | sim |  |  |
| `atualizado_em` | timestamp with time zone | não | now() |  |

**Únicos:** orquestracao_locks_v1_pkey

## sync_run_items

> Snapshot imutavel por run/competencia/unidade/fatura, incluindo tombstones de nao confirmacao pela origem.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `run_id` | uuid | não |  | sync_runs.id |
| `canonical_fatura_id` | uuid | não |  | emusys_faturas.id |
| `competencia` | date | não |  |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `unidade_codigo` | text | não |  |  |
| `emusys_fatura_id` | bigint | não |  |  |
| `emusys_matricula_id` | bigint | sim |  |  |
| `emusys_contrato_id` | bigint | sim |  |  |
| `emusys_student_id` | bigint | sim |  |  |
| `descricao` | text | não | ''::text |  |
| `status` | text | não | 'desconhecido'::text |  |
| `data_vencimento` | date | não |  |  |
| `data_pagamento` | date | sim |  |  |
| `valor_original` | numeric(12,2) | não | 0 |  |
| `valor_pago` | numeric(12,2) | sim |  |  |
| `juros_e_multa` | numeric(12,2) | não | 0 |  |
| `desconto_aplicado` | numeric(12,2) | não | 0 |  |
| `desconto_fixo` | numeric(12,2) | não | 0 |  |
| `desconto_condicional` | numeric(12,2) | não | 0 |  |
| `payload` | jsonb | não | '{}'::jsonb |  |
| `source_missing` | boolean | não | false |  |
| `source_missing_reason` | text | sim |  |  |
| `source_last_seen_at` | timestamp with time zone | sim |  |  |
| `source_missing_detected_at` | timestamp with time zone | sim |  |  |
| `source_missing_resolved_at` | timestamp with time zone | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |

**Únicos:** sync_run_items_identidade_uniq, sync_run_items_pkey

**Triggers:** trg_sync_run_items_append_only → fn_financeiro_snapshot_append_only()

## sync_run_overrides

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `run_id` | uuid | não |  | sync_runs.id |
| `competencia` | date | não |  |  |
| `baseline_run_id` | uuid | sim |  | sync_runs.id |
| `baseline_count` | integer | não |  |  |
| `missing_count` | integer | não |  |  |
| `override_reason` | text | não |  |  |
| `actor_role` | text | não |  |  |
| `actor_subject` | text | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |

**Únicos:** sync_run_overrides_pkey

**Triggers:** trg_sync_run_overrides_append_only → fn_financeiro_snapshot_append_only()

## sync_runs

> Execucoes preservadas do sync financeiro. Somente live completo prova frescor; baseline serve apenas para comparacao.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `competencia` | date | não |  |  |
| `run_type` | text | não | 'live'::text |  |
| `status` | text | não | 'running'::text |  |
| `trigger_source` | text | não |  |  |
| `requested_by` | text | sim |  |  |
| `started_at` | timestamp with time zone | não | now() |  |
| `completed_at` | timestamp with time zone | sim |  |  |
| `stale_after` | timestamp with time zone | não |  |  |
| `unidades_concluidas` | integer | não | 0 |  |
| `units_summary` | jsonb | não | '[]'::jsonb |  |
| `snapshot_complete` | boolean | não | false |  |
| `total_emusys` | integer | não | 0 |  |
| `total_inseridos` | integer | não | 0 |  |
| `total_atualizados` | integer | não | 0 |  |
| `total_ausentes_marcados` | integer | não | 0 |  |
| `baseline_source` | text | sim |  |  |
| `erro_detalhe` | text | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:** sync_runs_baseline_competencia_uniq, sync_runs_global_running_uniq, sync_runs_pkey

**Triggers:** trg_sync_runs_guard → fn_financeiro_sync_run_guard()

## vcards_unidade

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `titulo` | text | não |  |  |
| `full_name` | text | não |  |  |
| `telefones` | text[] | não | '{}'::text[] |  |
| `organizacao` | text | sim |  |  |
| `email` | text | sim |  |  |
| `url` | text | sim |  |  |
| `ativo` | boolean | não | true |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:** vcards_unidade_pkey

**Triggers:** trg_vcards_unidade_updated_at → set_updated_at()

## vw_fila_audio_sem_roster

> Áudio de aula COMUM parado porque a aula operacional não tem nenhum aluno no roster. Régua de FATO (ausência de linha em aula_alunos_emusys), nunca o texto do campo erro — aquele é escrito pelo agente. Buraco conhecido: fn_aula_operacional_id devolve NULL quando não há candidata NÃO cancelada, então quem gravou sobre aula cancelada e sem gêmeo cai fora deste join. Medido em 15/08: 0 linhas nessa situação — buraco teórico hoje, não perda em curso.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `fila_id` | uuid | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `aula_id_da_fila` | integer | sim |  |  |
| `aula_operacional_id` | integer | sim |  |  |
| `status` | text | sim |  |  |
| `origem` | text | sim |  |  |
| `criado_em` | timestamp with time zone | sim |  |  |
| `atualizado_em` | timestamp with time zone | sim |  |  |
| `tem_audio` | boolean | sim |  |  |
| `tem_transcricao` | boolean | sim |  |  |
| `tipo` | character varying(30) | sim |  |  |
| `categoria` | character varying(30) | sim |  |  |
| `turma_nome` | character varying(100) | sim |  |  |
| `curso_nome` | character varying(100) | sim |  |  |
| `qtd_alunos_emusys` | integer | sim |  |  |
| `inicio_brt` | timestamp without time zone | sim |  |  |
| `ja_tem_registro` | boolean | sim |  |  |

## vw_whatsapp_caixas_departamento

> Projecao somente-leitura de whatsapp_caixas (id + departamento), sem credenciais. Existe para RPCs SECURITY INVOKER poderem filtrar por departamento sem destrancar a tabela base.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | sim |  |  |
| `departamento` | text | sim |  |  |

## webhook_debug_log

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('webhook_debug_log_id_seq'::regclass) |  |
| `payload` | jsonb | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:** webhook_debug_log_pkey

## whatsapp_caixas

> Caixas de WhatsApp configuradas para cada unidade

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('whatsapp_caixas_id_seq'::regclass) |  |
| `nome` | character varying(255) | não |  |  |
| `numero` | character varying(50) | sim |  |  |
| `uazapi_url` | character varying(500) | não |  |  |
| `uazapi_token` | character varying(500) | não |  |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `ativo` | boolean | sim | true |  |
| `webhook_url` | text | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `funcao` | text | não | 'agente'::text |  |
| `provedor` | text | não | 'uazapi'::text |  |
| `waha_url` | text | sim |  |  |
| `waha_session` | text | sim |  |  |
| `waha_api_key` | text | sim |  |  |
| `departamento` | text | não | 'administrativo'::text |  |

**Únicos:** whatsapp_caixas_pkey

## whatsapp_caixas_credenciais_auditoria

> Auditoria sem valor secreto para rotações write-only de credenciais WhatsApp.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não |  |  |
| `caixa_id` | integer | não |  | whatsapp_caixas.id |
| `auth_user_id` | uuid | não |  |  |
| `credencial` | text | não |  |  |
| `rotacionada_em` | timestamp with time zone | não | now() |  |

**Únicos:** whatsapp_caixas_credenciais_auditoria_pkey

## whatsapp_config

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('whatsapp_config_id_seq'::regclass) |  |
| `hora_inicio` | character varying(5) | sim | '08:00'::character varying |  |
| `hora_fim` | character varying(5) | sim | '18:00'::character varying |  |
| `dias_semana` | text[] | sim | ARRAY['seg'::text, 'ter'::text, 'qua'::text, 'qui'::text, 'sex'::text] |  |
| `ativo` | boolean | sim | true |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:** whatsapp_config_pkey

## whatsapp_destinatarios_relatorio

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('whatsapp_destinatarios_relatorio_id_seq'::regclass) |  |
| `tipo` | text | não |  |  |
| `nome` | text | não |  |  |
| `jid` | text | não |  |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `ativo` | boolean | não | true |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `caixa_id` | integer | sim |  | whatsapp_caixas.id |

**Únicos:** whatsapp_destinatarios_relatorio_pkey

