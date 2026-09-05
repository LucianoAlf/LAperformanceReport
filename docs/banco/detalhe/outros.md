<!-- GERADO POR scripts/gerar-mapa-banco.mjs — NÃO EDITE À MÃO.
     Banco: ouqwbbermlzqqvtqwlul · Gerado em: 2026-09-05 -->

<!-- fim do cabecalho gerado -->
# Detalhe do banco — outros

6 objetos. Resumo de todos os domínios em `../TABELAS.gerado.md`.

## comunidade_wa_grupos

> Grupos/comunidades de WhatsApp por unidade, lidos pela edge sincronizar-comunidade-whatsapp (POST /group/info UAZAPI).

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não |  |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `jid` | text | não |  |  |
| `nome` | text | não |  |  |
| `caixa_id` | integer | sim |  | whatsapp_caixas.id |
| `ativo` | boolean | não | true |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `comunidade_wa_grupos_jid_key`
- `comunidade_wa_grupos_pkey`

## comunidade_wa_participantes

> Foto mais recente dos participantes de cada grupo. Linhas somem quando o participante some na captura seguinte (é estado atual, não histórico).

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não |  |  |
| `grupo_id` | bigint | não |  | comunidade_wa_grupos.id |
| `telefone_key` | text | não |  |  |
| `telefone_original` | text | sim |  |  |
| `capturado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `comunidade_wa_participantes_grupo_id_telefone_key_key`
- `comunidade_wa_participantes_pkey`

## config_cadastro_obrigatorio

> Régua de completude de cadastro por unidade × classificação. Editável pelo gerente; a RPC get_situacao_alunos_v1 honra esta tabela.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não |  |  |
| `unidade_id` | uuid | não |  | unidades.id |
| `campo` | text | não |  |  |
| `obrigatorio` | boolean | não | true |  |
| `aplica_classificacao` | text | não | 'todas'::text |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |

**Únicos:**
- `config_cadastro_obrigatorio_pkey`
- `config_cadastro_obrigatorio_unidade_id_campo_aplica_classif_key`

## google_ads_metricas_diarias

> Alicerce/estrategica. Custo diario do Google Ads por CAMPANHA (grao de campanha atravessa Search e Performance Max; anuncio nao). Gemeo de meta_ads_metricas_diarias. Reescrita por janela — o Google revisa conversao por dias. gasto ja vem convertido de cost_micros na ingestao.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `dia` | date | não |  |  |
| `campanha_id` | text | não |  |  |
| `campanha_nome` | text | sim |  |  |
| `canal_tipo` | text | sim |  |  |
| `status` | text | sim |  |  |
| `gasto` | numeric(12,2) | não | 0 |  |
| `impressoes` | bigint | sim |  |  |
| `cliques` | bigint | sim |  |  |
| `ctr` | numeric(8,4) | sim |  |  |
| `cpc_medio` | numeric(12,4) | sim |  |  |
| `conversoes` | numeric(12,2) | não | 0 |  |
| `conversoes_todas` | numeric(12,2) | sim |  |  |
| `valor_conversoes` | numeric(12,2) | sim |  |  |
| `custo_por_conversao` | numeric(12,4) | sim | CASE     WHEN (conversoes > (0)::numeric) THEN (gasto / conversoes)     ELSE NULL::numeric END |  |
| `moeda` | text | não | 'BRL'::text |  |
| `conta_id` | text | sim |  |  |
| `capturado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `google_ads_metricas_diarias_pkey`

## vw_ads_gasto_diario_v1

> Alicerce/estrategica. Gasto diario de midia unificado (meta + google). FONTE UNICA do custo — nao somar as tabelas cruas em consumidor novo. ⚠️ `conversoes_plataforma` NAO e comparavel entre plataformas: no Meta e conversa iniciada no WhatsApp, no Google e a acao de conversao configurada na conta. Serve para acompanhar cada uma contra ela mesma, nunca para ranquear uma contra a outra.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `dia` | date | sim |  |  |
| `plataforma` | text | sim |  |  |
| `campanha_id` | text | sim |  |  |
| `campanha_nome` | text | sim |  |  |
| `canal_tipo` | text | sim |  |  |
| `gasto` | numeric(12,2) | sim |  |  |
| `impressoes` | bigint | sim |  |  |
| `cliques` | bigint | sim |  |  |
| `conversoes_plataforma` | numeric | sim |  |  |
| `moeda` | text | sim |  |  |

## vw_retomada_eficacia_v1

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `retomadas_fechadas` | bigint | sim |  |  |
| `matriculou` | bigint | sim |  |  |
| `matriculou_no_prazo` | bigint | sim |  |  |
| `fechadas_no_prazo` | bigint | sim |  |  |
| `aguardando` | bigint | sim |  |  |
| `sem_data` | bigint | sim |  |  |
| `veio_da_conversa` | bigint | sim |  |  |
| `veio_da_consultora` | bigint | sim |  |  |

