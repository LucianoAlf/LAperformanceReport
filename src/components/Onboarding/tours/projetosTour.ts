import { Step } from 'react-joyride';

export const projetosTourSteps: Step[] = [
  // ═══════════════════════════════════════════════════════════════
  // SEÇÃO 1: INTRODUÇÃO
  // ═══════════════════════════════════════════════════════════════
  {
    target: '[data-tour="sidebar"]',
    title: '🎭 Gestão de Projetos',
    content: 'Bem-vindo à Gestão de Projetos! Aqui você organiza todos os projetos pedagógicos da escola: apresentações, recitais, workshops e eventos especiais.',
    placement: 'right',
    disableBeacon: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // SEÇÃO 2: NOVO PROJETO
  // ═══════════════════════════════════════════════════════════════
  {
    target: '[data-tour="btn-novo-projeto"]',
    title: '➕ Novo Projeto',
    content: 'Crie um novo projeto pedagógico:\n\nTipos de projeto:\n• 🎵 Apresentações e recitais\n• 🎓 Workshops e masterclasses\n• 🎉 Eventos especiais\n• 📚 Projetos pedagógicos\n\nDefina:\n• Nome e descrição\n• Data de início e fim\n• Responsáveis\n• Tarefas e etapas',
    placement: 'left',
    disableBeacon: true,
  },
];
