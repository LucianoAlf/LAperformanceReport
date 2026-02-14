import { useMemo } from 'react';
import { DEFAULT_HEALTH_WEIGHTS, HealthWeightKey } from '@/components/App/Professores/HealthScoreConfig';

// ============================================================================
// HEALTH SCORE V2 - Especificação Técnica
// ============================================================================
// Fatores e Pesos:
// - Taxa de Crescimento: 15% (com fator de demanda ponderado)
// - Média/Turma: 20%
// - Retenção: 25%
// - Conversão: 15%
// - Presença: 15%
// - Evasões: 10% (inverso)
// 
// Classificação:
// - Saudável: ≥ 70
// - Atenção: 50 - 69
// - Crítico: < 50
// ============================================================================

// Metas de referência para cada KPI
export const METAS_REFERENCIA = {
  taxaCrescimento: { min: -10, max: 20 }, // -10% → 0 pontos, +20% → 100 pontos
  mediaTurma: { min: 0, max: 2.0, meta: 2.0 }, // Meta ajustada para escola de música (aulas individuais são comuns)
  retencao: { min: 0, max: 100 }, // 0-100%
  conversao: { min: 0, max: 100 }, // 0-100%
  presenca: { min: 0, max: 100 }, // 0-100%
  evasoes: { min: 0, max: 10 }, // Taxa de evasão em %
};

// Limites de classificação do Health Score
export const LIMITES_HEALTH_SCORE = {
  saudavel: 70, // ≥ 70
  atencao: 50,  // 50 - 69
  // < 50 = crítico
};

// Interface para os KPIs do professor (V2)
interface ProfessorKPIsV2 {
  // Taxa de Crescimento (15%)
  taxaCrescimentoAjustada: number; // Já com fator de demanda aplicado
  
  // Média/Turma (20%)
  mediaTurma: number;
  
  // Retenção (25%) - default 100% se não houver dados
  retencao: number;
  
  // Conversão (15%)
  conversao: number;
  
  // Presença (15%)
  presenca: number;
  
  // Evasões (10%) - taxa de evasão em %
  taxaEvasao: number;
  
  // Carteira de alunos (para cálculo de evasões)
  carteiraAlunos: number;
  evasoes: number;
}

// Interface para KPIs do professor (V2 com compatibilidade legada)
interface ProfessorKPIs {
  mediaTurma: number;
  retencao: number;
  conversao: number;
  presenca: number;
  evasoes: number;
  // Campos V2
  taxaCrescimentoAjustada?: number;
  taxaEvasao?: number;
  carteiraAlunos?: number;
  // Campo 360° (novo)
  nota360?: number | null;
  // Campos legados (opcionais, não usados no V2)
  nps?: number | null;
  cursos?: string[];
}

interface HealthScoreResult {
  score: number;
  status: 'critico' | 'atencao' | 'saudavel';
  detalhes: {
    kpi: string;
    valor: number;
    scoreNormalizado: number;
    peso: number;
    contribuicao: number;
  }[];
}

/**
 * Normaliza um valor para uma escala de 0-100
 * @param valor - Valor atual
 * @param min - Valor mínimo da escala
 * @param max - Valor máximo da escala
 * @param inverso - Se true, inverte a escala (menos = melhor)
 */
function normalizar(valor: number, min: number, max: number, inverso = false): number {
  const normalizado = Math.max(0, Math.min(100, ((valor - min) / (max - min)) * 100));
  return inverso ? 100 - normalizado : normalizado;
}

/**
 * Calcula pontos da Taxa de Crescimento (V2)
 * Fórmula: ((taxa_ajustada + 10) / 30) * 100, limitado entre 0 e 100
 * -10% → 0 pontos | +20% → 100 pontos
 */
function calcularPontosCrescimento(taxaCrescimentoAjustada: number): number {
  return Math.max(0, Math.min(100, ((taxaCrescimentoAjustada + 10) / 30) * 100));
}

/**
 * Calcula pontos da Média/Turma (V2)
 * Fórmula: (media_alunos_turma / META_MEDIA_TURMA) * 100, limitado a 100
 */
function calcularPontosMediaTurma(mediaTurma: number, meta: number = 3.0): number {
  return Math.min(100, (mediaTurma / meta) * 100);
}

/**
 * Calcula pontos de Evasões (V2) - INVERSO
 * Fórmula: 100 - (taxa_evasao * 10), mínimo 0
 */
function calcularPontosEvasoes(taxaEvasao: number): number {
  return Math.max(0, 100 - (taxaEvasao * 10));
}

/**
 * Hook para calcular o Health Score de um professor (V2)
 * 
 * Fatores e Pesos:
 * - Taxa de Crescimento: 15% (com fator de demanda ponderado)
 * - Média/Turma: 20%
 * - Retenção: 25%
 * - Conversão: 15%
 * - Presença: 15%
 * - Evasões: 10% (inverso)
 */
export function useHealthScore(
  kpis: ProfessorKPIs,
  weights: typeof DEFAULT_HEALTH_WEIGHTS = DEFAULT_HEALTH_WEIGHTS
): HealthScoreResult {
  return useMemo(() => {
    const detalhes: HealthScoreResult['detalhes'] = [];
    
    // 1. Taxa de Crescimento (15%) - NOVO no V2
    const taxaCrescimento = kpis.taxaCrescimentoAjustada ?? 0;
    const scoreCrescimento = calcularPontosCrescimento(taxaCrescimento);
    detalhes.push({
      kpi: 'Taxa Crescimento',
      valor: taxaCrescimento,
      scoreNormalizado: scoreCrescimento,
      peso: weights.taxaCrescimento / 100,
      contribuicao: scoreCrescimento * (weights.taxaCrescimento / 100)
    });
    
    // 2. Média/Turma (20%)
    const mediaTurma = kpis.mediaTurma || 2.0; // Default 2.0 se não tiver dados
    const scoreMT = calcularPontosMediaTurma(mediaTurma, METAS_REFERENCIA.mediaTurma.meta);
    detalhes.push({
      kpi: 'Média/Turma',
      valor: mediaTurma,
      scoreNormalizado: scoreMT,
      peso: weights.mediaTurma / 100,
      contribuicao: scoreMT * (weights.mediaTurma / 100)
    });
    
    // 3. Retenção (25%) - Default 100% se não houver dados
    const retencao = kpis.retencao || 100;
    const scoreRet = retencao; // Já é 0-100
    detalhes.push({
      kpi: 'Retenção',
      valor: retencao,
      scoreNormalizado: scoreRet,
      peso: weights.retencao / 100,
      contribuicao: scoreRet * (weights.retencao / 100)
    });
    
    // 4. Conversão (15%)
    const conversao = kpis.conversao || 0;
    const scoreConv = Math.min(100, conversao); // Já é 0-100
    detalhes.push({
      kpi: 'Conversão',
      valor: conversao,
      scoreNormalizado: scoreConv,
      peso: weights.conversao / 100,
      contribuicao: scoreConv * (weights.conversao / 100)
    });
    
    // 5. Presença (15%)
    const presenca = kpis.presenca || 75; // Default 75% se não tiver dados
    const scorePres = presenca; // Já é 0-100
    detalhes.push({
      kpi: 'Presença',
      valor: presenca,
      scoreNormalizado: scorePres,
      peso: weights.presenca / 100,
      contribuicao: scorePres * (weights.presenca / 100)
    });
    
    // 6. Evasões - INVERSO
    // Calcular taxa de evasão se não vier pronta
    const taxaEvasao = kpis.taxaEvasao ?? 
      (kpis.carteiraAlunos && kpis.carteiraAlunos > 0 
        ? (kpis.evasoes / kpis.carteiraAlunos) * 100 
        : 0);
    const scoreEvasoes = calcularPontosEvasoes(taxaEvasao);
    detalhes.push({
      kpi: 'Evasões',
      valor: taxaEvasao,
      scoreNormalizado: scoreEvasoes,
      peso: weights.evasoes / 100,
      contribuicao: scoreEvasoes * (weights.evasoes / 100)
    });
    
    // 7. Professor 360° (se configurado e disponível)
    const w = weights as Record<string, number>;
    if (w.professor360 && w.professor360 > 0) {
      const nota360 = kpis.nota360 ?? 100; // Default 100 se não avaliado
      detalhes.push({
        kpi: 'Professor 360°',
        valor: nota360,
        scoreNormalizado: nota360,
        peso: w.professor360 / 100,
        contribuicao: nota360 * (w.professor360 / 100)
      });
    }
    
    // Calcular score total
    const score = detalhes.reduce((sum, d) => sum + d.contribuicao, 0);
    
    // Determinar status (V2: 70/50)
    let status: 'critico' | 'atencao' | 'saudavel' = 'saudavel';
    if (score < LIMITES_HEALTH_SCORE.atencao) {
      status = 'critico';
    } else if (score < LIMITES_HEALTH_SCORE.saudavel) {
      status = 'atencao';
    }
    
    return {
      score: Math.round(score * 10) / 10,
      status,
      detalhes
    };
  }, [kpis, weights]);
}

/**
 * Função utilitária para calcular Health Score sem hook (para uso em loops) - V2
 */
export function calcularHealthScore(
  kpis: ProfessorKPIs,
  weights: typeof DEFAULT_HEALTH_WEIGHTS = DEFAULT_HEALTH_WEIGHTS
): HealthScoreResult {
  const detalhes: HealthScoreResult['detalhes'] = [];
  
  // 1. Taxa de Crescimento (15%) - NOVO no V2
  const taxaCrescimento = kpis.taxaCrescimentoAjustada ?? 0;
  const scoreCrescimento = calcularPontosCrescimento(taxaCrescimento);
  detalhes.push({
    kpi: 'Taxa Crescimento',
    valor: taxaCrescimento,
    scoreNormalizado: scoreCrescimento,
    peso: weights.taxaCrescimento / 100,
    contribuicao: scoreCrescimento * (weights.taxaCrescimento / 100)
  });
  
  // 2. Média/Turma (20%)
  const mediaTurma = kpis.mediaTurma || 2.0;
  const scoreMT = calcularPontosMediaTurma(mediaTurma, METAS_REFERENCIA.mediaTurma.meta);
  detalhes.push({
    kpi: 'Média/Turma',
    valor: mediaTurma,
    scoreNormalizado: scoreMT,
    peso: weights.mediaTurma / 100,
    contribuicao: scoreMT * (weights.mediaTurma / 100)
  });
  
  // 3. Retenção (25%) - Default 100% se não houver dados
  const retencao = kpis.retencao || 100;
  const scoreRet = retencao;
  detalhes.push({
    kpi: 'Retenção',
    valor: retencao,
    scoreNormalizado: scoreRet,
    peso: weights.retencao / 100,
    contribuicao: scoreRet * (weights.retencao / 100)
  });
  
  // 4. Conversão (15%)
  const conversao = kpis.conversao || 0;
  const scoreConv = Math.min(100, conversao);
  detalhes.push({
    kpi: 'Conversão',
    valor: conversao,
    scoreNormalizado: scoreConv,
    peso: weights.conversao / 100,
    contribuicao: scoreConv * (weights.conversao / 100)
  });
  
  // 5. Presença (15%)
  const presenca = kpis.presenca || 75;
  const scorePres = presenca;
  detalhes.push({
    kpi: 'Presença',
    valor: presenca,
    scoreNormalizado: scorePres,
    peso: weights.presenca / 100,
    contribuicao: scorePres * (weights.presenca / 100)
  });
  
  // 6. Evasões - INVERSO
  const taxaEvasao = kpis.taxaEvasao ?? 
    (kpis.carteiraAlunos && kpis.carteiraAlunos > 0 
      ? (kpis.evasoes / kpis.carteiraAlunos) * 100 
      : 0);
  const scoreEvasoes = calcularPontosEvasoes(taxaEvasao);
  detalhes.push({
    kpi: 'Evasões',
    valor: taxaEvasao,
    scoreNormalizado: scoreEvasoes,
    peso: weights.evasoes / 100,
    contribuicao: scoreEvasoes * (weights.evasoes / 100)
  });
  
  // 7. Professor 360° (se configurado e disponível)
  const w2 = weights as Record<string, number>;
  if (w2.professor360 && w2.professor360 > 0) {
    const nota360 = kpis.nota360 ?? 100; // Default 100 se não avaliado
    detalhes.push({
      kpi: 'Professor 360°',
      valor: nota360,
      scoreNormalizado: nota360,
      peso: w2.professor360 / 100,
      contribuicao: nota360 * (w2.professor360 / 100)
    });
  }
  
  // Calcular score total
  const score = detalhes.reduce((sum, d) => sum + d.contribuicao, 0);
  
  // Determinar status (V2: 70/50)
  let status: 'critico' | 'atencao' | 'saudavel' = 'saudavel';
  if (score < LIMITES_HEALTH_SCORE.atencao) {
    status = 'critico';
  } else if (score < LIMITES_HEALTH_SCORE.saudavel) {
    status = 'atencao';
  }
  
  return {
    score: Math.round(score * 10) / 10,
    status,
    detalhes
  };
}

// Exportar tipos e constantes úteis
export type { ProfessorKPIs, ProfessorKPIsV2, HealthScoreResult };
export { calcularPontosCrescimento, calcularPontosMediaTurma, calcularPontosEvasoes };

export default useHealthScore;
