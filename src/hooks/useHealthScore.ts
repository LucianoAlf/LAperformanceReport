import { useMemo } from 'react';
import { DEFAULT_HEALTH_WEIGHTS, HealthWeightKey } from '@/components/App/Professores/HealthScoreConfig';

// Limites de média de alunos por turma baseado no tipo de curso
// Cursos individuais (bateria, violino) têm limite menor
// Cursos coletivos (canto, musicalização) podem ter mais alunos
export const CURSO_LIMITES_TURMA: Record<string, { min: number; max: number; ideal: number }> = {
  // Instrumentos individuais (limite baixo)
  'Bateria': { min: 1, max: 2, ideal: 1.5 },
  'Violino': { min: 1, max: 2, ideal: 1.5 },
  'Contrabaixo': { min: 1, max: 2, ideal: 1.5 },
  'Saxofone': { min: 1, max: 2, ideal: 1.5 },
  
  // Instrumentos semi-coletivos (limite médio)
  'Violão': { min: 1, max: 3, ideal: 2 },
  'Guitarra': { min: 1, max: 3, ideal: 2 },
  'Teclado': { min: 1, max: 3, ideal: 2 },
  'Piano': { min: 1, max: 2, ideal: 1.5 },
  'Ukulele': { min: 1, max: 4, ideal: 2.5 },
  
  // Cursos coletivos (limite alto)
  'Canto': { min: 1, max: 5, ideal: 3 },
  'Musicalização': { min: 2, max: 6, ideal: 4 },
  'Musicalização Infantil': { min: 2, max: 6, ideal: 4 },
  'Musicalização Preparatória': { min: 2, max: 5, ideal: 3.5 },
  'Teoria Musical': { min: 2, max: 8, ideal: 5 },
  
  // Padrão para cursos não mapeados
  'default': { min: 1, max: 3, ideal: 2 },
};

// Metas de referência para cada KPI (baseado na imagem de referência)
export const METAS_REFERENCIA = {
  mediaTurma: { min: 1.0, max: 2.0, critico: 1.3, atencao: 1.5 },
  retencao: { min: 60, max: 100, critico: 70, atencao: 95 },
  conversao: { min: 50, max: 100, critico: 70, atencao: 90 },
  nps: { min: 5, max: 10, critico: 7, atencao: 8.5 },
  presenca: { min: 60, max: 100, critico: 70, atencao: 80 },
  evasoes: { min: 0, max: 5, critico: 3, atencao: 1 }, // Inverso: menos é melhor
};

interface ProfessorKPIs {
  mediaTurma: number;
  retencao: number;
  conversao: number;
  nps: number | null;
  presenca: number;
  evasoes: number;
  cursos: string[]; // Lista de cursos do professor
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
 * Calcula o fator de ajuste baseado nos cursos do professor
 * Professores de cursos individuais (bateria) não são penalizados por ter menos alunos por turma
 */
function calcularFatorCurso(cursos: string[], mediaTurmaAtual: number): number {
  if (!cursos.length) return 50; // Neutro se não tem cursos
  
  // Pegar o limite médio dos cursos do professor
  let somaIdeal = 0;
  let somaMax = 0;
  
  cursos.forEach(curso => {
    const limites = CURSO_LIMITES_TURMA[curso] || CURSO_LIMITES_TURMA['default'];
    somaIdeal += limites.ideal;
    somaMax += limites.max;
  });
  
  const idealMedio = somaIdeal / cursos.length;
  const maxMedio = somaMax / cursos.length;
  
  // Se a média atual está próxima ou acima do ideal para os cursos, score alto
  if (mediaTurmaAtual >= idealMedio) {
    return 100;
  }
  
  // Normalizar baseado no limite do curso
  return normalizar(mediaTurmaAtual, 1, maxMedio);
}

/**
 * Hook para calcular o Health Score de um professor
 */
export function useHealthScore(
  kpis: ProfessorKPIs,
  weights: typeof DEFAULT_HEALTH_WEIGHTS = DEFAULT_HEALTH_WEIGHTS
): HealthScoreResult {
  return useMemo(() => {
    const detalhes: HealthScoreResult['detalhes'] = [];
    
    // 1. Score do Curso (fator de ajuste)
    const scoreCurso = calcularFatorCurso(kpis.cursos, kpis.mediaTurma);
    detalhes.push({
      kpi: 'Curso',
      valor: kpis.cursos.length,
      scoreNormalizado: scoreCurso,
      peso: weights.curso / 100,
      contribuicao: scoreCurso * (weights.curso / 100)
    });
    
    // 2. Score da Média/Turma
    const scoreMT = normalizar(
      kpis.mediaTurma, 
      METAS_REFERENCIA.mediaTurma.min, 
      METAS_REFERENCIA.mediaTurma.max
    );
    detalhes.push({
      kpi: 'Média/Turma',
      valor: kpis.mediaTurma,
      scoreNormalizado: scoreMT,
      peso: weights.mediaTurma / 100,
      contribuicao: scoreMT * (weights.mediaTurma / 100)
    });
    
    // 3. Score da Retenção
    const scoreRet = normalizar(
      kpis.retencao, 
      METAS_REFERENCIA.retencao.min, 
      METAS_REFERENCIA.retencao.max
    );
    detalhes.push({
      kpi: 'Retenção',
      valor: kpis.retencao,
      scoreNormalizado: scoreRet,
      peso: weights.retencao / 100,
      contribuicao: scoreRet * (weights.retencao / 100)
    });
    
    // 4. Score da Conversão
    const scoreConv = normalizar(
      kpis.conversao, 
      METAS_REFERENCIA.conversao.min, 
      METAS_REFERENCIA.conversao.max
    );
    detalhes.push({
      kpi: 'Conversão',
      valor: kpis.conversao,
      scoreNormalizado: scoreConv,
      peso: weights.conversao / 100,
      contribuicao: scoreConv * (weights.conversao / 100)
    });
    
    // 5. Score do NPS (se disponível)
    const npsValor = kpis.nps ?? 7.5; // Valor neutro se não tem NPS
    const scoreNPS = normalizar(
      npsValor, 
      METAS_REFERENCIA.nps.min, 
      METAS_REFERENCIA.nps.max
    );
    detalhes.push({
      kpi: 'NPS',
      valor: npsValor,
      scoreNormalizado: scoreNPS,
      peso: weights.nps / 100,
      contribuicao: scoreNPS * (weights.nps / 100)
    });
    
    // 6. Score da Presença
    const scorePres = normalizar(
      kpis.presenca, 
      METAS_REFERENCIA.presenca.min, 
      METAS_REFERENCIA.presenca.max
    );
    detalhes.push({
      kpi: 'Presença',
      valor: kpis.presenca,
      scoreNormalizado: scorePres,
      peso: weights.presenca / 100,
      contribuicao: scorePres * (weights.presenca / 100)
    });
    
    // 7. Score das Evasões (INVERSO: menos = melhor)
    const scoreEvasoes = normalizar(
      kpis.evasoes, 
      METAS_REFERENCIA.evasoes.min, 
      METAS_REFERENCIA.evasoes.max,
      true // Inverso
    );
    detalhes.push({
      kpi: 'Evasões',
      valor: kpis.evasoes,
      scoreNormalizado: scoreEvasoes,
      peso: weights.evasoes / 100,
      contribuicao: scoreEvasoes * (weights.evasoes / 100)
    });
    
    // Calcular score total
    const score = detalhes.reduce((sum, d) => sum + d.contribuicao, 0);
    
    // Determinar status
    let status: 'critico' | 'atencao' | 'saudavel' = 'saudavel';
    if (score < 50) {
      status = 'critico';
    } else if (score < 75) {
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
 * Função utilitária para calcular Health Score sem hook (para uso em loops)
 */
export function calcularHealthScore(
  kpis: ProfessorKPIs,
  weights: typeof DEFAULT_HEALTH_WEIGHTS = DEFAULT_HEALTH_WEIGHTS
): HealthScoreResult {
  const detalhes: HealthScoreResult['detalhes'] = [];
  
  // 1. Score do Curso (fator de ajuste)
  const scoreCurso = calcularFatorCurso(kpis.cursos, kpis.mediaTurma);
  detalhes.push({
    kpi: 'Curso',
    valor: kpis.cursos.length,
    scoreNormalizado: scoreCurso,
    peso: weights.curso / 100,
    contribuicao: scoreCurso * (weights.curso / 100)
  });
  
  // 2. Score da Média/Turma
  const scoreMT = normalizar(
    kpis.mediaTurma, 
    METAS_REFERENCIA.mediaTurma.min, 
    METAS_REFERENCIA.mediaTurma.max
  );
  detalhes.push({
    kpi: 'Média/Turma',
    valor: kpis.mediaTurma,
    scoreNormalizado: scoreMT,
    peso: weights.mediaTurma / 100,
    contribuicao: scoreMT * (weights.mediaTurma / 100)
  });
  
  // 3. Score da Retenção
  const scoreRet = normalizar(
    kpis.retencao, 
    METAS_REFERENCIA.retencao.min, 
    METAS_REFERENCIA.retencao.max
  );
  detalhes.push({
    kpi: 'Retenção',
    valor: kpis.retencao,
    scoreNormalizado: scoreRet,
    peso: weights.retencao / 100,
    contribuicao: scoreRet * (weights.retencao / 100)
  });
  
  // 4. Score da Conversão
  const scoreConv = normalizar(
    kpis.conversao, 
    METAS_REFERENCIA.conversao.min, 
    METAS_REFERENCIA.conversao.max
  );
  detalhes.push({
    kpi: 'Conversão',
    valor: kpis.conversao,
    scoreNormalizado: scoreConv,
    peso: weights.conversao / 100,
    contribuicao: scoreConv * (weights.conversao / 100)
  });
  
  // 5. Score do NPS
  const npsValor = kpis.nps ?? 7.5;
  const scoreNPS = normalizar(
    npsValor, 
    METAS_REFERENCIA.nps.min, 
    METAS_REFERENCIA.nps.max
  );
  detalhes.push({
    kpi: 'NPS',
    valor: npsValor,
    scoreNormalizado: scoreNPS,
    peso: weights.nps / 100,
    contribuicao: scoreNPS * (weights.nps / 100)
  });
  
  // 6. Score da Presença
  const scorePres = normalizar(
    kpis.presenca, 
    METAS_REFERENCIA.presenca.min, 
    METAS_REFERENCIA.presenca.max
  );
  detalhes.push({
    kpi: 'Presença',
    valor: kpis.presenca,
    scoreNormalizado: scorePres,
    peso: weights.presenca / 100,
    contribuicao: scorePres * (weights.presenca / 100)
  });
  
  // 7. Score das Evasões (INVERSO)
  const scoreEvasoes = normalizar(
    kpis.evasoes, 
    METAS_REFERENCIA.evasoes.min, 
    METAS_REFERENCIA.evasoes.max,
    true
  );
  detalhes.push({
    kpi: 'Evasões',
    valor: kpis.evasoes,
    scoreNormalizado: scoreEvasoes,
    peso: weights.evasoes / 100,
    contribuicao: scoreEvasoes * (weights.evasoes / 100)
  });
  
  // Calcular score total
  const score = detalhes.reduce((sum, d) => sum + d.contribuicao, 0);
  
  // Determinar status
  let status: 'critico' | 'atencao' | 'saudavel' = 'saudavel';
  if (score < 50) {
    status = 'critico';
  } else if (score < 75) {
    status = 'atencao';
  }
  
  return {
    score: Math.round(score * 10) / 10,
    status,
    detalhes
  };
}

export default useHealthScore;
