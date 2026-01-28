# 📁 BRIEFING COMPLETO: GESTÃO DE PROJETOS PEDAGÓGICOS

## Sistema LA Music Performance - Nova Página "Projetos"

---

## 1. VISÃO GERAL

### O que é?
Uma nova página dentro do sistema LA Music Performance chamada **"Projetos"**, localizada no menu lateral entre "Professores" e "Salas". Esta página será um ambiente completo de gestão de projetos pedagógicos para os coordenadores e assistentes da escola.

### Para quem?
- **Coordenadores**: Quintela (LAMK - alunos até 11 anos) e Juliana (EMLA - alunos 12+ anos)
- **Assistentes Pedagógicos**: Equipe de apoio aos coordenadores (quantidade variável, cadastráveis no sistema)
- **Professores**: 42 professores ativos que participam dos projetos

### Por que criar?
Atualmente os coordenadores usam o **Notion** para gerenciar projetos, mas:
- Fica espalhado e desorganizado
- Não tem alertas automáticos
- Não tem integração com WhatsApp
- Os coordenadores são TDAH e **esquecem prazos** - precisam MUITO de lembretes

### Qual o objetivo?
Criar um sistema de gestão de projetos **integrado ao LA Music Performance** com:
- Visão clara de todos os projetos e prazos
- Alertas automáticos via WhatsApp
- IA "Fábio" como assistente inteligente
- Todas as visualizações que um bom gerenciador de projetos tem (Kanban, Timeline, etc.)

---

## 2. DIFERENÇA ENTRE AGENDA E PROJETOS

O sistema já possui uma página de **Agenda** com ações pontuais. A nova página de **Projetos** é diferente:

| AGENDA (já existe) | PROJETOS (nova) |
|-------------------|-----------------|
| Evento único | Múltiplas etapas |
| Data específica | Prazo final + marcos |
| 1-2 responsáveis | Equipe envolvida |
| Ex: Reunião de feedback 28/01 | Ex: Semana do Baterista 2026 |
| Ex: Treinamento com professor | Ex: Recital Kids Junho |
| Visualizações: Lista, Calendário, Kanban | Visualizações: Dashboard, Lista, Kanban, Timeline, Calendário, Por Pessoa |

**Importante**: As ações da Agenda podem virar tarefas de um Projeto (integração futura).

---

## 3. ESTRUTURA HIERÁRQUICA

### 3.1 Hierarquia de Usuários

```
COORDENADORES (Quintela LAMK, Juliana EMLA)
│   ├── Acesso total ao sistema
│   ├── Criam projetos
│   ├── Configuram permissões
│   ├── Gerenciam equipe
│   └── Recebem todos os alertas
│
├── ASSISTENTES PEDAGÓGICOS (cadastráveis, quantidade variável)
│   ├── Veem projetos onde estão envolvidos
│   ├── Podem criar projetos (delegado pelos coordenadores)
│   ├── Executam e gerenciam tarefas
│   └── Recebem alertas das suas tarefas
│
└── PROFESSORES (42 ativos)
    ├── Participam de projetos (futuros líderes)
    ├── Executam tarefas atribuídas
    ├── Visualização configurável
    └── Recebem lembretes via WhatsApp
```

### 3.2 Hierarquia de Dados

```
TIPO DE PROJETO (cadastrável, ex: "Semana Temática")
│
└── PROJETO (ex: "Semana do Baterista 2026")
    ├── Nome
    ├── Descrição
    ├── Tipo
    ├── Responsável principal
    ├── Equipe envolvida
    ├── Data início / Data fim
    ├── Orçamento (opcional)
    ├── Status
    ├── Prioridade
    ├── Anexos (arquivos, links, fotos)
    │
    └── FASES/ETAPAS (template por tipo, personalizável)
        │
        └── TAREFAS
            ├── Título
            ├── Descrição
            ├── Responsável
            ├── Prazo
            ├── Dependência (tarefa anterior)
            ├── Status
            ├── Prioridade
            ├── Anexos
            ├── Comentários
            │
            └── SUBTAREFAS
                ├── Título
                ├── Responsável
                ├── Prazo
                └── Status
```

---

## 4. TIPOS DE PROJETO

Os tipos de projeto são **cadastráveis** no sistema (CRUD completo). Cada tipo tem:
- Nome
- Ícone
- Cor
- Template de fases padrão

### Tipos Iniciais (pré-cadastrados):

| Tipo | Ícone | Cor | Fases Padrão |
|------|-------|-----|--------------|
| **Semana Temática** | 🎉 | Violeta | Planejamento → Divulgação → Preparação → Ensaios → Execução → Pós-evento |
| **Recital** | 🎵 | Ciano | Planejamento → Seleção de Alunos → Preparação → Ensaios → Ensaio Geral → Evento → Pós-evento |
| **Show de Banda** | 🎸 | Rosa | Planejamento → Formação → Ensaios → Passagem de Som → Show → Pós-evento |
| **Material Didático** | 📚 | Verde | Briefing → Produção → Revisão → Aprovação → Publicação |
| **Produção de Conteúdo** | 📱 | Âmbar | Pauta → Produção → Edição → Aprovação → Publicação |
| **Vídeo Aulas** | 🎬 | Azul | Roteiro → Gravação → Edição → Revisão → Publicação |

**Importante**: Os coordenadores devem poder criar novos tipos a qualquer momento.

---

## 5. TEMPLATES DE FASES

Cada tipo de projeto tem um **template de fases** que é carregado automaticamente ao criar um novo projeto. O template pode ser personalizado depois.

### Exemplo: Semana Temática

| Fase | Duração Sugerida | Tarefas Padrão |
|------|------------------|----------------|
| 1. Planejamento | 2 semanas | Definir tema, reservar local, definir orçamento, montar equipe, criar cronograma |
| 2. Divulgação | 1 semana | Criar arte, postar redes sociais, enviar para alunos, imprimir material |
| 3. Preparação | 2 semanas | Preparar repertório, ensaiar com alunos, preparar decoração, confirmar equipamentos |
| 4. Ensaios | 1 semana | Ensaio individual, ensaio em grupo, ensaio geral |
| 5. Execução (Evento) | 1 dia | Montagem, execução, desmontagem |
| 6. Pós-evento | 1 semana | Fotos/vídeos, agradecimentos, relatório, pesquisa de satisfação |

### Configuração de Templates

Os coordenadores devem poder:
- Adicionar/remover fases do template
- Reordenar fases (drag and drop)
- Definir duração sugerida de cada fase
- Definir tarefas padrão de cada fase
- Salvar template personalizado

---

## 6. VISUALIZAÇÕES DA PÁGINA

A página de Projetos deve ter **7 abas/visualizações**:

### 6.1 Dashboard (aba padrão)
- **KPIs principais**:
  - Projetos Ativos
  - Projetos Atrasados
  - Tarefas Pendentes
  - Taxa de Conclusão
  - Pessoas Envolvidas
- **Lista de projetos em andamento** com progresso
- **Próximos prazos** (tarefas vencendo)
- **Carga da equipe** (quem está sobrecarregado)
- **Widget do Fábio IA** com sugestões

### 6.2 Lista
- Tabela com todos os projetos
- Filtros: Status, Tipo, Responsável, Unidade
- Ordenação por: Nome, Prazo, Progresso, Criação
- Busca por nome

### 6.3 Kanban
- Colunas: Planejamento → Em Andamento → Revisão → Concluído
- Cards de projeto com: tipo, nome, progresso, responsável, prazo
- Drag and drop entre colunas
- Filtros disponíveis

### 6.4 Timeline (Gantt)
- Visão de barras horizontais por projeto
- Navegação por período (dia/semana/mês)
- Visualização de fases dentro do projeto
- Indicador de "hoje"
- Weekends destacados

### 6.5 Calendário
- Visão mensal
- Prazos de projetos e tarefas
- Cores por tipo de projeto
- Navegação entre meses

### 6.6 Por Pessoa
- Cards por pessoa (coordenador, assistente, professor)
- Lista de tarefas atribuídas a cada um
- Quantidade de tarefas e carga
- Checkbox para marcar como concluída

### 6.7 Configurações
Menu lateral com 6 seções:

#### 6.7.1 Tipos de Projeto
- Tabela com todos os tipos cadastrados
- CRUD de tipos (criar, editar, excluir)
- Definir ícone e cor

#### 6.7.2 Templates de Fases
- Seletor de tipo de projeto
- Lista de fases do template (drag and drop para reordenar)
- Adicionar/remover fases
- Configurar tarefas padrão de cada fase

#### 6.7.3 Notificações
- Tipos de alerta com toggle on/off:
  - Tarefa atrasada
  - Tarefa vencendo hoje
  - Tarefa vencendo em X dias (configurável: 1d, 3d, 7d, 15d, 30d)
  - Projeto parado há X dias (configurável: 3d, 7d, 14d, 30d)
  - Resumo semanal (dia e hora configurável)
- Quem recebe cada alerta:
  - Coordenadores: todos os alertas
  - Assistentes: tarefas atribuídas
  - Professores: tarefas atribuídas

#### 6.7.4 Equipe e Permissões
- Lista de Coordenadores (fixo: Quintela, Juliana)
- Lista de Assistentes Pedagógicos (CRUD)
- Permissões de Professores (toggles):
  - Visualizar projetos onde estão envolvidos
  - Comentar em tarefas
  - Marcar tarefas como concluídas
  - Adicionar anexos
  - Receber notificações WhatsApp

#### 6.7.5 Fábio IA
- Status do Fábio (online/offline)
- Funcionalidades ativas (toggles):
  - Resumo semanal automático
  - Alertas de risco
  - Sugestão de prazos
  - Redistribuição de tarefas
  - Criar/editar tarefas
  - Responder perguntas sobre status
- Canais de comunicação:
  - Chat no sistema
  - WhatsApp

#### 6.7.6 WhatsApp
- Status da conexão (UAZAPI)
- Lista de números cadastrados para notificação
- Configurar quais alertas cada número recebe
- Horários de envio (início/fim, finais de semana)
- Botão de teste de envio

---

## 7. FUNCIONALIDADES DETALHADAS

### 7.1 CRUD de Projetos
- **Criar projeto**:
  - Selecionar tipo (carrega template de fases)
  - Nome e descrição
  - Responsável principal
  - Equipe envolvida
  - Unidade(s)
  - Datas de início e fim
  - Orçamento (opcional)
  - Prioridade (Normal, Alta, Urgente)
- **Editar projeto**: Todos os campos
- **Excluir projeto**: Com confirmação
- **Duplicar projeto**: Para criar similar

### 7.2 CRUD de Tarefas
- **Criar tarefa**:
  - Título e descrição
  - Fase do projeto
  - Responsável
  - Prazo
  - Prioridade
  - Dependência (tarefa que precisa ser concluída antes)
- **Subtarefas**: Criar tarefas dentro de tarefas
- **Marcar como concluída**: Checkbox
- **Reordenar tarefas**: Drag and drop

### 7.3 Dependências
- Uma tarefa pode depender de outra
- Tarefa B só pode iniciar quando Tarefa A for concluída
- Visual na timeline mostrando dependências

### 7.4 Anexos
- Upload de arquivos (PDF, imagens, docs)
- Links externos
- Fotos
- Vinculados a projetos ou tarefas específicas

### 7.5 Comentários
- Comentários em projetos
- Comentários em tarefas
- Menção de pessoas (@nome)
- Histórico de comentários

### 7.6 Log de Alterações
- Registrar todas as alterações:
  - Quem alterou
  - O que alterou
  - Quando alterou
  - Valor anterior e novo valor
- Visualização do histórico por projeto

---

## 8. SISTEMA DE ALERTAS

### 8.1 Tipos de Alerta

| Alerta | Descrição | Quando dispara |
|--------|-----------|----------------|
| ⚠️ Tarefa Atrasada | Passou do prazo | Imediatamente após vencer |
| 📅 Vencendo Hoje | Vence no dia atual | Manhã do dia |
| 🔔 Vencendo em Breve | Vence em X dias | Configurável (1d, 3d, 7d, 15d, 30d) |
| ⏸️ Projeto Parado | Sem atividade | Configurável (3d, 7d, 14d, 30d) |
| 📊 Resumo Semanal | Relatório da semana | Toda segunda-feira (horário configurável) |

### 8.2 Canais de Notificação
- **WhatsApp** (principal): Via UAZAPI
- **Sistema**: Notificação no sino do header
- **E-mail**: Futuro (não implementar agora)

### 8.3 Configuração de Antecedência
Cada projeto pode ter configuração específica de antecedência para alertas, além da configuração global.

### 8.4 Horários de Envio
- Definir janela de horário para envio (ex: 8h às 20h)
- Opção de enviar ou não em finais de semana

---

## 9. FÁBIO - ASSISTENTE PEDAGÓGICO IA

### 9.1 O que é?
O Fábio é um assistente de IA que ajuda os coordenadores na gestão dos projetos. Ele é **proativo** (envia alertas) e **reativo** (responde perguntas).

### 9.2 Onde aparece?
- **Widget no Dashboard**: Mensagem contextual com sugestões
- **Chat flutuante**: Botão no canto inferior direito (como o HTML de referência)
- **WhatsApp**: Interação por mensagens

### 9.3 Funcionalidades v1 (Gestão de Projetos)

| Função | Descrição | Exemplo |
|--------|-----------|---------|
| **Resumo Semanal** | Envia resumo toda segunda | "Bom dia! Esta semana você tem 3 projetos com prazo..." |
| **Alertar Riscos** | Avisa sobre atrasos | "O projeto Recital Kids está 5 dias atrasado" |
| **Sugerir Prazos** | Baseado em projetos anteriores | "Projetos similares levaram em média 6 semanas" |
| **Redistribuir Tarefas** | Sugere quando alguém está sobrecarregado | "Rafael está com carga baixa, sugiro mover tarefa X para ele" |
| **Responder Status** | Responde perguntas | "Quais projetos vencem esse mês?" → lista projetos |
| **Criar/Editar Tarefas** | Quando solicitado | "Crie uma tarefa de ensaio para sexta às 14h" → cria |

### 9.4 Futuro (v2+)
O Fábio vai expandir para outras funções pedagógicas:
- Lembrete de preenchimento de relatórios
- Cobrança de presença
- Lembrete de conteúdo ministrado
- Outras funções com professores e alunos

**Por agora, focar apenas na v1 (Gestão de Projetos).**

---

## 10. INTEGRAÇÃO COM WHATSAPP

### 10.1 Tecnologia
- Usar **UAZAPI** (já existe instância configurada)
- Integração simples: cadastrar números + disparar mensagens

### 10.2 O que precisa
- Tabela de números cadastrados
- Associar número a uma pessoa (coordenador, assistente, professor)
- Configurar quais alertas cada número recebe
- Função de disparo de mensagem

### 10.3 Fluxo
1. Sistema detecta condição de alerta (tarefa atrasada, etc.)
2. Busca quem deve receber (configuração)
3. Busca número de WhatsApp da pessoa
4. Envia mensagem via UAZAPI

---

## 11. ESTRUTURA DO BANCO DE DADOS

### 11.1 Tabelas Necessárias

#### `projeto_tipos`
Armazena os tipos de projeto cadastráveis.
- id (UUID, PK)
- nome (texto)
- icone (texto/emoji)
- cor (texto/hex)
- ativo (boolean)
- created_at
- updated_at

#### `projeto_tipo_fases_template`
Template de fases padrão para cada tipo de projeto.
- id (UUID, PK)
- tipo_id (FK → projeto_tipos)
- nome (texto)
- ordem (integer)
- duracao_sugerida_dias (integer)
- created_at

#### `projeto_tipo_tarefas_template`
Tarefas padrão de cada fase do template.
- id (UUID, PK)
- fase_template_id (FK → projeto_tipo_fases_template)
- titulo (texto)
- ordem (integer)

#### `projetos`
Tabela principal de projetos.
- id (UUID, PK)
- tipo_id (FK → projeto_tipos)
- nome (texto)
- descricao (texto)
- responsavel_id (FK → usuarios ou professores)
- unidade_id (FK → unidades) - pode ser NULL para todas
- data_inicio (date)
- data_fim (date)
- status (enum: planejamento, em_andamento, revisao, concluido, pausado, cancelado)
- prioridade (enum: normal, alta, urgente)
- orcamento (decimal, nullable)
- created_by (FK)
- created_at
- updated_at

#### `projeto_fases`
Fases de cada projeto (instanciadas a partir do template).
- id (UUID, PK)
- projeto_id (FK → projetos)
- nome (texto)
- ordem (integer)
- data_inicio (date, nullable)
- data_fim (date, nullable)
- status (enum)
- created_at
- updated_at

#### `projeto_tarefas`
Tarefas do projeto.
- id (UUID, PK)
- projeto_id (FK → projetos)
- fase_id (FK → projeto_fases, nullable)
- tarefa_pai_id (FK → projeto_tarefas, nullable) - para subtarefas
- titulo (texto)
- descricao (texto, nullable)
- responsavel_id (FK)
- prazo (date)
- status (enum: pendente, em_andamento, concluida, cancelada)
- prioridade (enum)
- dependencia_id (FK → projeto_tarefas, nullable) - tarefa que precisa concluir antes
- ordem (integer)
- created_by (FK)
- created_at
- updated_at
- completed_at (timestamp, nullable)

#### `projeto_equipe`
Pessoas envolvidas em cada projeto.
- id (UUID, PK)
- projeto_id (FK → projetos)
- pessoa_id (FK → pode ser usuario ou professor)
- pessoa_tipo (enum: coordenador, assistente, professor)
- papel (texto, nullable) - função no projeto
- created_at

#### `projeto_anexos`
Arquivos anexados.
- id (UUID, PK)
- projeto_id (FK → projetos)
- tarefa_id (FK → projeto_tarefas, nullable) - se for anexo de tarefa
- nome (texto)
- url (texto)
- tipo (texto) - mime type
- tamanho (integer) - bytes
- uploaded_by (FK)
- created_at

#### `projeto_comentarios`
Comentários em projetos e tarefas.
- id (UUID, PK)
- projeto_id (FK → projetos)
- tarefa_id (FK → projeto_tarefas, nullable)
- usuario_id (FK)
- texto (texto)
- created_at
- updated_at

#### `projeto_log`
Log de todas as alterações.
- id (UUID, PK)
- projeto_id (FK → projetos)
- tarefa_id (FK → projeto_tarefas, nullable)
- usuario_id (FK)
- acao (texto) - criar, editar, excluir, concluir, etc.
- campo (texto, nullable) - qual campo foi alterado
- valor_anterior (texto, nullable)
- valor_novo (texto, nullable)
- created_at

#### `assistentes_pedagogicos`
Cadastro dos assistentes.
- id (UUID, PK)
- nome (texto)
- email (texto)
- telefone (texto) - para WhatsApp
- ativo (boolean)
- created_at
- updated_at

#### `notificacao_config`
Configurações globais de notificação.
- id (UUID, PK)
- tipo_alerta (enum)
- ativo (boolean)
- antecedencia_dias (integer, nullable)
- hora_envio (time, nullable)
- enviar_fim_semana (boolean)
- updated_at

#### `notificacao_destinatarios`
Quem recebe cada tipo de notificação.
- id (UUID, PK)
- pessoa_id (FK)
- pessoa_tipo (enum)
- telefone_whatsapp (texto)
- alertas_atrasadas (boolean)
- alertas_vencendo (boolean)
- alertas_resumo (boolean)
- ativo (boolean)
- created_at
- updated_at

#### `notificacao_log`
Histórico de notificações enviadas.
- id (UUID, PK)
- tipo_alerta (enum)
- destinatario_id (FK)
- projeto_id (FK, nullable)
- tarefa_id (FK, nullable)
- mensagem (texto)
- canal (enum: whatsapp, sistema, email)
- status (enum: enviado, falha)
- enviado_at (timestamp)

---

## 12. HTML DE REFERÊNCIA

Foi criado um **HTML completo de referência** com todas as visualizações e componentes:

**Arquivo**: `gestao-projetos-pedagogicos.html`

**Conteúdo**:
- Layout completo com sidebar e header
- Todas as 7 abas funcionais
- Dashboard com KPIs e cards
- Lista com tabela e filtros
- Kanban com 4 colunas
- Timeline com barras
- Calendário mensal
- Por Pessoa com cards
- Configurações com todas as 6 seções
- Chat do Fábio flutuante
- Modais de criação
- CSS completo (dark theme)
- JavaScript básico para navegação

**Usar como referência visual para implementação.**

---

## 13. ORDEM DE IMPLEMENTAÇÃO SUGERIDA

### Fase 1: Estrutura Base
1. Criar todas as tabelas no banco de dados
2. Criar a página de Projetos no menu
3. Implementar aba Dashboard (KPIs básicos)
4. Implementar aba Lista com CRUD de projetos

### Fase 2: Visualizações
5. Implementar aba Kanban (drag and drop)
6. Implementar CRUD de tarefas e subtarefas
7. Implementar aba Por Pessoa
8. Implementar aba Calendário

### Fase 3: Funcionalidades Avançadas
9. Implementar Timeline/Gantt
10. Implementar dependências entre tarefas
11. Implementar anexos e comentários
12. Implementar log de alterações

### Fase 4: Configurações
13. Implementar aba Configurações - Tipos de Projeto
14. Implementar aba Configurações - Templates de Fases
15. Implementar aba Configurações - Equipe e Permissões

### Fase 5: Notificações e WhatsApp
16. Implementar aba Configurações - Notificações
17. Implementar aba Configurações - WhatsApp
18. Criar sistema de alertas automáticos
19. Integrar com UAZAPI para envio

### Fase 6: Fábio IA
20. Implementar widget do Fábio no Dashboard
21. Implementar chat flutuante
22. Criar lógica de resumo semanal
23. Criar lógica de alertas de risco
24. Implementar chat via WhatsApp (opcional)

---

## 14. OBSERVAÇÕES IMPORTANTES

### 14.1 Padrão Visual
- Seguir o **dark theme** existente no sistema LA Music Performance
- Usar as mesmas cores, fontes e componentes
- O HTML de referência já está no padrão visual correto

### 14.2 Supabase
- Banco de dados é **Supabase** (PostgreSQL)
- Projeto: `ouqwbbermlzqqvtqwlul`
- Região: `sa-east-1`
- Usar Row Level Security quando apropriado

### 14.3 Unidades
As unidades já existem no sistema:
- Campo Grande: `2ec861f6-023f-4d7b-4927-3960ad8c2a92`
- Recreio: `95553e96-971b-4590-a6eb-0201d013c14d`
- Barra: `368d47f5-2d88-4475-bc14-ba084a9a348e`

### 14.4 Professores
- Já existe tabela `professores` com 44 registros
- Usar essa tabela para vincular professores aos projetos
- Adicionar coluna de **telefone WhatsApp** se não existir

### 14.5 TDAH dos Coordenadores
Este é um ponto **crítico**: os coordenadores são TDAH e esquecem prazos. Por isso:
- Os alertas são **fundamentais**
- Os lembretes devem ser **configuráveis** em diferentes antecedências
- O Fábio deve ser **proativo** em avisar sobre riscos

---

## 15. RESUMO EXECUTIVO

| Item | Descrição |
|------|-----------|
| **O que** | Nova página "Projetos" no sistema LA Music Performance |
| **Para quem** | Coordenadores, assistentes e professores |
| **Problema** | Notion espalhado, sem alertas, TDAH esquece prazos |
| **Solução** | Sistema integrado com alertas WhatsApp e IA Fábio |
| **Visualizações** | Dashboard, Lista, Kanban, Timeline, Calendário, Por Pessoa, Configurações |
| **Diferencial** | Alertas automáticos, WhatsApp, IA proativa |
| **Referência visual** | `gestao-projetos-pedagogicos.html` |
| **Banco** | Supabase (PostgreSQL) - criar ~12 novas tabelas |

---

**Documento criado em**: 28/01/2026
**Última atualização**: 28/01/2026
**Versão**: 1.0