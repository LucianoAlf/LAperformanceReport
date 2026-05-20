# Integracao e Infraestrutura — LA Music

## Supabase
- Project ID: `ouqwbbermlzqqvtqwlul` (LA Performance Report — principal)
- Outros projetos do usuario: `aexacbmirdlcssmjjbzx` (emusys-webhook, nao acessivel via MCP), `rhxqwraqpabgecgojytj` (LA Studio Manager), `ubdvtjbitozhkuvvqkxj` (la-music-folha), `xfqgcfeoswlkcgdtikco` (La_Pulse_v2)
- 41+ edge functions ativas
- Extensions: pg_cron, pg_net (HTTP requests de dentro do banco)

## Edge Functions (por categoria)

### WhatsApp / CRM
- `webhook-whatsapp-inbox` — router UAZAPI (messages + messages_update)
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
- `sync-presenca-emusys` (v24) — sync aulas/presenca do Emusys (pg_cron diario 22h BRT)
- `sync-professores-emusys` (v1, 2026-05-20) — sync semanal de professores. Auto-cura `emusys_id` por nome, cria professores novos, vincula a unidades existentes, loga "sumiu da lista" sem desativar. Cron `sync-professores-emusys-semanal`: Domingo 04:00 BRT. Audita em `professores_sync_log`.
- `sync-students-studio` — sync alunos com LA Studio (projeto separado)
- `sync-feriados` — sincroniza feriados (via BrasilAPI) para agenda

### Webhook Matricula (Emusys)
- `processar-matricula-emusys` (v17, 2026-05-20) — recebe webhook Emusys (matricula_nova/renovacao/trancamento/finalizacao). Insere/atualiza `alunos`, `movimentacoes_admin`, atualiza `leads` para convertido. v16 adiciona CAMADA 2 ao `resolverProfessorId` (fallback por nome+unidade com auto-cura do `emusys_id`). **v17**: integra helper `_shared/invariantes.ts` — cada handler chama `checar*()` + `gravarLog()` no final; try/catch externo grava `processamento_falhou_excecao` em exceção.

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
- `enviar-mensagem-admin` — envia msg WhatsApp admin→aluno (texto+midia), v6 com health check ping (`body.ping` retorna early), `verify_jwt: false`. Retry no frontend via `invokeWithRetry()` (ver padroes-codigo.md). Campo `erro_motivo` em admin_mensagens para tooltip de erro no chat
- `validar-token-feedback` — validar token feedback
- `gerar-relatorio-aluno` — relatorio IA do aluno
- `gerar-plano-aluno` — plano de acao IA do aluno

## pg_cron Jobs
| Job | Schedule | Descricao |
|-----|----------|-----------|
| `processar-mensagens-agendadas` | `* * * * *` (cada minuto) | Processa fila de mensagens WhatsApp |
| `sync-presenca-emusys` | `0 1 * * *` (diario 22h BRT) | Sync presenca do Emusys |
| `alertas-diarios` | `0 11 * * *` (diario 8h BRT) | Alertas de projetos via WhatsApp |
| `alertas-tarefas-atrasadas` | a cada 2h (11-23 UTC) | Alertas tarefas atrasadas |
| `resumo-semanal` | `0 12 * * 1` (segunda 9h BRT) | Resumo semanal via WhatsApp |
| `snapshot_dados_mensais` | `0 3 1 * *` (dia 1, 0h BRT) | Snapshot mensal de KPIs |
| `warm-enviar-mensagem-admin` | `*/5 * * * *` (cada 5 min) | Warm-up ping para evitar cold start |
| `sync-professores-emusys-semanal` | `0 7 * * 0` (Domingo 4h BRT) | Sync professores Emusys → professores_unidades |
| `auditor-divergencias-cron` | `0 * * * *` (toda hora cheia) | Roda `auditor-divergencias-emusys` (13 regras SQL → `automacao_invariantes`) |

## n8n Workflows

### Emusys Webhook — `EB0LibpOJCLhKp7M` ("[ Emusys] WBHK - leads criados")
- Webhook: `POST /webhook/lead_criado` (recebe lead_criado, lead_editado, lead_arquivado)
- Switch "Filtro Evento": case 0 = lead_criado, case 1 = lead_arquivado, case 2 = lead_editado
- **Branch lead_criado:** Preparar Dados Lead → Upsert Lead (Supabase) → Preparar NocoDB → Criar Lead NocoDB
- **Branch lead_editado:** Preparar Dados Arquivamento1 → manda pro dash do rayan3 → Upsert Lead Editado (Supabase) → Preparar Update NocoDB → Buscar Lead NocoDB → Atualizar Lead NocoDB
- Lead criado no NocoDB recebe `Observacoes: "emusys"`

### NocoDB webhook — `1uP2GhoHG1shEFLg` ("[ Nocodb ] Criacao/Atualizacao de leads")
- Webhook: `POST /webhook/nocodb_leads` (disparo automatico do NocoDB on insert/update)
- Branches ativas:
  1. `Webhook` → `Transformar NocoDB → Emusys` → `Preparar Dados Arquivamento1` → `Upsert Lead` (Supabase com origem='nocodb')
  2. `Webhook` → `Call '[ Controle ] Registrar Lead Metrics'` (sub-workflow YiSWPwsuvO74XNAs) — log em tabela NocoDB controle
- O upsert_lead() sincroniza TODO lead do NocoDB para Supabase (confirmado 2026-03-21)
- Nó orfao (desconectado): `Transformar NocoDB → Emusys1` → `enviar para o dashboard do rayan` — outro projeto, nao relevante
- `[ Controle ] Registrar Lead Metrics` (YiSWPwsuvO74XNAs) — apenas log em NocoDB `musrzcrvkkwl27j`

### Sincronizacao bidirecional de leads (confirmado 2026-03-21)
| Origem | → Supabase | → NocoDB | → Emusys |
|--------|------------|----------|----------|
| Emusys webhook | ✅ via EB0LibpOJCLhKp7M | ✅ via EB0LibpOJCLhKp7M | — (ja esta) |
| NocoDB (agente SDR) | ✅ via 1uP2GhoHG1shEFLg | — (ja esta) | ❌ nao sincroniza |
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

## Caixa de Entrada Administrativa
- Tabelas: `admin_conversas` (1 por aluno por unidade, RLS por unidade) + `admin_mensagens` (CASCADE)
- RPC: `admin_conversa_nova_mensagem(p_conversa_id, p_preview, p_whatsapp_jid)` — incrementa nao_lidas atomicamente
- Caixas com `funcao='administrativo'` roteiam msgs do webhook para admin_conversas/admin_mensagens
- Edge Function: `enviar-mensagem-admin` (texto+midia via UAZAPI)
- Webhook: `webhook-whatsapp-inbox` estendido — detecta caixa admin e roteia para alunos
- Hooks: `useAdminConversas()`, `useAdminMensagens()` (com Realtime)
- Componentes: `src/components/App/Administrativo/CaixaEntrada/` (CaixaEntradaTab, AdminInboxList, AdminChatPanel, NovaConversaModal)
- Gravacao de audio: botao Mic (quando textarea vazio) → MediaRecorder API → envia como `tipo: 'audio'` → ptt no WhatsApp
- Widget sentinel: `CaixaEntradaTab` registra `useWidgetOverlapSentinel()` para esconder AdminToolsHub/AuditoriaWidget
- Permissao: `administrativo.caixa-entrada`
