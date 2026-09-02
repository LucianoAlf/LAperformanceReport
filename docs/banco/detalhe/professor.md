<!-- GERADO POR scripts/gerar-mapa-banco.mjs — NÃO EDITE À MÃO.
     Banco: ouqwbbermlzqqvtqwlul · Gerado em: 2026-09-02 -->

<!-- fim do cabecalho gerado -->
# Detalhe do banco — professor

126 objetos. Resumo de todos os domínios em `../TABELAS.gerado.md`.

## anotacoes

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | uuid_generate_v4() |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `ano` | integer | sim |  |  |
| `mes` | integer | sim |  |  |
| `tipo` | character varying(50) | não |  |  |
| `titulo` | character varying(200) | não |  |  |
| `descricao` | text | sim |  |  |
| `cor` | character varying(20) | sim | 'cyan'::character varying |  |
| `resolvido` | boolean | sim | false |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:** anotacoes_pkey

**Triggers:** tr_anotacoes_updated_at → update_updated_at()

## anotacoes_alunos

> Anotações e observações sobre alunos

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('anotacoes_alunos_id_seq'::regclass) |  |
| `aluno_id` | integer | não |  | alunos.id |
| `texto` | text | não |  |  |
| `categoria` | character varying(50) | sim | 'geral'::character varying |  |
| `criado_por` | character varying(255) | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `resolvido` | boolean | sim | false |  |

**Únicos:** anotacoes_alunos_pkey

## app_audio_preso_no_aparelho

> Farol do app (20260827170000): estado ATUAL da fila local de audios de cada professor. Uma linha por professor, sobrescrita — e o zero tambem e reportado, senao o alarme de ontem nunca apaga. Sem isto, audio recusado fica so no aparelho e nenhuma auditoria pode ve-lo (caso Valdo/Bruno, 26/08/2026).

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `professor_id` | integer | não |  | professores.id |
| `presos` | integer | não | 0 |  |
| `terminais` | integer | não | 0 |  |
| `mais_antigo` | timestamp with time zone | sim |  |  |
| `atualizado_em` | timestamp with time zone | não | now() |  |

**Únicos:** app_audio_preso_no_aparelho_pkey

## aula_alunos_emusys

> Roster operacional de aulas do Emusys, sem contato ou dados financeiros.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não |  |  |
| `aula_emusys_id` | integer | não |  | aulas_emusys.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `aluno_chave` | text | não |  |  |
| `aluno_emusys_id` | bigint | sim |  |  |
| `aluno_id` | integer | sim |  | alunos.id |
| `aluno_nome` | text | não |  |  |
| `aluno_nome_normalizado` | text | não |  |  |
| `sincronizado_em` | timestamp with time zone | não | now() |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |
| `emusys_lead_id` | integer | sim |  |  |
| `ativo_operacional` | boolean | não | false |  |
| `ultimo_run_visto` | uuid | sim |  |  |
| `inativado_em` | timestamp with time zone | sim |  |  |
| `inativado_motivo` | text | sim |  |  |

**Únicos:** aula_alunos_emusys_aula_chave_uq, aula_alunos_emusys_pkey

**Triggers:** trg_aula_alunos_emusys_casar_aluno → fn_aula_alunos_emusys_casar_aluno(), trg_aula_alunos_emusys_reconcilia_chave → fn_aula_alunos_emusys_reconcilia_chave(), trg_experimental_recebe_id_da_aula → fn_experimental_recebe_id_da_aula(), trg_presenca_roster_lock_v2 → fn_presenca_roster_lock_trigger_v2()

## aula_registros_fabio_log

> Auditoria das gravações do Fábio em aulas_emusys.anotacoes_fabio. É trilha de rastreabilidade, não o lar do registro (o registro vive em anotacoes_fabio).

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não |  |  |
| `aula_id` | integer | não |  | aulas_emusys.id |
| `professor_id` | integer | sim |  |  |
| `texto_anterior` | text | sim |  |  |
| `texto_novo` | text | sim |  |  |
| `origem` | text | sim |  |  |
| `modo` | text | sim |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |

**Únicos:** aula_registros_fabio_log_pkey

## aula_roster_sync_estado

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `aula_id` | integer | não |  | aulas_emusys.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `run_id` | uuid | não |  |  |
| `estado` | text | não |  |  |
| `qtd_esperada` | integer | não |  |  |
| `qtd_recebida` | integer | não |  |  |
| `snapshot_hash` | text | não |  |  |
| `sincronizado_em` | timestamp with time zone | não | clock_timestamp() |  |
| `atualizado_em` | timestamp with time zone | não | clock_timestamp() |  |

**Únicos:** aula_roster_sync_estado_pkey

**Triggers:** trg_presenca_estado_roster_lock_v2 → fn_presenca_estado_roster_lock_trigger_v2()

## aulas_emusys

> Metadados completos de cada aula importada do Emusys (turma, curso, sala, professor, horários)

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('aulas_emusys_id_seq'::regclass) |  |
| `emusys_id` | integer | não |  |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `data_aula` | date | não |  |  |
| `data_hora_inicio` | timestamp with time zone | não |  |  |
| `data_hora_fim` | timestamp with time zone | sim |  |  |
| `duracao_minutos` | integer | sim |  |  |
| `tipo` | character varying(30) | sim |  |  |
| `categoria` | character varying(30) | sim |  |  |
| `turma_nome` | character varying(100) | sim |  |  |
| `curso_emusys_id` | integer | sim |  |  |
| `curso_nome` | character varying(100) | sim |  |  |
| `sala_nome` | character varying(100) | sim |  |  |
| `professor_nome` | character varying(200) | sim |  |  |
| `professor_id` | integer | sim |  | professores.id |
| `cancelada` | boolean | sim | false |  |
| `nr_da_aula` | integer | sim |  |  |
| `qtd_alunos` | integer | sim |  |  |
| `anotacoes` | text | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `anotacoes_fabio` | text | sim |  |  |
| `matricula_disciplina_id` | bigint | sim |  |  |
| `qtd_aulas_contrato` | integer | sim |  |  |
| `reagendada` | boolean | não | false |  |
| `data_hora_inicio_original` | timestamp with time zone | sim |  |  |
| `justificada` | boolean | não | false |  |
| `professor_presenca` | text | sim |  |  |
| `emusys_professor_id` | integer | sim |  |  |
| `sem_acompanhamento` | boolean | não | false |  |
| `cancelada_origem` | text | sim |  |  |
| `cancelada_motivo` | text | sim |  |  |
| `cancelada_evidencia_path` | text | sim |  |  |
| `cancelada_por_usuario_id` | integer | sim |  | usuarios.id |
| `cancelada_em` | timestamp with time zone | sim |  |  |
| `professor_presenca_origem` | text | sim |  |  |

**Únicos:** aulas_emusys_emusys_id_unidade_id_key, aulas_emusys_pkey

**Triggers:** trg_presenca_slot_lock_v2 → fn_presenca_slot_lock_trigger_v2(), trg_proteger_anotacoes_fabio → fn_proteger_anotacoes_fabio(), trg_proteger_decisao_humana_aula → fn_proteger_decisao_humana_aula(), trg_reagendamento_limpa_chamada_alunos → fn_reagendamento_limpa_chamada_alunos()

## config_health_score

> Configuração dos pesos e limites do Health Score do Professor

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('config_health_score_id_seq'::regclass) |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `peso_taxa_crescimento` | integer | sim | 15 |  |
| `peso_media_turma` | integer | sim | 20 |  |
| `peso_retencao` | integer | sim | 25 |  |
| `peso_conversao` | integer | sim | 15 |  |
| `peso_presenca` | integer | sim | 15 |  |
| `peso_evasoes` | integer | sim | 10 |  |
| `meta_media_turma` | numeric(3,1) | sim | 3.0 |  |
| `limite_saudavel` | integer | sim | 70 |  |
| `limite_atencao` | integer | sim | 50 |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:** config_health_score_pkey, config_health_score_unidade_unique

## config_health_score_aluno

> Configuração de pesos do Health Score de Alunos - ajustável por unidade

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('config_health_score_aluno_id_seq'::regclass) |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `peso_pagamento` | integer | sim | 30 |  |
| `peso_tempo_casa` | integer | sim | 20 |  |
| `peso_fase_jornada` | integer | sim | 20 |  |
| `peso_feedback_professor` | integer | sim | 20 |  |
| `peso_presenca` | integer | sim | 10 |  |
| `limite_saudavel` | integer | sim | 70 |  |
| `limite_atencao` | integer | sim | 40 |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:** config_health_score_aluno_pkey, config_health_score_aluno_unidade_id_key

## config_health_score_professor

> Configuração de pesos do Health Score de Professores - ajustável por unidade

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('config_health_score_professor_id_seq'::regclass) |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `peso_taxa_crescimento` | integer | sim | 15 |  |
| `peso_media_turma` | integer | sim | 20 |  |
| `peso_retencao` | integer | sim | 25 |  |
| `peso_conversao` | integer | sim | 15 |  |
| `peso_presenca` | integer | sim | 15 |  |
| `peso_evasoes` | integer | sim | 10 |  |
| `limite_saudavel` | integer | sim | 70 |  |
| `limite_atencao` | integer | sim | 50 |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:** config_health_prof_unidade_unique, config_health_score_professor_pkey

**Triggers:** trg_audit → fn_audit_log(), trigger_update_config_health_score_professor → update_config_health_score_professor_updated_at()

## disponibilidade_professor_propostas

> Propostas de disponibilidade. Aprovar nao altera o espelho; efetivar exige confirmacao da operacao no Emusys.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `professor_id` | integer | não |  | professores.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `professores_unidade_id` | integer | não |  | professores_unidades.id |
| `disponibilidade_vigente` | jsonb | não |  |  |
| `disponibilidade_proposta` | jsonb | não |  |  |
| `status` | text | não | 'pendente_aprovacao'::text |  |
| `versao` | integer | não |  |  |
| `proposto_por_auth_user_id` | uuid | não |  |  |
| `decidido_por_usuario_id` | integer | sim |  | usuarios.id |
| `decidido_em` | timestamp with time zone | sim |  |  |
| `motivo_decisao` | text | sim |  |  |
| `efetivado_por_usuario_id` | integer | sim |  | usuarios.id |
| `efetivado_em` | timestamp with time zone | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:** disponibilidade_professor_proposta_ativa_uq, disponibilidade_professor_propostas_pkey, disponibilidade_professor_propostas_versao_uq

**Triggers:** set_updated_at_disponibilidade_professor_propostas → set_updated_at()

## fabio_acao_eventos

> Ledger idempotente por wa_message_id das transicoes da acao.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `acao_id` | uuid | não |  | fabio_acoes_pendentes.id |
| `chat_mensagem_id` | uuid | sim |  | fabio_chat_mensagens.id |
| `wa_message_id` | text | não |  |  |
| `evento` | text | não |  |  |
| `resultado` | jsonb | não | '{}'::jsonb |  |
| `criado_em` | timestamp with time zone | não | now() |  |

**Únicos:** fabio_acao_eventos_pkey, fabio_acao_eventos_wa_message_id_key

## fabio_acoes_pendentes

> Estado duravel e auditavel das acoes iniciadas pelo professor no WhatsApp.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `professor_id` | integer | não |  | professores.id |
| `canal` | text | não | 'whatsapp'::text |  |
| `wa_message_id` | text | não |  |  |
| `ultima_resposta_wa_id` | text | sim |  |  |
| `tipo` | text | não |  |  |
| `estado` | text | não |  |  |
| `aula_id` | integer | sim |  | aulas_emusys.id |
| `audio_id` | uuid | sim |  | fabio_fila_audios.id |
| `registro_id` | uuid | sim |  | fabio_registros_aula.id |
| `storage_path` | text | sim |  |  |
| `candidatas` | integer[] | não | '{}'::integer[] |  |
| `payload` | jsonb | não | '{}'::jsonb |  |
| `expira_em` | timestamp with time zone | sim |  |  |
| `lease_token` | uuid | sim |  |  |
| `lease_expira_em` | timestamp with time zone | sim |  |  |
| `erro` | text | sim |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |
| `atualizado_em` | timestamp with time zone | não | now() |  |
| `encerrado_em` | timestamp with time zone | sim |  |  |

**Únicos:** fabio_acoes_pendentes_ativa_professor_uq, fabio_acoes_pendentes_pkey, fabio_acoes_pendentes_wa_uq

## fabio_audios_parqueados

> Áudio que chegou pelo WhatsApp enquanto o professor tinha uma ação aberta. Fila de espera FIFO por professor, do lado de fora da trava de uma-ação-por-professor. Sai por consumo (virou ação) ou por descarte explícito — nunca some sozinho.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `professor_id` | integer | não |  |  |
| `wa_message_id` | text | não |  |  |
| `storage_path` | text | não |  |  |
| `transcricao` | text | sim |  |  |
| `duracao_segundos` | integer | não | 0 |  |
| `criado_em` | timestamp with time zone | não | now() |  |
| `consumido_em` | timestamp with time zone | sim |  |  |
| `consumido_por_acao` | uuid | sim |  |  |
| `descartado_em` | timestamp with time zone | sim |  |  |
| `descartado_motivo` | text | sim |  |  |

**Únicos:** fabio_audios_parqueados_pkey, uq_fabio_audio_parqueado_mensagem

## fabio_chat_mensagens

> Chat 1:1 professor<->Fabio, dual channel (app+whatsapp), mesma conversa. Espelha o padrao ja provado em producao no LA Organizer (Tom / group_chat_messages). App insere direto (RLS); Hermes (service_role) faz polling em fabio_seen_at IS NULL e escreve as respostas.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `professor_id` | integer | sim |  | professores.id |
| `role` | text | não |  |  |
| `kind` | text | não | 'text'::text |  |
| `content` | text | sim |  |  |
| `media_url` | text | sim |  |  |
| `media_mime` | text | sim |  |  |
| `media_filename` | text | sim |  |  |
| `media_extracted_text` | text | sim |  |  |
| `channel` | text | não | 'app'::text |  |
| `wa_message_id` | text | sim |  |  |
| `fabio_seen_at` | timestamp with time zone | sim |  |  |
| `fabio_done_at` | timestamp with time zone | sim |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |
| `identidade_tipo` | text | não | 'professor'::text |  |
| `usuario_id` | integer | sim |  | usuarios.id |

**Únicos:** fabio_chat_mensagens_pkey, fcm_wa_msg_uq

## fabio_correcoes_acoes

> Ledger idempotente das correcoes finais por tipo e p_acao_id; sem acesso direto do bridge.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `tipo` | text | não |  |  |
| `acao_id` | text | não |  |  |
| `professor_id` | integer | não |  | professores.id |
| `alvo_id` | uuid | não |  |  |
| `canal` | text | não |  |  |
| `requisicao` | jsonb | não |  |  |
| `resultado` | jsonb | sim |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |
| `concluida_em` | timestamp with time zone | sim |  |  |

**Únicos:** fabio_correcoes_acoes_pkey, fabio_correcoes_acoes_tipo_acao_id_key

## fabio_devolutiva_edicoes

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `devolutiva_id` | uuid | não |  | fabio_devolutivas.id |
| `professor_id` | integer | não |  | professores.id |
| `autor_usuario_id` | integer | não |  | usuarios.id |
| `canal` | text | não |  |  |
| `antes` | jsonb | não |  |  |
| `depois` | jsonb | não |  |  |
| `motivo` | text | não |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |

**Únicos:** fabio_devolutiva_edicoes_pkey

## fabio_devolutivas

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `registro_fatia_id` | uuid | não |  | fabio_registros_aula.id |
| `aluno_id` | integer | não |  |  |
| `professor_id` | integer | não |  |  |
| `destinatario` | text | sim |  |  |
| `destinatario_override` | text | sim |  |  |
| `destinatario_origem` | text | sim |  |  |
| `destinatario_nome` | text | sim |  |  |
| `destinatario_decidido_por` | integer | sim |  |  |
| `destinatario_decidido_em` | timestamp with time zone | sim |  |  |
| `idade_na_geracao` | integer | sim |  |  |
| `texto_normal` | text | sim |  |  |
| `texto_apoio_casa` | text | sim |  |  |
| `skill_id` | uuid | sim |  | fabio_skills.id |
| `skill_versao` | integer | sim |  |  |
| `status` | text | não | 'pendente'::text |  |
| `lease_token` | uuid | sim |  |  |
| `lease_expira_em` | timestamp with time zone | sim |  |  |
| `proxima_tentativa_em` | timestamp with time zone | sim |  |  |
| `aguardando_desde` | timestamp with time zone | sim |  |  |
| `envio_chave` | text | sim |  |  |
| `envio_recibo` | text | sim |  |  |
| `erro` | text | sim |  |  |
| `tentativas` | integer | não | 0 |  |
| `oferecida_em` | timestamp with time zone | sim |  |  |
| `copiada_em` | timestamp with time zone | sim |  |  |
| `editada_em` | timestamp with time zone | sim |  |  |
| `compartilhada_em` | timestamp with time zone | sim |  |  |
| `envio_confirmado_em` | timestamp with time zone | sim |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |
| `atualizado_em` | timestamp with time zone | não | now() |  |

**Únicos:** fabio_devolutivas_pkey, uq_fabio_devolutiva_por_registro

## fabio_fila_audios

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `professor_id` | integer | sim |  | professores.id |
| `unidade_id` | uuid | sim |  | unidades.id |
| `aula_id` | integer | sim |  | aulas_emusys.id |
| `storage_path` | text | não |  |  |
| `duracao_segundos` | integer | sim |  |  |
| `status` | text | não | 'pendente'::text |  |
| `transcricao` | text | sim |  |  |
| `erro` | text | sim |  |  |
| `tentativas` | integer | não | 0 |  |
| `origem` | text | não | 'app'::text |  |
| `criado_em` | timestamp with time zone | não | now() |  |
| `atualizado_em` | timestamp with time zone | não | now() |  |
| `vinculo_id` | bigint | sim |  | lead_experimental_aulas.id |
| `erro_tipo` | text | não | 'transitorio'::text |  |

**Únicos:** fabio_fila_audios_pkey, uq_fabio_fila_audio_experimental_path

**Triggers:** trg_fabio_audios_upd → fn_set_atualizado_em(), trg_fabio_fila_novo → trg_fabio_fila_dispara()

## fabio_notificacoes

> Notificacoes proativas do Fabio (Fase 2). O AGENDAMENTO nao mora aqui — decidido pelo Hermes/VPS via cron, sem pg_cron (mesmo padrao do Tom). tipo=pendencia_registro/reagendamento sao SEMPRE categoria=governanca. Os demais sao informativa.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `professor_id` | integer | sim |  | professores.id |
| `tipo` | text | não |  |  |
| `categoria` | text | não |  |  |
| `titulo` | text | sim |  |  |
| `corpo` | text | não |  |  |
| `referencia_tipo` | text | sim |  |  |
| `referencia_id` | text | sim |  |  |
| `canal` | text | não |  |  |
| `status` | text | não |  |  |
| `motivo_pulada` | text | sim |  |  |
| `enviada_em` | timestamp with time zone | sim |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |
| `dia_referencia` | date | sim | ((criado_em AT TIME ZONE 'America/Sao_Paulo'::text))::date |  |
| `tentativas` | integer | não | 1 |  |
| `last_error` | text | sim |  |  |
| `lease_token` | uuid | sim |  |  |
| `lease_expira_em` | timestamp with time zone | sim |  |  |
| `proxima_tentativa_em` | timestamp with time zone | sim |  |  |
| `envio_recibo` | text | sim |  |  |
| `destinatario_tipo` | text | não | 'professor'::text |  |
| `destinatario_whatsapp` | text | sim |  |  |
| `solicitado_por` | uuid | sim |  |  |

**Únicos:** fabio_notificacoes_feedback_coord_dia_unico, fabio_notificacoes_feedback_prof_dia_unico, fabio_notificacoes_pkey, uq_fabio_notif_por_referencia, uq_fabio_notif_recorrente_diario, uq_fabio_notificacoes_registro_recibo_unico

## fabio_participacao_ocorrencia_eventos

> Ciclo de vida da ocorrencia (append-only). Estado atual = ultimo evento. registrada->candidata na view.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `seq` | bigint | não |  |  |
| `ocorrencia_id` | uuid | não |  | fabio_participacao_ocorrencias.id |
| `evento` | text | não |  |  |
| `por_tipo` | text | não |  |  |
| `por_id` | text | sim |  |  |
| `dados` | jsonb | não | '{}'::jsonb |  |
| `criado_em` | timestamp with time zone | não | now() |  |

**Únicos:** fabio_participacao_ocorrencia_eventos_pkey

**Triggers:** trg_participacao_eventos_append_only → fn_participacao_append_only()

## fabio_participacao_ocorrencias

> Quem participou no lugar de quem (substituicao), separado do roster esperado. Append-only: fatos nunca mudam; correcao e linha nova com supersede_ocorrencia_id. SHADOW: nao toca presenca/falta/financeiro/Emusys.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `aula_operacional_id` | integer | não |  |  |
| `aula_id` | integer | não |  |  |
| `professor_id` | integer | não |  |  |
| `aluno_matriculado_id` | integer | não |  |  |
| `participante_real_id` | integer | sim |  |  |
| `participante_real_nome` | text | sim |  |  |
| `participante_real_telefone` | text | sim |  |  |
| `tipo` | text | não | 'substituicao'::text |  |
| `confianca` | text | não |  |  |
| `metodo_extracao` | text | não |  |  |
| `origem` | text | não |  |  |
| `origem_message_id` | text | sim |  |  |
| `origem_transcricao` | text | sim |  |  |
| `supersede_ocorrencia_id` | uuid | sim |  | fabio_participacao_ocorrencias.id |
| `criado_em` | timestamp with time zone | não | now() |  |

**Únicos:** fabio_participacao_ocorrencias_pkey, uq_participacao_msg_vigente

**Triggers:** trg_participacao_ocorrencias_append_only → fn_participacao_append_only(), trg_participacao_supersede_coerente → fn_participacao_supersede_coerente()

## fabio_professor_preferences

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `professor_id` | integer | não |  | professores.id |
| `canal_preferido` | text | não | 'ambos'::text |  |
| `horario_silencio_inicio` | time without time zone | sim |  |  |
| `horario_silencio_fim` | time without time zone | sim |  |  |
| `dias_silencio` | smallint[] | não | '{}'::smallint[] |  |
| `pausa_ate` | date | sim |  |  |
| `aceita_cobranca_pendencia` | boolean | não | true |  |
| `tom_preferido` | text | não | 'neutro'::text |  |
| `timezone` | text | não | 'America/Sao_Paulo'::text |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |
| `recebe_domingo` | boolean | não | false |  |

**Únicos:** fabio_professor_preferences_pkey

**Triggers:** trg_fabio_professor_preferences_touch → fn_touch_updated_at()

## fabio_protecao_log

> Auditoria de updates que tentaram esvaziar aulas_emusys.anotacoes_fabio e foram neutralizados.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não | nextval('fabio_protecao_log_id_seq'::regclass) |  |
| `aula_id` | integer | não |  |  |
| `motivo` | text | não |  |  |
| `tamanho_preservado` | integer | sim |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |

**Únicos:** fabio_protecao_log_pkey

## fabio_registro_correcoes

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `registro_id` | uuid | não |  | fabio_registros_aula.id |
| `professor_id` | integer | não |  | professores.id |
| `autor_usuario_id` | integer | não |  | usuarios.id |
| `canal` | text | não |  |  |
| `antes` | jsonb | não |  |  |
| `depois` | jsonb | não |  |  |
| `motivo` | text | não |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |

**Únicos:** fabio_registro_correcoes_pkey

## fabio_registros_aula

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `aula_id` | integer | não |  | aulas_emusys.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `professor_id` | integer | sim |  | professores.id |
| `aluno_id` | integer | sim |  | alunos.id |
| `parent_id` | uuid | sim |  | fabio_registros_aula.id |
| `molde` | text | não |  |  |
| `campos` | jsonb | não | '{}'::jsonb |  |
| `texto_consolidado` | text | sim |  |  |
| `status` | text | não | 'rascunho'::text |  |
| `origem` | text | não | 'app'::text |  |
| `audio_id` | uuid | sim |  | fabio_fila_audios.id |
| `checkpoint_sugerido` | jsonb | sim |  |  |
| `confirmado_em` | timestamp with time zone | sim |  |  |
| `confirmado_por` | integer | sim |  | usuarios.id |
| `criado_em` | timestamp with time zone | não | now() |  |
| `atualizado_em` | timestamp with time zone | não | now() |  |
| `modo_entrada` | text | não | 'audio'::text |  |
| `versao` | integer | não | 1 |  |

**Únicos:** fabio_registros_aula_pkey, ux_fabio_reg_manual_aberto

**Triggers:** trg_fabio_reg_upd → fn_set_atualizado_em()

## fabio_skills

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `nome` | text | não |  |  |
| `versao` | integer | não |  |  |
| `conteudo` | text | não |  |  |
| `ativa` | boolean | não | false |  |
| `notas` | text | sim |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |
| `criado_por` | text | sim |  |  |

**Únicos:** fabio_skills_pkey, uq_fabio_skills_ativa, uq_fabio_skills_nome_versao

## health_score_professor_v3_carteira_politicas_unidade

> Politica temporal do pilar numero_alunos: meta total proporcional a disponibilidade canonica salva no LA Report.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `versao` | integer | não |  |  |
| `vigencia_inicio` | date | não |  |  |
| `vigencia_fim` | date | sim |  |  |
| `meta_alunos_hora_p50` | numeric(10,4) | não |  |  |
| `meta_alunos_hora_p75` | numeric(10,4) | não |  |  |
| `meses_maturacao` | integer | não | 6 |  |
| `fonte` | text | não |  |  |
| `justificativa` | text | não |  |  |
| `decidido_por` | text | não |  |  |
| `decidido_em` | timestamp with time zone | não |  |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `base_horas` | text | não | 'disponibilidade_total'::text |  |

**Únicos:** health_score_professor_v3_carteira_politicas_unidade_pkey, health_score_v3_carteira_politica_versao_uq

## health_score_professor_v3_ciclos

> Calendario versionado do Health Score V3: Jun-Ago, Set-Nov, Dez-Fev e Mar-Mai. Ranking somente depois do fechamento oficial.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `codigo` | text | não |  |  |
| `data_inicio` | date | não |  |  |
| `data_fim` | date | não |  |  |
| `label` | text | não |  |  |
| `estado` | text | não | 'aberto'::text |  |
| `publicacao_oficial` | boolean | não | false |  |
| `ranking_habilitado` | boolean | não | false |  |
| `fechado_em` | timestamp with time zone | sim |  |  |
| `fechado_por` | integer | sim |  | usuarios.id |
| `justificativa_fechamento` | text | sim |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |

**Únicos:** health_score_professor_v3_ciclos_codigo_key, health_score_professor_v3_ciclos_pkey

## health_score_professor_v3_config_metas_curso_modalidade

> Matriz versionada de metas V3 por configuracao, unidade, curso e modalidade.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `config_id` | uuid | não |  | health_score_professor_v3_config_versoes.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `curso_id` | integer | não |  | cursos.id |
| `modalidade` | text | não |  |  |
| `estado` | text | não |  |  |
| `capacidade_maxima` | numeric | sim |  |  |
| `meta_media_turma` | numeric | sim |  |  |
| `meta_carteira_curso` | numeric | sim |  |  |
| `parametros` | jsonb | não | '{}'::jsonb |  |
| `criado_em` | timestamp with time zone | não | now() |  |
| `atualizado_em` | timestamp with time zone | não | now() |  |

**Únicos:** health_score_professor_v3_con_config_id_unidade_id_curso_id_key, health_score_professor_v3_con_id_unidade_id_curso_id_modali_key, health_score_professor_v3_config_metas_curso_modalidade_pkey

**Triggers:** trg_health_score_professor_v3_config_meta_segmentada_imutavel → fn_health_score_professor_v3_bloquear_config_meta_segmentada()

## health_score_professor_v3_config_metricas

> Metricas versionadas do Health Score V3. A V2 recebeu em 19/07/2026 reparo apenas do meta_status omitido; metas e pesos homologados nao foram alterados.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `config_id` | uuid | não |  | health_score_professor_v3_config_versoes.id |
| `metrica` | text | não |  |  |
| `peso` | numeric(5,2) | não |  |  |
| `meta` | numeric(14,4) | sim |  |  |
| `amostra_minima` | integer | não | 1 |  |
| `cobertura_minima` | numeric(5,2) | sim |  |  |
| `parametros` | jsonb | não | '{}'::jsonb |  |
| `criado_em` | timestamp with time zone | não | now() |  |
| `atualizado_em` | timestamp with time zone | não | now() |  |

**Únicos:** health_score_professor_v3_config_metricas_config_id_metrica_key, health_score_professor_v3_config_metricas_pkey

**Triggers:** trg_health_score_professor_v3_config_metrica_imutavel → fn_health_score_professor_v3_bloquear_config_metrica()

## health_score_professor_v3_config_simulacoes

> Gate 7: trilha append-only das simulacoes de configuracao V3, sem publicar snapshots.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `config_id` | uuid | não |  | health_score_professor_v3_config_versoes.id |
| `competencia` | date | não |  |  |
| `config_fingerprint` | text | não |  |  |
| `resultado` | jsonb | não |  |  |
| `simulado_por` | integer | sim |  | usuarios.id |
| `criado_em` | timestamp with time zone | não | now() |  |

**Únicos:** health_score_professor_v3_config_simulacoes_pkey

## health_score_professor_v3_config_substituicoes

> Trilha append-only das substituicoes governadas de configuracao do Health Score Professor V3.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `config_anterior_id` | uuid | não |  | health_score_professor_v3_config_versoes.id |
| `config_nova_id` | uuid | não |  | health_score_professor_v3_config_versoes.id |
| `vigencia_inicio` | date | não |  |  |
| `vigencia_fim` | date | não |  |  |
| `justificativa` | text | não |  |  |
| `substituido_por` | integer | sim |  | usuarios.id |
| `substituido_em` | timestamp with time zone | não | now() |  |

**Únicos:** health_score_professor_v3_config_substituico_config_nova_id_key, health_score_professor_v3_config_substituicoes_pkey

**Triggers:** trg_health_score_professor_v3_config_substituicoes_append_only → fn_health_score_v3_bloquear_config_substituicao()

## health_score_professor_v3_config_versoes

> Gate 5: configuracoes temporais e versionadas do Health Score Professor V3.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `versao` | integer | não |  |  |
| `status` | text | não | 'rascunho'::text |  |
| `vigencia_inicio` | date | não |  |  |
| `vigencia_fim` | date | sim |  |  |
| `cobertura_minima` | numeric(5,2) | não | 60 |  |
| `faixa_atencao_min` | numeric(5,2) | não | 50 |  |
| `faixa_saudavel_min` | numeric(5,2) | não | 70 |  |
| `exige_pilar_fidelizacao` | boolean | não | true |  |
| `justificativa` | text | não |  |  |
| `criado_por` | integer | sim |  | usuarios.id |
| `ativado_por` | integer | sim |  | usuarios.id |
| `criado_em` | timestamp with time zone | não | now() |  |
| `ativado_em` | timestamp with time zone | sim |  |  |
| `atualizado_em` | timestamp with time zone | não | now() |  |
| `chave_criacao_governada` | text | sim |  |  |
| `pilares_minimos` | integer | não | 3 |  |

**Únicos:** health_score_professor_v3_config_versoes_pkey, health_score_professor_v3_config_versoes_versao_key, health_score_v3_config_chave_criacao_governada_uidx

**Triggers:** trg_health_score_professor_v3_config_versao_imutavel → fn_health_score_professor_v3_bloquear_config_versao(), trg_health_score_professor_v3_exigir_simulacao_atual → fn_health_score_professor_v3_exigir_simulacao_atual()

## health_score_professor_v3_materializacao_execucoes

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `competencia` | date | não |  |  |
| `periodicidade` | text | não |  |  |
| `escopo` | text | não |  |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `fingerprint_fonte` | text | não |  |  |
| `status` | text | não |  |  |
| `snapshot_ids` | jsonb | não | '[]'::jsonb |  |
| `snapshots_criados` | integer | não | 0 |  |
| `erro` | text | sim |  |  |
| `iniciado_em` | timestamp with time zone | não | now() |  |
| `finalizado_em` | timestamp with time zone | sim |  |  |
| `executado_por` | text | não | SESSION_USER |  |
| `professores_incompletos` | jsonb | não | '[]'::jsonb |  |
| `professores_configuracao_inconsistente` | jsonb | não | '[]'::jsonb |  |
| `cron_reconciliacao_status` | text | sim |  |  |
| `cron_reconciliacao_erro` | text | sim |  |  |
| `cron_reconciliado_em` | timestamp with time zone | sim |  |  |
| `cron_alerta_request_id` | bigint | sim |  |  |
| `cron_alerta_status` | text | sim |  |  |
| `cron_alerta_erro` | text | sim |  |  |
| `cron_alerta_atualizado_em` | timestamp with time zone | sim |  |  |

**Únicos:** health_score_professor_v3_materializacao_execucoes_pkey

## health_score_professor_v3_snapshot_metrica_diagnosticos

> Diagnosticos estruturados de escopos sem curso ou modalidade oficialmente resolvidos.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `snapshot_metrica_id` | uuid | não |  | health_score_professor_v3_snapshot_metricas.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `pessoas_unicas_total` | numeric | não | 0 |  |
| `dados_sem_resolucao` | integer | não | 0 |  |
| `estados_resolucao` | jsonb | não | '[]'::jsonb |  |
| `estado_base` | text | não |  |  |
| `fonte` | text | não |  |  |
| `regra_versao` | text | não |  |  |
| `divergencias` | jsonb | não | '{}'::jsonb |  |
| `detalhes` | jsonb | não | '{}'::jsonb |  |
| `criado_em` | timestamp with time zone | não | now() |  |

**Únicos:** health_score_professor_v3_sna_snapshot_metrica_id_unidade__key1, health_score_professor_v3_snapshot_metrica_diagnosticos_pkey

**Triggers:** trg_health_score_v3_snapshot_segmento_diagnostico_imutavel → fn_health_score_professor_v3_bloquear_snapshot_segmento_fechado()

## health_score_professor_v3_snapshot_metrica_segmentos

> Detalhamento por curso/modalidade da metrica numero_alunos. ATENCAO (decisao Alf 09/08/2026): so o caminho do PERIODO escreve aqui; o caminho DIARIO nao escreve, e por isso numero_alunos sai com nota NULL e peso_disponivel=false no score vivo. Isso e INTENCIONAL — numero_alunos nao pontua no V3. Nao "corrigir" escrevendo segmentos no diario para destravar a nota.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `snapshot_metrica_id` | uuid | não |  | health_score_professor_v3_snapshot_metricas.id |
| `config_meta_segmento_id` | uuid | sim |  | health_score_professor_v3_config_metas_curso_modalidade.id |
| `unidade_id` | uuid | não |  | professor_unidade_curso_modalidade.unidade_id |
| `curso_id` | integer | não |  | health_score_professor_v3_config_metas_curso_modalidade.curso_id |
| `modalidade` | text | não |  | health_score_professor_v3_config_metas_curso_modalidade.modalidade |
| `pessoas_unicas` | integer | não | 0 |  |
| `vinculos_ativos` | integer | não | 0 |  |
| `turmas_elegiveis` | integer | não | 0 |  |
| `ocupacoes_unicas` | integer | não | 0 |  |
| `capacidade_maxima` | numeric | sim |  |  |
| `meta_aplicada` | numeric | sim |  |  |
| `numerador` | numeric | sim |  |  |
| `denominador` | numeric | sim |  |  |
| `nota` | numeric(6,2) | sim |  |  |
| `estado_base` | text | não |  |  |
| `fonte` | text | não |  |  |
| `regra_versao` | text | não |  |  |
| `detalhes` | jsonb | não | '{}'::jsonb |  |
| `criado_em` | timestamp with time zone | não | now() |  |
| `atribuicao_id` | uuid | sim |  | professor_unidade_curso_modalidade.id |
| `atribuicao_formal` | boolean | sim |  |  |
| `atribuicao_pontuavel` | boolean | sim |  |  |
| `pessoas_unicas_total` | numeric | sim |  |  |
| `pessoas_fechamentos` | integer | sim |  |  |
| `meses_com_base` | integer | sim |  |  |
| `meses_com_base_consolidado` | integer | sim |  |  |
| `meses_no_periodo` | integer | sim |  |  |
| `capacidade_excedida` | boolean | sim |  |  |
| `alertas_capacidade` | jsonb | sim |  |  |
| `divergencias` | jsonb | sim |  |  |

**Únicos:** health_score_professor_v3_sna_snapshot_metrica_id_unidade_i_key, health_score_professor_v3_snapshot_metrica_segmentos_pkey

**Triggers:** trg_health_score_professor_v3_snapshot_segmento_imutavel → fn_health_score_professor_v3_bloquear_snapshot_segmento_fechado(), trg_health_score_v3_snapshot_segmento_config_consistente → fn_health_score_professor_v3_validar_snapshot_segmento_config()

## health_score_professor_v3_snapshot_metricas

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `snapshot_id` | uuid | não |  | health_score_professor_v3_snapshots.id |
| `metrica` | text | não |  |  |
| `valor_bruto` | numeric | sim |  |  |
| `numerador` | numeric | sim |  |  |
| `denominador` | numeric | sim |  |  |
| `amostra` | integer | sim |  |  |
| `estado_base` | text | não |  |  |
| `publicavel` | boolean | não | false |  |
| `confianca` | text | não |  |  |
| `fonte` | text | não |  |  |
| `regra_versao` | text | não |  |  |
| `motivo_sem_base` | text | sim |  |  |
| `detalhes` | jsonb | não | '{}'::jsonb |  |
| `nota` | numeric(6,2) | sim |  |  |
| `peso` | numeric(5,2) | não |  |  |
| `peso_disponivel` | boolean | não | false |  |
| `contribuicao` | numeric(8,4) | sim |  |  |
| `meta_aplicada` | numeric(14,4) | sim |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |
| `peso_efetivo` | numeric | sim |  |  |
| `codigo_evidencia` | text | sim |  |  |
| `papel` | text | sim |  |  |

**Únicos:** health_score_professor_v3_snapshot_metr_snapshot_id_metrica_key, health_score_professor_v3_snapshot_metricas_pkey

**Triggers:** trg_health_score_professor_v3_snapshot_metrica_imutavel → fn_health_score_professor_v3_bloquear_metrica_fechada()

## health_score_professor_v3_snapshots

> Gate 5: snapshots mensais/trimestrais em sombra; fechado e imutavel.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `professor_id` | integer | não |  | professores.id |
| `escopo` | text | não |  |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `competencia` | date | não |  |  |
| `trimestre_inicio` | date | não |  |  |
| `revisao` | integer | não |  |  |
| `estado` | text | não | 'provisorio'::text |  |
| `config_id` | uuid | não |  | health_score_professor_v3_config_versoes.id |
| `config_versao` | integer | não |  |  |
| `score` | numeric(6,2) | sim |  |  |
| `cobertura` | numeric(5,2) | não | 0 |  |
| `classificacao` | text | sim | 'sem_base'::text |  |
| `publicavel` | boolean | não | false |  |
| `publicado` | boolean | não | false |  |
| `motivo_bloqueio` | text | sim |  |  |
| `regra_versao` | text | não | 'health-score-professor-v3-motor-1'::text |  |
| `snapshot_anterior_id` | uuid | sim |  | health_score_professor_v3_snapshots.id |
| `justificativa_retificacao` | text | sim |  |  |
| `criado_por` | integer | sim |  | usuarios.id |
| `criado_em` | timestamp with time zone | não | now() |  |
| `fechado_em` | timestamp with time zone | sim |  |  |
| `invalidado_em` | timestamp with time zone | sim |  |  |
| `periodicidade` | text | não | 'legado_calendario'::text |  |
| `periodo_inicio` | date | não |  |  |
| `periodo_fim` | date | não |  |  |
| `ciclo_codigo` | text | sim |  |  |
| `estado_publicacao` | text | não | 'sem_base'::text |  |
| `score_exibivel` | boolean | não | false |  |
| `ranking_habilitado` | boolean | não | false |  |

**Únicos:** health_score_professor_v3_snapshots_pkey, ux_health_score_professor_v3_snapshot_consolidado_fechado, ux_health_score_professor_v3_snapshot_consolidado_revisao, ux_health_score_professor_v3_snapshot_unidade_fechado, ux_health_score_professor_v3_snapshot_unidade_revisao

**Triggers:** trg_health_score_professor_v3_snapshot_imutavel → fn_health_score_professor_v3_bloquear_snapshot_fechado(), trg_health_score_v3_bloquear_sem_disponibilidade → fn_health_score_v3_bloquear_sem_disponibilidade()

## health_score_v3_experimental_lead_conciliacoes

> Camada aditiva e auditavel que liga a experimental bruta a um lead. Nao altera o payload raw nem fabrica aluno canonico.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `raw_id` | bigint | não |  | emusys_experimentais_raw.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `evento_chave` | text | não |  |  |
| `lead_id` | integer | não |  | leads.id |
| `metodo` | text | não |  |  |
| `confianca` | text | não | 'alta'::text |  |
| `regra_versao` | text | não | 'health-score-v3-conciliacao-experimental-1'::text |  |
| `evidencia` | jsonb | não | '{}'::jsonb |  |
| `conciliado_em` | timestamp with time zone | não | now() |  |

**Únicos:** health_score_v3_experimental_lead_c_unidade_id_evento_chave_key, health_score_v3_experimental_lead_conciliacoes_pkey

## la_teacher_coordenacao

> Quem cuida dos professores no LA Teacher. NAO e o mesmo que usuarios.perfil=admin (que e do LA Report e inclui Marketing/Comercial). Entrar aqui e um ato explicito.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `usuario_id` | integer | não |  | usuarios.id |
| `criado_em` | timestamp with time zone | não | now() |  |
| `criado_por` | text | sim |  |  |

**Únicos:** la_teacher_coordenacao_pkey

## presenca_acao_eventos

> Recibo append-only por request_id: recebido, resultado por item e conclusao.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não |  |  |
| `request_id` | uuid | não |  | presenca_comandos.request_id |
| `sequencia` | integer | não |  |  |
| `tipo` | text | não |  |  |
| `fonte` | text | não |  |  |
| `auth_user_id` | uuid | sim |  |  |
| `usuario_id` | integer | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `aula_id` | integer | sim |  |  |
| `aluno_id` | integer | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `status_anterior` | text | sim |  |  |
| `status_novo` | text | sim |  |  |
| `erro_codigo` | text | sim |  |  |
| `criado_em` | timestamp with time zone | não | clock_timestamp() |  |

**Únicos:** presenca_acao_eventos_pkey, presenca_acao_eventos_request_id_sequencia_key

**Triggers:** trg_presenca_acao_eventos_append_only → fn_presenca_comando_eventos_append_only()

## presenca_comando_itens

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `request_id` | uuid | não |  | presenca_comandos.request_id |
| `sequencia` | integer | não |  |  |
| `aula_id` | integer | sim |  |  |
| `aluno_id` | integer | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `data_referencia` | date | sim |  |  |
| `status_solicitado` | text | não |  |  |
| `motivo_codigo` | text | sim |  |  |
| `evidencia_path` | text | sim |  |  |

**Únicos:** presenca_comando_itens_pkey

## presenca_comando_nao_recebidos

> Tombstone durável de request_id confirmado como não recebido; impede escrita tardia após reconciliação.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `request_id` | uuid | não |  |  |
| `auth_user_id` | uuid | sim |  |  |
| `criado_em` | timestamp with time zone | não | clock_timestamp() |  |

**Únicos:** presenca_comando_nao_recebidos_pkey

## presenca_comandos

> Intencao duravel e idempotente de escrita humana de presenca; sem nomes ou payload bruto.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `request_id` | uuid | não |  |  |
| `tipo` | text | não |  |  |
| `fonte` | text | não |  |  |
| `auth_user_id` | uuid | sim |  |  |
| `usuario_id` | integer | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `aula_id` | integer | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `data_referencia` | date | sim |  |  |
| `status` | text | não | 'recebido'::text |  |
| `payload_hash` | text | não |  |  |
| `itens_total` | integer | não | 0 |  |
| `itens_aplicados` | integer | não | 0 |  |
| `itens_rejeitados` | integer | não | 0 |  |
| `criado_em` | timestamp with time zone | não | clock_timestamp() |  |
| `iniciado_em` | timestamp with time zone | sim |  |  |
| `concluido_em` | timestamp with time zone | sim |  |  |
| `atualizado_em` | timestamp with time zone | não | clock_timestamp() |  |

**Únicos:** presenca_comandos_pkey

**Triggers:** trg_presenca_comando_arbitrar_insert → fn_presenca_comando_arbitrar_insert()

## presenca_politicas_confiabilidade

> Decisoes temporais e versionadas que qualificam evidencia de presenca por unidade.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `data_inicio` | date | não |  |  |
| `data_fim` | date | não |  |  |
| `ausencia_emusys_resultado` | text | não | 'falta_confirmada'::text |  |
| `exige_revisao_operacional` | boolean | não | false |  |
| `decidido_em` | date | não |  |  |
| `decidido_por` | text | não |  |  |
| `evidencia` | text | não |  |  |
| `regra_versao` | text | não |  |  |
| `ativa` | boolean | não | true |  |
| `created_at` | timestamp with time zone | não | now() |  |

**Únicos:** presenca_politicas_confiabili_unidade_id_data_inicio_data_f_key, presenca_politicas_confiabilidade_pkey, uq_presenca_politica_periodo_ativa

**Triggers:** trg_presenca_politica_impedir_sobreposicao → fn_presenca_politica_impedir_sobreposicao()

## presenca_rollout_config

> Estado atual governado por unidade e superficie. Sombra nao ativa consumidor.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade_id` | uuid | não |  | unidades.id |
| `superficie` | text | não |  |  |
| `modo` | text | não |  |  |
| `ativado_por` | text | não |  |  |
| `ativado_em` | timestamp with time zone | não | clock_timestamp() |  |
| `motivo` | text | não |  |  |
| `versao` | bigint | não | 1 |  |

**Únicos:** presenca_rollout_config_pkey

## presenca_rollout_eventos

> Trilha append-only das transicoes e rollbacks de presenca canonica.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não |  |  |
| `request_id` | uuid | não |  |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `superficie` | text | não |  |  |
| `modo_anterior` | text | não |  |  |
| `modo_novo` | text | não |  |  |
| `ativado_por` | text | não |  |  |
| `motivo` | text | não |  |  |
| `evidencia` | jsonb | não | '{}'::jsonb |  |
| `criado_em` | timestamp with time zone | não | clock_timestamp() |  |

**Únicos:** presenca_rollout_eventos_pkey, presenca_rollout_eventos_request_id_key

## presenca_sync_cobertura

> Estado atual por unidade, modo e data; somente concluida com hash e publicavel.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade_id` | uuid | não |  | unidades.id |
| `modo` | text | não |  |  |
| `data_alvo` | date | não |  |  |
| `run_id` | uuid | não |  | presenca_sync_execucoes.id |
| `status` | text | não |  |  |
| `lease_ate` | timestamp with time zone | sim |  |  |
| `heartbeat_em` | timestamp with time zone | sim |  |  |
| `snapshot_hash` | text | sim |  |  |
| `paginas_lidas` | integer | não | 0 |  |
| `aulas_lidas` | integer | não | 0 |  |
| `presencas_lidas` | integer | não | 0 |  |
| `iniciada_em` | timestamp with time zone | não |  |  |
| `finalizada_em` | timestamp with time zone | sim |  |  |
| `atualizada_em` | timestamp with time zone | não | clock_timestamp() |  |

**Únicos:** presenca_sync_cobertura_pkey

## presenca_sync_eventos

> Transicoes append-only do sync; a aplicacao nao possui UPDATE nem DELETE.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não |  |  |
| `run_id` | uuid | não |  | presenca_sync_execucoes.id |
| `tipo` | text | não |  |  |
| `detalhes` | jsonb | não | '{}'::jsonb |  |
| `criado_em` | timestamp with time zone | não | clock_timestamp() |  |

**Únicos:** presenca_sync_eventos_pkey

## presenca_sync_execucoes

> Uma linha por tentativa de sync; inclui tentativas deduplicadas como abortadas.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `request_id` | uuid | não |  |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `modo` | text | não |  |  |
| `data_alvo` | date | não |  |  |
| `status` | text | não |  |  |
| `snapshot_hash` | text | sim |  |  |
| `paginas_lidas` | integer | não | 0 |  |
| `aulas_lidas` | integer | não | 0 |  |
| `presencas_lidas` | integer | não | 0 |  |
| `erro_codigo` | text | sim |  |  |
| `lease_segundos` | integer | não |  |  |
| `criada_em` | timestamp with time zone | não | clock_timestamp() |  |
| `heartbeat_em` | timestamp with time zone | sim |  |  |
| `finalizada_em` | timestamp with time zone | sim |  |  |

**Únicos:** presenca_sync_execucoes_pkey, presenca_sync_execucoes_request_id_unidade_id_modo_data_alv_key

## professor_360_avaliacoes

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('professor_360_avaliacoes_id_seq'::regclass) |  |
| `professor_id` | integer | não |  | professores.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `competencia` | character varying(7) | não |  |  |
| `pontos_atrasos` | integer | sim | 100 |  |
| `pontos_faltas` | integer | sim | 100 |  |
| `pontos_organizacao_sala` | integer | sim | 100 |  |
| `pontos_uniforme` | integer | sim | 100 |  |
| `pontos_prazos` | integer | sim | 100 |  |
| `pontos_emusys` | integer | sim | 100 |  |
| `pontos_projetos` | integer | sim | 0 |  |
| `qtd_atrasos` | integer | sim | 0 |  |
| `qtd_faltas` | integer | sim | 0 |  |
| `qtd_organizacao_sala` | integer | sim | 0 |  |
| `qtd_uniforme` | integer | sim | 0 |  |
| `qtd_prazos` | integer | sim | 0 |  |
| `qtd_emusys` | integer | sim | 0 |  |
| `qtd_projetos` | integer | sim | 0 |  |
| `nota_base` | numeric(5,2) | sim | 100 |  |
| `bonus_projetos` | numeric(5,2) | sim | 0 |  |
| `nota_final` | numeric(5,2) | sim | 100 |  |
| `status` | character varying(20) | sim | 'pendente'::character varying |  |
| `avaliador_id` | text | sim |  |  |
| `data_fechamento` | timestamp with time zone | sim |  |  |
| `observacoes` | text | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:** professor_360_avaliacoes_pkey, professor_360_avaliacoes_professor_id_unidade_id_competenci_key

**Triggers:** trg_audit → fn_audit_log()

## professor_360_config

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('professor_360_config_id_seq'::regclass) |  |
| `chave` | character varying(50) | não |  |  |
| `valor` | text | não |  |  |
| `descricao` | text | sim |  |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:** professor_360_config_chave_key, professor_360_config_pkey

## professor_360_criterios

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('professor_360_criterios_id_seq'::regclass) |  |
| `codigo` | character varying(50) | não |  |  |
| `nome` | character varying(100) | não |  |  |
| `descricao` | text | sim |  |  |
| `tipo` | character varying(20) | não | 'penalidade'::character varying |  |
| `peso` | integer | sim | 10 |  |
| `pontos_perda` | integer | sim | 10 |  |
| `tolerancia` | integer | sim | 0 |  |
| `regra_detalhada` | text | sim |  |  |
| `ativo` | boolean | sim | true |  |
| `ordem` | integer | sim | 0 |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `limite_minutos_atraso` | integer | sim | 10 |  |

**Únicos:** professor_360_criterios_codigo_key, professor_360_criterios_pkey

## professor_360_ocorrencias

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('professor_360_ocorrencias_id_seq'::regclass) |  |
| `professor_id` | integer | não |  | professores.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `criterio_id` | integer | não |  | professor_360_criterios.id |
| `competencia` | character varying(7) | não |  |  |
| `data_ocorrencia` | date | não |  |  |
| `descricao` | text | sim |  |  |
| `escopo` | character varying(20) | sim | 'unidade'::character varying |  |
| `registrado_por` | text | sim |  |  |
| `notificado` | boolean | sim | false |  |
| `data_notificacao` | timestamp with time zone | sim |  |  |
| `observacoes` | text | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `minutos_atraso` | integer | sim |  |  |
| `status` | character varying(20) | sim | 'ativo'::character varying |  |
| `revertido_em` | timestamp with time zone | sim |  |  |
| `revertido_por` | uuid | sim |  |  |
| `revertido_por_nome` | character varying(255) | sim |  |  |
| `justificativa_reversao` | text | sim |  |  |

**Únicos:** professor_360_ocorrencias_pkey

**Triggers:** trg_audit → fn_audit_log(), trg_log_ocorrencia_criada → fn_log_ocorrencia_criada()

## professor_360_ocorrencias_log

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('professor_360_ocorrencias_log_id_seq'::regclass) |  |
| `ocorrencia_id` | integer | não |  |  |
| `acao` | character varying(20) | não |  |  |
| `usuario_id` | uuid | sim |  |  |
| `usuario_nome` | character varying(255) | não |  |  |
| `justificativa` | text | sim |  |  |
| `dados_anteriores` | jsonb | sim |  |  |
| `dados_novos` | jsonb | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:** professor_360_ocorrencias_log_pkey

## professor_acesso_codigos

> Rastro de cada pedido de código de acesso. Serve de auditoria e de base pro limite: sem ele, quem souber o número de um professor enche o WhatsApp dele.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `professor_id` | integer | sim |  | professores.id |
| `telefone` | text | não |  |  |
| `email` | text | sim |  |  |
| `status` | text | não | 'enviado'::text |  |
| `ip_hint` | text | sim |  |  |
| `user_agent` | text | sim |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |
| `expira_em` | timestamp with time zone | sim |  |  |

**Únicos:** professor_acesso_codigos_pkey

## professor_acoes

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `professor_id` | integer | sim |  | professores.id |
| `unidade_id` | uuid | sim |  | unidades.id |
| `meta_id` | uuid | sim |  | professor_metas.id |
| `treinamento_id` | uuid | sim |  | catalogo_treinamentos.id |
| `tipo` | character varying(50) | não |  |  |
| `titulo` | character varying(255) | não |  |  |
| `descricao` | text | sim |  |  |
| `data_agendada` | timestamp with time zone | não |  |  |
| `duracao_minutos` | integer | sim | 60 |  |
| `local` | character varying(255) | sim |  |  |
| `status` | character varying(20) | sim | 'pendente'::character varying |  |
| `resultado` | text | sim |  |  |
| `data_conclusao` | timestamp with time zone | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `created_by` | uuid | sim |  | users.id |
| `responsavel` | character varying(50) | sim |  |  |
| `unidade_acao` | character varying(50) | sim |  |  |
| `ordem_kanban` | integer | sim | 0 |  |

**Únicos:** professor_acoes_pkey

**Triggers:** trg_audit → fn_audit_log()

## professor_acoes_participantes

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `acao_id` | uuid | não |  | professor_acoes.id |
| `professor_id` | integer | não |  | professores.id |
| `confirmado` | boolean | sim | false |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:** professor_acoes_participantes_acao_id_professor_id_key, professor_acoes_participantes_pkey

## professor_carteira_mensal_canonica

> Fechamento imutavel da carteira por professor/unidade/competencia, com proveniencia de auditoria.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não |  |  |
| `competencia` | date | não |  |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `professor_id` | integer | não |  | professores.id |
| `carteira_alunos` | integer | não |  |  |
| `fonte` | text | não |  |  |
| `auditado_por` | text | sim |  |  |
| `auditado_em` | timestamp with time zone | não | now() |  |
| `observacoes` | text | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |

**Únicos:** professor_carteira_mensal_canonica_pkey, professor_carteira_mensal_canonica_unique

## professor_carteira_mensal_detalhe

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `competencia` | date | não |  |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `professor_id` | integer | não |  | professores.id |
| `aluno_id` | integer | sim |  | alunos.id |
| `pessoa_chave` | text | não |  |  |
| `curso_id` | integer | sim |  | cursos.id |
| `fonte` | text | não | 'sync_matriculas_emusys_fechamento_automatico'::text |  |
| `capturado_em` | timestamp with time zone | não | now() |  |

**Únicos:** professor_carteira_mensal_det_competencia_unidade_id_profes_key, professor_carteira_mensal_detalhe_pkey

## professor_checkpoints

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `professor_id` | integer | não |  | professores.id |
| `unidade_id` | uuid | sim |  | unidades.id |
| `competencia` | character varying(7) | não |  |  |
| `metricas` | jsonb | não |  |  |
| `insights_ia` | jsonb | sim |  |  |
| `observacoes` | text | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `created_by` | uuid | sim |  | users.id |

**Únicos:** professor_checkpoints_pkey, professor_checkpoints_professor_id_unidade_id_competencia_key

## professor_matricula_disciplina_periodos_v1

> Camada canonica em sombra dos periodos continuos por professor, matricula e disciplina.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `reconstrucao_id` | uuid | não |  | professor_periodos_reconstrucoes_v1.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `pessoa_chave` | text | não |  |  |
| `aluno_id` | integer | sim |  | alunos.id |
| `emusys_aluno_id` | bigint | sim |  |  |
| `emusys_matricula_id` | bigint | sim |  |  |
| `emusys_matricula_disciplina_id` | bigint | sim |  |  |
| `emusys_disciplina_id` | bigint | sim |  |  |
| `curso_id` | integer | sim |  | cursos.id |
| `professor_id` | integer | sim |  | professores.id |
| `emusys_professor_id` | bigint | sim |  |  |
| `data_inicio` | timestamp with time zone | não |  |  |
| `data_fim` | timestamp with time zone | sim |  |  |
| `status_periodo` | text | não |  |  |
| `tipo_inicio` | text | não |  |  |
| `tipo_fim` | text | sim |  |  |
| `duracao_dias` | numeric | sim | CASE     WHEN (data_fim IS NULL) THEN NULL::numeric     ELSE (EXTRACT(epoch FROM (data_fim - data_inicio)) / (86400)::numeric) END |  |
| `duracao_meses` | numeric | sim | CASE     WHEN (data_fim IS NULL) THEN NULL::numeric     ELSE ((EXTRACT(epoch FROM (data_fim - data_inicio)) / (86400)::numeric) / 30.44) END |  |
| `elegivel_permanencia` | boolean | sim | ((status_periodo = 'encerrado'::text) AND (data_fim IS NOT NULL) AND (((EXTRACT(epoch FROM (data_fim - data_inicio)) / (86400)::numeric) / 30.44) >= (4)::numeric)) |  |
| `motivo_saida_id` | integer | sim |  | motivos_saida.id |
| `conta_retencao_professor` | boolean | sim |  |  |
| `confianca` | text | não |  |  |
| `inicio_incompleto` | boolean | não | false |  |
| `substituicao_candidata` | boolean | não | false |  |
| `conflitos` | jsonb | não | '[]'::jsonb |  |
| `publicavel` | boolean | sim | ((confianca = 'revisado_aprovado'::text) OR ((confianca = 'alta'::text) AND (professor_id IS NOT NULL) AND (emusys_matricula_disciplina_id IS NOT NULL) AND (inicio_incompleto = false) AND (jsonb_typeof(conflitos) = 'array'::text) AND (jsonb_array_length(conflitos) = 0))) |  |
| `versao_reconstrucao` | text | não |  |  |
| `entrada_hash` | text | não |  |  |
| `evidencias` | jsonb | não | '{}'::jsonb |  |
| `revisado_por` | integer | sim |  | usuarios.id |
| `revisado_em` | timestamp with time zone | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:** professor_matricula_disciplina_periodos_v1_pkey, uq_professor_periodos_identidade_reconstrucao, uq_professor_periodos_um_ativo_por_disciplina

## professor_metas

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `professor_id` | integer | não |  | professores.id |
| `unidade_id` | uuid | sim |  | unidades.id |
| `tipo` | character varying(50) | não |  |  |
| `valor_atual` | numeric(10,2) | sim |  |  |
| `valor_meta` | numeric(10,2) | não |  |  |
| `data_inicio` | date | não |  |  |
| `data_fim` | date | sim |  |  |
| `status` | character varying(20) | sim | 'em_andamento'::character varying |  |
| `observacoes` | text | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `created_by` | uuid | sim |  | users.id |

**Únicos:** professor_metas_pkey

## professor_passagem_bastao

> Camada quente: pendencia humana de passagem de bastao para LA Teacher/Fabio.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `transicao_id` | uuid | não |  | aluno_professor_transicoes.id |
| `aluno_id` | integer | sim |  | alunos.id |
| `emusys_matricula_disciplina_id` | bigint | não |  |  |
| `curso_id` | integer | sim |  | cursos.id |
| `professor_origem_id` | integer | sim |  | professores.id |
| `professor_destino_id` | integer | sim |  | professores.id |
| `status` | text | não | 'pendente'::text |  |
| `motivo_dispensa` | text | sim |  |  |
| `resposta_texto` | text | sim |  |  |
| `audio_url` | text | sim |  |  |
| `transcricao` | text | sim |  |  |
| `resumo_ia` | text | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `respondido_em` | timestamp with time zone | sim |  |  |

**Únicos:** professor_passagem_bastao_pkey, professor_passagem_bastao_transicao_unique

## professor_perfil_respostas

> Respostas individuais por aplicação. opcao_canonica (A/B/C/D do gabarito) preserva o recálculo mesmo com opções embaralhadas na exibição. 1-13 fixas; 14-15 desempate (presença = houve empate).

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não |  |  |
| `teste_id` | bigint | não |  | professor_perfil_testes.id |
| `pergunta_numero` | integer | não |  |  |
| `opcao_canonica` | character varying(4) | não |  |  |
| `resposta_posicao` | integer | não |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `bloco` | character(1) | não | 'A'::bpchar |  |

**Únicos:** professor_perfil_respostas_pkey, professor_perfil_respostas_teste_bloco_pergunta_key

## professor_perfil_testes

> Aplicações do teste de perfil comportamental do professor (13+2 cenários). Histórico preservado; o vigente desnormaliza em professores.temperamento_codinome.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não |  |  |
| `professor_id` | integer | sim |  | professores.id |
| `unidade_id` | uuid | sim |  | unidades.id |
| `contexto` | character varying | não | 'PROF'::character varying |  |
| `versao_questionario` | integer | não | 1 |  |
| `evento_token` | character varying | sim |  |  |
| `status` | character varying | não | 'iniciado'::character varying |  |
| `temperamento_primario` | character varying | sim |  |  |
| `temperamento_secundario` | character varying | sim |  |  |
| `temperamento_codinome` | character varying | sim |  |  |
| `temperamento_contagem` | jsonb | sim |  |  |
| `ajuste_semestre` | jsonb | sim |  |  |
| `ajuste_semestre_em` | timestamp with time zone | sim |  |  |
| `iniciado_em` | timestamp with time zone | sim | now() |  |
| `concluido_em` | timestamp with time zone | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `colaborador_id` | integer | sim |  | colaboradores.id |
| `cargo_contexto` | character varying(40) | sim |  |  |
| `valorizacao_primaria` | character varying(10) | sim |  |  |
| `valorizacao_secundaria` | character varying(10) | sim |  |  |
| `valorizacao_contagem` | jsonb | sim |  |  |
| `valores_primario` | character varying(12) | sim |  |  |
| `valores_secundario` | character varying(12) | sim |  |  |
| `valores_sacrificado` | character varying(12) | sim |  |  |
| `valores_contagem` | jsonb | sim |  |  |
| `ficha_token_id` | bigint | sim |  | ficha_tokens.id |

**Únicos:** professor_perfil_testes_pkey, uq_professor_perfil_testes_ficha_token

## professor_periodos_reconstrucao_manifesto_v1

> Manifesto privado e imutavel por versao do recorte. Calcula uma vez a particao da pessoa canonica.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não |  |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `data_inicio` | date | não |  |  |
| `data_fim` | date | não |  |  |
| `versao_reconstrucao` | text | não |  |  |
| `execucao_backfill_id` | uuid | não |  | emusys_historico_backfill_execucoes_v1.id |
| `total_particoes` | integer | não |  |  |
| `particao_indice` | integer | não |  |  |
| `roster_staging_id` | bigint | não |  | emusys_aula_alunos_historico_staging_v1.id |
| `aula_staging_id` | bigint | não |  | emusys_aulas_historico_staging_v1.id |
| `pessoa_chave` | text | sim |  |  |
| `aluno_id` | integer | sim |  | alunos.id |
| `created_at` | timestamp with time zone | não | now() |  |

**Únicos:** professor_periodos_reconstruc_unidade_id_data_inicio_data__key2, professor_periodos_reconstrucao_manifesto_v1_pkey

## professor_periodos_reconstrucao_particoes_v1

> Resultados intermediarios, idempotentes e privados da reconstrucao V3. O detalhe diagnostico fica aqui; a camada final so nasce apos todas as particoes.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `data_inicio` | date | não |  |  |
| `data_fim` | date | não |  |  |
| `versao_reconstrucao` | text | não |  |  |
| `execucao_backfill_id` | uuid | não |  | emusys_historico_backfill_execucoes_v1.id |
| `total_particoes` | integer | não |  |  |
| `particao_indice` | integer | não |  |  |
| `entrada_hash` | text | não |  |  |
| `total_eventos` | integer | não | 0 |  |
| `total_particoes_logicas` | integer | não | 0 |  |
| `total_periodos` | integer | não | 0 |  |
| `total_diagnosticos` | integer | não | 0 |  |
| `periodos` | jsonb | não | '[]'::jsonb |  |
| `diagnosticos` | jsonb | não | '[]'::jsonb |  |
| `parametros` | jsonb | não | '{}'::jsonb |  |
| `status` | text | não | 'concluido'::text |  |
| `concluido_em` | timestamp with time zone | não | now() |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:** professor_periodos_reconstruc_unidade_id_data_inicio_data__key1, professor_periodos_reconstrucao_particoes_v1_pkey

## professor_periodos_reconstrucoes_v1

> Execucao versionada e idempotente do reconstrutor historico de periodos professor-matricula-disciplina.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `data_inicio` | date | não |  |  |
| `data_fim` | date | não |  |  |
| `versao_reconstrucao` | text | não |  |  |
| `entrada_hash` | text | não |  |  |
| `status` | text | não | 'pendente'::text |  |
| `execucao_backfill_id` | uuid | sim |  | emusys_historico_backfill_execucoes_v1.id |
| `total_eventos` | integer | não | 0 |  |
| `total_particoes` | integer | não | 0 |  |
| `total_periodos` | integer | não | 0 |  |
| `total_diagnosticos` | integer | não | 0 |  |
| `parametros` | jsonb | não | '{}'::jsonb |  |
| `diagnosticos` | jsonb | não | '[]'::jsonb |  |
| `ultimo_erro_codigo` | text | sim |  |  |
| `iniciado_em` | timestamp with time zone | sim |  |  |
| `concluido_em` | timestamp with time zone | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:** professor_periodos_reconstruc_unidade_id_data_inicio_data_f_key, professor_periodos_reconstrucoes_v1_pkey

## professor_periodos_revisoes_v1

> Trilha append-only de revisoes humanas e promocoes automaticas estruturadas sobre periodos reconstruidos.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `periodo_id` | uuid | não |  | professor_matricula_disciplina_periodos_v1.id |
| `reconstrucao_id` | uuid | não |  | professor_periodos_reconstrucoes_v1.id |
| `decisao` | text | não |  |  |
| `motivo` | text | não |  |  |
| `professor_corrigido_id` | integer | sim |  | professores.id |
| `emusys_professor_corrigido_id` | bigint | sim |  |  |
| `data_inicio_corrigida` | timestamp with time zone | sim |  |  |
| `data_fim_corrigida` | timestamp with time zone | sim |  |  |
| `motivo_saida_id` | integer | sim |  | motivos_saida.id |
| `conta_retencao_professor` | boolean | sim |  |  |
| `snapshot_anterior` | jsonb | não |  |  |
| `snapshot_posterior` | jsonb | não |  |  |
| `revisado_por` | integer | não |  | usuarios.id |
| `created_at` | timestamp with time zone | não | now() |  |
| `origem_revisao` | text | não | 'revisao_humana'::text |  |

**Únicos:** professor_periodos_revisoes_v1_pkey, uq_professor_periodos_revisoes_promocao_automatica

**Triggers:** trg_professor_periodos_revisoes_append_only → fn_bloquear_mutacao_professor_periodos_revisoes_v1()

## professor_ponto_confirmacoes

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `professor_id` | integer | não |  | professores.id |
| `aula_emusys_id` | integer | não |  | aulas_emusys.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `data_aula` | date | não |  |  |
| `estava_presente` | boolean | não |  |  |
| `origem` | text | não | 'fabio'::text |  |
| `respondido_em` | timestamp with time zone | não | now() |  |
| `created_at` | timestamp with time zone | não | now() |  |

**Únicos:** professor_ponto_confirmacoes_pkey, professor_ponto_confirmacoes_prof_aula_uq

**Triggers:** trg_professor_ponto_canonicalizar_ocorrencia → fn_professor_ponto_canonicalizar_ocorrencia()

## professor_unidade_curso_modalidade

> Historico temporal canonico das atribuicoes de professor por unidade, curso e modalidade.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `professor_id` | integer | não |  | professores.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `curso_id` | integer | não |  | cursos.id |
| `modalidade` | text | não |  |  |
| `vigencia_inicio` | date | não |  |  |
| `vigencia_fim` | date | sim |  |  |
| `status` | text | não |  |  |
| `fonte` | text | não |  |  |
| `confianca` | text | não |  |  |
| `revisado_por` | integer | sim |  | usuarios.id |
| `revisado_em` | timestamp with time zone | sim |  |  |
| `evidencias` | jsonb | não | '{}'::jsonb |  |
| `criado_em` | timestamp with time zone | não | now() |  |
| `atualizado_em` | timestamp with time zone | não | now() |  |

**Únicos:** professor_unidade_curso_modalidade_pkey, uq_professor_curso_modalidade_ativa_aberta, uq_professor_curso_modalidade_id_escopo

**Triggers:** trg_professor_curso_modalidade_impedir_sobreposicao → fn_professor_curso_modalidade_impedir_sobreposicao_v1(), trg_professor_curso_modalidade_proteger_historico → fn_professor_curso_modalidade_proteger_historico_v1()

## professor_videos

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('professor_videos_id_seq'::regclass) |  |
| `professor_id` | integer | não |  | professores.id |
| `curso_id` | integer | não |  | cursos.id |
| `tipo` | character varying(20) | não |  |  |
| `storage_path` | text | não |  |  |
| `url` | text | não |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `nome_original` | character varying(255) | sim |  |  |

**Únicos:** professor_videos_pkey, professor_videos_professor_id_curso_id_tipo_key

## professores

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('professores_id_seq'::regclass) |  |
| `nome` | character varying(100) | não |  |  |
| `nome_normalizado` | character varying(100) | sim | upper(TRIM(BOTH FROM nome)) |  |
| `ativo` | boolean | sim | true |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `nps_medio` | numeric(3,1) | sim |  |  |
| `media_alunos_turma` | numeric(4,1) | sim |  |  |
| `data_admissao` | date | sim |  |  |
| `comissao_percentual` | numeric(5,2) | sim | 0 |  |
| `observacoes` | text | sim |  |  |
| `foto_url` | character varying(500) | sim |  |  |
| `telefone_whatsapp` | character varying(20) | sim |  |  |
| `emusys_id` | integer | sim |  |  |
| `usuario_id` | integer | sim |  | usuarios.id |
| `nome_preferido` | text | sim |  |  |
| `bio` | text | sim |  |  |
| `onboarding_concluido_em` | timestamp with time zone | sim |  |  |
| `whatsapp_confirmado_em` | timestamp with time zone | sim |  |  |
| `temperamento_codinome` | character varying | sim |  |  |
| `mesclado_em_professor_id` | integer | sim |  | professores.id |

**Únicos:** professores_pkey, uk_professores_nome_normalizado, ux_professores_usuario

**Triggers:** trg_audit → fn_audit_log(), trg_professores_updated_at → update_updated_at_column()

## professores_cursos

> Relacionamento N:N entre professores e cursos que lecionam (especialidades)

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('professores_cursos_id_seq'::regclass) |  |
| `professor_id` | integer | não |  | professores.id |
| `curso_id` | integer | não |  | cursos.id |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:** professores_cursos_pkey, professores_cursos_professor_id_curso_id_key

## professores_emusys_divergencias

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não | nextval('professores_emusys_divergencias_id_seq'::regclass) |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `professor_id` | integer | sim |  | professores.id |
| `professores_unidade_id` | integer | sim |  | professores_unidades.id |
| `emusys_professor_id` | integer | sim |  |  |
| `tipo_divergencia` | text | não |  |  |
| `nome_la` | text | sim |  |  |
| `nome_emusys` | text | sim |  |  |
| `valor_nosso` | jsonb | não | '{}'::jsonb |  |
| `valor_emusys` | jsonb | não | '{}'::jsonb |  |
| `sugestao` | jsonb | não | '{}'::jsonb |  |
| `severidade` | text | não | 'media'::text |  |
| `resolvido` | boolean | não | false |  |
| `decisao` | text | sim |  |  |
| `decidido_por` | text | sim |  |  |
| `decidido_em` | timestamp with time zone | sim |  |  |
| `detectado_em` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:** professores_emusys_divergencias_pendente_uq, professores_emusys_divergencias_pkey

**Triggers:** set_updated_at_professores_emusys_divergencias → set_updated_at()

## professores_performance

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('professores_performance_id_seq'::regclass) |  |
| `professor` | character varying(100) | não |  |  |
| `unidade` | character varying(50) | não |  |  |
| `ano` | integer | sim | 2025 |  |
| `experimentais` | integer | sim | 0 |  |
| `matriculas` | integer | sim | 0 |  |
| `taxa_conversao` | numeric(5,1) | sim | 0 |  |
| `evasoes` | integer | sim | 0 |  |
| `contratos_vencer` | integer | sim | 0 |  |
| `renovacoes` | integer | sim | 0 |  |
| `taxa_renovacao` | numeric(5,1) | sim | 0 |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:** professores_performance_pkey, professores_performance_professor_unidade_ano_key

## professores_sync_log

> Auditoria do sync semanal de professores com o Emusys (edge: sync-professores-emusys)

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não | nextval('professores_sync_log_id_seq'::regclass) |  |
| `evento` | character varying(50) | não |  |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `professor_id` | integer | sim |  | professores.id |
| `emusys_id` | integer | sim |  |  |
| `nome_emusys` | text | sim |  |  |
| `detalhes` | jsonb | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:** professores_sync_log_pkey

## professores_unidades

> Relacionamento N:N entre professores e unidades onde atuam

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('professores_unidades_id_seq'::regclass) |  |
| `professor_id` | integer | não |  | professores.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `created_at` | timestamp with time zone | sim | now() |  |
| `disponibilidade` | jsonb | sim |  |  |
| `emusys_id` | integer | sim |  |  |
| `emusys_nome` | text | sim |  |  |
| `emusys_nome_normalizado` | text | sim |  |  |
| `emusys_ativo` | boolean | não | true |  |
| `validacao_status` | text | não | 'pendente'::text |  |
| `match_score` | numeric(5,2) | sim |  |  |
| `origem` | text | não | 'la_report'::text |  |
| `payload_emusys` | jsonb | não | '{}'::jsonb |  |
| `validado_em` | timestamp with time zone | sim |  |  |
| `validado_por` | text | sim |  |  |
| `last_seen_em` | timestamp with time zone | sim |  |  |
| `updated_at` | timestamp with time zone | não | now() |  |
| `identidade_historica_valida` | boolean | não | false |  |

**Únicos:** professores_unidades_pkey, professores_unidades_professor_id_unidade_id_key, professores_unidades_unidade_emusys_id_uq

**Triggers:** set_updated_at_professores_unidades → set_updated_at()

## programa_fideliza_config

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('programa_fideliza_config_id_seq'::regclass) |  |
| `ano` | integer | não | 2026 |  |
| `meta_churn_maximo` | numeric(5,2) | não | 4.0 |  |
| `meta_inadimplencia_maxima` | numeric(5,2) | não | 1.0 |  |
| `meta_renovacao_minima` | numeric(5,2) | não | 90.0 |  |
| `meta_reajuste_minimo` | numeric(5,2) | não | 7.0 |  |
| `metas_lojinha` | jsonb | não | '{"2ec861f6-023f-4d7b-9927-3960ad8c2a92": 5000, "368d47f5-2d88-4475-bc14-ba084a9a348e": 3000, "95553e96-971b-4590-a6eb-0201d013c14d": 3000}'::jsonb |  |
| `pontos_churn` | integer | não | 25 |  |
| `pontos_inadimplencia` | integer | não | 20 |  |
| `pontos_renovacao` | integer | não | 25 |  |
| `pontos_reajuste` | integer | não | 15 |  |
| `pontos_lojinha` | integer | não | 15 |  |
| `penalidade_nao_preencheu_sistema` | integer | não | 3 |  |
| `penalidade_nao_preencheu_lareport` | integer | não | 3 |  |
| `penalidade_reincidencia_mes` | integer | não | 5 |  |
| `nota_corte` | integer | não | 60 |  |
| `criterio_desempate` | character varying(50) | não | 'menor_churn'::character varying |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:** programa_fideliza_config_ano_key, programa_fideliza_config_pkey

## programa_fideliza_experiencias

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('programa_fideliza_experiencias_id_seq'::regclass) |  |
| `tipo` | character varying(20) | não |  |  |
| `nome` | character varying(100) | não |  |  |
| `descricao` | text | sim |  |  |
| `emoji` | character varying(10) | sim |  |  |
| `valor_estimado` | numeric(10,2) | sim |  |  |
| `ativo` | boolean | não | true |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | sim |  |  |

**Únicos:** programa_fideliza_experiencias_pkey

## programa_fideliza_historico

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('programa_fideliza_historico_id_seq'::regclass) |  |
| `ano` | integer | não |  |  |
| `trimestre` | integer | não |  |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `churn_rate` | numeric(5,2) | não | 0 |  |
| `inadimplencia_pct` | numeric(5,2) | não | 0 |  |
| `taxa_renovacao` | numeric(5,2) | não | 0 |  |
| `reajuste_medio` | numeric(5,2) | não | 0 |  |
| `vendas_lojinha` | numeric(10,2) | não | 0 |  |
| `bateu_churn` | boolean | não | false |  |
| `bateu_inadimplencia` | boolean | não | false |  |
| `bateu_renovacao` | boolean | não | false |  |
| `bateu_reajuste` | boolean | não | false |  |
| `bateu_lojinha` | boolean | não | false |  |
| `pontos_base` | integer | não | 0 |  |
| `pontos_bonus` | integer | não | 0 |  |
| `pontos_penalidades` | integer | não | 0 |  |
| `pontos_total` | integer | não | 0 |  |
| `posicao` | integer | sim |  |  |
| `experiencia_tipo` | character varying(20) | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:** programa_fideliza_historico_ano_trimestre_unidade_id_key, programa_fideliza_historico_pkey

## programa_fideliza_penalidades

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('programa_fideliza_penalidades_id_seq'::regclass) |  |
| `ano` | integer | não | 2026 |  |
| `trimestre` | integer | não |  |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `tipo` | character varying(50) | não |  |  |
| `descricao` | text | sim |  |  |
| `pontos_descontados` | integer | não | 3 |  |
| `data_ocorrencia` | date | não | CURRENT_DATE |  |
| `registrado_por` | character varying(100) | não |  |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | sim |  |  |

**Únicos:** programa_fideliza_penalidades_pkey

## programa_matriculador_config

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('programa_matriculador_config_id_seq'::regclass) |  |
| `ano` | integer | não | 2026 |  |
| `meta_taxa_showup_experimental` | numeric(5,2) | não | 18.0 |  |
| `meta_taxa_experimental_matricula` | numeric(5,2) | não | 75.0 |  |
| `meta_taxa_lead_matricula` | numeric(5,2) | não | 13.5 |  |
| `meta_volume_campo_grande` | integer | não | 25 |  |
| `meta_volume_recreio` | integer | não | 20 |  |
| `meta_volume_barra` | integer | não | 15 |  |
| `meta_ticket_campo_grande` | numeric(10,2) | não | 387.00 |  |
| `meta_ticket_recreio` | numeric(10,2) | não | 435.00 |  |
| `meta_ticket_barra` | numeric(10,2) | não | 450.00 |  |
| `pontos_taxa_showup` | integer | não | 20 |  |
| `pontos_taxa_exp_mat` | integer | não | 25 |  |
| `pontos_taxa_geral` | integer | não | 30 |  |
| `pontos_volume_medio` | integer | não | 15 |  |
| `pontos_ticket_medio` | integer | não | 10 |  |
| `bonus_taxa_showup_por_2pct` | integer | não | 5 |  |
| `bonus_taxa_exp_mat_por_5pct` | integer | não | 5 |  |
| `bonus_taxa_geral_por_1pct` | integer | não | 10 |  |
| `bonus_volume_por_2_acima` | integer | não | 5 |  |
| `bonus_ticket_por_20_acima` | integer | não | 5 |  |
| `penalidade_nao_preencheu_emusys` | integer | não | 3 |  |
| `penalidade_nao_preencheu_lareport` | integer | não | 3 |  |
| `penalidade_lead_abandonado` | integer | não | 2 |  |
| `penalidade_reincidencia_mes` | integer | não | 5 |  |
| `nota_corte` | integer | não | 80 |  |
| `mes_inicio` | integer | não | 1 |  |
| `mes_fim` | integer | não | 11 |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:** programa_matriculador_config_ano_key, programa_matriculador_config_pkey

## programa_matriculador_historico

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('programa_matriculador_historico_id_seq'::regclass) |  |
| `ano` | integer | não |  |  |
| `mes` | integer | não |  |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `total_leads` | integer | não | 0 |  |
| `experimentais_agendadas` | integer | não | 0 |  |
| `experimentais_realizadas` | integer | não | 0 |  |
| `matriculas` | integer | não | 0 |  |
| `taxa_showup_experimental` | numeric(5,2) | sim | 0 |  |
| `taxa_experimental_matricula` | numeric(5,2) | sim | 0 |  |
| `taxa_lead_matricula` | numeric(5,2) | sim | 0 |  |
| `ticket_medio` | numeric(10,2) | sim | 0 |  |
| `pontos_taxa_showup` | integer | sim | 0 |  |
| `pontos_taxa_exp_mat` | integer | sim | 0 |  |
| `pontos_taxa_geral` | integer | sim | 0 |  |
| `pontos_volume` | integer | sim | 0 |  |
| `pontos_ticket` | integer | sim | 0 |  |
| `pontos_bonus` | integer | sim | 0 |  |
| `penalidades_emusys` | integer | sim | 0 |  |
| `pontos_total` | integer | sim | 0 |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:** programa_matriculador_historico_ano_mes_unidade_id_key, programa_matriculador_historico_pkey

## programa_matriculador_penalidades

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('programa_matriculador_penalidades_id_seq'::regclass) |  |
| `ano` | integer | não | 2026 |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `tipo` | character varying(50) | não |  |  |
| `descricao` | text | sim |  |  |
| `pontos_descontados` | integer | não | 0 |  |
| `data_ocorrencia` | date | não |  |  |
| `registrado_por` | text | não |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:** programa_matriculador_penalidades_pkey

## turmas

> Turmas de aula - combinação de professor, dia, horário e sala

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('turmas_id_seq'::regclass) |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `professor_id` | integer | não |  | professores.id |
| `sala_id` | integer | sim |  | salas.id |
| `curso_id` | integer | sim |  | cursos.id |
| `dia_semana` | character varying(20) | não |  |  |
| `horario_inicio` | time without time zone | não |  |  |
| `horario_fim` | time without time zone | sim |  |  |
| `capacidade_maxima` | integer | sim | 4 |  |
| `nome` | character varying(100) | sim |  |  |
| `observacoes` | text | sim |  |  |
| `ativo` | boolean | sim | true |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `duracao_minutos` | integer | sim | 60 |  |

**Únicos:** turmas_pkey, turmas_unidade_id_professor_id_dia_semana_horario_inicio_key

## turmas_alunos

> Relacionamento entre turmas explícitas e alunos

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('turmas_alunos_id_seq'::regclass) |  |
| `turma_id` | integer | não |  | turmas_explicitas.id |
| `aluno_id` | integer | não |  | alunos.id |
| `created_at` | timestamp without time zone | sim | now() |  |

**Únicos:** turmas_alunos_pkey, turmas_alunos_turma_id_aluno_id_key

**Triggers:** trg_audit → fn_audit_log()

## turmas_explicitas

> Turmas explícitas criadas manualmente (turmas regulares e bandas)

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('turmas_explicitas_id_seq'::regclass) |  |
| `tipo` | character varying(10) | não |  |  |
| `nome` | character varying(255) | sim |  |  |
| `professor_id` | integer | não |  | professores.id |
| `curso_id` | integer | sim |  | cursos.id |
| `dia_semana` | character varying(20) | não |  |  |
| `horario_inicio` | time without time zone | não |  |  |
| `sala_id` | integer | sim |  | salas.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `capacidade_maxima` | integer | sim |  |  |
| `ativo` | boolean | sim | true |  |
| `created_at` | timestamp without time zone | sim | now() |  |
| `updated_at` | timestamp without time zone | sim | now() |  |

**Únicos:** turmas_explicitas_pkey

**Triggers:** trg_audit → fn_audit_log()

## turmas_historico

> Histórico de mudanças em turmas: adições, remoções e movimentações de alunos

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('turmas_historico_id_seq'::regclass) |  |
| `turma_id` | integer | não |  | turmas_explicitas.id |
| `aluno_id` | integer | não |  | alunos.id |
| `acao` | character varying(50) | não |  |  |
| `turma_origem_id` | integer | sim |  | turmas_explicitas.id |
| `turma_destino_id` | integer | sim |  | turmas_explicitas.id |
| `usuario_id` | uuid | sim |  | users.id |
| `motivo` | text | sim |  |  |
| `metadata` | jsonb | sim | '{}'::jsonb |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:** turmas_historico_pkey

## vw_aderencia_registro_professor

> Aderencia ao registro. pct_cobertura = tem texto (legado). pct_north_star = registrado em <=24h, medido a partir de 13/07 (piloto). aulas_cobraveis = o que o bot pode cobrar (pos 21/07). NAO confundir as tres.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `professor_id` | integer | sim |  |  |
| `professor_nome` | character varying(200) | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `mes` | date | sim |  |  |
| `aulas` | bigint | sim |  |  |
| `com_registro` | bigint | sim |  |  |
| `pct_cobertura` | numeric | sim |  |  |
| `registros_fabio` | bigint | sim |  |  |
| `registros_emusys` | bigint | sim |  |  |
| `aulas_mensuraveis` | bigint | sim |  |  |
| `registradas_em_24h` | bigint | sim |  |  |
| `pct_north_star` | numeric | sim |  |  |
| `aulas_cobraveis` | bigint | sim |  |  |
| `horas_medianas_ate_registrar` | numeric | sim |  |  |

## vw_aula_roster_operacional_v1

> Roster nominal somente quando a ultima fotografia e completa; estados inseguros nao expoem nomes.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `vinculo_id` | bigint | sim |  |  |
| `aula_emusys_id` | integer | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `aluno_id` | integer | sim |  |  |
| `aluno_emusys_id` | bigint | sim |  |  |
| `aluno_chave` | text | sim |  |  |
| `aluno_nome` | text | sim |  |  |
| `vinculo_sincronizado_em` | timestamp with time zone | sim |  |  |
| `run_id` | uuid | sim |  |  |
| `roster_estado` | text | sim |  |  |
| `qtd_esperada` | integer | sim |  |  |
| `qtd_recebida` | integer | sim |  |  |
| `snapshot_hash` | text | sim |  |  |
| `roster_sincronizado_em` | timestamp with time zone | sim |  |  |

## vw_aula_roster_operacional_v2

> Roster nominal fail-closed: run atual concluido com hash/contagens iguais, identidade local completa e uma unica proveniencia de publicacao.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `vinculo_id` | bigint | sim |  |  |
| `aula_emusys_id` | integer | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `aluno_id` | integer | sim |  |  |
| `aluno_emusys_id` | bigint | sim |  |  |
| `aluno_chave` | text | sim |  |  |
| `aluno_nome` | text | sim |  |  |
| `vinculo_sincronizado_em` | timestamp with time zone | sim |  |  |
| `run_id` | uuid | sim |  |  |
| `roster_estado` | text | sim |  |  |
| `qtd_esperada` | integer | sim |  |  |
| `qtd_recebida` | integer | sim |  |  |
| `snapshot_hash` | text | sim |  |  |
| `roster_sincronizado_em` | timestamp with time zone | sim |  |  |

## vw_aulas_sem_professor

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `diagnostico` | text | sim |  |  |
| `id` | integer | sim |  |  |
| `emusys_id` | integer | sim |  |  |
| `data_aula` | date | sim |  |  |
| `professor_nome` | character varying(200) | sim |  |  |
| `emusys_professor_id` | integer | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `professor_recuperavel` | integer | sim |  |  |
| `curso_nome` | character varying(100) | sim |  |  |
| `sala_nome` | character varying(100) | sim |  |  |
| `e_futura` | boolean | sim |  |  |

## vw_disponibilidade_professores

> Espelho operacional da disponibilidade oficial mantida no Emusys, sem contato ou financeiro.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `professores_unidade_id` | integer | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `professor_nome` | character varying(100) | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `unidade_nome` | character varying(100) | sim |  |  |
| `disponibilidade` | jsonb | sim |  |  |
| `emusys_id` | integer | sim |  |  |
| `validacao_status` | text | sim |  |  |
| `last_seen_em` | timestamp with time zone | sim |  |  |
| `proposta_ativa_id` | uuid | sim |  |  |
| `proposta_status` | text | sim |  |  |
| `disponibilidade_proposta` | jsonb | sim |  |  |

## vw_fabio_aulas_contexto

> Contexto de aula para o Fábio (roster do normalizador de áudio, bridge, consultas). presenca_status carrega SÓ presença afirmada (fn_presenca_e_forte); chamada não lançada / "ausente" cru do Emusys vira NULL — regra de 24/08 depois do caso Isaque: o fantasma "ausente" fez o normalizador recusar áudio legítimo como transcricao_incompativel. presenca_forte expõe o próprio flag.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `aula_local_id` | integer | sim |  |  |
| `aula_emusys_id` | integer | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `unidade_codigo` | character varying(20) | sim |  |  |
| `unidade_nome` | character varying(100) | sim |  |  |
| `data_aula` | date | sim |  |  |
| `data_hora_inicio` | timestamp with time zone | sim |  |  |
| `data_hora_fim` | timestamp with time zone | sim |  |  |
| `horario_inicio_brt` | time without time zone | sim |  |  |
| `horario_fim_brt` | time without time zone | sim |  |  |
| `aula_tipo` | character varying(30) | sim |  |  |
| `aula_categoria` | character varying(30) | sim |  |  |
| `turma_nome` | character varying(100) | sim |  |  |
| `curso_emusys_id` | integer | sim |  |  |
| `curso_nome` | character varying(100) | sim |  |  |
| `sala_nome` | character varying(100) | sim |  |  |
| `professor_id_origem_aula` | integer | sim |  |  |
| `professor_nome_origem_aula` | character varying(200) | sim |  |  |
| `emusys_professor_id` | integer | sim |  |  |
| `emusys_professor_nome` | text | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `professor_nome` | character varying | sim |  |  |
| `professor_emusys_validacao_status` | text | sim |  |  |
| `professor_match_fonte` | text | sim |  |  |
| `aluno_id` | integer | sim |  |  |
| `aluno_nome` | character varying(200) | sim |  |  |
| `emusys_student_id` | text | sim |  |  |
| `emusys_matricula_id` | text | sim |  |  |
| `presenca_status` | character varying(20) | sim |  |  |
| `presenca_respondida_em` | timestamp with time zone | sim |  |  |
| `cancelada` | boolean | sim |  |  |
| `nr_da_aula` | integer | sim |  |  |
| `qtd_alunos` | integer | sim |  |  |
| `anotacoes` | text | sim |  |  |
| `anotacoes_fabio` | text | sim |  |  |
| `qualidade_contexto` | text | sim |  |  |
| `professor_unidade_ativa` | boolean | sim |  |  |
| `identidade_historica_valida` | boolean | sim |  |  |
| `sem_acompanhamento` | boolean | sim |  |  |
| `presenca_forte` | boolean | sim |  |  |

## vw_fabio_carteira_professor

> Carteira do professor que o Fabio le. Desde a 026 diz tambem HA QUANTO TEMPO o aluno esta na casa (data_matricula, dias_desde_matricula, e_aluno_novo) e quantas aulas dele ja foram registradas.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade_id` | uuid | sim |  |  |
| `unidade_codigo` | character varying(20) | sim |  |  |
| `unidade_nome` | character varying(100) | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `professor_nome` | character varying(100) | sim |  |  |
| `professores_unidade_id` | integer | sim |  |  |
| `emusys_professor_id` | integer | sim |  |  |
| `professor_emusys_validacao_status` | text | sim |  |  |
| `aluno_id` | integer | sim |  |  |
| `aluno_nome` | character varying(200) | sim |  |  |
| `emusys_student_id` | text | sim |  |  |
| `emusys_matricula_id` | text | sim |  |  |
| `aluno_status` | character varying(20) | sim |  |  |
| `curso_id` | integer | sim |  |  |
| `curso_nome` | character varying(100) | sim |  |  |
| `tipo_matricula_codigo` | character varying(20) | sim |  |  |
| `tipo_matricula_nome` | character varying(50) | sim |  |  |
| `dia_aula` | character varying(20) | sim |  |  |
| `horario_aula` | time without time zone | sim |  |  |
| `telefone` | character varying(20) | sim |  |  |
| `whatsapp` | character varying(20) | sim |  |  |
| `email` | character varying(150) | sim |  |  |
| `responsavel_nome` | character varying(255) | sim |  |  |
| `responsavel_telefone` | character varying(50) | sim |  |  |
| `valor_parcela` | numeric(10,2) | sim |  |  |
| `qualidade_contexto` | text | sim |  |  |
| `jornada_id` | uuid | sim |  |  |
| `emusys_matricula_disciplina_id` | bigint | sim |  |  |
| `data_matricula` | date | sim |  |  |
| `dias_desde_matricula` | integer | sim |  |  |
| `e_aluno_novo` | boolean | sim |  |  |
| `aulas_registradas` | integer | sim |  |  |

## vw_fabio_contexto_experimental

> Contexto da experimental que o Fabio pode ver. Lista de permissao: dinheiro, negociacao e recado interno nao atravessam. Idade sempre calculada de data_nascimento.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `aluno_id` | integer | sim |  |  |
| `lead_experimental_id` | integer | sim |  |  |
| `data_experimental` | date | sim |  |  |
| `curso` | text | sim |  |  |
| `idade` | integer | sim |  |  |
| `contexto` | jsonb | sim |  |  |

## vw_fabio_experimental_agendada

> Experimentais agendadas com contexto extraido, por professor que vai dar a aula. Nao exige matricula: lead pre-matricula aparece aqui.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `professor_id` | integer | sim |  |  |
| `lead_experimental_id` | integer | sim |  |  |
| `nome_aluno` | text | sim |  |  |
| `data_experimental` | date | sim |  |  |
| `horario_experimental` | time without time zone | sim |  |  |
| `curso` | text | sim |  |  |
| `aluno_id` | integer | sim |  |  |
| `contexto` | jsonb | sim |  |  |

## vw_fabio_participacao_ocorrencia_estado

> Fonte unica do estado atual de cada ocorrencia. registrada->candidata; o resto 1:1.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `ocorrencia_id` | uuid | sim |  |  |
| `estado_atual` | text | sim |  |  |
| `estado_em` | timestamp with time zone | sim |  |  |
| `estado_por` | text | sim |  |  |

## vw_fator_demanda_professor

> Calcula o Fator de Demanda Ponderado de cada professor baseado na composição da carteira de alunos

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `professor_id` | integer | sim |  |  |
| `professor_nome` | character varying(100) | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `total_alunos` | integer | sim |  |  |
| `fator_demanda_ponderado` | numeric | sim |  |  |
| `detalhamento_cursos` | json | sim |  |  |

## vw_health_score_professor_v3_parcial_observado

> Leitura operacional V3: usa somente valores brutos reais e metas versionadas; nao altera snapshots nem libera ranking.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `snapshot_id` | uuid | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `escopo` | text | sim |  |  |
| `competencia` | date | sim |  |  |
| `trimestre_inicio` | date | sim |  |  |
| `periodicidade` | text | sim |  |  |
| `periodo_inicio` | date | sim |  |  |
| `periodo_fim` | date | sim |  |  |
| `ciclo_codigo` | text | sim |  |  |
| `estado_publicacao_parcial_observado` | text | sim |  |  |
| `score_exibivel_parcial_observado` | boolean | sim |  |  |
| `ranking_habilitado` | boolean | sim |  |  |
| `config_versao` | integer | sim |  |  |
| `revisao` | integer | sim |  |  |
| `score_parcial_observado` | numeric | sim |  |  |
| `cobertura_parcial_observada` | numeric | sim |  |  |
| `classificacao_parcial_observada` | text | sim |  |  |
| `estado` | text | sim |  |  |
| `snapshot_publicavel` | boolean | sim |  |  |
| `publicado` | boolean | sim |  |  |
| `motivo_bloqueio` | text | sim |  |  |
| `regra_versao_snapshot` | text | sim |  |  |
| `metrica` | text | sim |  |  |
| `valor_bruto` | numeric | sim |  |  |
| `numerador` | numeric | sim |  |  |
| `denominador` | numeric | sim |  |  |
| `nota_parcial_observada` | numeric | sim |  |  |
| `peso` | numeric(5,2) | sim |  |  |
| `peso_disponivel_parcial_observado` | boolean | sim |  |  |
| `contribuicao_parcial_observada` | numeric | sim |  |  |
| `meta_aplicada` | numeric(14,4) | sim |  |  |
| `amostra` | integer | sim |  |  |
| `estado_base` | text | sim |  |  |
| `metrica_publicavel_oficial` | boolean | sim |  |  |
| `confianca` | text | sim |  |  |
| `fonte` | text | sim |  |  |
| `regra_versao_metrica_oficial` | text | sim |  |  |
| `motivo_sem_base` | text | sim |  |  |
| `detalhes` | jsonb | sim |  |  |

## vw_health_score_professor_v3_parcial_operacional

> Leitura operacional V3 set-based. Presenca de Barra/Recreio e calculada uma vez por recorte; Campo Grande permanece fora do score.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `snapshot_id` | uuid | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `escopo` | text | sim |  |  |
| `competencia` | date | sim |  |  |
| `trimestre_inicio` | date | sim |  |  |
| `periodicidade` | text | sim |  |  |
| `periodo_inicio` | date | sim |  |  |
| `periodo_fim` | date | sim |  |  |
| `ciclo_codigo` | text | sim |  |  |
| `estado_publicacao` | text | sim |  |  |
| `score_exibivel` | boolean | sim |  |  |
| `ranking_habilitado` | boolean | sim |  |  |
| `config_versao` | integer | sim |  |  |
| `revisao` | integer | sim |  |  |
| `score` | numeric | sim |  |  |
| `cobertura` | numeric | sim |  |  |
| `classificacao` | text | sim |  |  |
| `estado` | text | sim |  |  |
| `snapshot_publicavel` | boolean | sim |  |  |
| `publicado` | boolean | sim |  |  |
| `motivo_bloqueio` | text | sim |  |  |
| `regra_versao_snapshot` | text | sim |  |  |
| `metrica` | text | sim |  |  |
| `valor_bruto` | numeric | sim |  |  |
| `numerador` | numeric | sim |  |  |
| `denominador` | numeric | sim |  |  |
| `nota` | numeric | sim |  |  |
| `peso` | numeric(5,2) | sim |  |  |
| `peso_disponivel` | boolean | sim |  |  |
| `contribuicao` | numeric | sim |  |  |
| `meta` | numeric(14,4) | sim |  |  |
| `amostra` | integer | sim |  |  |
| `estado_base` | text | sim |  |  |
| `metrica_publicavel` | boolean | sim |  |  |
| `confianca` | text | sim |  |  |
| `fonte` | text | sim |  |  |
| `regra_versao_metrica` | text | sim |  |  |
| `motivo_sem_base` | text | sim |  |  |
| `detalhes` | jsonb | sim |  |  |

## vw_kpis_professor_completo

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `professor_id` | integer | sim |  |  |
| `professor_nome` | character varying(100) | sim |  |  |
| `carteira_alunos` | integer | sim |  |  |
| `ticket_medio` | numeric(10,2) | sim |  |  |
| `media_presenca` | numeric(5,2) | sim |  |  |
| `taxa_faltas` | numeric(5,2) | sim |  |  |
| `mrr_carteira` | numeric(12,2) | sim |  |  |
| `nps_medio` | numeric(5,2) | sim |  |  |
| `media_alunos_turma` | numeric(5,2) | sim |  |  |

## vw_kpis_professor_historico

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `professor_id` | integer | sim |  |  |
| `professor_nome` | character varying(100) | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `ano` | integer | sim |  |  |
| `mes` | integer | sim |  |  |
| `matriculas` | integer | sim |  |  |
| `ticket_medio` | numeric(10,2) | sim |  |  |
| `experimentais` | integer | sim |  |  |
| `total_experimentais_unidade` | integer | sim |  |  |
| `total_matriculas_unidade` | integer | sim |  |  |
| `taxa_conversao` | numeric | sim |  |  |
| `nps_medio` | numeric(5,2) | sim |  |  |
| `media_alunos_turma` | numeric(5,2) | sim |  |  |

## vw_kpis_professor_mensal

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `professor_id` | integer | sim |  |  |
| `professor_nome` | character varying(100) | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `ano` | integer | sim |  |  |
| `mes` | integer | sim |  |  |
| `carteira_alunos` | integer | sim |  |  |
| `ticket_medio` | numeric(10,2) | sim |  |  |
| `media_presenca` | numeric(5,2) | sim |  |  |
| `taxa_faltas` | numeric(5,2) | sim |  |  |
| `mrr_carteira` | numeric(12,2) | sim |  |  |
| `nps_medio` | numeric(5,2) | sim |  |  |
| `media_alunos_turma` | numeric(5,2) | sim |  |  |
| `experimentais` | integer | sim |  |  |
| `matriculas` | integer | sim |  |  |
| `matriculas_pos_exp` | integer | sim |  |  |
| `matriculas_diretas` | integer | sim |  |  |
| `taxa_conversao` | numeric | sim |  |  |
| `renovacoes` | integer | sim |  |  |
| `nao_renovacoes` | integer | sim |  |  |
| `taxa_renovacao` | numeric | sim |  |  |
| `evasoes` | integer | sim |  |  |
| `mrr_perdido` | numeric(12,2) | sim |  |  |
| `taxa_cancelamento` | numeric | sim |  |  |
| `ranking_matriculador` | integer | sim |  |  |
| `ranking_renovador` | integer | sim |  |  |
| `ranking_churn` | integer | sim |  |  |

## vw_kpis_professor_por_unidade

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `professor_id` | integer | sim |  |  |
| `professor_nome` | character varying(100) | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `carteira_alunos` | integer | sim |  |  |
| `ticket_medio` | numeric(10,2) | sim |  |  |
| `media_presenca` | numeric(5,2) | sim |  |  |
| `taxa_faltas` | numeric(5,2) | sim |  |  |
| `mrr_carteira` | numeric(12,2) | sim |  |  |
| `nps_medio` | numeric(5,2) | sim |  |  |
| `media_alunos_turma` | numeric(5,2) | sim |  |  |

## vw_ponto_professor_aulas

> Ponto do professor por ocorrencia vigente. Confirmacoes anteriores ao ultimo reagendamento nao creditam a nova ocorrencia.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `aula_emusys_id` | integer | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `data_aula` | date | sim |  |  |
| `data_hora_inicio` | timestamp with time zone | sim |  |  |
| `data_hora_fim` | timestamp with time zone | sim |  |  |
| `duracao_minutos` | integer | sim |  |  |
| `tem_presenca` | boolean | sim |  |  |
| `tem_falta` | boolean | sim |  |  |
| `ponta_confirmada` | boolean | sim |  |  |
| `evidencia_presenca` | boolean | sim |  |  |
| `primeira_evidencia_inicio` | timestamp with time zone | sim |  |  |
| `ultima_evidencia_inicio` | timestamp with time zone | sim |  |  |
| `aula_creditada` | boolean | sim |  |  |

## vw_ponto_professor_diario

> NAO E MAIS CAMINHO DO APP (28/08/2026) -- o app usa fn_ponto_professor_diario. Esta view monta a escola inteira pra filtrar depois (~4s). Fica como ORACULO do teste diferencial do conserto. Nao usar em tela.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `professor_id` | integer | sim |  |  |
| `data_aula` | date | sim |  |  |
| `unidades_ids` | uuid[] | sim |  |  |
| `inicio_creditado` | timestamp with time zone | sim |  |  |
| `fim_creditado` | timestamp with time zone | sim |  |  |
| `minutos_creditados` | integer | sim |  |  |
| `aulas_creditadas` | integer | sim |  |  |
| `pontas_confirmadas` | integer | sim |  |  |

## vw_presenca_ocorrencia_canonica_v2

> Read model v2.7: raw Emusys ausente nao e terminal; gemeas presente + ausente nao geram conflito; positiva so contradiz falta humana quando o snapshot publicavel de presenca e coerente, atual, vinculado a roster ativo e dentro da janela de execucao. Experimental segue contrato proprio.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `slot_key` | text | sim |  |  |
| `aluno_id` | integer | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `data_aula` | date | sim |  |  |
| `data_hora_inicio` | timestamp with time zone | sim |  |  |
| `data_hora_fim` | timestamp with time zone | sim |  |  |
| `curso_nome` | text | sim |  |  |
| `resultado_canonico` | text | sim |  |  |
| `fecha_chamada` | boolean | sim |  |  |
| `fonte_decisao` | text | sim |  |  |
| `decidido_em` | timestamp with time zone | sim |  |  |
| `emusys_presenca_bruta` | text | sim |  |  |
| `possui_conflito` | boolean | sim |  |  |
| `ids_aulas_emusys` | integer[] | sim |  |  |
| `regra_versao` | text | sim |  |  |

## vw_presenca_ocorrencia_metrica_v2

> Kernel metrico service-only. Agentes consomem exclusivamente as RPCs governadas por finalidade; ausencia Emusys nunca e inferida como falta.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `slot_key` | text | sim |  |  |
| `aluno_id` | integer | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `data_aula` | date | sim |  |  |
| `data_hora_inicio` | timestamp with time zone | sim |  |  |
| `data_hora_fim` | timestamp with time zone | sim |  |  |
| `curso_nome` | text | sim |  |  |
| `resultado_canonico` | text | sim |  |  |
| `fecha_chamada` | boolean | sim |  |  |
| `fonte_decisao` | text | sim |  |  |
| `decidido_em` | timestamp with time zone | sim |  |  |
| `possui_conflito` | boolean | sim |  |  |
| `ids_aulas_emusys` | integer[] | sim |  |  |
| `ocorrencia_regra_versao` | text | sim |  |  |
| `considera_frequencia_denominador` | boolean | sim |  |  |
| `considera_presenca` | boolean | sim |  |  |
| `considera_falta` | boolean | sim |  |  |
| `considera_falta_justificada` | boolean | sim |  |  |
| `ocorrencia_incompleta` | boolean | sim |  |  |

## vw_presenca_pendencia

> Governanca operacional (Fase 3): alunos sem presenca FORTE por aula/unidade/dia (fn_presenca_e_forte), roster-gap-aware, janela 45d. Fonte unica p/ Fabio (professor), Sol/Hugo (unidade), coordenacao (dias>=3). Nao e o canon analitico.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade_id` | uuid | sim |  |  |
| `unidade_nome` | character varying(100) | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `professor_nome` | character varying(100) | sim |  |  |
| `aula_id` | integer | sim |  |  |
| `tipo` | character varying(30) | sim |  |  |
| `data_aula` | date | sim |  |  |
| `data_hora_inicio` | timestamp with time zone | sim |  |  |
| `data_hora_fim` | timestamp with time zone | sim |  |  |
| `hora` | text | sim |  |  |
| `curso_nome` | character varying(100) | sim |  |  |
| `turma_nome` | character varying(100) | sim |  |  |
| `aluno_id` | integer | sim |  |  |
| `aluno_nome` | character varying(200) | sim |  |  |
| `aluno_primeiro_nome` | text | sim |  |  |
| `justificada` | boolean | sim |  |  |
| `dias_em_atraso` | integer | sim |  |  |

## vw_presenca_slot_canonica_v1

> FONTE ÚNICA de presença por slot real: uma linha por (aluno, aula que aconteceu). Colapsa a duplicata turma/individual que o Emusys emite (85-91% da grade) e resolve pela decisão mais forte, então linha órfã nunca aparece como "sem rumo". presenca_afirmada carrega SÓ decisão declarada — o "ausente" cru do Emusys é default de sistema e vira NULL. Criada em 24/08/2026 depois que a Sol dizia "tudo fechado" e o LA Teacher dizia "Faltou" para a mesma aula.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `aluno_presenca_id` | uuid | sim |  |  |
| `aluno_id` | integer | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `aula_emusys_id` | integer | sim |  |  |
| `aula_emusys_evento_id` | integer | sim |  |  |
| `data_aula` | date | sim |  |  |
| `data_hora_inicio` | timestamp with time zone | sim |  |  |
| `data_hora_fim` | timestamp with time zone | sim |  |  |
| `horario_aula` | time without time zone | sim |  |  |
| `curso_nome` | character varying(100) | sim |  |  |
| `turma_nome` | character varying(100) | sim |  |  |
| `aula_categoria` | character varying(30) | sim |  |  |
| `aula_tipo` | character varying(30) | sim |  |  |
| `estado_origem` | text | sim |  |  |
| `status_presenca` | text | sim |  |  |
| `respondido_por` | character varying(30) | sim |  |  |
| `respondido_em` | timestamp with time zone | sim |  |  |
| `proveniencia` | text | sim |  |  |
| `situacao_chamada` | text | sim |  |  |
| `resultado_pedagogico` | text | sim |  |  |
| `confianca` | text | sim |  |  |
| `considera_frequencia_denominador` | boolean | sim |  |  |
| `considera_presenca` | boolean | sim |  |  |
| `considera_falta` | boolean | sim |  |  |
| `exclui_por_evento` | boolean | sim |  |  |
| `estado_emusys_bruto` | text | sim |  |  |
| `professor_presenca_emusys` | text | sim |  |  |
| `evidencia_registrada_em` | timestamp with time zone | sim |  |  |
| `fundamento_confianca` | text | sim |  |  |
| `revisao_operacional_exigida` | boolean | sim |  |  |
| `revisao_operacional_status` | text | sim |  |  |
| `qtd_linhas_no_slot` | bigint | sim |  |  |
| `slot_geminado_no_emusys` | boolean | sim |  |  |
| `tem_divergencia` | boolean | sim |  |  |
| `presenca_afirmada` | text | sim |  |  |
| `chamada_fechada` | boolean | sim |  |  |
| `regra_versao` | text | sim |  |  |
| `possui_conflito` | boolean | sim |  |  |

## vw_professor_carteira_pessoa_canonica_sombra

> Carteira atual por pessoa/professor/unidade. Resolve ID Emusys pela jornada ou linha local e nao usa presenca.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade_id` | uuid | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `professor_nome` | character varying(100) | sim |  |  |
| `pessoa_chave` | text | sim |  |  |
| `emusys_aluno_id` | bigint | sim |  |  |
| `aluno_id_canonico` | integer | sim |  |  |
| `aluno_nome` | text | sim |  |  |
| `identidade_fonte` | text | sim |  |  |
| `identidade_confianca` | text | sim |  |  |
| `linhas_locais` | integer | sim |  |  |
| `linhas_ativas` | integer | sim |  |  |
| `qtd_jornadas_ativas` | integer | sim |  |  |
| `jornada_ids` | uuid[] | sim |  |  |
| `emusys_matricula_disciplina_ids` | bigint[] | sim |  |  |
| `curso_ids` | integer[] | sim |  |  |
| `cursos_emusys` | text[] | sim |  |  |
| `primeira_aula` | timestamp with time zone | sim |  |  |
| `ultima_aula` | timestamp with time zone | sim |  |  |
| `ultima_sincronizacao_emusys` | timestamp with time zone | sim |  |  |
| `fonte_carteira` | text | sim |  |  |

## vw_professor_periodos_baseline_v3_sombra

> Baseline imutavel efetivo do Gate 4, antes da aplicacao de revisoes humanas.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `periodo_chave` | text | sim |  |  |
| `periodo_origem_id` | uuid | sim |  |  |
| `reconstrucao_id` | uuid | sim |  |  |
| `transicao_fim_id` | uuid | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `pessoa_chave` | text | sim |  |  |
| `aluno_id` | integer | sim |  |  |
| `emusys_aluno_id` | bigint | sim |  |  |
| `emusys_matricula_id` | bigint | sim |  |  |
| `emusys_matricula_disciplina_id` | bigint | sim |  |  |
| `emusys_disciplina_id` | bigint | sim |  |  |
| `curso_id` | integer | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `emusys_professor_id` | bigint | sim |  |  |
| `data_inicio` | timestamp with time zone | sim |  |  |
| `data_fim` | timestamp with time zone | sim |  |  |
| `status_periodo` | text | sim |  |  |
| `tipo_inicio` | text | sim |  |  |
| `tipo_fim` | text | sim |  |  |
| `duracao_dias` | numeric | sim |  |  |
| `duracao_meses` | numeric | sim |  |  |
| `elegivel_permanencia` | boolean | sim |  |  |
| `motivo_saida_id` | integer | sim |  |  |
| `atribuicao_confirmada` | boolean | sim |  |  |
| `conta_retencao_professor` | boolean | sim |  |  |
| `confianca` | text | sim |  |  |
| `inicio_incompleto` | boolean | sim |  |  |
| `substituicao_candidata` | boolean | sim |  |  |
| `conflitos` | jsonb | sim |  |  |
| `publicavel` | boolean | sim |  |  |
| `fonte` | text | sim |  |  |
| `chave_natural` | text | sim |  |  |

## vw_professor_periodos_diagnostico_v1

> Fila tecnica em sombra. Nao contem payload bruto e nao e concedida a usuarios finais nesta fase.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `periodo_id` | uuid | sim |  |  |
| `reconstrucao_id` | uuid | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `pessoa_chave` | text | sim |  |  |
| `emusys_matricula_id` | bigint | sim |  |  |
| `emusys_matricula_disciplina_id` | bigint | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `emusys_professor_id` | bigint | sim |  |  |
| `data_inicio` | timestamp with time zone | sim |  |  |
| `data_fim` | timestamp with time zone | sim |  |  |
| `status_periodo` | text | sim |  |  |
| `confianca` | text | sim |  |  |
| `publicavel` | boolean | sim |  |  |
| `inicio_incompleto` | boolean | sim |  |  |
| `substituicao_candidata` | boolean | sim |  |  |
| `conflitos` | jsonb | sim |  |  |
| `tipos_diagnostico` | text[] | sim |  |  |

## vw_professor_periodos_efetivos_v3_sombra

> Baseline e transicoes com overlay append-only; promocoes automaticas preservam confianca alta e revisoes humanas usam revisado_aprovado.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `periodo_chave` | text | sim |  |  |
| `periodo_origem_id` | uuid | sim |  |  |
| `reconstrucao_id` | uuid | sim |  |  |
| `transicao_fim_id` | uuid | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `pessoa_chave` | text | sim |  |  |
| `aluno_id` | integer | sim |  |  |
| `emusys_aluno_id` | bigint | sim |  |  |
| `emusys_matricula_id` | bigint | sim |  |  |
| `emusys_matricula_disciplina_id` | bigint | sim |  |  |
| `emusys_disciplina_id` | bigint | sim |  |  |
| `curso_id` | integer | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `emusys_professor_id` | bigint | sim |  |  |
| `data_inicio` | timestamp with time zone | sim |  |  |
| `data_fim` | timestamp with time zone | sim |  |  |
| `status_periodo` | text | sim |  |  |
| `tipo_inicio` | text | sim |  |  |
| `tipo_fim` | text | sim |  |  |
| `duracao_dias` | numeric | sim |  |  |
| `duracao_meses` | numeric | sim |  |  |
| `elegivel_permanencia` | boolean | sim |  |  |
| `motivo_saida_id` | integer | sim |  |  |
| `atribuicao_confirmada` | boolean | sim |  |  |
| `conta_retencao_professor` | boolean | sim |  |  |
| `confianca` | text | sim |  |  |
| `inicio_incompleto` | boolean | sim |  |  |
| `substituicao_candidata` | boolean | sim |  |  |
| `conflitos` | jsonb | sim |  |  |
| `publicavel` | boolean | sim |  |  |
| `fonte` | text | sim |  |  |

## vw_professores_carteira_resumo

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `professor_id` | integer | sim |  |  |
| `professor_nome` | character varying(100) | sim |  |  |
| `telefone_whatsapp` | character varying(20) | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `total_alunos` | bigint | sim |  |  |
| `alunos_verdes` | bigint | sim |  |  |
| `alunos_amarelos` | bigint | sim |  |  |
| `alunos_vermelhos` | bigint | sim |  |  |
| `alunos_sem_avaliacao` | bigint | sim |  |  |

## vw_professores_emusys_vinculos

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `professores_unidade_id` | integer | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `unidade_codigo` | character varying(20) | sim |  |  |
| `unidade_nome` | character varying(100) | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `professor_nome` | character varying(100) | sim |  |  |
| `professor_nome_normalizado` | character varying(100) | sim |  |  |
| `professor_ativo` | boolean | sim |  |  |
| `emusys_professor_id` | integer | sim |  |  |
| `emusys_nome` | text | sim |  |  |
| `emusys_nome_normalizado` | text | sim |  |  |
| `emusys_ativo` | boolean | sim |  |  |
| `validacao_status` | text | sim |  |  |
| `match_score` | numeric(5,2) | sim |  |  |
| `origem` | text | sim |  |  |
| `validado_em` | timestamp with time zone | sim |  |  |
| `validado_por` | text | sim |  |  |
| `last_seen_em` | timestamp with time zone | sim |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |
| `qualidade_vinculo` | text | sim |  |  |
| `identidade_historica_valida` | boolean | sim |  |  |

## vw_professores_performance_atual

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `professor_id` | integer | sim |  |  |
| `professor` | character varying(100) | sim |  |  |
| `unidade` | character varying(100) | sim |  |  |
| `ano` | integer | sim |  |  |
| `total_alunos` | bigint | sim |  |  |
| `ticket_medio` | numeric(10,2) | sim |  |  |
| `mrr` | numeric(12,2) | sim |  |  |
| `tempo_permanencia_medio` | numeric(5,1) | sim |  |  |
| `presenca_media` | numeric(5,1) | sim |  |  |
| `experimentais` | integer | sim |  |  |
| `matriculas` | integer | sim |  |  |
| `taxa_conversao` | numeric | sim |  |  |
| `evasoes` | integer | sim |  |  |

## vw_registro_pendencia

> Aulas encerradas sem conteudo registrado. cobravel = dentro da data de corte E professor com o app liberado (fn_professor_usa_app).

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `professor_id` | integer | sim |  |  |
| `professor_nome` | character varying(200) | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `aula_ancora_id` | integer | sim |  |  |
| `aula_alvo_id` | integer | sim |  |  |
| `data_aula` | date | sim |  |  |
| `data_hora_inicio` | timestamp with time zone | sim |  |  |
| `data_hora_fim` | timestamp with time zone | sim |  |  |
| `curso_nome` | character varying(100) | sim |  |  |
| `curso_base` | text | sim |  |  |
| `turma_nome` | character varying(100) | sim |  |  |
| `tipo` | character varying(30) | sim |  |  |
| `aluno_id` | integer | sim |  |  |
| `aluno_nome` | character varying(200) | sim |  |  |
| `aluno_primeiro_nome` | text | sim |  |  |
| `status_presenca` | text | sim |  |  |
| `chamada_feita` | boolean | sim |  |  |
| `dias_em_atraso` | integer | sim |  |  |
| `cobravel` | boolean | sim |  |  |
| `tem_plano_emusys` | boolean | sim |  |  |

## vw_taxa_crescimento_professor

> Calcula a Taxa de Crescimento por Professor com Fator de Demanda Ponderado

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `professor_id` | integer | sim |  |  |
| `professor_nome` | character varying(100) | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `ano` | integer | sim |  |  |
| `mes` | integer | sim |  |  |
| `alunos_iniciais` | integer | sim |  |  |
| `matriculas_mes` | integer | sim |  |  |
| `evasoes_mes` | integer | sim |  |  |
| `nao_renovacoes_mes` | integer | sim |  |  |
| `fator_demanda_ponderado` | numeric | sim |  |  |
| `taxa_crescimento_bruta` | numeric | sim |  |  |
| `taxa_crescimento_ajustada` | numeric | sim |  |  |
| `pontos_crescimento` | numeric | sim |  |  |

## vw_turmas_completa

> View com informações completas das turmas incluindo contagem de alunos

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `unidade_nome` | character varying(100) | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `professor_nome` | character varying(100) | sim |  |  |
| `sala_id` | integer | sim |  |  |
| `sala_nome` | character varying(100) | sim |  |  |
| `curso_id` | integer | sim |  |  |
| `curso_nome` | character varying(100) | sim |  |  |
| `dia_semana` | character varying(20) | sim |  |  |
| `horario_inicio` | time without time zone | sim |  |  |
| `horario_fim` | time without time zone | sim |  |  |
| `capacidade_maxima` | integer | sim |  |  |
| `turma_nome` | character varying(100) | sim |  |  |
| `ativo` | boolean | sim |  |  |
| `total_alunos` | bigint | sim |  |  |
| `nomes_alunos` | character varying[] | sim |  |  |
| `ids_alunos` | integer[] | sim |  |  |

## vw_turmas_implicitas

> View de turmas baseada nos dados existentes de alunos (professor + dia + horário)

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade_id` | uuid | sim |  |  |
| `unidade_nome` | character varying(100) | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `professor_nome` | character varying(100) | sim |  |  |
| `curso_id` | integer | sim |  |  |
| `curso_nome` | character varying(100) | sim |  |  |
| `dia_semana` | character varying(20) | sim |  |  |
| `horario_inicio` | time without time zone | sim |  |  |
| `total_alunos` | bigint | sim |  |  |
| `nomes_alunos` | character varying[] | sim |  |  |
| `ids_alunos` | integer[] | sim |  |  |
| `ticket_medio_turma` | numeric | sim |  |  |
| `tempo_medio_turma` | numeric | sim |  |  |
| `turma_explicita_id` | integer | sim |  |  |
| `sala_id` | integer | sim |  |  |
| `sala_nome` | character varying(100) | sim |  |  |
| `capacidade_maxima` | integer | sim |  |  |

## vw_turmas_professor_periodo

> Turmas reconstruidas a partir de aulas_emusys+aluno_presenca. turma_chave usa COALESCE para nao perder turmas com turma_nome NULL.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `aula_id` | integer | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `data_aula` | date | sim |  |  |
| `turma_nome` | character varying(100) | sim |  |  |
| `turma_chave` | text | sim |  |  |
| `curso_nome` | character varying(100) | sim |  |  |
| `sala_nome` | character varying(100) | sim |  |  |
| `dia_semana_iso` | integer | sim |  |  |
| `horario_inicio` | text | sim |  |  |
| `aluno_id` | integer | sim |  |  |
| `status_presenca` | character varying(20) | sim |  |  |
| `aluno_nome` | character varying(200) | sim |  |  |
| `aluno_status` | character varying(20) | sim |  |  |

