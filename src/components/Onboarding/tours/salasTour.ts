import { Step } from 'react-joyride';

export const salasTourSteps: Step[] = [
  // ═══════════════════════════════════════════════════════════════
  // SEÇÃO 1: INTRODUÇÃO
  // ═══════════════════════════════════════════════════════════════
  {
    target: '[data-tour="sidebar"]',
    title: '🚪 Gestão de Salas',
    content: 'Bem-vindo à Gestão de Salas! Aqui você configura os espaços físicos da escola, controla ocupação e gerencia o inventário de equipamentos.',
    placement: 'right',
    disableBeacon: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // SEÇÃO 2: ABAS E NAVEGAÇÃO
  // ═══════════════════════════════════════════════════════════════
  {
    target: '[data-tour="salas-abas"]',
    title: '📑 Abas do Sistema',
    content: 'O sistema tem duas abas principais:\n\n• Salas: Cadastro e configuração das salas de aula\n• Inventário: Controle de equipamentos e instrumentos',
    placement: 'bottom',
    disableBeacon: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // SEÇÃO 3: KPIs E INDICADORES
  // ═══════════════════════════════════════════════════════════════
  {
    target: '[data-tour="salas-kpis"]',
    title: '📊 Indicadores de Salas',
    content: 'Acompanhe os KPIs das salas:\n\n• Total de Salas: Quantidade de salas cadastradas\n• Capacidade Total: Ocupação atual vs capacidade máxima\n• Salas Coringa: Salas multiuso que aceitam qualquer curso\n• Taxa de Utilização: Horas ocupadas vs disponíveis na semana\n• Capacidade Diária: Potencial de atendimento em alunos×hora',
    placement: 'bottom',
    disableBeacon: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // SEÇÃO 4: FILTROS E BUSCA
  // ═══════════════════════════════════════════════════════════════
  {
    target: '[data-tour="salas-filtros"]',
    title: '🔍 Filtros e Busca',
    content: 'Use os filtros para encontrar salas específicas:\n\n• Busca: Digite o nome da sala\n• Tipo: Filtre por tipo (Piano, Bateria, Cordas, etc.)\n• Coringa: Veja apenas salas coringa ou específicas',
    placement: 'bottom',
    disableBeacon: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // SEÇÃO 5: NOVA SALA
  // ═══════════════════════════════════════════════════════════════
  {
    target: '[data-tour="btn-nova-sala"]',
    title: '➕ Nova Sala',
    content: 'Clique aqui para cadastrar uma nova sala. Você vai definir:\n\n• Nome e código da sala\n• Tipo (Piano, Bateria, Cordas, etc.)\n• Capacidade máxima de alunos\n• Se é sala coringa (aceita qualquer curso)\n• Buffer operacional entre aulas\n• Recursos disponíveis (instrumentos, equipamentos)',
    placement: 'left',
    disableBeacon: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // SEÇÃO 6: CARDS DE SALAS
  // ═══════════════════════════════════════════════════════════════
  {
    target: '[data-tour="salas-cards"]',
    title: '🏢 Cards de Salas',
    content: 'Cada card mostra informações completas da sala:\n\n• Ocupação: Barra de progresso mostrando % de uso\n• Tipo: Categoria da sala com emoji identificador\n• Recursos: Equipamentos disponíveis\n• Buffer: Tempo entre aulas\n\nAções disponíveis:\n• 📅 Ver ocupação (grade de horários)\n• ✏️ Editar configurações\n• 🗑️ Excluir sala',
    placement: 'top',
    disableBeacon: true,
  },
];
