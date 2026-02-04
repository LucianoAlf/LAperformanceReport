# 🎯 PLANO COMPLETO: Sistema de Onboarding LA Performance Report

## Visão Geral

Sistema de tours guiados interativos para ajudar novos usuários a entenderem cada funcionalidade do sistema. Inclui:

1. **Checklist de Primeiro Acesso** - Tarefas obrigatórias (trocar senha, foto, etc.)
2. **Tours por Página** - Explicações contextuais em cada página
3. **Botão de Ajuda** - Reiniciar tour da página atual
4. **Tracking de Progresso** - Salvar quais tours o usuário já viu

---

## 📦 Tecnologia: React Joyride

```bash
npm install react-joyride
```

**Por que Joyride?**
- Biblioteca mais popular para tours em React
- Suporte a spotlight (destaca elementos)
- Callbacks para tracking
- Customização completa de estilos
- Suporte a steps condicionais

---

## 🗄️ Estrutura do Banco de Dados

### Tabela: `usuario_onboarding`

```sql
CREATE TABLE usuario_onboarding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
  
  -- Checklist inicial (obrigatório)
  senha_alterada BOOLEAN DEFAULT false,
  foto_uploaded BOOLEAN DEFAULT false,
  perfil_completo BOOLEAN DEFAULT false,
  
  -- Tours por página (automático)
  tour_dashboard BOOLEAN DEFAULT false,
  tour_alunos BOOLEAN DEFAULT false,
  tour_comercial BOOLEAN DEFAULT false,
  tour_professores BOOLEAN DEFAULT false,
  tour_salas BOOLEAN DEFAULT false,
  tour_metas BOOLEAN DEFAULT false,
  tour_projetos BOOLEAN DEFAULT false,
  tour_administrativo BOOLEAN DEFAULT false,
  tour_config BOOLEAN DEFAULT false,
  
  -- Metadados
  primeiro_acesso_em TIMESTAMP DEFAULT now(),
  ultimo_tour_em TIMESTAMP,
  tours_completados INT DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  
  UNIQUE(usuario_id)
);

-- Trigger para updated_at
CREATE TRIGGER update_usuario_onboarding_updated_at
  BEFORE UPDATE ON usuario_onboarding
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE usuario_onboarding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários podem ver/editar seu próprio onboarding"
  ON usuario_onboarding
  FOR ALL
  USING (usuario_id IN (
    SELECT id FROM usuarios WHERE auth_user_id = auth.uid()
  ));
```

---

## 🏗️ Arquitetura de Componentes

```
src/
├── components/
│   └── Onboarding/
│       ├── OnboardingProvider.tsx      # Context provider global
│       ├── OnboardingChecklist.tsx     # Modal de primeiro acesso
│       ├── PageTour.tsx                # Componente wrapper para tours
│       ├── TourHelpButton.tsx          # Botão "?" flutuante
│       └── tours/                      # Definições de steps por página
│           ├── dashboardTour.ts
│           ├── alunosTour.ts
│           ├── comercialTour.ts
│           ├── professoresTour.ts
│           ├── salasTour.ts
│           ├── metasTour.ts
│           ├── projetosTour.ts
│           ├── administrativoTour.ts
│           └── configTour.ts
├── hooks/
│   └── useOnboarding.ts                # Hook principal
└── contexts/
    └── OnboardingContext.tsx           # Context para estado global
```

---

## 📋 CHECKLIST DE PRIMEIRO ACESSO

Modal que aparece no primeiro login com tarefas obrigatórias:

### Tarefas do Checklist

| # | Tarefa | Descrição | Obrigatório |
|---|--------|-----------|-------------|
| 1 | 🔐 Alterar Senha | Trocar a senha inicial por uma pessoal | ✅ Sim |
| 2 | 📷 Foto de Perfil | Fazer upload da foto para identificação | ❌ Não |
| 3 | 👤 Completar Perfil | Preencher nome e apelido | ✅ Sim |
| 4 | 🎬 Tour do Dashboard | Assistir tour inicial do sistema | ✅ Sim |

### Comportamento

- Aparece automaticamente no primeiro login
- Pode ser minimizado mas reaparece até completar os obrigatórios
- Mostra progresso (ex: "2 de 4 tarefas concluídas")
- Botão "Pular por agora" para itens não obrigatórios
- Confetti/celebração ao completar tudo 🎉

---

## 🗺️ MAPEAMENTO DE TOURS POR PÁGINA

### 1. Dashboard (`/app` ou `/app/dashboard`)

**Público:** Todos os usuários

| Step | Elemento | Título | Descrição |
|------|----------|--------|-----------|
| 1 | `.sidebar` | Navegação | Este é o menu principal. Clique nos ícones para acessar cada área do sistema. |
| 2 | `.header-unidade` | Seletor de Unidade | Aqui você seleciona qual unidade deseja visualizar. Admins podem ver "Consolidado". |
| 3 | `.header-competencia` | Período | Selecione o mês/ano que deseja analisar. |
| 4 | `.card-alunos-ativos` | Alunos Ativos | Total de alunos matriculados e ativos na unidade. |
| 5 | `.card-mrr` | MRR (Receita Recorrente) | Faturamento mensal previsto baseado nas mensalidades. |
| 6 | `.card-inadimplencia` | Inadimplência | Percentual de alunos com pagamento em atraso. |
| 7 | `.card-churn` | Churn (Evasão) | Taxa de alunos que cancelaram no período. |
| 8 | `.card-renovacao` | Taxa de Renovação | Percentual de alunos que renovaram contrato. |
| 9 | `.grafico-evolucao` | Gráfico de Evolução | Visualize a evolução dos indicadores ao longo do tempo. |
| 10 | `.btn-ia-insights` | IA Insights | Clique para receber análises inteligentes dos seus dados. |
| 11 | `.avatar-usuario` | Seu Perfil | Clique aqui para editar seu perfil, trocar senha ou sair do sistema. |

---

### 2. Alunos (`/app/alunos`)

**Público:** Todos os usuários

| Step | Elemento | Título | Descrição |
|------|----------|--------|-----------|
| 1 | `.filtros-alunos` | Filtros | Filtre alunos por status, curso, professor ou busque por nome. |
| 2 | `.btn-novo-aluno` | Nova Matrícula | Clique aqui para cadastrar um novo aluno. |
| 3 | `.tabela-alunos` | Lista de Alunos | Veja todos os alunos da unidade. Clique em um aluno para ver detalhes. |
| 4 | `.col-status` | Status do Aluno | Verde = Ativo, Vermelho = Evadido, Amarelo = Pendente. |
| 5 | `.col-contrato` | Contrato | Data de início e fim do contrato do aluno. |
| 6 | `.btn-editar-aluno` | Editar | Clique no lápis para editar informações do aluno. |
| 7 | `.btn-registrar-evasao` | Registrar Evasão | Use este botão quando um aluno cancelar a matrícula. |
| 8 | `.btn-renovar` | Renovar Contrato | Renove o contrato de alunos com contrato vencendo. |
| 9 | `.export-excel` | Exportar | Exporte a lista de alunos para Excel. |

---

### 3. Comercial (`/app/comercial`)

**Público:** Hunters e Admins

| Step | Elemento | Título | Descrição |
|------|----------|--------|-----------|
| 1 | `.cards-resumo` | Resumo do Dia | Veja leads, experimentais e matrículas do período. |
| 2 | `.btn-registrar-lead` | Novo Lead | Registre um novo lead que entrou em contato. |
| 3 | `.btn-registrar-experimental` | Aula Experimental | Registre uma aula experimental agendada ou realizada. |
| 4 | `.btn-registrar-matricula` | Nova Matrícula | Registre uma nova matrícula (conversão de lead). |
| 5 | `.btn-registrar-visita` | Visita Escola | Registre visitas a escolas parceiras. |
| 6 | `.tabela-lancamentos` | Lançamentos | Histórico de todos os registros comerciais. |
| 7 | `.filtro-tipo` | Filtrar por Tipo | Filtre por leads, experimentais, matrículas ou visitas. |
| 8 | `.btn-relatorio` | Relatórios | Gere relatórios diários, semanais ou mensais. |
| 9 | `.btn-whatsapp` | Enviar WhatsApp | Envie o relatório diretamente para o WhatsApp. |
| 10 | `.aba-programa` | Programa Matriculador+ | Acompanhe sua pontuação no programa de bonificação. |

---

### 4. Professores (`/app/professores`)

**Público:** Coordenadores e Admins

| Step | Elemento | Título | Descrição |
|------|----------|--------|-----------|
| 1 | `.lista-professores` | Equipe | Lista de todos os professores da unidade. |
| 2 | `.card-professor` | Card do Professor | Clique para ver detalhes e métricas do professor. |
| 3 | `.metricas-professor` | Métricas | Veja alunos, evasões, renovações e avaliações. |
| 4 | `.btn-360` | Visão 360° | Análise completa do professor com IA. |
| 5 | `.btn-adicionar-professor` | Novo Professor | Cadastre um novo professor na equipe. |
| 6 | `.ranking` | Ranking | Veja o ranking de performance dos professores. |

---

### 5. Salas (`/app/salas`)

**Público:** Coordenadores e Admins

| Step | Elemento | Título | Descrição |
|------|----------|--------|-----------|
| 1 | `.lista-salas` | Salas da Unidade | Todas as salas cadastradas. |
| 2 | `.btn-nova-sala` | Nova Sala | Cadastre uma nova sala. |
| 3 | `.capacidade` | Capacidade | Número máximo de alunos por turma na sala. |
| 4 | `.ocupacao` | Ocupação | Percentual de ocupação atual da sala. |
| 5 | `.grade-horarios` | Grade de Horários | Visualize os horários disponíveis e ocupados. |
| 6 | `.btn-editar-sala` | Editar Sala | Altere informações da sala. |

---

### 6. Metas (`/app/metas`)

**Público:** Coordenadores e Admins

| Step | Elemento | Título | Descrição |
|------|----------|--------|-----------|
| 1 | `.metas-anuais` | Metas Anuais | Defina as metas de alunos, faturamento e churn para o ano. |
| 2 | `.progresso-meta` | Progresso | Acompanhe o progresso em relação às metas. |
| 3 | `.simulador` | Simulador | Simule cenários de crescimento e veja projeções. |
| 4 | `.btn-editar-metas` | Editar Metas | Ajuste as metas conforme necessário. |

---

### 7. Projetos (`/app/projetos`)

**Público:** Coordenadores e Admins

| Step | Elemento | Título | Descrição |
|------|----------|--------|-----------|
| 1 | `.lista-projetos` | Projetos Ativos | Veja todos os projetos em andamento. |
| 2 | `.btn-novo-projeto` | Novo Projeto | Crie um novo projeto ou evento. |
| 3 | `.status-projeto` | Status | Acompanhe o andamento de cada projeto. |
| 4 | `.participantes` | Participantes | Veja quem está envolvido no projeto. |
| 5 | `.alertas` | Alertas WhatsApp | Configure alertas automáticos para a equipe. |

---

### 8. Administrativo (`/app/administrativo`)

**Público:** Admins

| Step | Elemento | Título | Descrição |
|------|----------|--------|-----------|
| 1 | `.visao-geral` | Visão Consolidada | Dados de todas as unidades em um só lugar. |
| 2 | `.comparativo` | Comparativo | Compare performance entre unidades. |
| 3 | `.relatorios-gerenciais` | Relatórios | Gere relatórios gerenciais completos. |
| 4 | `.btn-gerenciar-usuarios` | Gerenciar Usuários | Crie e gerencie acessos da equipe. |

---

### 9. Configurações (`/app/config`)

**Público:** Admins

| Step | Elemento | Título | Descrição |
|------|----------|--------|-----------|
| 1 | `.config-unidades` | Unidades | Gerencie as unidades do sistema. |
| 2 | `.config-cursos` | Cursos | Configure os cursos oferecidos. |
| 3 | `.config-canais` | Canais de Origem | Configure de onde vêm os leads. |
| 4 | `.config-formas-pagamento` | Formas de Pagamento | Configure as formas de pagamento aceitas. |
| 5 | `.config-tipos-matricula` | Tipos de Matrícula | Configure tipos (regular, bolsista, etc.). |

---

## 🎨 Design do Tour

### Estilo Visual

```tsx
const joyrideStyles = {
  options: {
    arrowColor: '#1e293b',           // slate-800
    backgroundColor: '#1e293b',       // slate-800
    overlayColor: 'rgba(0, 0, 0, 0.7)',
    primaryColor: '#06b6d4',          // cyan-500
    spotlightShadow: '0 0 15px rgba(6, 182, 212, 0.5)',
    textColor: '#f1f5f9',             // slate-100
    width: 380,
    zIndex: 1000,
  },
  buttonNext: {
    backgroundColor: '#06b6d4',
    borderRadius: '12px',
    padding: '10px 20px',
  },
  buttonBack: {
    color: '#94a3b8',
    marginRight: 10,
  },
  buttonSkip: {
    color: '#64748b',
  },
  tooltip: {
    borderRadius: '16px',
    padding: '20px',
  },
  tooltipTitle: {
    fontSize: '18px',
    fontWeight: 600,
  },
  tooltipContent: {
    fontSize: '14px',
    lineHeight: 1.6,
  },
};
```

### Botão de Ajuda Flutuante

```tsx
// Botão "?" no canto inferior direito de cada página
<button className="fixed bottom-6 right-6 w-12 h-12 bg-cyan-500 hover:bg-cyan-600 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110">
  <HelpCircle className="w-6 h-6" />
</button>
```

---

## 🔄 Fluxo de Funcionamento

### Primeiro Acesso

```
1. Usuário faz login
2. Sistema verifica se existe registro em usuario_onboarding
3. Se não existe → Cria registro + Mostra Checklist
4. Se existe mas incompleto → Mostra Checklist
5. Se completo → Vai direto para Dashboard
```

### Navegação entre Páginas

```
1. Usuário acessa uma página
2. Sistema verifica se tour_[pagina] = false
3. Se false → Inicia tour automaticamente
4. Ao completar → Marca tour_[pagina] = true
5. Mostra botão "?" para reiniciar tour
```

### Reiniciar Tour

```
1. Usuário clica no botão "?"
2. Modal pergunta: "Deseja rever o tour desta página?"
3. Se sim → Inicia tour novamente
4. Não altera o status no banco (já está marcado como visto)
```

---

## 📊 Métricas de Onboarding

### Dashboard Admin (opcional futuro)

- Quantos usuários completaram o onboarding
- Tempo médio para completar
- Tours mais pulados
- Páginas com maior taxa de abandono

---

## 🚀 Plano de Implementação

### Fase 1: Infraestrutura (2-3 horas)
- [ ] Criar tabela `usuario_onboarding`
- [ ] Instalar react-joyride
- [ ] Criar OnboardingContext e Provider
- [ ] Criar hook useOnboarding
- [ ] Criar componente TourHelpButton

### Fase 2: Checklist Inicial (2-3 horas)
- [ ] Criar componente OnboardingChecklist
- [ ] Integrar com troca de senha
- [ ] Integrar com upload de foto
- [ ] Adicionar animações e feedback visual

### Fase 3: Tours das Páginas Principais (4-6 horas)
- [ ] Dashboard (tour mais completo)
- [ ] Alunos
- [ ] Comercial
- [ ] Professores

### Fase 4: Tours das Páginas Secundárias (3-4 horas)
- [ ] Salas
- [ ] Metas
- [ ] Projetos
- [ ] Administrativo
- [ ] Configurações

### Fase 5: Polimento (2-3 horas)
- [ ] Ajustar textos e posicionamento
- [ ] Testar em diferentes resoluções
- [ ] Adicionar classes CSS nos elementos alvo
- [ ] Testes com usuários reais

---

## ⏱️ Estimativa Total

| Fase | Tempo Estimado |
|------|----------------|
| Fase 1 | 2-3 horas |
| Fase 2 | 2-3 horas |
| Fase 3 | 4-6 horas |
| Fase 4 | 3-4 horas |
| Fase 5 | 2-3 horas |
| **Total** | **13-19 horas** |

---

## ✅ Próximos Passos

1. **Aprovar este plano** - Validar se faz sentido
2. **Priorizar páginas** - Quais tours são mais urgentes?
3. **Iniciar implementação** - Começar pela infraestrutura
4. **Testar com 1-2 usuários** - Validar antes de liberar para todos

---

## 💡 Ideias Extras (Futuro)

- **Vídeos curtos** - Embed de vídeos explicativos em alguns steps
- **Gamificação** - Badges por completar tours
- **Dicas do dia** - Pop-up com dica aleatória ao logar
- **Central de Ajuda** - Página com todos os tours disponíveis
- **Feedback** - Perguntar se o tour foi útil ao final
