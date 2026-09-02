<!-- GERADO POR scripts/gerar-mapa-banco.mjs — NÃO EDITE À MÃO.
     Banco: ouqwbbermlzqqvtqwlul · Gerado em: 2026-09-02 -->

<!-- fim do cabecalho gerado -->
# Detalhe do banco — plataforma

22 objetos. Resumo de todos os domínios em `../TABELAS.gerado.md`.

## _auditoria_chave_natural_20260809

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `momento` | text | sim |  |  |
| `escopo` | character varying | sim |  |  |
| `professor_id` | integer | sim |  |  |
| `professor_nome` | text | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `competencia` | date | sim |  |  |
| `valor_bruto` | numeric | sim |  |  |
| `numerador` | numeric | sim |  |  |
| `denominador` | numeric | sim |  |  |
| `amostra` | integer | sim |  |  |
| `estado_base` | text | sim |  |  |
| `publicavel` | boolean | sim |  |  |
| `confianca` | text | sim |  |  |
| `fonte` | text | sim |  |  |
| `regra_versao` | text | sim |  |  |
| `motivo_sem_base` | text | sim |  |  |
| `detalhes` | jsonb | sim |  |  |

## _auditoria_reconstrucao_20260809

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `momento` | text | não |  |  |
| `escopo` | text | não |  |  |
| `professor_id` | integer | sim |  |  |
| `professor_nome` | text | sim |  |  |
| `expostos` | integer | sim |  |  |
| `penalizadores` | integer | sim |  |  |
| `pendentes` | integer | sim |  |  |
| `em_revisao` | integer | sim |  |  |
| `valor_bruto` | numeric | sim |  |  |
| `estado_base` | text | sim |  |  |
| `publicavel` | boolean | sim |  |  |
| `apta_oficial` | boolean | sim |  |  |
| `capturado_em` | timestamp with time zone | não | now() |  |

## assistente_ia_config

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | 1 |  |
| `openai_api_key` | text | não | ''::text |  |
| `openai_model` | text | não | 'gpt-4o-mini'::text |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:** assistente_ia_config_pkey

## audit_log

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | uuid_generate_v4() |  |
| `tabela` | character varying(100) | não |  |  |
| `registro_id` | uuid | sim |  |  |
| `acao` | character varying(20) | não |  |  |
| `dados_antigos` | jsonb | sim |  |  |
| `dados_novos` | jsonb | sim |  |  |
| `usuario` | character varying(100) | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `auth_user_id` | uuid | sim |  |  |
| `origem` | text | sim | 'system'::text |  |
| `registro_id_text` | text | sim |  |  |

**Únicos:** audit_log_pkey

## auditoria_acesso

> Log de auditoria para ações de acesso e permissões

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `usuario_id` | integer | sim |  | usuarios.id |
| `usuario_nome` | character varying(255) | sim |  |  |
| `acao` | character varying(50) | não |  |  |
| `entidade` | character varying(50) | sim |  |  |
| `entidade_id` | uuid | sim |  |  |
| `detalhes` | jsonb | sim |  |  |
| `ip_address` | character varying(45) | sim |  |  |
| `user_agent` | text | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:** auditoria_acesso_pkey

## ficha_tokens

> Token pessoal por colaborador. Uso unico: usado_em preenchido trava o reenvio. RLS sem policy por design — so service_role le; token nunca vai para o client.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não | nextval('ficha_tokens_id_seq'::regclass) |  |
| `token` | character varying(64) | não |  |  |
| `colaborador_id` | integer | não |  | colaboradores.id |
| `cargo_contexto` | character varying(40) | não |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |
| `criado_por` | integer | sim |  |  |
| `usado_em` | timestamp with time zone | sim |  |  |
| `ativo` | boolean | não | true |  |

**Únicos:** ficha_tokens_pkey, ficha_tokens_token_key, uq_ficha_tokens_colaborador_ativo

## migrations_audit_data_nascimento

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('migrations_audit_data_nascimento_id_seq'::regclass) |  |
| `migration_name` | text | não |  |  |
| `aluno_id` | integer | não |  |  |
| `campo` | text | não |  |  |
| `valor_antigo` | text | sim |  |  |
| `valor_novo` | text | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:** migrations_audit_data_nascimento_pkey

## perfil_permissoes

> Relacionamento N:N entre perfis e permissoes

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `perfil_id` | uuid | não |  | perfis.id |
| `permissao_id` | uuid | não |  | permissoes.id |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:** perfil_permissoes_perfil_id_permissao_id_key, perfil_permissoes_pkey

## perfis

> Perfis de acesso do sistema (Admin, Gerente, Farmer, Hunter, etc.)

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `nome` | character varying(50) | não |  |  |
| `descricao` | text | sim |  |  |
| `nivel` | integer | não | 10 |  |
| `icone` | character varying(10) | sim | '👤'::character varying |  |
| `cor` | character varying(20) | sim | '#3b82f6'::character varying |  |
| `sistema` | boolean | sim | false |  |
| `ativo` | boolean | sim | true |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:** perfis_nome_key, perfis_pkey

## permissoes

> Permissões granulares do sistema (ex: alunos.ver, alunos.editar)

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `codigo` | character varying(100) | não |  |  |
| `modulo` | character varying(50) | não |  |  |
| `acao` | character varying(50) | não |  |  |
| `descricao` | text | sim |  |  |
| `categoria` | character varying(20) | sim | 'OPERACIONAL'::character varying |  |
| `ordem` | integer | sim | 0 |  |
| `ativo` | boolean | sim | true |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:** permissoes_codigo_key, permissoes_pkey

## rbac_piloto_usuarios

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `usuario_id` | integer | não |  | usuarios.id |
| `incluido_em` | timestamp with time zone | não | now() |  |
| `motivo` | text | sim |  |  |

**Únicos:** rbac_piloto_usuarios_pkey

## sol_permissoes

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `colaborador_id` | integer | sim |  | colaboradores.id |
| `telefone` | text | sim |  |  |
| `nome_exibicao` | text | sim |  |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `papel` | text | não | 'adm_unidade'::text |  |
| `escopo` | text | não | 'unidade'::text |  |
| `pode_autorizar` | boolean | não | true |  |
| `pode_consultar` | boolean | não | true |  |
| `ativo` | boolean | não | true |  |
| `observacao` | text | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |

**Únicos:** sol_permissoes_colab_uk, sol_permissoes_pkey, sol_permissoes_tel_uk

## unidades

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | uuid_generate_v4() |  |
| `nome` | character varying(100) | não |  |  |
| `codigo` | character varying(20) | não |  |  |
| `cor_primaria` | character varying(7) | sim | '#00d4ff'::character varying |  |
| `ativo` | boolean | sim | true |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `horario_funcionamento` | jsonb | sim | '{"sabado": {"fim": "16:00", "inicio": "08:00"}, "domingo": {"fechado": true}, "segunda_sexta": {"fim": "21:00", "inicio": "08:00"}}'::jsonb |  |
| `endereco` | text | sim |  |  |
| `telefone` | text | sim |  |  |
| `hunter_nome` | text | sim |  |  |
| `farmers_nomes` | text[] | sim |  |  |
| `gerente_nome` | character varying(100) | sim |  |  |
| `relatorio_diario_cron_ativo` | boolean | sim | false |  |
| `telefone_gerente` | text | sim |  |  |
| `link_comunidade` | text | sim |  |  |
| `secretaria_whatsapp` | text | sim |  |  |
| `secretaria_fixo` | text | sim |  |  |
| `relatorio_comercial_diario_cron_ativo` | boolean | não | false |  |
| `farmers_apelidos` | text[] | sim |  |  |

**Únicos:** unidades_codigo_key, unidades_nome_key, unidades_pkey

**Triggers:** tr_unidades_updated_at → update_updated_at(), trg_audit → fn_audit_log()

## unidades_cursos

> Relacionamento entre unidades e cursos - define quais cursos cada unidade oferece

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('unidades_cursos_id_seq'::regclass) |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `curso_id` | integer | não |  | cursos.id |
| `ativo` | boolean | sim | true |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:** unidades_cursos_pkey, unidades_cursos_unidade_id_curso_id_key

## usuario_onboarding

> Tracking do progresso de onboarding de cada usuário

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `usuario_id` | integer | sim |  | usuarios.id |
| `senha_alterada` | boolean | sim | false |  |
| `foto_uploaded` | boolean | sim | false |  |
| `perfil_completo` | boolean | sim | false |  |
| `checklist_completo` | boolean | sim | false |  |
| `tour_dashboard` | boolean | sim | false |  |
| `tour_alunos` | boolean | sim | false |  |
| `tour_comercial` | boolean | sim | false |  |
| `tour_professores` | boolean | sim | false |  |
| `tour_salas` | boolean | sim | false |  |
| `tour_metas` | boolean | sim | false |  |
| `tour_projetos` | boolean | sim | false |  |
| `tour_administrativo` | boolean | sim | false |  |
| `tour_config` | boolean | sim | false |  |
| `primeiro_acesso_em` | timestamp without time zone | sim | now() |  |
| `ultimo_tour_em` | timestamp without time zone | sim |  |  |
| `tours_completados` | integer | sim | 0 |  |
| `created_at` | timestamp without time zone | sim | now() |  |
| `updated_at` | timestamp without time zone | sim | now() |  |

**Únicos:** usuario_onboarding_pkey, usuario_onboarding_usuario_id_key

**Triggers:** update_usuario_onboarding_updated_at → update_onboarding_updated_at()

## usuario_perfis

> Relacionamento N:N entre usuários e perfis, com escopo opcional de unidade

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `usuario_id` | integer | não |  | usuarios.id |
| `perfil_id` | uuid | não |  | perfis.id |
| `unidade_id` | uuid | sim |  | unidades.id |
| `ativo` | boolean | sim | true |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:** idx_usuario_perfis_unique_with_unidade, idx_usuario_perfis_unique_without_unidade, usuario_perfis_pkey

## usuarios

> Usuários do sistema com controle de acesso por unidade

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('usuarios_id_seq'::regclass) |  |
| `nome` | character varying(255) | não |  |  |
| `email` | character varying(255) | não |  |  |
| `senha_hash` | character varying(255) | sim |  |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `cargo` | character varying(100) | sim |  |  |
| `ativo` | boolean | sim | true |  |
| `ultimo_acesso` | timestamp with time zone | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `perfil` | character varying(20) | sim | 'unidade'::character varying |  |
| `auth_user_id` | uuid | sim |  |  |
| `telefone` | character varying(20) | sim |  |  |
| `avatar_url` | text | sim |  |  |
| `apelido` | text | sim |  |  |

**Únicos:** usuarios_auth_user_id_key, usuarios_email_key, usuarios_pkey

**Triggers:** trg_usuarios_sincroniza_rbac → fn_usuarios_sincroniza_rbac(), update_usuarios_updated_at → update_updated_at_column()

## vw_saude_jornada_ciclos

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade_id` | uuid | sim |  |  |
| `unidade_nome` | character varying(100) | sim |  |  |
| `ciclos_vigentes` | integer | sim |  |  |
| `ciclos_sucedidos` | integer | sim |  |  |
| `orfaos_nao_marcados` | integer | sim |  |  |
| `ultima_sucessao_anotada` | timestamp with time zone | sim |  |  |
| `vigentes_vencendo_30d` | integer | sim |  |  |
| `vigentes_fatura_30d` | integer | sim |  |  |

## vw_saude_presenca_professor

> Saude service-only da protecao humana na ocorrencia vigente. Revertidas e cancelamentos_humanos_desfeitos devem permanecer 0.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade_id` | uuid | sim |  |  |
| `unidade_nome` | character varying(100) | sim |  |  |
| `marcacoes_humanas` | integer | sim |  |  |
| `revertidas` | integer | sim |  |  |
| `cancelamentos_humanos_desfeitos` | integer | sim |  |  |
| `sem_procedencia_na_ficha` | integer | sim |  |  |
| `ultima_marcacao` | timestamp with time zone | sim |  |  |

## vw_saude_professor_experimental

> Saude do campo alunos.professor_experimental_id por competencia/unidade. campo_confere/pct_acerto = acerto contra a experimental real (lead_experimentais); copia_sem_lastro = sintoma do bug corrigido na v33 do webhook de matricula (06/08/2026).

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `competencia` | date | sim |  |  |
| `unidade_id` | uuid | sim |  |  |
| `matriculas` | integer | sim |  |  |
| `com_experimental_unica` | integer | sim |  |  |
| `campo_confere` | integer | sim |  |  |
| `campo_diverge` | integer | sim |  |  |
| `copia_sem_lastro` | integer | sim |  |  |
| `vazio_correto` | integer | sim |  |  |
| `ambiguo_nao_decidivel` | integer | sim |  |  |
| `pct_acerto` | numeric | sim |  |  |

## vw_totais_unidade_performance

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade` | character varying(50) | sim |  |  |
| `ano` | integer | sim |  |  |
| `total_professores` | bigint | sim |  |  |
| `total_experimentais` | bigint | sim |  |  |
| `total_matriculas` | bigint | sim |  |  |
| `taxa_conversao_media` | numeric | sim |  |  |
| `total_evasoes` | bigint | sim |  |  |
| `total_contratos` | bigint | sim |  |  |
| `total_renovacoes` | bigint | sim |  |  |
| `taxa_renovacao_media` | numeric | sim |  |  |

## vw_unidade_anual

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade` | character varying(100) | sim |  |  |
| `codigo` | character varying(20) | sim |  |  |
| `ano` | integer | sim |  |  |
| `alunos_dezembro` | integer | sim |  |  |
| `alunos_janeiro` | integer | sim |  |  |
| `total_matriculas` | bigint | sim |  |  |
| `total_evasoes` | bigint | sim |  |  |
| `churn_medio` | numeric | sim |  |  |
| `ticket_medio` | numeric | sim |  |  |
| `renovacao_media` | numeric | sim |  |  |
| `permanencia_atual` | numeric | sim |  |  |
| `inadimplencia_media` | numeric | sim |  |  |

