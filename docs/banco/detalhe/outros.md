<!-- GERADO POR scripts/gerar-mapa-banco.mjs — NÃO EDITE À MÃO.
     Banco: ouqwbbermlzqqvtqwlul · Gerado em: 2026-09-19 -->

<!-- fim do cabecalho gerado -->
# Detalhe do banco — outros

4 objetos. Resumo de todos os domínios em `../TABELAS.gerado.md`.

## eventos_operacionais

> Fatos operacionais append-only para consumo por servicos. Nunca armazena financeiro, saude, presenca, observacoes livres ou payload bruto.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `evento_id` | text | não |  |  |
| `tipo` | text | não |  |  |
| `ocorreu_em` | timestamp with time zone | sim |  |  |
| `detectado_em` | timestamp with time zone | não | clock_timestamp() |  |
| `origem` | text | não |  |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `aluno_id` | integer | sim |  | alunos.id |
| `aluno_nome` | text | sim |  |  |
| `aula_id` | integer | sim |  | aulas_emusys.id |
| `curso` | text | sim |  |  |
| `aula` | jsonb | sim |  |  |
| `mudanca` | jsonb | não | '{}'::jsonb |  |
| `motivo` | text | sim |  |  |
| `detalhe` | text | sim |  |  |
| `created_at` | timestamp with time zone | não | clock_timestamp() |  |

**Únicos:**
- `eventos_operacionais_pkey`

## eventos_operacionais_audiencia

> Audiencia por professor da projecao de eventos operacionais; detectado_em e denormalizado para leitura paginada.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `evento_id` | text | não |  | eventos_operacionais.evento_id |
| `professor_id` | integer | não |  | professores.id |
| `participacao` | text | não |  |  |
| `detectado_em` | timestamp with time zone | não |  |  |

**Únicos:**
- `eventos_operacionais_audiencia_pkey`

## porteiro_config

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | boolean | não | true |  |
| `modo` | text | não |  |  |

**Únicos:**
- `porteiro_config_pkey`

## porteiro_recusa

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não |  |  |
| `quando` | timestamp with time zone | não | now() |  |
| `usuario_id` | integer | sim |  |  |
| `auth_user_id` | uuid | sim |  |  |
| `caminho` | text | sim |  |  |
| `metodo` | text | sim |  |  |
| `modo` | text | sim |  |  |

**Únicos:**
- `porteiro_recusa_pkey`

