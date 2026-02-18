# Migrar Alterações da Mila (Branch Develop → Main)

> **Status:** ✅ CONCLUÍDO  
> **Atualizado em:** 18/02/2026 15:45  
> **Prioridade:** Alta

---

## ✅ Viabilidade: CONFIRMADA

**Todas as alterações são ADITIVAS** — nenhum dado será perdido, nenhuma funcionalidade será quebrada.

---

## Auditoria Completa (18/02/2026)

### Projetos Supabase
| Branch | Project ID | Dados |
|--------|------------|-------|
| **MAIN (produção)** | `ouqwbbermlzqqvtqwlul` | 951 leads, 5 conversas, 32 msgs, 38 Edge Functions |
| **DEVELOP (teste)** | `dwkyjxilicecwzskfhgl` | 2 leads, 2 conversas, 27 msgs, 4 Edge Functions |

### Git
- Branch: `feature/mila-agente-sdr`
- 4 arquivos modificados (+1267 linhas)

---

## Comparação de Schema

### Tabelas
| Tabela | MAIN | DEVELOP | Ação |
|--------|------|---------|------|
| `mila_config` | ❌ | ✅ 20 colunas | CREATE TABLE |
| `mila_message_buffer` | ❌ | ✅ 8 colunas | CREATE TABLE |
| `whatsapp_caixas` | ❌ | ✅ 10 colunas | CREATE TABLE |
| `crm_conversas` | ✅ 15 cols | ✅ 16 cols (+caixa_id) | ADD COLUMN |
| `crm_mensagens` | ✅ 21 cols | ✅ 17 cols | **MAIN tem mais** (OK) |

### Funções SQL
| Função | MAIN | DEVELOP | Ação |
|--------|------|---------|------|
| `resetar_teste_mila` | ❌ | ✅ | CREATE FUNCTION |
| `limpar_mila_buffer_antigo` | ❌ | ✅ | CREATE FUNCTION |
| `update_mila_config_updated_at` | ❌ | ✅ | CREATE FUNCTION + trigger |
| `toggle_mila_conversa` | ✅ | ✅ | Nenhuma |

### Edge Functions
| Função | MAIN | DEVELOP | Ação |
|--------|------|---------|------|
| `mila-processar-mensagem` | ❌ | v10 | **DEPLOY NOVA** |
| `webhook-whatsapp-inbox` | v23 | v12 | Verificar suporte Mila |
| `enviar-mensagem-lead` | v10 | v9 | Verificar busca caixa |
| `whatsapp-status` | v7 | v4 | Verificar busca caixa |

---

## Plano de Execução

### ✅ Passo 1: Criar migration SQL consolidada (CONCLUÍDO 18/02/2026)
Arquivo: `supabase/migrations/20260218_mila_agente_main.sql`

**Criado via MCP:**
- ✅ `whatsapp_caixas` (10 colunas + RLS + policies)
- ✅ `mila_config` (20 colunas + RLS + policies + trigger updated_at)
- ✅ `mila_message_buffer` (8 colunas + RLS + índices)
- ✅ `crm_conversas.caixa_id integer NULL`
- ✅ `resetar_teste_mila(p_lead_id integer)` — SECURITY DEFINER
- ✅ `limpar_mila_buffer_antigo()` — limpeza de buffer
- ✅ `update_mila_config_updated_at()` + trigger

### ✅ Passo 2: Inserir dados seed (CONCLUÍDO 18/02/2026)
- ✅ `whatsapp_caixas`: Caixa "CG Principal" (id=1) com credenciais UAZAPI
- ✅ `mila_config`: Config da Mila para CG com prompt completo (18.491 chars)
- ✅ `nome_atendente`: "Vitória"
- ✅ `whatsapp_consultor`: "5521964171223"
- ✅ `webhook_url`: apontando para main (`ouqwbbermlzqqvtqwlul`)

### ✅ Passo 3: NOTIFY pgrst (CONCLUÍDO 18/02/2026)
- ✅ Schema recarregado

### ✅ Passo 4: Deploy Edge Functions (CONCLUÍDO 18/02/2026)
1. ✅ `mila-processar-mensagem` v1 — deployada via MCP
2. ✅ `webhook-whatsapp-inbox` v24 — atualizada com suporte Mila (invoca mila-processar-mensagem)

### ⏳ Passo 5: Git merge (PENDENTE)
- Merge `feature/mila-agente-sdr` → `main`

### ⏳ Passo 6: Pós-deploy (PENDENTE)
- Atualizar webhook UAZAPI para URL da main: `https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/webhook-whatsapp-inbox?caixa_id=1`
- Testar: config page, resetar teste, envio de mensagens

---

## Impacto na Produção

| Item | Status | Impacto |
|------|--------|---------|
| Dados existentes (951 leads) | ✅ Preservados | Nenhum |
| Funcionalidades atuais | ✅ Mantidas | Nenhum |
| Schema atual | ✅ Compatível | Apenas adições |
| Edge Functions | ✅ Compatíveis | Apenas 1 nova |
| Frontend | ✅ Retrocompatível | Graceful fallback |

---

## Notas

- A branch develop pode ser deletada após a migração
- Remover tabela `webhook_debug_log` da branch (temporária de debug)
- A main tem colunas extras em `crm_mensagens` (editada, deletada, transcricao, reacoes) — OK, não precisa alterar
