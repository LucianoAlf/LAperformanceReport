import { Step } from 'react-joyride';

export const comercialTourSteps: Step[] = [
  // ═══════════════════════════════════════════════════════════════
  // SEÇÃO 1: INTRODUÇÃO E VISÃO GERAL
  // ═══════════════════════════════════════════════════════════════
  {
    target: '[data-tour="sidebar"]',
    title: '🎯 Área Comercial',
    content: 'Bem-vindo à Área Comercial! Aqui você gerencia todo o funil de vendas: leads, experimentais, visitas e matrículas.\n\n💡 Esta é a página mais importante para o Hunter!',
    placement: 'right',
    disableBeacon: true,
  },
  {
    target: '[data-tour="comercial-filtro"]',
    title: '📅 Filtro de Período',
    content: 'Selecione o período que deseja visualizar:\n\n• Mês atual: Dados do mês corrente\n• Meses anteriores: Histórico de vendas\n• Ano: Selecione o ano de referência\n\n💡 Os dados são atualizados em tempo real!',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '[data-tour="cards-resumo"]',
    title: '📊 Cards de Resumo',
    content: 'Visão geral dos números comerciais:\n\n• Leads Atendidos: Contatos que você atendeu\n• Experimentais: Aulas agendadas/realizadas\n• Visitas: Visitas a escolas parceiras\n• Matrículas: Conversões do período\n\n💡 Os cards são clicáveis para lançar novos registros!',
    placement: 'bottom',
    disableBeacon: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // SEÇÃO 2: BOTÕES DE AÇÃO
  // ═══════════════════════════════════════════════════════════════
  {
    target: '[data-tour="btn-lead"]',
    title: '📞 Registrar Lead',
    content: 'Registre cada lead que entrar em contato:\n\n• Nome e telefone do interessado\n• Canal de origem (Instagram, indicação, etc.)\n• Curso de interesse\n• Observações do atendimento\n\n⚠️ Registre TODOS os leads para medir conversão!',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '[data-tour="btn-experimental"]',
    title: '🎸 Aula Experimental',
    content: 'Registre aulas experimentais agendadas:\n\n• ⏳ Agendada: Aguardando a data\n• ✅ Realizada: Aluno compareceu\n• ❌ No-show: Aluno faltou\n\n💡 A taxa de show-up é um KPI importante do Matriculador+!',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '[data-tour="btn-visita"]',
    title: '🏫 Visita a Escola',
    content: 'Registre visitas a escolas parceiras:\n\n• Nome da escola visitada\n• Contato realizado\n• Resultado da visita\n• Próximos passos\n\n💡 Visitas geram leads qualificados!',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '[data-tour="btn-matricula"]',
    title: '✅ Nova Matrícula',
    content: '🎉 O momento mais importante! Registre a matrícula:\n\n• Dados do aluno (nome, contato, endereço)\n• Curso e professor\n• Valor da mensalidade e passaporte\n• Forma de pagamento\n\n💡 O aluno é criado automaticamente na base!',
    placement: 'bottom',
    disableBeacon: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // SEÇÃO 3: FUNIL DE CONVERSÃO
  // ═══════════════════════════════════════════════════════════════
  {
    target: '[data-tour="comercial-funil"]',
    title: '📈 Funil de Conversão',
    content: 'Visualize as taxas de conversão do seu funil:\n\n• Lead → Experimental: Quantos leads agendaram aula\n• Experimental → Matrícula: Taxa de fechamento\n• Lead → Matrícula: Conversão geral\n\n💡 Cores indicam se está acima ou abaixo da meta!',
    placement: 'top',
    disableBeacon: true,
  },
  {
    target: '[data-tour="comercial-metas"]',
    title: '🎯 Metas do Período',
    content: 'Acompanhe o progresso das suas metas:\n\n• Barra de progresso visual\n• Percentual atingido\n• Quanto falta para bater a meta\n\n💡 Metas são definidas pela coordenação na página de Metas.',
    placement: 'top',
    disableBeacon: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // SEÇÃO 4: DETALHAMENTO DO FUNIL
  // ═══════════════════════════════════════════════════════════════
  {
    target: '[data-tour="comercial-detalhamento"]',
    title: '� Detalhamento do Funil',
    content: 'Visualize e edite os registros de cada etapa do funil:\n\n• Leads Atendidos: Lista de contatos\n• Experimentais: Aulas agendadas/realizadas\n• Visitas: Escolas visitadas\n• Matrículas: Alunos matriculados\n\n💡 Clique nas abas para alternar entre as listas!',
    placement: 'top',
    disableBeacon: true,
  },
  {
    target: '[data-tour="comercial-abas-funil"]',
    title: '📑 Abas do Funil',
    content: 'Navegue entre as etapas do funil:\n\n• Leads Atendidos: Todos os contatos recebidos\n• Experimentais: Aulas experimentais do período\n• Visitas: Visitas a escolas parceiras\n• Matrículas: Conversões realizadas\n\n💡 O contador mostra quantos registros em cada aba.',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '[data-tour="comercial-tabela-funil"]',
    title: '📋 Tabela de Registros',
    content: 'Lista detalhada dos registros:\n\n• Data: Quando foi registrado\n• Nome: Identificação do lead/aluno\n• Canal: Origem do contato\n• Curso: Interesse do aluno\n• Ações: Editar ou excluir\n\n� Clique em qualquer campo para editar inline!',
    placement: 'top',
    disableBeacon: true,
  },
  {
    target: '[data-tour="comercial-total-passaportes"]',
    title: '💰 Total de Passaportes',
    content: 'Valor total de passaportes vendidos no período:\n\n• Soma de todos os passaportes das matrículas\n• Atualizado automaticamente\n• Importante para o faturamento\n\n💡 Este valor impacta diretamente o Ticket Médio!',
    placement: 'left',
    disableBeacon: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // SEÇÃO 5: PLANO DE AÇÃO INTELIGENTE (IA)
  // ═══════════════════════════════════════════════════════════════
  {
    target: '[data-tour="comercial-plano-acao"]',
    title: '🧠 Plano de Ação Inteligente',
    content: 'A IA analisa seus dados e gera sugestões personalizadas:\n\n• Análise do funil de vendas\n• Identificação de gargalos\n• Sugestões de ação imediata\n• Projeção de resultados\n\n💡 Clique em "Gerar Plano" para receber insights!',
    placement: 'top',
    disableBeacon: true,
  },
  {
    target: '[data-tour="comercial-btn-gerar-plano"]',
    title: '✨ Gerar Plano',
    content: 'Clique para a IA analisar seus dados:\n\n• Saúde comercial (crítica a on fire)\n• Conquistas do período\n• Alertas urgentes\n• Plano de ação semanal\n\n💡 O plano é personalizado para você!',
    placement: 'left',
    disableBeacon: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // SEÇÃO 6: PROGRAMA MATRICULADOR+
  // ═══════════════════════════════════════════════════════════════
  {
    target: '[data-tour="aba-programa"]',
    title: '🏆 Programa Matriculador+ LA',
    content: 'Acompanhe sua pontuação no programa de bonificação!\n\nCritérios (100 pts total):\n• Taxa Show-up → Experimental (20 pts)\n• Taxa Experimental → Matrícula (25 pts)\n• Taxa Lead → Matrícula Geral (30 pts)\n• Volume Médio Matrículas/Mês (15 pts)\n• Ticket Médio Anual (10 pts)\n\n🎁 Prêmio: Viagem com acompanhante!\n⚠️ Nota de corte: 80 pontos',
    placement: 'bottom',
    disableBeacon: true,
  },

  // ═══════════════════════════════════════════════════════════════
  // SEÇÃO 7: AÇÕES EXTRAS
  // ═══════════════════════════════════════════════════════════════
  {
    target: '[data-tour="btn-whatsapp"]',
    title: '📱 Relatório WhatsApp',
    content: 'Gere um relatório formatado para WhatsApp:\n\n• Resumo do dia/semana/mês\n• Números de leads, experimentais e matrículas\n• Taxas de conversão\n• Pronto para copiar e enviar!\n\n💡 Perfeito para enviar para a coordenação!',
    placement: 'left',
    disableBeacon: true,
  },
];
