import { Step } from 'react-joyride';

export const analyticsTourSteps: Step[] = [
  {
    target: '[data-tour="sidebar"]',
    title: '📊 Analytics',
    content: 'Bem-vindo ao Analytics! Aqui você encontra análises detalhadas e históricas de todos os indicadores da unidade, com comparativos e gráficos de evolução.',
    placement: 'right',
    disableBeacon: true,
  },
  {
    target: '[data-tour="analytics-abas"]',
    title: '📑 Áreas de Análise',
    content: 'O Analytics tem 3 áreas principais:\n\n• Gestão: Alunos, financeiro e retenção\n• Comercial: Funil de vendas e conversão\n• Professores: Performance da equipe\n\n💡 Cada área tem sub-abas com análises específicas.',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '[data-tour="analytics-filtro-periodo"]',
    title: '📅 Filtro de Período',
    content: 'Escolha o período de análise:\n\n• Mês: Dados de um mês específico\n• Trimestre: Análise trimestral\n• Semestre: Visão semestral\n• Ano: Consolidado anual\n\n💡 Use para comparar períodos e identificar tendências.',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '[data-tour="analytics-sub-abas"]',
    title: '📈 Sub-abas de Gestão',
    content: 'Na aba Gestão você encontra:\n\n• Alunos: Base, matrículas, evasões, LA Kids vs LA School\n• Financeiro: Ticket, MRR, inadimplência, reajustes\n• Retenção: Churn, renovações, motivos de saída\n\n💡 Cada sub-aba tem KPIs e gráficos específicos.',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '[data-tour="analytics-kpis"]',
    title: '📊 KPIs Detalhados',
    content: 'Os cards mostram indicadores com:\n\n• Valor atual do período\n• Comparativo com mês anterior\n• Comparativo com mesmo mês do ano anterior\n• Progresso em relação à meta\n\n💡 Passe o mouse para ver detalhes.',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '[data-tour="analytics-grafico"]',
    title: '📈 Gráfico de Evolução',
    content: 'Visualize a evolução histórica dos indicadores:\n\n• Últimos 12 meses de dados\n• Linhas de alunos, matrículas e evasões\n• Passe o mouse para ver valores exatos\n\n💡 Identifique padrões sazonais e tendências.',
    placement: 'top',
    disableBeacon: true,
  },
];
