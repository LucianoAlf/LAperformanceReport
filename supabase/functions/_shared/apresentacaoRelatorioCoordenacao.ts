export interface ContextoOperacionalRelatorio {
  periodicidade: 'mensal' | 'ciclo';
  contextoOperacional?: string | null;
  cicloOficial: boolean;
  competenciaEmAndamento: boolean;
  contextoPeriodo: string;
}

interface ProfessorComEstadoComparabilidade {
  comparabilidade_estado?: string | null;
}

interface ContagemProfessoresSemDados {
  resumoSemBaseOperacional?: unknown;
  qualidadeProfessoresSemFonte?: unknown;
  professores: readonly ProfessorComEstadoComparabilidade[];
}

function inteiroNaoNegativoOuNull(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0) return null;
  return Math.trunc(numero);
}

export function descreverContextoOperacionalRelatorio({
  periodicidade,
  contextoOperacional,
  cicloOficial,
  competenciaEmAndamento,
  contextoPeriodo,
}: ContextoOperacionalRelatorio): string {
  if (contextoOperacional === 'recesso_parcial') {
    const recesso = 'Julho teve recesso parcial. A ausência de aulas elegíveis não penaliza o professor.';
    if (periodicidade === 'ciclo') {
      const publicacao = cicloOficial
        ? 'O ciclo está oficialmente fechado; ranking e premiação seguem o retrato oficial do painel.'
        : 'O ciclo permanece em acompanhamento; ranking e premiação ainda não são oficiais.';
      return `${contextoPeriodo} ${recesso} ${publicacao}`;
    }
    return `${contextoPeriodo} ${recesso}`;
  }

  return competenciaEmAndamento
    ? `${contextoPeriodo} As notas acompanham as evidências já registradas e evoluem com a operação.`
    : `${contextoPeriodo} Cada indicador respeita sua evidência disponível.`;
}

export function contarProfessoresSemDadosOficiais({
  resumoSemBaseOperacional,
  qualidadeProfessoresSemFonte,
  professores,
}: ContagemProfessoresSemDados): number {
  const resumo = inteiroNaoNegativoOuNull(resumoSemBaseOperacional);
  if (resumo !== null) return resumo;

  const qualidade = inteiroNaoNegativoOuNull(qualidadeProfessoresSemFonte);
  if (qualidade !== null) return qualidade;

  return professores.filter(
    (professor) => professor.comparabilidade_estado === 'sem_base_operacional',
  ).length;
}
