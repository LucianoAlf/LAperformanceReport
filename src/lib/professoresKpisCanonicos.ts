import { supabase } from '@/lib/supabase';

export interface KPIProfessorCanonico {
  professor_id: number;
  professor_nome: string;
  unidade_id: string | null;
  ano: number;
  mes: number;
  carteira_alunos: number;
  ticket_medio: number;
  media_presenca: number;
  taxa_faltas: number;
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

const numero = (valor: unknown): number => {
  const convertido = Number(valor ?? 0);
  return Number.isFinite(convertido) ? convertido : 0;
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
    media_presenca: numero(row.media_presenca),
    taxa_faltas: numero(row.taxa_faltas),
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
  };
}

export async function buscarKpisProfessoresCanonicos(
  filtro: FiltroKPIProfessorCanonico
): Promise<KPIProfessorCanonico[]> {
  const { data, error } = await supabase.rpc('get_kpis_professor_periodo_canonico', {
    p_ano: filtro.ano,
    p_mes: filtro.mes,
    p_unidade_id: filtro.unidadeId && filtro.unidadeId !== 'todos' ? filtro.unidadeId : null,
    p_data_inicio: filtro.dataInicio || null,
    p_data_fim: filtro.dataFim || null,
  });

  if (error) throw error;
  return ((data || []) as Record<string, unknown>[]).map(normalizarKPIProfessorCanonico);
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
    const mediaPonderadaCarteira = (campo: keyof KPIProfessorCanonico) => carteira > 0
      ? grupo.reduce((total, linha) => total + numero(linha[campo]) * linha.carteira_alunos, 0) / carteira
      : 0;

    return {
      ...primeira,
      unidade_id: grupo.length === 1 ? primeira.unidade_id : null,
      carteira_alunos: carteira,
      ticket_medio: mediaPonderadaCarteira('ticket_medio'),
      media_presenca: mediaPonderadaCarteira('media_presenca'),
      taxa_faltas: mediaPonderadaCarteira('taxa_faltas'),
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
