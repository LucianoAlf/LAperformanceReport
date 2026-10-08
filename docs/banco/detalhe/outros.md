<!-- GERADO POR scripts/gerar-mapa-banco.mjs — NÃO EDITE À MÃO.
     Banco: ouqwbbermlzqqvtqwlul · Gerado em: 2026-10-08 -->

<!-- fim do cabecalho gerado -->
# Detalhe do banco — outros

3 objetos. Resumo de todos os domínios em `../TABELAS.gerado.md`.

## cache_dependencias

> LAPE-42: tabelas que cada funcao cacheada le (fecho de funcoes + views). Tabela fora desta lista NAO invalida o cache.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `funcao` | text | não |  |  |
| `tabelas` | text[] | não |  |  |
| `atualizado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `cache_dependencias_pkey`

## rastreio_cliques

> Cliques em links de WhatsApp rastreados pela edge ir-whatsapp. Casados pela edge rastreador-casar via codigo invisivel na mensagem.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não |  |  |
| `codigo` | text | não |  |  |
| `origem` | text | não | 'outro'::text |  |
| `unidade` | text | não |  |  |
| `publico` | text | não | 'school'::text |  |
| `destino_telefone` | text | não |  |  |
| `texto_visivel` | text | não |  |  |
| `gclid` | text | sim |  |  |
| `gbraid` | text | sim |  |  |
| `wbraid` | text | sim |  |  |
| `fbclid` | text | sim |  |  |
| `fbp` | text | sim |  |  |
| `fbc` | text | sim |  |  |
| `utm_source` | text | sim |  |  |
| `utm_medium` | text | sim |  |  |
| `utm_campaign` | text | sim |  |  |
| `utm_content` | text | sim |  |  |
| `utm_term` | text | sim |  |  |
| `page_url_origem` | text | sim |  |  |
| `referer` | text | sim |  |  |
| `user_agent` | text | sim |  |  |
| `situacao` | text | não | 'aguardando'::text |  |
| `telefone_lead` | text | sim |  |  |
| `chatwoot_conversation_id` | bigint | sim |  |  |
| `lead_id` | integer | sim |  |  |
| `delay_segundos` | integer | sim |  |  |
| `casado_em` | timestamp with time zone | sim |  |  |
| `created_at` | timestamp with time zone | não | now() |  |
| `updated_at` | timestamp with time zone | não | now() |  |
| `metodo_casamento` | text | sim |  |  |

**Únicos:**
- `rastreio_cliques_pkey`

## tmp_m

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `dep_id` | uuid | sim |  |  |
| `cands` | bigint | sim |  |  |
| `via_b` | bigint | sim |  |  |

