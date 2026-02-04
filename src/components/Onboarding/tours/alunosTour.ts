import { Step } from 'react-joyride';

export const alunosTourSteps: Step[] = [
  // ═══════════════════════════════════════════════════════════════
  // SEÇÃO 1: INTRODUÇÃO
  // ═══════════════════════════════════════════════════════════════
  {
    target: '[data-tour="sidebar"]',
    title: '👥 Gestão de Alunos',
    content: 'Bem-vindo à Gestão de Alunos! Aqui você gerencia toda a base de alunos da unidade: cadastros, turmas, grade horária e muito mais.',
    placement: 'right',
    disableBeacon: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // SEÇÃO 2: KPIs E INDICADORES
  // ═══════════════════════════════════════════════════════════════
  {
    target: '[data-tour="alunos-kpis"]',
    title: '📊 Indicadores de Alunos',
    content: 'Acompanhe os KPIs da sua base de alunos:\n\n• Total Ativos: Alunos matriculados e pagantes\n• Ticket Médio: Valor médio das mensalidades\n• Tempo Permanência: Média de meses que alunos ficam\n• Por Curso: Distribuição entre os cursos\n\n💡 Esses números são atualizados em tempo real.',
    placement: 'bottom',
    disableBeacon: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // SEÇÃO 3: ABAS E NAVEGAÇÃO
  // ═══════════════════════════════════════════════════════════════
  {
    target: '[data-tour="alunos-tabs"]',
    title: '📑 Abas do Sistema',
    content: 'O sistema de Alunos tem 5 abas principais:\n\n• Lista: Cadastro completo de alunos\n• Turmas: Gestão de turmas e professores\n• Grade: Visualização da grade horária\n• Distribuição: Análise por curso/professor\n• Importação: Importar dados do Emusys\n\n💡 Cada aba tem funcionalidades específicas.',
    placement: 'bottom',
    disableBeacon: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // SEÇÃO 4: AÇÕES
  // ═══════════════════════════════════════════════════════════════
  {
    target: '[data-tour="alunos-acoes"]',
    title: '⚡ Ações Rápidas',
    content: 'Botões de ação disponíveis:\n\n• ➕ Nova Turma: Criar nova turma\n• ➕ Novo Aluno: Cadastrar aluno\n• 📥 Exportar: Baixar planilha Excel\n\n💡 As ações mudam conforme a aba selecionada!',
    placement: 'left',
    disableBeacon: true,
  },
];
