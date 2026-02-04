import { Step } from 'react-joyride';

export const configTourSteps: Step[] = [
  {
    target: '[data-tour="sidebar"]',
    title: '⚙️ Configurações',
    content: 'Bem-vindo às Configurações! Aqui você gerencia os dados mestres do sistema: unidades, canais de origem, motivos de saída e cursos.',
    placement: 'right',
    disableBeacon: true,
  },
  {
    target: '[data-tour="config-tabs"]',
    title: '📑 Categorias de Configuração',
    content: 'O sistema tem 5 categorias de configuração:\n\n• Unidades: Escolas e filiais\n• Canais de Origem: De onde vêm os leads\n• Motivos de Saída: Por que alunos saem\n• Tipos de Saída: Categorias de evasão\n• Cursos: Instrumentos oferecidos',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '[data-tour="config-unidades"]',
    title: '🏢 Unidades',
    content: 'Configure cada unidade da rede:\n\n• Nome e endereço: Identificação\n• Telefone: Contato principal\n• Hunter: Responsável comercial\n• Farmers: Equipe de retenção\n• Horário: Funcionamento da unidade\n\n💡 Essas informações aparecem nos relatórios.',
    placement: 'right',
    disableBeacon: true,
  },
  {
    target: '[data-tour="config-canais"]',
    title: '📢 Canais de Origem',
    content: 'Gerencie os canais de captação de leads:\n\n• Instagram, Facebook, Google\n• Indicação de alunos\n• Parcerias com escolas\n• Eventos e feiras\n\n💡 Importante para medir ROI de marketing!',
    placement: 'right',
    disableBeacon: true,
  },
  {
    target: '[data-tour="config-motivos"]',
    title: '📋 Motivos de Saída',
    content: 'Configure os motivos de cancelamento:\n\n• Financeiro, Tempo, Mudança\n• Insatisfação, Saúde\n• Outros motivos\n\n💡 Usado para análise de churn e ações de retenção.',
    placement: 'right',
    disableBeacon: true,
  },
];
