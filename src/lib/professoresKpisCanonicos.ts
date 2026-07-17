import { supabase } from '@/lib/supabase';

export interface KPIProfessorCanonico {
  professor_id: number;
  professor_nome: string;
  unidade_id: string | null;
  ano: number;
  mes: number;
  carteira_alunos: number;
  ticket_medio: number;
  media_presenca: number | null;
  taxa_faltas: number | null;
  mrr_carteira: number;
  nps_medio: number;
  media_alunos_turma: number;
  experimentais: number;
  experimentais_agendadas: number;
  experimentais_faltas: number;
  matriculas: number;
  matriculas_pos_exp: number;
  matriculas_diretas: number;
  taxa_conversao: number;
  renovacoes: number;
  nao_renovacoes: number;
  taxa_renovacao: number;
  evasoes: number;
  mrr_perdido: number;
  taxa_cancelamento: number;
  total_turmas: number;
  alunos_via_turmas: number;
  turmas_elegiveis_media: number;
  presenca_publicavel: boolean;
  presenca_cobertura: number;
  presenca_confianca: string;
  presenca_eventos_confirmados: number;
  presenca_eventos_incertos: number;
  presenca_regra_versao: string;
  evasoes_validas: number;
  nao_renovacoes_validas: number;
  saidas_validas_total: number;
  saidas_score_professor: number;
  mrr_perdido_total: number;
  mrr_perdido_score: number;
  taxa_saidas_total: number;
  taxa_impacto_score: number;
  taxa_retencao_atribuivel: number;
  saidas_regra_versao: string;
  fator_demanda_ponderado: number | null;
  fator_demanda_publicavel: boolean;
  fator_demanda_cobertura: number;
  fator_demanda_fonte: string;
  fator_demanda_vinculos: number;
  fator_demanda_pessoas: number;
}

export interface FiltroKPIProfessorCanonico {
  ano: number;
  mes: number;
  unidadeId?: string | null;
  dataInicio?: string | null;
  dataFim?: string | null;
}

export interface TotaisKPIProfessorCanonico {
  totalProfessores: number;
  carteiraAlunos: number;
  mediaAlunosProfessor: number;
  totalTurmas: number;
  totalOcupacoes: number;
  totalTurmasElegiveis: number;
  mediaAlunosTurma: number;
  experimentais: number;
  matriculasPosExp: number;
  taxaConversao: number;
  renovacoes: number;
  naoRenovacoes: number;
  taxaRenovacao: number;
  evasoes: number;
  mrrPerdido: number;
}

const consultasEmAndamento = new Map<string, Promise<KPIProfessorCanonico[]>>();
const cacheConsultas = new Map<string, { dados: KPIProfessorCanonico[]; expiraEm: number }>();
const CACHE_CONSULTA_MS = 15_000;

const numero = (valor: unknown): number => {
  const convertido = Number(valor ?? 0);
  return Number.isFinite(convertido) ? convertido : 0;
};

const numeroOuNull = (valor: unknown): number | null => {
  if (valor === null || valor === undefined || valor === '') return null;
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : null;
};

export function normalizarKPIProfessorCanonico(row: Record<string, unknown>): KPIProfessorCanonico {
  return {
    professor_id: numero(row.professor_id),
    professor_nome: String(row.professor_nome ?? ''),
    unidade_id: row.unidade_id ? String(row.unidade_id) : null,
    ano: numero(row.ano),
    mes: numero(row.mes),
    carteira_alunos: numero(row.carteira_alunos),
    ticket_medio: numero(row.ticket_medio),
    media_presenca: numeroOuNull(row.media_presenca),
    taxa_faltas: numeroOuNull(row.taxa_faltas),
    mrr_carteira: numero(row.mrr_carteira),
    nps_medio: numero(row.nps_medio),
    media_alunos_turma: numero(row.media_alunos_turma),
    experimentais: numero(row.experimentais),
    experimentais_agendadas: numero(row.experimentais_agendadas),
    experimentais_faltas: numero(row.experimentais_faltas),
    matriculas: numero(row.matriculas),
    matriculas_pos_exp: numero(row.matriculas_pos_exp),
    matriculas_diretas: numero(row.matriculas_diretas),
    taxa_conversao: numero(row.taxa_conversao),
    renovacoes: numero(row.renovacoes),
    nao_renovacoes: numero(row.nao_renovacoes),
    taxa_renovacao: numero(row.taxa_renovacao),
    evasoes: numero(row.evasoes),
    mrr_perdido: numero(row.mrr_perdido),
    taxa_cancelamento: numero(row.taxa_cancelamento),
    total_turmas: numero(row.total_turmas),
    alunos_via_turmas: numero(row.alunos_via_turmas),
    turmas_elegiveis_media: numero(row.turmas_elegiveis_media),
    presenca_publicavel: row.presenca_publicavel === true,
    presenca_cobertura: numero(row.presenca_cobertura),
    presenca_confianca: String(row.presenca_confianca ?? 'sem_base'),
    presenca_eventos_confirmados: numero(row.presenca_eventos_confirmados),
    presenca_eventos_incertos: numero(row.presenca_eventos_incertos),
    presenca_regra_versao: String(row.presenca_regra_versao ?? ''),
    evasoes_validas: numero(row.evasoes_validas),
    nao_renovacoes_validas: numero(row.nao_renovacoes_validas),
    saidas_validas_total: numero(row.saidas_validas_total),
    saidas_score_professor: numero(row.saidas_score_professor),
    mrr_perdido_total: numero(row.mrr_perdido_total),
    mrr_perdido_score: numero(row.mrr_perdido_score),
    taxa_saidas_total: numero(row.taxa_saidas_total),
    taxa_impacto_score: numero(row.taxa_impacto_score),
    taxa_retencao_atribuivel: numero(row.taxa_retencao_atribuivel),
    saidas_regra_versao: String(row.saidas_regra_versao ?? ''),
    fator_demanda_ponderado: numeroOuNull(row.fator_demanda_ponderado),
    fator_demanda_publicavel: row.fator_demanda_publicavel === true,
    fator_demanda_cobertura: numero(row.fator_demanda_cobertura),
    fator_demanda_fonte: String(row.fator_demanda_fonte ?? 'sem_base'),
    fator_demanda_vinculos: numero(row.fator_demanda_vinculos),
    fator_demanda_pessoas: numero(row.fator_demanda_pessoas),
  };
}

export async function buscarKpisProfessoresCanonicos(
  filtro: FiltroKPIProfessorCanonico
): Promise<KPIProfessorCanonico[]> {
  const parametros = {
    p_ano: filtro.ano,
    p_mes: filtro.mes,
    p_unidade_id: filtro.unidadeId && filtro.unidadeId !== 'todos' ? filtro.unidadeId : null,
    p_data_inicio: filtro.dataInicio || null,
    p_data_fim: filtro.dataFim || null,
  };
  const chave = JSON.stringify(parametros);
  const cache = cacheConsultas.get(chave);
  if (cache && cache.expiraEm > Date.now()) return cache.dados;

  const emAndamento = consultasEmAndamento.get(chave);
  if (emAndamento) return emAndamento;

  const consulta = (async () => {
    const { data, error } = await supabase.rpc('get_kpis_professor_periodo_canonico_v3', parametros);

    if (error) throw error;
    const dados = ((data || []) as Record<string, unknown>[]).map(normalizarKPIProfessorCanonico);
    cacheConsultas.set(chave, { dados, expiraEm: Date.now() + CACHE_CONSULTA_MS });
    return dados;
  })();

  consultasEmAndamento.set(chave, consulta);

  try {
    return await consulta;
  } finally {
    consultasEmAndamento.delete(chave);
  }
}

export function consolidarKpisProfessoresCanonicos(
  linhas: KPIProfessorCanonico[]
): KPIProfessorCanonico[] {
  const grupos = new Map<number, KPIProfessorCanonico[]>();
  linhas.forEach((linha) => {
    const grupo = grupos.get(linha.professor_id) || [];
    grupo.push(linha);
    grupos.set(linha.professor_id, grupo);
  });

  return Array.from(grupos.values()).map((grupo) => {
    const primeira = grupo[0];
    const soma = (campo: keyof KPIProfessorCanonico) =>
      grupo.reduce((total, linha) => total + numero(linha[campo]), 0);
    const carteira = soma('carteira_alunos');
    const turmasElegiveis = soma('turmas_elegiveis_media');
    const ocupacoes = soma('alunos_via_turmas');
    const experimentais = soma('experimentais');
    const matriculasPosExp = soma('matriculas_pos_exp');
    const renovacoes = soma('renovacoes');
    const naoRenovacoes = soma('nao_renovacoes');
    const evasoes = soma('evasoes');
    const evasoesValidas = soma('evasoes_validas');
    const naoRenovacoesValidas = soma('nao_renovacoes_validas');
    const saidasValidasTotal = soma('saidas_validas_total');
    const saidasScoreProfessor = soma('saidas_score_professor');
    const fatorDemandaVinculos = soma('fator_demanda_vinculos');
    const fatorDemandaPessoas = soma('fator_demanda_pessoas');
    const fatorDemandaPublicavel = grupo.length > 0
      && grupo.every((linha) => linha.fator_demanda_publicavel)
      && fatorDemandaVinculos > 0;
    const fatorDemandaPonderado = fatorDemandaPublicavel
      ? grupo.reduce(
        (total, linha) => total + numero(linha.fator_demanda_ponderado) * linha.fator_demanda_vinculos,
        0,
      ) / fatorDemandaVinculos
      : null;
    const mediaPonderadaCarteira = (campo: keyof KPIProfessorCanonico) => carteira > 0
      ? grupo.reduce((total, linha) => total + numero(linha[campo]) * linha.carteira_alunos, 0) / carteira
      : 0;
    const presencaPublicavel = grupo.length > 0 && grupo.every((linha) => linha.presenca_publicavel);
    const eventosPresencaConfirmados = soma('presenca_eventos_confirmados');
    const eventosPresencaIncertos = soma('presenca_eventos_incertos');
    const mediaPresenca = presencaPublicavel && eventosPresencaConfirmados > 0
      ? grupo.reduce(
        (total, linha) => total + numero(linha.media_presenca) * linha.presenca_eventos_confirmados,
        0,
      ) / eventosPresencaConfirmados
      : null;
    const taxaFaltas = presencaPublicavel && eventosPresencaConfirmados > 0
      ? grupo.reduce(
        (total, linha) => total + numero(linha.taxa_faltas) * linha.presenca_eventos_confirmados,
        0,
      ) / eventosPresencaConfirmados
      : null;
    const coberturaPresenca = eventosPresencaConfirmados + eventosPresencaIncertos > 0
      ? eventosPresencaConfirmados / (eventosPresencaConfirmados + eventosPresencaIncertos)
      : 0;
    const ordemConfianca: Record<string, number> = { sem_base: 0, baixa: 1, media: 2, alta: 3 };
    const presencaConfianca = grupo.reduce((pior, linha) =>
      (ordemConfianca[linha.presenca_confianca] ?? 0) < (ordemConfianca[pior] ?? 0)
        ? linha.presenca_confianca
        : pior,
    grupo[0]?.presenca_confianca ?? 'sem_base');

    return {
      ...primeira,
      unidade_id: grupo.length === 1 ? primeira.unidade_id : null,
      carteira_alunos: carteira,
      ticket_medio: mediaPonderadaCarteira('ticket_medio'),
      media_presenca: mediaPresenca,
      taxa_faltas: taxaFaltas,
      mrr_carteira: soma('mrr_carteira'),
      nps_medio: mediaPonderadaCarteira('nps_medio'),
      media_alunos_turma: turmasElegiveis > 0 ? ocupacoes / turmasElegiveis : 0,
      experimentais,
      experimentais_agendadas: soma('experimentais_agendadas'),
      experimentais_faltas: soma('experimentais_faltas'),
      matriculas: soma('matriculas'),
      matriculas_pos_exp: matriculasPosExp,
      matriculas_diretas: soma('matriculas_diretas'),
      taxa_conversao: experimentais > 0 ? (matriculasPosExp / experimentais) * 100 : 0,
      renovacoes,
      nao_renovacoes: naoRenovacoes,
      taxa_renovacao: renovacoes + naoRenovacoes > 0
        ? (renovacoes / (renovacoes + naoRenovacoes)) * 100
        : 0,
      evasoes,
      mrr_perdido: soma('mrr_perdido'),
      taxa_cancelamento: carteira > 0 ? (evasoes / carteira) * 100 : 0,
      total_turmas: soma('total_turmas'),
      alunos_via_turmas: ocupacoes,
      turmas_elegiveis_media: turmasElegiveis,
      presenca_publicavel: presencaPublicavel,
      presenca_cobertura: coberturaPresenca,
      presenca_confianca: presencaConfianca,
      presenca_eventos_confirmados: eventosPresencaConfirmados,
      presenca_eventos_incertos: eventosPresencaIncertos,
      presenca_regra_versao: primeira.presenca_regra_versao,
      evasoes_validas: evasoesValidas,
      nao_renovacoes_validas: naoRenovacoesValidas,
      saidas_validas_total: saidasValidasTotal,
      saidas_score_professor: saidasScoreProfessor,
      mrr_perdido_total: soma('mrr_perdido_total'),
      mrr_perdido_score: soma('mrr_perdido_score'),
      taxa_saidas_total: carteira > 0 ? (saidasValidasTotal / carteira) * 100 : 0,
      taxa_impacto_score: carteira > 0 ? (saidasScoreProfessor / carteira) * 100 : 0,
      taxa_retencao_atribuivel: carteira > 0 ? 100 - ((saidasScoreProfessor / carteira) * 100) : 0,
      saidas_regra_versao: primeira.saidas_regra_versao,
      fator_demanda_ponderado: fatorDemandaPonderado,
      fator_demanda_publicavel: fatorDemandaPublicavel,
      fator_demanda_cobertura: fatorDemandaVinculos > 0
        ? grupo.reduce(
          (total, linha) => total + linha.fator_demanda_cobertura * linha.fator_demanda_vinculos,
          0,
        ) / fatorDemandaVinculos
        : 0,
      fator_demanda_fonte: grupo.length === 1
        ? primeira.fator_demanda_fonte
        : Array.from(new Set(grupo.map((linha) => linha.fator_demanda_fonte))).join('+'),
      fator_demanda_vinculos: fatorDemandaVinculos,
      fator_demanda_pessoas: fatorDemandaPessoas,
    };
  });
}

export function calcularTotaisKpisProfessoresCanonicos(
  linhas: KPIProfessorCanonico[]
): TotaisKPIProfessorCanonico {
  const consolidados = consolidarKpisProfessoresCanonicos(linhas);
  const total = (campo: keyof KPIProfessorCanonico) =>
    linhas.reduce((soma, linha) => soma + numero(linha[campo]), 0);
  const carteiraAlunos = total('carteira_alunos');
  const totalOcupacoes = total('alunos_via_turmas');
  const totalTurmasElegiveis = total('turmas_elegiveis_media');
  const experimentais = total('experimentais');
  const matriculasPosExp = total('matriculas_pos_exp');
  const renovacoes = total('renovacoes');
  const naoRenovacoes = total('nao_renovacoes');

  return {
    totalProfessores: consolidados.length,
    carteiraAlunos,
    mediaAlunosProfessor: consolidados.length > 0 ? carteiraAlunos / consolidados.length : 0,
    totalTurmas: total('total_turmas'),
    totalOcupacoes,
    totalTurmasElegiveis,
    mediaAlunosTurma: totalTurmasElegiveis > 0 ? totalOcupacoes / totalTurmasElegiveis : 0,
    experimentais,
    matriculasPosExp,
    taxaConversao: experimentais > 0 ? (matriculasPosExp / experimentais) * 100 : 0,
    renovacoes,
    naoRenovacoes,
    taxaRenovacao: renovacoes + naoRenovacoes > 0
      ? (renovacoes / (renovacoes + naoRenovacoes)) * 100
      : 0,
    evasoes: total('evasoes'),
    mrrPerdido: total('mrr_perdido'),
  };
}

export function indexarKpisProfessoresCanonicos(
  linhas: KPIProfessorCanonico[]
): Map<string, KPIProfessorCanonico> {
  const mapa = new Map<string, KPIProfessorCanonico>();
  linhas.forEach((linha) => {
    if (linha.unidade_id) mapa.set(`${linha.professor_id}_${linha.unidade_id}`, linha);
  });
  consolidarKpisProfessoresCanonicos(linhas).forEach((linha) => {
    mapa.set(`${linha.professor_id}_todos`, linha);
  });
  return mapa;
}
