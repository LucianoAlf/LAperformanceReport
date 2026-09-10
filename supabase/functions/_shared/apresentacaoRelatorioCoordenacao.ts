export interface ContextoOperacionalRelatorio {
  periodicidade: 'mensal' | 'ciclo';
  contextoOperacional?: string | null;
  cicloOficial: boolean;
  competenciaEmAndamento: boolean;
  contextoPeriodo: string;
}

// Carteiras no ciclo são médias de vínculos: preservar as frações nos cinco relatórios.
export function formatarQuantidadeCarteira(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return 'Não informado';
  const quantidade = Number(valor);
  return Number.isFinite(quantidade)
    ? quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
    : 'Não informado';
}

// O clique gera texto; não recaptura os dados do documento compartilhado.
export function linhasAtualizacaoRelatorio(dataCorte?: string | null, atualizadoEm?: string | null): string[] {
  const corteIso = String(dataCorte ?? '').slice(0, 10);
  const corte = /^\d{4}-\d{2}-\d{2}$/.test(corteIso)
    && Number.isFinite(Date.parse(`${corteIso}T00:00:00Z`))
    && new Date(`${corteIso}T00:00:00Z`).toISOString().slice(0, 10) === corteIso
    ? corteIso.split('-').reverse().join('/') : 'não informado';
  const timestamp = String(atualizadoEm ?? '');
  const dataTimestamp = timestamp.slice(0, 10);
  const formatoValido = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp);
  const diaValido = formatoValido && Number.isFinite(Date.parse(`${dataTimestamp}T00:00:00Z`))
    && new Date(`${dataTimestamp}T00:00:00Z`).toISOString().slice(0, 10) === dataTimestamp;
  const atualizado = diaValido ? new Date(timestamp) : null;
  const hora = atualizado && Number.isFinite(atualizado.getTime())
    ? `${atualizado.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit',
      year: 'numeric', hour: '2-digit', minute: '2-digit',
    })} (Brasília)` : 'não informada';
  return [`🗓 Dados considerados até: ${corte}`, `🕒 Atualização do documento: ${hora}`];
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
