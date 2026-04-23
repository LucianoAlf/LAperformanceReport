# Paperclip Monitoring Agents — LA Music

## Objetivo

3 agentes Paperclip rodando na VPS (manager.principal) que monitoram a integridade dos dados, o pipeline comercial e a saude das automacoes. Mix de checks agendados + alertas reativos.

## Infra disponivel

- **Paperclip:** instalado na VPS manager.principal (217.196.63.23)
- **Supabase:** project `ouqwbbermlzqqvtqwlul` (MCP disponivel)
- **n8n:** `https://workla.latecnology.com.br` (API key disponivel)
- **NocoDB:** base `pyhap3besob1yjr`, table `m1e7k051jr4czww`
- **Log existente:** tabela `automacao_log` no Supabase (workflow_id, execution_id, evento, acao, detalhes)
- **Monitoramento VPS:** ja existe workflow n8n `bxt0ZgLvDrTOCihU` (infra, disco, RAM, SSL) — agentes NAO duplicam isso

---

## Agente 1: data-integrity

**Missao:** Detectar divergencias entre Supabase, Emusys e NocoDB. Garantir que os dados consolidados (`dados_mensais`, `dados_comerciais`) batem com as tabelas-fonte.

**Schedule:** A cada 6 horas (routine com cron trigger)

### Checks

| # | Check | Query/Metodo | Severidade |
|---|-------|-------------|------------|
| 1 | Leads com `converteu=true` mas `status != 'convertido'` ou `etapa_pipeline_id != 10` | `SELECT count(*) FROM leads WHERE converteu = true AND (status != 'convertido' OR etapa_pipeline_id != 10)` | HIGH |
| 2 | Leads convertidos sem `emusys_lead_id` | `SELECT count(*) FROM leads WHERE converteu = true AND emusys_lead_id IS NULL` | MEDIUM |
| 3 | Leads convertidos sem telefone | `SELECT count(*) FROM leads WHERE converteu = true AND telefone IS NULL` | MEDIUM |
| 4 | `dados_mensais` vs contagem real de alunos ativos | Comparar `dados_mensais.total_alunos` com `SELECT count(*) FROM alunos WHERE status = 'ativo' AND unidade_id = X` | HIGH |
| 5 | `dados_mensais` vs contagem real de evasoes | Comparar campo evasoes com `SELECT count(*) FROM movimentacoes_admin WHERE tipo IN ('evasao','nao_renovacao') AND mes/ano = X` | HIGH |
| 6 | Leads duplicados (mesmo telefone + unidade, nao arquivados) | `SELECT telefone, unidade_id, count(*) FROM leads WHERE arquivado = false AND telefone IS NOT NULL GROUP BY telefone, unidade_id HAVING count(*) > 1` | MEDIUM |
| 7 | Alunos com health_score NULL (batch nao rodou) | `SELECT count(*) FROM alunos WHERE status = 'ativo' AND health_score IS NULL` | LOW |

### Output

- Se ZERO divergencias: comentario curto no issue "All clear - {timestamp}"
- Se divergencias encontradas: cria subtask por severidade HIGH com detalhes (IDs afetados, query usada)
- Sempre posta resumo: `{n} checks passed, {m} divergences found`

### Env vars necessarias

```
SUPABASE_URL=https://ouqwbbermlzqqvtqwlul.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
```

### Prompt do agente

```
Voce e o agente de integridade de dados da LA Music. Sua missao e garantir que os dados entre sistemas estejam consistentes.

A cada heartbeat, execute os checks de integridade na ordem definida. Use a Supabase service_role key para queries SQL diretas.

Regras:
- Nunca altere dados. Voce so le e reporta.
- Divergencias HIGH devem virar subtask para investigacao.
- Divergencias MEDIUM/LOW vao no comentario do issue.
- Inclua sempre os IDs afetados (max 20) e a query usada.
- Timezone: BRT (UTC-3) para todas as datas.
- Unidades: CG (2ec861f6-023f-4d7b-9927-3960ad8c2a92), Recreio (95553e96-971b-4590-a6eb-0201d013c14d), Barra (368d47f5-2d88-4475-bc14-ba084a9a348e).
```

---

## Agente 2: pipeline-watchdog

**Missao:** Monitorar o funil comercial em tempo real. Detectar leads travados, fluxo quebrado e anomalias de volume.

**Schedule:** A cada 4 horas (routine com cron trigger)

### Checks

| # | Check | Query/Metodo | Severidade |
|---|-------|-------------|------------|
| 1 | Leads com status `novo` ha mais de 7 dias sem interacao | `SELECT count(*) FROM leads WHERE status = 'novo' AND created_at < now() - interval '7 days' AND arquivado = false` | MEDIUM |
| 2 | Experimentais agendadas ha mais de 3 dias sem status atualizado | `SELECT count(*) FROM lead_experimentais WHERE status = 'agendada' AND data_experimental < now() - interval '3 days'` | HIGH |
| 3 | Leads com `experimental_agendada = true` mas sem registro em `lead_experimentais` | `SELECT l.id FROM leads l WHERE l.experimental_agendada = true AND NOT EXISTS (SELECT 1 FROM lead_experimentais le WHERE le.lead_id = l.id) AND l.arquivado = false` | HIGH |
| 4 | Leads no Emusys sem correspondente no Supabase (contagem por unidade) | Comparar contagem Emusys (via n8n API ou NocoDB) vs `SELECT count(*) FROM leads WHERE unidade_id = X AND date_trunc('month', data_contato) = Y` | MEDIUM |
| 5 | Volume anomalo: leads criados hoje vs media dos ultimos 30 dias | Se hoje < 30% da media diaria, alertar | LOW |
| 6 | Etapa pipeline inconsistente com status | `SELECT count(*) FROM leads WHERE (etapa_pipeline_id = 10 AND status != 'convertido') OR (etapa_pipeline_id = 11 AND arquivado = false)` | HIGH |
| 7 | Matriculas sem lead correspondente | `SELECT count(*) FROM alunos a WHERE a.status = 'ativo' AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.telefone = a.telefone AND l.unidade_id = a.unidade_id)` | LOW |

### Output

- Leads travados: lista com nome, telefone (ultimos 4 digitos), dias parado, unidade
- Anomalias de volume: grafico textual simples (hoje vs media)
- Subtasks para divergencias HIGH

### Env vars necessarias

```
SUPABASE_URL=https://ouqwbbermlzqqvtqwlul.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
```

### Prompt do agente

```
Voce e o watchdog do pipeline comercial da LA Music. Sua missao e garantir que leads fluam pelo funil sem travar e que nenhuma anomalia passe despercebida.

A cada heartbeat, execute os checks do pipeline. Foque em:
1. Leads parados (sem progressao no funil)
2. Experimentais orfas ou atrasadas
3. Inconsistencias entre status e etapa
4. Volume anomalo de leads

Regras:
- Nunca altere dados. Voce so le e reporta.
- Leads travados ha mais de 7 dias sao urgentes — crie subtask.
- Sempre agrupe por unidade nos relatorios.
- Timezone: BRT (UTC-3).
- Unidades: CG (2ec861f6-023f-4d7b-9927-3960ad8c2a92), Recreio (95553e96-971b-4590-a6eb-0201d013c14d), Barra (368d47f5-2d88-4475-bc14-ba084a9a348e).
- Reentradas de leads antigos NAO sao bugs (ver regras de negocio).
```

---

## Agente 3: automation-health

**Missao:** Monitorar execucoes de workflows n8n, pg_cron jobs e edge functions. Detectar falhas silenciosas.

**Schedule:** A cada 2 horas (routine com cron trigger)

### Checks

| # | Check | Query/Metodo | Severidade |
|---|-------|-------------|------------|
| 1 | Execucoes falhadas no n8n (ultimas 2h) | n8n API: `GET /api/v1/executions?status=error&limit=20` | HIGH |
| 2 | Workflows criticos sem execucao nas ultimas 24h | Verificar se `EB0LibpOJCLhKp7M` (Emusys), `ZzuR9slRx8UqXg9N` (Matricula) tiveram ao menos 1 execucao | MEDIUM |
| 3 | pg_cron: sync-presenca rodou nas ultimas 24h | `SELECT * FROM automacao_log WHERE workflow_id = 'sync-presenca-emusys' AND created_at > now() - interval '24 hours'` | HIGH |
| 4 | pg_cron: snapshot_dados_mensais rodou no dia 1 | No dia 2+, verificar se existe registro do dia 1 do mes atual | MEDIUM |
| 5 | Edge functions com erro (ultimas 2h) | Supabase MCP: `get_logs` com filtro de erro | HIGH |
| 6 | automacao_log: acoes com status `erro` nas ultimas 2h | `SELECT * FROM automacao_log WHERE acao LIKE '%erro%' AND created_at > now() - interval '2 hours'` | HIGH |
| 7 | Fila de mensagens agendadas travada | `SELECT count(*) FROM mensagens_agendadas WHERE status = 'pendente' AND created_at < now() - interval '10 minutes'` | HIGH |
| 8 | Warm-up edge function respondendo | Chamar `enviar-mensagem-admin` com payload de ping e verificar 200 | LOW |

### Output

- Falhas n8n: workflow name, execution ID, erro resumido, link direto
- pg_cron: status de cada job (OK/MISSED/ERROR)
- Edge functions: nome, status code, erro
- Subtasks para falhas HIGH

### Env vars necessarias

```
SUPABASE_URL=https://ouqwbbermlzqqvtqwlul.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
N8N_API_URL=https://workla.latecnology.com.br
N8N_API_KEY=<n8n_api_key>
```

### Prompt do agente

```
Voce e o agente de saude das automacoes da LA Music. Sua missao e garantir que todos os workflows, cron jobs e edge functions estejam operacionais.

A cada heartbeat, verifique:
1. Execucoes falhadas no n8n (API REST)
2. pg_cron jobs (via automacao_log no Supabase)
3. Edge functions com erro (via logs Supabase)
4. Fila de mensagens agendadas

Regras:
- Nunca altere dados ou reinicie servicos. Voce so monitora e reporta.
- Falhas criticas (HIGH) devem virar subtask imediatamente.
- Inclua sempre: nome do workflow/funcao, ID da execucao, mensagem de erro.
- Links n8n: https://workla.latecnology.com.br/workflow/{id}/executions/{exec_id}
- Timezone: BRT (UTC-3).

Workflows criticos (devem ter execucoes regulares):
- EB0LibpOJCLhKp7M — Emusys webhook leads
- ZzuR9slRx8UqXg9N — Matricula funcional
- aHD4kJdzByLwFXA1 — Mila CG
- gSHJHYMOYDQZqleW — Mila Recreio
- yko5HstPTze0gsIM — Mila Barra
- bxt0ZgLvDrTOCihU — Monitoramento VPS (a cada 1h)
```

---

## Configuracao no Paperclip

### Adapter config (para os 3 agentes)

```json
{
  "adapter": "claude_local",
  "cwd": "/root/la-monitoring",
  "env": {
    "SUPABASE_URL": "https://ouqwbbermlzqqvtqwlul.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY": "${SUPABASE_SERVICE_ROLE_KEY}"
  }
}
```

Para o `automation-health`, adicionar:
```json
{
  "N8N_API_URL": "https://workla.latecnology.com.br",
  "N8N_API_KEY": "${N8N_API_KEY}"
}
```

### Routines (schedules)

| Agente | Cron | Concurrency |
|--------|------|-------------|
| data-integrity | `0 */6 * * *` (a cada 6h) | drop (se anterior ainda roda, pula) |
| pipeline-watchdog | `0 */4 * * *` (a cada 4h) | drop |
| automation-health | `0 */2 * * *` (a cada 2h) | drop |

### Hierarquia

Os 3 agentes reportam ao mesmo manager (ou ao CEO). Subtasks criadas por eles devem ter `goalId` do projeto de monitoramento.

---

## O que voce precisa passar pro CEO do Paperclip

Copie e cole a mensagem abaixo:

---

**Mensagem para o CEO Paperclip:**

> Preciso que voce crie 3 agentes de monitoramento para o projeto LA Music Performance Report. Todos sao readonly (nunca alteram dados, so leem e reportam).
>
> **1. data-integrity**
> - Missao: detectar divergencias entre Supabase e outros sistemas (Emusys, NocoDB)
> - Routine: cron `0 */6 * * *` (a cada 6h), concurrency: drop
> - Adapter: claude_local
> - Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
> - Prompt: [cole o prompt do agente 1 acima]
>
> **2. pipeline-watchdog**
> - Missao: monitorar funil comercial, leads travados, anomalias de volume
> - Routine: cron `0 */4 * * *` (a cada 4h), concurrency: drop
> - Adapter: claude_local
> - Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
> - Prompt: [cole o prompt do agente 2 acima]
>
> **3. automation-health**
> - Missao: monitorar workflows n8n, pg_cron, edge functions, detectar falhas silenciosas
> - Routine: cron `0 */2 * * *` (a cada 2h), concurrency: drop
> - Adapter: claude_local
> - Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, N8N_API_URL, N8N_API_KEY
> - Prompt: [cole o prompt do agente 3 acima]
>
> Todos reportam a voce. Crie um projeto "LA Monitoring" para agrupar os issues.

---

## Proximos passos

1. Criar os 3 agentes no Paperclip (via CEO)
2. Configurar env vars na VPS
3. Criar as routines com cron triggers
4. Fazer um dry-run manual de cada agente
5. Ajustar thresholds conforme resultados iniciais
6. (Futuro) Criar RPCs dedicadas no Supabase para checks mais complexos (ex: `check_dados_mensais_divergence`)
