# Integracao e Infraestrutura — LA Music

## Supabase
- Project ID: `ouqwbbermlzqqvtqwlul` (LA Performance Report — principal)
- Outros projetos do usuario: `aexacbmirdlcssmjjbzx` (emusys-webhook, nao acessivel via MCP), `rhxqwraqpabgecgojytj` (LA Studio Manager), `ubdvtjbitozhkuvvqkxj` (la-music-folha), `xfqgcfeoswlkcgdtikco` (La_Pulse_v2)
- 41+ edge functions ativas
- Extensions: pg_cron, pg_net (HTTP requests de dentro do banco)

## Edge Functions (por categoria)

### WhatsApp / CRM
- `webhook-whatsapp-inbox` — router UAZAPI (messages + messages_update). Captura nome do contato (pushName) de `message.senderName`/`chat.name`/`chat.wa_name` e atualiza `nome_externo` a cada msg (reflete troca de nome, sem duplicar — elo da conversa é o NÚMERO). Conversa externa em caixa consolidada é casada por telefone+departamento+`aluno_id NULL`+`unidade_id NULL`. Deploy via Supabase CLI (1118 linhas + `_shared/uazapi.ts`), NÃO via MCP inline.
- `enviar-boas-vindas-matricula` — boas-vindas de nova matrícula pela caixa UAZAPI "Sol - Sucesso do Aluno" (id=3). Substitui o workflow n8n `4fohyKMFRE7QFE9S` (que usava WAHA). Busca vídeo do professor (RPC `buscar_video_professor`), envia vídeo+caption ou texto, notifica a Fabi, e registra os envios em `admin_conversas`/`admin_mensagens` (departamento `sucesso_aluno`, `direcao=saida`, `remetente=admin`). Idempotência anti-duplicata via tabela `boas_vindas_enviadas` (UNIQUE) reservada antes do envio. `MODO_TESTE` (constante no topo) redireciona tudo para número de teste. `verify_jwt:false`. **EM PRODUCAO desde 2026-06-17 (`MODO_TESTE=false`, edge v10)**. Gatilho: `processar-matricula-emusys` v21 (deploy v26) chama via `fetch` no fim de `handleMatriculaNova`, passando `id_externo=p.matriculaIdEmusys` — só `matricula_nova`, try/catch isolado (falha de WhatsApp não derruba a matrícula). Segundo curso também dispara (sem filtro por `action`); reprocessamento da mesma matrícula = ignorado pela idempotência.
- `webhook-whatsapp-status` — status de entrega (enviada/entregue/lida)
- `whatsapp-status` — verifica conexao da instancia UAZAPI
- `whatsapp-connect` — conecta instancia UAZAPI
- `enviar-mensagem-lead` — envia msg WhatsApp para lead
- `editar-mensagem-lead` — edita msg enviada
- `deletar-mensagem-lead` — deleta msg
- `reagir-mensagem` — emoji reaction
- `transcrever-audio` — transcreve audio WhatsApp
- `buscar-foto-perfil` — foto de perfil WhatsApp
- `debug-uazapi` — debug de conexao

### Mensagens Agendadas
- `processar-mensagens-agendadas` — processa fila de msgs (pg_cron a cada minuto)
- `gerar-mensagem-aniversario` — texto IA para aniversario
- `gerar-mensagem-boas-vindas` — texto IA boas-vindas
- `gerar-mensagem-checklist` — texto IA checklist

### IA / MILA
- `mila-processar-mensagem` — agente IA MILA (pre-atendimento automatico)

### Gemini Insights / Relatorios
- `gemini-insights` — insights gerais
- `gemini-insights-comercial` — KPIs comerciais
- `gemini-insights-equipe` — performance equipe
- `gemini-insights-professor` — performance professor
- `gemini-insights-retencao` — retencao/churn
- `gemini-insights-turma` — insights por turma
- `gemini-ranking-professores` — ranking comparativo
- `gemini-relatorio-coordenacao` — relatorio coordenacao
- `gemini-relatorio-gerencial` — relatorio gerencial
- `gemini-relatorio-professor-individual` — relatorio individual
- `gemini-fabio-chat` — chatbot Gemini

### WhatsApp Reports
- `professor-360-whatsapp` — feedback 360 via WhatsApp
- `projeto-alertas-whatsapp` — alertas de projetos
- `relatorio-admin-whatsapp` — relatorio admin (tipos: gerencial_ia, diario, mensal, renovacoes, avisos, evasoes)
- `relatorio-coordenacao-whatsapp` — relatorio coordenacao (tipos similares)
- Modais de envio: `ModalRelatorio.tsx` (Administrativo), `ModalRelatorioVendas.tsx` (Lojinha), `ModalRelatorioCoordenacao.tsx` (Professores), `RelatoriosTab.tsx` (PreAtendimento)
- Periodos: hoje, ontem, semana, mes, personalizado
- Lojinha tipos: diario, semanal, mensal, meta_fideliza

### Lojinha
- `lojinha-alerta-estoque` — alerta estoque baixo via WhatsApp
- `lojinha-enviar-comprovante` — comprovante de venda via WhatsApp
- `lojinha-relatorio-professor` — relatorio comissoes professor
- `lojinha-relatorio-vendas` — relatorio de vendas

### Presenca / Sync Emusys
- `sync-presenca-emusys` (v31, 2026-06-09) — sync aulas/presenca do Emusys (pg_cron diario 22h BRT). **Só registra presença; NÃO calcula mais `dia_aula`/`horario_aula`** (movido para a função SQL `sincronizar_grade_horaria_alunos`).
- **Vínculo de presença POR CURSO (v31):** o `aluno_id` de `aluno_presenca` passou a ser resolvido pela matrícula do **curso da aula** (`mapaAlunosComposto` chave `nome|nascimento|curso_id`), com fallback ao nome quando ambíguo/sem curso. Antes resolvia só por nome → embaralhava alunos com 2+ cursos. `normalizarCurso` agora remove sufixos `" t"`/`" ind"` (turma/individual) do `curso_nome` do Emusys.
- **`sincronizar_grade_horaria_alunos` (reescrita 2026-06-09) — fonte ÚNICA do `dia_aula`/`horario_aula`.** Deriva por **pessoa (nome+unidade) + curso da aula** a partir de `aluno_presenca` (moda do dia/horário, 30d com fallback 60d, ≥3 ocorrências), `UPDATE` só quando muda. Robusta a homônimos/multi-curso e ao histórico embaralhado (reagrupa pelo curso da aula). Cron `sincronizar-grade-horaria` 01:30 UTC. Roda em <1s. Helpers `grade_norm_nome`/`grade_norm_curso` (espelham o TS). **Resolveu o flapping** (horários trocados entre matrículas de aluno multi-curso, oscilando 2×/noite — ex: Mateus K. Paulino com Canto/Power Kids/Canto Coral). Forward-only: histórico de `aluno_presenca` (~60d) não foi saneado.
- **GOTCHA (provado 2026-05-27): o sync de presenca IGNORA o `status` do aluno.** Casa aula→aluno por nome+curso. 64 alunos inativo/evadido/trancado receberam 176 presencas nos ultimos 30 dias. Consequencia: marcar `status='inativo'` NAO para o sync nem tira o aluno de metricas que leem `aluno_presenca` direto (score professor, frequencia). Para um aluno realmente sumir, a linha tem que SAIR de `alunos` (mover p/ `alunos_arquivados`). Soft-delete via status é leaky.
- **Curso real vem da aula, nao do cadastro.** `aulas_emusys` (espelho do endpoint de aula) tem `curso_nome`/`turma_nome`/`professor_nome` corretos. O `alunos.curso_id` (rotulo da matricula via webhook) pode estar errado. Para saber o curso real de um aluno: `aluno_presenca` → `aulas_emusys.curso_nome`. Constraint `uq_presenca_aluno_aula (aluno_id, aula_emusys_id)` garante integridade ao migrar presenca (dedupe obrigatorio por aula_emusys_id, ou por data_aula quando aula_emusys_id IS NULL via indice legado).
- `marcos-jornada` (v1, 2026-06-15) — **on-demand** (chamada pelo front, sem cron). Busca `/v1/aulas/` **FUTURAS** (hoje..hoje+janela, default 7d) por unidade, deduplica individual+turma, resolve `aluno_id` reusando o matching do `sync-presenca-emusys` (copiado: `normalizarNome`/`normalizarCurso` + chave `nome|nasc|curso_id`). Retorna `primeiras_aulas` (nr=1 + matrícula recente) e `marco_aula` (nr=nr_alvo + `numero_renovacoes=0`), ambos excl. projeto banda. **Ignora presença** (Emusys pré-marca futuro como 'ausente'). Aulas futuras NÃO entram em `aluno_presenca`. Aba: Sucesso do Aluno → Acompanhamento → Marcos. Ver [[dominio-alunos.md]].
- `sync-professores-emusys` (v1, 2026-05-20) — sync semanal de professores. Auto-cura `emusys_id` por nome, cria professores novos, vincula a unidades existentes, loga "sumiu da lista" sem desativar. Cron `sync-professores-emusys-semanal`: Domingo 04:00 BRT. Audita em `professores_sync_log`.
- `sync-students-studio` — sync alunos com LA Studio (projeto separado)
- `sync-feriados` — sincroniza feriados (via BrasilAPI) para agenda

### Webhook Matricula (Emusys)
- `processar-matricula-emusys` (v21, 2026-06-05) — recebe webhook Emusys (matricula_nova/renovacao/trancamento/finalizacao). Insere/atualiza `alunos`, `movimentacoes_admin`, atualiza `leads` para convertido. v16 adiciona CAMADA 2 ao `resolverProfessorId` (fallback por nome+unidade com auto-cura do `emusys_id`). **v17**: integra helper `_shared/invariantes.ts` — cada handler chama `checar*()` + `gravarLog()` no final; try/catch externo grava `processamento_falhou_excecao` em exceção. **v20** (2026-05-28): captura `tipo_pagamento` do payload → grava `forma_pagamento_id` em `alunos` (map: Recorrente→1, Cheque→2, Pix→3, Dinheiro→4, Link→5, Boleto→6, Débito→7; desconhecido→null). **v21** (2026-06-05): `converterLead` grava `alunos.lead_origem_id = leadId` após achar o lead (FK `alunos→leads`, reverso do `leads.aluno_id`). Guard `.is('lead_origem_id', null)` evita sobrescrever vínculo existente. Fiscal: aluno convertido de lead deve ter `lead_origem_id` preenchido; matrícula direta (sem lead) fica NULL legitimamente.

### Saude das Automacoes
- `auditor-divergencias-emusys` (v1, 2026-05-20, NOVA) — varre banco com 13 regras SQL idempotentes via RPC `executar_query_auditoria`. Disparo: pg_cron horário OU botão manual no frontend. Grava em `automacao_invariantes` com `idempotency_key='audit:<regra>:<id>'` (re-execução não duplica). Detalhes completos: ver `modulo-saude-automacoes.md`.
- Helper `supabase/functions/_shared/invariantes.ts` — exports: types (`Severidade`, `Invariante`, `GravarLogParams`, `ResultadoMatricula`), `comFallback`, `gravarLog`, `computarHash` (SHA-256), `checarMatricula/Renovacao/Trancamento/Finalizacao`. Usado pela edge de matrícula.
- RPC `executar_query_auditoria(p_sql text)` — SECURITY DEFINER, restrita a `service_role`, aceita só `SELECT`/`WITH`. Usada pelo auditor para rodar queries sem hardcode.
- Tabela `automacao_log` ganhou colunas `status` (ok/warn/erro), `lead_id`, `payload_bruto` (jsonb), `idempotency_key` (UNIQUE).
- Tabela nova `automacao_invariantes` — 1 linha por regra violada, com soft `visto_em`. RLS: SELECT para `authenticated`, UPDATE só para admin.

### Meta WhatsApp Cloud API (Campanhas)
- `meta-webhook-campanhas` — webhook receiver da Meta WhatsApp API (status updates de campanhas)
- `enviar-campanha` — dispatcher batch de campanhas (recursivo, batch 50, delay 100ms)
- `controle-campanha` — UI controller (iniciar/pausar/retomar). Atualiza status em `campanhas`, invoca `enviar-campanha`
- `enviar-mensagem-meta` — envio individual via Meta Cloud API
- `sincronizar-templates` — sync templates aprovados pela Meta
- `gerenciar-templates` — CRUD de templates locais

### Agente Webhook (BI / IA)
- `agente-webhook` — webhook generico para agentes IA (BI agent)
- `bi-agent-lamusic` — BI agent que responde perguntas via LLM (insights ad-hoc)
- `gerar-prompt-agente` — gera prompt customizado para agentes IA
- `jarvis-chat` — chatbot interno IA

### Admin
- `admin-create-user` — criar usuario
- `admin-update-password` — alterar senha
- `enviar-pesquisa-evasao` — pesquisa churn via WhatsApp
- `enviar-pesquisa-pos-primeira-aula` — NPS pós-1ª-aula (Fabi/Sucesso do Aluno). UAZAPI `/send/menu type=list` (v5, botão "Avaliar"; antes `type=button`). 5 opções → notas 1-5 (Esperava mais=1, Foi ok=2, Gostei=3, Gostei muito=4, Amei=5) via `buttonOrListid`. Captura em `processar-resposta-pesquisa` v2 (mapa `NOTA_POR_BOTAO`; recebe webhook UAZAPI direto, NÃO via `webhook-whatsapp-inbox`). ⚠️ notas históricas usavam escala 1/3/5 (foi_ok era 3). Lista nativa não tem campo de texto livre (feedback textual = follow-up ou WhatsApp Flows, pendente)
- `enviar-mensagem-admin` — envia msg WhatsApp admin→aluno (texto+midia), v6 com health check ping (`body.ping` retorna early), `verify_jwt: false`. Retry no frontend via `invokeWithRetry()` (ver padroes-codigo.md). Campo `erro_motivo` em admin_mensagens para tooltip de erro no chat
- `validar-token-feedback` — validar token feedback
- `gerar-relatorio-aluno` — relatorio IA do aluno
- `gerar-plano-aluno` — plano de acao IA do aluno

## pg_cron Jobs
| Job | Schedule | Descricao |
|-----|----------|-----------|
| `processar-mensagens-agendadas` | `* * * * *` (cada minuto) | Processa fila de mensagens WhatsApp |
| `sync-presenca-cg` / `-barra` / `-recreio` | `0/20/40 1 * * *` (22h/22h20/22h40 BRT) | Sync presenca do Emusys por unidade (CG `dias:5`, Barra/Recreio `dias:7`) |
| `sincronizar-grade-horaria` | `30 1 * * *` (22h30 BRT) | `sincronizar_grade_horaria_alunos()` — deriva dia_aula/horario_aula por pessoa+curso |
| `alertas-diarios` | `0 11 * * *` (diario 8h BRT) | Alertas de projetos via WhatsApp |
| `alertas-tarefas-atrasadas` | a cada 2h (11-23 UTC) | Alertas tarefas atrasadas |
| `resumo-semanal` | `0 12 * * 1` (segunda 9h BRT) | Resumo semanal via WhatsApp |
| `snapshot_dados_mensais` | `0 3 1 * *` (dia 1, 0h BRT) | Snapshot mensal de KPIs |
| `warm-enviar-mensagem-admin` | `*/5 * * * *` (cada 5 min) | Warm-up ping para evitar cold start |
| `sync-professores-emusys-semanal` | `0 7 * * 0` (Domingo 4h BRT) | Sync professores Emusys → professores_unidades |
| `auditor-divergencias-cron` | `0 * * * *` (toda hora cheia) | Roda `auditor-divergencias-emusys` (13 regras SQL → `automacao_invariantes`) |

## n8n Workflows

> **Mapa canônico do ciclo Emusys:** `docs/MAPA-INTEGRACAO-EMUSYS.md` (verificado na fonte 2026-06-08, exaustivo). Consultar antes de afirmar como um fluxo Emusys funciona.
> ⚠️ **NocoDB NÃO alimenta mais o Supabase/Performance Report.** Os ramos NocoDB no EB0 e no [Nocodb] leads estão **desconectados/`disabled`**. O NocoDB segue como CRM paralelo (escrito direto pelos agentes Mila), mas fora do nosso ciclo.

### Emusys Webhook — `EB0LibpOJCLhKp7M` ("[ Emusys] WBHK - leads criados")
- Webhook: `POST /webhook/lead_criado` (recebe lead_criado, lead_editado, lead_arquivado)
- Switch "Filtro Evento": case 0 = lead_criado, case 1 = lead_arquivado, case 2 = lead_editado
- **Branch lead_criado:** Preparar Dados Lead → `upsert_lead()` (Supabase). (Nós "Preparar NocoDB" existem mas terminam num IF **sem nó de escrita** → NocoDB NÃO é gravado.)
- **Branch lead_editado:** preparar dados → `upsert_lead()` (Supabase). (Ramo NocoDB desconectado, igual ao criado.)
- **Branch lead_arquivado:** `UPDATE leads SET arquivado=true, status='arquivado', etapa_pipeline_id=11` (Supabase). Preserva leads já `convertido`/`matriculado`.
- Lead criado no NocoDB recebe `Observacoes: "emusys"`
- **`data_contato` (fix 2026-05-25):** `upsert_lead()` passou a re-alinhar `data_contato` no UPDATE (`COALESCE(p_data_contato, data_contato)`), não só no INSERT. Origem: `body.lead.data_hora_criacao`. Antes era write-once → leads migrados (26/03, ~2053) ficavam com data congelada/divergente do Emusys (ex: lead 4522 Renato `05/12/2025` vs Emusys `25/04/2026`). Overload legado `(...,date,boolean)` DROPADO em 2026-05-25 (duplicata morta, sem callers). Validação no agente fiscal-dados (Seção J). Limitação: leads já convertidos/arquivados não recebem mais webhook → não se auto-corrigem (precisariam backfill via API Emusys).

### NocoDB webhook — `1uP2GhoHG1shEFLg` ("[ Nocodb ] Criacao/Atualizacao de leads")
- Webhook: `POST /webhook/nocodb_leads` (disparo automatico do NocoDB on insert/update)
- Branches:
  1. `Webhook` → `Transformar NocoDB → Emusys` → `Preparar Dados Arquivamento1` → `Upsert Lead` (Supabase, origem='nocodb') — **NÓ DESATIVADO (`disabled`) desde ~2026-03-28**. NÃO sincroniza mais NocoDB→Supabase.
  2. `Webhook` → `Call '[ Controle ] Registrar Lead Metrics'` (sub-workflow YiSWPwsuvO74XNAs) — log em tabela NocoDB controle
- **OBSOLETO (verificado 2026-05-25):** a afirmação "upsert_lead sincroniza TODO lead do NocoDB" não vale mais — o nó Upsert está `disabled` e há **0 eventos `evento='nocodb'`** em `leads_automacao_log` (30d). Hoje TODO lead chega ao Supabase só pela via Emusys (`EB0LibpOJCLhKp7M`).
- Nó orfao (desconectado): `Transformar NocoDB → Emusys1` → `enviar para o dashboard do rayan` — outro projeto, nao relevante
- `[ Controle ] Registrar Lead Metrics` (YiSWPwsuvO74XNAs) — apenas log em NocoDB `musrzcrvkkwl27j`

### Sincronizacao bidirecional de leads (confirmado 2026-03-21)
| Origem | → Supabase | → NocoDB | → Emusys |
|--------|------------|----------|----------|
| Emusys webhook | ✅ via EB0LibpOJCLhKp7M | ✅ via EB0LibpOJCLhKp7M | — (ja esta) |
| NocoDB (agente SDR) | ❌ nó Upsert desativado (~28/03/2026) | — (ja esta) | ❌ nao sincroniza |
| Manual (Supabase) | — (ja esta) | ❌ | ❌ |

**Por design:** leads criados no NocoDB (via agente SDR) NAO vao para o Emusys. O Emusys e populado apenas quando o agente SDR chama a API do Emusys diretamente.

### Agentes Mila SDR (3 workflows) — PRINCIPAL FONTE DE LEADS
| Unidade | ID | Nos |
|---------|-----|-----|
| Mila CG | `aHD4kJdzByLwFXA1` | ~110 |
| Mila Recreio | `gSHJHYMOYDQZqleW` | ~110 |
| Mila Barra | `yko5HstPTze0gsIM` | ~110 |

**A maioria dos leads do sistema vem destes 3 fluxos.** Cada agente Mila recebe mensagens WhatsApp, processa com IA (SDR) e chama a API Emusys de cadastro de leads. O Emusys entao dispara o webhook que ativa `EB0LibpOJCLhKp7M`, que faz o upsert no Supabase + NocoDB.

**Cadeia completa:** WhatsApp → Mila SDR → `Cadastrar no Emusys` (API) → Emusys webhook → `EB0LibpOJCLhKp7M` → Supabase + NocoDB

**Fluxo real (ordem confirmada) quando novo lead chega via WhatsApp:**
```
É Aluno Ativo? (NÃO)
  → Cadastrar no Emusys        ← chama API Emusys DIRETAMENTE (UrlEmusys + token por unidade)
  → [sentimentos + SDR agent]
  → Verificacao (NocoDB read)
  → Ta no CRM? (NÃO)
      → Adicionar no CRM de FollowUp   ← cria registro NocoDB (m1e7k051jr4czww)
      → novosLeads                      ← Chatwoot API (custom_attributes) — dead-end
```

**Pipeline completo quando Emusys aceita:**
`Cadastrar no Emusys` → Emusys cria lead → webhook → `EB0LibpOJCLhKp7M` → `upsert_lead()` → Supabase

**Bug conhecido — falha silenciosa:**
- `Cadastrar no Emusys` tem `neverError: true` + `onError: continueRegularOutput`
- Se Emusys rejeita (ex: telefone duplicado → 4xx), a execucao continua como "success"
- Nenhum webhook Emusys e disparado → `EB0LibpOJCLhKp7M` nao roda → Supabase nao recebe o lead
- Resultado: lead aparece no NocoDB mas NAO no Supabase
- Fix pendente: adicionar IF `statusCode >= 300` → Postgres `upsert_lead()` direto

**Outros nodes relevantes:**
- `novosLeads`: chamada Chatwoot API (custom_attributes funil_de_leads="Novos Leads") — NAO eh Supabase
- `update_emusys`: atualiza lead no Emusys quando status muda
- `Verificacao`, `Puxar do CRM`, `retorna pra followup`, `Update de hora no CRM`: NocoDB ops

### Gerenciar CRM NocoDB — `dJ7Dc9LHLTSnKIsi`
- Triggered by Chatwoot webhook (mudanca de estagio)
- Faz apenas **UPDATEs** em registros existentes no NocoDB (Estagio, Lead Score, etc.)
- **NAO cria leads** — nao e responsavel por leads novos

### NocoDB Config
- Credencial: `NocoDB Luciano` (ID: `2KWPkp1f1X1SSto1`, auth: `nocoDbApiToken`)
- Base: `pyhap3besob1yjr`
- Table "Gestao De Leads LA Music": `m1e7k051jr4czww`
- typeVersion: 3

### Mapeamento Estagio Emusys → NocoDB
| Emusys | NocoDB |
|---|---|
| Novo / Novo Lead | Novos Leads |
| Experimental Agendada | Experimental Marcada |
| Realizou experimental / Compareceu | Compareceram |
| Matriculado | Matriculado |
| Faltou aula experimental | Faltaram |

### Telefone entre sistemas
- Supabase: com prefixo 55 (ex: `5521999999999`)
- NocoDB: sem prefixo 55 (ex: `21999999999`)
- Emusys webhook: formato `(21) 99999-9999`

## WhatsApp CRM (UAZAPI)
- Caixas por unidade em `whatsapp_caixas` (uazapi_url, uazapi_token, funcao: agente|sistema|ambos|administrativo)
- Conversas CRM em `crm_conversas` (status: aberta|pausada|encerrada|aguardando, lead_id)
- Mensagens CRM em `crm_mensagens` (direcao: entrada|saida, remetente: lead|mila|andreza|sistema)
- Atribuicao: mila (IA), andreza (humano), nao_atribuido
- Hooks: `useWhatsAppStatus()`, `useWhatsAppCaixas()`, `useMensagens()`, `useConversas()`
- Servico: `src/services/whatsapp.ts` (sendWhatsAppMessage, getWhatsAppConnectionStatus)

## Webhook UAZAPI — auto-configuração (2026-06-15)
- Edge `configurar-webhook-caixa(caixa_id)`: resolve url+token da caixa e faz `POST {uazapi_url}/webhook` com `{enabled:true, url:".../webhook-whatsapp-inbox?caixa_id=<id>", events:["messages","messages_update"], excludeMessages:["wasSentByApi"]}`. UAZAPI only (WAHA retorna não-suportado).
- **GOTCHA**: `POST /webhook` da UAZAPI cria o webhook com `enabled:false` por padrão — SEMPRE incluir `enabled:true`. Conferir com `GET /webhook` (retorna array; `null` = sem webhook = não recebe nada).
- `CaixasManager`: ao salvar caixa UAZAPI ativa, invoca a edge automaticamente (conecta o recebimento sem colar URL manual). Botão Zap por caixa = "Reconectar webhook".
- Sintoma de webhook ausente: `webhook_debug_log` sem linhas + recebidas não aparecem (envio funciona, recebimento não). `admin_conversas`/`admin_mensagens` já estão na publication `supabase_realtime` (realtime OK no banco).

## Caixa de Entrada Administrativa
- Tabelas: `admin_conversas` (1 por aluno por unidade, RLS por unidade; `unidade_id` é NULLABLE desde 2026-06-12) + `admin_mensagens` (CASCADE)
- **Caixa "Todas as unidades"** (2026-06-12): caixa admin com `whatsapp_caixas.unidade_id=NULL` (select grava sentinel `'todas'` → null). Webhook roteia admin mesmo sem unidade fixa, busca aluno GLOBAL e grava conversa na unidade real do aluno. Contato não-aluno → conversa com `unidade_id=NULL` + `aluno_id=NULL` (não-cadastrado); RLS (`NULL IN (...)`=falso) deixa visível só p/ admin. Inbox unificada quando filtro global='todos': `useAdminConversas` não filtra unidade, `AdminInboxList` mostra badge de unidade / "Sem unidade". Nova conversa bloqueada no modo todos.
- **Departamento** (2026-06-12, webhook v39): `whatsapp_caixas.departamento` + `admin_conversas.departamento` ('administrativo' | 'sucesso_aluno', CHECK). Índices únicos da conversa agora incluem departamento: `idx_admin_conversas_aluno_unidade_depto (aluno_id,unidade_id,departamento) WHERE aluno_id NOT NULL` e `idx_admin_conversas_externo_unidade_depto (telefone_externo,unidade_id,departamento) NULLS NOT DISTINCT WHERE aluno_id NULL`. Mesmo aluno pode ter 1 conversa por departamento. CaixasManager: select Departamento aparece quando funcao='administrativo' (dropdowns migrados p/ Radix `@/components/ui/select`). Caixa de Entrada: abas `[Administrativo][Sucesso do Aluno]` filtram `useAdminConversas` por departamento. **Fase 2 PENDENTE**: liga/desliga robô por botão (flag no banco + Sol na VPS respeitar, via la-agents). Sucesso do Aluno = Sol + humano; todas as caixas devem poder ter robô.
- RPC: `admin_conversa_nova_mensagem(p_conversa_id, p_preview, p_whatsapp_jid)` — incrementa nao_lidas atomicamente
- Caixas com `funcao='administrativo'` roteiam msgs do webhook para admin_conversas/admin_mensagens
- Edge Function: `enviar-mensagem-admin` (texto+midia via UAZAPI)
- Webhook: `webhook-whatsapp-inbox` estendido — detecta caixa admin e roteia para alunos
- Hooks: `useAdminConversas()`, `useAdminMensagens()` (com Realtime)
- Componentes: `src/components/App/Administrativo/CaixaEntrada/` (CaixaEntradaTab, AdminInboxList, AdminChatPanel, NovaConversaModal)
- Gravacao de audio: botao Mic (quando textarea vazio) → MediaRecorder API → envia como `tipo: 'audio'` → ptt no WhatsApp
- Widget sentinel: `useWidgetOverlapSentinel()` esconde AdminToolsHub/AuditoriaWidget quando o elemento entra na viewport. ⚠️ `registerSentinel` é singleton (observa 1 elemento) — `BottomSentinel` global do AppLayout compete e geralmente vence, furando o sentinel das páginas. Para esconder de forma confiável use `useForceHideWidgets(ativo)` (imperativo, contador). `CaixaEntradaTab` usa `useForceHideWidgets(!!conversaSelecionada)`.
- Permissao: `administrativo.caixa-entrada`
