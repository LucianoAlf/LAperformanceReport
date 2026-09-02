<!-- GERADO POR scripts/gerar-mapa-banco.mjs — NÃO EDITE À MÃO.
     Banco: ouqwbbermlzqqvtqwlul · Gerado em: 2026-09-02 -->

<!-- fim do cabecalho gerado -->
# Detalhe do banco — aluno

126 objetos. Resumo de todos os domínios em `../TABELAS.gerado.md`.

## aluno_acoes

> Histórico de intervenções realizadas com alunos (ligação, WhatsApp, reunião, etc.)

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `aluno_id` | integer | não |  | alunos.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `tipo` | character varying(30) | não |  |  |
| `descricao` | text | não |  |  |
| `resultado` | text | sim |  |  |
| `realizado_por` | uuid | sim |  | users.id |
| `realizado_por_nome` | character varying(100) | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `pesquisa_evasao_id` | uuid | sim |  | pesquisa_evasao.id |
| `classificacao_evasao_id` | uuid | sim |  | pesquisa_evasao_classificacoes.id |
| `professor_id` | integer | sim |  | professores.id |
| `estado` | text | não | 'pendente'::text |  |
| `prazo_em` | timestamp with time zone | sim |  |  |
| `criado_por_usuario_id` | integer | sim |  | usuarios.id |
| `concluida_por_usuario_id` | integer | sim |  | usuarios.id |
| `concluida_por_auth_user_id` | uuid | sim |  |  |
| `concluida_em` | timestamp with time zone | sim |  |  |

**Únicos:**
- `aluno_acoes_pkey`

## aluno_contatos

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('aluno_contatos_id_seq'::regclass) |  |
| `aluno_id` | integer | não |  | alunos.id |
| `nome` | character varying(200) | não |  |  |
| `telefone` | character varying(20) | sim |  |  |
| `parentesco` | character varying(50) | sim |  |  |
| `principal` | boolean | sim | false |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `aluno_contatos_pkey`

## aluno_feedback_professor

> Feedback do professor sobre cada aluno (verde/amarelo/vermelho)

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `aluno_id` | integer | não |  | alunos.id |
| `professor_id` | integer | não |  | professores.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `competencia` | date | não |  |  |
| `feedback` | character varying(20) | não |  |  |
| `observacao` | text | sim |  |  |
| `sessao_id` | uuid | sim |  | aluno_feedback_sessoes.id |
| `respondido_em` | timestamp with time zone | sim | now() |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `pratica_em_casa` | text | sim |  |  |
| `evolucao` | text | sim |  |  |
| `animo` | text | sim |  |  |
| `teve_aula_no_mes` | boolean | sim |  |  |
| `origem` | text | sim |  |  |
| `atualizado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `aluno_feedback_professor_aluno_id_professor_id_competencia_key`
- `aluno_feedback_professor_pkey`

## aluno_feedback_sessoes

> Sessões de coleta de feedback do professor sobre seus alunos

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `professor_id` | integer | não |  | professores.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `competencia` | date | não |  |  |
| `token` | text | não |  |  |
| `status` | character varying(20) | sim | 'pendente'::character varying |  |
| `total_alunos` | integer | não | 0 |  |
| `respondidos` | integer | não | 0 |  |
| `enviado_em` | timestamp with time zone | sim |  |  |
| `concluido_em` | timestamp with time zone | sim |  |  |
| `enviado_por` | uuid | sim |  | users.id |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `aluno_feedback_sessoes_pkey`
- `aluno_feedback_sessoes_token_key`

## aluno_jornada_matricula_disciplina

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `aluno_id` | integer | sim |  | alunos.id |
| `emusys_aluno_id` | bigint | sim |  |  |
| `emusys_matricula_id` | bigint | sim |  |  |
| `emusys_matricula_disciplina_id` | bigint | não |  |  |
| `emusys_disciplina_id` | bigint | sim |  |  |
| `curso_id` | integer | sim |  | cursos.id |
| `curso_nome_emusys` | text | sim |  |  |
| `professor_id` | integer | sim |  | professores.id |
| `emusys_professor_id` | bigint | sim |  |  |
| `professor_nome_emusys` | text | sim |  |  |
| `status_matricula` | text | não | 'desconhecido'::text |  |
| `qtd_contratos` | integer | sim |  |  |
| `nr_aulas_contratadas` | integer | sim |  |  |
| `nr_aulas_passadas` | integer | sim |  |  |
| `nr_aulas_futuras` | integer | sim |  |  |
| `proxima_aula_numero` | integer | sim |  |  |
| `percentual_jornada` | numeric(8,2) | sim |  |  |
| `data_primeira_aula` | timestamp with time zone | sim |  |  |
| `data_ultima_aula` | timestamp with time zone | sim |  |  |
| `dia_semana` | text | sim |  |  |
| `horario` | text | sim |  |  |
| `fonte_ultima_atualizacao` | text | não |  |  |
| `ultima_sincronizacao_emusys` | timestamp with time zone | não | now() |  |
| `payload_snapshot` | jsonb | não | '{}'::jsonb |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |
| `emusys_disciplina_id_origem` | bigint | sim |  |  |
| `curso_id_origem` | integer | sim |  |  |
| `curso_nome_emusys_origem` | text | sim |  |  |
| `curso_resolucao_fonte` | text | não | 'matriculas_api'::text |  |
| `curso_resolucao_confianca` | text | sim |  |  |
| `curso_resolvido_em` | timestamp with time zone | sim |  |  |
| `curso_resolucao_evidencias` | jsonb | não | '{}'::jsonb |  |
| `nr_faturas` | integer | sim |  |  |
| `data_primeira_fatura` | date | sim |  |  |
| `dia_vencimento_emusys` | integer | sim |  |  |
| `inadimplente_emusys` | boolean | sim |  |  |
| `status_emusys` | text | sim |  |  |
| `motivo_inativa` | text | sim |  |  |
| `trancamento_id` | bigint | sim |  |  |
| `trancamento_motivo` | text | sim |  |  |
| `trancamento_data_inicial` | date | sim |  |  |
| `trancamento_data_final` | date | sim |  |  |
| `sucedida_por` | bigint | sim |  |  |
| `sucedida_em` | timestamp with time zone | sim |  |  |

**Únicos:**
- `aluno_jornada_matricula_disciplina_pkey`
- `aluno_jornada_matricula_disciplina_unq`

**Triggers:**
- `trg_aluno_jornada_matricula_disciplina_updated_at → update_updated_at_column()`
- `trg_jornada_ciclo_sucedido → fn_jornada_marca_ciclo_sucedido()`
- `trg_materializar_projecao_jornada → trg_materializar_projecao_jornada()`
- `trg_resolver_jornada_curso_grade_atual_v1 → fn_aplicar_jornada_curso_grade_atual_v1()`

## aluno_metas

> Metas individuais definidas para cada aluno

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `aluno_id` | integer | não |  | alunos.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `titulo` | character varying(200) | não |  |  |
| `descricao` | text | sim |  |  |
| `tipo` | character varying(30) | sim | 'custom'::character varying |  |
| `valor_meta` | numeric | sim |  |  |
| `valor_atual` | numeric | sim | 0 |  |
| `prazo` | date | sim |  |  |
| `status` | character varying(20) | sim | 'ativa'::character varying |  |
| `criado_por` | uuid | sim |  | users.id |
| `criado_por_nome` | character varying(100) | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `aluno_metas_pkey`

## aluno_presenca

> Registro de presença dos alunos (tracking via WhatsApp)

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `aluno_id` | integer | não |  | alunos.id |
| `professor_id` | integer | sim |  | professores.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `data_aula` | date | não |  |  |
| `horario_aula` | time without time zone | sim |  |  |
| `status` | character varying(20) | sim | 'pendente'::character varying |  |
| `respondido_por` | character varying(30) | sim |  |  |
| `respondido_em` | timestamp with time zone | sim |  |  |
| `mensagem_uazapi_id` | character varying(100) | sim |  |  |
| `token` | character varying(100) | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `aula_emusys_id` | integer | sim |  | aulas_emusys.id |
| `curso_nome` | character varying(100) | sim |  |  |
| `turma_nome` | character varying(100) | sim |  |  |
| `sala_nome` | character varying(100) | sim |  |  |
| `status_presenca` | text | sim |  |  |
| `emusys_presenca_bruta` | text | sim |  |  |
| `sincronizado_emusys_em` | timestamp with time zone | sim |  |  |
| `emusys_presenca_bruta_anterior` | text | sim |  |  |
| `emusys_presenca_alterada_em` | timestamp with time zone | sim |  |  |
| `espelhado_de_presenca_id` | uuid | sim |  | aluno_presenca.id |

**Únicos:**
- `aluno_presenca_pkey`
- `idx_presenca_aluno_data_legacy`
- `uq_presenca_aluno_aula`

**Triggers:**
- `trg_atualiza_projecao_por_presenca → trg_atualiza_projecao_por_presenca()`
- `trg_professor_presente_quando_aluno_presente → trg_professor_presente_quando_aluno_presente()`
- `trg_sincronizar_gemeos_presenca → trg_sincronizar_gemeos_presenca()`

## aluno_presenca_administrativo

> Camada administrativa read-only para o professor; justificada vem do Emusys.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `aluno_id` | integer | não |  | alunos.id |
| `aula_emusys_id` | integer | não |  | aulas_emusys.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `justificada` | boolean | não | false |  |
| `fonte` | text | não | 'emusys'::text |  |
| `sincronizado_em` | timestamp with time zone | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |
| `motivo` | text | sim |  |  |
| `evidencia_path` | text | sim |  |  |
| `autor_usuario_id` | integer | sim |  | usuarios.id |
| `autor_auth_user_id` | uuid | sim |  |  |

**Únicos:**
- `aluno_presenca_administrativo_aluno_aula_uq`
- `aluno_presenca_administrativo_pkey`

## aluno_presenca_conflitos

> Divergências abertas entre decisão humana, presença positiva do Emusys ou aula gêmea. Não substitui retificações nem eventos do Fábio.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `aluno_presenca_id` | uuid | não |  | aluno_presenca.id |
| `aluno_presenca_gemea_id` | uuid | sim |  | aluno_presenca.id |
| `chave` | text | não |  |  |
| `tipo` | text | não |  |  |
| `estado` | text | não | 'aberto'::text |  |
| `status_decisao` | text | sim |  |  |
| `origem_decisao` | text | sim |  |  |
| `status_contraparte` | text | sim |  |  |
| `origem_contraparte` | text | sim |  |  |
| `evidencia` | jsonb | não | '{}'::jsonb |  |
| `detectado_em` | timestamp with time zone | não | now() |  |
| `atualizado_em` | timestamp with time zone | não | now() |  |
| `resolvido_em` | timestamp with time zone | sim |  |  |
| `resolucao` | text | sim |  |  |

**Únicos:**
- `aluno_presenca_conflitos_abertos_uniq`
- `aluno_presenca_conflitos_pkey`

## aluno_presenca_retificacoes

> Trilha append-only de correcoes de presenca feitas pela coordenacao.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `aluno_presenca_id` | uuid | sim |  | aluno_presenca.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `status_anterior` | text | sim |  |  |
| `status_novo` | text | não |  |  |
| `motivo` | text | sim |  |  |
| `autor_usuario_id` | integer | não |  | usuarios.id |
| `autor_auth_user_id` | uuid | não |  |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `respondido_por_anterior` | text | sim |  |  |
| `respondido_em_anterior` | timestamp with time zone | sim |  |  |

**Únicos:**
- `aluno_presenca_retificacoes_pkey`

**Triggers:**
- `completar_origem_retificacao_presenca → fn_completar_origem_retificacao_presenca()`

## aluno_presenca_revisoes_operacionais

> Estado auditado da revisao posterior de ausencias publicadas por politica de unidade.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `aluno_presenca_id` | uuid | não |  | aluno_presenca.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `politica_confiabilidade_id` | uuid | não |  | presenca_politicas_confiabilidade.id |
| `status` | text | não |  |  |
| `status_origem` | text | não |  |  |
| `status_final` | text | não |  |  |
| `motivo` | text | não |  |  |
| `revisado_por_usuario_id` | integer | não |  | usuarios.id |
| `revisado_por_auth_user_id` | uuid | não |  |  |
| `revisado_em` | timestamp with time zone | não | now() |  |
| `created_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `aluno_presenca_revisoes_operacionais_aluno_presenca_id_key`
- `aluno_presenca_revisoes_operacionais_pkey`

## aluno_professor_transicoes

> Camada fria: registro automatico de troca de professor por matricula/disciplina.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `aluno_id` | integer | sim |  | alunos.id |
| `emusys_matricula_id` | bigint | sim |  |  |
| `emusys_matricula_disciplina_id` | bigint | não |  |  |
| `curso_id` | integer | sim |  | cursos.id |
| `curso_anterior_id` | integer | sim |  | cursos.id |
| `professor_anterior_id` | integer | sim |  | professores.id |
| `professor_novo_id` | integer | sim |  | professores.id |
| `emusys_professor_anterior_id` | bigint | sim |  |  |
| `emusys_professor_novo_id` | bigint | sim |  |  |
| `data_transicao` | timestamp with time zone | não | now() |  |
| `tipo_transicao` | text | não | 'troca_professor'::text |  |
| `descricao_emusys` | text | sim |  |  |
| `automacao_log_id` | bigint | sim |  | automacao_log.id |
| `payload_snapshot` | jsonb | não | '{}'::jsonb |  |
| `fonte` | text | não | 'webhook:matricula_alterada'::text |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `motivo_saida_id` | integer | sim |  | motivos_saida.id |
| `atribuicao_confirmada` | boolean | sim |  |  |
| `conta_retencao_professor` | boolean | sim |  |  |
| `revisado_por` | integer | sim |  | usuarios.id |
| `revisado_em` | timestamp with time zone | sim |  |  |
| `periodo_origem_id` | uuid | sim |  | professor_matricula_disciplina_periodos_v1.id |

**Únicos:**
- `aluno_professor_transicoes_pkey`
- `uq_aluno_professor_transicoes_evento`

## aluno_reposicoes

> Credito de reposicao: nasce de falta justificada ou cancelamento, morre quando a aula reposta acontece. Casamento por elo direto (reagendada) ou rede (aluno+disciplina+janela).

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `aluno_id` | integer | não |  | alunos.id |
| `aula_origem_id` | integer | não |  | aulas_emusys.id |
| `origem` | text | não |  |  |
| `status` | text | não | 'pendente'::text |  |
| `motivo` | text | sim |  |  |
| `evidencia_path` | text | sim |  |  |
| `aula_reposicao_id` | integer | sim |  | aulas_emusys.id |
| `casamento` | text | sim |  |  |
| `agendada_em` | timestamp with time zone | sim |  |  |
| `realizada_em` | timestamp with time zone | sim |  |  |
| `expira_em` | date | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `aluno_reposicoes_pkey`
- `aluno_reposicoes_unica`

**Triggers:**
- `trg_atualiza_projecao_por_reposicao → trg_atualiza_projecao_por_reposicao()`

## aluno_transferencias

> Movimentacoes internas de alunos entre unidades. Nao contam como matricula nova comercial nem evasao.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não | nextval('aluno_transferencias_id_seq'::regclass) |  |
| `aluno_id` | bigint | não |  | alunos.id |
| `unidade_origem_id` | uuid | sim |  | unidades.id |
| `unidade_destino_id` | uuid | não |  | unidades.id |
| `data_transferencia` | date | não | CURRENT_DATE |  |
| `observacao` | text | sim |  |  |
| `created_by` | uuid | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `aluno_transferencias_pkey`
- `aluno_transferencias_unica_por_competencia`

## alunos

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('alunos_id_seq'::regclass) |  |
| `nome` | character varying(200) | não |  |  |
| `nome_normalizado` | character varying(200) | sim | upper(TRIM(BOTH FROM nome)) |  |
| `data_nascimento` | date | sim |  |  |
| `idade_atual` | integer | sim |  |  |
| `classificacao` | character varying(4) | sim |  |  |
| `tempo_permanencia_meses` | integer | sim |  |  |
| `telefone` | character varying(20) | sim |  |  |
| `whatsapp` | character varying(20) | sim |  |  |
| `email` | character varying(150) | sim |  |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `professor_atual_id` | integer | sim |  | professores.id |
| `curso_id` | integer | sim |  | cursos.id |
| `tipo_matricula_id` | integer | sim | 1 | tipos_matricula.id |
| `data_matricula` | date | sim |  |  |
| `data_inicio_contrato` | date | sim |  |  |
| `data_fim_contrato` | date | sim |  |  |
| `data_saida` | date | sim |  |  |
| `valor_parcela` | numeric(10,2) | sim |  |  |
| `valor_passaporte` | numeric(10,2) | sim |  |  |
| `status` | character varying(20) | sim | 'ativo'::character varying |  |
| `is_ex_aluno` | boolean | sim | false |  |
| `is_segundo_curso` | boolean | sim | false |  |
| `tipo_saida_id` | integer | sim |  | tipos_saida.id |
| `motivo_saida_id` | integer | sim |  | motivos_saida.id |
| `canal_origem_id` | integer | sim |  | canais_origem.id |
| `forma_pagamento_id` | integer | sim |  | formas_pagamento.id |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `created_by` | character varying(100) | sim |  |  |
| `updated_by` | character varying(100) | sim |  |  |
| `dia_aula` | character varying(20) | sim |  |  |
| `horario_aula` | time without time zone | sim |  |  |
| `percentual_presenca` | integer | sim |  |  |
| `professor_experimental_id` | integer | sim |  | professores.id |
| `agente_comercial` | character varying(100) | sim |  |  |
| `is_aluno_retorno` | boolean | sim | false |  |
| `data_ultima_renovacao` | date | sim |  |  |
| `numero_renovacoes` | integer | sim | 0 |  |
| `nps_saida` | integer | sim |  |  |
| `tipo_aluno` | character varying(50) | sim | 'pagante'::character varying |  |
| `status_pagamento` | character varying(20) | sim | 'em_dia'::character varying |  |
| `dia_vencimento` | integer | sim | 5 |  |
| `health_score` | character varying(10) | sim | NULL::character varying |  |
| `health_score_updated_at` | timestamp with time zone | sim |  |  |
| `health_score_updated_by` | integer | sim |  |  |
| `responsavel_nome` | character varying(255) | sim | NULL::character varying |  |
| `responsavel_telefone` | character varying(50) | sim | NULL::character varying |  |
| `responsavel_parentesco` | character varying(50) | sim | NULL::character varying |  |
| `modalidade` | character varying(20) | sim | 'turma'::character varying |  |
| `health_score_numerico` | integer | sim |  |  |
| `emusys_student_id` | text | sim |  |  |
| `photo_url` | text | sim |  |  |
| `foto_url` | text | sim |  |  |
| `instagram` | character varying(100) | sim |  |  |
| `emusys_matricula_id` | text | sim |  |  |
| `anamnese_preenchida` | boolean | sim | false |  |
| `anamnese_preenchida_em` | timestamp with time zone | sim |  |  |
| `temperamento_codinome` | character varying(40) | sim |  |  |
| `lead_origem_id` | integer | sim |  | leads.id |
| `arquivado_em` | timestamp with time zone | sim |  |  |
| `arquivado_por` | text | sim |  |  |
| `arquivado_motivo` | text | sim |  |  |
| `arquivado_origem` | text | sim |  |  |
| `arquivado_aluno_principal_id` | integer | sim |  | alunos.id |
| `valor_cheio` | numeric | sim |  |  |
| `desconto_fixo` | numeric | sim |  |  |
| `desconto_condicional` | numeric | sim |  |  |
| `emusys_lead_id` | text | sim |  |  |
| `aguardando_renovacao` | boolean | sim |  |  |
| `instagram_nao_possui` | boolean | não | false |  |
| `instagram_nao_possui_marcado_em` | timestamp with time zone | sim |  |  |
| `instagram_nao_possui_marcado_por` | text | sim |  |  |

**Únicos:**
- `alunos_pkey`
- `idx_alunos_duplicata_matricula_unique`

**Triggers:**
- `trg_aluno_ativo_sem_data_saida → fn_aluno_ativo_sem_data_saida()`
- `trg_alunos_calcular_campos → calcular_campos_aluno()`
- `trg_alunos_reentrada_historico → fn_alunos_reentrada_historico()`
- `trg_alunos_valor_parcela_comercial_canonico → aplicar_valor_parcela_comercial_canonico()`
- `trg_alunos_valor_parcela_comercial_emusys → fn_alunos_valor_parcela_comercial_emusys()`
- `trg_alunos_vinculo_emusys_anamnese → fn_alunos_vinculo_emusys_anamnese()`
- `trg_audit → fn_audit_log()`
- `trg_costura_vincular_conversa → fn_costura_vincular_conversa_numero()`
- `trg_enqueue_sync_student_studio → enqueue_sync_student_studio()`
- `trg_sync_aluno_contatos → sync_aluno_contatos_from_legacy()`
- `trg_vincular_anamnese_na_matricula → fn_vincular_anamnese_pendente()`
- `trigger_sync_aluno_to_leads → sync_aluno_to_leads()`

## alunos_arquivados

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('alunos_id_seq'::regclass) |  |
| `nome` | character varying(200) | não |  |  |
| `nome_normalizado` | character varying(200) | sim |  |  |
| `data_nascimento` | date | sim |  |  |
| `idade_atual` | integer | sim |  |  |
| `classificacao` | character varying(4) | sim |  |  |
| `tempo_permanencia_meses` | integer | sim |  |  |
| `telefone` | character varying(20) | sim |  |  |
| `whatsapp` | character varying(20) | sim |  |  |
| `email` | character varying(150) | sim |  |  |
| `unidade_id` | uuid | não |  |  |
| `professor_atual_id` | integer | sim |  |  |
| `curso_id` | integer | sim |  |  |
| `tipo_matricula_id` | integer | sim | 1 |  |
| `data_matricula` | date | sim |  |  |
| `data_inicio_contrato` | date | sim |  |  |
| `data_fim_contrato` | date | sim |  |  |
| `data_saida` | date | sim |  |  |
| `valor_parcela` | numeric(10,2) | sim |  |  |
| `valor_passaporte` | numeric(10,2) | sim |  |  |
| `status` | character varying(20) | sim | 'ativo'::character varying |  |
| `is_ex_aluno` | boolean | sim | false |  |
| `is_segundo_curso` | boolean | sim | false |  |
| `tipo_saida_id` | integer | sim |  |  |
| `motivo_saida_id` | integer | sim |  |  |
| `canal_origem_id` | integer | sim |  |  |
| `forma_pagamento_id` | integer | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `created_by` | character varying(100) | sim |  |  |
| `updated_by` | character varying(100) | sim |  |  |
| `dia_aula` | character varying(20) | sim |  |  |
| `horario_aula` | time without time zone | sim |  |  |
| `percentual_presenca` | integer | sim |  |  |
| `professor_experimental_id` | integer | sim |  |  |
| `agente_comercial` | character varying(100) | sim |  |  |
| `is_aluno_retorno` | boolean | sim | false |  |
| `data_ultima_renovacao` | date | sim |  |  |
| `numero_renovacoes` | integer | sim | 0 |  |
| `nps_saida` | integer | sim |  |  |
| `tipo_aluno` | character varying(50) | sim | 'pagante'::character varying |  |
| `status_pagamento` | character varying(20) | sim | 'em_dia'::character varying |  |
| `dia_vencimento` | integer | sim | 5 |  |
| `health_score` | character varying(10) | sim | NULL::character varying |  |
| `health_score_updated_at` | timestamp with time zone | sim |  |  |
| `health_score_updated_by` | integer | sim |  |  |
| `responsavel_nome` | character varying(255) | sim | NULL::character varying |  |
| `responsavel_telefone` | character varying(50) | sim | NULL::character varying |  |
| `responsavel_parentesco` | character varying(50) | sim | NULL::character varying |  |
| `modalidade` | character varying(20) | sim | 'turma'::character varying |  |
| `health_score_numerico` | integer | sim |  |  |
| `emusys_student_id` | text | sim |  |  |
| `photo_url` | text | sim |  |  |
| `foto_url` | text | sim |  |  |
| `instagram` | character varying(100) | sim |  |  |
| `emusys_matricula_id` | text | sim |  |  |
| `anamnese_preenchida` | boolean | sim | false |  |
| `anamnese_preenchida_em` | timestamp with time zone | sim |  |  |
| `temperamento_codinome` | character varying(40) | sim |  |  |
| `arquivado_em` | timestamp with time zone | sim | now() |  |
| `arquivado_por` | text | sim |  |  |
| `motivo` | text | sim |  |  |

## alunos_health_score_historico

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `aluno_id` | integer | não |  | alunos.id |
| `professor_id` | integer | não |  | professores.id |
| `health_score` | character varying(10) | não |  |  |
| `observacao` | text | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `alunos_health_score_historico_pkey`

## alunos_historico

> Histórico de ex-alunos para cálculo de LTV (Tempo Médio de Permanência). Só inclui alunos com 4+ meses.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('alunos_historico_id_seq'::regclass) |  |
| `nome` | character varying(255) | não |  |  |
| `tempo_permanencia_meses` | numeric(5,2) | não |  |  |
| `categoria_saida` | character varying(100) | sim |  |  |
| `mes_saida` | character varying(50) | sim |  |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `aluno_id` | integer | sim |  | alunos.id |
| `data_entrada` | date | sim |  |  |
| `data_saida` | date | sim |  |  |
| `anulado` | boolean | não | false |  |
| `motivo_anulacao` | text | sim |  |  |
| `anulado_por` | text | sim |  |  |
| `anulado_em` | timestamp with time zone | sim |  |  |
| `motivo_saida` | text | sim |  |  |
| `aluno_ids` | bigint[] | sim |  |  |

**Únicos:**
- `alunos_historico_pkey`
- `idx_alunos_historico_aluno_data_saida_uniq`

**Triggers:**
- `update_alunos_historico_updated_at → update_updated_at_column()`

## alunos_turmas

> Relacionamento entre alunos e turmas - permite histórico de turmas

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('alunos_turmas_id_seq'::regclass) |  |
| `aluno_id` | integer | não |  | alunos.id |
| `turma_id` | integer | não |  | turmas.id |
| `data_entrada` | date | sim | CURRENT_DATE |  |
| `data_saida` | date | sim |  |  |
| `ativo` | boolean | sim | true |  |
| `observacoes` | text | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `alunos_turmas_aluno_id_turma_id_key`
- `alunos_turmas_pkey`

## anamnese_convites

> Convites de anamnese remota. Um convite vivo por aluno; expira em 7 dias ou no uso.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não | nextval('anamnese_convites_id_seq'::regclass) |  |
| `token` | text | não |  |  |
| `aluno_id` | integer | sim |  | alunos.id |
| `nome_aluno` | text | não |  |  |
| `telefone_aluno` | text | sim |  |  |
| `data_nascimento` | date | sim |  |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `tipo_formulario` | character varying(4) | não |  |  |
| `expira_em` | timestamp with time zone | não |  |  |
| `usado_em` | timestamp with time zone | sim |  |  |
| `anamnese_id` | integer | sim |  | anamneses.id |
| `revogado_em` | timestamp with time zone | sim |  |  |
| `criado_por` | integer | sim |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `anamnese_convites_aluno_vivo`
- `anamnese_convites_pkey`
- `anamnese_convites_prematricula_vivo`
- `anamnese_convites_token_key`

## anamnese_respostas_perfil

> Respostas individuais das 11 perguntas de perfil comportamental. Armazena posição escolhida para auditoria e recálculo.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('anamnese_respostas_perfil_id_seq'::regclass) |  |
| `anamnese_id` | integer | não |  | anamneses.id |
| `pergunta_numero` | integer | não |  |  |
| `resposta_posicao` | integer | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `anamnese_respostas_perfil_pkey`

## anamneses

> Anamnese do aluno - coleta de perfil pedagógico, saúde, temperamento comportamental. Vinculada a alunos.id (nullable para pré-matrícula).

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('anamneses_id_seq'::regclass) |  |
| `aluno_id` | integer | sim |  | alunos.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `tipo_formulario` | character varying(4) | não |  |  |
| `nome_aluno` | character varying(200) | não |  |  |
| `telefone_aluno` | character varying(20) | sim |  |  |
| `entrevistador` | character varying(100) | sim |  |  |
| `modo_resposta` | character varying(20) | sim |  |  |
| `status` | character varying(20) | sim | 'completa'::character varying |  |
| `vinculo_status` | character varying(20) | sim | 'vinculado'::character varying |  |
| `duracao_segundos` | integer | sim |  |  |
| `genero` | character varying(30) | sim |  |  |
| `possui_instrumento` | character varying(30) | sim |  |  |
| `cursos_escolhidos` | text | sim |  |  |
| `objetivos` | jsonb | sim | '[]'::jsonb |  |
| `tempo_para_metas` | character varying(20) | sim |  |  |
| `tempo_disponivel_estudo` | character varying(20) | sim |  |  |
| `experiencia_anterior` | jsonb | sim | '[]'::jsonb |  |
| `interesse_bandas` | character varying(10) | sim |  |  |
| `cuidado_medico` | text | sim |  |  |
| `medicacao_continua` | text | sim |  |  |
| `diagnosticos` | jsonb | sim | '[]'::jsonb |  |
| `necessidade_apoio` | text | sim |  |  |
| `generos_musicais` | jsonb | sim | '[]'::jsonb |  |
| `instrumentos_toca` | jsonb | sim | '[]'::jsonb |  |
| `nivel_conhecimento_musical` | character varying(20) | sim |  |  |
| `nivel_habilidade_instrumento` | character varying(20) | sim |  |  |
| `motivo_procura_pais` | jsonb | sim | '[]'::jsonb |  |
| `metas_pais` | jsonb | sim | '[]'::jsonb |  |
| `fonte_exposicao_musical` | jsonb | sim | '[]'::jsonb |  |
| `musicos_na_familia` | boolean | sim |  |  |
| `interesse_instrumento_cantar` | boolean | sim |  |  |
| `exposicao_telas` | character varying(30) | sim |  |  |
| `comunicacao_crianca` | character varying(30) | sim |  |  |
| `sono_crianca` | jsonb | sim | '[]'::jsonb |  |
| `estereotipias` | text | sim |  |  |
| `situacao_responsaveis` | character varying(50) | sim |  |  |
| `filiacao` | character varying(30) | sim |  |  |
| `quem_traz_crianca` | jsonb | sim | '[]'::jsonb |  |
| `temperamento_primario` | character varying(20) | sim |  |  |
| `temperamento_secundario` | character varying(20) | sim |  |  |
| `temperamento_codinome` | character varying(40) | sim |  |  |
| `temperamento_contagem` | jsonb | sim |  |  |
| `perfil_baby` | boolean | sim | false |  |
| `observacoes_entrevistador` | text | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `created_by` | integer | sim |  | usuarios.id |
| `share_token` | character varying(64) | sim |  |  |
| `diagnosticos_outro` | text | sim |  |  |
| `pessoa_chave` | text | sim |  |  |

**Únicos:**
- `anamneses_pkey`
- `anamneses_share_token_unique`

**Triggers:**
- `trg_anamnese_atualiza_aluno → fn_atualizar_aluno_anamnese()`
- `trg_anamnese_pessoa_chave → fn_anamnese_define_pessoa_chave()`

## aviso_previo_veredito

> Veredito por aviso previo vigente, apurado ao vivo no Emusys pelo cron da Sol. Escritor unico: send-aviso-previo-sol.py. A tela LE daqui e mostra `verificado_em` -- dado parado precisa se denunciar, nao mentir com cara de fresco.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `movimentacao_id` | integer | não |  | movimentacoes_admin.id |
| `situacao` | text | não |  |  |
| `aulas_agendadas` | integer | sim |  |  |
| `ultima_agendada` | date | sim |  |  |
| `ultima_presenca` | date | sim |  |  |
| `matricula_status` | text | sim |  |  |
| `verificado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `aviso_previo_veredito_pkey`

## banda

> Identidade da banda (nome/genero/descricao) por cima da turma canonica. Roster/professor/horario sao derivados do canonico via RPC; aqui fica so a identidade + ancora (turma_chave).

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não | nextval('banda_id_seq'::regclass) |  |
| `unidade_id` | uuid | não |  |  |
| `curso_id` | integer | sim |  |  |
| `turma_chave` | text | sim |  |  |
| `dia_semana` | text | sim |  |  |
| `horario` | time without time zone | sim |  |  |
| `produtor_professor_id` | integer | sim |  |  |
| `nome` | text | não |  |  |
| `genero` | text | sim |  |  |
| `descricao` | text | sim |  |  |
| `logo_url` | text | sim |  |  |
| `status` | text | não | 'ativa'::text |  |
| `precisa_revisar_nome` | boolean | não | false |  |
| `origem_nome` | text | sim |  |  |
| `observacoes` | text | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |
| `horario_fim` | time without time zone | sim |  |  |
| `frequencia` | text | sim |  |  |
| `sala_id` | integer | sim |  |  |
| `modelo_financeiro` | text | sim |  |  |
| `valor_mensal_aluno` | numeric | sim |  |  |
| `valor_repasse` | numeric | sim |  |  |
| `turma_nome` | text | sim |  |  |
| `confirmada` | boolean | não | false |  |
| `descartada` | boolean | não | false |  |

**Únicos:**
- `banda_pkey`
- `banda_turma_chave_key`

## banda_curso_depara

> De-para curado de quais cursos contam como banda no modulo. Fonte da definicao (Emusys nao tem conceito de banda). Editavel por Alf/Jessica.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `curso_id` | integer | não |  |  |
| `nome_curso` | text | sim |  |  |
| `ativo` | boolean | não | true |  |
| `created_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `banda_curso_depara_pkey`

## banda_evento

> Eventos de banda (tipo=ensaio/show). orcamento e SO planejamento — nao e ledger financeiro (banda e sem-MRR; repasse segue a maquina canonica).

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não | nextval('banda_evento_id_seq'::regclass) |  |
| `unidade_id` | uuid | não |  |  |
| `tipo` | text | não |  |  |
| `titulo` | text | não |  |  |
| `data_inicio` | timestamp with time zone | não |  |  |
| `data_fim` | timestamp with time zone | sim |  |  |
| `local` | text | sim |  |  |
| `sala_id` | integer | sim |  |  |
| `orcamento` | numeric | sim |  |  |
| `status` | text | não | 'agendado'::text |  |
| `observacoes` | text | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `banda_evento_pkey`

## banda_evento_participante

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não | nextval('banda_evento_participante_id_seq'::regclass) |  |
| `evento_id` | bigint | não |  | banda_evento.id |
| `banda_id` | bigint | não |  | banda.id |
| `created_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `banda_evento_participante_evento_id_banda_id_key`
- `banda_evento_participante_pkey`

## banda_integrante

> Enriquecimento de banda por aluno (instrumento/funcao). O roster BASE vem do canonico (alunos da turma); esta tabela apenas adiciona papel. aluno_id referencia public.alunos.id (sem FK rigida de proposito).

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não | nextval('banda_integrante_id_seq'::regclass) |  |
| `banda_id` | bigint | não |  | banda.id |
| `aluno_id` | integer | não |  |  |
| `instrumento_na_banda` | text | sim |  |  |
| `funcao` | text | sim |  |  |
| `data_entrada` | date | sim |  |  |
| `data_saida` | date | sim |  |  |
| `ativo` | boolean | não | true |  |
| `observacoes` | text | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `banda_integrante_banda_id_aluno_id_key`
- `banda_integrante_pkey`

## banda_repertorio

> Repertorio da banda. letra/cifra/cifraclub_url alimentados pela integracao Cifra Club (edge function).

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não | nextval('banda_repertorio_id_seq'::regclass) |  |
| `banda_id` | bigint | não |  | banda.id |
| `titulo` | text | não |  |  |
| `artista` | text | sim |  |  |
| `tom` | text | sim |  |  |
| `bpm` | integer | sim |  |  |
| `status` | text | não | 'ensaiando'::text |  |
| `letra` | text | sim |  |  |
| `cifra` | text | sim |  |  |
| `cifraclub_url` | text | sim |  |  |
| `duracao_min` | integer | sim |  |  |
| `observacoes` | text | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `banda_repertorio_pkey`

## cursos_matriculados

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('cursos_matriculados_id_seq'::regclass) |  |
| `competencia` | date | não |  |  |
| `unidade` | character varying(50) | não |  |  |
| `curso` | character varying(100) | não |  |  |
| `quantidade` | integer | sim | 0 |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `cursos_matriculados_competencia_unidade_curso_key`
- `cursos_matriculados_pkey`

## evasoes_backup_20260215

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | sim |  |  |
| `competencia` | date | sim |  |  |
| `unidade` | character varying(50) | sim |  |  |
| `aluno` | character varying(200) | sim |  |  |
| `professor` | character varying(100) | sim |  |  |
| `parcela` | numeric(10,2) | sim |  |  |
| `motivo_categoria` | character varying(50) | sim |  |  |
| `motivo_detalhe` | text | sim |  |  |
| `tipo` | character varying(30) | sim |  |  |
| `created_at` | timestamp with time zone | sim |  |  |

## evasoes_legacy_backup

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | sim |  |  |
| `competencia` | date | sim |  |  |
| `unidade` | character varying(50) | sim |  |  |
| `aluno` | character varying(200) | sim |  |  |
| `professor` | character varying(100) | sim |  |  |
| `parcela` | numeric(10,2) | sim |  |  |
| `motivo_categoria` | character varying(50) | sim |  |  |
| `motivo_detalhe` | text | sim |  |  |
| `tipo` | character varying(30) | sim |  |  |
| `created_at` | timestamp with time zone | sim |  |  |

## evasoes_v2

> BACKUP - Tabela legada. Fonte unica de evasoes agora é movimentacoes_admin. Manter por 30 dias (ate 2026-03-27) para validacao. Nao dropar antes disso.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('evasoes_v2_id_seq'::regclass) |  |
| `aluno_id` | integer | sim |  | alunos.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `data_evasao` | date | não | CURRENT_DATE |  |
| `tipo_saida_id` | integer | não |  | tipos_saida.id |
| `motivo_saida_id` | integer | sim |  | motivos_saida.id |
| `professor_id` | integer | sim |  | professores.id |
| `valor_parcela` | numeric(10,2) | sim |  |  |
| `situacao_pagamento` | character varying(20) | sim | 'em_dia'::character varying |  |
| `data_prevista_saida` | date | sim |  |  |
| `observacoes` | text | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `created_by` | integer | sim |  | usuarios.id |
| `curso_id` | integer | sim |  | cursos.id |
| `aluno_nome` | character varying(255) | sim |  |  |
| `telefone_snapshot` | character varying(20) | sim |  |  |

**Únicos:**
- `evasoes_v2_aluno_curso_unique`
- `evasoes_v2_pkey`

**Triggers:**
- `set_updated_at_evasoes_v2 → update_updated_at_column()`

## evasoes_v2_backup

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | sim |  |  |
| `aluno_id` | integer | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `data_evasao` | date | sim |  |  |
| `tipo_saida_id` | integer | sim |  |  |
| `motivo_saida_id` | integer | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `valor_parcela` | numeric(10,2) | sim |  |  |
| `situacao_pagamento` | character varying(20) | sim |  |  |
| `data_prevista_saida` | date | sim |  |  |
| `observacoes` | text | sim |  |  |
| `created_at` | timestamp with time zone | sim |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |
| `created_by` | integer | sim |  |  |
| `curso_id` | integer | sim |  |  |
| `aluno_nome` | character varying(255) | sim |  |  |
| `telefone_snapshot` | character varying(20) | sim |  |  |

## farmer_checklist_contatos

> Carteira de alunos/contatos vinculados a cada checklist, com status de contato

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | uuid_generate_v4() |  |
| `checklist_id` | uuid | não |  | farmer_checklists.id |
| `aluno_id` | integer | não |  | alunos.id |
| `farmer_id` | integer | não |  | colaboradores.id |
| `status` | character varying | sim | 'pendente'::character varying |  |
| `canal_contato` | character varying | sim |  |  |
| `observacoes` | text | sim |  |  |
| `contatado_em` | timestamp with time zone | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `farmer_checklist_contatos_pkey`
- `unique_checklist_aluno`

## farmer_checklist_items

> Itens individuais de cada checklist, com suporte a sub-itens e canais de comunicação

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | uuid_generate_v4() |  |
| `checklist_id` | uuid | não |  | farmer_checklists.id |
| `descricao` | character varying | não |  |  |
| `ordem` | integer | sim | 0 |  |
| `canal` | character varying | sim |  |  |
| `info` | text | sim |  |  |
| `parent_id` | uuid | sim |  | farmer_checklist_items.id |
| `concluida` | boolean | sim | false |  |
| `concluida_em` | timestamp with time zone | sim |  |  |
| `concluida_por` | integer | sim |  | colaboradores.id |
| `created_at` | timestamp with time zone | sim | now() |  |
| `responsavel_id` | integer | sim |  | usuarios.id |

**Únicos:**
- `farmer_checklist_items_pkey`

## farmer_checklist_templates

> Templates reutilizáveis de checklists para o Painel Farmer

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | uuid_generate_v4() |  |
| `nome` | character varying | não |  |  |
| `descricao` | text | sim |  |  |
| `categoria` | character varying | sim |  |  |
| `itens` | jsonb | não | '[]'::jsonb |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `ativo` | boolean | sim | true |  |
| `ordem` | integer | sim | 0 |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `farmer_checklist_templates_pkey`

## farmer_checklists

> Checklists do Painel Farmer - listas de tarefas agrupadas com prazo e alertas

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | uuid_generate_v4() |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `colaborador_id` | integer | não |  | colaboradores.id |
| `titulo` | character varying | não |  |  |
| `descricao` | text | sim |  |  |
| `tipo` | character varying | não | 'manual'::character varying |  |
| `template_id` | uuid | sim |  | farmer_checklist_templates.id |
| `data_inicio` | date | sim |  |  |
| `data_prazo` | date | sim |  |  |
| `prioridade` | character varying | sim | 'media'::character varying |  |
| `alerta_dias_antes` | integer | sim | 1 |  |
| `alerta_hora` | time without time zone | sim | '09:00:00'::time without time zone |  |
| `lembrete_whatsapp` | boolean | sim | false |  |
| `status` | character varying | sim | 'ativo'::character varying |  |
| `concluido_em` | timestamp with time zone | sim |  |  |
| `ativo` | boolean | sim | true |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `periodicidade` | character varying | sim | 'pontual'::character varying |  |
| `departamento` | character varying | sim | 'administrativo'::character varying |  |
| `tipo_vinculo` | character varying | sim | 'nenhum'::character varying |  |
| `filtro_vinculo` | jsonb | sim |  |  |
| `responsavel_id` | integer | sim |  | usuarios.id |

**Únicos:**
- `farmer_checklists_pkey`

## farmer_recados

> Mensagens enviadas para professores via WhatsApp

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | uuid_generate_v4() |  |
| `colaborador_id` | integer | não |  | colaboradores.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `professor_id` | integer | não |  | professores.id |
| `aluno_id` | integer | sim |  | alunos.id |
| `assunto` | character varying(100) | sim | NULL::character varying |  |
| `mensagem` | text | não |  |  |
| `status` | character varying(20) | sim | 'enviado'::character varying |  |
| `whatsapp_message_id` | character varying(100) | sim | NULL::character varying |  |
| `enviado_em` | timestamp with time zone | sim | now() |  |
| `entregue_em` | timestamp with time zone | sim |  |  |
| `lido_em` | timestamp with time zone | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `farmer_recados_pkey`

## farmer_recados_campanhas

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `colaborador_id` | integer | não |  | colaboradores.id |
| `titulo` | character varying(200) | não |  |  |
| `tipo` | character varying(50) | não |  |  |
| `template_id` | uuid | sim |  | farmer_templates.id |
| `mensagem_base` | text | não |  |  |
| `data_limite` | date | sim |  |  |
| `status` | character varying(20) | sim | 'rascunho'::character varying |  |
| `total_destinatarios` | integer | sim | 0 |  |
| `enviados` | integer | sim | 0 |  |
| `erros` | integer | sim | 0 |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `started_at` | timestamp with time zone | sim |  |  |
| `completed_at` | timestamp with time zone | sim |  |  |

**Únicos:**
- `farmer_recados_campanhas_pkey`

## farmer_recados_destinatarios

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `campanha_id` | uuid | não |  | farmer_recados_campanhas.id |
| `professor_id` | integer | não |  | professores.id |
| `whatsapp` | character varying(20) | sim |  |  |
| `mensagem_personalizada` | text | sim |  |  |
| `status` | character varying(20) | sim | 'pendente'::character varying |  |
| `enviado_at` | timestamp with time zone | sim |  |  |
| `erro_mensagem` | text | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `farmer_recados_destinatarios_pkey`

## farmer_rotinas

> Rotinas customizáveis dos Farmers (diárias, semanais, mensais)

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | uuid_generate_v4() |  |
| `colaborador_id` | integer | não |  | colaboradores.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `descricao` | character varying(255) | não |  |  |
| `frequencia` | character varying(20) | não |  |  |
| `dias_semana` | integer[] | sim |  |  |
| `dia_mes` | integer | sim |  |  |
| `prioridade` | character varying(10) | sim | 'normal'::character varying |  |
| `lembrete_whatsapp` | boolean | sim | false |  |
| `ativo` | boolean | sim | true |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `farmer_rotinas_pkey`

## farmer_rotinas_execucao

> Registro de execução diária das rotinas

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | uuid_generate_v4() |  |
| `rotina_id` | uuid | não |  | farmer_rotinas.id |
| `colaborador_id` | integer | não |  | colaboradores.id |
| `data_execucao` | date | não |  |  |
| `concluida` | boolean | sim | false |  |
| `concluida_em` | timestamp with time zone | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `farmer_rotinas_execucao_pkey`
- `farmer_rotinas_execucao_rotina_id_data_execucao_key`

## farmer_tarefas

> To-do list manual dos Farmers

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | uuid_generate_v4() |  |
| `colaborador_id` | integer | não |  | colaboradores.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `descricao` | character varying(500) | não |  |  |
| `data_prazo` | date | sim |  |  |
| `prioridade` | character varying(10) | sim | 'media'::character varying |  |
| `aluno_id` | integer | sim |  | alunos.id |
| `observacoes` | text | sim |  |  |
| `concluida` | boolean | sim | false |  |
| `concluida_em` | timestamp with time zone | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `contexto` | character varying(20) | não | 'farmer'::character varying |  |
| `sla_em` | date | sim |  |  |
| `desfecho` | text | sim |  |  |
| `origem_alerta` | text | sim |  |  |

**Únicos:**
- `farmer_tarefas_pkey`

## farmer_templates

> Templates de mensagens para comunicação com alunos/responsáveis

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | uuid_generate_v4() |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `categoria` | character varying(50) | não |  |  |
| `nome` | character varying(100) | não |  |  |
| `mensagem` | text | não |  |  |
| `variaveis` | text[] | sim |  |  |
| `ativo` | boolean | sim | true |  |
| `ordem` | integer | sim | 0 |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `farmer_templates_pkey`

## jornada_curso_resolucao_log

> Trilha append-only das trocas de curso canonico resolvidas pela grade recorrente do Emusys.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não |  |  |
| `jornada_id` | uuid | não |  | aluno_jornada_matricula_disciplina.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `emusys_matricula_disciplina_id` | bigint | não |  |  |
| `emusys_disciplina_id_anterior` | bigint | sim |  |  |
| `emusys_disciplina_id_novo` | bigint | sim |  |  |
| `curso_id_anterior` | integer | sim |  | cursos.id |
| `curso_id_novo` | integer | sim |  | cursos.id |
| `fonte` | text | não |  |  |
| `confianca` | text | não |  |  |
| `evidencias` | jsonb | não | '{}'::jsonb |  |
| `criado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `jornada_curso_resolucao_log_pkey`

## motivos_arquivamento

> Motivos para arquivamento de leads que não converteram

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('motivos_arquivamento_id_seq'::regclass) |  |
| `nome` | character varying(100) | não |  |  |
| `descricao` | text | sim |  |  |
| `ativo` | boolean | sim | true |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `motivos_arquivamento_pkey`

## motivos_saida

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('motivos_saida_id_seq'::regclass) |  |
| `nome` | character varying(100) | não |  |  |
| `nome_normalizado` | character varying(100) | sim | upper(TRIM(BOTH FROM nome)) |  |
| `categoria` | character varying(30) | sim |  |  |
| `ativo` | boolean | sim | true |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `ordem` | integer | sim | 0 |  |
| `conta_score_professor` | boolean | sim | true |  |
| `eh_transferencia_interna` | boolean | não | false |  |

**Únicos:**
- `motivos_saida_pkey`
- `uk_motivos_nome_normalizado`

## motivos_saida_aliases

> Aliases de textos legados de movimentacoes para o catalogo canonico; nao reescreve o texto historico.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `alias_normalizado` | text | não |  |  |
| `alias_exibicao` | text | não |  |  |
| `motivo_saida_id` | integer | não |  | motivos_saida.id |
| `ativo` | boolean | não | true |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `motivos_saida_aliases_alias_normalizado_key`
- `motivos_saida_aliases_pkey`

## motivos_trancamento

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('motivos_trancamento_id_seq'::regclass) |  |
| `nome` | character varying(100) | não |  |  |
| `nome_normalizado` | character varying(100) | não |  |  |
| `categoria` | character varying(50) | sim | 'outro'::character varying |  |
| `ativo` | boolean | sim | true |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `motivos_trancamento_pkey`

## movimentacoes

> Registro de todas as movimentações de alunos: matrículas, renovações, evasões, transferências, trocas de curso/professor.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('movimentacoes_id_seq'::regclass) |  |
| `aluno_id` | integer | sim |  | alunos.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `curso_id` | integer | sim |  | cursos.id |
| `professor_id` | integer | sim |  | professores.id |
| `tipo` | character varying(50) | não |  |  |
| `data_movimentacao` | date | não | CURRENT_DATE |  |
| `data_referencia` | date | sim |  |  |
| `motivo_saida_id` | integer | sim |  | motivos_saida.id |
| `tipo_saida_id` | integer | sim |  | tipos_saida.id |
| `unidade_origem_id` | uuid | sim |  | unidades.id |
| `unidade_destino_id` | uuid | sim |  | unidades.id |
| `curso_anterior_id` | integer | sim |  | cursos.id |
| `professor_anterior_id` | integer | sim |  | professores.id |
| `valor_mensalidade` | numeric(10,2) | sim |  |  |
| `canal_origem_id` | integer | sim |  | canais_origem.id |
| `observacoes` | text | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `created_by` | character varying(100) | sim |  |  |

**Únicos:**
- `movimentacoes_pkey`

**Triggers:**
- `update_movimentacoes_updated_at → update_updated_at_column()`

## movimentacoes_admin

> Tabela para registrar movimentações administrativas: renovações, não renovações, avisos prévios e evasões

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('movimentacoes_admin_id_seq'::regclass) |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `data` | date | não |  |  |
| `tipo` | character varying(50) | não |  |  |
| `aluno_nome` | character varying(255) | não |  |  |
| `aluno_id` | integer | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `curso_id` | integer | sim |  |  |
| `valor_parcela_anterior` | numeric(10,2) | sim |  |  |
| `valor_parcela_novo` | numeric(10,2) | sim |  |  |
| `forma_pagamento_id` | integer | sim |  |  |
| `mes_saida` | date | sim |  |  |
| `tipo_evasao` | character varying(50) | sim |  |  |
| `motivo` | text | sim |  |  |
| `observacoes` | text | sim |  |  |
| `agente_comercial` | character varying(100) | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `tempo_permanencia_meses` | integer | sim |  |  |
| `valor_parcela_evasao` | numeric(10,2) | sim |  |  |
| `previsao_retorno` | date | sim |  |  |
| `motivo_saida_id` | integer | sim |  | motivos_saida.id |
| `motivo_trancamento_id` | integer | sim |  | motivos_trancamento.id |
| `telefone_snapshot` | character varying | sim |  |  |
| `situacao_pagamento` | character varying | sim | 'em_dia'::character varying |  |
| `data_prevista_saida` | date | sim |  |  |
| `unidade_destino_id` | uuid | sim |  | unidades.id |
| `competencia_referencia` | date | sim |  |  |
| `renovacao_primeira_aula_novo_ciclo` | date | sim |  |  |
| `renovacao_antecipada` | boolean | não | false |  |
| `renovacao_status` | text | sim |  |  |
| `emusys_matricula_id` | text | sim |  |  |
| `telefone_snapshot_origem` | text | sim |  |  |
| `emusys_aviso_previo_id` | integer | sim |  |  |
| `anulado` | boolean | não | false |  |
| `anulado_motivo` | text | sim |  |  |
| `anulado_em` | timestamp with time zone | sim |  |  |
| `anulado_por` | text | sim |  |  |

**Únicos:**
- `movimentacoes_admin_pkey`

**Triggers:**
- `trg_audit → fn_audit_log()`
- `trg_bloqueia_delete_movimentacao_admin → fn_bloqueia_delete_movimentacao_admin()`
- `trg_capturar_telefone_snapshot_movimentacao_retencao → capturar_telefone_snapshot_movimentacao_retencao()`
- `trg_preencher_campos_retencao_movimentacoes_admin → preencher_campos_retencao_movimentacoes_admin()`
- `trg_resolver_motivo_saida_movimentacao_admin → fn_resolver_motivo_saida_movimentacao_admin()`
- `trg_sync_evasao_dados_mensais → sync_evasao_to_dados_mensais()`

## movimentacoes_admin_arquivadas

> Lixeira de movimentacoes_admin. Linha movida por arquivar_movimentacao_admin(). DELETE direto na tabela viva e bloqueado por trg_bloqueia_delete_movimentacao_admin.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('movimentacoes_admin_id_seq'::regclass) |  |
| `unidade_id` | uuid | não |  |  |
| `data` | date | não |  |  |
| `tipo` | character varying(50) | não |  |  |
| `aluno_nome` | character varying(255) | não |  |  |
| `aluno_id` | integer | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `curso_id` | integer | sim |  |  |
| `valor_parcela_anterior` | numeric(10,2) | sim |  |  |
| `valor_parcela_novo` | numeric(10,2) | sim |  |  |
| `forma_pagamento_id` | integer | sim |  |  |
| `mes_saida` | date | sim |  |  |
| `tipo_evasao` | character varying(50) | sim |  |  |
| `motivo` | text | sim |  |  |
| `observacoes` | text | sim |  |  |
| `agente_comercial` | character varying(100) | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `tempo_permanencia_meses` | integer | sim |  |  |
| `valor_parcela_evasao` | numeric(10,2) | sim |  |  |
| `previsao_retorno` | date | sim |  |  |
| `motivo_saida_id` | integer | sim |  |  |
| `motivo_trancamento_id` | integer | sim |  |  |
| `telefone_snapshot` | character varying | sim |  |  |
| `situacao_pagamento` | character varying | sim | 'em_dia'::character varying |  |
| `data_prevista_saida` | date | sim |  |  |
| `unidade_destino_id` | uuid | sim |  |  |
| `competencia_referencia` | date | sim |  |  |
| `renovacao_primeira_aula_novo_ciclo` | date | sim |  |  |
| `renovacao_antecipada` | boolean | não | false |  |
| `renovacao_status` | text | sim |  |  |
| `emusys_matricula_id` | text | sim |  |  |
| `telefone_snapshot_origem` | text | sim |  |  |
| `emusys_aviso_previo_id` | integer | sim |  |  |
| `anulado` | boolean | não | false |  |
| `anulado_motivo` | text | sim |  |  |
| `anulado_em` | timestamp with time zone | sim |  |  |
| `anulado_por` | text | sim |  |  |
| `arquivado_em` | timestamp with time zone | não | now() |  |
| `arquivado_por` | text | sim |  |  |
| `arquivado_motivo` | text | não |  |  |

**Únicos:**
- `movimentacoes_admin_arquivadas_pkey`

## movimentacoes_admin_vigentes

> movimentacoes_admin sem as linhas anuladas. Use em KPI; a tabela crua mantem o historico completo, inclusive o que foi desconsiderado.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `data` | date | sim |  |  |
| `tipo` | character varying(50) | sim |  |  |
| `aluno_nome` | character varying(255) | sim |  |  |
| `aluno_id` | integer | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `curso_id` | integer | sim |  |  |
| `valor_parcela_anterior` | numeric(10,2) | sim |  |  |
| `valor_parcela_novo` | numeric(10,2) | sim |  |  |
| `forma_pagamento_id` | integer | sim |  |  |
| `mes_saida` | date | sim |  |  |
| `tipo_evasao` | character varying(50) | sim |  |  |
| `motivo` | text | sim |  |  |
| `observacoes` | text | sim |  |  |
| `agente_comercial` | character varying(100) | sim |  |  |
| `created_at` | timestamp with time zone | sim |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |
| `tempo_permanencia_meses` | integer | sim |  |  |
| `valor_parcela_evasao` | numeric(10,2) | sim |  |  |
| `previsao_retorno` | date | sim |  |  |
| `motivo_saida_id` | integer | sim |  |  |
| `motivo_trancamento_id` | integer | sim |  |  |
| `telefone_snapshot` | character varying | sim |  |  |
| `situacao_pagamento` | character varying | sim |  |  |
| `data_prevista_saida` | date | sim |  |  |
| `unidade_destino_id` | uuid | sim |  |  |
| `competencia_referencia` | date | sim |  |  |
| `renovacao_primeira_aula_novo_ciclo` | date | sim |  |  |
| `renovacao_antecipada` | boolean | sim |  |  |
| `renovacao_status` | text | sim |  |  |
| `emusys_matricula_id` | text | sim |  |  |
| `telefone_snapshot_origem` | text | sim |  |  |
| `emusys_aviso_previo_id` | integer | sim |  |  |
| `anulado` | boolean | sim |  |  |
| `anulado_motivo` | text | sim |  |  |
| `anulado_em` | timestamp with time zone | sim |  |  |
| `anulado_por` | text | sim |  |  |

## pesquisa_evasao

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `aluno_id` | integer | sim |  | alunos.id |
| `evasao_id` | integer | sim |  | movimentacoes_admin.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `aluno_nome` | text | não |  |  |
| `aluno_telefone` | text | não |  |  |
| `aluno_curso` | text | sim |  |  |
| `aluno_professor` | text | sim |  |  |
| `tempo_permanencia_meses` | integer | sim |  |  |
| `data_evasao` | date | sim |  |  |
| `motivo_cadastrado` | text | sim |  |  |
| `status` | character varying(30) | sim | 'pendente'::character varying |  |
| `enviado_em` | timestamp with time zone | sim |  |  |
| `enviado_por` | text | sim |  |  |
| `mensagem_uazapi_id` | character varying(100) | sim |  |  |
| `resposta_texto` | text | sim |  |  |
| `resposta_audio_url` | text | sim |  |  |
| `resposta_tipo` | character varying(20) | sim |  |  |
| `respondido_em` | timestamp with time zone | sim |  |  |
| `categoria_resposta` | character varying(50) | sim |  |  |
| `sentimento` | character varying(20) | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `envio_status` | text | não | 'nao_enviado'::text |  |
| `resposta_status` | text | não | 'sem_resposta'::text |  |
| `modo_teste` | boolean | não | false |  |
| `telefone_destino_snapshot` | text | sim |  |  |
| `caixa_id` | integer | sim |  | whatsapp_caixas.id |
| `executado_por_usuario_id` | integer | sim |  | usuarios.id |
| `executado_por_auth_user_id` | uuid | sim |  |  |
| `assinatura_id` | uuid | sim |  | pesquisa_evasao_assinaturas.id |
| `assinatura_nome_snapshot` | text | sim |  |  |
| `template_id` | uuid | sim |  | pesquisa_evasao_templates.id |
| `template_versao` | integer | sim |  |  |
| `mensagem_renderizada` | text | sim |  |  |
| `provider_message_id` | text | sim |  |  |
| `preview_id` | uuid | sim |  | pesquisa_evasao_previews.id |
| `idempotency_key` | uuid | sim |  | pesquisa_evasao_previews.idempotency_key |
| `envio_iniciado_em` | timestamp with time zone | sim |  |  |
| `primeira_interacao_em` | timestamp with time zone | sim |  |  |
| `ultima_interacao_em` | timestamp with time zone | sim |  |  |
| `pronta_para_revisao_em` | timestamp with time zone | sim |  |  |
| `envio_erro_sanitizado` | text | sim |  |  |
| `resposta_ingestao_versao` | text | não | 'multipartes_v2'::text |  |
| `resposta_valida` | boolean | não | false |  |
| `opt_out_em` | timestamp with time zone | sim |  |  |
| `opt_out_provider_message_id` | text | sim |  |  |
| `conteudo_novo_desde_revisao` | boolean | não | false |  |
| `mensagem_template_original_snapshot` | text | sim |  |  |
| `mensagem_editada` | boolean | não | false |  |
| `mensagem_editada_por_usuario_id` | integer | sim |  | usuarios.id |
| `mensagem_editada_por_auth_user_id` | uuid | sim |  |  |
| `mensagem_editada_em` | timestamp with time zone | sim |  |  |
| `payload_hash_original_snapshot` | text | sim |  |  |
| `payload_hash_snapshot` | text | sim |  |  |

**Únicos:**
- `pesquisa_evasao_aberta_telefone_uidx`
- `pesquisa_evasao_evasao_id_producao_uidx`
- `pesquisa_evasao_idempotency_key_uidx`
- `pesquisa_evasao_pkey`
- `pesquisa_evasao_preview_id_uidx`
- `pesquisa_evasao_teste_slot_ativo_uidx`

**Triggers:**
- `tr_updated_at_pesquisa_evasao → update_updated_at_column()`
- `trg_proteger_opt_out_pesquisa_evasao → fn_proteger_opt_out_pesquisa_evasao()`

## pesquisa_evasao_analises

> Uma linha por rodada de conversa; versoes revisadas sao imutaveis.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `pesquisa_id` | uuid | não |  | pesquisa_evasao.id |
| `versao` | integer | não |  |  |
| `texto_consolidado` | text | sim |  |  |
| `status` | text | não | 'rascunho'::text |  |
| `revisor_usuario_id` | integer | sim |  | usuarios.id |
| `revisado_em` | timestamp with time zone | sim |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |
| `primeira_mensagem_id` | uuid | sim |  | pesquisa_evasao_mensagens.id |
| `ultima_mensagem_id` | uuid | sim |  | pesquisa_evasao_mensagens.id |
| `iniciada_em` | timestamp with time zone | sim |  |  |
| `ultima_mensagem_em` | timestamp with time zone | sim |  |  |
| `encerrada_em` | timestamp with time zone | sim |  |  |
| `revisao_iniciada_por_usuario_id` | integer | sim |  | usuarios.id |
| `revisao_iniciada_em` | timestamp with time zone | sim |  |  |

**Únicos:**
- `pesquisa_evasao_analises_pesquisa_id_versao_key`
- `pesquisa_evasao_analises_pkey`

**Triggers:**
- `trg_proteger_analise_evasao_revisada → fn_proteger_analise_evasao_revisada()`

## pesquisa_evasao_assinaturas

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `usuario_id` | integer | não |  | usuarios.id |
| `nome_assinatura` | text | não |  |  |
| `cargo_assinatura` | text | não | 'Sucesso do Aluno'::text |  |
| `ativo` | boolean | não | true |  |
| `valido_desde` | timestamp with time zone | não | now() |  |
| `valido_ate` | timestamp with time zone | sim |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `pesquisa_evasao_assinaturas_pkey`
- `pesquisa_evasao_assinaturas_usuario_ativa_uidx`

## pesquisa_evasao_classificacao_categorias

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `classificacao_id` | uuid | não |  | pesquisa_evasao_classificacoes.id |
| `categoria` | text | não |  |  |

**Únicos:**
- `pesquisa_evasao_classificacao_categorias_pkey`

**Triggers:**
- `trg_pesquisa_evasao_classificacao_categorias_append_only → fn_pesquisa_evasao_c_append_only()`

## pesquisa_evasao_classificacoes

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `pesquisa_id` | uuid | não |  | pesquisa_evasao.id |
| `versao` | integer | não |  |  |
| `analise_id` | uuid | não |  | pesquisa_evasao_analises.id |
| `analise_versao_max` | integer | não |  |  |
| `relacao_motivo` | text | não |  |  |
| `justificativa` | text | não | ''::text |  |
| `sucede_classificacao_id` | uuid | sim |  | pesquisa_evasao_classificacoes.id |
| `revisor_usuario_id` | integer | não |  | usuarios.id |
| `revisor_auth_user_id` | uuid | não |  |  |
| `revisado_em` | timestamp with time zone | não | clock_timestamp() |  |

**Únicos:**
- `pesquisa_evasao_classificacoes_pesquisa_id_versao_key`
- `pesquisa_evasao_classificacoes_pkey`

**Triggers:**
- `trg_pesquisa_evasao_classificacoes_append_only → fn_pesquisa_evasao_c_append_only()`

## pesquisa_evasao_desfechos

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `pesquisa_id` | uuid | não |  | pesquisa_evasao.id |
| `classificacao_id` | uuid | não |  | pesquisa_evasao_classificacoes.id |
| `desfecho` | text | não |  |  |
| `observacao` | text | não | ''::text |  |
| `sucede_desfecho_id` | uuid | sim |  | pesquisa_evasao_desfechos.id |
| `registrado_por_usuario_id` | integer | não |  | usuarios.id |
| `registrado_por_auth_user_id` | uuid | não |  |  |
| `registrado_em` | timestamp with time zone | não | clock_timestamp() |  |

**Únicos:**
- `pesquisa_evasao_desfechos_pkey`

**Triggers:**
- `trg_pesquisa_evasao_desfechos_append_only → fn_pesquisa_evasao_c_append_only()`

## pesquisa_evasao_envios_fila

> Fila de envio dos toques da pesquisa de evasao. Grao: um toque por pesquisa. Escrita apenas por service_role e pelas RPCs SECURITY DEFINER.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `pesquisa_id` | uuid | não |  | pesquisa_evasao.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `toque` | integer | não |  |  |
| `template_id` | uuid | não |  | pesquisa_evasao_templates.id |
| `template_versao` | integer | não |  |  |
| `status` | text | não | 'pendente'::text |  |
| `agendada_para` | timestamp with time zone | não |  |  |
| `enfileirada_por_usuario_id` | integer | sim |  | usuarios.id |
| `enfileirada_em` | timestamp with time zone | não | now() |  |
| `worker_id` | uuid | sim |  |  |
| `lease_expires_at` | timestamp with time zone | sim |  |  |
| `tentativas` | integer | não | 0 |  |
| `max_tentativas` | integer | não | 3 |  |
| `ultimo_erro` | text | sim |  |  |
| `provider_message_id` | text | sim |  |  |
| `enviada_em` | timestamp with time zone | sim |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |
| `atualizado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `pesquisa_evasao_envios_fila_pesquisa_id_toque_key`
- `pesquisa_evasao_envios_fila_pkey`
- `pesquisa_evasao_envios_fila_vivo_uidx`

**Triggers:**
- `trg_pesquisa_evasao_envios_fila_touch → fn_pesquisa_evasao_envios_fila_touch()`

## pesquisa_evasao_followup_acoes

> Decisao manual terminal e auditavel do follow-up; nao envia mensagem a familia.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `pesquisa_id` | uuid | não |  | pesquisa_evasao.id |
| `acao` | text | não |  |  |
| `canal` | text | sim |  |  |
| `observacao` | text | sim |  |  |
| `operador_usuario_id` | integer | não |  | usuarios.id |
| `operador_auth_user_id` | uuid | não |  |  |
| `registrado_em` | timestamp with time zone | não | clock_timestamp() |  |
| `criado_em` | timestamp with time zone | não | clock_timestamp() |  |

**Únicos:**
- `pesquisa_evasao_followup_acoes_pesquisa_id_key`
- `pesquisa_evasao_followup_acoes_pkey`

## pesquisa_evasao_mensagens

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `pesquisa_id` | uuid | sim |  | pesquisa_evasao_analises.pesquisa_id |
| `caixa_id` | integer | não |  | whatsapp_caixas.id |
| `direcao` | text | não |  |  |
| `provider_message_id` | text | sim |  |  |
| `telefone_normalizado` | text | não |  |  |
| `tipo` | text | não |  |  |
| `texto` | text | sim |  |  |
| `audio_storage_path` | text | sim |  |  |
| `provider_created_at` | timestamp with time zone | sim |  |  |
| `recebido_em` | timestamp with time zone | não | now() |  |
| `resolution_status` | text | não | 'sem_pesquisa'::text |  |
| `substantividade` | text | não | 'indeterminado'::text |  |
| `correlation_id` | uuid | não | gen_random_uuid() |  |
| `idempotency_key` | uuid | não | gen_random_uuid() |  |
| `criado_em` | timestamp with time zone | não | now() |  |
| `analise_versao` | integer | sim |  | pesquisa_evasao_analises.versao |

**Únicos:**
- `pesquisa_evasao_mensagens_idempotency_key_key`
- `pesquisa_evasao_mensagens_pkey`
- `pesquisa_evasao_mensagens_provider_uidx`

**Triggers:**
- `trg_00_registrar_rodada_pesquisa_evasao → fn_registrar_limites_rodada_pesquisa_evasao()`
- `trg_agendar_processamento_pesquisa_evasao → fn_agendar_processamento_pesquisa_evasao()`
- `trg_aplicar_opt_out_pesquisa_evasao → fn_aplicar_opt_out_pesquisa_evasao()`
- `trg_atribuir_rodada_pesquisa_evasao → fn_atribuir_rodada_pesquisa_evasao()`
- `trg_lia_evento_pesquisa_evasao → fn_lia_evento_pesquisa_evasao()`
- `trg_pesquisa_evasao_mensagem_append_only → fn_pesquisa_evasao_mensagem_append_only()`

## pesquisa_evasao_previews

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `evasao_id` | integer | não |  | movimentacoes_admin.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `usuario_id` | integer | não |  | usuarios.id |
| `auth_user_id` | uuid | não |  |  |
| `assinatura_id` | uuid | sim |  | pesquisa_evasao_assinaturas.id |
| `template_id` | uuid | não |  | pesquisa_evasao_templates.id |
| `caixa_id` | integer | não |  | whatsapp_caixas.id |
| `modo_teste` | boolean | não |  |  |
| `destinatario_tipo` | text | não |  |  |
| `telefone_destino` | text | não |  |  |
| `mensagem_renderizada` | text | não |  |  |
| `payload_hash` | text | não |  |  |
| `idempotency_key` | uuid | não | gen_random_uuid() |  |
| `expira_em` | timestamp with time zone | não |  |  |
| `consumido_em` | timestamp with time zone | sim |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |
| `aluno_id` | integer | sim |  |  |
| `aluno_nome_snapshot` | text | sim |  |  |
| `destinatario_nome_snapshot` | text | sim |  |  |
| `publico_template_snapshot` | text | sim |  |  |
| `curso_nome_snapshot` | text | sim |  |  |
| `professor_nome_snapshot` | text | sim |  |  |
| `tempo_permanencia_meses_snapshot` | integer | sim |  |  |
| `data_evasao_snapshot` | date | sim |  |  |
| `motivo_cadastrado_snapshot` | text | sim |  |  |
| `assinatura_nome_snapshot` | text | sim |  |  |
| `template_versao` | integer | sim |  |  |
| `pesquisa_evasao_id` | uuid | sim |  | pesquisa_evasao.id |
| `envio_status_tentativa` | text | sim |  |  |
| `provider_message_id_tentativa` | text | sim |  |  |
| `envio_erro_sanitizado_tentativa` | text | sim |  |  |
| `envio_iniciado_em` | timestamp with time zone | sim |  |  |
| `envio_finalizado_em` | timestamp with time zone | sim |  |  |
| `mensagem_template_original` | text | não |  |  |
| `mensagem_editada` | boolean | não | false |  |
| `editado_por_usuario_id` | integer | sim |  | usuarios.id |
| `editado_por_auth_user_id` | uuid | sim |  |  |
| `editado_em` | timestamp with time zone | sim |  |  |
| `payload_hash_original` | text | não |  |  |

**Únicos:**
- `pesquisa_evasao_previews_id_idempotency_key_key`
- `pesquisa_evasao_previews_idempotency_key_key`
- `pesquisa_evasao_previews_pkey`

**Triggers:**
- `trg_pesquisa_evasao_preview_original_insert → fn_pesquisa_evasao_preview_original_insert()`

## pesquisa_evasao_processamento

> Fila service-only para consolidar rajadas de respostas da pesquisa de evasão.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `pesquisa_id` | uuid | não |  | pesquisa_evasao.id |
| `executar_apos` | timestamp with time zone | não |  |  |
| `motivo` | text | não |  |  |
| `tentativas` | integer | não | 0 |  |
| `locked_at` | timestamp with time zone | sim |  |  |
| `locked_by` | uuid | sim |  |  |
| `ultimo_erro` | text | sim |  |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `pesquisa_evasao_processamento_pkey`

## pesquisa_evasao_publicos_internos

> Fonte service-only e auditavel de publico interno. tipo_aluno e financeiro e nunca classifica este vinculo.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `aluno_id` | integer | não |  | alunos.id |
| `tipo` | text | não |  |  |
| `ativo` | boolean | não | true |  |
| `fonte` | text | não |  |  |
| `confirmado_por_usuario_id` | integer | não |  | usuarios.id |
| `confirmado_em` | timestamp with time zone | não |  |  |
| `audit_metadata` | jsonb | não | '{}'::jsonb |  |
| `criado_em` | timestamp with time zone | não | now() |  |
| `atualizado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `pesquisa_evasao_publicos_internos_pkey`

## pesquisa_evasao_templates

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `chave` | text | não |  |  |
| `versao` | integer | não |  |  |
| `publico` | text | não |  |  |
| `corpo` | text | não |  |  |
| `ativo` | boolean | não | false |  |
| `criado_por_usuario_id` | integer | sim |  | usuarios.id |
| `criado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `pesquisa_evasao_templates_chave_publico_ativo_uidx`
- `pesquisa_evasao_templates_chave_versao_publico_key`
- `pesquisa_evasao_templates_pkey`

## pesquisa_evasao_transcricoes

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `mensagem_id` | uuid | não |  | pesquisa_evasao_mensagens.id |
| `versao` | integer | não |  |  |
| `status` | text | não | 'pendente'::text |  |
| `texto` | text | sim |  |  |
| `erro_codigo` | text | sim |  |  |
| `modelo` | text | sim |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |
| `concluido_em` | timestamp with time zone | sim |  |  |

**Únicos:**
- `pesquisa_evasao_transcricoes_mensagem_id_versao_key`
- `pesquisa_evasao_transcricoes_pkey`

**Triggers:**
- `trg_reagendar_transcricao_pesquisa_evasao → fn_reagendar_transcricao_pesquisa_evasao()`

## pesquisas_whatsapp

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `aluno_id` | integer | não |  | alunos.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `tipo` | text | não |  |  |
| `data_matricula` | date | não |  |  |
| `remote_jid` | text | sim |  |  |
| `enviado_em` | timestamp with time zone | sim |  |  |
| `enviado_ok` | boolean | não | false |  |
| `erro_detalhes` | text | sim |  |  |
| `nota` | integer | sim |  |  |
| `respondido_em` | timestamp with time zone | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `manual` | boolean | não | false |  |
| `comentario` | text | sim |  |  |
| `status` | text | sim |  |  |
| `tentativa_envio_em` | timestamp with time zone | sim |  |  |

**Únicos:**
- `pesquisas_whatsapp_aluno_id_tipo_data_matricula_key`
- `pesquisas_whatsapp_pkey`

## radar_config

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `chave` | text | não |  |  |
| `valor` | numeric | não |  |  |
| `fabrica` | numeric | não |  |  |
| `rotulo` | text | não |  |  |
| `grupo` | text | não |  |  |
| `ordem` | integer | não |  |  |

**Únicos:**
- `radar_config_pkey`

## radar_config_historico

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `chave` | text | não |  | radar_config.chave |
| `valor_anterior` | numeric | não |  |  |
| `valor_novo` | numeric | não |  |  |
| `mudado_por` | uuid | sim |  |  |
| `mudado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `radar_config_historico_pkey`

## renovacoes_legado

> ARQUIVO read-only. Aposentada em 2026-07-01: a fonte de verdade de renovacoes passou a ser movimentacoes_admin. NAO usar em codigo novo. Contem historico legado (incl. ~44 renovacoes que so existiam aqui).

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('renovacoes_id_seq'::regclass) |  |
| `aluno_id` | integer | não |  | alunos.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `data_renovacao` | date | não | CURRENT_DATE |  |
| `data_fim_contrato_anterior` | date | sim |  |  |
| `data_inicio_novo_contrato` | date | sim |  |  |
| `data_fim_novo_contrato` | date | sim |  |  |
| `valor_parcela_anterior` | numeric(10,2) | sim |  |  |
| `valor_parcela_novo` | numeric(10,2) | sim |  |  |
| `percentual_reajuste` | numeric(5,2) | sim |  |  |
| `status` | character varying(50) | não | 'renovado'::character varying |  |
| `motivo_nao_renovacao_id` | integer | sim |  | motivos_saida.id |
| `agente` | character varying(100) | sim |  |  |
| `observacoes` | text | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `created_by` | integer | sim |  | usuarios.id |
| `professor_id` | integer | sim |  | professores.id |

**Únicos:**
- `renovacoes_pkey`

**Triggers:**
- `trg_audit → fn_audit_log()`
- `trigger_calcular_reajuste → calcular_reajuste_renovacao()`
- `update_renovacoes_updated_at → update_updated_at_column()`

## risco_evasao

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não |  |  |
| `aluno_id` | integer | não |  | alunos.id |
| `unidade_id` | uuid | sim |  | unidades.id |
| `probabilidade` | numeric(5,4) | não |  |  |
| `faixa` | text | não |  |  |
| `fatores` | jsonb | sim |  |  |
| `modelo_versao` | text | não | 'rf-v1'::text |  |
| `calculado_em` | date | não | CURRENT_DATE |  |
| `criado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `risco_evasao_aluno_id_calculado_em_modelo_versao_key`
- `risco_evasao_pkey`

## tipos_matricula

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('tipos_matricula_id_seq'::regclass) |  |
| `nome` | character varying(50) | não |  |  |
| `codigo` | character varying(20) | não |  |  |
| `entra_ticket_medio` | boolean | não |  |  |
| `conta_como_pagante` | boolean | não |  |  |
| `descricao` | text | sim |  |  |
| `ativo` | boolean | sim | true |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `entra_ltv` | boolean | sim | true |  |
| `entra_churn` | boolean | sim | true |  |

**Únicos:**
- `tipos_matricula_pkey`
- `uk_tipos_matricula_codigo`

## tipos_saida

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('tipos_saida_id_seq'::regclass) |  |
| `nome` | character varying(50) | não |  |  |
| `codigo` | character varying(20) | não |  |  |
| `descricao` | text | sim |  |  |
| `ativo` | boolean | sim | true |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `tipos_saida_pkey`
- `uk_tipos_saida_codigo`

## vw_absenteismo_aluno

> Taxa de absenteismo por aluno (matricula), calculada em tempo real a partir de aluno_presenca. Sinal #6 e #9 do health score do aluno v2. Nao usar alunos.percentual_presenca (coluna dessincronizada, sem trigger de escrita).

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `aluno_id` | integer | sim |  |  |
| `total_aulas` | bigint | sim |  |  |
| `faltas` | bigint | sim |  |  |
| `taxa_historica` | numeric | sim |  |  |
| `taxa_recente_30d` | numeric | sim |  |  |
| `tendencia` | numeric | sim |  |  |
| `ultima_presenca` | date | sim |  |  |
| `dias_sem_presenca` | integer | sim |  |  |
| `confiavel` | boolean | sim |  |  |
| `presentes` | bigint | sim |  |  |
| `faltas_nao_justificadas` | bigint | sim |  |  |
| `faltas_justificadas` | bigint | sim |  |  |
| `denominador_30d` | bigint | sim |  |  |
| `presentes_30d` | bigint | sim |  |  |
| `faltas_nao_justificadas_30d` | bigint | sim |  |  |
| `faltas_justificadas_30d` | bigint | sim |  |  |
| `dados_status` | text | sim |  |  |
| `estado_publicacao` | text | sim |  |  |
| `sincronizado_em` | timestamp with time zone | sim |  |  |
| `regra_versao` | text | sim |  |  |

## vw_absenteismo_aluno_canonica_v2

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `aluno_id` | integer | sim |  |  |
| `total_aulas` | bigint | sim |  |  |
| `faltas` | bigint | sim |  |  |
| `taxa_historica` | numeric | sim |  |  |
| `taxa_recente_30d` | numeric | sim |  |  |
| `tendencia` | numeric | sim |  |  |
| `ultima_presenca` | date | sim |  |  |
| `dias_sem_presenca` | integer | sim |  |  |
| `confiavel` | boolean | sim |  |  |
| `presentes` | bigint | sim |  |  |
| `faltas_nao_justificadas` | bigint | sim |  |  |
| `faltas_justificadas` | bigint | sim |  |  |
| `denominador_30d` | bigint | sim |  |  |
| `presentes_30d` | bigint | sim |  |  |
| `faltas_nao_justificadas_30d` | bigint | sim |  |  |
| `faltas_justificadas_30d` | bigint | sim |  |  |
| `dados_status` | text | sim |  |  |
| `estado_publicacao` | text | sim |  |  |
| `sincronizado_em` | timestamp with time zone | sim |  |  |
| `regra_versao` | text | sim |  |  |

## vw_absenteismo_aluno_legado_v1

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `aluno_id` | integer | sim |  |  |
| `total_aulas` | bigint | sim |  |  |
| `faltas` | bigint | sim |  |  |
| `taxa_historica` | numeric | sim |  |  |
| `taxa_recente_30d` | numeric | sim |  |  |
| `tendencia` | numeric | sim |  |  |
| `ultima_presenca` | date | sim |  |  |
| `dias_sem_presenca` | integer | sim |  |  |
| `confiavel` | boolean | sim |  |  |

## vw_aluno_estado_operacional_canonico

> Projecao semantica do ciclo de matricula. Somente ativa entra em bases operacionais vivas; trancada permanece separada.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade_id` | uuid | sim |  |  |
| `emusys_matricula_id` | bigint | sim |  |  |
| `emusys_aluno_id` | bigint | sim |  |  |
| `aluno_id` | integer | sim |  |  |
| `aluno_nome` | character varying(200) | sim |  |  |
| `emusys_contrato_id` | bigint | sim |  |  |
| `status_emusys` | text | sim |  |  |
| `status_emusys_bruto` | text | sim |  |  |
| `motivo_inativa` | text | sim |  |  |
| `motivo_inativa_bruto` | text | sim |  |  |
| `status_local_resolvido` | text | sim |  |  |
| `status_jornada_resolvido` | text | sim |  |  |
| `tipo_movimento_resolvido` | text | sim |  |  |
| `transicao_automatica` | boolean | sim |  |  |
| `motivo_auditoria` | text | sim |  |  |
| `trancamento_id` | bigint | sim |  |  |
| `trancamento_motivo` | text | sim |  |  |
| `trancamento_data_inicial` | date | sim |  |  |
| `trancamento_data_final` | date | sim |  |  |
| `entra_base_ativa` | boolean | sim |  |  |
| `entra_carteira_professor` | boolean | sim |  |  |
| `entra_financeiro_ativo` | boolean | sim |  |  |
| `entra_denominador_presenca` | boolean | sim |  |  |
| `entra_health_score` | boolean | sim |  |  |
| `entra_churn_atual` | boolean | sim |  |  |
| `eh_trancamento_atual` | boolean | sim |  |  |
| `eh_interrupcao_definitiva` | boolean | sim |  |  |
| `eh_contrato_concluido` | boolean | sim |  |  |
| `sincronizado_em` | timestamp with time zone | sim |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |

## vw_aluno_frequencia_canonica_v1

> Frequencia por pessoa/unidade. Deduplica eventos entre linhas locais, usa somente presente/falta confirmada no denominador e publica a incerteza do legado Emusys.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade_id` | uuid | sim |  |  |
| `pessoa_chave` | text | sim |  |  |
| `aluno_id_canonico` | integer | sim |  |  |
| `aluno_ids_locais` | integer[] | sim |  |  |
| `identidade_fonte` | text | sim |  |  |
| `identidade_confianca` | text | sim |  |  |
| `total_eventos_evidencia` | integer | sim |  |  |
| `eventos_resultado_confirmado` | integer | sim |  |  |
| `presencas_confirmadas` | integer | sim |  |  |
| `faltas_confirmadas` | integer | sim |  |  |
| `faltas_provaveis` | integer | sim |  |  |
| `chamadas_indeterminadas` | integer | sim |  |  |
| `eventos_excluidos` | integer | sim |  |  |
| `conflitos` | integer | sim |  |  |
| `data_ultima_aula_confirmada` | date | sim |  |  |
| `eventos_confirmados_60d` | integer | sim |  |  |
| `presencas_confirmadas_60d` | integer | sim |  |  |
| `eventos_confirmados_30d` | integer | sim |  |  |
| `presencas_confirmadas_30d` | integer | sim |  |  |
| `eventos_incertos_60d` | integer | sim |  |  |
| `eventos_incertos_30d` | integer | sim |  |  |
| `taxa_presenca_geral` | numeric | sim |  |  |
| `taxa_presenca_60d` | numeric | sim |  |  |
| `taxa_presenca_30d` | numeric | sim |  |  |
| `cobertura_resultado_confirmado` | numeric | sim |  |  |
| `confianca_presenca` | text | sim |  |  |
| `regra_versao` | text | sim |  |  |
| `faltas_justificadas` | integer | sim |  |  |
| `dados_status` | text | sim |  |  |
| `estado_publicacao` | text | sim |  |  |
| `sincronizado_em` | timestamp with time zone | sim |  |  |

## vw_aluno_identidade_unidade_canonica

> Uma pessoa operacional por unidade. Prioriza ID Emusys; fallback local fica explicitamente com baixa confianca.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade_id` | uuid | sim |  |  |
| `pessoa_chave` | text | sim |  |  |
| `emusys_aluno_id` | bigint | sim |  |  |
| `aluno_id_canonico` | integer | sim |  |  |
| `aluno_ids_locais` | integer[] | sim |  |  |
| `linhas_locais` | integer | sim |  |  |
| `linhas_ativas` | integer | sim |  |  |
| `possui_multiplas_linhas_ativas` | boolean | sim |  |  |
| `nome` | character varying(200) | sim |  |  |
| `data_nascimento` | date | sim |  |  |
| `status` | character varying(20) | sim |  |  |
| `arquivado_em` | timestamp with time zone | sim |  |  |
| `telefone` | character varying(20) | sim |  |  |
| `whatsapp` | character varying(20) | sim |  |  |
| `email` | character varying(150) | sim |  |  |
| `responsavel_nome` | character varying(255) | sim |  |  |
| `responsavel_telefone` | character varying(50) | sim |  |  |
| `foto_url` | text | sim |  |  |
| `identidade_fonte` | text | sim |  |  |
| `identidade_confianca` | text | sim |  |  |
| `identidade_atualizada_em` | timestamp with time zone | sim |  |  |

## vw_aluno_pessoa_chave

> Fonte unica da identidade de pessoa. Comparar SEMPRE junto com unidade_id: 91 emusys_student_id se repetem entre unidades com nomes diferentes.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `aluno_id` | integer | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `pessoa_chave` | text | sim |  |  |

## vw_aluno_presenca_conciliacao_operacional

> Fila derivada de ausencias cobertas por politica com revisao posterior. Grao aluno/aula.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `aluno_presenca_id` | uuid | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `unidade_nome` | character varying(100) | sim |  |  |
| `aluno_id` | integer | sim |  |  |
| `aluno_nome` | character varying(200) | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `professor_nome` | character varying(100) | sim |  |  |
| `aula_emusys_id` | integer | sim |  |  |
| `aula_emusys_evento_id` | integer | sim |  |  |
| `data_aula` | date | sim |  |  |
| `horario_aula` | time without time zone | sim |  |  |
| `data_hora_inicio` | timestamp with time zone | sim |  |  |
| `curso_nome` | character varying(100) | sim |  |  |
| `turma_nome` | character varying(100) | sim |  |  |
| `estado_emusys_bruto` | text | sim |  |  |
| `resultado_pedagogico` | text | sim |  |  |
| `politica_confiabilidade_id` | uuid | sim |  |  |
| `revisao_operacional_status` | text | sim |  |  |
| `revisao_motivo` | text | sim |  |  |
| `revisado_por_usuario_id` | integer | sim |  |  |
| `revisado_em` | timestamp with time zone | sim |  |  |

## vw_aluno_presenca_semantica_v1

> View canonica da presenca (semantica v1.4). A CTE `evidencia` e NOT MATERIALIZED explicito desde 28/08/2026 -- HONESTIDADE: isso NAO mudou o desempenho (medido alternado: 295ms vs 289ms; a CTE tem referencia UNICA e o planner ja a inlinava). O valor da marca e DEFENSIVO: se alguem adicionar uma segunda referencia a CTE, o default materializaria e criaria o penhasco de custo; o explicito impede. O custo residual (~290ms por consulta filtrada) vem da FUNCAO DE JANELA dentro de `evidencia` (bool_or OVER PARTITION BY aula_emusys_id): predicado nao desce por baixo de janela, entao toda leitura varre aluno_presenca inteira. Mexer nisso muda a SEMANTICA compartilhada (LA Teacher, Fabio, Sol, health-score) -- so com acordo entre os times. A troca de 28/08 foi provada inocua por hash md5 das 52k linhas na mesma transacao.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `aluno_presenca_id` | uuid | sim |  |  |
| `aluno_id` | integer | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `aula_emusys_id` | integer | sim |  |  |
| `aula_emusys_evento_id` | integer | sim |  |  |
| `data_aula` | date | sim |  |  |
| `horario_aula` | time without time zone | sim |  |  |
| `data_hora_inicio` | timestamp with time zone | sim |  |  |
| `curso_nome` | character varying(100) | sim |  |  |
| `turma_nome` | character varying(100) | sim |  |  |
| `aula_categoria` | character varying(30) | sim |  |  |
| `aula_tipo` | character varying(30) | sim |  |  |
| `estado_origem` | text | sim |  |  |
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
| `respondido_em_confiavel` | boolean | sim |  |  |
| `possui_conflito` | boolean | sim |  |  |
| `regra_versao` | text | sim |  |  |
| `estado_emusys_bruto` | text | sim |  |  |
| `sincronizado_emusys_em` | timestamp with time zone | sim |  |  |
| `professor_presenca_emusys` | text | sim |  |  |
| `evidencia_registrada_em` | timestamp with time zone | sim |  |  |
| `politica_confiabilidade_id` | uuid | sim |  |  |
| `fundamento_confianca` | text | sim |  |  |
| `revisao_operacional_exigida` | boolean | sim |  |  |
| `revisao_operacional_status` | text | sim |  |  |
| `status_presenca` | text | sim |  |  |

## vw_aluno_sucesso_lista

> Lista viva do Sucesso do Aluno: somente estado operacional ativo da camada canonica v1.3.1.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | sim |  |  |
| `nome` | character varying(200) | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `unidade_codigo` | character varying(20) | sim |  |  |
| `unidade_nome` | character varying(100) | sim |  |  |
| `professor_atual_id` | integer | sim |  |  |
| `professor_nome` | character varying(100) | sim |  |  |
| `curso_id` | integer | sim |  |  |
| `curso_nome` | character varying(100) | sim |  |  |
| `tempo_permanencia_meses` | integer | sim |  |  |
| `status_pagamento` | character varying(20) | sim |  |  |
| `valor_parcela` | numeric(10,2) | sim |  |  |
| `percentual_presenca` | integer | sim |  |  |
| `data_matricula` | date | sim |  |  |
| `dia_aula` | character varying(20) | sim |  |  |
| `horario_aula` | time without time zone | sim |  |  |
| `modalidade` | character varying(20) | sim |  |  |
| `status` | character varying(20) | sim |  |  |
| `fase_jornada` | text | sim |  |  |
| `health_score_numerico` | integer | sim |  |  |
| `health_status` | character varying(10) | sim |  |  |
| `health_score_updated_at` | timestamp with time zone | sim |  |  |
| `ultimo_feedback` | character varying(20) | sim |  |  |
| `ultimo_feedback_obs` | text | sim |  |  |
| `ultimo_feedback_data` | timestamp with time zone | sim |  |  |
| `ultimo_feedback_professor_id` | integer | sim |  |  |
| `total_acoes` | integer | sim |  |  |
| `metas_ativas` | integer | sim |  |  |
| `responsavel_nome` | character varying(255) | sim |  |  |
| `responsavel_telefone` | character varying(50) | sim |  |  |
| `whatsapp` | character varying(20) | sim |  |  |
| `foto_url` | text | sim |  |  |
| `dias_sem_presenca` | integer | sim |  |  |

## vw_aluno_sucesso_resumo

> KPIs resumidos de Sucesso do Cliente por unidade

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade_id` | uuid | sim |  |  |
| `unidade_codigo` | character varying(20) | sim |  |  |
| `unidade_nome` | character varying(100) | sim |  |  |
| `total_alunos` | integer | sim |  |  |
| `saudaveis` | integer | sim |  |  |
| `atencao` | integer | sim |  |  |
| `criticos` | integer | sim |  |  |
| `sem_score` | integer | sim |  |  |
| `onboarding` | integer | sim |  |  |
| `consolidacao` | integer | sim |  |  |
| `encantamento` | integer | sim |  |  |
| `renovacao` | integer | sim |  |  |
| `pagamento_em_dia` | integer | sim |  |  |
| `pagamento_atrasado` | integer | sim |  |  |
| `pagamento_inadimplente` | integer | sim |  |  |
| `feedback_verde` | integer | sim |  |  |
| `feedback_amarelo` | integer | sim |  |  |
| `feedback_vermelho` | integer | sim |  |  |
| `sem_feedback` | integer | sim |  |  |
| `media_tempo_permanencia` | numeric | sim |  |  |
| `ticket_medio` | numeric | sim |  |  |
| `health_score_medio` | numeric | sim |  |  |
| `presenca_media` | numeric | sim |  |  |

## vw_alunos_ativos

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | sim |  |  |
| `nome` | character varying(200) | sim |  |  |
| `classificacao` | character varying(4) | sim |  |  |
| `idade_atual` | integer | sim |  |  |
| `unidade` | character varying(100) | sim |  |  |
| `unidade_codigo` | character varying(20) | sim |  |  |
| `professor` | character varying(100) | sim |  |  |
| `curso` | character varying(100) | sim |  |  |
| `tipo_matricula` | character varying(50) | sim |  |  |
| `entra_ticket_medio` | boolean | sim |  |  |
| `conta_como_pagante` | boolean | sim |  |  |
| `valor_parcela` | numeric(10,2) | sim |  |  |
| `tempo_permanencia_meses` | integer | sim |  |  |
| `data_matricula` | date | sim |  |  |
| `data_fim_contrato` | date | sim |  |  |
| `status` | character varying(20) | sim |  |  |

## vw_alunos_estado_operacional_v131

> Projecao viva v1.3.1 otimizada: matricula exata por indice e aluno_id apenas como fallback.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `aluno_id` | integer | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `emusys_matricula_id` | text | sim |  |  |
| `raw_encontrado` | boolean | sim |  |  |
| `status_emusys` | text | sim |  |  |
| `status_local_resolvido` | text | sim |  |  |
| `status_local_legado` | character varying(20) | sim |  |  |
| `status_operacional` | text | sim |  |  |
| `motivo_inativa` | text | sim |  |  |
| `motivo_inativa_bruto` | text | sim |  |  |
| `tipo_movimento_resolvido` | text | sim |  |  |
| `motivo_auditoria` | text | sim |  |  |
| `entra_base_ativa` | boolean | sim |  |  |
| `entra_carteira_professor` | boolean | sim |  |  |
| `entra_financeiro_ativo` | boolean | sim |  |  |
| `entra_denominador_presenca` | boolean | sim |  |  |
| `entra_health_score` | boolean | sim |  |  |
| `entra_churn_atual` | boolean | sim |  |  |
| `eh_trancamento_atual` | boolean | sim |  |  |
| `eh_interrupcao_definitiva` | boolean | sim |  |  |
| `eh_contrato_concluido` | boolean | sim |  |  |
| `trancamento_id` | bigint | sim |  |  |
| `trancamento_motivo` | text | sim |  |  |
| `trancamento_data_inicial` | date | sim |  |  |
| `trancamento_data_final` | date | sim |  |  |
| `fonte_estado` | text | sim |  |  |
| `sincronizado_em` | timestamp with time zone | sim |  |  |

## vw_alunos_sem_fatura_mes

> Replica a tela "Alunos com aula mas sem fatura por mes" do Emusys: contrato que cobre a competencia e nao tem MENSALIDADE emitida nela. Tres competencias (anterior/atual/seguinte). Exclui isento (valor 0 E sem parcelas), trancado e atividade extra; inclui quem ja saiu. Paridade conferida contra a tela em 15/08/2026 (Barra, ago): 13 de 13, sem sobra.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade_id` | uuid | sim |  |  |
| `unidade_nome` | character varying(100) | sim |  |  |
| `aluno_id` | integer | sim |  |  |
| `aluno_nome` | character varying(200) | sim |  |  |
| `curso_nome` | character varying(100) | sim |  |  |
| `emusys_matricula_id` | bigint | sim |  |  |
| `emusys_matricula_disciplina_id` | bigint | sim |  |  |
| `competencia` | date | sim |  |  |
| `data_primeira_aula` | date | sim |  |  |
| `data_ultima_aula` | date | sim |  |  |
| `status_matricula` | text | sim |  |  |
| `nr_faturas` | integer | sim |  |  |
| `valor_parcela` | numeric(10,2) | sim |  |  |
| `telefone` | character varying(20) | sim |  |  |
| `whatsapp` | character varying(20) | sim |  |  |
| `ultima_sincronizacao_emusys` | timestamp with time zone | sim |  |  |
| `data_primeira_fatura` | date | sim |  |  |
| `venc_ultima_fatura` | date | sim |  |  |
| `dias_ate_venc_fatura` | integer | sim |  |  |

## vw_contagem_alunos

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade` | character varying(100) | sim |  |  |
| `unidade_codigo` | character varying(20) | sim |  |  |
| `classificacao` | character varying(4) | sim |  |  |
| `status` | character varying(20) | sim |  |  |
| `total` | bigint | sim |  |  |
| `pagantes` | bigint | sim |  |  |
| `ticket_medio` | numeric | sim |  |  |
| `tempo_medio_meses` | numeric | sim |  |  |

## vw_distribuicao_permanencia

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `faixa` | text | sim |  |  |
| `quantidade` | bigint | sim |  |  |
| `percentual` | numeric | sim |  |  |

## vw_evasao_por_motivo

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade` | character varying(100) | sim |  |  |
| `motivo` | character varying | sim |  |  |
| `quantidade` | bigint | sim |  |  |
| `percentual` | numeric | sim |  |  |

## vw_evasao_por_tipo

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade` | character varying(100) | sim |  |  |
| `tipo_saida` | character varying | sim |  |  |
| `quantidade` | bigint | sim |  |  |
| `percentual` | numeric | sim |  |  |

## vw_evasoes_motivos

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `motivo_categoria` | character varying(30) | sim |  |  |
| `unidade` | character varying(100) | sim |  |  |
| `quantidade` | bigint | sim |  |  |
| `mrr_perdido` | numeric | sim |  |  |
| `percentual` | numeric | sim |  |  |

## vw_evasoes_professores

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade` | character varying | sim |  |  |
| `professor` | character varying | sim |  |  |
| `total_evasoes` | bigint | sim |  |  |
| `mrr_perdido` | numeric | sim |  |  |
| `ticket_medio` | numeric | sim |  |  |
| `motivo_principal` | character varying | sim |  |  |

## vw_evasoes_resumo

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `competencia` | date | sim |  |  |
| `unidade` | character varying(100) | sim |  |  |
| `total_evasoes` | bigint | sim |  |  |
| `interrompidos` | bigint | sim |  |  |
| `nao_renovacoes` | bigint | sim |  |  |
| `mrr_perdido` | numeric | sim |  |  |
| `ticket_medio_evasao` | numeric | sim |  |  |
| `motivo_financeiro` | bigint | sim |  |  |
| `motivo_horario` | bigint | sim |  |  |
| `motivo_mudanca` | bigint | sim |  |  |
| `motivo_desinteresse` | bigint | sim |  |  |
| `motivo_inadimplencia` | bigint | sim |  |  |

## vw_evolucao_alunos

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade` | character varying(100) | sim |  |  |
| `ano_mes` | text | sim |  |  |
| `entradas` | bigint | sim |  |  |
| `saidas` | bigint | sim |  |  |
| `saldo` | bigint | sim |  |  |

## vw_farmer_aniversariantes_hoje

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `aluno_id` | integer | sim |  |  |
| `aluno_nome` | character varying(200) | sim |  |  |
| `whatsapp` | character varying(20) | sim |  |  |
| `data_nascimento` | date | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `idade` | integer | sim |  |  |
| `classificacao` | character varying(4) | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `professor_nome` | character varying(100) | sim |  |  |
| `instrumento` | character varying(100) | sim |  |  |

## vw_farmer_checklist_alertas

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `checklist_id` | uuid | sim |  |  |
| `titulo` | character varying | sim |  |  |
| `descricao` | text | sim |  |  |
| `data_prazo` | date | sim |  |  |
| `prioridade` | character varying | sim |  |  |
| `alerta_dias_antes` | integer | sim |  |  |
| `lembrete_whatsapp` | boolean | sim |  |  |
| `colaborador_id` | integer | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `colaborador_nome` | character varying(200) | sim |  |  |
| `colaborador_apelido` | character varying(50) | sim |  |  |
| `colaborador_whatsapp` | character varying(20) | sim |  |  |
| `total_items` | bigint | sim |  |  |
| `items_concluidos` | bigint | sim |  |  |
| `percentual_progresso` | numeric | sim |  |  |
| `dias_restantes` | integer | sim |  |  |
| `urgencia` | text | sim |  |  |

## vw_farmer_inadimplentes

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `aluno_id` | integer | sim |  |  |
| `aluno_nome` | character varying(200) | sim |  |  |
| `whatsapp` | character varying(20) | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `valor_parcela` | numeric(10,2) | sim |  |  |
| `status_pagamento` | character varying(20) | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `professor_nome` | character varying(100) | sim |  |  |
| `instrumento` | character varying(100) | sim |  |  |
| `dias_atraso` | integer | sim |  |  |

## vw_farmer_novos_matriculados

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `aluno_id` | integer | sim |  |  |
| `aluno_nome` | character varying(200) | sim |  |  |
| `whatsapp` | character varying(20) | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `data_matricula` | date | sim |  |  |
| `valor_parcela` | numeric(10,2) | sim |  |  |
| `classificacao` | character varying(4) | sim |  |  |
| `idade` | integer | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `professor_nome` | character varying(100) | sim |  |  |
| `instrumento` | character varying(100) | sim |  |  |
| `dia_aula` | character varying(20) | sim |  |  |
| `horario_aula` | time without time zone | sim |  |  |

## vw_farmer_renovacoes_proximas

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `aluno_id` | integer | sim |  |  |
| `aluno_nome` | character varying(200) | sim |  |  |
| `whatsapp` | character varying(20) | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `data_fim_contrato` | date | sim |  |  |
| `valor_parcela` | numeric(10,2) | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `professor_nome` | character varying(100) | sim |  |  |
| `instrumento` | character varying(100) | sim |  |  |
| `dias_para_vencer` | integer | sim |  |  |
| `urgencia` | text | sim |  |  |

## vw_farmer_resumo_alertas

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade_id` | uuid | sim |  |  |
| `unidade_nome` | character varying(100) | sim |  |  |
| `aniversariantes_hoje` | bigint | sim |  |  |
| `inadimplentes` | bigint | sim |  |  |
| `novos_matriculados` | bigint | sim |  |  |
| `renovacoes_vencidas` | bigint | sim |  |  |
| `renovacoes_urgentes` | bigint | sim |  |  |
| `renovacoes_atencao` | bigint | sim |  |  |

## vw_jornada_aluno_atual

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `unidade_nome` | character varying(100) | sim |  |  |
| `aluno_id` | integer | sim |  |  |
| `aluno_nome` | character varying(200) | sim |  |  |
| `telefone` | character varying(20) | sim |  |  |
| `whatsapp` | character varying(20) | sim |  |  |
| `responsavel_nome` | character varying(255) | sim |  |  |
| `responsavel_telefone` | character varying(50) | sim |  |  |
| `emusys_aluno_id` | bigint | sim |  |  |
| `emusys_matricula_id` | bigint | sim |  |  |
| `emusys_matricula_disciplina_id` | bigint | sim |  |  |
| `emusys_disciplina_id` | bigint | sim |  |  |
| `curso_id` | integer | sim |  |  |
| `curso_nome` | character varying | sim |  |  |
| `curso_nome_emusys` | text | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `professor_nome` | character varying | sim |  |  |
| `emusys_professor_id` | bigint | sim |  |  |
| `professor_nome_emusys` | text | sim |  |  |
| `status_matricula` | text | sim |  |  |
| `qtd_contratos` | integer | sim |  |  |
| `nr_aulas_contratadas` | integer | sim |  |  |
| `nr_aulas_passadas` | integer | sim |  |  |
| `nr_aulas_futuras` | integer | sim |  |  |
| `proxima_aula_numero` | integer | sim |  |  |
| `percentual_jornada` | numeric(8,2) | sim |  |  |
| `jornada_label` | text | sim |  |  |
| `data_primeira_aula` | timestamp with time zone | sim |  |  |
| `data_ultima_aula` | timestamp with time zone | sim |  |  |
| `dia_semana` | text | sim |  |  |
| `horario` | text | sim |  |  |
| `fonte_ultima_atualizacao` | text | sim |  |  |
| `ultima_sincronizacao_emusys` | timestamp with time zone | sim |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |

## vw_jornada_aluno_com_presenca

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `unidade_nome` | character varying(100) | sim |  |  |
| `aluno_id` | integer | sim |  |  |
| `aluno_nome` | character varying(200) | sim |  |  |
| `telefone` | character varying(20) | sim |  |  |
| `whatsapp` | character varying(20) | sim |  |  |
| `responsavel_nome` | character varying(255) | sim |  |  |
| `responsavel_telefone` | character varying(50) | sim |  |  |
| `emusys_aluno_id` | bigint | sim |  |  |
| `emusys_matricula_id` | bigint | sim |  |  |
| `emusys_matricula_disciplina_id` | bigint | sim |  |  |
| `emusys_disciplina_id` | bigint | sim |  |  |
| `curso_id` | integer | sim |  |  |
| `curso_nome` | character varying | sim |  |  |
| `curso_nome_emusys` | text | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `professor_nome` | character varying | sim |  |  |
| `emusys_professor_id` | bigint | sim |  |  |
| `professor_nome_emusys` | text | sim |  |  |
| `status_matricula` | text | sim |  |  |
| `qtd_contratos` | integer | sim |  |  |
| `nr_aulas_contratadas` | integer | sim |  |  |
| `nr_aulas_passadas` | integer | sim |  |  |
| `nr_aulas_futuras` | integer | sim |  |  |
| `proxima_aula_numero` | integer | sim |  |  |
| `percentual_jornada` | numeric(8,2) | sim |  |  |
| `jornada_label` | text | sim |  |  |
| `data_primeira_aula` | timestamp with time zone | sim |  |  |
| `data_ultima_aula` | timestamp with time zone | sim |  |  |
| `dia_semana` | text | sim |  |  |
| `horario` | text | sim |  |  |
| `fonte_ultima_atualizacao` | text | sim |  |  |
| `ultima_sincronizacao_emusys` | timestamp with time zone | sim |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |
| `presencas` | integer | sim |  |  |
| `faltas` | integer | sim |  |  |
| `aulas_com_presenca_registrada` | integer | sim |  |  |
| `percentual_presenca_contrato` | numeric | sim |  |  |
| `ultima_aula_registrada` | date | sim |  |  |

## vw_jornada_aluno_trancado

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `unidade_nome` | character varying(100) | sim |  |  |
| `aluno_id` | integer | sim |  |  |
| `aluno_nome` | character varying(200) | sim |  |  |
| `telefone` | character varying(20) | sim |  |  |
| `whatsapp` | character varying(20) | sim |  |  |
| `responsavel_nome` | character varying(255) | sim |  |  |
| `responsavel_telefone` | character varying(50) | sim |  |  |
| `emusys_aluno_id` | bigint | sim |  |  |
| `emusys_matricula_id` | bigint | sim |  |  |
| `emusys_matricula_disciplina_id` | bigint | sim |  |  |
| `emusys_disciplina_id` | bigint | sim |  |  |
| `curso_id` | integer | sim |  |  |
| `curso_nome` | character varying | sim |  |  |
| `curso_nome_emusys` | text | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `professor_nome` | character varying | sim |  |  |
| `emusys_professor_id` | bigint | sim |  |  |
| `professor_nome_emusys` | text | sim |  |  |
| `status_matricula` | text | sim |  |  |
| `qtd_contratos` | integer | sim |  |  |
| `nr_aulas_contratadas` | integer | sim |  |  |
| `nr_aulas_passadas` | integer | sim |  |  |
| `nr_aulas_futuras` | integer | sim |  |  |
| `proxima_aula_numero` | integer | sim |  |  |
| `percentual_jornada` | numeric(8,2) | sim |  |  |
| `jornada_label` | text | sim |  |  |
| `data_primeira_aula` | timestamp with time zone | sim |  |  |
| `data_ultima_aula` | timestamp with time zone | sim |  |  |
| `dia_semana` | text | sim |  |  |
| `horario` | text | sim |  |  |
| `fonte_ultima_atualizacao` | text | sim |  |  |
| `ultima_sincronizacao_emusys` | timestamp with time zone | sim |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |

## vw_jornada_aluno_trancado_com_presenca

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `unidade_nome` | character varying(100) | sim |  |  |
| `aluno_id` | integer | sim |  |  |
| `aluno_nome` | character varying(200) | sim |  |  |
| `telefone` | character varying(20) | sim |  |  |
| `whatsapp` | character varying(20) | sim |  |  |
| `responsavel_nome` | character varying(255) | sim |  |  |
| `responsavel_telefone` | character varying(50) | sim |  |  |
| `emusys_aluno_id` | bigint | sim |  |  |
| `emusys_matricula_id` | bigint | sim |  |  |
| `emusys_matricula_disciplina_id` | bigint | sim |  |  |
| `emusys_disciplina_id` | bigint | sim |  |  |
| `curso_id` | integer | sim |  |  |
| `curso_nome` | character varying | sim |  |  |
| `curso_nome_emusys` | text | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `professor_nome` | character varying | sim |  |  |
| `emusys_professor_id` | bigint | sim |  |  |
| `professor_nome_emusys` | text | sim |  |  |
| `status_matricula` | text | sim |  |  |
| `qtd_contratos` | integer | sim |  |  |
| `nr_aulas_contratadas` | integer | sim |  |  |
| `nr_aulas_passadas` | integer | sim |  |  |
| `nr_aulas_futuras` | integer | sim |  |  |
| `proxima_aula_numero` | integer | sim |  |  |
| `percentual_jornada` | numeric(8,2) | sim |  |  |
| `jornada_label` | text | sim |  |  |
| `data_primeira_aula` | timestamp with time zone | sim |  |  |
| `data_ultima_aula` | timestamp with time zone | sim |  |  |
| `dia_semana` | text | sim |  |  |
| `horario` | text | sim |  |  |
| `fonte_ultima_atualizacao` | text | sim |  |  |
| `ultima_sincronizacao_emusys` | timestamp with time zone | sim |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |
| `presencas` | integer | sim |  |  |
| `faltas` | integer | sim |  |  |
| `aulas_com_presenca_registrada` | integer | sim |  |  |
| `percentual_presenca_contrato` | numeric | sim |  |  |
| `ultima_aula_registrada` | date | sim |  |  |

## vw_jornada_marcos

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `unidade_nome` | character varying(100) | sim |  |  |
| `aluno_id` | integer | sim |  |  |
| `aluno_nome` | character varying(200) | sim |  |  |
| `telefone` | character varying(20) | sim |  |  |
| `whatsapp` | character varying(20) | sim |  |  |
| `responsavel_nome` | character varying(255) | sim |  |  |
| `responsavel_telefone` | character varying(50) | sim |  |  |
| `emusys_aluno_id` | bigint | sim |  |  |
| `emusys_matricula_id` | bigint | sim |  |  |
| `emusys_matricula_disciplina_id` | bigint | sim |  |  |
| `emusys_disciplina_id` | bigint | sim |  |  |
| `curso_id` | integer | sim |  |  |
| `curso_nome` | character varying | sim |  |  |
| `curso_nome_emusys` | text | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `professor_nome` | character varying | sim |  |  |
| `emusys_professor_id` | bigint | sim |  |  |
| `professor_nome_emusys` | text | sim |  |  |
| `status_matricula` | text | sim |  |  |
| `qtd_contratos` | integer | sim |  |  |
| `nr_aulas_contratadas` | integer | sim |  |  |
| `nr_aulas_passadas` | integer | sim |  |  |
| `nr_aulas_futuras` | integer | sim |  |  |
| `proxima_aula_numero` | integer | sim |  |  |
| `percentual_jornada` | numeric(8,2) | sim |  |  |
| `jornada_label` | text | sim |  |  |
| `data_primeira_aula` | timestamp with time zone | sim |  |  |
| `data_ultima_aula` | timestamp with time zone | sim |  |  |
| `dia_semana` | text | sim |  |  |
| `horario` | text | sim |  |  |
| `fonte_ultima_atualizacao` | text | sim |  |  |
| `ultima_sincronizacao_emusys` | timestamp with time zone | sim |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |
| `presencas` | integer | sim |  |  |
| `faltas` | integer | sim |  |  |
| `aulas_com_presenca_registrada` | integer | sim |  |  |
| `percentual_presenca_contrato` | numeric | sim |  |  |
| `ultima_aula_registrada` | date | sim |  |  |
| `tipo_marco` | text | sim |  |  |

## vw_jornada_professor_atual

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `unidade_nome` | character varying(100) | sim |  |  |
| `aluno_id` | integer | sim |  |  |
| `aluno_nome` | character varying(200) | sim |  |  |
| `telefone` | character varying(20) | sim |  |  |
| `whatsapp` | character varying(20) | sim |  |  |
| `responsavel_nome` | character varying(255) | sim |  |  |
| `responsavel_telefone` | character varying(50) | sim |  |  |
| `emusys_aluno_id` | bigint | sim |  |  |
| `emusys_matricula_id` | bigint | sim |  |  |
| `emusys_matricula_disciplina_id` | bigint | sim |  |  |
| `emusys_disciplina_id` | bigint | sim |  |  |
| `curso_id` | integer | sim |  |  |
| `curso_nome` | character varying | sim |  |  |
| `curso_nome_emusys` | text | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `professor_nome` | character varying | sim |  |  |
| `emusys_professor_id` | bigint | sim |  |  |
| `professor_nome_emusys` | text | sim |  |  |
| `status_matricula` | text | sim |  |  |
| `qtd_contratos` | integer | sim |  |  |
| `nr_aulas_contratadas` | integer | sim |  |  |
| `nr_aulas_passadas` | integer | sim |  |  |
| `nr_aulas_futuras` | integer | sim |  |  |
| `proxima_aula_numero` | integer | sim |  |  |
| `percentual_jornada` | numeric(8,2) | sim |  |  |
| `jornada_label` | text | sim |  |  |
| `data_primeira_aula` | timestamp with time zone | sim |  |  |
| `data_ultima_aula` | timestamp with time zone | sim |  |  |
| `dia_semana` | text | sim |  |  |
| `horario` | text | sim |  |  |
| `fonte_ultima_atualizacao` | text | sim |  |  |
| `ultima_sincronizacao_emusys` | timestamp with time zone | sim |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |
| `presencas` | integer | sim |  |  |
| `faltas` | integer | sim |  |  |
| `aulas_com_presenca_registrada` | integer | sim |  |  |
| `percentual_presenca_contrato` | numeric | sim |  |  |
| `ultima_aula_registrada` | date | sim |  |  |

## vw_jornada_professor_trancado

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `unidade_nome` | character varying(100) | sim |  |  |
| `aluno_id` | integer | sim |  |  |
| `aluno_nome` | character varying(200) | sim |  |  |
| `telefone` | character varying(20) | sim |  |  |
| `whatsapp` | character varying(20) | sim |  |  |
| `responsavel_nome` | character varying(255) | sim |  |  |
| `responsavel_telefone` | character varying(50) | sim |  |  |
| `emusys_aluno_id` | bigint | sim |  |  |
| `emusys_matricula_id` | bigint | sim |  |  |
| `emusys_matricula_disciplina_id` | bigint | sim |  |  |
| `emusys_disciplina_id` | bigint | sim |  |  |
| `curso_id` | integer | sim |  |  |
| `curso_nome` | character varying | sim |  |  |
| `curso_nome_emusys` | text | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `professor_nome` | character varying | sim |  |  |
| `emusys_professor_id` | bigint | sim |  |  |
| `professor_nome_emusys` | text | sim |  |  |
| `status_matricula` | text | sim |  |  |
| `qtd_contratos` | integer | sim |  |  |
| `nr_aulas_contratadas` | integer | sim |  |  |
| `nr_aulas_passadas` | integer | sim |  |  |
| `nr_aulas_futuras` | integer | sim |  |  |
| `proxima_aula_numero` | integer | sim |  |  |
| `percentual_jornada` | numeric(8,2) | sim |  |  |
| `jornada_label` | text | sim |  |  |
| `data_primeira_aula` | timestamp with time zone | sim |  |  |
| `data_ultima_aula` | timestamp with time zone | sim |  |  |
| `dia_semana` | text | sim |  |  |
| `horario` | text | sim |  |  |
| `fonte_ultima_atualizacao` | text | sim |  |  |
| `ultima_sincronizacao_emusys` | timestamp with time zone | sim |  |  |
| `updated_at` | timestamp with time zone | sim |  |  |
| `presencas` | integer | sim |  |  |
| `faltas` | integer | sim |  |  |
| `aulas_com_presenca_registrada` | integer | sim |  |  |
| `percentual_presenca_contrato` | numeric | sim |  |  |
| `ultima_aula_registrada` | date | sim |  |  |

## vw_kpis_retencao_mensal

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade_id` | uuid | sim |  |  |
| `unidade_nome` | character varying(100) | sim |  |  |
| `ano` | integer | sim |  |  |
| `mes` | integer | sim |  |  |
| `total_evasoes` | integer | sim |  |  |
| `evasoes_interrompidas` | integer | sim |  |  |
| `avisos_previos` | integer | sim |  |  |
| `transferencias` | integer | sim |  |  |
| `taxa_evasao` | numeric | sim |  |  |
| `mrr_perdido` | numeric(12,2) | sim |  |  |
| `renovacoes_previstas` | integer | sim |  |  |
| `renovacoes_realizadas` | integer | sim |  |  |
| `nao_renovacoes` | integer | sim |  |  |
| `renovacoes_pendentes` | integer | sim |  |  |
| `renovacoes_atrasadas` | integer | sim |  |  |
| `taxa_renovacao` | numeric | sim |  |  |
| `taxa_nao_renovacao` | numeric | sim |  |  |

## vw_ltv_por_categoria

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `categoria_saida` | character varying(100) | sim |  |  |
| `total_alunos` | bigint | sim |  |  |
| `ltv_meses` | numeric | sim |  |  |

## vw_ltv_por_unidade

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade` | character varying(100) | sim |  |  |
| `total_alunos` | bigint | sim |  |  |
| `soma_meses` | numeric | sim |  |  |
| `ltv_meses` | numeric | sim |  |  |
| `ltv_anos` | numeric | sim |  |  |

## vw_ltv_rede

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `total_alunos` | bigint | sim |  |  |
| `soma_meses` | numeric | sim |  |  |
| `ltv_meses` | numeric | sim |  |  |
| `ltv_anos` | numeric | sim |  |  |

## vw_ltv_unidade

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade` | character varying(100) | sim |  |  |
| `unidade_codigo` | character varying(20) | sim |  |  |
| `total_alunos_saidos` | bigint | sim |  |  |
| `tempo_medio_meses` | numeric | sim |  |  |
| `ticket_medio` | numeric | sim |  |  |
| `ltv_medio` | numeric | sim |  |  |

## vw_movimentacoes_mensal

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade` | character varying(100) | sim |  |  |
| `ano` | integer | sim |  |  |
| `mes` | integer | sim |  |  |
| `ano_mes` | text | sim |  |  |
| `tipo` | character varying(50) | sim |  |  |
| `quantidade` | bigint | sim |  |  |

## vw_movimentacoes_recentes

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | sim |  |  |
| `aluno` | character varying(200) | sim |  |  |
| `unidade` | character varying(100) | sim |  |  |
| `curso` | character varying(100) | sim |  |  |
| `tipo` | character varying(50) | sim |  |  |
| `data_movimentacao` | date | sim |  |  |
| `motivo_saida` | character varying(100) | sim |  |  |
| `observacoes` | text | sim |  |  |
| `created_by` | character varying(100) | sim |  |  |

## vw_prontuario_aluno

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `aluno_id` | integer | sim |  |  |
| `aluno_nome` | character varying(200) | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `aula_id` | integer | sim |  |  |
| `data_aula` | date | sim |  |  |
| `curso_nome` | character varying(100) | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `professor_nome` | character varying(200) | sim |  |  |
| `nr_da_aula` | integer | sim |  |  |
| `texto` | text | sim |  |  |
| `origem` | text | sim |  |  |
| `texto_emusys_paralelo` | text | sim |  |  |
| `presenca` | character varying(20) | sim |  |  |

## vw_radar_aluno_sinais

> Sinais do Radar da coordenação, grão de ALUNO. Presença vem de vw_aluno_presenca_semantica_v1 no grão de AULA (aluno,dia,hora), janela desde 01/08/2026, só coorte de professor com login liberado. absenteismo_pct é NULO sem base — nunca zero. faltas_consecutivas é a sequência aberta a partir da aula mais recente (0 = sem falta ativa). aluno_foto_url é identidade, não sinal: nao entra na nota nem em media.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `aluno_id` | integer | sim |  |  |
| `aluno_nome` | character varying(200) | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `unidade_codigo` | character varying(20) | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `professor_nome` | character varying(100) | sim |  |  |
| `curso_nome` | character varying(100) | sim |  |  |
| `aulas_medidas` | bigint | sim |  |  |
| `faltas_janela` | bigint | sim |  |  |
| `absenteismo_pct` | numeric | sim |  |  |
| `faltas_mes` | bigint | sim |  |  |
| `aulas_mes` | bigint | sim |  |  |
| `feedback` | character varying(20) | sim |  |  |
| `pratica_em_casa` | text | sim |  |  |
| `evolucao` | text | sim |  |  |
| `animo` | text | sim |  |  |
| `observacao` | text | sim |  |  |
| `feedback_competencia` | date | sim |  |  |
| `avisou_que_sai` | boolean | sim |  |  |
| `mes_saida` | date | sim |  |  |
| `faltas_consecutivas` | bigint | sim |  |  |
| `aluno_foto_url` | text | sim |  |  |
| `faltas_justificadas_mes` | bigint | sim |  |  |
| `dados_status` | text | sim |  |  |
| `estado_publicacao` | text | sim |  |  |
| `sincronizado_em` | timestamp with time zone | sim |  |  |
| `regra_versao` | text | sim |  |  |

## vw_radar_aluno_sinais_canonica_v2

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `aluno_id` | integer | sim |  |  |
| `aluno_nome` | character varying(200) | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `unidade_codigo` | character varying(20) | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `professor_nome` | character varying(100) | sim |  |  |
| `curso_nome` | character varying(100) | sim |  |  |
| `aulas_medidas` | bigint | sim |  |  |
| `faltas_janela` | bigint | sim |  |  |
| `absenteismo_pct` | numeric | sim |  |  |
| `faltas_mes` | bigint | sim |  |  |
| `aulas_mes` | bigint | sim |  |  |
| `feedback` | character varying(20) | sim |  |  |
| `pratica_em_casa` | text | sim |  |  |
| `evolucao` | text | sim |  |  |
| `animo` | text | sim |  |  |
| `observacao` | text | sim |  |  |
| `feedback_competencia` | date | sim |  |  |
| `avisou_que_sai` | boolean | sim |  |  |
| `mes_saida` | date | sim |  |  |
| `faltas_consecutivas` | bigint | sim |  |  |
| `aluno_foto_url` | text | sim |  |  |
| `faltas_justificadas_mes` | bigint | sim |  |  |
| `dados_status` | text | sim |  |  |
| `estado_publicacao` | text | sim |  |  |
| `sincronizado_em` | timestamp with time zone | sim |  |  |
| `regra_versao` | text | sim |  |  |

## vw_radar_aluno_sinais_legado_v1

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `aluno_id` | integer | sim |  |  |
| `aluno_nome` | character varying(200) | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `unidade_codigo` | character varying(20) | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `professor_nome` | character varying(100) | sim |  |  |
| `curso_nome` | character varying(100) | sim |  |  |
| `aulas_medidas` | bigint | sim |  |  |
| `faltas_janela` | bigint | sim |  |  |
| `absenteismo_pct` | numeric | sim |  |  |
| `faltas_mes` | bigint | sim |  |  |
| `aulas_mes` | bigint | sim |  |  |
| `feedback` | character varying(20) | sim |  |  |
| `pratica_em_casa` | text | sim |  |  |
| `evolucao` | text | sim |  |  |
| `animo` | text | sim |  |  |
| `observacao` | text | sim |  |  |
| `feedback_competencia` | date | sim |  |  |
| `avisou_que_sai` | boolean | sim |  |  |
| `mes_saida` | date | sim |  |  |
| `faltas_consecutivas` | bigint | sim |  |  |
| `aluno_foto_url` | text | sim |  |  |

## vw_renovacao_ciclos

> Ciclos de matricula-disciplina com os dois lados da renovacao (renovou / nao renovou), para calcular cobertura por competencia. Consumidores DEVEM filtrar atividade_extra = false (regra 3.5). Nao confundir com vw_contratos_vencendo, que so mostra ciclo vigente.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade_id` | uuid | sim |  |  |
| `unidade_nome` | character varying(100) | sim |  |  |
| `aluno_id` | integer | sim |  |  |
| `aluno_nome` | character varying(200) | sim |  |  |
| `emusys_matricula_id` | bigint | sim |  |  |
| `emusys_matricula_disciplina_id` | bigint | sim |  |  |
| `curso_id` | integer | sim |  |  |
| `curso_nome` | character varying | sim |  |  |
| `professor_nome` | character varying | sim |  |  |
| `data_matricula` | date | sim |  |  |
| `data_ultima_aula` | timestamp with time zone | sim |  |  |
| `nr_aulas_futuras` | integer | sim |  |  |
| `valor_parcela` | numeric(10,2) | sim |  |  |
| `inadimplente` | boolean | sim |  |  |
| `telefone` | character varying(20) | sim |  |  |
| `whatsapp` | character varying(20) | sim |  |  |
| `ultima_sincronizacao_emusys` | timestamp with time zone | sim |  |  |
| `sucedida_por` | bigint | sim |  |  |
| `renovou` | boolean | sim |  |  |
| `atividade_extra` | boolean | sim |  |  |
| `competencia_aula` | date | sim |  |  |
| `venc_ultima_fatura` | date | sim |  |  |
| `competencia_fatura` | date | sim |  |  |
| `faturas_vencidas_abertas` | integer | sim |  |  |

## vw_renovacoes_duplicadas_suspeitas

> Renovacoes possivelmente duplicadas, ja descontadas as anuladas. SUSPEITA, nao veredito: aluno com dois tempos do mesmo curso, ou com duas matriculas reais no Emusys, aparece aqui legitimamente (caso Perola Madeira, matriculas 519 e 520). Conferir contra o Emusys antes de anular -- o criterio canonico e o contrato: o Emusys abre um contrato_id novo a cada renovacao.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `unidade_nome` | character varying(100) | sim |  |  |
| `aluno_id` | integer | sim |  |  |
| `aluno_nome` | character varying(255) | sim |  |  |
| `curso_id` | integer | sim |  |  |
| `curso_nome` | character varying(100) | sim |  |  |
| `data` | date | sim |  |  |
| `competencia_referencia` | date | sim |  |  |
| `valor_parcela_anterior` | numeric(10,2) | sim |  |  |
| `valor_parcela_novo` | numeric(10,2) | sim |  |  |
| `renovacao_status` | text | sim |  |  |
| `emusys_matricula_id` | text | sim |  |  |
| `created_at` | timestamp with time zone | sim |  |  |
| `padrao` | text | sim |  |  |
| `ocorrencias` | bigint | sim |  |  |
| `lancamento_manual` | boolean | sim |  |  |

## vw_renovacoes_proximas

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `aluno_id` | integer | sim |  |  |
| `aluno_nome` | character varying(200) | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `unidade_nome` | character varying(100) | sim |  |  |
| `professor_atual_id` | integer | sim |  |  |
| `professor_nome` | character varying(100) | sim |  |  |
| `curso_nome` | character varying(100) | sim |  |  |
| `valor_parcela` | numeric(10,2) | sim |  |  |
| `data_inicio_contrato` | date | sim |  |  |
| `data_fim_contrato` | date | sim |  |  |
| `tempo_permanencia_meses` | integer | sim |  |  |
| `classificacao` | character varying(4) | sim |  |  |
| `telefone` | character varying(20) | sim |  |  |
| `whatsapp` | character varying(20) | sim |  |  |
| `email` | character varying(150) | sim |  |  |
| `dias_ate_vencimento` | integer | sim |  |  |
| `status_renovacao` | text | sim |  |  |

## vw_risco_atual

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | sim |  |  |
| `aluno_id` | integer | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `probabilidade` | numeric(5,4) | sim |  |  |
| `faixa` | text | sim |  |  |
| `fatores` | jsonb | sim |  |  |
| `modelo_versao` | text | sim |  |  |
| `calculado_em` | date | sim |  |  |
| `criado_em` | timestamp with time zone | sim |  |  |

## vw_risco_evasao_atual

> Ultimo score de risco por aluno. Scores atuais ficam preservados, mas com baixa confianca ate o cutover da presenca canonica.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `aluno_id` | integer | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `probabilidade` | numeric(5,4) | sim |  |  |
| `faixa` | text | sim |  |  |
| `fatores` | jsonb | sim |  |  |
| `modelo_versao` | text | sim |  |  |
| `calculado_em` | date | sim |  |  |
| `confianca_dado` | text | sim |  |  |
| `motivo_confianca` | text | sim |  |  |

