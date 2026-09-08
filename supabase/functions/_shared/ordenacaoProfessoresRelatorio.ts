export interface ProfessorComScoreVisivel {
  nome: string;
  score_comparavel?: number | null;
  score_observado?: number | null;
  cobertura?: number | null;
  pilares_validos?: number | null;
  comparabilidade_estado?: 'comparavel' | 'em_maturacao' | 'sem_base_operacional' | null;
}

function numeroOuNull(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

export function scoreVisivelProfessor(
  professor: ProfessorComScoreVisivel,
): number | null {
  if (professor.comparabilidade_estado === 'comparavel') {
    return numeroOuNull(professor.score_comparavel);
  }
  if (professor.comparabilidade_estado === 'em_maturacao') {
    return numeroOuNull(professor.score_observado);
  }
  return null;
}

export function ordenarProfessoresPorScoreVisivel<T extends ProfessorComScoreVisivel>(
  professores: readonly T[],
): T[] {
  return [...professores].sort((a, b) => {
    const ordemEstado = {
      comparavel: 0,
      em_maturacao: 1,
      sem_base_operacional: 2,
    } as const;
    const estadoA = a.comparabilidade_estado ?? 'sem_base_operacional';
    const estadoB = b.comparabilidade_estado ?? 'sem_base_operacional';
    if (ordemEstado[estadoA] !== ordemEstado[estadoB]) {
      return ordemEstado[estadoA] - ordemEstado[estadoB];
    }

    if (estadoA === 'comparavel') {
      const scoreA = numeroOuNull(a.score_comparavel) ?? Number.NEGATIVE_INFINITY;
      const scoreB = numeroOuNull(b.score_comparavel) ?? Number.NEGATIVE_INFINITY;
      if (scoreA !== scoreB) return scoreB - scoreA;
    }
    if (estadoA === 'em_maturacao') {
      const coberturaA = numeroOuNull(a.cobertura) ?? 0;
      const coberturaB = numeroOuNull(b.cobertura) ?? 0;
      if (coberturaA !== coberturaB) return coberturaB - coberturaA;
      const pilaresA = numeroOuNull(a.pilares_validos) ?? 0;
      const pilaresB = numeroOuNull(b.pilares_validos) ?? 0;
      if (pilaresA !== pilaresB) return pilaresB - pilaresA;
    }
    return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });
  });
}
