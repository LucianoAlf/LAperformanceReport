import { Step } from 'react-joyride';

export const professoresTourSteps: Step[] = [
  // ═══════════════════════════════════════════════════════════════
  // SEÇÃO 1: INTRODUÇÃO
  // ═══════════════════════════════════════════════════════════════
  {
    target: '[data-tour="sidebar"]',
    title: '👨‍🏫 Gestão de Professores',
    content: 'Bem-vindo à Gestão de Professores! Aqui você acompanha a performance da equipe pedagógica, gerencia carteiras de alunos e monitora indicadores de qualidade.\n\n💡 Esta página é essencial para a coordenação!',
    placement: 'right',
    disableBeacon: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // SEÇÃO 2: ABAS E NAVEGAÇÃO
  // ═══════════════════════════════════════════════════════════════
  {
    target: '[data-tour="professores-abas"]',
    title: '📑 Abas do Sistema',
    content: 'O sistema de Professores tem 6 abas:\n\n• Cadastro: Lista completa e cadastro de professores\n• Performance: Ranking por Health Score e métricas\n• Carteira: Alunos por professor\n• Agenda: Horários e disponibilidade\n• 360°: Visão completa do professor selecionado\n• Configurações: Pesos do Health Score e metas\n\n💡 Navegue pelas abas para explorar todas as funcionalidades!',
    placement: 'bottom',
    disableBeacon: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // SEÇÃO 3: ALERTAS DE PERFORMANCE
  // ═══════════════════════════════════════════════════════════════
  {
    target: '[data-tour="professores-alertas"]',
    title: '⚠️ Alertas de Performance',
    content: 'Monitore a saúde da equipe:\n\n• 🔴 Críticos: Retenção ou média abaixo do aceitável\n• 🟡 Atenção: Métricas abaixo da meta\n• 🟢 Excelentes: Todas as metas atingidas\n\n💡 Clique nos alertas para filtrar os professores!',
    placement: 'bottom',
    disableBeacon: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // SEÇÃO 4: KPIs GERAIS
  // ═══════════════════════════════════════════════════════════════
  {
    target: '[data-tour="professores-kpis"]',
    title: '📊 KPIs Gerais',
    content: 'Visão consolidada da equipe:\n\n• Total de Professores: Ativos na unidade\n• Total de Alunos: Soma das carteiras\n• Média Alunos/Professor: Distribuição\n• Média Alunos/Turma: Pilar financeiro!\n• Ticket Médio: Valor médio por aluno\n\n💡 Média/Turma é o indicador mais importante!',
    placement: 'bottom',
    disableBeacon: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // SEÇÃO 5: TABELA/RANKING
  // ═══════════════════════════════════════════════════════════════
  {
    target: '[data-tour="professores-tabela"]',
    title: '📋 Ranking de Professores',
    content: 'Ranking completo da equipe por Health Score:\n\n• Health Score: Nota geral (0-100)\n• Fator: Multiplicador de demanda\n• Alunos: Total na carteira\n• Média/Turma: Pilar financeiro!\n• Retenção: % de alunos que ficam\n• Conversão: % de experimentais convertidas\n• Presença: % de aulas dadas\n\n💡 Clique em um professor para ver detalhes!',
    placement: 'top',
    disableBeacon: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // SEÇÃO 6: NOVO PROFESSOR
  // ═══════════════════════════════════════════════════════════════
  {
    target: '[data-tour="btn-novo-professor"]',
    title: '➕ Novo Professor',
    content: 'Cadastre um novo professor:\n\n• Dados pessoais (nome, email, telefone)\n• Unidades onde vai atuar\n• Cursos que vai ministrar\n• Comissão percentual\n• Data de admissão\n\n💡 Após cadastrar, o professor aparece na lista!',
    placement: 'left',
    disableBeacon: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // SEÇÃO 7: METAS E REFERÊNCIAS
  // ═══════════════════════════════════════════════════════════════
  {
    target: '[data-tour="professores-metas"]',
    title: '🎯 Referência de Metas',
    content: 'Entenda os critérios de avaliação:\n\nMédia/Turma:\n• 🔴 <1.3 = Crítico\n• 🟡 1.3-1.5 = Atenção\n• 🟢 >1.5 = Excelente\n\nRetenção:\n• 🔴 <70% = Crítico\n• 🟡 70-95% = Regular\n• 🟢 >95% = Excelente\n\n💡 Acesse a aba Configurações para ajustar os pesos!',
    placement: 'top',
    disableBeacon: true,
  },
];
