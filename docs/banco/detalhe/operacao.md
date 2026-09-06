<!-- GERADO POR scripts/gerar-mapa-banco.mjs — NÃO EDITE À MÃO.
     Banco: ouqwbbermlzqqvtqwlul · Gerado em: 2026-09-06 -->

<!-- fim do cabecalho gerado -->
# Detalhe do banco — operacao

45 objetos. Resumo de todos os domínios em `../TABELAS.gerado.md`.

## calendario_escolar

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `ano` | integer | não |  |  |
| `tipo` | text | não |  |  |
| `data_inicio` | date | não |  |  |
| `data_fim` | date | não |  |  |
| `nome` | text | não |  |  |
| `status` | text | não | 'confirmado'::text |  |
| `observacoes` | text | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `calendario_escolar_pkey`
- `calendario_escolar_unidade_id_ano_tipo_data_inicio_key`

**Triggers:**
- `trg_marcar_contratos_para_recalculo → trg_marcar_contratos_para_recalculo()`

## catalogo_treinamentos

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `nome` | character varying(255) | não |  |  |
| `descricao` | text | sim |  |  |
| `duracao_minutos` | integer | sim | 60 |  |
| `foco` | character varying(50) | sim |  |  |
| `icone` | character varying(10) | sim | '📚'::character varying |  |
| `ativo` | boolean | sim | true |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `catalogo_treinamentos_pkey`

## colaborador_rider

> Bloco autodeclarado da Ficha Tecnica LA. A pessoa e dona do conteudo e edita quando quiser; historico em colaborador_rider_versoes.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não | nextval('colaborador_rider_id_seq'::regclass) |  |
| `colaborador_id` | integer | não |  | colaboradores.id |
| `respostas` | jsonb | não | '{}'::jsonb |  |
| `versao` | integer | não | 1 |  |
| `preenchido_em` | timestamp with time zone | sim |  |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `colaborador_rider_colaborador_id_key`
- `colaborador_rider_pkey`

## colaborador_rider_versoes

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não | nextval('colaborador_rider_versoes_id_seq'::regclass) |  |
| `colaborador_id` | integer | não |  | colaboradores.id |
| `versao` | integer | não |  |  |
| `respostas` | jsonb | não |  |  |
| `registrado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `colaborador_rider_versoes_pkey`

## colaboradores

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('colaboradores_id_seq'::regclass) |  |
| `nome` | character varying(200) | não |  |  |
| `apelido` | character varying(50) | sim |  |  |
| `tipo` | character varying(20) | não |  |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `whatsapp` | character varying(20) | sim |  |  |
| `email` | character varying(200) | sim |  |  |
| `usuario_id` | uuid | sim |  | users.id |
| `ativo` | boolean | sim | true |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `foto_url` | character varying(500) | sim |  |  |
| `bio` | text | sim |  |  |
| `cargo` | character varying(80) | sim |  |  |
| `aniversario_dia` | smallint | sim |  |  |
| `aniversario_mes` | smallint | sim |  |  |
| `temperamento_codinome` | character varying(30) | sim |  |  |
| `valorizacao_codinome` | character varying(30) | sim |  |  |
| `situacao` | character varying(20) | não | 'ativo'::character varying |  |
| `departamento` | character varying(30) | sim |  |  |
| `professor_id` | integer | sim |  | professores.id |
| `valores_codinome` | character varying(30) | sim |  |  |
| `origem_sistema` | character varying(20) | sim |  |  |
| `origem_ref` | text | sim |  |  |

**Únicos:**
- `colaboradores_pkey`
- `uq_colaboradores_origem`
- `uq_colaboradores_professor`

**Triggers:**
- `update_colaboradores_updated_at → update_updated_at_column()`

## cursos

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('cursos_id_seq'::regclass) |  |
| `nome` | character varying(100) | não |  |  |
| `nome_normalizado` | character varying(100) | sim | upper(TRIM(BOTH FROM nome)) |  |
| `ativo` | boolean | sim | true |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `fator_demanda` | numeric(2,1) | sim | 1.0 |  |
| `emusys_ids` | integer[] | sim |  |  |
| `is_projeto_banda` | boolean | sim | false |  |
| `natureza_operacional` | text | não | 'pedagogica'::text |  |
| `capacidade_maxima` | integer | sim |  |  |

**Únicos:**
- `cursos_pkey`
- `uk_cursos_nome_normalizado`

**Triggers:**
- `trg_audit → fn_audit_log()`
- `trg_cursos_updated_at → update_updated_at_column()`

## feriados

> Feriados nacionais (BrasilAPI), municipais e recessos. Campo ativo permite desativar manualmente.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `data` | date | não |  |  |
| `nome` | text | não |  |  |
| `tipo` | text | não | 'national'::text |  |
| `ativo` | boolean | não | true |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |
| `uf` | text | sim |  |  |
| `cidade` | text | sim |  |  |

**Únicos:**
- `feriados_data_key`
- `feriados_pkey`

**Triggers:**
- `feriados_updated_at → visitas_set_updated_at()`

## horarios

> Faixas de horário para aulas (manhã, tarde, noite)

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('horarios_id_seq'::regclass) |  |
| `nome` | character varying(20) | não |  |  |
| `hora_inicio` | time without time zone | sim |  |  |
| `hora_fim` | time without time zone | sim |  |  |
| `ativo` | boolean | sim | true |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `horarios_pkey`

## inventario

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('inventario_id_seq'::regclass) |  |
| `codigo_patrimonio` | character varying(50) | sim |  |  |
| `sala_id` | integer | sim |  | salas.id |
| `unidade_id` | uuid | sim |  | unidades.id |
| `nome` | character varying(255) | não |  |  |
| `categoria` | character varying(100) | sim |  |  |
| `marca` | character varying(100) | sim |  |  |
| `modelo` | character varying(100) | sim |  |  |
| `numero_serie` | character varying(100) | sim |  |  |
| `valor_compra` | numeric(10,2) | sim |  |  |
| `data_compra` | date | sim |  |  |
| `nota_fiscal` | character varying(100) | sim |  |  |
| `fornecedor` | character varying(255) | sim |  |  |
| `vida_util_meses` | integer | sim | 60 |  |
| `valor_residual` | numeric(10,2) | sim |  |  |
| `status` | character varying(50) | sim | 'ativo'::character varying |  |
| `condicao` | character varying(50) | sim | 'bom'::character varying |  |
| `quantidade` | integer | sim | 1 |  |
| `observacoes` | text | sim |  |  |
| `foto_url` | character varying(500) | sim |  |  |
| `proxima_revisao` | date | sim |  |  |
| `alerta_revisao_dias` | integer | sim | 30 |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `created_by` | uuid | sim |  | users.id |
| `ativo` | boolean | sim | true |  |

**Únicos:**
- `inventario_codigo_patrimonio_key`
- `inventario_nome_sala_ativo_uq`
- `inventario_pkey`

**Triggers:**
- `trigger_inventario_updated_at → update_inventario_updated_at()`

## inventario_manutencoes

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('inventario_manutencoes_id_seq'::regclass) |  |
| `item_id` | integer | sim |  | inventario.id |
| `tipo` | character varying(50) | não |  |  |
| `descricao` | text | sim |  |  |
| `custo` | numeric(10,2) | sim |  |  |
| `data_manutencao` | date | não |  |  |
| `data_proxima_revisao` | date | sim |  |  |
| `responsavel` | character varying(255) | sim |  |  |
| `fornecedor_servico` | character varying(255) | sim |  |  |
| `observacoes` | text | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `created_by` | uuid | sim |  | users.id |

**Únicos:**
- `inventario_manutencoes_pkey`

## inventario_movimentacoes

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('inventario_movimentacoes_id_seq'::regclass) |  |
| `item_id` | integer | sim |  | inventario.id |
| `tipo` | character varying(50) | não |  |  |
| `sala_origem_id` | integer | sim |  | salas.id |
| `sala_destino_id` | integer | sim |  | salas.id |
| `motivo` | text | sim |  |  |
| `data_movimentacao` | timestamp with time zone | sim | now() |  |
| `usuario_id` | uuid | sim |  | users.id |

**Únicos:**
- `inventario_movimentacoes_pkey`

## inventario_pendencias

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('inventario_pendencias_id_seq'::regclass) |  |
| `sala_id` | integer | não |  | salas.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `titulo` | character varying(200) | não |  |  |
| `descricao` | text | sim |  |  |
| `categoria` | character varying(50) | sim | 'compra'::character varying |  |
| `prioridade` | character varying(20) | não | 'importante'::character varying |  |
| `status` | character varying(20) | não | 'aberta'::character varying |  |
| `solicitante` | character varying(100) | sim |  |  |
| `created_via` | text | sim |  |  |
| `resolvido_em` | timestamp with time zone | sim |  |  |
| `resolvido_por` | character varying(100) | sim |  |  |
| `resolucao_obs` | text | sim |  |  |
| `item_vinculado_id` | integer | sim |  | inventario.id |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `inventario_pendencias_pkey`

**Triggers:**
- `trg_pendencias_updated_at → update_pendencias_updated_at()`

## loja_carteira

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('loja_carteira_id_seq'::regclass) |  |
| `tipo_titular` | character varying(20) | não |  |  |
| `colaborador_id` | integer | sim |  | colaboradores.id |
| `professor_id` | integer | sim |  | professores.id |
| `unidade_id` | uuid | sim |  | unidades.id |
| `saldo` | numeric(10,2) | sim | 0 |  |
| `moedas_la` | integer | sim | 0 |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `loja_carteira_colaborador_idx`
- `loja_carteira_pkey`
- `loja_carteira_professor_idx`

**Triggers:**
- `update_loja_carteira_updated_at → update_updated_at_column()`

## loja_carteira_movimentacoes

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('loja_carteira_movimentacoes_id_seq'::regclass) |  |
| `carteira_id` | integer | sim |  | loja_carteira.id |
| `tipo` | character varying(30) | não |  |  |
| `valor` | numeric(10,2) | não |  |  |
| `saldo_apos` | numeric(10,2) | não |  |  |
| `referencia_tipo` | character varying(30) | sim |  |  |
| `referencia_id` | integer | sim |  |  |
| `descricao` | text | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `loja_carteira_movimentacoes_pkey`

## loja_categorias

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('loja_categorias_id_seq'::regclass) |  |
| `nome` | character varying(100) | não |  |  |
| `icone` | character varying(10) | sim | '📦'::character varying |  |
| `ordem` | integer | sim | 0 |  |
| `ativo` | boolean | sim | true |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `loja_categorias_pkey`

## loja_configuracoes

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('loja_configuracoes_id_seq'::regclass) |  |
| `chave` | character varying(100) | não |  |  |
| `valor` | text | não |  |  |
| `descricao` | text | sim |  |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `loja_configuracoes_chave_key`
- `loja_configuracoes_pkey`

**Triggers:**
- `update_loja_configuracoes_updated_at → update_updated_at_column()`

## loja_estoque

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('loja_estoque_id_seq'::regclass) |  |
| `produto_id` | integer | sim |  | loja_produtos.id |
| `variacao_id` | integer | sim |  | loja_variacoes.id |
| `unidade_id` | uuid | sim |  | unidades.id |
| `quantidade` | integer | sim | 0 |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `loja_estoque_com_variacao_idx`
- `loja_estoque_pkey`
- `loja_estoque_produto_unidade_variacao_uq`
- `loja_estoque_sem_variacao_idx`

**Triggers:**
- `update_loja_estoque_updated_at → update_updated_at_column()`

## loja_movimentacoes_estoque

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('loja_movimentacoes_estoque_id_seq'::regclass) |  |
| `produto_id` | integer | sim |  | loja_produtos.id |
| `variacao_id` | integer | sim |  | loja_variacoes.id |
| `unidade_id` | uuid | sim |  | unidades.id |
| `tipo` | character varying(30) | não |  |  |
| `quantidade` | integer | não |  |  |
| `saldo_apos` | integer | não |  |  |
| `referencia_id` | integer | sim |  |  |
| `colaborador_id` | integer | sim |  | colaboradores.id |
| `observacoes` | text | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `loja_movimentacoes_estoque_pkey`

## loja_optin_novidades

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('loja_optin_novidades_id_seq'::regclass) |  |
| `aluno_id` | integer | sim |  | alunos.id |
| `unidade_id` | uuid | sim |  | unidades.id |
| `whatsapp` | character varying(20) | sim |  |  |
| `ativo` | boolean | sim | true |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `loja_optin_novidades_aluno_id_unidade_id_key`
- `loja_optin_novidades_pkey`

## loja_produtos

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('loja_produtos_id_seq'::regclass) |  |
| `nome` | character varying(200) | não |  |  |
| `descricao` | text | sim |  |  |
| `categoria_id` | integer | sim |  | loja_categorias.id |
| `sku` | character varying(50) | sim |  |  |
| `preco` | numeric(10,2) | não |  |  |
| `custo` | numeric(10,2) | sim |  |  |
| `estoque_minimo` | integer | sim | 5 |  |
| `comissao_especial` | numeric(5,2) | sim |  |  |
| `foto_url` | text | sim |  |  |
| `disponivel_whatsapp` | boolean | sim | false |  |
| `ativo` | boolean | sim | true |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `loja_produtos_pkey`
- `loja_produtos_sku_key`

**Triggers:**
- `trg_audit → fn_audit_log()`
- `update_loja_produtos_updated_at → update_updated_at_column()`

## loja_reservas

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('loja_reservas_id_seq'::regclass) |  |
| `produto_id` | integer | não |  | loja_produtos.id |
| `variacao_id` | integer | sim |  | loja_variacoes.id |
| `unidade_id` | uuid | não |  | unidades.id |
| `aluno_id` | integer | sim |  | alunos.id |
| `cliente_nome` | character varying(200) | sim |  |  |
| `quantidade` | integer | não |  |  |
| `prazo` | date | não |  |  |
| `status` | character varying(20) | não | 'ativa'::character varying |  |
| `observacoes` | text | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `created_via` | text | sim |  |  |
| `finalizada_em` | timestamp with time zone | sim |  |  |
| `finalizada_venda_id` | integer | sim |  | loja_vendas.id |
| `cancelada_em` | timestamp with time zone | sim |  |  |
| `motivo_cancelamento` | text | sim |  |  |

**Únicos:**
- `loja_reservas_pkey`

## loja_responsaveis_reposicao

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('loja_responsaveis_reposicao_id_seq'::regclass) |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `nome` | character varying(200) | não |  |  |
| `whatsapp` | character varying(20) | não |  |  |
| `ativo` | boolean | sim | true |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `loja_responsaveis_reposicao_pkey`
- `loja_responsaveis_unidade_idx`

## loja_variacoes

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('loja_variacoes_id_seq'::regclass) |  |
| `produto_id` | integer | sim |  | loja_produtos.id |
| `nome` | character varying(100) | não |  |  |
| `sku` | character varying(50) | sim |  |  |
| `preco` | numeric(10,2) | sim |  |  |
| `ativo` | boolean | sim | true |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `loja_variacoes_pkey`

## loja_vendas

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('loja_vendas_id_seq'::regclass) |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `data_venda` | timestamp with time zone | sim | now() |  |
| `tipo_cliente` | character varying(20) | não |  |  |
| `aluno_id` | integer | sim |  | alunos.id |
| `colaborador_cliente_id` | integer | sim |  | colaboradores.id |
| `cliente_nome` | character varying(200) | sim |  |  |
| `professor_indicador_id` | integer | sim |  | professores.id |
| `subtotal` | numeric(10,2) | não |  |  |
| `desconto` | numeric(10,2) | sim | 0 |  |
| `desconto_tipo` | character varying(10) | sim | 'valor'::character varying |  |
| `total` | numeric(10,2) | não |  |  |
| `forma_pagamento` | character varying(30) | não |  |  |
| `parcelas` | integer | sim | 1 |  |
| `observacoes` | text | sim |  |  |
| `comprovante_enviado` | boolean | sim | false |  |
| `comprovante_enviado_em` | timestamp with time zone | sim |  |  |
| `status` | character varying(20) | sim | 'concluida'::character varying |  |
| `estornada_em` | timestamp with time zone | sim |  |  |
| `estornada_por` | integer | sim |  | colaboradores.id |
| `motivo_estorno` | text | sim |  |  |
| `vendedor_id` | integer | sim |  | colaboradores.id |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `loja_vendas_pkey`

**Triggers:**
- `trigger_calcular_comissao_venda → calcular_comissao_venda()`

## loja_vendas_itens

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('loja_vendas_itens_id_seq'::regclass) |  |
| `venda_id` | integer | sim |  | loja_vendas.id |
| `produto_id` | integer | sim |  | loja_produtos.id |
| `variacao_id` | integer | sim |  | loja_variacoes.id |
| `produto_nome` | character varying(200) | não |  |  |
| `variacao_nome` | character varying(100) | sim |  |  |
| `quantidade` | integer | não |  |  |
| `preco_unitario` | numeric(10,2) | não |  |  |
| `subtotal` | numeric(10,2) | não |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `loja_vendas_itens_pkey`

## planos_acao

> Planos de ação gerados pela IA Gemini para cada unidade/período

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `nome` | character varying(255) | não |  |  |
| `descricao` | text | sim |  |  |
| `ano` | integer | não |  |  |
| `mes` | integer | não |  |  |
| `diagnostico` | text | não |  |  |
| `acoes_curto_prazo` | jsonb | não | '[]'::jsonb |  |
| `acoes_medio_prazo` | jsonb | não | '[]'::jsonb |  |
| `acoes_longo_prazo` | jsonb | não | '[]'::jsonb |  |
| `insights_adicionais` | jsonb | não | '[]'::jsonb |  |
| `contexto_geracao` | jsonb | não | '{}'::jsonb |  |
| `status` | character varying(50) | não | 'ativo'::character varying |  |
| `favorito` | boolean | não | false |  |
| `criado_por` | integer | sim |  | usuarios.id |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `planos_acao_pkey`

**Triggers:**
- `trigger_planos_acao_updated_at → update_planos_acao_updated_at()`

## projeto_anexos

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('projeto_anexos_id_seq'::regclass) |  |
| `projeto_id` | integer | sim |  | projetos.id |
| `tarefa_id` | integer | sim |  | projeto_tarefas.id |
| `nome` | character varying(255) | não |  |  |
| `nome_original` | character varying(255) | não |  |  |
| `tipo_mime` | character varying(100) | não |  |  |
| `tamanho_bytes` | integer | não |  |  |
| `storage_path` | text | não |  |  |
| `url_publica` | text | sim |  |  |
| `uploaded_by_tipo` | character varying(20) | não |  |  |
| `uploaded_by_id` | integer | não |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `projeto_anexos_pkey`

## projeto_comentarios

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('projeto_comentarios_id_seq'::regclass) |  |
| `projeto_id` | integer | sim |  | projetos.id |
| `tarefa_id` | integer | sim |  | projeto_tarefas.id |
| `autor_tipo` | character varying(20) | não |  |  |
| `autor_id` | integer | não |  |  |
| `conteudo` | text | não |  |  |
| `editado` | boolean | sim | false |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `projeto_comentarios_pkey`

**Triggers:**
- `update_comentarios_updated_at → update_updated_at_column()`

## projeto_config_permissoes

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('projeto_config_permissoes_id_seq'::regclass) |  |
| `chave` | character varying(100) | não |  |  |
| `valor` | boolean | sim | false |  |
| `descricao` | text | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `projeto_config_permissoes_chave_key`
- `projeto_config_permissoes_pkey`

## projeto_equipe

> Pessoas envolvidas em cada projeto (coordenadores, assistentes, professores)

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('projeto_equipe_id_seq'::regclass) |  |
| `projeto_id` | integer | não |  | projetos.id |
| `pessoa_tipo` | character varying(20) | não |  |  |
| `pessoa_id` | integer | não |  |  |
| `papel` | character varying(50) | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `projeto_equipe_pkey`
- `projeto_equipe_unique`

## projeto_equipe_membros

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('projeto_equipe_membros_id_seq'::regclass) |  |
| `usuario_id` | integer | sim |  | usuarios.id |
| `nome` | character varying(255) | não |  |  |
| `cargo` | character varying(255) | sim |  |  |
| `tipo` | character varying(50) | não | 'assistente'::character varying |  |
| `avatar_cor` | character varying(50) | sim | 'violet'::character varying |  |
| `ativo` | boolean | sim | true |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `projeto_equipe_membros_pkey`

## projeto_fases

> Fases de cada projeto (Planejamento, Divulgação, Preparação, etc.)

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('projeto_fases_id_seq'::regclass) |  |
| `projeto_id` | integer | não |  | projetos.id |
| `nome` | character varying(100) | não |  |  |
| `ordem` | integer | não | 1 |  |
| `data_inicio` | date | sim |  |  |
| `data_fim` | date | sim |  |  |
| `status` | character varying(20) | não | 'pendente'::character varying |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |
| `template_id` | integer | sim |  |  |

**Únicos:**
- `projeto_fases_pkey`

**Triggers:**
- `trigger_projeto_fases_updated_at → update_projeto_fases_updated_at()`
- `update_projeto_fases_updated_at → update_updated_at_column()`

## projeto_log_alteracoes

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('projeto_log_alteracoes_id_seq'::regclass) |  |
| `projeto_id` | integer | sim |  | projetos.id |
| `tarefa_id` | integer | sim |  | projeto_tarefas.id |
| `acao` | character varying(50) | não |  |  |
| `campo_alterado` | character varying(100) | sim |  |  |
| `valor_anterior` | text | sim |  |  |
| `valor_novo` | text | sim |  |  |
| `autor_tipo` | character varying(20) | não |  |  |
| `autor_id` | integer | sim |  |  |
| `descricao` | text | sim |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `projeto_log_alteracoes_pkey`

## projeto_tarefas

> Tarefas e subtarefas dos projetos pedagógicos

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('projeto_tarefas_id_seq'::regclass) |  |
| `projeto_id` | integer | não |  | projetos.id |
| `fase_id` | integer | sim |  | projeto_fases.id |
| `tarefa_pai_id` | integer | sim |  | projeto_tarefas.id |
| `titulo` | character varying(200) | não |  |  |
| `descricao` | text | sim |  |  |
| `responsavel_tipo` | character varying(20) | sim |  |  |
| `responsavel_id` | integer | sim |  |  |
| `prazo` | date | sim |  |  |
| `status` | character varying(20) | não | 'pendente'::character varying |  |
| `prioridade` | character varying(10) | não | 'normal'::character varying |  |
| `dependencia_id` | integer | sim |  | projeto_tarefas.id |
| `ordem` | integer | não | 1 |  |
| `created_by` | integer | sim |  | usuarios.id |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |
| `completed_at` | timestamp with time zone | sim |  |  |

**Únicos:**
- `projeto_tarefas_pkey`

**Triggers:**
- `trg_audit → fn_audit_log()`
- `trigger_log_tarefa_delete → log_tarefa_alteracao()`
- `trigger_log_tarefa_insert_update → log_tarefa_alteracao()`
- `trigger_projeto_tarefas_updated_at → update_projeto_tarefas_updated_at()`
- `update_projeto_tarefas_updated_at → update_updated_at_column()`

## projeto_tipo_fases_template

> Template de fases padrão para cada tipo de projeto

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('projeto_tipo_fases_template_id_seq'::regclass) |  |
| `tipo_id` | integer | não |  | projeto_tipos.id |
| `nome` | character varying(100) | não |  |  |
| `ordem` | integer | não | 1 |  |
| `duracao_sugerida_dias` | integer | sim | 7 |  |
| `descricao` | text | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `projeto_tipo_fases_template_pkey`

## projeto_tipo_tarefas_template

> Tarefas padrão de cada fase do template

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('projeto_tipo_tarefas_template_id_seq'::regclass) |  |
| `fase_template_id` | integer | não |  | projeto_tipo_fases_template.id |
| `titulo` | character varying(200) | não |  |  |
| `ordem` | integer | não | 1 |  |
| `descricao` | text | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `projeto_tipo_tarefas_template_pkey`

## projeto_tipos

> Tipos de projeto cadastráveis (Semana Temática, Recital, Show de Banda, etc.)

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('projeto_tipos_id_seq'::regclass) |  |
| `nome` | character varying(100) | não |  |  |
| `icone` | character varying(10) | não | '📁'::character varying |  |
| `cor` | character varying(20) | não | '#8b5cf6'::character varying |  |
| `descricao` | text | sim |  |  |
| `ativo` | boolean | não | true |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `projeto_tipos_pkey`

**Triggers:**
- `trigger_projeto_tipos_updated_at → update_projeto_tipos_updated_at()`
- `update_projeto_tipos_updated_at → update_updated_at_column()`

## projetos

> Projetos pedagógicos da escola (Semanas Temáticas, Recitais, Shows, etc.)

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('projetos_id_seq'::regclass) |  |
| `tipo_id` | integer | não |  | projeto_tipos.id |
| `nome` | character varying(200) | não |  |  |
| `descricao` | text | sim |  |  |
| `responsavel_tipo` | character varying(20) | sim |  |  |
| `responsavel_id` | integer | sim |  |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `data_inicio` | date | não |  |  |
| `data_fim` | date | não |  |  |
| `status` | character varying(20) | não | 'planejamento'::character varying |  |
| `prioridade` | character varying(10) | não | 'normal'::character varying |  |
| `orcamento` | numeric(12,2) | sim |  |  |
| `arquivado` | boolean | não | false |  |
| `created_by` | integer | sim |  | usuarios.id |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `projetos_pkey`

**Triggers:**
- `trg_audit → fn_audit_log()`
- `trigger_log_projeto_delete → log_projeto_alteracao()`
- `trigger_log_projeto_insert_update → log_projeto_alteracao()`
- `trigger_projetos_updated_at → update_projetos_updated_at()`
- `update_projetos_updated_at → update_updated_at_column()`

## salas

> Salas de aula de cada unidade com capacidade máxima

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | nextval('salas_id_seq'::regclass) |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `nome` | character varying(100) | não |  |  |
| `codigo` | character varying(20) | sim |  |  |
| `capacidade_maxima` | integer | não | 4 |  |
| `cursos_permitidos` | text[] | sim |  |  |
| `descricao` | text | sim |  |  |
| `ativo` | boolean | sim | true |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `tipo_sala` | character varying(100) | sim |  |  |
| `buffer_operacional` | integer | sim | 10 |  |
| `sala_coringa` | boolean | sim | false |  |

**Únicos:**
- `salas_pkey`
- `salas_unidade_id_nome_ativo_key`

**Triggers:**
- `trg_audit → fn_audit_log()`

## staff_unidade

> Equipe por unidade para o carrossel de boas-vindas. unidade_id NULL = global (aparece em todas).

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `nome` | text | não |  |  |
| `cargo` | text | não |  |  |
| `foto_url` | text | não |  |  |
| `ordem` | integer | não | 0 |  |
| `ativo` | boolean | não | true |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `staff_unidade_pkey`

## templates_cenario

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | text | não |  |  |
| `nome` | text | não |  |  |
| `descricao` | text | sim |  |  |
| `cor` | text | sim | 'cyan'::text |  |
| `icone` | text | sim | 'scale'::text |  |
| `crescimento_pct` | numeric | não | 10 |  |
| `churn_ajuste` | numeric | não | 0 |  |
| `conversao_ajuste_pct` | numeric | não | 0 |  |
| `ticket_ajuste_pct` | numeric | não | 0 |  |
| `score_estimado` | text | sim | '~80%'::text |  |
| `ativo` | boolean | sim | true |  |
| `ordem` | integer | sim | 0 |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |

**Únicos:**
- `templates_cenario_pkey`

## templates_cenario_unidade

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `template_id` | text | não |  | templates_cenario.id |
| `unidade_id` | uuid | não |  |  |
| `alunos_objetivo` | integer | não |  |  |
| `created_at` | timestamp with time zone | sim | now() |  |
| `updated_at` | timestamp with time zone | sim | now() |  |
| `ticket_medio` | numeric(10,2) | sim |  |  |
| `churn_projetado` | numeric(5,2) | sim |  |  |
| `taxa_lead_exp` | numeric(5,2) | sim |  |  |
| `taxa_exp_mat` | numeric(5,2) | sim |  |  |
| `mrr_objetivo` | numeric(12,2) | sim |  |  |

**Únicos:**
- `templates_cenario_unidade_pkey`
- `templates_cenario_unidade_template_id_unidade_id_key`

## visitas

> Visitas presenciais agendadas por lead. Alternativa a aula experimental.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `emusys_lead_id` | integer | sim |  |  |
| `nome` | text | não |  |  |
| `telefone` | text | não |  |  |
| `data` | date | não |  |  |
| `horario` | time without time zone | não |  |  |
| `status` | text | não | 'agendada'::text |  |
| `observacoes` | text | sim |  |  |
| `criado_por` | text | não | 'manual'::text |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |
| `lead_id` | integer | sim |  | leads.id |

**Únicos:**
- `visitas_pkey`

**Triggers:**
- `visitas_updated_at → visitas_set_updated_at()`

## visitas_config

> Configuracao do sistema de visitas por unidade (limite, horarios).

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | uuid | não | gen_random_uuid() |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `max_visitas_por_horario` | integer | não | 2 |  |
| `horario_inicio_seg_sex` | time without time zone | não | '11:00:00'::time without time zone |  |
| `horario_fim_seg_sex` | time without time zone | não | '20:00:00'::time without time zone |  |
| `horario_inicio_sab` | time without time zone | não | '08:00:00'::time without time zone |  |
| `horario_fim_sab` | time without time zone | não | '14:00:00'::time without time zone |  |
| `ativo` | boolean | não | true |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |
| `atendimento_inicio_seg_sex` | time without time zone | não | '11:00:00'::time without time zone |  |
| `atendimento_fim_seg_sex` | time without time zone | não | '20:00:00'::time without time zone |  |
| `atendimento_inicio_sab` | time without time zone | não | '08:00:00'::time without time zone |  |
| `atendimento_fim_sab` | time without time zone | não | '14:00:00'::time without time zone |  |

**Únicos:**
- `visitas_config_pkey`
- `visitas_config_unidade_id_key`

**Triggers:**
- `visitas_config_updated_at → visitas_set_updated_at()`

## vw_disciplinas_modalidade

> Somente disciplina -> modalidade (individual\|turma), para consumo por RPC SECURITY INVOKER. security_invoker=false de proposito: evita abrir emusys_disciplinas_catalogo, que tem RLS sem policy.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `unidade_id` | uuid | sim |  |  |
| `emusys_disciplina_id` | integer | sim |  |  |
| `nome_emusys` | text | sim |  |  |
| `modalidade` | text | sim |  |  |

