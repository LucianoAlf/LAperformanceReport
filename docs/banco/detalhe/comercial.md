<!-- GERADO POR scripts/gerar-mapa-banco.mjs — NÃO EDITE À MÃO.
     Banco: ouqwbbermlzqqvtqwlul · Gerado em: 2026-09-09 -->

<!-- fim do cabecalho gerado -->
# Detalhe do banco — comercial

69 objetos. Resumo de todos os domínios em `../TABELAS.gerado.md`.

## agente_conversas

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `agente_id` | uuid | sim |  | agentes.id |
| `unidade_id` | uuid | sim |  | unidades.id |
| `telefone` | text | não |  |  |
| `bot_ativo` | boolean | sim | true |  |
| `pausado_por` | uuid | sim |  | users.id |
| `pausado_em` | timestamp with time zone | sim |  |  |
| `retomado_em` | timestamp with time zone | sim |  |  |
| `session_data` | jsonb | sim | '{}'::jsonb |  |
| `ultima_mensagem_em` | timestamp with time zone | sim |  |  |
| `total_mensagens` | integer | sim | 0 |  |
| `status` | text | sim | 'active'::text |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `transferido_em` | timestamp with time zone | sim |  |  |

**Únicos:**
- `agente_conversas_pkey`

**Triggers:**
- `set_updated_at_agente_conversas → set_updated_at()`

## agente_fila_mensagens

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `agente_id` | uuid | sim |  | agentes.id |
| `unidade_id` | uuid | sim |  | unidades.id |
| `telefone` | text | não |  |  |
| `mensagens_acumuladas` | jsonb | sim | '[]'::jsonb |  |
| `processar_apos` | timestamp with time zone | sim |  |  |
| `processando` | boolean | sim | false |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `agente_fila_mensagens_agente_id_telefone_key`
- `agente_fila_mensagens_pkey`

## agente_mensagens_externas

> Onde TOM/Fabio/Mila registram o que mandaram, para o orcamento de atencao contar todos. Vazia enquanto eles nao adotarem — e o numero diz isso, em vez de fingir cobertura.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não | nextval('agente_mensagens_externas_id_seq'::regclass) |  |
| `agente` | text | não |  |  |
| `destino` | text | não |  |  |
| `tipo` | text | sim |  |  |
| `peso` | text | não | 'essencial'::text |  |
| `enviada_em` | timestamp with time zone | não | now() |  |
| `criado_por` | text | sim | CURRENT_USER |  |

**Únicos:**
- `agente_mensagens_externas_pkey`

## agente_orcamento_config

> Quantas mensagens por dia um destino aguenta antes de a Sol calar os nudges. Fato operacional (essencial) nunca e cortado — so contado.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `destino_tipo` | text | não |  |  |
| `teto_dia` | integer | não |  |  |
| `atualizado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `agente_orcamento_config_pkey`

## agentes

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `nome` | text | não |  |  |
| `descricao` | text | sim |  |  |
| `system_prompt` | text | não | ''::text |  |
| `modelo` | text | sim | 'gpt-4o-mini'::text |  |
| `provider` | text | sim | 'openai'::text |  |
| `temperature` | numeric | sim | 0.7 |  |
| `max_tokens` | integer | sim | 1024 |  |
| `tools` | jsonb | sim | '[]'::jsonb |  |
| `mensagem_boas_vindas` | text | sim |  |  |
| `mensagem_fallback` | text | sim |  |  |
| `horario_funcionamento` | jsonb | sim | '{}'::jsonb |  |
| `is_active` | boolean | sim | true |  |
| `status` | text | sim | 'active'::text |  |
| `numero_meta_id` | uuid | sim |  | numeros_meta.id |
| `anti_spam` | jsonb | sim | '{"min_interval_ms": 3000, "max_messages_per_minute": 20}'::jsonb |  |
| `modo_teste` | boolean | sim | false |  |
| `telefone_teste` | text | sim |  |  |
| `auto_reply_message` | text | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `agentes_pkey`

**Triggers:**
- `set_updated_at_agentes → set_updated_at()`

## atendimento_consultor_diario

> Instantâneo diário (19:10 BRT) de atendimento_conversa_estado por pessoa. ESTOQUE do que ficou pendurado, não velocidade de resposta — velocidade é do chatwoot-atendimento-insights, ao vivo.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `dia` | date | não |  |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `unidade_nome` | text | sim |  |  |
| `assignee_nome` | text | não |  |  |
| `e_bot` | boolean | não | false |  |
| `conversas` | integer | não | 0 |  |
| `abertas` | integer | não | 0 |  |
| `esperando_cliente` | integer | não | 0 |  |
| `esperando_4h` | integer | não | 0 |  |
| `esperando_24h` | integer | não | 0 |  |
| `horas_max_espera` | numeric | sim |  |  |
| `so_falou_com_bot` | integer | não | 0 |  |
| `novas_no_dia` | integer | não | 0 |  |
| `min_ate_humano_p50` | numeric | sim |  |  |
| `capturado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `atendimento_consultor_diario_pkey`

## atendimento_conversa_estado

> T2/1o andar/operacional. Espelho dos FATOS da conversa do Chatwoot (projeto SOL), ingerido pela edge `ingerir-calor-atendimento`. ⚠️ "humano" = agente que nao e Mila. ⚠️ minutos_ate_humano NEGATIVO = nos iniciamos a conversa. ⚠️ departamento comercial so existe desde 03/09/2026.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `conversa_id` | bigint | não |  |  |
| `inbox_id` | bigint | sim |  |  |
| `inbox_nome` | text | sim |  |  |
| `unidade_texto` | text | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `departamento` | text | sim |  |  |
| `telefone` | text | sim |  |  |
| `telefone_key` | text | sim |  |  |
| `contato_nome` | text | sim |  |  |
| `assignee_nome` | text | sim |  |  |
| `conversa_status` | text | sim |  |  |
| `ultima_msg_em` | timestamp with time zone | sim |  |  |
| `ultimo_autor` | text | sim |  |  |
| `horas_desde_ultima` | integer | sim |  |  |
| `primeiro_contato_em` | timestamp with time zone | sim |  |  |
| `primeiro_humano_em` | timestamp with time zone | sim |  |  |
| `houve_humano` | boolean | não | false |  |
| `so_falou_com_bot` | boolean | não | false |  |
| `minutos_ate_humano` | integer | sim |  |  |
| `msgs_do_contato` | integer | não | 0 |  |
| `msgs_do_bot` | integer | não | 0 |  |
| `atualizado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `atendimento_conversa_estado_pkey`

## campanha_contatos

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `campanha_id` | uuid | sim |  | campanhas.id |
| `telefone` | text | não |  |  |
| `status` | text | sim | 'pendente'::text |  |
| `variaveis` | jsonb | sim | '{}'::jsonb |  |
| `erro` | text | sim |  |  |
| `meta_message_id` | text | sim |  |  |
| `enviado_em` | timestamp with time zone | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `respondeu` | boolean | não | false |  |

**Únicos:**
- `campanha_contatos_pkey`

## campanhas

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `criado_por` | uuid | sim |  | users.id |
| `nome` | text | não |  |  |
| `template_id` | uuid | sim |  | templates_meta.id |
| `numero_meta_id` | uuid | sim |  | numeros_meta.id |
| `status` | text | sim | 'rascunho'::text |  |
| `total_contatos` | integer | sim | 0 |  |
| `enviados` | integer | sim | 0 |  |
| `entregues` | integer | sim | 0 |  |
| `lidos` | integer | sim | 0 |  |
| `respondidos` | integer | sim | 0 |  |
| `falhas` | integer | sim | 0 |  |
| `custo_estimado` | numeric(10,2) | sim | 0 |  |
| `custo_real` | numeric(10,2) | sim | 0 |  |
| `mapeamento_variaveis` | jsonb | sim | '{}'::jsonb |  |
| `media_url_custom` | text | sim |  |  |
| `iniciada_em` | timestamp with time zone | sim |  |  |
| `concluida_em` | timestamp with time zone | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `limite_disparo` | integer | sim |  |  |
| `meta_disparo` | integer | sim |  |  |
| `custo_moeda` | text | não | 'BRL'::text |  |

**Únicos:**
- `campanhas_pkey`

**Triggers:**
- `set_updated_at_campanhas → set_updated_at()`

## campanhas_config

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `notificacoes_ativas` | boolean | não | true |  |
| `visibilidade_global` | boolean | não | false |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `updated_by` | uuid | sim |  | users.id |

**Únicos:**
- `campanhas_config_pkey`

## canais_origem

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('canais_origem_id_seq'::regclass) |  |
| `nome` | character varying(50) | não |  |  |
| `nome_normalizado` | character varying(50) | sim | upper(TRIM(BOTH FROM nome)) |  |
| `ativo` | boolean | sim | true |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `canais_origem_pkey`
- `uk_canais_nome_normalizado`

## contatos_bloqueados_campanha

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `telefone` | text | não |  |  |
| `motivo` | text | sim |  |  |
| `bloqueado_em` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `contatos_bloqueados_campanha_pkey`
- `contatos_bloqueados_campanha_unidade_id_telefone_key`

## conversas_campanha

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `numero_meta_id` | uuid | sim |  | numeros_meta.id |
| `telefone` | text | não |  |  |
| `nome_contato` | text | sim |  |  |
| `ultima_mensagem_em` | timestamp with time zone | sim |  |  |
| `nao_lidas` | integer | sim | 0 |  |
| `status` | text | sim | 'open'::text |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `conversas_campanha_numero_meta_id_telefone_key`
- `conversas_campanha_pkey`

**Triggers:**
- `set_updated_at_conversas_campanha → set_updated_at()`

## crm_conversas

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `lead_id` | integer | não |  | leads.id |
| `unidade_id` | uuid | sim |  | unidades.id |
| `status` | character varying | não | 'aberta'::character varying |  |
| `atribuido_a` | character varying | não | 'mila'::character varying |  |
| `whatsapp_jid` | character varying | sim |  |  |
| `foto_perfil_url` | text | sim |  |  |
| `nao_lidas` | integer | sim | 0 |  |
| `ultima_mensagem_at` | timestamp with time zone | sim |  |  |
| `ultima_mensagem_preview` | text | sim |  |  |
| `mila_pausada` | boolean | sim | false |  |
| `mila_pausada_em` | timestamp with time zone | sim |  |  |
| `mila_pausada_por` | character varying | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `caixa_id` | integer | sim |  | whatsapp_caixas.id |

**Únicos:**
- `crm_conversas_lead_id_key`
- `crm_conversas_pkey`

**Triggers:**
- `tr_preencher_unidade_conversa → preencher_unidade_conversa()`
- `tr_updated_at_conversas → atualizar_updated_at_conversas()`

## crm_etiquetas

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('crm_etiquetas_id_seq'::regclass) |  |
| `nome` | character varying(50) | não |  |  |
| `cor` | character varying(7) | não | '#8b5cf6'::character varying |  |
| `icone` | character varying(10) | sim |  |  |
| `descricao` | text | sim |  |  |
| `ordem` | integer | não | 0 |  |
| `ativo` | boolean | não | true |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `crm_etiquetas_nome_key`
- `crm_etiquetas_pkey`

## crm_followups

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('crm_followups_id_seq'::regclass) |  |
| `lead_id` | integer | não |  | leads.id |
| `tipo` | character varying(50) | não |  |  |
| `descricao` | text | sim |  |  |
| `data_agendada` | date | não |  |  |
| `hora_agendada` | time without time zone | sim |  |  |
| `prioridade` | character varying(10) | sim | 'normal'::character varying |  |
| `concluido` | boolean | sim | false |  |
| `data_conclusao` | timestamp with time zone | sim |  |  |
| `resultado` | text | sim |  |  |
| `criado_por` | character varying(20) | sim | 'manual'::character varying |  |
| `created_by` | integer | sim |  | colaboradores.id |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `crm_followups_pkey`

## crm_lead_etiquetas

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('crm_lead_etiquetas_id_seq'::regclass) |  |
| `lead_id` | integer | não |  | leads.id |
| `etiqueta_id` | integer | não |  | crm_etiquetas.id |
| `adicionada_por` | character varying(100) | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `crm_lead_etiquetas_lead_id_etiqueta_id_key`
- `crm_lead_etiquetas_pkey`

## crm_lead_historico

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('crm_lead_historico_id_seq'::regclass) |  |
| `lead_id` | integer | não |  | leads.id |
| `tipo` | character varying(50) | não |  |  |
| `descricao` | text | sim |  |  |
| `dados` | jsonb | sim | '{}'::jsonb |  |
| `created_by` | integer | sim |  | colaboradores.id |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `crm_lead_historico_pkey`

## crm_mensagens

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `conversa_id` | uuid | não |  | crm_conversas.id |
| `lead_id` | integer | não |  | leads.id |
| `direcao` | character varying | não |  |  |
| `tipo` | character varying | não | 'texto'::character varying |  |
| `conteudo` | text | sim |  |  |
| `midia_url` | text | sim |  |  |
| `midia_mimetype` | character varying | sim |  |  |
| `midia_nome` | character varying | sim |  |  |
| `remetente` | character varying | não |  |  |
| `remetente_nome` | character varying | sim |  |  |
| `status_entrega` | character varying | sim | 'enviando'::character varying |  |
| `is_sistema` | boolean | sim | false |  |
| `whatsapp_message_id` | character varying | sim |  |  |
| `template_id` | integer | sim |  | crm_templates_whatsapp.id |
| `reply_to_id` | uuid | sim |  | crm_mensagens.id |
| `created_at` | timestamp with time zone | sim | now() |  |
| `editada` | boolean | sim | false |  |
| `deletada` | boolean | sim | false |  |
| `transcricao` | text | sim |  |  |
| `reacoes` | jsonb | sim | '[]'::jsonb |  |

**Únicos:**
- `crm_mensagens_pkey`
- `crm_mensagens_whatsapp_message_id_key`

**Triggers:**
- `tr_atualizar_conversa_on_mensagem → atualizar_conversa_on_mensagem()`
- `trg_normalizar_wa_msg_id → normalizar_whatsapp_message_id()`

## crm_mensagens_agendadas

> Mensagens agendadas para envio futuro via WhatsApp

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('crm_mensagens_agendadas_id_seq'::regclass) |  |
| `conversa_id` | uuid | não |  | crm_conversas.id |
| `lead_id` | integer | não |  | leads.id |
| `conteudo` | text | não |  |  |
| `tipo` | character varying(20) | não | 'texto'::character varying |  |
| `agendada_para` | timestamp with time zone | não |  |  |
| `status` | character varying(20) | não | 'pendente'::character varying |  |
| `enviada_em` | timestamp with time zone | sim |  |  |
| `erro` | text | sim |  |  |
| `criado_por` | character varying(100) | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `crm_mensagens_agendadas_pkey`

## crm_metas_andreza

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('crm_metas_andreza_id_seq'::regclass) |  |
| `ano` | integer | não |  |  |
| `mes` | integer | não |  |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `meta_show_up_rate` | numeric | sim | 30.0 |  |
| `taxa_compromisso_valor` | numeric | sim |  |  |
| `bonus_valor` | numeric | sim | 150.0 |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `crm_metas_andreza_ano_mes_unidade_id_key`
- `crm_metas_andreza_pkey`

## crm_motivos_nao_comparecimento

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('crm_motivos_nao_comparecimento_id_seq'::regclass) |  |
| `nome` | character varying(100) | não |  |  |
| `descricao` | text | sim |  |  |
| `ativo` | boolean | sim | true |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `crm_motivos_nao_comparecimento_pkey`

## crm_pipeline_etapas

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('crm_pipeline_etapas_id_seq'::regclass) |  |
| `nome` | character varying(100) | não |  |  |
| `slug` | character varying(50) | não |  |  |
| `cor` | character varying(20) | sim | '#6B7280'::character varying |  |
| `icone` | character varying(10) | sim |  |  |
| `ordem` | integer | não |  |  |
| `ativo` | boolean | sim | true |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `crm_pipeline_etapas_pkey`
- `crm_pipeline_etapas_slug_key`

**Triggers:**
- `trg_audit → fn_audit_log()`

## crm_templates_whatsapp

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('crm_templates_whatsapp_id_seq'::regclass) |  |
| `nome` | character varying(100) | não |  |  |
| `slug` | character varying(50) | não |  |  |
| `conteudo` | text | não |  |  |
| `tipo` | character varying(50) | não |  |  |
| `ativo` | boolean | sim | true |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `contexto` | text | não | 'pre_atendimento'::text |  |

**Únicos:**
- `crm_templates_whatsapp_contexto_slug_key`
- `crm_templates_whatsapp_pkey`

## experimentais_mensal_unidade

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('experimentais_mensal_unidade_id_seq'::regclass) |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `ano` | integer | não |  |  |
| `mes` | integer | não |  |  |
| `total_experimentais` | integer | sim | 0 |  |
| `total_matriculas` | integer | sim | 0 |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `experimentais_mensal_unidade_pkey`
- `experimentais_mensal_unidade_unidade_id_ano_mes_key`

## experimentais_professor_mensal

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('experimentais_professor_mensal_id_seq'::regclass) |  |
| `professor_id` | integer | sim |  | professores.id |
| `unidade_id` | uuid | sim |  | unidades.id |
| `ano` | integer | não |  |  |
| `mes` | integer | não |  |  |
| `experimentais` | integer | sim | 0 |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `experimentais_professor_mensa_professor_id_unidade_id_ano_m_key`
- `experimentais_professor_mensal_pkey`

## instagram_sessoes

> Espelho das sessões da bridge de Instagram (la-hq, instagram-comments-bridge.js). Uma linha por (conta, pessoa). Alimentado pela edge ingerir-instagram-sessoes; a bridge segue sendo a fonte de verdade viva — isto é foto para leitura, relatório e Mapa de Sinais.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `ig_user_id` | text | não |  |  |
| `sender_id` | text | não |  |  |
| `conta` | text | não |  |  |
| `sender_name` | text | sim |  |  |
| `interesse` | text | sim |  |  |
| `estagio` | text | não |  |  |
| `unidade_nome` | text | sim |  |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `telefone` | text | sim |  |  |
| `telefone_chave` | text | sim | fn_normalizar_telefone_br_key(telefone) |  |
| `transferido` | boolean | não | false |  |
| `iniciada_em` | timestamp with time zone | não |  |  |
| `ultima_atividade_em` | timestamp with time zone | não |  |  |
| `historico` | jsonb | não | '[]'::jsonb |  |
| `capturado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `instagram_sessoes_pkey`

## lead_conciliacao_decisoes

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não | nextval('lead_conciliacao_decisoes_id_seq'::regclass) |  |
| `lead_id` | integer | não |  | leads.id |
| `campo` | text | não |  |  |
| `decisao` | text | não | 'definir_manual'::text |  |
| `valor_anterior` | jsonb | não | '{}'::jsonb |  |
| `valor_aplicado` | jsonb | não | '{}'::jsonb |  |
| `motivo` | text | sim |  |  |
| `decidido_por` | text | não | 'usuario_app'::text |  |
| `metadata` | jsonb | não | '{}'::jsonb |  |
| `created_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `lead_conciliacao_decisoes_pkey`

## lead_experimentais

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('lead_experimentais_id_seq'::regclass) |  |
| `lead_id` | integer | sim |  | leads.id |
| `nome_aluno` | text | não |  |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `data_experimental` | date | sim |  |  |
| `horario_experimental` | time without time zone | sim |  |  |
| `professor_experimental_id` | integer | sim |  | professores.id |
| `curso_interesse_id` | integer | sim |  | cursos.id |
| `status` | character varying | sim | 'experimental_agendada'::character varying |  |
| `etapa_pipeline_id` | integer | sim |  | crm_pipeline_etapas.id |
| `aluno_id` | integer | sim |  | alunos.id |
| `emusys_lead_id` | integer | sim |  |  |
| `observacoes` | text | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `emusys_aula_id` | integer | sim |  |  |
| `contexto_ia` | jsonb | sim |  |  |
| `contexto_ia_em` | timestamp with time zone | sim |  |  |
| `emusys_agendamento_id` | bigint | sim |  |  |

**Únicos:**
- `lead_experimentais_pkey`
- `uq_lead_exp_aula`
- `uq_lead_exp_legado`
- `uq_lead_exp_negocio_novo`

**Triggers:**
- `trg_audit → fn_audit_log()`
- `trg_experimental_preenche_curso → trg_experimental_preenche_curso_do_lead()`
- `trg_propagar_professor_experimental → fn_propagar_professor_experimental()`

## lead_experimentais_arquivadas

> Lixeira de lead_experimentais, no padrao de alunos_arquivados. Guarda a linha inteira + quem absorveu (consolidado_no_id). A duplicata nasceu porque a API do Emusys so passou a devolver id_lead em 21/06/2026.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('lead_experimentais_id_seq'::regclass) |  |
| `lead_id` | integer | sim |  |  |
| `nome_aluno` | text | não |  |  |
| `unidade_id` | uuid | não |  |  |
| `data_experimental` | date | sim |  |  |
| `horario_experimental` | time without time zone | sim |  |  |
| `professor_experimental_id` | integer | sim |  |  |
| `curso_interesse_id` | integer | sim |  |  |
| `status` | character varying | sim | 'experimental_agendada'::character varying |  |
| `etapa_pipeline_id` | integer | sim |  |  |
| `aluno_id` | integer | sim |  |  |
| `emusys_lead_id` | integer | sim |  |  |
| `observacoes` | text | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `emusys_aula_id` | integer | sim |  |  |
| `contexto_ia` | jsonb | sim |  |  |
| `contexto_ia_em` | timestamp with time zone | sim |  |  |
| `arquivado_em` | timestamp with time zone | não | now() |  |
| `arquivado_por` | text | não |  |  |
| `motivo` | text | não |  |  |
| `consolidado_no_id` | bigint | não |  |  |
| `emusys_agendamento_id` | bigint | sim |  |  |

## lead_experimentais_decisoes_humanas

> P02Q: decisões humanas de auditoria para reconciliar experimentais sem alterar histórico operacional original.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não | nextval('lead_experimentais_decisoes_humanas_id_seq'::regclass) |  |
| `lead_experimental_id` | integer | não |  | lead_experimentais.id |
| `decisao` | text | não |  |  |
| `incluir_denominador_exp_mat` | boolean | não | true |  |
| `contar_conversao_exp_mat` | boolean | não | false |  |
| `aluno_id_decidido` | integer | sim |  | alunos.id |
| `motivo` | text | não |  |  |
| `decidido_por` | text | não | 'Alf'::text |  |
| `decidido_em` | timestamp with time zone | não | now() |  |
| `metadata` | jsonb | não | '{}'::jsonb |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `lead_experimentais_decisoes_humanas_pkey`
- `lead_experimentais_decisoes_humanas_unique`

## lead_experimental_aulas

> Vinculo lead<->aula da experimental. RLS ligada e SEM policy: so security definer (dono postgres) e service_role entram. O cliente fala com app_experimental_do_professor / app_minha_agenda_sessao.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não | nextval('lead_experimental_aulas_id_seq'::regclass) |  |
| `lead_experimental_id` | integer | não |  | lead_experimentais.id |
| `aula_local_id` | integer | sim |  | aulas_emusys.id |
| `estado` | text | não | 'pendente'::text |  |
| `motivo_pendencia` | text | sim |  |  |
| `casado_por` | text | sim |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |
| `vinculado_em` | timestamp with time zone | sim |  |  |
| `vinculado_por` | text | sim |  |  |
| `substituido_em` | timestamp with time zone | sim |  |  |
| `cancelado_em` | timestamp with time zone | sim |  |  |
| `aluno_id` | integer | sim |  | alunos.id |
| `aluno_vinculado_em` | timestamp with time zone | sim |  |  |
| `aluno_vinculado_por` | text | sim |  |  |
| `aluno_origem` | text | sim |  |  |
| `presenca_status` | text | sim |  |  |
| `presenca_respondido_por` | text | sim |  |  |
| `presenca_respondido_em` | timestamp with time zone | sim |  |  |
| `presenca_bruta_emusys` | text | sim |  |  |

**Únicos:**
- `lead_experimental_aulas_pkey`
- `uq_lead_exp_aula_ocupada`
- `uq_lead_exp_aula_vigente`

## lead_experimental_aulas_arquivadas

> Filhas descartadas na consolidacao, quando o sobrevivente ja tinha a sua. So entra aqui filha SEM aula_local_id — vinculo real nunca e descartado.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não | nextval('lead_experimental_aulas_id_seq'::regclass) |  |
| `lead_experimental_id` | integer | não |  |  |
| `aula_local_id` | integer | sim |  |  |
| `estado` | text | não | 'pendente'::text |  |
| `motivo_pendencia` | text | sim |  |  |
| `casado_por` | text | sim |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |
| `vinculado_em` | timestamp with time zone | sim |  |  |
| `vinculado_por` | text | sim |  |  |
| `substituido_em` | timestamp with time zone | sim |  |  |
| `cancelado_em` | timestamp with time zone | sim |  |  |
| `aluno_id` | integer | sim |  |  |
| `aluno_vinculado_em` | timestamp with time zone | sim |  |  |
| `aluno_vinculado_por` | text | sim |  |  |
| `aluno_origem` | text | sim |  |  |
| `presenca_status` | text | sim |  |  |
| `presenca_respondido_por` | text | sim |  |  |
| `presenca_respondido_em` | timestamp with time zone | sim |  |  |
| `presenca_bruta_emusys` | text | sim |  |  |
| `arquivado_em` | timestamp with time zone | não | now() |  |
| `motivo` | text | não |  |  |
| `consolidado_no_id` | bigint | não |  |  |

## lead_experimental_registros

> Prontuario da experimental ditado pelo professor. RLS ligada e SEM policy — mesma razao da lead_experimental_aulas. A fronteira family-safe mora nas RPCs, nao na tabela.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `vinculo_id` | bigint | não |  | lead_experimental_aulas.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `professor_id` | integer | sim |  | professores.id |
| `anotacao_pedagogica` | text | sim |  |  |
| `devolutiva_familia` | text | sim |  |  |
| `proximos_passos` | text | sim |  |  |
| `leitura_de_conversao` | text | sim |  |  |
| `origem` | text | não | 'app'::text |  |
| `audio_id` | uuid | sim |  | fabio_fila_audios.id |
| `status` | text | não | 'rascunho'::text |  |
| `confirmado_em` | timestamp with time zone | sim |  |  |
| `confirmado_por` | integer | sim |  | usuarios.id |
| `criado_em` | timestamp with time zone | não | now() |  |
| `atualizado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `lead_experimental_registros_pkey`
- `uq_lead_exp_registro_vigente`

## lead_retomada

> Agenda de retomada ("bumerangue"): quando o lead pediu para voltar a falar, POR QUE, e a frase original. Dorme ate o dia. Desfecho fecha o laco 3o->2o andar.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `lead_id` | bigint | não |  | leads.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `prometido_em` | date | não |  |  |
| `prazo_texto` | text | sim |  |  |
| `retomar_em` | date | sim |  |  |
| `frase` | text | não |  |  |
| `motivo` | text | sim |  |  |
| `origem` | text | não | 'consultora'::text |  |
| `conversation_id` | bigint | sim |  |  |
| `status` | text | não | 'aguardando'::text |  |
| `lembrado_em` | timestamp with time zone | sim |  |  |
| `desfecho` | text | sim |  |  |
| `desfecho_em` | timestamp with time zone | sim |  |  |
| `desfecho_nota` | text | sim |  |  |
| `criado_por` | text | sim |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |
| `atualizado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `lead_retomada_pkey`
- `lead_retomada_viva_uidx`

## leads

> Leads comerciais - do primeiro contato até a conversão ou arquivamento

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('leads_id_seq'::regclass) |  |
| `nome` | character varying(255) | sim |  |  |
| `telefone` | character varying(20) | sim |  |  |
| `whatsapp` | character varying(20) | sim |  |  |
| `email` | character varying(255) | sim |  |  |
| `idade` | integer | sim |  |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `curso_interesse_id` | integer | sim |  | cursos.id |
| `canal_origem_id` | integer | sim |  | canais_origem.id |
| `data_contato` | date | não | CURRENT_DATE |  |
| `data_primeiro_contato` | timestamp with time zone | sim | now() |  |
| `data_ultimo_contato` | timestamp with time zone | sim |  |  |
| `status` | character varying(50) | não | 'novo'::character varying |  |
| `motivo_arquivamento` | character varying(255) | sim |  |  |
| `experimental_agendada` | boolean | sim | false |  |
| `data_experimental` | date | sim |  |  |
| `horario_experimental` | time without time zone | sim |  |  |
| `professor_experimental_id` | integer | sim |  | professores.id |
| `experimental_realizada` | boolean | sim | false |  |
| `faltou_experimental` | boolean | sim | false |  |
| `converteu` | boolean | sim | false |  |
| `data_conversao` | date | sim |  |  |
| `aluno_id` | integer | sim |  | alunos.id |
| `motivo_nao_matricula` | text | sim |  |  |
| `agente_comercial` | character varying(100) | sim |  |  |
| `observacoes` | text | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `created_by` | integer | sim |  | usuarios.id |
| `valor_passaporte` | numeric | sim |  |  |
| `valor_parcela` | numeric | sim |  |  |
| `forma_pagamento_id` | integer | sim |  | formas_pagamento.id |
| `forma_pagamento_passaporte_id` | integer | sim |  | formas_pagamento.id |
| `professor_fixo_id` | integer | sim |  | professores.id |
| `tipo_matricula` | character varying | sim |  |  |
| `tipo_aluno` | character varying | sim | 'pagante'::character varying |  |
| `aluno_novo_retorno` | character varying | sim |  |  |
| `dia_vencimento` | integer | sim |  |  |
| `sabia_preco` | boolean | sim |  |  |
| `quantidade` | integer | sim | 1 |  |
| `motivo_arquivamento_id` | integer | sim |  | motivos_arquivamento.id |
| `motivo_nao_matricula_id` | integer | sim |  | motivos_nao_matricula.id |
| `data_arquivamento` | date | sim |  |  |
| `arquivado` | boolean | sim | false |  |
| `chatwoot_conversation_id` | bigint | sim |  |  |
| `etapa_pipeline_id` | integer | sim |  | crm_pipeline_etapas.id |
| `temperatura` | character varying(10) | sim | 'quente'::character varying |  |
| `faixa_etaria` | character varying(10) | sim |  |  |
| `tipo_agendamento` | character varying(20) | sim |  |  |
| `observacoes_professor` | text | sim |  |  |
| `qtd_tentativas_sem_resposta` | integer | sim | 0 |  |
| `qtd_desmarcacoes` | integer | sim | 0 |  |
| `motivo_nao_comparecimento_id` | integer | sim |  | crm_motivos_nao_comparecimento.id |
| `atendido_por_id` | integer | sim |  | colaboradores.id |
| `consultor_id` | integer | sim |  | colaboradores.id |
| `data_passagem_mila` | timestamp with time zone | sim |  |  |
| `motivo_passagem_mila` | character varying(100) | sim |  |  |
| `qtd_mensagens_mila` | integer | sim | 0 |  |
| `taxa_compromisso_cobrada` | boolean | sim | false |  |
| `emusys_lead_id` | integer | sim |  |  |
| `nocodb_lead_id` | integer | sim |  |  |
| `meta_ad_source_id` | text | sim |  |  |
| `meta_ctwa_clid` | text | sim |  |  |
| `data_nascimento` | date | sim |  |  |
| `origem_registro` | text | não | 'funil'::text |  |
| `chatwoot_status` | text | sim |  |  |
| `chatwoot_status_em` | timestamp with time zone | sim |  |  |
| `chatwoot_ultima_msg_em` | timestamp with time zone | sim |  |  |
| `chatwoot_ultima_msg_de` | text | sim |  |  |
| `chatwoot_espelhado_em` | timestamp with time zone | sim |  |  |

**Únicos:**
- `idx_leads_emusys_lead_id`
- `idx_leads_nocodb_lead_id`
- `idx_leads_telefone_unidade_unique`
- `leads_chatwoot_conversation_id_key`
- `leads_pkey`

**Triggers:**
- `tr_normalize_telefone_leads → trigger_normalize_telefone()`
- `tr_sync_etapa_status_on_insert → sync_lead_etapa_status_on_insert()`
- `tr_sync_etapa_to_status → sync_lead_etapa_to_status()`
- `tr_sync_experimentais_professor → sync_experimentais_professor()`
- `tr_sync_experimentais_unidade → sync_experimentais_unidade()`
- `trg_audit → fn_audit_log()`
- `trg_calcular_faixa_etaria_lead → trg_calcular_faixa_etaria_lead()`
- `trg_lead_herda_consultor → trg_lead_herda_consultor_da_unidade()`
- `update_leads_updated_at → update_updated_at_column()`

## leads_automacao_log

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não | nextval('leads_automacao_log_id_seq'::regclass) |  |
| `lead_nome` | text | não |  |  |
| `lead_id` | integer | sim |  |  |
| `unidade_nome` | text | sim |  |  |
| `evento` | text | não |  |  |
| `acao` | text | não |  |  |
| `detalhes` | jsonb | sim |  |  |
| `workflow_id` | text | sim |  |  |
| `execution_id` | text | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `payload_bruto` | jsonb | sim |  |  |

**Únicos:**
- `leads_automacao_log_pkey`

## leads_backup_flags_20260601

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | sim |  |  |
| `nome` | character varying(255) | sim |  |  |
| `experimental_agendada` | boolean | sim |  |  |
| `experimental_realizada` | boolean | sim |  |  |
| `faltou_experimental` | boolean | sim |  |  |
| `data_experimental` | date | sim |  |  |
| `backup_em` | timestamp with time zone | sim |  |  |

## leads_campanhas

> Historico de campanhas que trouxeram cada lead (1 linha por lead+campanha). Gravado pela tool transfer do agente-webhook no momento da transferencia. Snapshot: campanha_nome congela agentes.nome da epoca.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não | nextval('leads_campanhas_id_seq'::regclass) |  |
| `lead_id` | integer | não |  | leads.id |
| `agente_id` | uuid | sim |  | agentes.id |
| `campanha_slug` | text | não |  |  |
| `campanha_nome` | text | não |  |  |
| `created_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `leads_campanhas_lead_id_campanha_slug_key`
- `leads_campanhas_pkey`

## leads_diarios_backup

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `data` | date | sim |  |  |
| `tipo` | character varying(50) | sim |  |  |
| `canal_origem_id` | integer | sim |  |  |
| `curso_id` | integer | sim |  |  |
| `quantidade` | integer | sim |  |  |
| `observacoes` | text | sim |  |  |
| `aluno_nome` | character varying(255) | sim |  |  |
| `aluno_idade` | integer | sim |  |  |
| `professor_experimental_id` | integer | sim |  |  |
| `professor_fixo_id` | integer | sim |  |  |
| `agente_comercial` | character varying(255) | sim |  |  |
| `valor_passaporte` | numeric(10,2) | sim |  |  |
| `valor_parcela` | numeric(10,2) | sim |  |  |
| `forma_pagamento_id` | integer | sim |  |  |
| `tipo_matricula` | character varying(100) | sim |  |  |
| `aluno_novo_retorno` | character varying(100) | sim |  |  |
| `created_at` | timestamp with time zone | sim |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |
| `created_by` | integer | sim |  |  |
| `arquivado` | boolean | sim |  |  |
| `data_arquivamento` | date | sim |  |  |
| `motivo_arquivamento_id` | integer | sim |  |  |
| `motivo_nao_matricula_id` | integer | sim |  |  |
| `forma_pagamento_passaporte_id` | integer | sim |  |  |
| `dia_vencimento` | integer | sim |  |  |
| `tipo_aluno` | character varying(50) | sim |  |  |
| `sabia_preco` | boolean | sim |  |  |

## mensagens_campanha

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `conversa_id` | uuid | sim |  | conversas_campanha.id |
| `campanha_id` | uuid | sim |  | campanhas.id |
| `unidade_id` | uuid | sim |  | unidades.id |
| `telefone` | text | não |  |  |
| `direcao` | text | não |  |  |
| `tipo` | text | sim | 'text'::text |  |
| `texto` | text | sim |  |  |
| `media_url` | text | sim |  |  |
| `media_mime` | text | sim |  |  |
| `media_filename` | text | sim |  |  |
| `sticker_id` | text | sim |  |  |
| `reaction_emoji` | text | sim |  |  |
| `reaction_message_id` | text | sim |  |  |
| `meta_message_id` | text | sim |  |  |
| `wa_id` | text | sim |  |  |
| `status` | text | sim | 'pending'::text |  |
| `status_atualizado_em` | timestamp with time zone | sim |  |  |
| `enviado_por_agente` | uuid | sim |  | agentes.id |
| `custo_billable` | boolean | sim |  |  |
| `custo_categoria` | text | sim |  |  |
| `metadata` | jsonb | sim | '{}'::jsonb |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `privada` | boolean | sim | false |  |

**Únicos:**
- `mensagens_campanha_pkey`

## meta_ads_cache

> Metadados de anuncios Meta (nome, campanha, adset) por source_id, enriquecidos via Graph API pela edge enriquecer-meta-ads. Join: leads.meta_ad_source_id = meta_ads_cache.source_id. Metricas vivas (gasto/CTR) NAO ficam aqui — consultar a Ads API na hora (edge meta-ads-insights).

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `source_id` | text | não |  |  |
| `ad_name` | text | sim |  |  |
| `adset_id` | text | sim |  |  |
| `adset_name` | text | sim |  |  |
| `campaign_id` | text | sim |  |  |
| `campaign_name` | text | sim |  |  |
| `effective_status` | text | sim |  |  |
| `enriquecido_em` | timestamp with time zone | sim |  |  |
| `erro` | text | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `meta_ads_cache_pkey`

## meta_ads_metricas_diarias

> Memoria diaria por anuncio do Meta Ads. Existe porque o Trafego Pago e 100% ao vivo e sem historico o 2o andar nunca sabe qual criativo traz lead que MATRICULA. Nao substitui a leitura ao vivo. `conversas` = onsite_conversion.messaging_conversation_started_7d, a mesma acao da edge meta-ads-insights.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `dia` | date | não |  |  |
| `ad_id` | text | não |  |  |
| `ad_name` | text | sim |  |  |
| `campaign_id` | text | sim |  |  |
| `campaign_name` | text | sim |  |  |
| `adset_id` | text | sim |  |  |
| `adset_name` | text | sim |  |  |
| `gasto` | numeric(12,2) | não | 0 |  |
| `impressoes` | bigint | não | 0 |  |
| `cliques` | bigint | não | 0 |  |
| `ctr` | numeric(8,4) | sim |  |  |
| `cpm` | numeric(12,4) | sim |  |  |
| `alcance` | bigint | sim |  |  |
| `frequencia` | numeric(8,4) | sim |  |  |
| `conversas` | integer | não | 0 |  |
| `custo_por_conversa` | numeric(12,4) | sim | CASE     WHEN (conversas > 0) THEN (gasto / (conversas)::numeric)     ELSE NULL::numeric END |  |
| `moeda` | text | não | 'BRL'::text |  |
| `capturado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `meta_ads_metricas_diarias_pkey`

## mila_config

> Configuração do agente Mila por unidade

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('mila_config_id_seq'::regclass) |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `ativo` | boolean | não | true |  |
| `prompt_sistema` | text | não |  |  |
| `modelo_openai` | character varying(50) | não | 'gpt-4o'::character varying |  |
| `temperatura_modelo` | numeric(3,2) | não | 0.7 |  |
| `max_tokens` | integer | não | 500 |  |
| `base_conhecimento` | text | sim |  |  |
| `horarios_disponiveis` | jsonb | sim | '{}'::jsonb |  |
| `emusys_token` | character varying(255) | sim |  |  |
| `emusys_url` | character varying(500) | sim | 'https://sys.emusys.com.br/w2bh99k_/api/criar_lead.php'::character varying |  |
| `nome_atendente` | character varying(100) | sim |  |  |
| `endereco_unidade` | text | sim |  |  |
| `horario_funcionamento` | text | sim |  |  |
| `cursos_disponiveis` | jsonb | sim | '[]'::jsonb |  |
| `debounce_segundos` | integer | não | 8 |  |
| `max_mensagens_contexto` | integer | não | 20 |  |
| `whatsapp_consultor` | character varying(50) | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `token_quepasa` | character varying | sim |  |  |

**Únicos:**
- `mila_config_pkey`
- `mila_config_unidade_unique`

**Triggers:**
- `trigger_mila_config_updated_at → update_mila_config_updated_at()`

## mila_message_buffer

> Buffer de mensagens para debounce do agente Mila

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `conversa_id` | uuid | não |  |  |
| `lead_id` | integer | não |  |  |
| `conteudo` | text | não |  |  |
| `tipo` | character varying(50) | não | 'texto'::character varying |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `processado` | boolean | não | false |  |
| `processado_at` | timestamp with time zone | sim |  |  |

**Únicos:**
- `mila_message_buffer_pkey`

## mila_recados

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `solicitante_telefone` | text | não |  |  |
| `solicitante_nome` | text | não |  |  |
| `destino_tipo` | text | não |  |  |
| `destino_ref` | text | sim |  |  |
| `destino_nome` | text | não |  |  |
| `destino_telefone` | text | não |  |  |
| `assunto` | text | sim |  |  |
| `texto` | text | não |  |  |
| `status` | text | não | 'proposto'::text |  |
| `criado_em` | timestamp with time zone | não | now() |  |
| `expira_em` | timestamp with time zone | não | (now() + '00:30:00'::interval) |  |
| `aprovado_em` | timestamp with time zone | sim |  |  |
| `enviado_em` | timestamp with time zone | sim |  |  |
| `conversation_id` | bigint | sim |  |  |
| `message_id` | bigint | sim |  |  |
| `erro` | text | sim |  |  |
| `versoes` | jsonb | não | '[]'::jsonb |  |
| `aguarda_resposta` | boolean | não | false |  |
| `resposta` | text | sim |  |  |
| `respondido_em` | timestamp with time zone | sim |  |  |
| `retorno_entregue_em` | timestamp with time zone | sim |  |  |
| `retorno_conversation_id` | bigint | sim |  |  |

**Únicos:**
- `mila_recados_pkey`

## motivos_nao_matricula

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('motivos_nao_matricula_id_seq'::regclass) |  |
| `nome` | character varying(100) | não |  |  |
| `ativo` | boolean | sim | true |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `motivos_nao_matricula_pkey`

## numeros_meta

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `nome` | text | não |  |  |
| `phone_number_id` | text | não |  |  |
| `waba_id` | text | não |  |  |
| `access_token` | text | não |  |  |
| `app_secret` | text | sim |  |  |
| `verify_token` | text | sim |  |  |
| `limite_diario` | integer | sim | 1000 |  |
| `limite_por_segundo` | integer | sim | 80 |  |
| `custo_por_categoria` | jsonb | sim | '{"utility": 0.15, "marketing": 0.50, "authentication": 0.25}'::jsonb |  |
| `orcamento_mensal` | numeric(10,2) | sim |  |  |
| `is_default` | boolean | sim | false |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `auto_reply_ativo` | boolean | não | false |  |
| `auto_reply_message` | text | sim |  |  |
| `numero_telefone` | text | sim |  |  |

**Únicos:**
- `numeros_meta_pkey`

**Triggers:**
- `set_updated_at_numeros_meta → set_updated_at()`

## origem_leads_legado

> LEGADO (aposentada 2026-07-05). Agregacao por canal inflada pelo mesmo trigger bugado. Nunca teve leitor no frontend. Nao usar.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('origem_leads_id_seq'::regclass) |  |
| `competencia` | date | não |  |  |
| `unidade` | character varying(50) | não |  |  |
| `canal` | character varying(50) | não |  |  |
| `tipo` | character varying(50) | não |  |  |
| `quantidade` | integer | sim | 0 |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `origem_leads_competencia_unidade_canal_tipo_key`
- `origem_leads_pkey`

## professores_experimentais

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('professores_experimentais_id_seq'::regclass) |  |
| `competencia` | date | não |  |  |
| `unidade` | character varying(50) | não |  |  |
| `professor` | character varying(100) | não |  |  |
| `quantidade` | integer | sim | 0 |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `professores_experimentais_competencia_unidade_professor_key`
- `professores_experimentais_pkey`

## respostas_rapidas_campanha

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `titulo` | text | não |  |  |
| `conteudo` | text | não |  |  |
| `categoria` | text | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `respostas_rapidas_campanha_pkey`

## templates_meta

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `numero_meta_id` | uuid | sim |  | numeros_meta.id |
| `nome` | text | não |  |  |
| `idioma` | text | sim | 'pt_BR'::text |  |
| `categoria` | text | sim |  |  |
| `status` | text | sim |  |  |
| `componentes` | jsonb | sim | '[]'::jsonb |  |
| `meta_template_id` | text | sim |  |  |
| `body_text` | text | sim |  |  |
| `header_type` | text | sim |  |  |
| `has_buttons` | boolean | sim | false |  |
| `media_url` | text | sim |  |  |
| `media_type` | text | sim |  |  |
| `variaveis` | jsonb | sim | '[]'::jsonb |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `templates_meta_meta_template_id_numero_meta_id_key`
- `templates_meta_pkey`

**Triggers:**
- `set_updated_at_templates_meta → set_updated_at()`

## transferencias_mila

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `lead_id` | integer | sim |  | leads.id |
| `conversa_id` | uuid | sim |  | crm_conversas.id |
| `phone` | text | não |  |  |
| `situacao` | text | não |  |  |
| `consultor_phone` | text | não |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `transferencias_mila_pkey`

## unidade_contato_comercial

> Quem recebe o aviso comercial de cada unidade. Em tabela, nao no fluxo: a pessoa muda (Recreio trocou em um mes) e o no do n8n continua com o nome antigo.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade_id` | uuid | não |  | unidades.id |
| `nome` | text | não |  |  |
| `whatsapp` | text | não |  |  |
| `ativo` | boolean | não | true |  |
| `atualizado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `unidade_contato_comercial_pkey`

## vw_experimental_faltou_sem_afirmacao

> Regua UNICA do 'faltou' de procedencia comercial que ninguem afirmou. Lida por fn_desfaz_faltou_sem_afirmacao (conserta) e por fn_diag_saude_experimental (conta). Nunca duplicar o predicado: dois leitores, uma regua.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | sim |  |  |
| `lead_experimental_id` | integer | sim |  |  |
| `nome_aluno` | text | sim |  |  |
| `data_experimental` | date | sim |  |  |
| `presenca_respondido_por` | text | sim |  |  |

## vw_experimental_pendencia

> Experimentais realizadas sem devolutiva. `data_hora_fim` sustenta o atraso; `data_hora_inicio` (07/09/2026) e a hora que o PROFESSOR reconhece -- antes disso as duas mensagens mandavam a hora do FIM como se fosse a da aula.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `vinculo_id` | bigint | sim |  |  |
| `lead_id` | integer | sim |  |  |
| `nome_aluno` | text | sim |  |  |
| `aula_id` | integer | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `professor_nome` | character varying(255) | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `unidade_nome` | character varying(100) | sim |  |  |
| `curso_nome` | character varying(100) | sim |  |  |
| `data_hora_fim` | timestamp with time zone | sim |  |  |
| `horas_em_atraso` | integer | sim |  |  |
| `dias_em_atraso` | integer | sim |  |  |
| `tipo_alvo` | text | sim |  |  |
| `data_hora_inicio` | timestamp with time zone | sim |  |  |

## vw_experimental_realizada_sem_ficha

> Experimentais que aconteceram e seguem sem ficha confirmada, nos ultimos 30 dias. O prazo em dias NAO mora aqui: quem filtra por data e fn_diag_saude_experimental, para o prazo ser parametro e nao dogma.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | sim |  |  |
| `lead_experimental_id` | integer | sim |  |  |
| `nome_aluno` | text | sim |  |  |
| `data_experimental` | date | sim |  |  |

## vw_experimental_registro_comercial

> Registro da experimental para o circulo interno: inclui leitura_de_conversao. So service_role.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `registro_id` | uuid | sim |  |  |
| `vinculo_id` | bigint | sim |  |  |
| `lead_experimental_id` | integer | sim |  |  |
| `nome_aluno` | text | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `data_hora_inicio` | timestamp with time zone | sim |  |  |
| `estado_vinculo` | text | sim |  |  |
| `presenca_status` | text | sim |  |  |
| `presenca_respondido_por` | text | sim |  |  |
| `presenca_e_forte` | boolean | sim |  |  |
| `anotacao_pedagogica` | text | sim |  |  |
| `devolutiva_familia` | text | sim |  |  |
| `proximos_passos` | text | sim |  |  |
| `leitura_de_conversao` | text | sim |  |  |
| `status` | text | sim |  |  |
| `criado_em` | timestamp with time zone | sim |  |  |

## vw_experimental_registro_family_safe

> Registro da experimental sem NENHUMA coluna de conversao — a garantia e estrutural, nao um flag. So service_role: o nome descreve o conteudo, nao a autorizacao.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `registro_id` | uuid | sim |  |  |
| `vinculo_id` | bigint | sim |  |  |
| `nome_aluno` | text | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `data_hora_inicio` | timestamp with time zone | sim |  |  |
| `anotacao_pedagogica` | text | sim |  |  |
| `devolutiva_familia` | text | sim |  |  |
| `proximos_passos` | text | sim |  |  |
| `status` | text | sim |  |  |
| `criado_em` | timestamp with time zone | sim |  |  |

## vw_experimental_situacao_v1

> Situacao REAL da experimental resolvida pela aula (aulas_emusys), nao pelo status gravado: pega reagendamento (linha fica com a data velha) e aula que ainda nao ocorreu (o sync marca realizada as 00:43). Use para dizer "o que tem hoje". Criada em 04/09/2026 a partir do relato da Daiana.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | sim |  |  |
| `lead_id` | integer | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `nome_aluno` | text | sim |  |  |
| `curso_interesse_id` | integer | sim |  |  |
| `professor_experimental_id` | integer | sim |  |  |
| `aluno_id` | integer | sim |  |  |
| `emusys_aula_id` | integer | sim |  |  |
| `data_experimental` | date | sim |  |  |
| `horario_experimental` | time without time zone | sim |  |  |
| `status_gravado` | character varying | sim |  |  |
| `aula_em` | timestamp with time zone | sim |  |  |
| `aula_data` | date | sim |  |  |
| `aula_cancelada` | boolean | sim |  |  |
| `data_efetiva` | date | sim |  |  |
| `situacao` | character varying | sim |  |  |
| `reagendada_para` | date | sim |  |  |
| `aula_ja_ocorreu` | boolean | sim |  |  |

## vw_funil_conversao_mensal

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade` | character varying(100) | sim |  |  |
| `ano` | integer | sim |  |  |
| `mes` | integer | sim |  |  |
| `ano_mes` | text | sim |  |  |
| `total_leads` | bigint | sim |  |  |
| `leads_arquivados` | bigint | sim |  |  |
| `experimentais_agendadas` | bigint | sim |  |  |
| `experimentais_realizadas` | bigint | sim |  |  |
| `faltaram` | bigint | sim |  |  |
| `matriculas` | bigint | sim |  |  |
| `taxa_lead_experimental` | numeric | sim |  |  |
| `taxa_experimental_matricula` | numeric | sim |  |  |
| `taxa_lead_matricula` | numeric | sim |  |  |

## vw_instagram_sessoes_resolvidas

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `ig_user_id` | text | sim |  |  |
| `sender_id` | text | sim |  |  |
| `conta` | text | sim |  |  |
| `sender_name` | text | sim |  |  |
| `interesse` | text | sim |  |  |
| `estagio` | text | sim |  |  |
| `unidade_nome` | text | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `telefone` | text | sim |  |  |
| `telefone_chave` | text | sim |  |  |
| `transferido` | boolean | sim |  |  |
| `iniciada_em` | timestamp with time zone | sim |  |  |
| `ultima_atividade_em` | timestamp with time zone | sim |  |  |
| `historico` | jsonb | sim |  |  |
| `capturado_em` | timestamp with time zone | sim |  |  |
| `entidade` | jsonb | sim |  |  |
| `dias_parada` | integer | sim |  |  |

## vw_leads_comercial

> View de compatibilidade que emula a estrutura de leads_diarios. Inclui campos resolvidos (nomes) para evitar JOINs via PostgREST.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `data` | date | sim |  |  |
| `tipo` | text | sim |  |  |
| `canal_origem_id` | integer | sim |  |  |
| `curso_id` | integer | sim |  |  |
| `quantidade` | integer | sim |  |  |
| `observacoes` | text | sim |  |  |
| `aluno_nome` | character varying(255) | sim |  |  |
| `aluno_idade` | integer | sim |  |  |
| `professor_experimental_id` | integer | sim |  |  |
| `professor_fixo_id` | integer | sim |  |  |
| `agente_comercial` | character varying(100) | sim |  |  |
| `valor_passaporte` | numeric | sim |  |  |
| `valor_parcela` | numeric | sim |  |  |
| `forma_pagamento_id` | integer | sim |  |  |
| `tipo_matricula` | character varying | sim |  |  |
| `aluno_novo_retorno` | text | sim |  |  |
| `created_at` | timestamp with time zone | sim |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |
| `created_by` | integer | sim |  |  |
| `arquivado` | boolean | sim |  |  |
| `data_arquivamento` | date | sim |  |  |
| `motivo_arquivamento_id` | integer | sim |  |  |
| `motivo_nao_matricula_id` | integer | sim |  |  |
| `forma_pagamento_passaporte_id` | integer | sim |  |  |
| `dia_vencimento` | integer | sim |  |  |
| `tipo_aluno` | character varying | sim |  |  |
| `sabia_preco` | boolean | sim |  |  |
| `lead_status` | character varying(50) | sim |  |  |
| `telefone` | character varying(20) | sim |  |  |
| `whatsapp` | character varying(20) | sim |  |  |
| `email` | character varying(255) | sim |  |  |
| `experimental_agendada` | boolean | sim |  |  |
| `data_experimental` | date | sim |  |  |
| `horario_experimental` | time without time zone | sim |  |  |
| `experimental_realizada` | boolean | sim |  |  |
| `faltou_experimental` | boolean | sim |  |  |
| `converteu` | boolean | sim |  |  |
| `data_conversao` | date | sim |  |  |
| `aluno_id` | integer | sim |  |  |
| `motivo_nao_matricula` | text | sim |  |  |
| `data_primeiro_contato` | timestamp with time zone | sim |  |  |
| `data_ultimo_contato` | timestamp with time zone | sim |  |  |
| `canal_origem_nome` | character varying(50) | sim |  |  |
| `curso_nome` | character varying(100) | sim |  |  |
| `professor_experimental_nome` | character varying(100) | sim |  |  |
| `unidade_codigo` | character varying(20) | sim |  |  |
| `unidade_nome` | character varying(100) | sim |  |  |
| `motivo_arquivamento_texto` | character varying(255) | sim |  |  |

## vw_leads_por_canal

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade` | character varying(100) | sim |  |  |
| `ano_mes` | text | sim |  |  |
| `canal` | character varying | sim |  |  |
| `total_leads` | bigint | sim |  |  |
| `matriculas` | bigint | sim |  |  |
| `taxa_conversao` | numeric | sim |  |  |

## vw_leads_sinteticos_por_mes

> Tamanho do lead sintetico (criado pelo gatilho a partir da matricula) por mes e unidade, com a taxa de conversao COM e SEM ele. Insumo da decisao sobre o denominador do funil.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `competencia` | date | sim |  |  |
| `unidade` | character varying(100) | sim |  |  |
| `leads_no_mes` | integer | sim |  |  |
| `sinteticos` | integer | sim |  |  |
| `pct_sintetico` | numeric | sim |  |  |
| `converteu` | integer | sim |  |  |
| `conv_com_sinteticos` | numeric | sim |  |  |
| `conv_so_funil` | numeric | sim |  |  |

## vw_matriculas_por_canal

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade` | character varying(100) | sim |  |  |
| `ano_mes` | text | sim |  |  |
| `canal_origem` | character varying | sim |  |  |
| `quantidade` | bigint | sim |  |  |

## vw_motivos_nao_matricula

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade` | character varying(100) | sim |  |  |
| `ano_mes` | text | sim |  |  |
| `motivo_nao_matricula` | text | sim |  |  |
| `quantidade` | bigint | sim |  |  |

## vw_observador_leads_orfaos

> Webhooks de lead recebidos pelo observador, classificados: ok (existe por emusys_lead_id), vinculo_faltando (existe por telefone, so falta o emusys_lead_id) e perdido (nao existe de jeito nenhum — payload salvo, recuperavel via upsert_lead). Alerta = situacao perdido em lead_criado.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `automacao_log_id` | bigint | sim |  |  |
| `created_at` | timestamp with time zone | sim |  |  |
| `recebido_brt` | timestamp without time zone | sim |  |  |
| `evento` | text | sim |  |  |
| `emusys_lead_id` | bigint | sim |  |  |
| `nome` | text | sim |  |  |
| `telefone_bruto` | text | sim |  |  |
| `email` | text | sim |  |  |
| `escola_id` | text | sim |  |  |
| `instrumento` | text | sim |  |  |
| `data_hora_criacao` | text | sim |  |  |
| `data_nascimento` | text | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `fone8` | text | sim |  |  |
| `lead_id_por_telefone` | integer | sim |  |  |
| `situacao` | text | sim |  |  |

## vw_performance_professor_experimental

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade` | character varying(100) | sim |  |  |
| `ano_mes` | text | sim |  |  |
| `professor` | character varying(100) | sim |  |  |
| `experimentais_realizadas` | bigint | sim |  |  |
| `matriculas` | bigint | sim |  |  |
| `taxa_conversao` | numeric | sim |  |  |

