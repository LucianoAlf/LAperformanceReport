// Cálculos para o Simulador de Média de Alunos por Turma
// Baseado no documento AULAS_TURMA_SIMULADOR.md

import {
  ResultadoSimuladorTurma,
  AlertaViabilidade,
  BonificacaoSugerida,
  ProfessorTurma,
  SEMANAS_MES,
} from './tipos';

/**
 * Calcula o custo por turma baseado na média de alunos
 * Fórmula: Custo/Turma = (B + (M-1) × I) × S
 * Onde: B = valor base, M = média, I = incremento, S = semanas
 */
export function calcularCustoPorTurma(
  media: number,
  valorBase: number,
  incremento: number,
  semanas: number = SEMANAS_MES
): number {
  // Para média fracionária, interpolar entre valores inteiros
  const n = Math.floor(media);
  const f = media - n;
  
  // Custo para n alunos
  const custoN = (valorBase + (n - 1) * incremento) * semanas;
  // Custo para n+1 alunos
  const custoN1 = (valorBase + n * incremento) * semanas;
  
  // Interpolação linear
  return custoN * (1 - f) + custoN1 * f;
}

/**
 * Calcula o custo por aluno baseado na média
 * Fórmula: Custo/Aluno = Custo/Turma ÷ M
 */
export function calcularCustoPorAluno(
  media: number,
  valorBase: number,
  incremento: number,
  semanas: number = SEMANAS_MES
): number {
  if (media <= 0) return 0;
  const custoTurma = calcularCustoPorTurma(media, valorBase, incremento, semanas);
  return custoTurma / media;
}

/**
 * Calcula a folha total de pagamento
 * Fórmula: Folha = Total de Alunos × Custo/Aluno
 */
export function calcularFolhaTotal(
  totalAlunos: number,
  media: number,
  valorBase: number,
  incremento: number,
  semanas: number = SEMANAS_MES
): number {
  const custoAluno = calcularCustoPorAluno(media, valorBase, incremento, semanas);
  return totalAlunos * custoAluno;
}

/**
 * Calcula o percentual da folha sobre o MRR
 * Fórmula: % Folha = (Folha ÷ MRR) × 100
 */
export function calcularPercentualFolha(folha: number, mrr: number): number {
  if (mrr <= 0) return 0;
  return (folha / mrr) * 100;
}

/**
 * Calcula a margem bruta
 * Fórmula: Margem = 100 - % Folha
 */
export function calcularMargem(percentualFolha: number): number {
  return 100 - percentualFolha;
}

/**
 * Calcula o resultado completo do simulador
 */
export function calcularResultadoSimulador(
  totalAlunos: number,
  ticketMedio: number,
  mediaAtual: number,
  mediaMeta: number,
  valorBase: number,
  incremento: number,
  semanas: number = SEMANAS_MES,
  custosFixos: number = 0
): ResultadoSimuladorTurma {
  const mrrTotal = totalAlunos * ticketMedio;
  
  // Situação Atual
  const custoAlunoAtual = calcularCustoPorAluno(mediaAtual, valorBase, incremento, semanas);
  const folhaAtual = calcularFolhaTotal(totalAlunos, mediaAtual, valorBase, incremento, semanas);
  const percentualFolhaAtual = calcularPercentualFolha(folhaAtual, mrrTotal);
  const margemAtual = calcularMargem(percentualFolhaAtual);
  
  // Meta Projetada
  const custoAlunoMeta = calcularCustoPorAluno(mediaMeta, valorBase, incremento, semanas);
  const folhaMeta = calcularFolhaTotal(totalAlunos, mediaMeta, valorBase, incremento, semanas);
  const percentualFolhaMeta = calcularPercentualFolha(folhaMeta, mrrTotal);
  const margemMeta = calcularMargem(percentualFolhaMeta);
  
  // Ganhos
  const ganhoMargem = margemMeta - margemAtual;
  const economiaMensal = folhaAtual - folhaMeta;
  const economiaAnual = economiaMensal * 12;
  
  // Projeção de Lucro
  const lucroBrutoAtual = mrrTotal - folhaAtual;
  const lucroLiquidoAtual = lucroBrutoAtual - custosFixos;
  const lucroBrutoMeta = mrrTotal - folhaMeta;
  const lucroLiquidoMeta = lucroBrutoMeta - custosFixos;
  const ganhoLucroBruto = lucroBrutoMeta - lucroBrutoAtual;
  const ganhoLucroLiquido = lucroLiquidoMeta - lucroLiquidoAtual;
  
  // Alertas de viabilidade
  const alertas = gerarAlertas(mediaAtual, mediaMeta, ganhoMargem, margemMeta);
  
  // Score de viabilidade (0-100)
  const scoreViabilidade = calcularScoreViabilidade(mediaAtual, mediaMeta, margemMeta, alertas);
  
  return {
    mediaAtual,
    folhaAtual,
    percentualFolhaAtual,
    margemAtual,
    custoAlunoAtual,
    mediaMeta,
    folhaMeta,
    percentualFolhaMeta,
    margemMeta,
    custoAlunoMeta,
    ganhoMargem,
    economiaMensal,
    economiaAnual,
    totalAlunos,
    ticketMedio,
    mrrTotal,
    custosFixos,
    lucroBrutoAtual,
    lucroLiquidoAtual,
    lucroBrutoMeta,
    lucroLiquidoMeta,
    ganhoLucroBruto,
    ganhoLucroLiquido,
    scoreViabilidade,
    alertas,
  };
}

/**
 * Gera alertas de viabilidade baseado nos dados
 */
function gerarAlertas(
  mediaAtual: number,
  mediaMeta: number,
  ganhoMargem: number,
  margemMeta: number
): AlertaViabilidade[] {
  const alertas: AlertaViabilidade[] = [];
  
  const diferencaMedia = mediaMeta - mediaAtual;
  
  // Alerta sobre viabilidade da meta
  if (margemMeta >= 80) {
    alertas.push({
      tipo: 'sucesso',
      titulo: 'Meta de margem alcançável',
      mensagem: `A meta de ${margemMeta.toFixed(2)}% é realista com o cenário selecionado.`,
    });
  } else if (margemMeta >= 70) {
    alertas.push({
      tipo: 'aviso',
      titulo: 'Margem moderada',
      mensagem: `A margem de ${margemMeta.toFixed(2)}% está abaixo do ideal (80%+).`,
    });
  } else {
    alertas.push({
      tipo: 'erro',
      titulo: 'Margem crítica',
      mensagem: `A margem de ${margemMeta.toFixed(2)}% está muito baixa. Revise o cenário.`,
    });
  }
  
  // Alerta sobre dificuldade da transição
  if (diferencaMedia > 1.0) {
    alertas.push({
      tipo: 'erro',
      titulo: 'Transição muito agressiva',
      mensagem: `Aumentar ${diferencaMedia.toFixed(1)} na média é muito difícil. Considere metas intermediárias.`,
    });
  } else if (diferencaMedia > 0.5) {
    alertas.push({
      tipo: 'aviso',
      titulo: 'Requer gestão ativa da coordenação',
      mensagem: `A transição de ${mediaAtual.toFixed(2)} → ${mediaMeta.toFixed(1)} exige acompanhamento.`,
    });
  } else if (diferencaMedia > 0) {
    alertas.push({
      tipo: 'sucesso',
      titulo: 'Meta realista',
      mensagem: `Aumentar ${diferencaMedia.toFixed(1)} na média é factível com ações pontuais.`,
    });
  }
  
  // Alerta sobre ROI
  if (ganhoMargem > 5) {
    alertas.push({
      tipo: 'sucesso',
      titulo: 'ROI positivo em 3-6 meses',
      mensagem: 'Economia supera custos de garantia rapidamente.',
    });
  } else if (ganhoMargem > 2) {
    alertas.push({
      tipo: 'aviso',
      titulo: 'ROI moderado',
      mensagem: 'Retorno em 6-12 meses. Avalie custo-benefício.',
    });
  }
  
  return alertas;
}

/**
 * Calcula o score de viabilidade (0-100)
 */
function calcularScoreViabilidade(
  mediaAtual: number,
  mediaMeta: number,
  margemMeta: number,
  alertas: AlertaViabilidade[]
): number {
  let score = 100;
  
  // Penalizar por diferença grande na média
  const diferencaMedia = mediaMeta - mediaAtual;
  if (diferencaMedia > 1.0) score -= 30;
  else if (diferencaMedia > 0.5) score -= 15;
  else if (diferencaMedia > 0.3) score -= 5;
  
  // Penalizar por margem baixa
  if (margemMeta < 70) score -= 25;
  else if (margemMeta < 75) score -= 15;
  else if (margemMeta < 80) score -= 5;
  
  // Penalizar por alertas de erro
  const erros = alertas.filter(a => a.tipo === 'erro').length;
  const avisos = alertas.filter(a => a.tipo === 'aviso').length;
  score -= erros * 15;
  score -= avisos * 5;
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Calcula bonificações sugeridas para diferentes metas
 * Baseado em ~45% da economia gerada
 */
export function calcularBonificacoesSugeridas(
  alunosPorProfessor: number,
  ticketMedio: number,
  mediaAtual: number,
  valorBase: number,
  incremento: number,
  semanas: number = SEMANAS_MES
): BonificacaoSugerida[] {
  const metas = [1.5, 1.8, 2.0, 2.5, 3.0];
  const percentualRepasse = 0.45; // 45% da economia vai pro professor
  
  const mrrProfessor = alunosPorProfessor * ticketMedio;
  const folhaAtual = calcularFolhaTotal(alunosPorProfessor, mediaAtual, valorBase, incremento, semanas);
  
  return metas
    .filter(meta => meta > mediaAtual)
    .map(meta => {
      const folhaMeta = calcularFolhaTotal(alunosPorProfessor, meta, valorBase, incremento, semanas);
      const economiaProfessor = folhaAtual - folhaMeta;
      const bonusSugerido = Math.round(economiaProfessor * percentualRepasse);
      const lucroEscola = Math.round(economiaProfessor * (1 - percentualRepasse));
      
      return {
        metaAtingida: meta,
        economiaProfessor: Math.round(economiaProfessor),
        bonusSugerido,
        lucroEscola,
        percentualRepasse: Math.round(percentualRepasse * 100),
      };
    });
}

/**
 * Calcula dados de um professor individual
 */
export function calcularDadosProfessor(
  professor: {
    id: number;
    nome: string;
    unidadeId: string;
    unidadeNome: string;
    totalAlunos: number;
    totalTurmas: number;
    mrrCarteira: number;
  },
  mediaMeta: number,
  valorBase: number,
  incremento: number,
  semanas: number = SEMANAS_MES
): ProfessorTurma {
  const mediaAlunosTurma = professor.totalTurmas > 0 
    ? professor.totalAlunos / professor.totalTurmas 
    : 1;
  
  const ticketMedio = professor.totalAlunos > 0 
    ? professor.mrrCarteira / professor.totalAlunos 
    : 0;
  
  // Situação atual
  const folhaAtual = calcularFolhaTotal(professor.totalAlunos, mediaAlunosTurma, valorBase, incremento, semanas);
  const percentualFolhaAtual = calcularPercentualFolha(folhaAtual, professor.mrrCarteira);
  const margemAtual = calcularMargem(percentualFolhaAtual);
  
  // Meta
  const folhaMeta = calcularFolhaTotal(professor.totalAlunos, mediaMeta, valorBase, incremento, semanas);
  const percentualFolhaMeta = calcularPercentualFolha(folhaMeta, professor.mrrCarteira);
  const margemMeta = calcularMargem(percentualFolhaMeta);
  
  // Economia
  const economiaMensal = folhaAtual - folhaMeta;
  
  // Status baseado na média atual
  let status: ProfessorTurma['status'];
  if (mediaAlunosTurma < 1.3) status = 'critico';
  else if (mediaAlunosTurma < 1.7) status = 'atencao';
  else if (mediaAlunosTurma < 2.0) status = 'bom';
  else status = 'excelente';
  
  return {
    id: professor.id,
    nome: professor.nome,
    unidadeId: professor.unidadeId,
    unidadeNome: professor.unidadeNome,
    totalAlunos: professor.totalAlunos,
    totalTurmas: professor.totalTurmas,
    mediaAlunosTurma,
    mrrCarteira: professor.mrrCarteira,
    ticketMedio,
    percentualFolhaAtual,
    margemAtual,
    percentualFolhaMeta,
    margemMeta,
    economiaMensal,
    status,
  };
}

/**
 * Calcula o ganho de margem por +0.1 de aumento na média
 * Baseado nas fórmulas do documento AULAS_TURMA_SIMULADOR.md
 * O ganho é DECRESCENTE: maior nas faixas baixas, menor nas altas
 */
export function calcularGanhoMargemPor01(
  mediaAtual: number,
  ticketMedio: number,
  valorBase: number,
  incremento: number,
  semanas: number = SEMANAS_MES
): {
  ganhoPorcentual: number;
  faixaAtual: string;
  classificacao: 'alto' | 'medio' | 'baixo';
  descricao: string;
} {
  // Calcular margem na média atual
  const custoAlunoAtual = calcularCustoPorAluno(mediaAtual, valorBase, incremento, semanas);
  const percentualFolhaAtual = (custoAlunoAtual / ticketMedio) * 100;
  const margemAtual = 100 - percentualFolhaAtual;
  
  // Calcular margem na média +0.1
  const mediaProxima = mediaAtual + 0.1;
  const custoAlunoProximo = calcularCustoPorAluno(mediaProxima, valorBase, incremento, semanas);
  const percentualFolhaProximo = (custoAlunoProximo / ticketMedio) * 100;
  const margemProxima = 100 - percentualFolhaProximo;
  
  // Ganho de margem por +0.1
  const ganhoPorcentual = margemProxima - margemAtual;
  
  // Classificar o ganho
  let classificacao: 'alto' | 'medio' | 'baixo';
  if (ganhoPorcentual >= 1.5) classificacao = 'alto';
  else if (ganhoPorcentual >= 0.5) classificacao = 'medio';
  else classificacao = 'baixo';
  
  // Faixa atual
  const faixaAtual = `${mediaAtual.toFixed(1)} → ${mediaProxima.toFixed(1)}`;
  
  // Descrição contextual
  let descricao: string;
  if (classificacao === 'alto') {
    descricao = `Ganho expressivo! Cada +0.1 na média = ${ganhoPorcentual.toFixed(1)}% de margem`;
  } else if (classificacao === 'medio') {
    descricao = `Cada +0.1 na média = ${ganhoPorcentual.toFixed(1)}% de ganho de margem`;
  } else {
    descricao = `Ganho incremental de ${ganhoPorcentual.toFixed(2)}% por +0.1 na média`;
  }
  
  return {
    ganhoPorcentual,
    faixaAtual,
    classificacao,
    descricao,
  };
}

/**
 * Gera tabela completa de ganhos de margem por faixa de média
 * Útil para mostrar ao gestor como o ganho diminui conforme a média aumenta
 */
export function gerarTabelaGanhosPorFaixa(
  ticketMedio: number,
  valorBase: number,
  incremento: number,
  semanas: number = SEMANAS_MES
): Array<{
  faixa: string;
  mediaInicio: number;
  mediaFim: number;
  ganhoMargem: number;
  margemInicio: number;
  margemFim: number;
}> {
  const faixas: Array<{
    faixa: string;
    mediaInicio: number;
    mediaFim: number;
    ganhoMargem: number;
    margemInicio: number;
    margemFim: number;
  }> = [];
  
  for (let media = 1.0; media < 3.0; media += 0.1) {
    const mediaInicio = Math.round(media * 10) / 10;
    const mediaFim = Math.round((media + 0.1) * 10) / 10;
    
    const custoInicio = calcularCustoPorAluno(mediaInicio, valorBase, incremento, semanas);
    const custoFim = calcularCustoPorAluno(mediaFim, valorBase, incremento, semanas);
    
    const margemInicio = 100 - (custoInicio / ticketMedio) * 100;
    const margemFim = 100 - (custoFim / ticketMedio) * 100;
    const ganhoMargem = margemFim - margemInicio;
    
    faixas.push({
      faixa: `${mediaInicio.toFixed(1)} → ${mediaFim.toFixed(1)}`,
      mediaInicio,
      mediaFim,
      ganhoMargem,
      margemInicio,
      margemFim,
    });
  }
  
  return faixas;
}

/**
 * Calcula o impacto financeiro completo de uma mudança de cenário
 * Usado para comparar diferentes configurações de base/incremento
 */
export function calcularImpactoCenario(
  totalAlunos: number,
  ticketMedio: number,
  mediaAtual: number,
  mediaMeta: number,
  valorBase: number,
  incremento: number,
  semanas: number = SEMANAS_MES
): {
  // Situação atual
  custoAlunoAtual: number;
  folhaAtual: number;
  percentualFolhaAtual: number;
  margemAtual: number;
  
  // Meta
  custoAlunoMeta: number;
  folhaMeta: number;
  percentualFolhaMeta: number;
  margemMeta: number;
  
  // Ganhos
  ganhoMargem: number;
  economiaMensal: number;
  economiaAnual: number;
  
  // Análise de ganho por faixa
  ganhoMedioPor01: number;
  ganhoMaximoPor01: number;
  ganhoMinimoPor01: number;
  
  // Contexto para IA
  contextoIA: string;
} {
  const mrrTotal = totalAlunos * ticketMedio;
  
  // Situação Atual
  const custoAlunoAtual = calcularCustoPorAluno(mediaAtual, valorBase, incremento, semanas);
  const folhaAtual = totalAlunos * custoAlunoAtual;
  const percentualFolhaAtual = (folhaAtual / mrrTotal) * 100;
  const margemAtual = 100 - percentualFolhaAtual;
  
  // Meta
  const custoAlunoMeta = calcularCustoPorAluno(mediaMeta, valorBase, incremento, semanas);
  const folhaMeta = totalAlunos * custoAlunoMeta;
  const percentualFolhaMeta = (folhaMeta / mrrTotal) * 100;
  const margemMeta = 100 - percentualFolhaMeta;
  
  // Ganhos
  const ganhoMargem = margemMeta - margemAtual;
  const economiaMensal = folhaAtual - folhaMeta;
  const economiaAnual = economiaMensal * 12;
  
  // Calcular ganhos por faixa entre atual e meta
  const faixas = gerarTabelaGanhosPorFaixa(ticketMedio, valorBase, incremento, semanas);
  const faixasRelevantes = faixas.filter(f => f.mediaInicio >= mediaAtual && f.mediaFim <= mediaMeta);
  
  const ganhos = faixasRelevantes.map(f => f.ganhoMargem);
  const ganhoMedioPor01 = ganhos.length > 0 ? ganhos.reduce((a, b) => a + b, 0) / ganhos.length : 0;
  const ganhoMaximoPor01 = ganhos.length > 0 ? Math.max(...ganhos) : 0;
  const ganhoMinimoPor01 = ganhos.length > 0 ? Math.min(...ganhos) : 0;
  
  // Contexto para IA
  const contextoIA = `
CENÁRIO DE ESCALONAMENTO:
- Valor Base (1 aluno): R$ ${valorBase}/hora-aula
- Incremento por aluno adicional: R$ ${incremento}
- Semanas/mês: ${semanas}

FÓRMULA DE CUSTO:
- Custo/Turma = (Base + (Média-1) × Incremento) × Semanas
- Custo/Aluno = Custo/Turma ÷ Média
- % Folha = (Custo/Aluno × Total Alunos) ÷ MRR × 100
- Margem = 100 - % Folha

IMPACTO DO CENÁRIO ATUAL:
- Média ${mediaAtual.toFixed(2)} → ${mediaMeta.toFixed(1)}
- Custo/Aluno: R$ ${custoAlunoAtual.toFixed(2)} → R$ ${custoAlunoMeta.toFixed(2)}
- % Folha: ${percentualFolhaAtual.toFixed(2)}% → ${percentualFolhaMeta.toFixed(2)}%
- Margem: ${margemAtual.toFixed(2)}% → ${margemMeta.toFixed(2)}%
- Ganho de Margem: +${ganhoMargem.toFixed(2)} pontos percentuais

ANÁLISE DE GANHO POR +0.1:
- Ganho médio por +0.1: ${ganhoMedioPor01.toFixed(2)}%
- Ganho máximo (faixas baixas): ${ganhoMaximoPor01.toFixed(2)}%
- Ganho mínimo (faixas altas): ${ganhoMinimoPor01.toFixed(2)}%

REGRA: O ganho é DECRESCENTE - maior nas faixas baixas (1.0→1.1 ≈ 2%), menor nas altas (2.9→3.0 ≈ 0.3%)
`.trim();
  
  return {
    custoAlunoAtual,
    folhaAtual,
    percentualFolhaAtual,
    margemAtual,
    custoAlunoMeta,
    folhaMeta,
    percentualFolhaMeta,
    margemMeta,
    ganhoMargem,
    economiaMensal,
    economiaAnual,
    ganhoMedioPor01,
    ganhoMaximoPor01,
    ganhoMinimoPor01,
    contextoIA,
  };
}

/**
 * Formata valor monetário em BRL
 */
export function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/**
 * Formata percentual
 */
export function formatarPercentual(valor: number, casas: number = 2): string {
  return `${valor.toFixed(casas)}%`;
}
