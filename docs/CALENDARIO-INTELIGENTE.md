# Calendário Inteligente — Documentação Completa

> **Versão:** 1.0 — 12/08/2026
> **Status:** Em produção, Fase 3 (Inteligência) completa
> **Próximo passo:** Integrar alertas na página de Alunos e Administrativo

---

## 1. Objetivo

O Calendário Inteligente é o **motor de planejamento** da LA Music. Projeta as 40 aulas do pacote de cada aluno, respeitando feriados, recessos, emendas e eventos. Dá visibilidade de quando o contrato termina e quem precisa de atenção.

### Por que existe

- O Emusys não projeta contratos — a equipe não sabe quando o pacote de 40 aulas acaba.
- Feriados e recessos deslocam aulas — sem projeção, o contrato "estoura" sem ninguém perceber.
- A matrícula não avisa se o dia da semana escolhido fecha as 40 aulas no ano.
- A equipe precisa de um lugar para planejar o ano letivo antes de confirmar.

### Princípio central

> **O calendário é o motor, não o destino.** A equipe configura o ano aqui; o motor projeta contratos e alerta quem precisa de olhar. A operação diária acontece na Chamada e na página de Alunos.

---

## 2. Arquitetura

```
BrasilAPI ──→ sync-feriados (edge) ──→ feriados (nacionais + estaduais)
                                              │
Emusys API ──→ sync-presenca-emusys ──→ aulas_emusys
                                              │
                                              ▼
                                    calendario_escolar (recessos, emendas, eventos)
                                              │
                                              ▼
                                    materializar_projecao_contrato (RPC)
                                              │
                                              ▼
                                    projecao_aulas (40 aulas projetadas)
                                              │
                              ┌───────────────┼───────────────┐
                              ▼               ▼               ▼
                        get_watchlist    get_radar_      simular_emenda
                        _projecao        renovacoes      (RPC)
                              │               │               │
                              ▼               ▼               ▼
                        CalendarioEscolar  TimelineContrato  ModalNovoAluno
                        (UI)               (UI)              (semáforo)
```

### Tabelas principais

| Tabela | O que guarda | Quem escreve |
|--------|-------------|--------------|
| `feriados` | Feriados nacionais, estaduais, municipais | sync-feriados + manual |
| `calendario_escolar` | Recessos, emendas, eventos, day_off | Equipe (UI) |
| `projecao_aulas` | 40 aulas projetadas por contrato | materializar_projecao_contrato |
| `projecao_recalculo_log` | Log de recálculos | triggers |

### RPCs

| RPC | O que faz |
|-----|-----------|
| `materializar_projecao_contrato` | Gera as 40 aulas projetadas para um contrato |
| `recalcular_projecao` | Recalcula projeção quando calendário muda |
| `get_watchlist_projecao` | Lista alunos que precisam de atenção |
| `get_radar_renovacoes` | Radar de renovações por mês |
| `simular_emenda` | Simula impacto de uma emenda antes de confirmar |
| `prever_projecao` | Previa da projeção antes de materializar |

### Triggers

| Trigger | Quando dispara | O que faz |
|---------|---------------|-----------|
| `trg_jornada_projecao` | Nova matrícula | Materializa projeção automaticamente |
| `trg_presenca_projecao` | Nova presença | Marca aula projetada como realizada |
| `trg_reposicao_projecao` | Nova reposição | Atualiza projeção com data da reposição |
| `trg_calendario_projecao` | Mudança no calendário | Recalcula projeções afetadas |

---

## 3. Como funciona

### 3.1 Tipos de calendário

| Tipo | O que é | Cor no calendário | Efeito no motor |
|------|---------|-------------------|-----------------|
| `recesso` | Período sem aula (Carnaval, julho, dezembro) | Cinza | Pula os dias |
| `emenda` | Feriado que vira dia sem aula | Âmbar | Pula o dia |
| `feriado` | Feriado local (estadual/municipal) | Rosa | Pula o dia |
| `evento` | Evento pedagógico (Summer Camp, Cineminha) | Violeta | Conta como aula, mas não é regular |
| `day_off` | Dia sem aula por decisão da escola | Cyan | Pula o dia |

### 3.2 Feriados

**Fontes:**

| Tipo | Fonte | Automático? |
|------|-------|-------------|
| Nacional | BrasilAPI | ✅ Sim (cron anual) |
| Estadual | BrasilAPI (`?uf=RJ`) | ✅ Sim (cron anual) |
| Municipal | Cadastro manual | ❌ Não |

**Separação:**
- `tipo = 'nacional'` — verde
- `tipo = 'estadual'` + `uf = 'RJ'` — azul
- `tipo = 'municipal'` + `cidade = 'Rio de Janeiro'` — rosa

### 3.3 Motor de projeção

**Regras:**

1. Pacote padrão = **40 aulas**
2. Aulas acontecem no **dia da semana** do contrato (ex: toda segunda)
3. O motor pula: feriados, recessos, emendas, day_off
4. Eventos contam como aula (mas marcados como evento)
5. Se o contrato cruza o ano, usa **calendário provisório** do ano seguinte

**Banco de segurança:**

Cada dia da semana tem um número diferente de aulas possíveis no ano. O banco é o excedente sobre as 40 vendidas:

| Dia | Aulas possíveis | Banco | Status |
|-----|----------------|-------|--------|
| Segunda | 48 | +8 | ideal |
| Terça | 47 | +7 | ideal |
| Quarta | 46 | +6 | ideal |
| Quinta | 45 | +5 | ideal |
| Sexta | 44 | +4 | ideal |
| Sábado | 40 | 0 | justo |

Se o banco é negativo, o dia não fecha o pacote — precisa de ajuste (reposição ou mudança de dia).

### 3.4 Semáforo de matrícula

No `ModalNovoAluno`, depois de escolher dia da semana e horário:

- **Verde:** projeção fecha corretamente
- **Amarelo:** atenção (banco apertado)
- **Vermelho:** ciclo não fecha — precisa de ajuste

### 3.5 Watchlist

Alunos que precisam de olhar:

| Status | O que significa | Ação sugerida |
|--------|----------------|---------------|
| `estourando` | Contrato estoura em janeiro | Agendar reposição |
| `sem_margem` | Sem folga no banco | Acompanhar |
| `janela_renovacao` | Hora de renovar | Chamar para renovar |
| `concluido` | 40 aulas dadas | Renovar contrato |

### 3.6 Radar de renovações

Projeção de renovações por mês, baseada na data de término projetada de cada contrato.

### 3.7 Simulador de emendas

Antes de confirmar uma emenda, o simulador mostra:
- Quantos contratos são afetados
- Quantas aulas são deslocadas
- Impacto no banco de segurança

---

## 4. UI — Página Calendário Inteligente

### 4.1 Estrutura

```
┌─────────────────────────────────────────┐
│ Header: Calendário Inteligente          │
│ [Importar feriados] [+ Adicionar]       │
├─────────────────────────────────────────┤
│ Como usar (3 passos)                    │
│ 1. Planeje o ano → 2. Veja o impacto    │
│ 3. Acompanhe os alunos                  │
├─────────────────────────────────────────┤
│ KPIs: Aulas, Feriados, Recessos,        │
│ Emendas, Melhor dia, Pior dia, Contratos│
├─────────────────────────────────────────┤
│ 1. Banco de segurança por dia           │
│    [Seg] [Ter] [Qua] [Qui] [Sex] [Sáb]  │
├─────────────────────────────────────────┤
│ 2. Calendário do ano + Painel lateral   │
│    [Calendário]  │ [Feriados]           │
│                  │ [Recessos]           │
│                  │ [Emendas]            │
│                  │ [Alertas]            │
├─────────────────────────────────────────┤
│ 3. Watchlist — Alunos que precisam      │
│    [Tabela: Aluno, Dia, Aulas, Status]  │
└─────────────────────────────────────────┘
```

### 4.2 Interações

| Ação | Resultado |
|------|-----------|
| Clicar no dia | Abre modal para adicionar item (recesso, emenda, etc.) |
| Hover no dia | Tooltip mostra o que é (feriado, recesso, hoje) |
| Clicar "Ver todos os feriados" | Modal com lista completa |
| Clicar fora do modal | Fecha |
| Apertar ESC | Fecha modal |
| Clicar "Importar feriados" | Puxa BrasilAPI para o ano atual |

### 4.3 Modo consolidado

Quando nenhuma unidade está selecionada:
- Mostra dados de todas as unidades
- Calendário funciona normalmente
- Watchlist agrega todas as unidades

---

## 5. O que falta

### 5.1 Integração com página de Alunos (próximo passo)

A equipe mora na página de Alunos. Precisa aparecer lá:

- **Alerta de alunos novos:** matrículas que caíram via webhook e precisam de atenção
  - "X novos alunos esta semana — configure a projeção"
  - Deep-link para o calendário ou para a ficha do aluno

- **Alerta de contrato estourando:** alunos cujo pacote está acabando
  - "João termina o pacote em 15 dias — agendar renovação"

- **Alerta de semáforo vermelho:** matrículas que não fecham as 40 aulas
  - "Maria (terça) não fecha o pacote — sugerir mudança de dia"

**Onde implementar:** `src/components/App/Alunos/` — card de alerta no topo da lista, ou badge na linha do aluno.

### 5.2 Integração com página Administrativa

- **Resumo de projeções:** "X contratos projetados, Y estourando, Z sem margem"
- **Alerta de calendário incompleto:** "Faltam cadastrar recessos para 2027"
- **Alerta de feriados desatualizados:** "Rodar importação de feriados"

### 5.3 Notificações

- WhatsApp para equipe quando contrato está estourando
- Notificação in-app quando projeção muda por mudança no calendário
- Email mensal com radar de renovações

### 5.4 Melhorias no motor

- **Projeção por professor:** saber se o professor tem carga para as aulas projetadas
- **Projeção por sala:** saber se a sala está disponível
- **Otimização de grade:** sugerir melhor dia/horário para novas matrículas

---

## 6. Arquivos principais

| Arquivo | O que é |
|---------|---------|
| `src/components/App/Agenda/CalendarioEscolar.tsx` | Página do calendário |
| `src/components/App/Agenda/TimelineContrato.tsx` | Timeline do contrato |
| `src/components/App/Alunos/ModalNovoAluno.tsx` | Semáforo de matrícula |
| `supabase/functions/sync-feriados/index.ts` | Sync de feriados |
| `supabase/migrations/20260812*.sql` | Migrations do motor |

---

## 7. Commits relevantes

| Commit | O que fez |
|--------|-----------|
| `d63678c2` | Fase 1 — fundação (calendário, projeção, triggers) |
| `7dad76ea` | Fase 2 — recálculo, watchlist real |
| `57c76f68` | Fase 3 — simulador, radar, timeline |
| `de3a1724` | Calendário provisório para contratos rolling |
| `de7439d2` | UX clara — guia de 3 passos |
| `62cd82ee` | Banco de segurança no topo |
| `76d006a3` | Modo consolidado |
| `696ab840` | Feriados nacionais/estaduais/municipais |

---

## 8. Comparativo: LA Report vs Emusys

| Feature | Emusys | LA Report |
|---------|--------|-----------|
| Feriados nacionais | Manual | ✅ Automático (BrasilAPI) |
| Feriados estaduais | Manual | ✅ Automático (BrasilAPI) |
| Feriados municipais | Manual | ✅ Manual (cadastro) |
| Recessos | Manual | ✅ Manual (com simulador) |
| Projeção de contrato | ❌ Não tem | ✅ 40 aulas projetadas |
| Banco de segurança | ❌ Não tem | ✅ Por dia da semana |
| Semáforo de matrícula | ❌ Não tem | ✅ Verde/amarelo/vermelho |
| Watchlist | ❌ Não tem | ✅ Alunos que precisam de olhar |
| Radar de renovações | ❌ Não tem | ✅ Por mês |
| Simulador de emendas | ❌ Não tem | ✅ Antes de confirmar |
| Alertas na página de Alunos | ❌ Não tem | 🔲 **Próximo passo** |
| Alertas na página Admin | ❌ Não tem | 🔲 **Próximo passo** |
