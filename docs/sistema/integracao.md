# Mapa do sistema — integracao

> Índice geral: [`docs/MAPA-SISTEMA.md`](../MAPA-SISTEMA.md) ·
> Banco: [`docs/banco/detalhe/integracao.md`](../banco/detalhe/integracao.md)

## Apêndice — Edge functions por categoria (uso no frontend)

- **IA (Gemini/OpenAI):** `gemini-insights`, `gemini-insights-comercial`, `gemini-insights-retencao`, `gemini-insights-turma`, `gemini-relatorio-gerencial`, `gemini-relatorio-coordenacao`, `gemini-ranking-professores`, `gemini-relatorio-professor-individual`, `gemini-fabio-chat`, `gerar-plano-aluno`, `gerar-relatorio-aluno`, `gerar-prompt-agente`
- **WhatsApp UAZAPI:** `enviar-mensagem-lead`, `enviar-mensagem-admin`, `whatsapp-status`, `whatsapp-connect`, `listar-instancias-uazapi`, `configurar-webhook-caixa`, `buscar-foto-perfil`, `deletar-mensagem-admin`, `editar-mensagem-admin`, `relatorio-admin-whatsapp`, `professor-360-whatsapp`, `relatorio-coordenacao-whatsapp`, `projeto-alertas-whatsapp`
- **WhatsApp Meta (Campanhas):** `enviar-campanha`, `controle-campanha`, `enviar-mensagem-meta`, `gerenciar-templates`, `sincronizar-templates`
- **Pesquisas:** `enviar-pesquisa-pos-primeira-aula`, `enviar-pesquisa-evasao`, `processar-resposta-pesquisa`
- **Emusys/dados:** `sync-presenca-emusys`, `sync-faturas-emusys`, `refresh-contas-receber`, `export-contas-receber`, `marcos-jornada`, `auditor-divergencias-emusys`, `sync-feriados`. Faturas passam pela fila durável `financeiro_sync_queue`; o export operacional consome `get_inadimplencia_canonica` e o snapshot bruto exige frescor por padrão. O contrato puro `_shared/experimental-snapshot.ts` pagina `/aulas` até o fim e normaliza o snapshot de experimentais por `unidade + aula Emusys + participante externo + execução`, sem conciliar por nome/telefone. A aplicação no banco é uma única transação: atualiza/insere vigentes, inativa ausentes do mesmo intervalo e só então registra a execução como completa. No modo `metadados`, a mesma lista de aulas obtida uma vez alimenta tanto o upsert de `aulas_emusys` quanto o snapshot; falha de qualquer unidade encerra a chamada sem resposta parcial de sucesso.
- **Admin/usuários:** `admin-create-user`, `admin-update-email`, `admin-update-password`, `validar-token-feedback`

> Lista de edge functions **disparada pelo frontend**. Edges de webhook/cron (ex: `processar-matricula-emusys`, `sync-matriculas-emusys`, `enviar-boas-vindas-matricula`, `meta-webhook-campanhas`) não aparecem aqui — ver `.claude/memory/integracao-infra.md`.

### Resolução operacional da agenda (12/08/2026)

O espelho bruto permanece em `aulas_emusys`. A função privada
`fn_aula_operacional_id` escolhe, dentro do mesmo professor/unidade/curso e
intervalo, o evento com maior roster. `app_minha_agenda_sessao`,
`vw_registro_pendencia`, `vw_presenca_pendencia`, `fabio_aulas_candidatas` e
`fn_enfileirar_audio_core` consomem o mesmo ID. Assim LA Teacher, LA Report e
Fábio não divergem quando o Emusys mantém uma turma antiga vazia ao lado do
evento atual.

### Pipeline de presença canônica v2 (candidato em 26/08/2026)

`sync-presenca-emusys` passa a registrar execução, lease, heartbeat, hash e
cobertura por unidade/modo/data antes de liberar consumo. O raw do Emusys e o
roster continuam auditáveis; `vw_presenca_ocorrencia_canonica_v2` resolve a
ocorrência e as RPCs de frescor, pendência, contexto de agente, métricas e
detalhes distribuem o mesmo resultado.

As superfícies governadas são `agenda`, `sol`, `la_teacher`, `lia`, `mila`,
`relatorios` e `kpis`. Cada uma pode operar em `legado`, `sombra` ou
`canonico_v2`, permitindo publicação técnica sem cutover e rollback sem DDL.
Escritas de Agenda/professor/Fábio usam comando idempotente e recibo append-only.
O contrato está validado localmente, mas ainda não foi publicado em produção.
Ver [`docs/runbooks/presenca-canonica.md`](./runbooks/presenca-canonica.md).

## Edge functions que não apareciam neste mapa

Levantadas em 02/09/2026 lendo o código de cada uma (`supabase/functions/<nome>/index.ts`).

### Lojinha
| Edge | O que faz |
|---|---|
| `lojinha-alerta-estoque` | alerta de estoque baixo por WhatsApp ao responsável |
| `lojinha-enviar-comprovante` | comprovante de venda por WhatsApp ao cliente |
| `lojinha-relatorio-professor` | relatório de carteira/Lalitas por WhatsApp ao professor |
| `lojinha-relatorio-vendas` | monta o relatório de vendas para envio |

### Ficha do colaborador (ponte com o Super Folha)
| Edge | O que faz |
|---|---|
| `ficha-criar-pessoa` | cria pessoa + token na mesma RPC (origem estável torna retry idempotente) |
| `ficha-emitir-token` | emite token de acesso; lê `colaboradores`, `ficha_tokens`, `usuarios` |
| `ficha-export` | exporta a ficha (`colaborador_rider`, `professor_perfil_testes`) |
| `ficha-tecnica` | ficha técnica LA (v2) |
| `perfil-professor` | teste de perfil (`professor_perfil_respostas`, `professor_perfil_testes`) |

### Pesquisa de evasão
| Edge | O que faz |
|---|---|
| `classificar-resposta-evasao` | classificador semântico das respostas |
| `processar-conversa-evasao` | processa a conversa (`pesquisa_evasao_analises`, `_mensagens`, `_processamento`) |
| `transcrever-mensagem-evasao` | transcreve áudio da resposta (`pesquisa_evasao_transcricoes`) |
| `enviar-agradecimento-evasao` | agradece quem respondeu. Única *write action* da cadeia: 4 guardas (kill switch `auto_agradecimento_evasao`, teto 3/dia, janela de 6h desde o fechamento da análise, idempotência por `automacao_log.idempotency_key` reservada **antes** do envio). Lê o veredito que o classificador gravou — não o recalcula — e não confia no chamador. Log de enviados **e** barrados no tópico Logs do Lia Core (thread 347). Nasce desligada. |
| `processar-fila-repescagem-evasao` | worker do 2º toque (repescagem), claim atômico por `FOR UPDATE SKIP LOCKED` |

### WhatsApp / Caixa de entrada (UAZAPI)
| Edge | O que faz |
|---|---|
| `deletar-mensagem-lead` | `/message/delete`; marca como deletada em `crm_mensagens` |
| `editar-mensagem-lead` | `/message/edit`; atualiza o conteúdo em `crm_mensagens` |
| `reagir-mensagem` | envia reação (emoji) via `/message/react` |
| `transcrever-audio` | `/message/download` com `transcribe=true` |
| `webhook-whatsapp-status` | recebe `messages.update` com status de entrega |

### Demais
| Edge | O que faz |
|---|---|
| `bi-agent-lamusic` | agente BI com tool calling, Text-to-SQL, cache e isolamento por unidade |
| `caixa-financeiro-whatsapp` | envio manual do fechamento de caixa ao grupo financeiro da unidade |
| `criar-sessao-feedback` | cria/reutiliza sessão pública de feedback do professor e envia o link |
| `notificar-anamnese` | notificação de anamnese |
| `monitor-saude-webhook` | monitor de saúde de webhook |
| `sync-students-studio` | sincroniza `alunos` com o Studio |
| `previsualizar-reconciliacao-grade-emusys` | ⚠️ **edge temporária, estritamente somente leitura** — audita a fotografia da grade |

## Crons que não apareciam neste mapa

Horários em **UTC**, como estão no `pg_cron` (BRT = UTC−3).

| Cron | Agenda | O que dispara |
|---|---|---|
| `financeiro-sync-atual-15m` | `3,18,33,48 * * * *` | `sync-faturas-emusys` — competência atual |
| `financeiro-sync-anteriores-60m` | `7 * * * *` | `sync-faturas-emusys` — competências anteriores |
| `financeiro-sync-backlog-2h` | `11 */2 * * *` | `sync-faturas-emusys` — backlog |
| `reconciliar-health-score-professor-v3-alertas` | `*/5 * * * *` | `reconciliar_health_score_professor_v3_alertas()` |
| `la-os-coletar-pg-cron` | `*/15 * * * *` | `monitoramento.coletar_pg_cron()` |
| `la-os-dead-man` | `*/15 * * * *` | `monitoramento.checar_ausencia()` — dead-man switch |
| `monitor-saude-fabio` | `5,15,25,35,45,55 * * * *` | edge `monitor-saude-fabio` |
| `fabio-retomar-audio-experimental` | `3,13,23,33,43,53 * * * *` | `fn_fila_audio_experimental_retomar(20)` |
| `reconciliar-experimental-aulas` | `12,27,42,57 * * * *` | `fn_reconciliar_experimental_tick(7, 200)` |
| `promover-periodos-professor-ativos-exatos` | `0 6 * * *` | promove períodos e trocas confirmadas pela jornada |
| `cleanup-job-run-details` | `0 6 * * 0` | apaga `cron.job_run_details` com mais de 90 dias |
| `cleanup-reconstrucao-professor-obsoleta` | `0 11 * * 2` | `limpar_manifesto_periodos_obsoletos_v1()` |

> Catálogo completo de crons, funções e consumidores: [`docs/banco/FUNCOES.gerado.md`](../banco/FUNCOES.gerado.md).

