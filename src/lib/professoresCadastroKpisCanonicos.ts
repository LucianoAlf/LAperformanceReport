import { supabase } from './supabase';

/**
 * Recorte mínimo que a aba Cadastro efetivamente precisa.  Ele deliberadamente
 * não abre as cadeias de presença, conversão, retenção ou ticket da RPC ampla
 * de performance.
 */
export interface KPIProfessorCadastroCanonico {
  professor_id: number;
  unidade_id: string | null;
  carteira_alunos: number;
  total_turmas: number;
  alunos_via_turmas: number;
  turmas_elegiveis_media: number;
  media_alunos_turma: number;
}

export interface FiltroKPIProfessorCadastroCanonico {
  ano: number;
  mes: number;
  unidadeId?: string | null;
  dataInicio?: string | null;
  dataFim?: string | null;
}

const consultasEmAndamento = new Map<string, Promise<KPIProfessorCadastroCanonico[]>>();
const cacheConsultas = new Map<string, { dados: KPIProfessorCadastroCanonico[]; expiraEm: number }>();
const CACHE_CONSULTA_MS = 15_000;

function numero(valor: unknown): number {
  const convertido = Number(valor ?? 0);
  return Number.isFinite(convertido) ? convertido : 0;
}

function normalizar(row: Record<string, unknown>): KPIProfessorCadastroCanonico {
  return {
    professor_id: numero(row.professor_id),
    unidade_id: row.unidade_id ? String(row.unidade_id) : null,
    carteira_alunos: numero(row.carteira_alunos),
    total_turmas: numero(row.total_turmas),
    alunos_via_turmas: numero(row.alunos_via_turmas),
    turmas_elegiveis_media: numero(row.turmas_elegiveis_media),
    media_alunos_turma: numero(row.media_alunos_turma),
  };
}

export async function buscarKpisProfessoresCadastroCanonicos(
  filtro: FiltroKPIProfessorCadastroCanonico,
): Promise<KPIProfessorCadastroCanonico[]> {
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
    const { data, error } = await supabase.rpc(
      'get_kpis_professores_cadastro_canonicos_v1',
      parametros,
    );
    if (error) throw error;

    const dados = ((data || []) as Record<string, unknown>[]).map(normalizar);
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

function combinarLinhas(linhas: KPIProfessorCadastroCanonico[]): KPIProfessorCadastroCanonico {
  const primeira = linhas[0];
  const carteiraAlunos = linhas.reduce((total, linha) => total + linha.carteira_alunos, 0);
  const totalTurmas = linhas.reduce((total, linha) => total + linha.total_turmas, 0);
  const alunosViaTurmas = linhas.reduce((total, linha) => total + linha.alunos_via_turmas, 0);
  const turmasElegiveis = linhas.reduce(
    (total, linha) => total + linha.turmas_elegiveis_media,
    0,
  );

  return {
    ...primeira,
    unidade_id: linhas.length === 1 ? primeira.unidade_id : null,
    carteira_alunos: carteiraAlunos,
    total_turmas: totalTurmas,
    alunos_via_turmas: alunosViaTurmas,
    turmas_elegiveis_media: turmasElegiveis,
    media_alunos_turma: turmasElegiveis > 0 ? alunosViaTurmas / turmasElegiveis : 0,
  };
}

export function indexarKpisProfessoresCadastroCanonicos(
  linhas: KPIProfessorCadastroCanonico[],
): Map<string, KPIProfessorCadastroCanonico> {
  const indice = new Map<string, KPIProfessorCadastroCanonico>();
  const porProfessor = new Map<number, KPIProfessorCadastroCanonico[]>();

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

export function calcularMediaAlunosTurmaCadastroCanonica(
  linhas: KPIProfessorCadastroCanonico[],
): number | null {
  const alunosViaTurmas = linhas.reduce((total, linha) => total + linha.alunos_via_turmas, 0);
  const turmasElegiveis = linhas.reduce(
    (total, linha) => total + linha.turmas_elegiveis_media,
    0,
  );
  return turmasElegiveis > 0 ? alunosViaTurmas / turmasElegiveis : null;
}
