# Sistema de Visitas e Feriados

## Visão Geral

Sistema de agendamento de visitas presenciais para leads, com controle de lotação por horário, configuração por unidade e integração com feriados.

---

## Tabelas

### `visitas`
Registro de cada visita agendada. Vinculada a um lead via `lead_id`.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid (PK) | ID da visita |
| unidade_id | uuid (FK → unidades) | Unidade da visita |
| lead_id | integer (FK → leads) | Lead vinculado (nullable) |
| emusys_lead_id | integer | ID do lead no Emusys (sem FK) |
| nome | text | Nome do visitante |
| telefone | text | Telefone do visitante |
| data | date | Data da visita |
| horario | time | Horário (apenas horas cheias — CHECK) |
| status | text | `agendada`, `realizada`, `nao_compareceu`, `cancelada` |
| observacoes | text | Observações livres |
| criado_por | text | `mila` ou `manual` |
| created_at | timestamptz | Data de criação |
| updated_at | timestamptz | Última atualização (trigger automático) |

### `visitas_config`
Configuração de visitas por unidade: horários de funcionamento e limite de lotação.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid (PK) | - |
| unidade_id | uuid (FK, UNIQUE) | Uma config por unidade |
| max_visitas_por_horario | integer | Limite de visitas simultâneas (1-20) |
| horario_inicio_seg_sex | time | Início seg-sex |
| horario_fim_seg_sex | time | Fim seg-sex |
| horario_inicio_sab | time | Início sábado |
| horario_fim_sab | time | Fim sábado |
| ativo | boolean | Se o sistema de visitas está ativo para esta unidade |

### `feriados`
Feriados nacionais (sync BrasilAPI), municipais e recessos.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid (PK) | - |
| data | date (UNIQUE) | Data do feriado |
| nome | text | Nome (ex: Tiradentes) |
| tipo | text | `national`, `municipal`, `recesso` |
| ativo | boolean | Se está ativo (desativar = escola funciona nesse dia) |

---

## RPC: `mila_check_disponibilidade_visita`

Função usada pelo agente Mila (via n8n) para validar se um horário está disponível.

**Parâmetros:** `p_unidade_id`, `p_data`, `p_horario`, `p_telefone` (opcional)

**Validações (em ordem):**
1. Config da unidade ativa?
2. Data é feriado?
3. Telefone já tem visita agendada?
4. Horário é hora cheia?
5. Não é domingo?
6. Dentro da janela de funcionamento?
7. Limite de lotação não excedido?

**Retorno:** `{ disponivel: bool, motivo: text, horarios_disponiveis: text[] }`

---

## Edge Function: `sync-feriados`

Sincroniza feriados nacionais via [BrasilAPI](https://brasilapi.com.br/api/feriados/v1/{ano}).

- **Endpoint:** `POST /functions/v1/sync-feriados`
- **Body:** `{ "ano": 2026 }` (default: ano atual)
- **Comportamento:** UPSERT por data. Não reativa feriados desativados manualmente.
- **pg_cron:** Roda automaticamente em 1º de janeiro às 12h UTC (job `sync-feriados-anual`)

---

## Frontend

### Tab Config Visitas (Pré-Atendimento)

Duas seções:

1. **Configuração de Visitas** — por unidade: horários seg-sex e sáb, limite por horário, ativo/inativo
2. **Feriados** — lista de feriados do ano com:
   - Toggle ativo/inativo por feriado
   - Botão "Sincronizar BrasilAPI" para importar feriados nacionais
   - Formulário para adicionar feriados municipais/recessos manualmente
   - Remover feriados manuais (nacionais só podem ser desativados)

### AgendaTab (Pré-Atendimento)

- Dias de feriado aparecem com **borda rosa** e **nome do feriado** visível
- Funciona nas visões mensal e semanal

### ModalAgendar (Pré-Atendimento)

- Datas de feriado ficam **desabilitadas** (cinza) no date picker
- Funciona para experimentais e visitas

---

## Fluxo de Criação de Visita

### Via Frontend (manual)
1. Usuário abre ModalAgendar → seleciona tipo "Visita"
2. Date picker bloqueia feriados
3. Ao salvar:
   - UPDATE no lead (etapa_pipeline_id=5, tipo_agendamento='visita', etc.)
   - INSERT na tabela `visitas` com `lead_id` e `criado_por='manual'`

### Via Mila (n8n)
1. Workflow recebe dados do lead (nome, telefone, data, hora, unidade)
2. Busca `unidade_id` pelo nome
3. Chama RPC `mila_check_disponibilidade_visita` → valida tudo (feriado, lotação, etc.)
4. Se disponível:
   - Busca lead pelo telefone → pega `id`
   - INSERT na tabela `visitas` com `lead_id` e `criado_por='mila'`
   - PATCH no lead (etapa, tipo_agendamento, data_experimental, etc.)
   - Abre conversa no Chatwoot

---

## Workflow n8n

**Nome:** SubWorkflow - Agendar Visita (Supabase)
**ID:** `vvrVXSMHtwD0Du6Z`
**Status:** Inativo (aguardando deploy da edge function e ativação)

**Fluxo:**
```
Execute Workflow Trigger
  → Edit Fields (service_role)
    → Buscar unidade_id
      → Verificar Disponibilidade (RPC)
        → Disponível?
          ├─ Não → Erro: Indisponível (motivo + horários alternativos)
          └─ Sim → Modo Teste?
                    ├─ Sim → Sucesso Teste (sem salvar)
                    └─ Não → Buscar Lead → Salvar Visita → Atualizar Lead → Abrir Conversa → Sucesso
```

---

## Config Inicial (Seed)

Campo Grande já tem config:
- Máx: 2 visitas/horário
- Seg-Sex: 11:00–20:00
- Sábado: 08:00–14:00
- Ativo: true
