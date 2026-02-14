# 🎯 PROMPT WINDSURF — SUCESSO DO ALUNO (LA Music Report)

## CONTEXTO GERAL

Vamos criar a feature **"Sucesso do Aluno"** dentro do **LA Music Report**. Esta é uma feature de inteligência que monitora a saúde de cada aluno da escola, detecta riscos de evasão, e permite ações proativas pela equipe administrativa (farmers).

**Referência arquitetural:** A feature deve espelhar o modelo que já existe em **Professores > Performance**, que já tem: health score com gauge, tabela de professores com métricas, card individual com relatório e plano de ação inteligente via IA. Vamos replicar essa mesma estrutura para alunos.

**IMPORTANTE:** NÃO referenciar nenhum sistema externo. Tudo deve ser construído usando componentes, hooks, padrões e tokens semânticos que JÁ EXISTEM dentro do LA Music Report. Verificar sempre os componentes existentes antes de criar novos.

**WIREFRAME DE REFERÊNCIA VISUAL:** O arquivo `wireframe-sucesso-aluno.html` contém o design completo de todas as telas usando os tokens do Design System do LA Music Report. Abrir no browser para referência visual de: Dashboard, Tabela, Card Individual, Kanban, Micro-Formulário de Feedback (mobile), e Formulário de Presença (mobile).

---

## 📍 LOCALIZAÇÃO NA ARQUITETURA

A feature fica dentro da página **Alunos**, como uma nova sub-aba chamada **"Sucesso do Cliente"**.

```
Alunos (página já existente)
├── Lista de Alunos        ← já existe
├── Gestão de Turmas       ← já existe
├── Grade Horária          ← já existe
├── Distribuição           ← já existe
├── Importar Alunos        ← já existe
└── 🆕 Sucesso do Cliente  ← CRIAR ESTA SUB-ABA
```

A sub-aba segue o mesmo padrão visual das outras sub-abas de Alunos (botões com ícone, estilo rounded, cor de destaque ao selecionar).

---

## 🏗️ ESTRUTURA DA FEATURE — 7 FASES

---

## FASE 1 — BANCO DE DADOS (Supabase)

### Antes de criar qualquer coisa, AUDITAR o que já existe:

Verificar no Supabase quais tabelas já existem relacionadas a alunos. Provavelmente existem tabelas como:
- Tabela de alunos (com nome, curso, professor, escola, dia, horário, turma, parcela, status, tempo de casa)
- Tabela de turmas
- Tabela de professores
- Tabela de pagamentos/parcelas
- Tabela de lançamentos (renovações, cancelamentos, avisos prévios, trancamentos)

**Não duplicar dados.** As novas tabelas devem REFERENCIAR as existentes via foreign keys.

### Novas tabelas a criar:

**Tabela 1: `aluno_health_scores`**
Armazena o health score calculado de cada aluno por competência (mês/ano).

Colunas sugeridas:
- id (uuid, PK)
- aluno_id (FK → tabela de alunos existente)
- escola_id (FK → tabela de escolas/unidades existente)
- competencia (date — primeiro dia do mês, ex: 2026-02-01)
- score (integer, 0-100)
- status (text: 'saudavel', 'atencao', 'critico')
- fase_jornada (text: 'onboarding', 'consolidacao', 'encantamento', 'renovacao')
- presenca_pct (numeric, nullable — % de presença quando disponível)
- pagamento_status (text: 'em_dia', 'atrasado', 'inadimplente')
- tempo_casa_meses (integer)
- feedback_professor (text, nullable: 'verde', 'amarelo', 'vermelho')
- detalhes (jsonb — dados extras para o relatório)
- created_at (timestamptz)
- updated_at (timestamptz)

Índices: (aluno_id, competencia) UNIQUE, (escola_id, competencia), (status)

**Tabela 2: `aluno_feedback_professor`**
Registra cada feedback (coraçãozinho) que o professor dá pro aluno.

Colunas sugeridas:
- id (uuid, PK)
- aluno_id (FK)
- professor_id (FK)
- escola_id (FK)
- competencia (date)
- feedback (text: 'verde', 'amarelo', 'vermelho')
- observacao (text, nullable — comentário opcional do professor)
- respondido_em (timestamptz)
- sessao_id (FK → aluno_feedback_sessoes)
- created_at (timestamptz)

Índices: (aluno_id, professor_id, competencia) UNIQUE, (sessao_id)

**Tabela 3: `aluno_feedback_sessoes`**
Controla as sessões de feedback enviadas aos professores (cada envio de link).

Colunas sugeridas:
- id (uuid, PK)
- professor_id (FK)
- escola_id (FK)
- competencia (date)
- token (text, UNIQUE — token único para o link)
- status (text: 'pendente', 'parcial', 'concluido')
- total_alunos (integer)
- respondidos (integer, default 0)
- enviado_em (timestamptz)
- concluido_em (timestamptz, nullable)
- enviado_por (FK → usuário que enviou)
- created_at (timestamptz)

**Tabela 4: `aluno_acoes`**
Registra ações tomadas pela equipe em relação a um aluno (histórico de intervenções).

Colunas sugeridas:
- id (uuid, PK)
- aluno_id (FK)
- escola_id (FK)
- tipo (text: 'ligacao', 'whatsapp', 'reuniao', 'observacao', 'plano_ia')
- descricao (text)
- resultado (text, nullable)
- realizado_por (FK → usuário)
- created_at (timestamptz)

**Tabela 5: `aluno_metas`**
Metas definidas para alunos específicos (espelha o modelo de metas de professores).

Colunas sugeridas:
- id (uuid, PK)
- aluno_id (FK)
- escola_id (FK)
- titulo (text)
- descricao (text, nullable)
- tipo (text: 'presenca', 'pagamento', 'engajamento', 'custom')
- valor_meta (numeric)
- valor_atual (numeric)
- prazo (date)
- status (text: 'ativa', 'concluida', 'cancelada')
- created_at (timestamptz)
- updated_at (timestamptz)

### Views a criar:

**View: `vw_aluno_sucesso_resumo`**
Visão consolidada por unidade/competência com contagem de saudáveis, atenção, críticos, média geral do health score, e tops (presença, veterano, engajamento).

**View: `vw_aluno_sucesso_lista`**
Visão detalhada por aluno com todas as métricas necessárias para a tabela: health score, curso, professor, fase, presença, pagamento, tempo de casa, último feedback. Deve fazer JOIN com as tabelas existentes de alunos, turmas, professores, e com as novas tabelas de health score e feedback.

### RPCs a criar:

**RPC: `calcular_health_score_alunos`**
Calcula/recalcula o health score de todos os alunos de uma unidade para uma competência. Lógica do cálculo:

| Métrica | Peso | Regra |
|---------|------|-------|
| Pagamento em dia | 30% | Em dia = 30, Atrasado = 15, Inadimplente = 0 |
| Tempo de casa | 20% | > 24 meses = 20, 12-24 = 15, 6-12 = 10, 3-6 = 5, < 3 = 2 |
| Fase da jornada | 20% | Renovação = 20, Encantamento = 15, Consolidação = 10, Onboarding = 5 |
| Feedback professor | 20% | Verde = 20, Amarelo = 10, Vermelho = 0, Sem feedback = 10 |
| Presença | 10% | ≥ 80% = 10, 60-79% = 7, 40-59% = 4, < 40% = 0, Sem dado = 5 |

Score final = soma dos pontos. Status: ≥ 70 Saudável, 40-69 Atenção, < 40 Crítico.

**Nota sobre presença:** Inicialmente não teremos dados de presença individual. O peso de presença (10%) deve usar o valor default 5 (sem dado). Quando a feature de presença via WhatsApp for implementada futuramente, esse campo será populado automaticamente.

**RPC: `get_aluno_sucesso_dashboard`**
Retorna dados consolidados para o dashboard: cards resumo, health score geral, tops, e alertas ativos. Parâmetros: escola_id, competencia.

**RPC: `get_aluno_sucesso_lista`**
Retorna a lista paginada de alunos com métricas para a tabela. Parâmetros: escola_id, competencia, status_filter, professor_filter, curso_filter, fase_filter, search_text, page, page_size.

**RPC: `get_aluno_detail`**
Retorna todos os dados de um aluno específico para o card individual: health score atual, histórico de scores (últimos 6 meses), métricas, metas ativas, histórico de ações, feedbacks do professor. Parâmetros: aluno_id.

**RPC: `gerar_relatorio_aluno`**
Gera o texto do relatório individual do aluno em formato WhatsApp (markdown com emojis). Parâmetros: aluno_id, competencia. Retorna o texto pronto para copiar.

**Definir a fase da jornada:**
A fase é calculada pelo tempo de casa do aluno:
- **Onboarding** — 0 a 3 meses
- **Consolidação** — 3 a 6 meses
- **Encantamento** — 6 a 9 meses
- **Renovação** — 9+ meses

A coluna "TEMPO" já existe na tabela de alunos (visível na Lista de Alunos como "7m", "4m", "3a", "1a 5m", etc). Usar essa coluna como base para calcular a fase.

---

## FASE 2 — COMPONENTES DO DASHBOARD

### Antes de criar componentes, AUDITAR o que já existe:

Verificar os componentes existentes em Professores > Performance e reutilizar:
- **Componente de gauge/velocímetro** do Health Score → reutilizar para o health score geral dos alunos
- **Componente de cards de alerta** (crítico/atenção/excelente) → reutilizar com dados de alunos
- **Componente de cards de tops** (Top Conversão, Top Retenção, etc.) → adaptar para Top Presença, Top Veterano, etc.
- **Componente de tabela com filtros** → reutilizar padrão da tabela de professores

### Novos componentes a criar:

**Componente: `SucessoClienteTab.tsx`**
Container principal da sub-aba. Gerencia o estado entre as sub-seções (Dashboard, Alertas, Jornada).

**Componente: `SucessoDashboard.tsx`**
Dashboard com cards resumo, gauge central, e tops. Layout espelhando `Professores > Performance`.

**Componente: `SucessoTabela.tsx`**
Tabela de alunos com métricas e filtros. Colunas: Aluno, Health, Curso, Professor, Fase, Presença, Pagamento, Tempo, Feedback, Status, Ações.

**Componente: `SucessoAlertasAtivos.tsx`**
Lista de alertas ativos — alunos que precisam de atenção. Cada alerta mostra: severidade (badge MÉDIO/ALTO/CRÍTICO), tipo de risco (texto descritivo), score atual, e botões de ação (telefone, mensagem, resolver). Espelhar o componente de alertas que já existe.

### Hooks:

**Hook: `useSucessoAluno.ts`**
Hook principal: busca dashboard, lista, filtros. Gerencia estado de loading, paginação, filtros ativos.

**Hook: `useSucessoAlunoDetail.ts`**
Hook para o card individual: busca detalhes do aluno, metas, ações, feedbacks.

---

## FASE 3 — CARD INDIVIDUAL DO ALUNO (Modal)

Ao clicar "Ver" na tabela, abre um modal/drawer com o perfil completo do aluno. **Espelhar exatamente o card individual do professor** que já existe.

### Estrutura do Card:

**Header:**
- Avatar/iniciais do aluno
- Nome completo
- Curso + Professor + Unidade
- Badge de status (Saudável/Atenção/Crítico)

**Métricas Atuais (cards em linha):**
- Health Score (gauge igual ao do professor)
- Presença (% ou "—" se indisponível)
- Pagamento (Em dia / Atrasado)
- Tempo de casa
- Fase da Jornada
- Feedback Professor (último coraçãozinho)

**Botão "Gerar Relatório Individual":**
- Botão verde grande (mesmo estilo do professor)
- Gera relatório em formato WhatsApp com emojis
- Formato:

```
━━━━━━━━━━━━━━━━━━━━━━
📊 *RELATÓRIO DO ALUNO*
🎓 *NOME DO ALUNO*
📅 *FEVEREIRO/2026*
🏢 Campo Grande
━━━━━━━━━━━━━━━━━━━━━━
> Resumo geral do aluno...
───────────────────────
❤️ *HEALTH SCORE*
▓▓▓▓▓▓▓░░░ *72* 🟢 SAUDÁVEL
───────────────────────
📈 *INDICADORES*
• Curso: Guitarra
• Professor: Matheus Sterque
• Fase: Consolidação (5 meses)
• Pagamento: Em dia (R$ 447)
• Presença: —
• Feedback Professor: 💚 Positivo
───────────────────────
✅ *PONTOS FORTES*
• Pagamento sempre em dia
• Professor com feedback positivo
───────────────────────
⚠️ *PONTOS DE ATENÇÃO*
• Fase de consolidação — momento crítico de retenção
───────────────────────
🎯 *SUGESTÕES*
• Acompanhamento mais próximo na fase de consolidação
• Considerar ação de encantamento (evento, brinde)
━━━━━━━━━━━━━━━━━━━━━━
📅 Gerado em: 14/02/2026 às 18:30
━━━━━━━━━━━━━━━━━━━━━━
```

- Botão "Copiar" ao lado para copiar o relatório

**Plano de Ação Inteligente (IA):**
- Mesmo componente visual que já existe no card do professor
- Botão "Gerar Plano" que chama uma Edge Function
- A Edge Function recebe os dados do aluno (health score, métricas, histórico) e retorna análise + sugestões personalizadas
- Exibe: análise contextual em texto, pontos fortes (lista), pontos de atenção (lista), sugestões numeradas com descrição e meta específica
- **Reutilizar a Edge Function existente** de plano de ação do professor, adaptando o prompt/system message para contexto de aluno em vez de professor

**Metas Ativas:**
- Lista de metas do aluno (inicialmente vazia, com texto "Nenhuma meta ativa")
- Botão "+ Nova Meta" para criar
- Cada meta: título, valor atual vs meta, prazo, status

**Histórico de Ações:**
- Lista de ações registradas (inicialmente vazia, com texto "Nenhuma ação registrada")
- Botão "+ Nova Ação" para registrar intervenção
- Cada ação: tipo (ícone), descrição, data, quem registrou

---

## FASE 4 — JORNADA DO ALUNO (Pipeline Kanban)

### IMPORTANTE — Reutilizar componente de pipeline que já existe:

O LA Music Report já tem um componente de pipeline/kanban no **Pré-Atendimento** (pipeline de leads da Andreza). Verificar esse componente e REUTILIZÁ-LO para a Jornada do Aluno, adaptando as colunas e cards.

### Estrutura do Kanban:

4 colunas representando as fases da jornada:

| Coluna | Faixa | Cor |
|--------|-------|-----|
| 🎒 ONBOARDING | 0-3 meses | Roxo/Violet |
| ❤️ CONSOLIDAÇÃO | 3-6 meses | Rosa/Pink |
| ⭐ ENCANTAMENTO | 6-9 meses | Dourado/Amber |
| 🔄 RENOVAÇÃO | 9+ meses | Verde/Emerald |

Cada coluna mostra o contador de alunos naquela fase.

### Cards do Kanban:

Cada card de aluno mostra:
- Nome + iniciais/avatar
- Curso (com ícone do instrumento se disponível)
- Coraçãozinho do último feedback do professor (💚/💛/❤️)
- Status de pagamento (Em dia / Atrasado — badge pequeno)
- Menu de ações (3 pontos): Ver detalhes, Registrar ação, Enviar mensagem

### Funcionalidades:

- **NÃO implementar drag-and-drop.** A fase é calculada automaticamente pelo tempo de casa. O kanban é somente visualização.
- **Busca:** Campo de busca por nome do aluno (canto superior direito)
- **Filtros:** Por professor, por curso, por status de pagamento, por feedback
- **Contador total:** "TOTAL: X ALUNOS" no canto superior direito
- **Resumo da Jornada:** Seção abaixo do kanban com estatísticas de cada fase (quantidade, %, ticket médio por fase)

---

## FASE 5 — MICRO-FORMULÁRIO DE FEEDBACK DO PROFESSOR (Coraçãozinho)

### Esta é uma feature CRÍTICA que elimina o trabalho manual das farmers.

### Contexto do problema atual:
Hoje as farmers enviam uma mensagem manualmente pelo WhatsApp pedindo ao professor o feedback de cada aluno. O professor responde por texto. A farmer então precisa interpretar a resposta e registrar manualmente. Isso é lento, inconsistente, e frequentemente não é feito.

### Solução — Fluxo completo:

```
1. Farmer clica "Enviar Feedback" no sistema (botão na aba Sucesso do Cliente)
2. Seleciona professor(es) para enviar
3. Sistema gera link único com token para cada professor
4. Link é enviado automaticamente pro WhatsApp do professor via UAZAPI
5. Professor abre o link no celular (página pública, sem login)
6. Vê página HTML bonita e simples com a lista dos seus alunos
7. Para cada aluno, toca no coraçãozinho: 💚 Bem / 💛 Atenção / ❤️ Preocupante
8. Pode adicionar observação em texto (opcional)
9. Cada toque salva automaticamente no Supabase (sem botão "enviar" por aluno)
10. Ao finalizar todos, toca "Enviar Feedback" no final da página
11. Dados aparecem automaticamente no Sucesso do Cliente
12. Farmer vê no painel quais professores já responderam e quais estão pendentes
```

### Componente no LA Music Report (lado da farmer):

**Botão "📋 Enviar Feedback Professores"** visível na aba Sucesso do Cliente (pode ficar ao lado do botão "Gerar Relatório Coordenação" como referência de posição).

Ao clicar, abre modal/dialog com:
- Lista de todos os professores da unidade selecionada
- Status de cada um naquele mês: ✅ Concluído / ⏳ Pendente / ❌ Não enviado
- Quantidade respondida por professor: "8/12 alunos"
- Botão "Enviar" individual por professor
- Botão "Enviar para Todos Pendentes" no topo
- Seletor de competência (mês/ano)
- Data do último envio

Cada envio:
1. Cria registro em `aluno_feedback_sessoes` com token único (uuid v4)
2. Dispara mensagem via UAZAPI pro WhatsApp do professor com o link
3. Atualiza status para "Pendente"

### Página pública do professor (micro-formulário):

**Rota:** Pode ser implementado como:
- Opção A: Rota pública no app React (`/feedback/:token`) — mais integrado, usa mesmos componentes
- Opção B: Edge Function que serve HTML estático — mais simples, independente do build
- Recomendação: Opção A se o router já suporta rotas públicas, senão Opção B.

**Layout (mobile-first — o professor vai abrir no celular):**

```
┌─────────────────────────────┐
│                             │
│  🎵 LA Music                │
│  Feedback dos Alunos        │
│                             │
│  Prof. Isaque Mendes        │
│  Fevereiro/2026 • Barra     │
│                             │
│  ━━━━━━━━━━━━━━━━━━━━━━━━  │
│  Como seus alunos estão?    │
│  Toque no coração para      │
│  avaliar cada aluno.        │
│                             │
│  ■■■■■□□□□□□□ 3/12          │
│  (barra de progresso)       │
│                             │
│ ┌─────────────────────────┐ │
│ │ Adriana Christine   ✅   │ │
│ │ Guitarra • Sáb 09:00    │ │
│ │                         │ │
│ │  💚       💛       ❤️    │ │
│ │  Bem    Atenção  Risco  │ │
│ │  [●]     [ ]     [ ]   │ │
│ │                         │ │
│ │ 💬 Ótima aluna, sempre  │ │
│ │    presente...          │ │
│ └─────────────────────────┘ │
│                             │
│ ┌─────────────────────────┐ │
│ │ João Pedro               │ │
│ │ Guitarra • Sáb 10:00    │ │
│ │                         │ │
│ │  💚       💛       ❤️    │ │
│ │  Bem    Atenção  Risco  │ │
│ │  [ ]     [ ]     [ ]   │ │
│ └─────────────────────────┘ │
│                             │
│  ... mais alunos ...        │
│                             │
│  ┌───────────────────────┐  │
│  │  ✅ Enviar Feedback    │  │
│  │     (3/12 avaliados)   │  │
│  └───────────────────────┘  │
│                             │
│  Obrigado, Prof. Isaque! 🎶│
└─────────────────────────────┘
```

**Regras do micro-formulário:**
- Mobile-first — botões grandes, fáceis de tocar no celular
- Design clean com fundo escuro (seguindo o tema do LA Music Report) ou fundo branco limpo (o que ficar melhor no celular)
- Sem login necessário — autenticação APENAS via token na URL
- Token expira ao final do mês da competência
- Cada toque no coraçãozinho salva automaticamente (PATCH no Supabase)
- Campo de observação é opcional e aparece após selecionar o coração
- Barra de progresso mostrando "X de Y avaliados"
- O botão "Enviar Feedback" no final marca a sessão como concluída
- Se o professor voltar ao link depois de concluir, vê resumo do que respondeu com opção de editar
- Se o token expirou, mostra mensagem amigável

**Segurança:**
- RLS policy que permite INSERT/UPDATE em `aluno_feedback_professor` apenas quando o token é válido e não expirou
- Token é uuid v4, impossível de adivinhar
- Não expõe dados sensíveis do aluno (apenas nome, curso, dia/horário)

**Mensagem UAZAPI para o professor:**

```
🎵 *LA Music — Feedback dos Alunos*

Olá, Prof. {nome}! 👋

Precisamos do seu feedback sobre seus alunos de {mês}/{ano} na unidade {escola}.

É rapidinho! Basta tocar no coração de cada aluno:
💚 Bem — aluno engajado e participativo
💛 Atenção — algo a observar  
❤️ Preocupante — precisa de acompanhamento

👉 Acesse aqui: {link}

Obrigado pela sua colaboração! 🎶
```

---

## FASE 6 — INTEGRAÇÃO COM PAINEL FARMER

### Conexão por dados, não por interface:

O Sucesso do Aluno vive em **Alunos > Sucesso do Cliente**. Mas os alertas relevantes devem aparecer no **Dashboard do Farmer** (Administrativo > Painel Farmer > Dashboard).

### O que adicionar no Dashboard do Farmer:

**Card "Alertas de Alunos":**
- Mostra quantidade de alunos com health score crítico
- Ex: "⚠️ 5 alunos com saúde crítica"
- Clicável — ao clicar, redireciona para Alunos > Sucesso do Cliente com filtro de críticos ativo

**Card "Feedback Pendente":**
- Mostra quantos professores ainda não responderam o feedback do mês
- Ex: "📋 8 professores sem feedback este mês"
- Clicável — ao clicar, abre o modal de envio de feedback

### Verificar se o Painel Farmer > Dashboard já tem uma seção de alertas ou cards informativos. Se sim, adicionar os novos cards seguindo o mesmo layout. Se não, criar uma seção "Alertas de Alunos" no dashboard.

---

## FASE 7 — PRESENÇA DO ALUNO VIA WHATSAPP (UAZAPI)

### Esta fase implementa o tracking automático de presença dos alunos, eliminando controle manual.

### Contexto:

O sistema já tem os horários de aula bem definidos para cada aluno (dia da semana + horário). Usando essa informação, podemos disparar automaticamente uma mensagem pro professor no WhatsApp minutos antes ou após a aula, pedindo confirmação de presença de cada aluno daquela turma/horário.

### Fluxo completo:

```
1. Sistema identifica que o Prof. Isaque tem aula Sáb 09:00 com Adriana Christine (Guitarra)
2. Às 09:05 (5 min após início da aula), UAZAPI envia mensagem automática pro professor
3. Professor recebe: "Adriana Christine teve aula hoje?" com botões SIM / NÃO / REMARCOU
4. Professor toca no botão
5. Resposta entra direto no Supabase na tabela de presença
6. Health score do aluno é atualizado automaticamente com o dado de presença real
7. No dashboard Sucesso do Cliente, a coluna "Presença" mostra % real em vez de "—"
```

### Tabela no banco:

**Tabela: `aluno_presenca`**

Colunas sugeridas:
- id (uuid, PK)
- aluno_id (FK)
- professor_id (FK)
- escola_id (FK)
- data_aula (date — data específica da aula)
- horario_aula (time — horário da aula)
- status (text: 'presente', 'ausente', 'remarcou', 'pendente')
- respondido_por (text: 'professor_whatsapp', 'manual', 'sistema')
- respondido_em (timestamptz, nullable)
- mensagem_uazapi_id (text, nullable — ID da mensagem enviada para tracking)
- created_at (timestamptz)

Índices: (aluno_id, data_aula) UNIQUE, (professor_id, data_aula), (escola_id, data_aula)

### Lógica de disparo (via n8n ou Edge Function cron):

**Opção recomendada: Workflow n8n com cron**

O workflow n8n roda a cada 5 minutos e:
1. Consulta no Supabase quais aulas estão acontecendo agora (ou começaram há 5 min)
2. Agrupa por professor — se o professor tem 3 alunos no mesmo horário (turma), envia UMA mensagem com os 3 nomes
3. Envia via UAZAPI com botões interativos
4. Registra na tabela `aluno_presenca` com status 'pendente'
5. Webhook de resposta do UAZAPI atualiza o status para 'presente', 'ausente' ou 'remarcou'

### Mensagem UAZAPI — Aluno individual:

```
📋 *Presença — {data}*

Prof. {nome}, confirme a presença:

🎓 *{nome_aluno}*
🎵 {curso} • {horário}

O aluno compareceu à aula?

[✅ Presente]  [❌ Ausente]  [🔄 Remarcou]
```

### Mensagem UAZAPI — Turma (múltiplos alunos no mesmo horário):

```
📋 *Presença — {data}*

Prof. {nome}, confirme a presença da turma das {horário}:

1️⃣ {aluno_1} — {curso}
2️⃣ {aluno_2} — {curso}
3️⃣ {aluno_3} — {curso}

👉 Acesse aqui para marcar: {link_presenca}
```

Para turmas com 2+ alunos, usar um **mini-formulário** (similar ao de feedback, mas simplificado — só botões Presente/Ausente/Remarcou por aluno). Link público com token, mesmo padrão da Fase 5.

### Página de presença (mini-formulário para turmas):

**Rota:** `/presenca/{token}` — mesma lógica da Fase 5

Layout mobile-first, super simples:
```
┌─────────────────────────────┐
│  📋 Presença — 14/02/2026   │
│  Prof. Isaque Mendes        │
│  Guitarra • Sáb 09:00      │
│                             │
│ ┌─────────────────────────┐ │
│ │ Adriana Christine        │ │
│ │  ✅  ❌  🔄              │ │
│ └─────────────────────────┘ │
│                             │
│ ┌─────────────────────────┐ │
│ │ João Pedro               │ │
│ │  ✅  ❌  🔄              │ │
│ └─────────────────────────┘ │
│                             │
│  ┌───────────────────────┐  │
│  │    ✅ Confirmar        │  │
│  └───────────────────────┘  │
└─────────────────────────────┘
```

### Integração com Health Score:

Quando a Fase 7 estiver ativa, a RPC `calcular_health_score_alunos` deve:
1. Consultar a tabela `aluno_presenca` para o mês da competência
2. Calcular % de presença real: (aulas presentes / total de aulas no mês) × 100
3. Usar esse valor no campo `presenca_pct` em vez do default 5
4. O peso de presença (10%) agora usa dados reais:
   - ≥ 80% = 10 pontos
   - 60-79% = 7 pontos
   - 40-59% = 4 pontos
   - < 40% = 0 pontos

### Componente no LA Music Report:

Na tabela de Sucesso do Cliente (Fase 2), a coluna "Presença" que antes mostrava "—" agora mostra a % real com cor:
- ≥ 80% → verde
- 60-79% → amarelo
- < 60% → vermelho

No card individual do aluno (Fase 3), adicionar seção "Histórico de Presença" mostrando:
- % do mês atual
- Calendário simples com dias de aula marcados (✅ presente, ❌ ausente, 🔄 remarcou)
- Tendência (melhorando/piorando/estável)

### Configuração necessária:

- **Horários de aula:** Já existem no sistema (visíveis na Lista de Alunos: dia + horário). Verificar a tabela/coluna exata.
- **UAZAPI:** Endpoint de envio de mensagem com botões interativos. Verificar se já existe integração UAZAPI no projeto e reutilizar o padrão.
- **Webhook de resposta:** Endpoint que recebe a resposta do professor quando clica no botão. Pode ser Edge Function ou rota n8n.
- **n8n cron:** Workflow agendado que verifica aulas e dispara mensagens. Verificar se já existe infraestrutura n8n no projeto.

---

## 📋 CHECKLIST DE IMPLEMENTAÇÃO

### Fase 1 — Banco de Dados
- [ ] Auditar tabelas existentes de alunos, turmas, professores, pagamentos, lançamentos
- [ ] Mapear os nomes reais das tabelas e colunas existentes
- [ ] Criar tabela `aluno_health_scores`
- [ ] Criar tabela `aluno_feedback_professor`
- [ ] Criar tabela `aluno_feedback_sessoes`
- [ ] Criar tabela `aluno_acoes`
- [ ] Criar tabela `aluno_metas`
- [ ] Criar view `vw_aluno_sucesso_resumo`
- [ ] Criar view `vw_aluno_sucesso_lista`
- [ ] Criar RPC `calcular_health_score_alunos`
- [ ] Criar RPC `get_aluno_sucesso_dashboard`
- [ ] Criar RPC `get_aluno_sucesso_lista`
- [ ] Criar RPC `get_aluno_detail`
- [ ] Criar RPC `gerar_relatorio_aluno`
- [ ] Configurar RLS policies para todas as novas tabelas
- [ ] Executar `calcular_health_score_alunos` para Campo Grande (463 alunos) e validar resultados
- [ ] Build limpo: `vite build` sem erros

### Fase 2 — Dashboard + Tabela
- [ ] Auditar componentes existentes de Professores > Performance (gauge, cards, tabela)
- [ ] Criar `SucessoClienteTab.tsx` (container principal)
- [ ] Criar `SucessoDashboard.tsx` (cards resumo + gauge + tops)
- [ ] Criar `SucessoTabela.tsx` (tabela com filtros completos)
- [ ] Criar `SucessoAlertasAtivos.tsx` (lista de alertas)
- [ ] Criar hook `useSucessoAluno.ts`
- [ ] Integrar como nova sub-aba na página de Alunos
- [ ] Testar com seletores de unidade e competência existentes
- [ ] Build limpo: `vite build` sem erros

### Fase 3 — Card Individual
- [ ] Auditar card individual do professor e seus componentes
- [ ] Criar modal/drawer do aluno espelhando o do professor
- [ ] Implementar gauge de health score individual
- [ ] Implementar "Gerar Relatório Individual" (formato WhatsApp com Copiar)
- [ ] Implementar "Plano de Ação Inteligente" (reutilizar/adaptar Edge Function do professor)
- [ ] Implementar seção "Metas Ativas" com CRUD (criar, concluir, cancelar)
- [ ] Implementar seção "Histórico de Ações" com CRUD (registrar nova ação)
- [ ] Criar hook `useSucessoAlunoDetail.ts`
- [ ] Build limpo: `vite build` sem erros

### Fase 4 — Jornada (Kanban)
- [ ] Auditar componente de pipeline/kanban do Pré-Atendimento
- [ ] Criar kanban de 4 fases (Onboarding/Consolidação/Encantamento/Renovação)
- [ ] Cards de alunos com feedback, pagamento, ações
- [ ] Filtros: professor, curso, pagamento, feedback
- [ ] Busca por nome
- [ ] Resumo da Jornada (estatísticas por fase)
- [ ] Fase é read-only (calculada por tempo de casa, SEM drag-and-drop)
- [ ] Build limpo: `vite build` sem erros

### Fase 5 — Micro-Formulário Feedback Professor
- [ ] Implementar geração de tokens únicos
- [ ] Criar página/rota pública `/feedback/:token` (mobile-first)
- [ ] UI com coraçõezinhos grandes e fáceis de tocar
- [ ] Salvar cada feedback em tempo real no Supabase (sem precisar de submit por aluno)
- [ ] Campo de observação opcional por aluno
- [ ] Barra de progresso
- [ ] Botão final "Enviar Feedback" que marca sessão como concluída
- [ ] Criar modal de gestão de envios no LA Music Report (lista professores + status)
- [ ] Integrar envio via UAZAPI (mensagem WhatsApp com link)
- [ ] RLS policy para acesso via token válido (sem autenticação)
- [ ] Tratamento de token expirado
- [ ] Testar fluxo completo: enviar → professor abre → responde → dados aparecem
- [ ] Build limpo: `vite build` sem erros

### Fase 6 — Integração Farmer
- [ ] Auditar Dashboard do Painel Farmer
- [ ] Adicionar card "Alertas de Alunos" com contagem de críticos
- [ ] Adicionar card "Feedback Pendente" com contagem de pendentes
- [ ] Implementar navegação: clique no card → redireciona para Sucesso do Cliente
- [ ] Build limpo: `vite build` sem erros

### Fase 7 — Presença via WhatsApp
- [ ] Criar tabela `aluno_presenca`
- [ ] Configurar RLS policies para a tabela de presença
- [ ] Mapear horários de aula existentes (tabela/coluna de dia + horário por aluno)
- [ ] Criar workflow n8n (ou Edge Function cron) para disparar mensagens de presença
- [ ] Implementar mensagem UAZAPI para aluno individual (com botões interativos)
- [ ] Implementar mini-formulário `/presenca/:token` para turmas com 2+ alunos
- [ ] Criar webhook/endpoint para receber resposta do professor
- [ ] Atualizar `aluno_presenca` com a resposta (presente/ausente/remarcou)
- [ ] Atualizar RPC `calcular_health_score_alunos` para usar presença real quando disponível
- [ ] Atualizar coluna "Presença" na tabela Sucesso do Cliente (% real com cor)
- [ ] Adicionar seção "Histórico de Presença" no card individual do aluno
- [ ] Testar fluxo completo: cron detecta aula → envia WhatsApp → professor responde → dado aparece
- [ ] Build limpo: `vite build` sem erros

---

## ⚠️ REGRAS IMPORTANTES

1. **AUDITAR ANTES DE CRIAR** — Sempre verificar componentes, hooks, tabelas e padrões existentes antes de criar novos. O sistema já tem gauge, cards, tabelas, pipeline, relatórios, plano de ação IA. REUTILIZAR.

2. **ZERO DADOS PERDIDOS** — Não alterar tabelas existentes de forma destrutiva. Apenas adicionar colunas se necessário (com defaults). Não remover colunas, não renomear tabelas.

3. **DESIGN SYSTEM** — Usar os mesmos tokens visuais: slate-800 backgrounds, violet-600 para destaques, emerald-500 para sucesso/saudável, amber-500 para atenção, red-500 para crítico. Usar shadcn/ui + Radix UI para todos os componentes de UI.

4. **FILTROS GLOBAIS** — Respeitar os seletores de unidade (Campo Grande / Recreio / Barra / Consolidado) e competência (Mês/Ano) que já existem no header da página. Não duplicar esses filtros.

5. **BUILD LIMPO** — Cada fase deve terminar com `vite build` passando sem erros. Não deixar imports quebrados, tipos faltando, ou warnings.

6. **DADOS REAIS** — Tudo deve vir do Supabase real. Os 463 alunos ativos de Campo Grande já estão lá com dados completos. NÃO usar dados mock/fake.

7. **PRESENÇA** — O campo presença será nullable nas Fases 1-6. Mostrar "—" na interface quando indisponível. Usar valor default 5 no cálculo do health score. A **Fase 7** implementa presença real via WhatsApp/UAZAPI, que popula o campo automaticamente e substitui o default.

8. **TYPES E EXPORTS** — Adicionar todos os novos types no arquivo de types existente. Atualizar exports em hooks/index.ts.

9. **REFERÊNCIAS INTERNAS APENAS** — Não referenciar Music Class, sistemas externos, ou bibliotecas não instaladas. Usar apenas o que já existe no projeto.

---

## 📐 ORDEM DE EXECUÇÃO

```
FASE 1 → Banco (tabelas + RPCs + views + RLS + cálculo inicial)
   ↓
FASE 2 → Dashboard + Tabela (sub-aba funcional com dados reais)
   ↓
FASE 3 → Card Individual (modal espelhando professor)
   ↓
FASE 4 → Jornada Kanban (pipeline visual read-only)
   ↓
FASE 5 → Micro-Formulário (feedback professor via WhatsApp)
   ↓
FASE 6 → Integração Farmer (alertas no dashboard)
   ↓
FASE 7 → Presença via WhatsApp (tracking automático de frequência)
```

**Cada fase é independente e testável.** Após cada fase, verificar build e testar no browser antes de prosseguir para a próxima.