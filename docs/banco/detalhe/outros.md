<!-- GERADO POR scripts/gerar-mapa-banco.mjs — NÃO EDITE À MÃO.
     Banco: ouqwbbermlzqqvtqwlul · Gerado em: 2026-10-10 -->

<!-- fim do cabecalho gerado -->
# Detalhe do banco — outros

24 objetos. Resumo de todos os domínios em `../TABELAS.gerado.md`.

## app_parabens_visto

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `colaborador_id` | integer | não |  | colaboradores.id |
| `aniversario` | date | não |  |  |
| `visto_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `app_parabens_visto_pkey`

## cache_dependencias

> LAPE-42: tabelas que cada funcao cacheada le (fecho de funcoes + views). Tabela fora desta lista NAO invalida o cache.

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `funcao` | text | não |  |  |
| `tabelas` | text[] | não |  |  |
| `atualizado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `cache_dependencias_pkey`

## radio_config

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | integer | não | 1 |  |
| `prata_cada` | integer | não | 6 |  |
| `atualizado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `radio_config_pkey`

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
| `la_tocando_ate` | timestamp with time zone | sim |  |  |
| `recepcao_pausada_desde` | timestamp with time zone | sim |  |  |
| `recepcao_mudo` | boolean | não | false |  |
| `recepcao_volume` | smallint | sim |  |  |
| `recepcao_aviso_em` | timestamp with time zone | sim |  |  |

**Únicos:**
- `radio_estacao_nome_key`
- `radio_estacao_pkey`

## radio_fala

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `hash` | text | não |  |  |
| `texto` | text | não |  |  |
| `voz_id` | bigint | não |  | radio_voz.id |
| `arquivo` | text | não |  |  |
| `duracao_ms` | integer | sim |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `radio_fala_pkey`

## radio_momento_config

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | boolean | não | true |  |
| `aniv_semana` | boolean | não | true |  |
| `aniv_semana_horarios` | text[] | não | '{10:30,16:30}'::text[] |  |
| `aniv_aula` | boolean | não | true |  |
| `datas` | boolean | não | true |  |
| `datas_horarios` | text[] | não | '{10:00,15:00,19:00}'::text[] |  |
| `contagem` | boolean | não | true |  |
| `contagem_cada_horas` | smallint | não | 2 |  |
| `contagem_dias_antes` | smallint | não | 60 |  |
| `voz_id` | bigint | não | 1 | radio_voz.id |

**Únicos:**
- `radio_momento_config_pkey`

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
| `discos` | jsonb | sim |  |  |
| `discos_em` | timestamp with time zone | sim |  |  |

**Únicos:**
- `radio_musico_pkey`

## radio_nao_anunciar

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `aluno_id` | integer | não |  | alunos.id |
| `motivo` | text | sim |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |
| `criado_por_usuario_id` | integer | sim |  | usuarios.id |

**Únicos:**
- `radio_nao_anunciar_pkey`

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

## radio_qr

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `codigo` | text | não |  |  |
| `estacao_id` | bigint | não |  | radio_estacao.id |
| `album_id` | text | não |  |  |
| `faixa_titulo` | text | não |  |  |
| `musica` | text | não |  |  |
| `artistas` | text | sim |  |  |
| `capa` | text | sim |  |  |
| `disco` | text | sim |  |  |
| `ano` | integer | sim |  |  |
| `musico_nome` | text | sim |  |  |
| `musico_discogs` | integer | sim |  |  |
| `musico_papel` | text | sim |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |
| `lido_em` | timestamp with time zone | sim |  |  |
| `leituras` | integer | não | 0 |  |

**Únicos:**
- `radio_qr_mesma_historia`
- `radio_qr_pkey`

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
| `comentario` | text | sim |  |  |
| `estacao_id` | bigint | sim |  | radio_estacao.id |

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
| `tipo` | text | não | 'spotify'::text |  |
| `audio_id` | bigint | sim |  | radio_audio_la.id |
| `vinheta_id` | bigint | sim |  | radio_vinheta.id |
| `momento` | text | sim |  |  |

**Únicos:**
- `radio_tocou_pkey`

## radio_vinheta

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não |  |  |
| `nome` | text | não |  |  |
| `texto` | text | não |  |  |
| `voz_id` | bigint | não |  | radio_voz.id |
| `arquivo` | text | não |  |  |
| `duracao_ms` | integer | sim |  |  |
| `quando` | text | não |  |  |
| `horarios` | text[] | não | '{}'::text[] |  |
| `intervalo_horas` | integer | sim |  |  |
| `dias` | integer[] | não | '{1,2,3,4,5,6}'::integer[] |  |
| `estacoes` | bigint[] | não |  |  |
| `inicio` | date | não | ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date |  |
| `fim` | date | sim |  |  |
| `ativa` | boolean | não | true |  |
| `tocou` | integer | não | 0 |  |
| `criado_por_usuario_id` | integer | sim |  | usuarios.id |
| `criado_em` | timestamp with time zone | não | now() |  |
| `atualizado_em` | timestamp with time zone | não | now() |  |

**Únicos:**
- `radio_vinheta_pkey`

## radio_voz

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não |  |  |
| `nome` | text | não |  |  |
| `descricao` | text | sim |  |  |
| `elevenlabs_voice_id` | text | não |  |  |
| `genero` | text | não |  |  |
| `ativa` | boolean | não | true |  |
| `ordem` | integer | não | 0 |  |

**Únicos:**
- `radio_voz_elevenlabs_voice_id_key`
- `radio_voz_pkey`

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

## tv_pareamento

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `codigo` | text | não |  |  |
| `nonce_hash` | text | não |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |
| `expira_em` | timestamp with time zone | não | (now() + '00:10:00'::interval) |  |
| `tela_id` | bigint | sim |  | tv_tela.id |
| `ligado_por_usuario_id` | integer | sim |  | usuarios.id |
| `ligado_em` | timestamp with time zone | sim |  |  |
| `entregue_em` | timestamp with time zone | sim |  |  |

**Únicos:**
- `tv_pareamento_pkey`

## tv_peca

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não |  |  |
| `tipo` | text | não |  |  |
| `titulo` | text | não |  |  |
| `arquivo` | text | sim |  |  |
| `campanha` | jsonb | sim |  |  |
| `duracao_s` | smallint | não | 10 |  |
| `unidades` | uuid[] | não | '{}'::uuid[] |  |
| `inicio` | date | não | ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date |  |
| `fim` | date | sim |  |  |
| `ativa` | boolean | não | true |  |
| `ordem` | integer | não | 0 |  |
| `criada_por_usuario_id` | integer | sim |  | usuarios.id |
| `criada_em` | timestamp with time zone | não | now() |  |
| `atualizada_em` | timestamp with time zone | não | now() |  |
| `alunos` | integer[] | não | '{}'::integer[] |  |
| `legenda` | text | sim |  |  |

**Únicos:**
- `tv_peca_pkey`

## tv_sem_imagem

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `aluno_id` | integer | não |  | alunos.id |
| `motivo` | text | sim |  |  |
| `criado_em` | timestamp with time zone | não | now() |  |
| `criado_por_usuario_id` | integer | sim |  | usuarios.id |

**Únicos:**
- `tv_sem_imagem_pkey`

## tv_tela

| Coluna | Tipo | Nulo | Default | Referência |
|---|---|---|---|---|
| `id` | bigint | não |  |  |
| `nome` | text | não |  |  |
| `unidade_id` | uuid | sim |  | unidades.id |
| `estacao_id` | bigint | sim |  | radio_estacao.id |
| `dias` | smallint[] | não | '{1,2,3,4,5,6}'::smallint[] |  |
| `de` | time without time zone | não | '08:00:00'::time without time zone |  |
| `ate` | time without time zone | não | '21:00:00'::time without time zone |  |
| `token_hash` | text | sim |  |  |
| `link_gerado_em` | timestamp with time zone | sim |  |  |
| `visto_em` | timestamp with time zone | sim |  |  |
| `aberta_desde` | timestamp with time zone | sim |  |  |
| `info` | jsonb | sim |  |  |
| `ativa` | boolean | não | true |  |
| `ordem` | integer | não | 0 |  |

**Únicos:**
- `tv_tela_nome_key`
- `tv_tela_pkey`

