import { Step } from 'react-joyride';

export const administrativoTourSteps: Step[] = [
  // ═══════════════════════════════════════════════════════════════
  // SEÇÃO 1: INTRODUÇÃO
  // ═══════════════════════════════════════════════════════════════
  {
    target: '[data-tour="sidebar"]',
    title: '📋 Área Administrativa',
    content: 'Bem-vindo à Área Administrativa! Aqui você gerencia renovações, avisos prévios, cancelamentos e acompanha a retenção de alunos.\n\n💡 Esta é a página mais importante para os Farmers!',
    placement: 'right',
    disableBeacon: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // SEÇÃO 2: KPIs PRINCIPAIS
  // ═══════════════════════════════════════════════════════════════
  {
    target: '[data-tour="administrativo-kpis"]',
    title: '📊 Resumo do Mês',
    content: 'Visão geral da base de alunos:\n\n• Alunos Ativos: Total na base\n• Pagantes: Alunos em dia\n• Matrículas Ativas: Cursos ativos\n• Bolsistas: Integrais e parciais\n• Trancados: Temporariamente inativos\n• Novos no Mês: Matrículas recentes',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '[data-tour="administrativo-indicadores"]',
    title: '📈 Indicadores de Retenção',
    content: 'KPIs críticos para o Fideliza+:\n\n• Taxa de Renovação: Meta ≥ 90%\n• Churn Rate: Meta ≤ 4%\n• Tempo Permanência: Média de meses\n• MRR Perdido: Impacto financeiro\n\n💡 Esses indicadores definem sua pontuação!',
    placement: 'bottom',
    disableBeacon: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // SEÇÃO 3: LANÇAMENTOS
  // ═══════════════════════════════════════════════════════════════
  {
    target: '[data-tour="administrativo-lancamento"]',
    title: '📝 Lançamento Rápido',
    content: 'Registre movimentações administrativas:\n\n• ✅ Renovação: Aluno renovou contrato\n• ❌ Não Renovação: Aluno não renovou\n• ⚠️ Aviso Prévio: Aluno avisou que vai sair\n• ⏸️ Trancamento: Pausa temporária\n• 🚫 Cancelamento: Saída definitiva\n\n💡 Clique nos cards para lançar!',
    placement: 'bottom',
    disableBeacon: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // SEÇÃO 4: ANÁLISES
  // ═══════════════════════════════════════════════════════════════
  {
    target: '[data-tour="administrativo-motivos"]',
    title: '📊 Motivos de Saída',
    content: 'Entenda por que alunos estão saindo:\n\n• 💰 Financeiro: Problemas de pagamento\n• ⏰ Tempo: Falta de disponibilidade\n• 👤 Pessoal: Mudança, viagem, etc.\n• 😞 Insatisfação: Problemas com a escola\n\n💡 Use para criar ações de retenção!',
    placement: 'top',
    disableBeacon: true,
  },
];
