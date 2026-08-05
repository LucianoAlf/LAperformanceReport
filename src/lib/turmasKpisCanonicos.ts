import { supabase } from './supabase';

export interface FiltroKPITurmaCanonico {
  ano: number;
  mes: number;
  unidadeId?: string | null;
  dataInicio?: string | null;
  dataFim?: string | null;
}

export interface KPITurmaCanonico {
  professor_id: number;
  unidade_id: string | null;
  ano: number;
  mes: number;
  ocupacoes_elegiveis: number;
  turmas_elegiveis: number;
  media_alunos_turma: number;
  turmas_um_aluno: number;
  percentual_turmas_um_aluno: number;
  competencia_status: 'aberto' | 'fechado';
  fonte: string;
  regra_versao: string;
}

export interface TotaisKPITurmaCanonico {
  totalOcupacoes: number;
  totalTurmas: number;
  mediaAlunosTurma: number;
  totalTurmasUmAluno: number;
  percentualTurmasUmAluno: number;
}

const consultasEmAndamento = new Map<string, Promise<KPITurmaCanonico[]>>();

function numero(valor: unknown): number {
  const normalizado = Number(valor);
  return Number.isFinite(normalizado) ? normalizado : 0;
}

function normalizarKpiTurma(row: Record<string, unknown>): KPITurmaCanonico {
  return {
    professor_id: numero(row.professor_id),
    unidade_id: row.unidade_id ? String(row.unidade_id) : null,
    ano: numero(row.ano),
    mes: numero(row.mes),
    ocupacoes_elegiveis: numero(row.ocupacoes_elegiveis),
    turmas_elegiveis: numero(row.turmas_elegiveis),
    media_alunos_turma: numero(row.media_alunos_turma),
    turmas_um_aluno: numero(row.turmas_um_aluno),
    percentual_turmas_um_aluno: numero(row.percentual_turmas_um_aluno),
    competencia_status: row.competencia_status === 'fechado' ? 'fechado' : 'aberto',
    fonte: String(row.fonte ?? ''),
    regra_versao: String(row.regra_versao ?? ''),
  };
}

export async function buscarKpisTurmasCanonicos(
  filtro: FiltroKPITurmaCanonico,
): Promise<KPITurmaCanonico[]> {
  const parametros = {
    p_ano: filtro.ano,
    p_mes: filtro.mes,
    p_unidade_id: filtro.unidadeId && filtro.unidadeId !== 'todos' ? filtro.unidadeId : null,
    p_data_inicio: filtro.dataInicio || null,
    p_data_fim: filtro.dataFim || null,
  };
  const chave = JSON.stringify(parametros);
  const consultaExistente = consultasEmAndamento.get(chave);
  if (consultaExistente) return consultaExistente;

  const consulta = (async () => {
    const { data, error } = await supabase.rpc('get_kpis_turmas_canonicos_v2', parametros);
    if (error) throw error;
    return ((data || []) as Record<string, unknown>[]).map(normalizarKpiTurma);
  })();

  consultasEmAndamento.set(chave, consulta);
  try {
    return await consulta;
  } finally {
    consultasEmAndamento.delete(chave);
  }
}

export function calcularTotaisKpisTurmasCanonicos(
  linhas: KPITurmaCanonico[],
): TotaisKPITurmaCanonico {
  const totalOcupacoes = linhas.reduce(
    (soma, linha) => soma + linha.ocupacoes_elegiveis,
    0,
  );
  const totalTurmas = linhas.reduce(
    (soma, linha) => soma + linha.turmas_elegiveis,
    0,
  );
  const totalTurmasUmAluno = linhas.reduce(
    (soma, linha) => soma + linha.turmas_um_aluno,
    0,
  );

  return {
    totalOcupacoes,
    totalTurmas,
    mediaAlunosTurma: totalTurmas > 0 ? totalOcupacoes / totalTurmas : 0,
    totalTurmasUmAluno,
    percentualTurmasUmAluno: totalTurmas > 0
      ? (totalTurmasUmAluno / totalTurmas) * 100
      : 0,
  };
}

function combinarLinhas(linhas: KPITurmaCanonico[]): KPITurmaCanonico {
  const primeira = linhas[0];
  const totais = calcularTotaisKpisTurmasCanonicos(linhas);
  return {
    ...primeira,
    unidade_id: linhas.length === 1 ? primeira.unidade_id : null,
    ocupacoes_elegiveis: totais.totalOcupacoes,
    turmas_elegiveis: totais.totalTurmas,
    media_alunos_turma: totais.mediaAlunosTurma,
    turmas_um_aluno: totais.totalTurmasUmAluno,
    percentual_turmas_um_aluno: totais.percentualTurmasUmAluno,
    competencia_status: linhas.every((linha) => linha.competencia_status === 'fechado')
      ? 'fechado'
      : 'aberto',
  };
}

export function indexarKpisTurmasCanonicos(
  linhas: KPITurmaCanonico[],
): Map<string, KPITurmaCanonico> {
  const indice = new Map<string, KPITurmaCanonico>();
  const porProfessor = new Map<number, KPITurmaCanonico[]>();

  linhas.forEach((linha) => {
    if (linha.unidade_id) {
      indice.set(`${linha.professor_id}_${linha.unidade_id}`, linha);
    }
    const grupo = porProfessor.get(linha.professor_id) || [];
    grupo.push(linha);
    porProfessor.set(linha.professor_id, grupo);
  });

  porProfessor.forEach((grupo, professorId) => {
    indice.set(`${professorId}_todos`, combinarLinhas(grupo));
  });

  return indice;
}
