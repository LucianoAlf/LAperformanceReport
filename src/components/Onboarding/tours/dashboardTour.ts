import { Step } from 'react-joyride';

export const dashboardTourSteps: Step[] = [
  {
    target: '[data-tour="sidebar"]',
    title: '📍 Menu de Navegação',
    content: 'Bem-vindo ao LA Music Report! Este é o menu principal do sistema.\n\nÁreas disponíveis:\n• Dashboard: Visão geral (você está aqui)\n• Analytics: Análises detalhadas\n• Metas: Defina e acompanhe metas\n• Comercial: Funil de vendas\n• Administrativo: Renovações e cancelamentos\n• Alunos: Base de alunos\n• Professores: Equipe pedagógica\n• Projetos: Eventos e apresentações\n• Salas: Espaços físicos',
    placement: 'right',
    disableBeacon: true,
  },
  {
    target: '[data-tour="secao-gestao"]',
    title: '📊 Indicadores de Gestão',
    content: 'Esta seção mostra os 4 KPIs principais da sua unidade:\n\n• Alunos Ativos: Base atual de alunos pagantes\n• Matrículas (Mês): Novas matrículas no período\n• Evasões (Mês): Cancelamentos no período\n• Ticket Médio: Valor médio das mensalidades\n\n💡 Os cards mostram a meta quando definida e indicam se você está acima ou abaixo dela.',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '[data-tour="card-alunos"]',
    title: '👥 Alunos Ativos',
    content: 'Este é o indicador mais importante da unidade!\n\n• Mostra o total de alunos matriculados e ativos\n• A barra de progresso indica % da meta\n• Verde = acima da meta | Vermelho = abaixo\n\n💡 Clique no card para ir direto à página de Alunos.',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '[data-tour="card-matriculas"]',
    title: '📈 Matrículas do Mês',
    content: 'Novas matrículas realizadas no período selecionado.\n\n• Conta apenas matrículas novas (não renovações)\n• Compare com a meta mensal definida\n• Fundamental para o crescimento da base\n\n💡 Matrículas são lançadas na página Comercial.',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '[data-tour="card-evasoes"]',
    title: '📉 Evasões do Mês',
    content: '⚠️ Indicador crítico! Mostra cancelamentos no período.\n\n• Meta: Manter abaixo de 4% da base\n• Inclui não-renovações e cancelamentos\n• Vermelho = acima da meta (ruim)\n\n💡 Analise os motivos na página Administrativo para reduzir evasões.',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '[data-tour="card-ticket"]',
    title: '💰 Ticket Médio',
    content: 'Valor médio das mensalidades dos alunos.\n\n• Calculado: soma das parcelas ÷ total de alunos\n• Inclui todos os alunos pagantes\n• Fundamental para projeção de faturamento\n\n💡 Ticket alto = alunos com mais cursos ou planos premium.',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '[data-tour="secao-comercial"]',
    title: '🎯 Indicadores Comerciais',
    content: 'Acompanhe o funil de vendas da unidade:\n\n• Leads: contatos recebidos no mês pela fonte v2\n• Experimentais com Presença: presença individual confirmada\n• Taxa Exp→Mat: bloqueada até regra canônica\n• Ticket Passaporte: valor médio das matrículas\n\n💡 Para detalhes e lançamentos, acesse a página Comercial.',
    placement: 'top',
    disableBeacon: true,
  },
  {
    target: '[data-tour="secao-professores"]',
    title: '👨‍🏫 Indicadores de Professores',
    content: 'Métricas da equipe pedagógica:\n\n• Total Professores: Ativos na unidade\n• Média Alunos/Professor: Distribuição da carteira\n• Taxa Renovação: % de alunos que renovam\n• Média Alunos/Turma: Pilar financeiro!\n\n💡 Média ideal por turma: acima de 1.5 alunos.',
    placement: 'top',
    disableBeacon: true,
  },
  {
    target: '[data-tour="grafico-evolucao"]',
    title: '📈 Gráfico de Evolução',
    content: 'Visualize a evolução histórica dos indicadores:\n\n• Mostra os últimos 12 meses\n• Passe o mouse para ver valores exatos\n• Compare tendências e sazonalidades\n\n💡 Use para identificar padrões e planejar ações.',
    placement: 'top',
    disableBeacon: true,
  },
];
