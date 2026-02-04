import { Step } from 'react-joyride';

export const metasTourSteps: Step[] = [
  {
    target: '[data-tour="sidebar"]',
    title: '🎯 Gestão de Metas',
    content: 'Bem-vindo à Gestão de Metas! Aqui você define as metas mensais para todos os KPIs da unidade. As metas são usadas em todo o sistema para comparar resultados.',
    placement: 'right',
    disableBeacon: true,
  },
  {
    target: '[data-tour="metas-abas"]',
    title: '📑 Categorias de Metas',
    content: 'As metas são organizadas em categorias:\n\n• Gestão: Alunos, ticket, churn, renovação\n• Comercial: Leads, experimentais, matrículas\n• Professores: Média/turma, retenção\n\n💡 Cada aba tem KPIs específicos.',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '[data-tour="metas-tabela"]',
    title: '📊 Tabela de Metas',
    content: 'Defina metas mensais para cada KPI:\n\n• Linhas: Cada KPI (alunos, ticket, churn, etc.)\n• Colunas: Meses do ano (Jan-Dez)\n• Células: Clique para editar o valor\n\n💡 As alterações são salvas automaticamente após 1.5 segundos.',
    placement: 'top',
    disableBeacon: true,
  },
  {
    target: '[data-tour="metas-simulador"]',
    title: '🧮 Simulador de Metas',
    content: 'Use o simulador para planejar:\n\n• Projete crescimento de alunos\n• Calcule faturamento esperado\n• Simule cenários diferentes\n\n💡 Ajuda a definir metas realistas!',
    placement: 'bottom',
    disableBeacon: true,
  },
];
