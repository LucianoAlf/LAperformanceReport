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
