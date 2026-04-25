# Sistema de Visitas e Feriados

Documentação completa do sistema de agendamento de visitas presenciais e tratamento de feriados. Atualizado 2026-04-24.

---

## 1. Visão geral

Sistema que permite:
- Agendamento de **visitas presenciais** por leads via WhatsApp (Mila) ou frontend
- Validação automática (horário comercial, feriados, lotação, horas cheias)
- Cancelamento/remarcação pelo staff no frontend
- Bloqueio de feriados nacionais (sync BrasilAPI) e municipais/recessos manuais
- Check de horário comercial no momento da transferência de atendimento (Mila → consultor humano)

**Escopo atual:** apenas Campo Grande (CG). Barra e Recreio têm fallback silencioso — não oferecem visita pela Mila.

---

## 2. Arquitetura (fluxo alto nível)

```
┌──────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│  Lead WhatsApp   │────▶│  Mila CG (n8n)       │     │  Supabase       │
│                  │     │  aHD4kJdzByLwFXA1    │◀───▶│  ouqwbbermlzqq. │
└──────────────────┘     └──────────────────────┘     │                 │
                                  │    │              │  Tabelas:       │
                                  │    │              │  - visitas      │
                    ┌─────────────┘    └──────────┐   │  - visitas_     │
                    │                             │   │    config       │
                    ▼                             ▼   │  - feriados     │
         ┌────────────────────┐       ┌──────────────┐│  - leads        │
         │  agendar_visita    │       │  transferir  ││  - unidades     │
         │  vvrVXSMHtwD0Du6Z  │       │  vTJI0kK7Z...││  - mila_config  │
         │  (sub-workflow)    │       │  (sub-wf)    ││                 │
         └────────────────────┘       └──────────────┘│  RPCs:          │
                    │                         │       │  - mila_check_. │
                    │ salva + abre conversa   │       │                 │
                    │                         │ check horario/feriado   │
                    │                         │ + assignment + notific. │
                    ▼                         ▼       └─────────────────┘
         ┌─────────────────────────────────────┐
         │  Chatwoot (conversa aberta +        │
         │  assignment pro consultor humano)   │
         └─────────────────────────────────────┘

                                                     ┌─────────────────┐
                                                     │  Frontend       │
                                                     │  LAperformance. │
                                                     │                 │
                                                     │  - AgendaTab    │
                                                     │    (lê visitas) │
                                                     │  - ConfigPre-   │
                                                     │    Atendimento  │
                                                     │    (CRUD)       │
                                                     └─────────────────┘
```

---

## 3. Base de dados (Supabase `ouqwbbermlzqqvtqwlul`)

### 3.1 Tabela `visitas`

Fonte de verdade de todo agendamento de visita.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | ID da visita |
| `unidade_id` | uuid FK → `unidades.id` | Unidade onde vai acontecer |
| `lead_id` | integer FK → `leads.id` (nullable) | Lead do Supabase (pode ser null se não encontrado) |
| `emusys_lead_id` | integer (nullable) | ID do lead no Emusys (backup caso Supabase não tenha) |
| `nome` | text | Nome do visitante |
| `telefone` | text | Telefone |
| `data` | date | Data da visita |
| `horario` | time | Horário (CHECK: só minuto=0 e segundo=0 — hora cheia) |
| `status` | text | `agendada` / `realizada` / `nao_compareceu` / `cancelada` |
| `observacoes` | text nullable | Observações livres |
| `criado_por` | text | `mila` (pela IA) ou `manual` (pelo frontend) |
| `created_at` | timestamptz | Auto |
| `updated_at` | timestamptz | Auto (trigger) |

**Constraints:**
- `visitas_hora_cheia_chk`: `EXTRACT(MINUTE FROM horario) = 0 AND EXTRACT(SECOND FROM horario) = 0`
- `visitas_status_chk`: status em `('agendada', 'realizada', 'nao_compareceu', 'cancelada')`
- `visitas_criado_por_chk`: criado_por em `('mila', 'manual')`

**Índices:**
- `idx_visitas_unidade_data (unidade_id, data)`
- `idx_visitas_telefone (telefone)`
- `idx_visitas_emusys_lead_id (emusys_lead_id)` (partial: WHERE IS NOT NULL)
- `idx_visitas_status_data (status, data)` (partial: WHERE status='agendada')

**RLS:**
- `service_role`: acesso total (usado pelo n8n)
- `authenticated`: SELECT e UPDATE/INSERT

---

### 3.2 Tabela `visitas_config`

Configuração por unidade: janela de funcionamento e lotação máxima.

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| `id` | uuid PK | gen_random_uuid() | - |
| `unidade_id` | uuid FK UNIQUE | - | Uma linha por unidade |
| `max_visitas_por_horario` | integer | 2 | Limite simultâneo por horário |
| `horario_inicio_seg_sex` | time | '11:00' | Início seg-sex |
| `horario_fim_seg_sex` | time | '20:00' | Fim seg-sex |
| `horario_inicio_sab` | time | '08:00' | Início sábado |
| `horario_fim_sab` | time | '14:00' | Fim sábado |
| `ativo` | boolean | true | Se sistema de visitas está ativo |

**Constraint:** `max_visitas_por_horario BETWEEN 1 AND 20`

**Estado atual:**
- **Campo Grande** (`2ec861f6-023f-4d7b-9927-3960ad8c2a92`): 2 visitas/horário, seg-sex 11-20, sáb 8-14, ativo
- **Barra** e **Recreio**: sem registro → fallback silencioso (ver §7)

---

### 3.3 Tabela `feriados`

Feriados nacionais (sync BrasilAPI), municipais e recessos internos. Tabela **global** (sem `unidade_id`).

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | - |
| `data` | date UNIQUE | Data do feriado |
| `nome` | text | Ex: "Tiradentes", "São Jorge" |
| `tipo` | text | `national`, `municipal`, `recesso` |
| `ativo` | boolean | Se está bloqueando agendamentos |
| `created_at` / `updated_at` | timestamptz | - |

**Edge Function:** `sync-feriados` (ver §5.2)

---

### 3.4 Tabela `mila_config` (campos relevantes ao sistema)

| Coluna | Descrição |
|--------|-----------|
| `unidade_id` | FK unidade |
| `token_quepasa` | Token do bot WhatsApp por unidade (adicionado 2026-04-24) |
| `horario_funcionamento` | Texto livre pra Mila informar ao lead |

---

### 3.5 RPC `mila_check_disponibilidade_visita`

Função usada pelo n8n para validar disponibilidade antes de salvar.

**Assinatura:**
```sql
mila_check_disponibilidade_visita(
  p_unidade_id uuid,
  p_data       date,
  p_horario    time,
  p_telefone   text DEFAULT NULL
) RETURNS jsonb
```

**Sequência de validações (early-return no primeiro fail):**

1. `visitas_config` existe pra unidade e está ativo? Se não → `"Sistema de visitas nao esta ativo para esta unidade"`
2. É feriado ativo? Se sim → `"Escola fechada — {nome do feriado}"` (sem sugestões)
3. Telefone já tem visita agendada? Se sim → `"Voce ja possui uma visita agendada..."` (sem sugestões)
4. É domingo? Se sim → `"Nao atendemos aos domingos"` (sem sugestões)
5. Determina janela do dia (seg-sex vs sáb) e **calcula `horarios_disponiveis` do dia** (horas cheias livres)
6. Hora cheia? Se não → bloqueia **com `horarios_disponiveis`**
7. Dentro da janela? Se não → bloqueia **com `horarios_disponiveis`**
8. Lotado? Se sim → bloqueia **com `horarios_disponiveis`**
9. Disponível → `{ disponivel: true }`

**Retorno típico:**
```json
// Sucesso
{ "disponivel": true }

// Erro com sugestões
{
  "disponivel": false,
  "motivo": "Horario lotado (2/2 visitas neste horario)",
  "horarios_disponiveis": ["11:00","12:00","14:00","15:00"]
}

// Erro sem sugestões (dia inteiro bloqueado)
{ "disponivel": false, "motivo": "Escola fechada — São Jorge" }
```

---

## 4. Workflows n8n

### 4.1 Sub-workflow `SubWorkflow - Agendar Visita (Supabase)`

**ID:** `vvrVXSMHtwD0Du6Z`
**URL:** https://workla.latecnology.com.br/workflow/vvrVXSMHtwD0Du6Z

**Trigger:** `Execute Workflow Trigger` (chamado pela tool `agendar_visita` da Mila CG)

**Inputs:**
| Campo | Tipo | Origem |
|---|---|---|
| `unidade` | string | fixo na tool (ex: "Campo Grande" na Mila CG) |
| `nome_lead` | string | AI preenche |
| `data_visita` | string `YYYY-MM-DD` | AI preenche |
| `hora_visita` | string `HH:MM` | AI preenche |
| `id_conversa` | number | contexto (`$('Parametros').item.json.id_conversa`) |
| `Telefone` | string | contexto (`$('Parametros').item.json.Telefone.slice(2)`) |
| `modo_teste` | boolean | fixo (false em produção, true pra testes sem salvar) |

> **Obs:** `url_chatwoot` e `id_conta` NÃO fazem parte dos inputs — estão hardcoded no node `abrir conversa` (`https://chatmusic.poliredeomnichat.com.br` e `5`) pra manter a tool simples e evitar configuração redundante em cada Mila.

**Flow:**

```
Execute Workflow Trigger
  ↓
Edit Fields (injeta service_role_lareport)
  ↓
Buscar unidade_id  →  GET /unidades?nome=eq.{unidade}&select=id
  ↓
Verificar Disponibilidade  →  POST /rpc/mila_check_disponibilidade_visita
  ↓
Disponivel? (IF disponivel===true)
  ├─ false → Erro: Indisponivel (retorna motivo + horarios_disponiveis)
  └─ true → Modo Teste?
              ├─ true → Sucesso Teste (sem salvar)
              └─ false → Buscar Lead (GET /leads?telefone=eq.X&select=id,emusys_lead_id&limit=1)
                         ↓
                         Salvar Visita (POST /visitas com lead_id via JSON.stringify + guards)
                         ↓
                         Atualizar Lead (PATCH /leads?telefone=eq.X — preserva Pipeline/Dashboard)
                         ↓
                         Abrir Conversa (Chatwoot toggle_status=open)
                         ↓
                         Sucesso
```

**Características:**
- `Salvar Visita` usa `JSON.stringify` em cada campo do jsonBody pra garantir JSON válido com null/numbers/strings
- `Atualizar Lead` preenche `etapa_pipeline_id=5`, `tipo_agendamento='visita'`, `data_experimental`, etc — necessário pra compatibilidade com Pipeline/Dashboard que ainda leem de `leads` (ver TODO §8)
- Nenhum node crítico tem `onError: continueRegularOutput` → falha hard se `Salvar Visita` der erro, evita falso sucesso
- `modo_teste=true` faz curto-circuito sem tocar banco nem Chatwoot (útil pra testes via Postman-style)

---

### 4.2 Sub-workflow `Transferencia de atendimento`

**ID:** `vTJI0kK7Z38DNDe0`
**URL:** https://workla.latecnology.com.br/workflow/vTJI0kK7Z38DNDe0

Ponto único de transferência da Mila → humano. Chamado pela tool `transferir` das 3 Milas (CG, Barra, Recreio).

**Integração com sistema de visitas (adicionado 2026-04-24):**

Entre o `normalizar` (Set) e o `direcionarTransferencia` (Switch), foram inseridos nodes de **check de horário comercial + feriado**:

```
normalizar
  ↓
Injetar Config Horario (Set: _supabase_url, _sr_key, _unidade_nome baseado no Consultor)
  ↓
Buscar visitas_config  →  GET /unidades?nome=eq.X&select=id,visitas_config(*)
  ↓
Buscar Feriado Hoje  →  GET /feriados?data=eq.HOJE&ativo=eq.true
  ↓
Verificar Horario e Feriado (Code node, precedência):
  1) sem visitas_config → _dentro_horario: true (fallback silencioso → transfere sem aviso)
  2) feriado hoje → _dentro_horario: false + mensagem "Hoje é {nome}, escola fechada..."
  3) domingo → _dentro_horario: false + mensagem janela
  4) fora da janela → _dentro_horario: false + mensagem janela
  5) dentro da janela → _dentro_horario: true
  ↓
Dentro do horario? (IF)
  ├─ true → direcionarTransferencia
  └─ false → Enviar Aviso ao Lead (envia WhatsApp via Quepasa com a mensagem) → direcionarTransferencia
```

O node `direcionarTransferencia` roteia por `Situação` para 6 branches:

| Situação | O que faz |
|---|---|
| `Quer Preço` | Notifica consultor + atribui + Chatwoot open + notifica Andreza |
| `Sem Interesse` | Idem + arquiva no NocoDB |
| `Experimental` | Idem (consultor coleta dados da experimental) |
| `Tratativa` | Idem |
| `Unidade Errada` | Notifica Andreza como supervisora |
| **`Visita`** (novo) | Notifica Vitória que visita já foi agendada + assignment + nota privada |

**Timezone:** todas as verificações usam `America/Sao_Paulo` (Luxon `setZone` pro feriado, `Intl.DateTimeFormat` pra hora/dia).

---

### 4.3 Agente SDR Mila CG

**ID:** `aHD4kJdzByLwFXA1`

Tools relevantes:
- `agendar_visita` (→ `vvrVXSMHtwD0Du6Z`) — só na Mila CG
- `transferir` (→ `vTJI0kK7Z38DNDe0`) — nas 3 Milas

**Prompt (v3, 2026-04-24):**
- Etapa 5: oferece **aula experimental OU visita** (só CG)
- Etapa 6a (experimental): transfere direto, sem coletar dados — consultor humano coleta
- Etapa 6b (visita): pergunta dia/hora → chama `agendar_visita` → confirma com lead → chama `transferir` com `Situação="Visita"`
- Regra: visita OU experimental, nunca as duas
- Horários CG: seg-sex 11h-20h, sáb 8h-14h

O campo `Situação` da tool `transferir` na Mila CG tem descrição com todos os 6 valores aceitos (Sem Interesse, Quer Preço, Experimental, Visita, Tratativa, Unidade Errada) para o LLM saber quais usar.

---

## 5. Edge Functions

### 5.1 (Sem edge function dedicada para visitas)

A RPC `mila_check_disponibilidade_visita` roda direto no Postgres (SECURITY DEFINER).

### 5.2 `sync-feriados`

Sincroniza feriados nacionais via [BrasilAPI](https://brasilapi.com.br/api/feriados/v1/{ano}).

- **Endpoint:** `POST /functions/v1/sync-feriados`
- **Body:** `{ "ano": 2026 }` (default: ano atual)
- **UPSERT por data.** Não reativa feriados desativados manualmente.
- **pg_cron:** job `sync-feriados-anual` roda 1º de janeiro às 12h UTC

---

## 6. Frontend

### 6.1 Hooks

#### `useVisitas` — [useVisitas.ts](../src/components/App/PreAtendimento/hooks/useVisitas.ts)

Novo hook (2026-04-24). Fonte única de visitas pra UI.

```typescript
const { visitas, loading, error, refetch } = useVisitas({ unidadeId, ano, mes });
```

- Query: `SELECT visitas.*, lead:lead_id(...)` com LEFT JOIN em `leads`
- Filtros: `unidade_id` (da visita) + `data` no range do mês + `status != 'cancelada'`
- Retorna `Visita[]` com join opcional em lead

#### `useLeadsCRM` — existente

Continua como fonte única de leads + pipeline.

---

### 6.2 `AgendaTab` (Pré-Atendimento > Agenda)

[AgendaTab.tsx](../src/components/App/PreAtendimento/tabs/AgendaTab.tsx)

**Depois do refactor de 2026-04-24:**

- **Experimentais** vêm de `leads` (`data_experimental` + `experimental_agendada=true` + `tipo_agendamento !== 'visita'`)
- **Visitas** vêm da tabela `visitas` via `useVisitas`
- Cada evento é associado ao lead (via `visita.lead` do join, ou lead "sintético" se não houver)
- Dias de feriado aparecem com **borda rosa** + nome do feriado visível
- Funciona nas visões: mês, semana, dia, lista

**Filtro por unidade:**
- Experimentais: por `leads.unidade_id`
- Visitas: por `visitas.unidade_id` (independente do lead — se lead está na Barra mas visita foi marcada pra CG, aparece em CG)

---

### 6.3 `ConfigPreAtendimentoTab` (Pré-Atendimento > Configurações)

Tab única com múltiplas seções:

1. **Configuração de Visitas** (por unidade): horários seg-sex / sáb, limite por horário, ativo/inativo
2. **Feriados** (global): lista do ano com toggle ativo, sync BrasilAPI, adicionar manual, remover
3. **Mila** (por unidade): token_quepasa, prompt, modelo OpenAI, temperatura, tokens, horário funcionamento, etc.

### 6.4 `ModalAgendar`

Permite agendar visita/experimental manualmente pelo staff:
- Date picker bloqueia feriados (cinza)
- Tipo "Visita" → INSERT em `visitas` + UPDATE em `leads` (campos replicados)
- Tipo "Experimental" → UPDATE em `leads` (sem tocar `visitas`)

---

## 7. Fluxos de uso (casos principais)

### 7.1 Lead agenda visita via Mila CG

```
Lead: "quero conhecer a escola"
Mila: oferece visita → lead escolhe dia/hora
Mila chama agendar_visita(unidade="Campo Grande", data, hora, ...)
  └─ RPC valida (feriado, hora cheia, janela, lotação)
     ├─ OK → INSERT visitas + UPDATE leads + abrir conversa Chatwoot
     └─ erro → retorna motivo + horarios_disponiveis
Mila confirma com lead: "Prontinho, visita marcada pra X"
Mila chama transferir(Situação="Visita")
  └─ Check horário/feriado (hoje)
  └─ Branch Visita: notifica Vitória + assignment + nota privada
Vitória recebe WhatsApp + vê conversa aberta no Chatwoot
```

### 7.2 Lead agenda experimental

```
Lead: "quero fazer aula experimental"
Mila oferece → lead aceita
Mila chama transferir(Situação="Experimental") IMEDIATAMENTE (sem coletar dados)
  └─ Check horário/feriado (hoje)
     ├─ dentro do horário → transfere silencioso
     └─ fora → mensagem "atendimento fora do horário" → transfere
Consultor humano coleta dados + marca experimental (via CRM/NocoDB)
  └─ Atualiza leads.data_experimental, experimental_agendada=true, etc.
AgendaTab mostra no calendário via useLeadsCRM
```

### 7.3 Lead pede hora quebrada (16:30)

```
Mila chama agendar_visita(data, hora="16:30")
  └─ RPC retorna: { disponivel: false, motivo: "Apenas horarios cheios...",
                    horarios_disponiveis: ["11:00","12:00","13:00","14:00",...] }
Mila avisa: "Ah, esse horário não vai dar. Pra esse dia tenho livre: 11h, 12h, ... Qual prefere?"
```

### 7.4 Lead marca visita em dia de feriado

```
Mila chama agendar_visita(data="2026-04-21")  (Tiradentes)
  └─ RPC retorna: { disponivel: false, motivo: "Escola fechada — Tiradentes" }
Mila: "Esse dia é feriado e a escola estará fechada. Que tal outro dia?"
```

### 7.5 Fallback silencioso para Barra/Recreio

Barra e Recreio **não têm** registro em `visitas_config`.

- Tool `transferir` → Check horário/feriado: sem config → `_dentro_horario: true` → transfere como antes (sem aviso de horário)
- Tool `agendar_visita` → nunca é chamada (Mila Barra/Recreio não tem essa tool no prompt)

---

## 8. Limitações conhecidas e TODOs

### 8.1 Duplicação de dados `leads` vs `visitas`

Hoje, quando a Mila agenda uma visita, os dados ficam em **duas tabelas**:

| `visitas` (fonte de verdade) | `leads` (replicação pra compat.) |
|---|---|
| `data`, `horario`, `status` | `data_experimental`, `horario_experimental`, `experimental_agendada=true`, `tipo_agendamento='visita'`, `etapa_pipeline_id=5` |

**Por que:** Pipeline, Dashboard, Follow-ups, KPIs ainda leem de `leads`. Se não atualizar o lead, o lead não aparece na etapa "Agendou" do funil.

**Risco:** se a visita for cancelada/reagendada, precisa atualizar AS DUAS tabelas manualmente.

**Plano de migração (em `fiscal mila/PLANO_VISITAS.md`):**
- Fase 2: Pipeline/Dashboard/Follow-ups migram pra ler de `visitas` direto
- Fase 3: remover `Atualizar Lead` do sub-workflow + limpar campos replicados de `leads`

### 8.2 Sistema de visitas só em CG

Pra estender para Barra/Recreio:
1. Inserir registro em `visitas_config` com os horários da unidade
2. Criar tool `agendar_visita` no workflow da Mila Barra / Recreio
3. Atualizar prompt da Mila (adicionar Etapa 6b)
4. Testar com leads reais antes de rollout

### 8.3 Feriados são globais

Tabela `feriados` não tem `unidade_id`. Feriado nacional bloqueia todas as unidades. Se uma unidade específica quiser operar num feriado, precisa desativar o feriado globalmente (afeta as outras).

**Possível melhoria futura:** adicionar coluna `unidades_afetadas uuid[]` ou `unidade_id uuid` (nullable) pra granularidade por unidade.

### 8.4 Email/WhatsApp de confirmação pro lead

Ainda não implementado. Hoje a confirmação é só a mensagem que a Mila manda ("Prontinho, visita marcada pra X"). Seria útil:
- WhatsApp automático 1 dia antes
- Lembrete 2h antes
- Link de cancelamento

### 8.5 Página pública de auto-serviço

Lead não consegue ver/cancelar própria visita. Precisa entrar em contato.

---

## 9. Referências

- **Plano original:** `fiscal mila/PLANO_VISITAS.md`
- **Prompt Mila CG v3:** `fiscal mila/prompts_backups/mila_cg_v3.md`
- **Fluxo transferência JSON:** `fiscal mila/fluxos/transferencia-atendimento-com-horario.json`
- **Migration inicial:** `fiscal mila/migrations/001_visitas.sql`
- **Plano config frontend:** `fiscal mila/PLANO_CONFIG_PRE_ATENDIMENTO.md`

---

## 10. Config inicial (seed)

**Campo Grande** (já populado):
- `visitas_config`: max 2/horário, seg-sex 11:00–20:00, sáb 08:00–14:00, ativo
- `mila_config.token_quepasa`: `TSQGktZqYSM4JHoRwLd57rkt`
- `feriados`: nacional sincronizado via BrasilAPI (Tiradentes, São Jorge etc.)

**Barra e Recreio:** sem registro em `visitas_config` → fallback silencioso (visitas não oferecidas pela Mila, transferências fora de horário transferem sem aviso).
