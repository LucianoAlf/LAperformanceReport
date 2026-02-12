# PLANO DE IMPLEMENTAÇÃO FINAL — Sistema de Checklists do Painel Farmer

> **Status**: Aguardando aprovação  
> **Wireframe HTML**: ✅ Aprovado  
> **Data**: 12/02/2026  

---

## 1. INVENTÁRIO COMPLETO DO ESTADO ATUAL

### 1.1 Frontend — Arquivos Existentes (14 arquivos)

| Arquivo | Linhas | Função | Impacto |
|---------|--------|--------|---------|
| `index.tsx` | 119 | Orquestrador de abas | 🟡 MODIFICAR (renomear aba, adicionar nova) |
| `DashboardTab.tsx` | 648 | Dashboard com alertas e rotinas | 🟡 MODIFICAR (adicionar alertas de checklist) |
| `RotinasTab.tsx` | 585 | CRUD de rotinas recorrentes | 🟢 NÃO MEXER |
| `TarefasTab.tsx` | 378 | CRUD de tarefas avulsas | 🟡 RENOMEAR → mover para dentro de Checklists |
| `RecadosTab.tsx` | 658 | Disparo WhatsApp para professores | 🟢 NÃO MEXER |
| `HistoricoTab.tsx` | 257 | Histórico de rotinas/tarefas | 🟡 EXPANDIR (adicionar métricas de checklists) |
| `types.ts` | 197 | Tipos TypeScript | 🟡 EXPANDIR (adicionar tipos de checklist) |
| `hooks/index.ts` | 6 | Barrel exports | 🟡 EXPANDIR (exportar novos hooks) |
| `hooks/useColaboradorAtual.ts` | 98 | Busca colaborador logado | 🟢 NÃO MEXER |
| `hooks/useRotinas.ts` | 172 | CRUD rotinas + RPCs | 🟢 NÃO MEXER |
| `hooks/useTarefas.ts` | 146 | CRUD tarefas avulsas | 🟢 NÃO MEXER (continua funcionando) |
| `hooks/useAlertas.ts` | 133 | Alertas do dashboard | 🟢 NÃO MEXER |
| `hooks/useFarmersUnidade.ts` | 52 | Lista farmers da unidade | 🟢 NÃO MEXER |

### 1.2 Banco de Dados — Tabelas Existentes

| Tabela | Registros | Dados Reais | Impacto |
|--------|-----------|-------------|---------|
| `farmer_rotinas` | 26 (26 ativas) | ✅ Rotinas criadas pelas farmers | 🟢 NÃO MEXER |
| `farmer_rotinas_execucao` | 13 | ✅ Histórico de execuções (03/02 a 09/02) | 🟢 NÃO MEXER |
| `farmer_tarefas` | 2 (2 pendentes) | ✅ Tarefas reais da Duda | 🟢 NÃO MEXER (tabela continua existindo) |
| `farmer_recados` | 0 | Vazio | 🟢 NÃO MEXER |
| `farmer_templates` | 14 | ✅ Templates configurados | 🟢 NÃO MEXER |
| `farmer_recados_campanhas` | 1 | ✅ 1 campanha realizada | 🟢 NÃO MEXER |
| `farmer_recados_destinatarios` | 1 | ✅ 1 destinatário | 🟢 NÃO MEXER |
| `colaboradores` | 6 farmers | ✅ Equipe completa | 🟢 NÃO MEXER |

### 1.3 RPCs e Views Existentes

| Objeto | Tipo | Usa tabela | Impacto |
|--------|------|------------|---------|
| `get_rotinas_do_dia` | RPC | `farmer_rotinas`, `farmer_rotinas_execucao` | 🟢 NÃO MEXER |
| `get_progresso_rotinas_hoje` | RPC | `farmer_rotinas`, `farmer_rotinas_execucao` | 🟢 NÃO MEXER |
| `get_historico_rotinas` | RPC | `farmer_rotinas`, `farmer_rotinas_execucao`, `farmer_tarefas` | 🟡 EXPANDIR (adicionar dados de checklists) |
| `marcar_rotina_concluida` | RPC | `farmer_rotinas_execucao` | 🟢 NÃO MEXER |
| `vw_farmer_aniversariantes_hoje` | View | `alunos` | 🟢 NÃO MEXER |
| `vw_farmer_inadimplentes` | View | `alunos` | 🟢 NÃO MEXER |
| `vw_farmer_novos_matriculados` | View | `alunos` | 🟢 NÃO MEXER |
| `vw_farmer_renovacoes_proximas` | View | `renovacoes` | 🟢 NÃO MEXER |
| `vw_farmer_resumo_alertas` | View | Views acima | 🟢 NÃO MEXER |

### 1.4 Dados Reais que NÃO PODEM SER PERDIDOS

| Dado | Quantidade | Detalhe |
|------|-----------|---------|
| Rotinas ativas | 26 | Criadas por Gabi (7), Jhon (1), Duda (12), Fefê (6) |
| Execuções de rotinas | 13 | Período 03/02 a 09/02/2026 |
| Tarefas pendentes | 2 | Duda: "Falar com Leandro" (prazo 19/02) e "Ligar para Maria" |
| Templates | 14 | 6 categorias: aniversário, boas-vindas, cobrança, experimental, recado_professor, renovação |
| Campanhas | 1 | 1 campanha com 1 destinatário |

---

## 2. ANÁLISE DE IMPACTO — O QUE MUDA vs O QUE NÃO MUDA

### 🟢 O QUE NÃO MUDA (ZERO RISCO)

1. **Aba "Minhas Rotinas"** — Componente, hook, RPCs e tabelas intactos
2. **Aba "Recados"** — Componente, tabelas e lógica de envio intactos
3. **Alertas do Dashboard** — Views, hook e renderização intactos
4. **Tabela `farmer_rotinas`** — Nenhuma alteração de schema
5. **Tabela `farmer_rotinas_execucao`** — Nenhuma alteração
6. **Tabela `farmer_tarefas`** — Continua existindo e funcionando
7. **Tabela `farmer_templates`** — Nenhuma alteração (novas categorias serão INSERT)
8. **Todas as 5 views** — Nenhuma alteração
9. **RPCs `get_rotinas_do_dia`, `get_progresso_rotinas_hoje`, `marcar_rotina_concluida`** — Intactas

### 🟡 O QUE MUDA (RISCO CONTROLADO)

1. **`index.tsx`** — Renomear aba "Tarefas" → "Checklists" e adicionar novo componente `ChecklistsTab`
2. **`DashboardTab.tsx`** — Adicionar seção de alertas de checklist (novos alunos, prazos) e alertas automáticos
3. **`HistoricoTab.tsx`** — Expandir para incluir métricas de checklists (além de rotinas/tarefas)
4. **`types.ts`** — Adicionar novos tipos (FarmerChecklist, ChecklistItem, etc.)
5. **`hooks/index.ts`** — Exportar novos hooks
6. **RPC `get_historico_rotinas`** — Expandir para incluir dados de checklists concluídos

### 🔵 O QUE É NOVO (ZERO RISCO — só adiciona)

1. **Novas tabelas**: `farmer_checklists`, `farmer_checklist_items`, `farmer_checklist_contatos`, `farmer_checklist_templates`
2. **Novos componentes**: `ChecklistsTab.tsx`, `ChecklistDetail.tsx`
3. **Novos hooks**: `useChecklists.ts`, `useChecklistDetail.ts`
4. **Novas RPCs**: Para gerenciar checklists e itens
5. **Nova view**: `vw_farmer_checklist_alertas` (alertas de prazos de checklist)

---

## 3. ESTRATÉGIA DE SEGURANÇA

### Princípio: "Adicionar primeiro, migrar depois"

1. **Nunca deletar** tabelas ou colunas existentes
2. **Nunca renomear** tabelas existentes no banco
3. **A aba "Tarefas" atual vira "Tarefas Rápidas"** dentro da nova aba "Checklists" — o componente `TarefasTab.tsx` continua existindo e funcionando, apenas muda onde é renderizado
4. **Todas as tarefas existentes** (2 registros da Duda) continuam acessíveis na mesma tabela `farmer_tarefas`
5. **Novas tabelas são criadas com `IF NOT EXISTS`**
6. **Novas RPCs são criadas com `CREATE OR REPLACE`**
7. **Migrations incrementais** — cada fase é uma migration separada e reversível

---

## 4. FASES DE IMPLEMENTAÇÃO

### FASE 1 — Banco de Dados (Novas Tabelas + RPCs)
**Risco**: 🟢 Baixo (só adiciona, não altera nada existente)  
**Estimativa**: ~1 sessão

**4.1 Criar tabela `farmer_checklist_templates`** ⚠️ PRIMEIRO (referenciada por `farmer_checklists.template_id`)
```sql
CREATE TABLE farmer_checklist_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome VARCHAR NOT NULL,
  descricao TEXT,
  categoria VARCHAR, -- 'onboarding' | 'recesso' | 'evento' | 'comunicacao' | 'administrativo'
  itens JSONB NOT NULL DEFAULT '[]', -- array de {descricao, canal, subs:[]}
  unidade_id UUID REFERENCES unidades(id), -- NULL = global
  ativo BOOLEAN DEFAULT true,
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**4.2 Criar tabela `farmer_checklists`** (depende de `farmer_checklist_templates`)
```sql
CREATE TABLE farmer_checklists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unidade_id UUID NOT NULL REFERENCES unidades(id),
  colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id),
  titulo VARCHAR NOT NULL,
  descricao TEXT,
  tipo VARCHAR NOT NULL DEFAULT 'manual', -- 'manual' | 'template' | 'recorrente'
  template_id UUID REFERENCES farmer_checklist_templates(id),
  data_inicio DATE,
  data_prazo DATE,
  prioridade VARCHAR DEFAULT 'media', -- 'alta' | 'media' | 'baixa'
  alerta_dias_antes INTEGER DEFAULT 1,
  alerta_hora TIME DEFAULT '09:00',
  lembrete_whatsapp BOOLEAN DEFAULT false,
  status VARCHAR DEFAULT 'ativo', -- 'ativo' | 'concluido' | 'arquivado'
  concluido_em TIMESTAMPTZ,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**4.3 Criar tabela `farmer_checklist_items`** (depende de `farmer_checklists`)
```sql
CREATE TABLE farmer_checklist_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  checklist_id UUID NOT NULL REFERENCES farmer_checklists(id) ON DELETE CASCADE,
  descricao VARCHAR NOT NULL,
  ordem INTEGER DEFAULT 0,
  canal VARCHAR, -- 'WhatsApp' | 'Telefone' | 'Email' | 'Instagram' | 'Presencial'
  info TEXT, -- informação extra (ex: "94% receberam")
  parent_id UUID REFERENCES farmer_checklist_items(id), -- sub-itens
  concluida BOOLEAN DEFAULT false,
  concluida_em TIMESTAMPTZ,
  concluida_por INTEGER REFERENCES colaboradores(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**4.4 Criar tabela `farmer_checklist_contatos`** (depende de `farmer_checklists`)
```sql
CREATE TABLE farmer_checklist_contatos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  checklist_id UUID NOT NULL REFERENCES farmer_checklists(id) ON DELETE CASCADE,
  aluno_id INTEGER NOT NULL REFERENCES alunos(id),
  farmer_id INTEGER NOT NULL REFERENCES colaboradores(id),
  status VARCHAR DEFAULT 'pendente', -- 'pendente' | 'respondeu' | 'visualizou' | 'sem_resposta' | 'nao_recebeu'
  canal_contato VARCHAR, -- 'WhatsApp' | 'Telefone' | 'Email'
  observacoes TEXT,
  contatado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**4.5 Criar RPCs de Checklists**
- `get_checklists_farmer(p_colaborador_id, p_unidade_id, p_status)` — Lista checklists com progresso
- `get_checklist_detail(p_checklist_id)` — Detalhe com itens e contatos
- `marcar_checklist_item(p_item_id, p_concluida, p_colaborador_id)` — Toggle item
- `criar_checklist_from_template(p_template_id, p_colaborador_id, p_unidade_id)` — Instanciar template

**4.6 Expandir RPC `get_historico_rotinas`** (CREATE OR REPLACE — não quebra nada)
- Adicionar coluna `checklists_concluidos` ao retorno

**4.7 Criar view `vw_farmer_checklist_alertas`**
- Checklists com prazo vencendo nos próximos X dias

**4.8 Inserir templates iniciais**
- "Abertura da Escola — Diário"
- "Primeiro Dia de Aula — Onboarding"  
- "Recesso / Feriado — Comunicação"
- "Conferência Mensal de Dados"

### FASE 2 — Frontend: Nova Aba "Checklists" (Componente Principal)
**Risco**: 🟢 Baixo (só adiciona arquivos novos)  
**Estimativa**: ~1-2 sessões

**Novos arquivos:**
- `ChecklistsTab.tsx` — Aba principal com lista de checklists + tarefas rápidas
- `ChecklistDetail.tsx` — Visão expandida (sub-abas: Tarefas, Carteira, Sucesso)
- `hooks/useChecklists.ts` — Hook para CRUD de checklists
- `hooks/useChecklistDetail.ts` — Hook para detalhe + itens + contatos

**Funcionalidades:**
- Lista de checklists em cards com progresso
- Filtros por status (Ativos, Concluídos, Todos)
- Modal de criação (manual ou a partir de template)
- Visão expandida com 3 sub-abas
- Checkbox "Selecionar Todos" + filtros Por Professor/Curso
- Seção "Tarefas Rápidas" (reutiliza `useTarefas` existente)

### FASE 3 — Frontend: Integrar no `index.tsx` + Dashboard
**Risco**: 🟡 Médio (modifica arquivos existentes, mas de forma aditiva)  
**Estimativa**: ~1 sessão

**Alterações em `index.tsx`:**
```diff
- { id: 'tarefas', label: 'Tarefas', icon: ListTodo },
+ { id: 'checklists', label: 'Checklists', icon: ClipboardList },
```
- A aba "Tarefas" some do menu principal
- O componente `TarefasTab` passa a ser renderizado DENTRO de `ChecklistsTab` como seção "Tarefas Rápidas"
- **As 2 tarefas da Duda continuam acessíveis** — mesma tabela, mesmo hook

**Alterações em `DashboardTab.tsx`:**
- Adicionar card de "Checklists Ativos" nos contadores
- Adicionar alertas de checklist (prazo vencendo, primeiro dia de aula)
- Adicionar seção "Alertas Automáticos" configuráveis

### FASE 4 — Frontend: Expandir Histórico
**Risco**: 🟡 Médio (modifica `HistoricoTab.tsx`)  
**Estimativa**: ~0.5 sessão

**Alterações em `HistoricoTab.tsx`:**
- Adicionar barras de progresso de checklists por dia (além das rotinas)
- Adicionar seção "Checklists Concluídos Recentemente"
- Usar RPC expandida `get_historico_rotinas` (que agora retorna dados de checklists)

### FASE 5 — Tipos + Exports + Polish
**Risco**: 🟢 Baixo  
**Estimativa**: ~0.5 sessão

- Adicionar tipos em `types.ts`
- Atualizar exports em `hooks/index.ts`
- Testes manuais de todas as abas
- Verificar que rotinas, tarefas existentes e recados continuam funcionando

---

## 5. CHECKLIST DE SEGURANÇA (antes de cada fase)

### Antes da Fase 1 (Banco):
- [ ] Confirmar que nenhuma tabela existente será alterada
- [ ] Usar `CREATE TABLE IF NOT EXISTS`
- [ ] Usar `CREATE OR REPLACE FUNCTION` para RPCs
- [ ] Testar que RPCs existentes continuam retornando os mesmos dados

### Antes da Fase 3 (Integração):
- [ ] Confirmar que `TarefasTab.tsx` continua existindo e funcional
- [ ] Confirmar que as 2 tarefas da Duda aparecem na seção "Tarefas Rápidas"
- [ ] Confirmar que as 26 rotinas continuam aparecendo normalmente
- [ ] Confirmar que o Dashboard carrega sem erros
- [ ] Confirmar que Recados continua funcionando

### Antes da Fase 4 (Histórico):
- [ ] Confirmar que o histórico existente (rotinas + tarefas) continua aparecendo
- [ ] Confirmar que a RPC expandida retorna os mesmos dados antigos + novos

---

## 6. ORDEM DE EXECUÇÃO RECOMENDADA

```
FASE 1 → FASE 5 (tipos) → FASE 2 → FASE 3 → FASE 4
  │                           │         │         │
  │ Banco: só adiciona        │ Novos   │ Integra │ Expande
  │ tabelas, RPCs, seeds      │ comps   │ no menu │ histórico
  │                           │         │         │
  └── ZERO impacto no ──────►└── ZERO ─►└── Aqui ─►└── Aqui muda
      que já existe               impacto    muda      HistoricoTab
                                             index +
                                             Dashboard
```

---

## 7. RESUMO EXECUTIVO

| Aspecto | Detalhe |
|---------|---------|
| **Tabelas existentes alteradas** | 0 (zero) |
| **Dados existentes perdidos** | 0 (zero) |
| **RPCs existentes quebradas** | 0 (zero) — só `get_historico_rotinas` é expandida via `CREATE OR REPLACE` |
| **Views existentes alteradas** | 0 (zero) |
| **Componentes deletados** | 0 (zero) — `TarefasTab.tsx` continua existindo |
| **Novas tabelas** | 4 (`farmer_checklists`, `farmer_checklist_items`, `farmer_checklist_contatos`, `farmer_checklist_templates`) |
| **Novos componentes** | 2 (`ChecklistsTab.tsx`, `ChecklistDetail.tsx`) |
| **Novos hooks** | 2 (`useChecklists.ts`, `useChecklistDetail.ts`) |
| **Componentes modificados** | 4 (`index.tsx`, `DashboardTab.tsx`, `HistoricoTab.tsx`, `types.ts`) |
| **Risco geral** | 🟢 Baixo — abordagem 100% aditiva |

---

## 8. NOTA SOBRE A ABA "TAREFAS" ATUAL

A aba "Tarefas" atual (que a Duda usa com 2 tarefas pendentes) **NÃO será deletada**:

1. O componente `TarefasTab.tsx` continua existindo no código
2. A tabela `farmer_tarefas` continua intacta no banco
3. O hook `useTarefas.ts` continua funcionando
4. **O que muda**: em vez de ser uma aba separada no menu, ela aparece como seção "Tarefas Rápidas" dentro da nova aba "Checklists"
5. **Todas as funcionalidades** (criar, marcar, excluir) continuam idênticas
6. **As 2 tarefas da Duda** aparecem exatamente como antes, só que dentro de "Checklists > Tarefas Rápidas"

Isso é uma **reorganização de UI**, não uma migração de dados.
