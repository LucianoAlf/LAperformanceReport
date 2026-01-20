// Motor de Cálculo do Simulador de Metas

import { 
  InputsSimulacao, 
  ResultadoSimulacao, 
  Alerta, 
  DadosHistoricos,
  ProjecaoMensal 
} from './tipos';

/**
 * Calcula todos os resultados da simulação baseado nos inputs
 * Suporta dois modos: 'alunos' (objetivo = quantidade de alunos) e 'mrr' (objetivo = faturamento)
 */
export function calcularSimulacao(
  inputs: InputsSimulacao,
  historico?: DadosHistoricos,
  mesAtual: number = new Date().getMonth() + 1
): ResultadoSimulacao {
  const {
    tipoObjetivo = 'alunos',
    tipoMetaFinanceira = 'mensal',
    alunosAtual,
    alunosObjetivo: alunosObjetivoInput,
    mrrObjetivo: mrrObjetivoInput = 0,
    mesObjetivo,
    churnProjetado,
    ticketMedio,
    taxaLeadExp,
    taxaExpMat,
  } = inputs;

  // Meses restantes até o objetivo
  const mesesRestantes = mesObjetivo - mesAtual + 1;

  // Calcular objetivo de alunos baseado no tipo de objetivo
  let alunosObjetivo: number;
  let mrrObjetivo: number;

  if (tipoObjetivo === 'mrr') {
    // Modo MRR: calcular alunos necessários a partir do MRR desejado
    // Se for anual, dividir por 12 para obter o MRR mensal
    mrrObjetivo = tipoMetaFinanceira === 'anual' ? mrrObjetivoInput / 12 : mrrObjetivoInput;
    alunosObjetivo = ticketMedio > 0 ? Math.ceil(mrrObjetivo / ticketMedio) : 0;
  } else {
    // Modo Alunos: usar o objetivo de alunos diretamente
    alunosObjetivo = alunosObjetivoInput;
    mrrObjetivo = alunosObjetivo * ticketMedio;
  }
  
  // Crescimento necessário
  const crescimentoNecessario = alunosObjetivo - alunosAtual;
  const crescimentoPercentual = alunosAtual > 0 
    ? (crescimentoNecessario / alunosAtual) * 100 
    : 0;

  // Evasões projetadas (baseado no churn)
  const evasoesMensais = Math.round(alunosAtual * (churnProjetado / 100));
  const evasoesTotais = evasoesMensais * mesesRestantes;

  // Matrículas necessárias para compensar evasões + crescer
  const matriculasTotais = crescimentoNecessario + evasoesTotais;
  const matriculasMensais = mesesRestantes > 0 
    ? Math.ceil(matriculasTotais / mesesRestantes) 
    : 0;

  // Funil reverso: calcular experimentais e leads necessários
  const taxaExpMatDecimal = taxaExpMat / 100;
  const taxaLeadExpDecimal = taxaLeadExp / 100;
  
  const experimentaisMensais = taxaExpMatDecimal > 0 
    ? Math.ceil(matriculasMensais / taxaExpMatDecimal) 
    : 0;
  
  const leadsMensais = taxaLeadExpDecimal > 0 
    ? Math.ceil(experimentaisMensais / taxaLeadExpDecimal) 
    : 0;

  // Financeiro
  const mrrAtual = alunosAtual * ticketMedio;
  const mrrProjetado = alunosObjetivo * ticketMedio;
  const faturamentoAnualProjetado = mrrProjetado * 12;
  
  // LTV = Ticket × Tempo de permanência (1/churn em meses)
  const tempoPermanenciaMeses = churnProjetado > 0 ? 1 / (churnProjetado / 100) : 0;
  const ltvProjetado = ticketMedio * tempoPermanenciaMeses;

  // Gerar alertas
  const alertas = gerarAlertas(
    {
      matriculasMensais,
      leadsMensais,
      experimentaisMensais,
      churnProjetado,
      crescimentoPercentual,
      mesesRestantes,
    },
    historico
  );

  // Calcular score de viabilidade
  const scoreViabilidade = calcularScoreViabilidade(alertas);

  return {
    inputs,
    crescimentoNecessario,
    crescimentoPercentual,
    mesesRestantes,
    evasoesMensais,
    matriculasMensais,
    experimentaisMensais,
    leadsMensais,
    evasoesTotais,
    matriculasTotais,
    mrrAtual,
    mrrProjetado,
    faturamentoAnualProjetado,
    ltvProjetado,
    scoreViabilidade,
    alertas,
  };
}

/**
 * Calcula alunos necessários para atingir um MRR específico
 */
export function calcularAlunosParaMRR(mrrDesejado: number, ticketMedio: number): number {
  if (ticketMedio <= 0) return 0;
  return Math.ceil(mrrDesejado / ticketMedio);
}

/**
 * Calcula sugestão de ticket alternativo para atingir MRR com menos alunos
 */
export function calcularTicketAlternativo(
  mrrDesejado: number, 
  alunosDesejados: number
): number {
  if (alunosDesejados <= 0) return 0;
  return Math.ceil(mrrDesejado / alunosDesejados);
}

/**
 * Gera alertas comparando resultados com histórico
 */
function gerarAlertas(
  resultados: {
    matriculasMensais: number;
    leadsMensais: number;
    experimentaisMensais: number;
    churnProjetado: number;
    crescimentoPercentual: number;
    mesesRestantes: number;
  },
  historico?: DadosHistoricos
): Alerta[] {
  const alertas: Alerta[] = [];
  let alertaId = 0;

  const {
    matriculasMensais,
    leadsMensais,
    experimentaisMensais,
    churnProjetado,
    crescimentoPercentual,
    mesesRestantes,
  } = resultados;

  // Se não tem histórico, não pode comparar
  if (!historico) {
    alertas.push({
      id: `alerta-${alertaId++}`,
      tipo: 'info',
      categoria: 'geral',
      icone: 'info',
      titulo: 'Sem dados históricos',
      mensagem: 'Não há dados históricos suficientes para comparação.',
      sugestao: 'Os cálculos são baseados apenas nos inputs fornecidos.',
    });
    return alertas;
  }

  // 1. Alerta de Matrículas vs Histórico
  const diffMatriculas = historico.mediaMatriculas > 0
    ? ((matriculasMensais - historico.mediaMatriculas) / historico.mediaMatriculas) * 100
    : 0;

  if (diffMatriculas > 50) {
    alertas.push({
      id: `alerta-${alertaId++}`,
      tipo: 'erro',
      categoria: 'matriculas',
      icone: 'alert-triangle',
      titulo: 'Matrículas muito acima do histórico',
      mensagem: `Você precisa de ${matriculasMensais} matrículas/mês, mas a média histórica é ${historico.mediaMatriculas}.`,
      sugestao: 'Considere reduzir o churn ou aumentar o prazo da meta.',
      valorAtual: historico.mediaMatriculas,
      valorNecessario: matriculasMensais,
      diferencaPercent: diffMatriculas,
    });
  } else if (diffMatriculas > 20) {
    alertas.push({
      id: `alerta-${alertaId++}`,
      tipo: 'aviso',
      categoria: 'matriculas',
      icone: 'alert-triangle',
      titulo: 'Matrículas acima do histórico',
      mensagem: `Você precisa de ${matriculasMensais} matrículas/mês, mas a média histórica é ${historico.mediaMatriculas}.`,
      sugestao: 'Aumente o investimento em marketing ou melhore a conversão.',
      valorAtual: historico.mediaMatriculas,
      valorNecessario: matriculasMensais,
      diferencaPercent: diffMatriculas,
    });
  } else {
    alertas.push({
      id: `alerta-${alertaId++}`,
      tipo: 'sucesso',
      categoria: 'matriculas',
      icone: 'check-circle',
      titulo: 'Meta de matrículas viável',
      mensagem: `${matriculasMensais} matrículas/mês está dentro do histórico de ${historico.mediaMatriculas}/mês.`,
      valorAtual: historico.mediaMatriculas,
      valorNecessario: matriculasMensais,
      diferencaPercent: diffMatriculas,
    });
  }

  // 2. Alerta de Leads vs Histórico
  const diffLeads = historico.mediaLeads > 0
    ? ((leadsMensais - historico.mediaLeads) / historico.mediaLeads) * 100
    : 0;

  if (diffLeads > 50) {
    alertas.push({
      id: `alerta-${alertaId++}`,
      tipo: 'erro',
      categoria: 'leads',
      icone: 'alert-triangle',
      titulo: 'Leads muito acima da capacidade',
      mensagem: `Você precisa de ${leadsMensais} leads/mês, mas a média histórica é ${historico.mediaLeads}.`,
      sugestao: 'Aumente o budget de marketing ou melhore as taxas de conversão.',
      valorAtual: historico.mediaLeads,
      valorNecessario: leadsMensais,
      diferencaPercent: diffLeads,
    });
  } else if (diffLeads > 20) {
    alertas.push({
      id: `alerta-${alertaId++}`,
      tipo: 'aviso',
      categoria: 'leads',
      icone: 'alert-triangle',
      titulo: 'Leads acima do histórico',
      mensagem: `Você precisa de ${leadsMensais} leads/mês, mas a média histórica é ${historico.mediaLeads}.`,
      sugestao: 'Considere aumentar investimento em marketing.',
      valorAtual: historico.mediaLeads,
      valorNecessario: leadsMensais,
      diferencaPercent: diffLeads,
    });
  } else {
    alertas.push({
      id: `alerta-${alertaId++}`,
      tipo: 'sucesso',
      categoria: 'leads',
      icone: 'check-circle',
      titulo: 'Meta de leads viável',
      mensagem: `${leadsMensais} leads/mês está dentro do histórico de ${historico.mediaLeads}/mês.`,
      valorAtual: historico.mediaLeads,
      valorNecessario: leadsMensais,
      diferencaPercent: diffLeads,
    });
  }

  // 3. Alerta de Churn
  if (churnProjetado > 5) {
    alertas.push({
      id: `alerta-${alertaId++}`,
      tipo: 'erro',
      categoria: 'churn',
      icone: 'trending-down',
      titulo: 'Churn muito alto',
      mensagem: `Churn de ${churnProjetado}% está acima do recomendado (< 5%).`,
      sugestao: 'Implemente ações de retenção para reduzir o churn.',
      valorNecessario: 5,
      valorAtual: churnProjetado,
    });
  } else if (churnProjetado > 4) {
    alertas.push({
      id: `alerta-${alertaId++}`,
      tipo: 'aviso',
      categoria: 'churn',
      icone: 'alert-triangle',
      titulo: 'Churn pode ser melhorado',
      mensagem: `Churn de ${churnProjetado}% está na média. Ideal seria < 4%.`,
      sugestao: 'Ações de retenção podem ajudar a reduzir ainda mais.',
      valorNecessario: 4,
      valorAtual: churnProjetado,
    });
  } else {
    alertas.push({
      id: `alerta-${alertaId++}`,
      tipo: 'sucesso',
      categoria: 'churn',
      icone: 'check-circle',
      titulo: 'Churn saudável',
      mensagem: `Churn de ${churnProjetado}% está em um nível excelente.`,
      valorAtual: churnProjetado,
    });
  }

  // 4. Alerta de Crescimento Agressivo
  const crescimentoMensal = mesesRestantes > 0 ? crescimentoPercentual / mesesRestantes : 0;
  if (crescimentoMensal > 3) {
    alertas.push({
      id: `alerta-${alertaId++}`,
      tipo: 'aviso',
      categoria: 'geral',
      icone: 'rocket',
      titulo: 'Crescimento agressivo',
      mensagem: `Crescimento de ${crescimentoMensal.toFixed(1)}%/mês é desafiador.`,
      sugestao: 'Considere uma meta mais conservadora ou prazo maior.',
    });
  }

  // 5. Alerta de Taxa de Conversão
  const taxaConversaoTotal = historico.taxaConversaoTotal;
  if (taxaConversaoTotal < 15) {
    alertas.push({
      id: `alerta-${alertaId++}`,
      tipo: 'aviso',
      categoria: 'conversao',
      icone: 'percent',
      titulo: 'Taxa de conversão pode melhorar',
      mensagem: `Conversão total de ${taxaConversaoTotal.toFixed(1)}% está abaixo do ideal (> 20%).`,
      sugestao: 'Treine a equipe comercial para aumentar a conversão.',
      valorAtual: taxaConversaoTotal,
      valorNecessario: 20,
    });
  }

  return alertas;
}

/**
 * Calcula score de viabilidade baseado nos alertas
 */
function calcularScoreViabilidade(alertas: Alerta[]): number {
  let score = 100;

  for (const alerta of alertas) {
    switch (alerta.tipo) {
      case 'erro':
        score -= 25;
        break;
      case 'aviso':
        score -= 10;
        break;
      case 'info':
        score -= 5;
        break;
      // 'sucesso' não reduz o score
    }
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Gera projeção mês a mês
 */
export function gerarProjecaoMensal(
  inputs: InputsSimulacao,
  resultado: ResultadoSimulacao,
  mesAtual: number = new Date().getMonth() + 1,
  anoAtual: number = new Date().getFullYear()
): ProjecaoMensal[] {
  const projecao: ProjecaoMensal[] = [];
  const mesesNomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  
  let alunosAtual = inputs.alunosAtual;
  let acumuladoMatriculas = 0;
  let acumuladoEvasoes = 0;
  let mes = mesAtual;
  let ano = anoAtual;

  while (mes <= inputs.mesObjetivo || ano < inputs.ano) {
    const evasoes = Math.round(alunosAtual * (inputs.churnProjetado / 100));
    const matriculas = resultado.matriculasMensais;
    const alunosFim = alunosAtual + matriculas - evasoes;
    
    acumuladoMatriculas += matriculas;
    acumuladoEvasoes += evasoes;

    projecao.push({
      mes,
      ano,
      label: `${mesesNomes[mes - 1]}/${String(ano).slice(-2)}`,
      alunosInicio: alunosAtual,
      matriculas,
      evasoes,
      alunosFim,
      mrr: alunosFim * inputs.ticketMedio,
      acumuladoMatriculas,
      acumuladoEvasoes,
    });

    alunosAtual = alunosFim;
    mes++;
    if (mes > 12) {
      mes = 1;
      ano++;
    }

    // Limite de segurança
    if (projecao.length > 24) break;
  }

  return projecao;
}

/**
 * Formata valor monetário
 */
export function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(valor);
}

/**
 * Formata número com separador de milhar
 */
export function formatarNumero(valor: number): string {
  return new Intl.NumberFormat('pt-BR').format(valor);
}

/**
 * Formata percentual
 */
export function formatarPercentual(valor: number, casas: number = 1): string {
  return `${valor.toFixed(casas)}%`;
}
