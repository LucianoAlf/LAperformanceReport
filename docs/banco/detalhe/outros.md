<!-- GERADO POR scripts/gerar-mapa-banco.mjs — NÃO EDITE À MÃO.
     Banco: ouqwbbermlzqqvtqwlul · Gerado em: 2026-10-10 -->

<!-- fim do cabecalho gerado -->
# Detalhe do banco — outros

12 objetos. Resumo de todos os domínios em `../TABELAS.gerado.md`.

## cache_dependencias

> LAPE-42: tabelas que cada funcao cacheada le (fecho de funcoes + views). Tabela fora desta lista NAO invalida o cache.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `funcao` | text | não |  |  |
| `tabelas` | text[] | não |  |  |
| `atualizado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `cache_dependencias_pkey`

## radio_credencial

> Token do Spotify de cada estação. SÓ service_role (edge function radio-spotify). Nunca vai ao navegador.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `estacao_id` | bigint | não |  | radio_estacao.id |
| `refresh_token` | text | não |  |  |
| `access_token` | text | sim |  |  |
| `expira_em` | timestamp with time zone | sim |  |  |
| `escopos` | text | sim |  |  |
| `atualizado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `radio_credencial_pkey`

## radio_desvio

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não |  |  |
| `estacao_id` | bigint | não |  | radio_estacao.id |
| `quando` | timestamp with time zone | não | now() |  |
| `tipo` | text | não |  |  |
| `encontrado` | jsonb | sim |  |  |
| `esperado` | jsonb | sim |  |  |
| `corrigido` | boolean | não | false |  |
| `conferido` | boolean | sim |  |  |

**Únicos:**
- `radio_desvio_pkey`

## radio_estacao

> Rádio da LA: uma estação por unidade (+ teste). Ligada a uma conta do Spotify pela tela da coordenação.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não |  |  |
| `nome` | text | não |  |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `ordem` | integer | não | 0 |  |
| `ativa` | boolean | não | true |  |
| `spotify_usuario_id` | text | sim |  |  |
| `spotify_nome` | text | sim |  |  |
| `conectada_em` | timestamp with time zone | sim |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |
| `estado` | text | não | 'desconhecido'::text |  |
| `estado_desde` | timestamp with time zone | sim |  |  |
| `ultimo_visto_em` | timestamp with time zone | sim |  |  |
| `ultimo_player` | jsonb | sim |  |  |
| `ultima_faixa_uri` | text | sim |  |  |
| `player_token_hash` | text | sim |  |  |
| `player_link_gerado_em` | timestamp with time zone | sim |  |  |
| `player_visto_em` | timestamp with time zone | sim |  |  |
| `player_aberto_desde` | timestamp with time zone | sim |  |  |
| `player_info` | jsonb | sim |  |  |

**Únicos:**
- `radio_estacao_nome_key`
- `radio_estacao_pkey`

## radio_musico

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `chave` | text | não |  |  |
| `nome` | text | não |  |  |
| `wikidata_id` | text | sim |  |  |
| `foto_url` | text | sim |  |  |
| `foto_credito` | text | sim |  |  |
| `foto_pagina` | text | sim |  |  |
| `pais` | text | sim |  |  |
| `nascimento` | text | sim |  |  |
| `instrumentos` | text[] | não | '{}'::text[] |  |
| `estilos` | text[] | não | '{}'::text[] |  |
| `bio` | text | sim |  |  |
| `destaque_curto` | text | sim |  |  |
| `tocou_com` | text[] | não | '{}'::text[] |  |
| `fontes` | jsonb | não | '[]'::jsonb |  |
| `status` | text | não |  |  |
| `buscada_em` | timestamp with time zone | sim |  |  |
| `editada_por_usuario_id` | integer | sim |  | usuarios.id |
| `editada_em` | timestamp with time zone | sim |  |  |

**Únicos:**
- `radio_musico_pkey`

## radio_playlist

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não |  |  |
| `nome` | text | não |  |  |
| `curador` | text | sim |  |  |
| `versao` | integer | não | 1 |  |
| `criado_por_usuario_id` | integer | sim |  | usuarios.id |
| `criado_em` | timestamp with time zone | não | now() |  |
| `atualizado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `radio_playlist_pkey`

## radio_playlist_faixa

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `playlist_id` | bigint | não |  | radio_playlist.id |
| `faixa_uri` | text | não |  |  |
| `posicao` | integer | não |  |  |
| `nome` | text | não |  |  |
| `artistas` | text[] | não | '{}'::text[] |  |
| `album` | text | sim |  |  |
| `capa` | text | sim |  |  |
| `duracao_ms` | integer | sim |  |  |
| `explicita` | boolean | não | false |  |
| `adicionada_por_usuario_id` | integer | sim |  | usuarios.id |
| `adicionada_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `radio_playlist_faixa_pkey`

## radio_playlist_spotify

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `playlist_id` | bigint | não |  | radio_playlist.id |
| `estacao_id` | bigint | não |  | radio_estacao.id |
| `spotify_playlist_id` | text | não |  |  |
| `spotify_uri` | text | não |  |  |
| `versao_sincronizada` | integer | não | 0 |  |
| `sincronizada_em` | timestamp with time zone | sim |  |  |

**Únicos:**
- `radio_playlist_spotify_pkey`

## radio_sugestao

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não |  |  |
| `faixa_uri` | text | não |  |  |
| `nome` | text | não |  |  |
| `artistas` | text[] | não | '{}'::text[] |  |
| `album` | text | sim |  |  |
| `capa` | text | sim |  |  |
| `duracao_ms` | integer | sim |  |  |
| `explicita` | boolean | não | false |  |
| `origem` | text | não |  |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `sugerido_por_usuario_id` | integer | sim |  | usuarios.id |
| `criado_em` | timestamp with time zone | não | now() |  |
| `status` | text | não | 'pendente'::text |  |
| `analise` | jsonb | sim |  |  |
| `analisada_em` | timestamp with time zone | sim |  |  |
| `decidido_por_usuario_id` | integer | sim |  | usuarios.id |
| `decidido_em` | timestamp with time zone | sim |  |  |
| `motivo` | text | sim |  |  |
| `playlist_id` | bigint | sim |  | radio_playlist.id |

**Únicos:**
- `radio_sugestao_pkey`

## radio_tocou

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não |  |  |
| `estacao_id` | bigint | não |  | radio_estacao.id |
| `inicio` | timestamp with time zone | não | now() |  |
| `faixa_uri` | text | sim |  |  |
| `nome` | text | sim |  |  |
| `artistas` | text[] | não | '{}'::text[] |  |
| `contexto_uri` | text | sim |  |  |
| `playlist_id` | bigint | sim |  | radio_playlist.id |
| `fora_da_grade` | boolean | não | false |  |

**Únicos:**
- `radio_tocou_pkey`

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

