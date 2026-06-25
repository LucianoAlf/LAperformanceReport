# 🎯 Plano de Expansão: Sistema de Checklists — Painel Farmer

> Documento de arquitetura, análise de redundância e plano de implementação.
> Autor: Cascade | Data: 12/02/2026

---

## 1. AUDITORIA DO ESTADO ATUAL

### 1.1 Frontend — Componentes do Painel Farmer

```
PainelFarmer/
├── index.tsx              → Orquestra 5 sub-abas com tabs
├── DashboardTab.tsx       → Alertas do dia + Rotinas de Hoje + Progresso
├── RotinasTab.tsx         → CRUD de rotinas recorrentes (diário/semanal/mensal)
├── TarefasTab.tsx         → CRUD de tarefas pontuais (to-dos com prazo)
├── RecadosTab.tsx         → Disparo em massa WhatsApp para professores
├── HistoricoTab.tsx       → Desempenho histórico (rotinas concluídas por dia)
├── types.ts               → Interfaces: FarmerRotina, FarmerTarefa, FarmerRecado, etc.
└── hooks/
    ├── index.ts
    ├── useColaboradorAtual.ts  → Identifica o farmer logado
    ├── useRotinas.ts           → CRUD + RPCs (rotinas do dia, progresso)
    ├── useTarefas.ts           → CRUD tarefas + filtros (pendentes, hoje, atrasadas)
    ├── useAlertas.ts           → Alertas: aniversariantes, inadimplentes, renovações, novos
    └── useFarmersUnidade.ts    → Lista farmers da unidade (filtro gerente)
```

### 1.2 Backend — Tabelas Supabase (farmer_*)

| Tabela | Registros | Propósito |
|--------|-----------|-----------|
| `farmer_rotinas` | 26 | Rotinas recorrentes (diário/semanal/mensal) |
| `farmer_rotinas_execucao` | 13 | Log de execução diária das rotinas |
| `farmer_tarefas` | 2 | Tarefas pontuais (to-dos) |
| `farmer_recados` | 0 | Recados individuais (professor/aluno) |
| `farmer_recados_campanhas` | 1 | Campanhas de disparo em massa |
| `farmer_recados_destinatarios` | — | Destinatários de cada campanha |
| `farmer_templates` | 14 | Templates de mensagens |

### 1.3 RPCs Existentes

- `get_rotinas_do_dia(p_colaborador_id)` → Rotinas que devem ser feitas hoje
- `get_progresso_rotinas_hoje(p_colaborador_id)` → % de conclusão do dia
- `marcar_rotina_concluida(p_rotina_id, p_colaborador_id, p_concluida)` → Toggle
- `get_historico_rotinas(p_colaborador_id, p_dias)` → Histórico de X dias

### 1.4 Dados Disponíveis no Banco

- **906 alunos ativos** (com curso, professor, telefone, email, unidade)
- **43 professores ativos** (com WhatsApp, alunos vinculados)
- **6 colaboradores farmers** (2 por unidade: CG, REC, BAR)
- **WhatsApp integrado** (sendWhatsAppMessage + whatsapp_config)

---

## 2. ANÁLISE DE REDUNDÂNCIA

### O que cada feature faz HOJE:

| Feature | Natureza | Vincula Pessoas? | Subtarefas? | Canal? | Progresso? | Recorrência? |
|---------|----------|-------------------|-------------|--------|------------|--------------|
| **Minhas Rotinas** | Recorrente | ❌ Não | ❌ Não | ❌ Não | ✅ % do dia | ✅ Diário/Semanal/Mensal |
| **Tarefas** | Pontual | ⚠️ Só aluno_id | ❌ Não | ❌ Não | ✅ Concluída/Pendente | ❌ Não |
| **Recados** | Disparo | ✅ Professores | ❌ Não | ✅ WhatsApp | ✅ Enviados/Erros | ❌ Não |

### O que o CHECKLIST precisa que NÃO EXISTE:

1. **Vincular a uma LISTA de alunos/professores** (não apenas 1 aluno)
2. **Subtarefas** hierárquicas (tarefa-mãe → sub-itens)
3. **Canal de comunicação** por tarefa (WhatsApp, Email, Telefone, Presencial, Instagram)
4. **Tracking de sucesso por contato** (respondeu, visualizou, sem resposta)
5. **Templates de checklist** reutilizáveis (não só templates de mensagem)
6. **Divisão de carteira** (atribuir X alunos para cada farmer)
7. **Visão expandida** com filtros por professor/curso
8. **Alertas proativos** baseados em dados (primeiro dia de aula, etc.)

### Veredicto de Redundância:

- **Rotinas ≠ Checklist**: Rotinas são ações recorrentes simples ("Conferir agenda do dia"). Checklist é um PROJETO com múltiplas etapas vinculadas a pessoas.
- **Tarefas ≈ Parcialmente**: Tarefas são to-dos pontuais. Um checklist CONTÉM tarefas, mas com muito mais contexto (canal, subtarefas, vínculo com lista de pessoas).
- **Recados ≈ Parcialmente**: Recados já fazem disparo em massa para professores. O checklist poderia GERAR recados como uma das etapas.

---

## 3. DECISÃO ARQUITETURAL

### ❌ Opção A — Nova sub-aba "Checklists" (REJEITADA)
Criar uma 6ª aba ao lado das existentes. **Problema**: gera confusão com Tarefas ("qual eu uso?") e fragmenta a experiência.

### ❌ Opção C — Reestruturar tudo (REJEITADA)
Fundir Rotinas + Tarefas + Checklists. **Problema**: refatoração enorme, quebra o que já funciona, e Rotinas têm natureza fundamentalmente diferente (recorrência simples sem vínculo com pessoas).

### ✅ Opção B+ — EXPANDIR "Tarefas" → "Tarefas & Checklists" (RECOMENDADA)

**Justificativa:**
1. **Tarefas já são pontuais** — Checklists também são pontuais (ou com periodicidade)
2. **Tarefas já vinculam aluno_id** — só precisa expandir para lista de pessoas
3. **Não cria aba nova** — mantém 5 abas, sem confusão
4. **Rotinas continuam separadas** — são recorrências simples, natureza diferente
5. **Recados continuam separados** — são disparos de mensagem, não checklists

**Como funciona:**
- A aba "Tarefas" vira **"Tarefas & Checklists"** (ou simplesmente **"Checklists"**)
- Tarefas simples (to-dos) continuam existindo como estão
- NOVO: Checklists com todas as features do protótipo
- O Dashboard passa a mostrar alertas de checklists também
- O Histórico passa a incluir métricas de checklists

### Impacto nas outras abas:

| Aba | Muda? | O que muda |
|-----|-------|------------|
| **Dashboard** | ✅ Sim | Adiciona alertas de checklists pendentes/atrasados + cards de progresso |
| **Minhas Rotinas** | ❌ Não | Continua como está |
| **Tarefas** | ✅ Sim | Renomeia para "Checklists" e adiciona a nova funcionalidade |
| **Recados** | ❌ Não | Continua como está (pode ser acionado de dentro de um checklist no futuro) |
| **Histórico** | ✅ Sim | Adiciona métricas de checklists concluídos |

---

## 4. MODELAGEM DO BANCO DE DADOS

### 4.1 Novas Tabelas

```sql
-- =============================================
-- TABELA: farmer_checklists
-- Checklist principal (ex: "Recesso de Carnaval — Comunicação")
-- =============================================
CREATE TABLE farmer_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id UUID NOT NULL REFERENCES unidades(id),
  criado_por INTEGER NOT NULL REFERENCES colaboradores(id),
  responsavel_id INTEGER REFERENCES colaboradores(id),
  
  titulo VARCHAR NOT NULL,
  descricao TEXT,
  
  -- Classificação
  departamento VARCHAR DEFAULT 'administrativo', -- administrativo, comercial, pedagogico, geral
  periodicidade VARCHAR DEFAULT 'pontual',       -- diario, semanal, mensal, pontual
  prioridade VARCHAR DEFAULT 'normal',           -- normal, alta, urgente
  
  -- Vínculo com pessoas
  tipo_vinculo VARCHAR DEFAULT 'nenhum',         -- nenhum, todos_alunos, por_curso, por_professor, manual
  filtro_vinculo JSONB,                          -- {curso_id: 5} ou {professor_id: 12} ou {aluno_ids: [1,2,3]}
  
  -- Template
  template_id UUID REFERENCES farmer_checklist_templates(id),
  
  -- Alertas
  alerta_dias_antes INTEGER,                     -- null = sem alerta, 1 = 1 dia antes, etc.
  alerta_hora VARCHAR,                           -- "08:00" = lembrete às 8h
  lembrete_whatsapp BOOLEAN DEFAULT false,
  
  -- Datas
  data_inicio DATE,
  data_prazo DATE,
  
  -- Status
  status VARCHAR DEFAULT 'ativo',                -- ativo, concluido, arquivado
  concluido_em TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- TABELA: farmer_checklist_itens
-- Itens (tarefas) dentro de um checklist, com suporte a subtarefas
-- =============================================
CREATE TABLE farmer_checklist_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID NOT NULL REFERENCES farmer_checklists(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES farmer_checklist_itens(id) ON DELETE CASCADE, -- NULL = item raiz, preenchido = subtarefa
  
  descricao VARCHAR NOT NULL,
  ordem INTEGER DEFAULT 0,
  
  -- Canal de comunicação
  canal VARCHAR,                                 -- whatsapp, email, telefone, presencial, instagram, null
  
  -- Status
  concluida BOOLEAN DEFAULT false,
  concluida_em TIMESTAMPTZ,
  concluida_por INTEGER REFERENCES colaboradores(id),
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- TABELA: farmer_checklist_contatos
-- Tracking de contato por pessoa vinculada ao checklist
-- =============================================
CREATE TABLE farmer_checklist_contatos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID NOT NULL REFERENCES farmer_checklists(id) ON DELETE CASCADE,
  checklist_item_id UUID REFERENCES farmer_checklist_itens(id) ON DELETE CASCADE,
  
  -- Pessoa contatada
  aluno_id INTEGER REFERENCES alunos(id),
  professor_id INTEGER REFERENCES professores(id),
  
  -- Contato
  canal VARCHAR,                                 -- whatsapp, email, telefone, presencial
  status VARCHAR DEFAULT 'pendente',             -- pendente, enviado, visualizado, respondeu, sem_resposta, erro
  
  -- Tracking
  tentativas INTEGER DEFAULT 0,
  ultima_tentativa TIMESTAMPTZ,
  respondido_em TIMESTAMPTZ,
  observacoes TEXT,
  
  -- Responsável
  responsavel_id INTEGER REFERENCES colaboradores(id),
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- TABELA: farmer_checklist_templates
-- Templates reutilizáveis de checklists
-- =============================================
CREATE TABLE farmer_checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id UUID REFERENCES unidades(id),       -- NULL = global (todas as unidades)
  
  titulo VARCHAR NOT NULL,
  descricao TEXT,
  departamento VARCHAR DEFAULT 'geral',
  periodicidade VARCHAR DEFAULT 'pontual',
  
  -- Itens do template (JSON com a estrutura dos itens)
  itens JSONB NOT NULL DEFAULT '[]',
  -- Formato: [{ descricao, canal, subtarefas: [{ descricao, canal }] }]
  
  ativo BOOLEAN DEFAULT true,
  ordem INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- TABELA: farmer_checklist_carteira
-- Divisão de carteira de alunos entre farmers
-- =============================================
CREATE TABLE farmer_checklist_carteira (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID NOT NULL REFERENCES farmer_checklists(id) ON DELETE CASCADE,
  colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id),
  aluno_id INTEGER NOT NULL REFERENCES alunos(id),
  
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(checklist_id, aluno_id) -- cada aluno só pode estar em 1 carteira por checklist
);
```

### 4.2 Índices Recomendados

```sql
CREATE INDEX idx_checklists_unidade ON farmer_checklists(unidade_id);
CREATE INDEX idx_checklists_responsavel ON farmer_checklists(responsavel_id);
CREATE INDEX idx_checklists_status ON farmer_checklists(status);
CREATE INDEX idx_checklist_itens_checklist ON farmer_checklist_itens(checklist_id);
CREATE INDEX idx_checklist_itens_parent ON farmer_checklist_itens(parent_id);
CREATE INDEX idx_checklist_contatos_checklist ON farmer_checklist_contatos(checklist_id);
CREATE INDEX idx_checklist_contatos_aluno ON farmer_checklist_contatos(aluno_id);
CREATE INDEX idx_checklist_carteira_checklist ON farmer_checklist_carteira(checklist_id);
CREATE INDEX idx_checklist_carteira_colaborador ON farmer_checklist_carteira(colaborador_id);
```

### 4.3 RPCs Necessárias

```sql
-- get_checklist_progresso(p_checklist_id) → { total_itens, concluidos, percentual }
-- get_checklist_sucesso_contato(p_checklist_id) → { canal, total, sucesso, percentual } por canal
-- get_meus_checklists(p_colaborador_id, p_unidade_id) → Lista de checklists do farmer
-- get_checklists_equipe(p_unidade_id) → Visão gerente com progresso por farmer
```

---

## 5. WIREFRAMES TEXTUAIS

### 5.1 Aba "Checklists" (substitui "Tarefas")

```
┌─────────────────────────────────────────────────────────────┐
│ ✅ Checklists                                    [+ Novo]   │
│ Gerencie seus checklists e tarefas                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ [Ativos (5)] [Concluídos (12)] [Arquivados]                │
│                                                             │
│ Filtros: [Todos] [Comercial] [Administrativo] [Urgente 🔴]  │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 📣 Recesso de Carnaval — Comunicação                    │ │
│ │ 8 tarefas · 498 alunos · Gabi          [Urgente][Diário]│ │
│ │ ████████████████░░░░░░░░  5/8 concluídas         62%   │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🎓 Primeiro Dia de Aula — Onboarding                    │ │
│ │ 12 tarefas · 3 alunos novos · Gabi           [Diário]  │ │
│ │ ██████████████████████░░  9/12 concluídas        75%   │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ── Tarefas Rápidas ──────────────────────── [+ Nova Tarefa] │
│ ○ Falar com Leandro, pai do Davi...    [Alta] · Duda · 19/02│
│ ○ Ligar para Maria sobre renovação     [Média] · Duda       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Nota:** As "Tarefas Rápidas" no final mantêm a funcionalidade atual de to-dos simples, sem perder nada.

### 5.2 Visão Expandida do Checklist (ao clicar num card)

```
┌─────────────────────────────────────────────────────────────┐
│ ← Voltar                                                    │
│                                                             │
│ 📣 Recesso de Carnaval — Comunicação     [Urgente] [Diário] │
│ Avisar todos os alunos e professores sobre o recesso.       │
│                                                             │
│ [☐ Selecionar Todos]  5/8 concluídas (62%)                  │
│                        Filtros: [Todos] [Por Professor] [Curso]│
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ☑ Disparar mensagem no WhatsApp para todos   [WhatsApp] │ │
│ │   ☑ ↳ Conferir se todos receberam      ● 94% receberam │ │
│ │ ☑ Enviar email institucional sobre recesso      [Email] │ │
│ │ ☑ Publicar comunicado no Instagram          [Instagram] │ │
│ │ ☑ Avisar todos os professores via WhatsApp  [WhatsApp]  │ │
│ │ ☐ Ligar para alunos que não confirmaram    [Telefone]   │ │
│ │   ☐ ↳ Registrar tentativa de contato     ● Pendente    │ │
│ │   ☐ ↳ Tentar contato presencial          [Presencial]  │ │
│ │ ☐ Atualizar mural físico da escola                      │ │
│ │ ☐ Confirmar com coordenação                             │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ 📊 Percentual de Sucesso — Comunicação                      │
│ ┌──────────┬──────────┬──────────┬──────────┐              │
│ │  94%     │  78%     │  45%     │  100%    │              │
│ │ WhatsApp │  Email   │ Telefone │Presencial│              │
│ └──────────┴──────────┴──────────┴──────────┘              │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 Modal "Novo Checklist"

```
┌─────────────────────────────────────────────┐
│ ✨ Novo Checklist                        [X] │
├─────────────────────────────────────────────┤
│                                             │
│ Nome do Checklist                           │
│ [Ex: Recesso de Carnaval — Comunicação   ]  │
│                                             │
│ Periodicidade          Departamento         │
│ [Diário       ▼]      [Administrativo  ▼]  │
│                                             │
│ Vincular Alunos                             │
│ [Todos os Alunos ▼]   [498 selecionados ▼] │
│                                             │
│ Tarefas                                     │
│ [Descrição da tarefa...    ] [Sem canal ▼] ↳│
│ [Descrição da tarefa...    ] [Sem canal ▼] ↳│
│ [+ Adicionar Tarefa]                        │
│                                             │
│ Alerta / Lembrete     Prioridade            │
│ [Sem alerta    ▼]     [Normal       ▼]     │
│                                             │
│ ☐ Lembrete no meu WhatsApp                 │
│                                             │
│              [Cancelar] [🚀 Criar Checklist]│
└─────────────────────────────────────────────┘
```

### 5.4 Carteira de Alunos (dentro do checklist expandido)

```
┌─────────────────────────────────────────────────────────────┐
│ 👥 Carteira de Alunos — Minha carteira (250 alunos)         │
│                                                             │
│ [Filtrar por Curso ▼]  [Filtrar por Professor ▼]            │
│                                                             │
│ ┌────────┬────────┬────────┬────────┐                      │
│ │  250   │  92%   │   18   │    5   │                      │
│ │ Alunos │Sucesso │Pendente│S/Resp. │                      │
│ └────────┴────────┴────────┴────────┘                      │
│                                                             │
│ ☐ ALUNO        CURSO    PROFESSOR   CANAL    STATUS  SUCES.│
│ ☑ Lucas M.     Guitarra Prof.Ricardo WhatsApp ●Resp.  100% │
│ ☑ Ana Paula    Piano    Prof.Maria   Email    ●Visu.   85% │
│ ☐ Rafael C.    Bateria  Prof.André   Telefone ●S/Resp  40% │
│ ☐ Fernanda O.  Canto    Prof.Fern.   WhatsApp ●N/Rec   20% │
│ ☑ Pedro H.     Violão   Prof.Ricardo Presenc. ●Conf.  100% │
│                                                             │
│ Mostrando 5 de 250      [← Anterior] [1] [2] [3] [→]      │
└─────────────────────────────────────────────────────────────┘
```

### 5.5 Dashboard — Novos Alertas de Checklist

```
┌─────────────────────────────────────────────────────────────┐
│ ⚡ 3 alunos com primeiro dia de aula amanhã!                │
│ Lucas (Guitarra), Ana (Piano), Rafael (Bateria)             │
│ Verifique se professores e alunos foram notificados.        │
│                                    [Ver Alunos] [Dispensar] │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. DECISÕES FINAIS

| Pergunta | Decisão | Justificativa |
|----------|---------|---------------|
| **Nome da aba** | "Checklists" | Claro, direto, sem ambiguidade |
| **Tarefas existentes** | Manter como "Tarefas Rápidas" (seção separada dentro da aba) | Nem tudo precisa ser checklist completo. To-dos rápidos em 2 cliques, sem modal. Tabela `farmer_tarefas` continua intacta, zero refatoração |
| **Carteira de alunos** | Variável por checklist, com sugestão automática | Flexibilidade real: férias, substituições, checklists parciais. Sistema sugere divisão padrão (A-M / N-Z), farmer ajusta se quiser |
| **Visão gerente** | Não implementar (overkill) | São apenas 2 farmers por unidade. Gerente já tem seletor de farmer no painel. Se crescer, adiciona depois |

---

## 7. PLANO DE IMPLEMENTAÇÃO FASEADO

### Fase 1 — Fundação (Backend + CRUD básico)
**Estimativa: 1 sessão**

1. Criar tabelas no Supabase (migration)
2. Criar RPCs de progresso e listagem
3. Criar hook `useChecklists.ts`
4. Criar tipos em `types.ts`
5. Renomear aba "Tarefas" → "Checklists"

### Fase 2 — UI de Listagem e Criação
**Estimativa: 1 sessão**

1. Componente `ChecklistsTab.tsx` com listagem de cards
2. Modal "Novo Checklist" com builder de tarefas
3. Filtros por status (Ativos/Concluídos/Arquivados) e departamento
4. Manter seção "Tarefas Rápidas" no final (backward compatibility)

### Fase 3 — Visão Expandida + Subtarefas
**Estimativa: 1 sessão**

1. Componente `ChecklistExpandido.tsx`
2. Lista de itens com checkbox, canal, subtarefas indentadas
3. Barra de progresso em tempo real
4. Filtros por professor/curso dentro do checklist

### Fase 4 — Vínculo com Alunos/Professores + Carteira
**Estimativa: 1 sessão**

1. Seletor de alunos no modal (Todos / Por Curso / Por Professor / Manual)
2. Tabela de carteira de alunos com tracking de contato
3. Divisão de carteira entre farmers (variável por checklist, com sugestão automática)
4. Painel de sucesso por canal

### Fase 5 — Alertas + WhatsApp + Templates + Polish
**Estimativa: 1 sessão**

1. Alertas proativos no Dashboard (primeiro dia de aula, prazos)
2. Lembrete WhatsApp para o farmer
3. Templates de checklist reutilizáveis
4. Integração com Histórico (métricas de checklists)
5. Animações e micro-interações finais

---

## 8. RESUMO EXECUTIVO

| Decisão | Escolha |
|---------|---------|
| **Onde mora o Checklist** | Expande a aba "Tarefas" → "Checklists" |
| **Tarefas existentes** | Mantidas como "Tarefas Rápidas" dentro da aba |
| **Carteira** | Variável por checklist, com sugestão automática |
| **Rotinas mudam?** | Não. Continuam como estão |
| **Recados mudam?** | Não. Podem ser acionados de dentro de checklists no futuro |
| **Visão gerente** | Não (gerente usa seletor de farmer existente) |
| **Novas tabelas** | 5 (checklists, itens, contatos, templates, carteira) |
| **Novas RPCs** | 3 (progresso, sucesso_contato, meus_checklists) |
| **Fases** | 5 fases incrementais |
| **Backward compatible** | Sim. Tarefas existentes continuam funcionando |
