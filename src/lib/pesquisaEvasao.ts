// Analise das respostas da pesquisa de evasao. Sem React, sem Supabase.
//
// ⚠️ Esta pesquisa NAO tem nota. A resposta e texto livre ou audio, entao nada
// aqui calcula media — a analise e de TEMA. A pergunta que ela responde e outra:
// o motivo que a escola registrou bate com o que a pessoa declarou?
// Isso importa porque 3 dos 16 `motivos_saida` penalizam o professor no score.

/** Temas do que a pessoa declarou. Conjunto fechado, espelhado na RPC `classificar_resposta_evasao`. */
export const TEMAS_EVASAO = [
  'financeiro',
  'horario',
  'professor_metodo',
  'mudanca',
  'saude',
  'sem_motivo_claro',
  'outro',
] as const;

export type TemaEvasao = (typeof TEMAS_EVASAO)[number];

const ROTULOS: Record<TemaEvasao, string> = {
  financeiro: 'Financeiro',
  horario: 'Horário / tempo',
  professor_metodo: 'Professor / método',
  mudanca: 'Mudança',
  saude: 'Saúde',
  sem_motivo_claro: 'Sem motivo claro',
  outro: 'Outro',
};

export function rotuloTema(tema: string): string {
  return ROTULOS[tema as TemaEvasao] ?? tema;
}

export function ehTemaValido(valor: string | null): valor is TemaEvasao {
  return valor !== null && (TEMAS_EVASAO as readonly string[]).includes(valor);
}

/**
 * Traducao do catalogo `motivos_saida` para os temas acima.
 *
 * Por NOME e nao por `categoria`: a categoria e furada para este fim — "Saúde"
 * e "Problema de Saúde" tem categoria NULL, e "Insatisfação"/"Desânimo" caem em
 * 'outro' junto com "Problemas familiares". Sem essa traducao nao ha como dizer
 * se a resposta confirmou ou contrariou o registro.
 *
 * ⚠️ `professor_metodo` nao existe como categoria no catalogo — ele so aparece
 * escondido dentro de 'outro'. Essa e exatamente a lacuna que a pesquisa
 * enxerga e o registro nao.
 */
const TEMA_POR_MOTIVO: Record<string, TemaEvasao> = {
  'FALTA DE TEMPO': 'horario',
  'INCOMPATIBILIDADE DE HORÁRIO': 'horario',
  'PRIORIZAR ESTUDOS REGULARES': 'horario',
  'DIFICULDADE FINANCEIRA': 'financeiro',
  'INADIMPLÊNCIA': 'financeiro',
  'ENCONTROU ESCOLA MAIS ACESSÍVEL': 'financeiro',
  'MUDANÇA DE ENDEREÇO': 'mudanca',
  'SAÚDE': 'saude',
  'PROBLEMA DE SAÚDE': 'saude',
  'INSATISFAÇÃO': 'professor_metodo',
  'DESÂNIMO': 'professor_metodo',
  'DESISTÊNCIA': 'sem_motivo_claro',
  'SEM RETORNO APÓS CONTATO': 'sem_motivo_claro',
  'PROBLEMAS FAMILIARES': 'outro',
  'OUTRO': 'outro',
  'TRANSFERÊNCIA INTERNA': 'outro',
};

/** Tema equivalente ao motivo registrado pela escola. null = motivo fora do catalogo. */
export function temaDoMotivoRegistrado(motivo: string | null): TemaEvasao | null {
  if (!motivo) return null;
  return TEMA_POR_MOTIVO[motivo.trim().toUpperCase()] ?? null;
}

export type RespostaEvasao = {
  pesquisa_id: string;
  motivo_cadastrado: string | null;
  categoria_resposta: string | null;
};

/**
 * Concordancia entre o registrado e o declarado.
 * `null` quando ainda nao ha o que comparar — resposta sem tema marcado ou
 * motivo fora do catalogo. Nao chutar aqui: um "confirma" errado vira
 * percentual numa reuniao.
 */
export function respostaConfirmaMotivo(resposta: RespostaEvasao): boolean | null {
  if (!ehTemaValido(resposta.categoria_resposta)) return null;
  const esperado = temaDoMotivoRegistrado(resposta.motivo_cadastrado);
  if (esperado === null) return null;
  return esperado === resposta.categoria_resposta;
}

// A partir de 5 respostas classificadas o painel de divergencia aparece; abaixo
// disso ele nem e desenhado. Ate 29 vem com aviso de leitura indicativa: com 8
// respostas, uma classificacao trocada move o percentual em 12,5 pontos.
export const MIN_RESPOSTAS_PAINEL = 5;
export const MIN_RESPOSTAS_SEM_AVISO = 30;

export function nivelDeConfianca(classificadas: number): 'insuficiente' | 'indicativo' | 'estavel' {
  if (classificadas < MIN_RESPOSTAS_PAINEL) return 'insuficiente';
  if (classificadas < MIN_RESPOSTAS_SEM_AVISO) return 'indicativo';
  return 'estavel';
}

export interface ResumoEvasao {
  total: number;
  classificadas: number;
  comparaveis: number;
  confirmadas: number;
  divergentes: number;
  /** Respostas que apontaram professor/metodo — o tema que o catalogo esconde. */
  citamProfessor: number;
  /** Dessas, quantas NAO estavam registradas como insatisfacao/desanimo. */
  citamProfessorNaoRegistrado: number;
  percentualConfirmado: number | null;
}

export function resumirRespostas(respostas: RespostaEvasao[]): ResumoEvasao {
  let classificadas = 0;
  let comparaveis = 0;
  let confirmadas = 0;
  let citamProfessor = 0;
  let citamProfessorNaoRegistrado = 0;

  for (const r of respostas) {
    if (!ehTemaValido(r.categoria_resposta)) continue;
    classificadas++;

    if (r.categoria_resposta === 'professor_metodo') {
      citamProfessor++;
      if (temaDoMotivoRegistrado(r.motivo_cadastrado) !== 'professor_metodo') {
        citamProfessorNaoRegistrado++;
      }
    }

    const confirma = respostaConfirmaMotivo(r);
    if (confirma === null) continue;
    comparaveis++;
    if (confirma) confirmadas++;
  }

  return {
    total: respostas.length,
    classificadas,
    comparaveis,
    confirmadas,
    divergentes: comparaveis - confirmadas,
    citamProfessor,
    citamProfessorNaoRegistrado,
    // Denominador e `comparaveis`, nao `total`: dividir pelo total trataria
    // "ainda nao classificado" como "nao confirmou".
    percentualConfirmado: comparaveis === 0 ? null : Math.round((confirmadas / comparaveis) * 100),
  };
}

export interface LinhaDivergencia {
  motivo: string;
  total: number;
  /** Temas declarados, o que confirma primeiro e o resto por frequencia. */
  temas: Array<{ tema: TemaEvasao; qtd: number; confirma: boolean }>;
}

/** Uma linha por motivo registrado, com a quebra do que as pessoas declararam. */
export function agregarDivergencia(respostas: RespostaEvasao[]): LinhaDivergencia[] {
  const porMotivo = new Map<string, Map<TemaEvasao, number>>();

  for (const r of respostas) {
    if (!ehTemaValido(r.categoria_resposta)) continue;
    if (temaDoMotivoRegistrado(r.motivo_cadastrado) === null) continue;

    const motivo = (r.motivo_cadastrado as string).trim();
    const temas = porMotivo.get(motivo) ?? new Map<TemaEvasao, number>();
    temas.set(r.categoria_resposta, (temas.get(r.categoria_resposta) ?? 0) + 1);
    porMotivo.set(motivo, temas);
  }

  return [...porMotivo.entries()]
    .map(([motivo, temas]) => {
      const esperado = temaDoMotivoRegistrado(motivo);
      return {
        motivo,
        total: [...temas.values()].reduce((s, n) => s + n, 0),
        temas: [...temas.entries()]
          .map(([tema, qtd]) => ({ tema, qtd, confirma: tema === esperado }))
          .sort((a, b) => Number(b.confirma) - Number(a.confirma) || b.qtd - a.qtd),
      };
    })
    .sort((a, b) => b.total - a.total || a.motivo.localeCompare(b.motivo, 'pt-BR'));
}

export interface BlocoResposta {
  quando: string | null;
  tipo: string | null;
  texto: string;
}

/**
 * A resposta chega concatenada do log de mensagens, com cabecalho por bloco:
 * `[2026-08-03T14:41:28.000Z | texto]\nconteudo`. Exibir cru mostra ISO 8601 e
 * colchetes na cara do usuario; jogar fora o cabecalho perde a hora e o fato de
 * ser audio. Por isso separa em vez de limpar.
 *
 * Texto sem marcador nenhum (resposta consolidada pela revisao) volta como um
 * bloco unico sem metadados.
 */
export function separarBlocosResposta(bruto: string | null): BlocoResposta[] {
  const inteiro = (bruto ?? '').trim();
  if (inteiro === '') return [];

  const marcador = /\[([^\]|]+)\|([^\]]+)\]\s*\n?/g;
  const blocos: BlocoResposta[] = [];
  let ultimoFim = 0;
  let cabecalho: { quando: string; tipo: string } | null = null;
  let achado: RegExpExecArray | null;

  while ((achado = marcador.exec(inteiro)) !== null) {
    const anterior = inteiro.slice(ultimoFim, achado.index).trim();
    if (anterior !== '') {
      blocos.push({
        quando: cabecalho?.quando ?? null,
        tipo: cabecalho?.tipo ?? null,
        texto: anterior,
      });
    }
    cabecalho = { quando: achado[1].trim(), tipo: achado[2].trim() };
    ultimoFim = marcador.lastIndex;
  }

  const resto = inteiro.slice(ultimoFim).trim();
  if (resto !== '') {
    blocos.push({ quando: cabecalho?.quando ?? null, tipo: cabecalho?.tipo ?? null, texto: resto });
  }

  return blocos;
}
