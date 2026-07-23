export interface KPIProfessorVinculoAtivo {
  professor_id: number;
  unidade_id: string | null;
}

export interface KPIProfessorPresencaConfirmada {
  presenca_publicavel: boolean;
  media_presenca: number | null;
  presenca_eventos_confirmados: number;
}

export function chaveProfessorUnidade(
  professorId: number,
  unidadeId: string | null,
): string | null {
  return unidadeId ? `${professorId}:${unidadeId}` : null;
}

export function filtrarKpisPorVinculosAtivos<T extends KPIProfessorVinculoAtivo>(
  linhas: T[],
  professoresAtivos: ReadonlySet<number>,
  vinculosAtivos: ReadonlySet<string>,
): T[] {
  return linhas.filter((linha) => {
    const chave = chaveProfessorUnidade(linha.professor_id, linha.unidade_id);
    return professoresAtivos.has(linha.professor_id)
      && chave !== null
      && vinculosAtivos.has(chave);
  });
}

export function calcularPresencaMediaConfirmada(
  linhas: KPIProfessorPresencaConfirmada[],
): number | null {
  const publicaveis = linhas.filter(
    (linha) => linha.presenca_publicavel
      && linha.media_presenca !== null
      && linha.presenca_eventos_confirmados > 0,
  );
  const totalEventos = publicaveis.reduce(
    (total, linha) => total + linha.presenca_eventos_confirmados,
    0,
  );

  if (totalEventos === 0) return null;

  return publicaveis.reduce(
    (total, linha) => total + Number(linha.media_presenca) * linha.presenca_eventos_confirmados,
    0,
  ) / totalEventos;
}
