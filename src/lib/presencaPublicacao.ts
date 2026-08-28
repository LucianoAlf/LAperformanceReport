export type EstadoPublicacaoCanonica = 'em_auditoria' | 'publicado';

export interface OcorrenciaPublicavel {
  status: string;
  estado_publicacao: string | null | undefined;
}

export interface AvaliacaoPublicacaoOcorrencias {
  denominador: number | null;
  estado_publicacao: EstadoPublicacaoCanonica;
}

/**
 * Avalia a publicacao sobre o universo completo retornado pelo produtor.
 * Uma unica linha incerta bloqueia o denominador e a publicacao do conjunto.
 */
export function avaliarPublicacaoOcorrencias(
  linhas: readonly OcorrenciaPublicavel[],
  publicacaoBloqueada = false,
): AvaliacaoPublicacaoOcorrencias {
  const universoCompleto = linhas.length > 0
    && linhas.every((linha) =>
      linha.status !== 'em_auditoria'
      && linha.estado_publicacao === 'publicado');

  if (publicacaoBloqueada || !universoCompleto) {
    return {
      denominador: null,
      estado_publicacao: 'em_auditoria',
    };
  }

  return {
    denominador: linhas.length,
    estado_publicacao: 'publicado',
  };
}

/** Linhas incertas ficam no estado para governanca, mas nao entram na grade. */
export function filtrarOcorrenciasConfirmadas<T extends OcorrenciaPublicavel>(
  linhas: readonly T[],
): T[] {
  return linhas.filter((linha) => linha.status !== 'em_auditoria');
}

export function criarPublicacaoFaltasEmAuditoria(
  periodoInicio: string,
  periodoFim: string,
) {
  return {
    denominador: null,
    fonte: 'get_faltas_periodo_v2',
    periodo_inicio: periodoInicio,
    periodo_fim: periodoFim,
    regra_versao: 'faltas-periodo-v2.1',
    estado_publicacao: 'em_auditoria' as const,
  };
}
