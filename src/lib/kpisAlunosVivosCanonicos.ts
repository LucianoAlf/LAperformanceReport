import { supabase } from '@/lib/supabase';

export interface KPIsAlunosVivosPorUnidade {
  unidade_id: string;
  unidade_nome: string;
  ano: number;
  mes: number;
  alunosAtivos: number;
  alunosPagantes: number;
  ticketMedio: number;
  mrr: number;
  arr: number;
  churnRate: number;
  evasoes: number;
  inadimplencia: number;
  tempoPermanencia: number;
  ltv: number;
  matriculasAtivas: number;
  matriculasBanda: number;
  matriculasSegundoCurso: number;
  matriculasCoral: number;
  novasMatriculas: number;
  bolsistasIntegrais: number;
  bolsistasParciais: number;
  kids: number;
  school: number;
  semClassificacao: number;
  faturamentoPrevisto: number;
  faturamentoRealizado: number;
  reajustePct: number;
}

interface FetchKPIsAlunosVivosParams {
  unidadeId?: string | 'todos' | null;
  ano: number;
  mes: number;
}

type AlunoRow = {
  id: number;
  nome: string | null;
  idade_atual: number | null;
  status: string | null;
  data_matricula: string | null;
  data_saida: string | null;
  unidade_id: string | null;
  valor_parcela: number | string | null;
  is_segundo_curso: boolean | null;
  cursos?: any;
  tipos_matricula?: any;
};

type MovimentoRow = {
  id: number;
  aluno_id: number | null;
  aluno_nome: string | null;
  unidade_id: string | null;
  tipo: string | null;
  data: string | null;
};

type TempoPermanenciaRow = {
  unidade_id: string | null;
  tempo_permanencia_medio: number | string | null;
};

const PAGE_SIZE = 1000;

function n(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstRelation<T = any>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function isoHoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function ultimoDiaMes(ano: number, mes: number): string {
  const dia = new Date(ano, mes, 0).getDate();
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function dataCorteParaCompetenciaAtual(ano: number, mes: number): string {
  const hoje = isoHoje();
  const fimMes = ultimoDiaMes(ano, mes);
  return hoje < fimMes ? hoje : fimMes;
}

function dataInicioMes(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}-01`;
}

function pessoaKey(row: AlunoRow): string | null {
  const nome = String(row.nome || '').trim().toLowerCase();
  const unidadeId = String(row.unidade_id || '').trim();
  if (!nome || !unidadeId) return null;
  return `${nome}|${unidadeId}`;
}

function isRowAtivoNaData(row: AlunoRow, dataCorte: string): boolean {
  if (row.data_matricula && row.data_matricula > dataCorte) return false;
  if (row.data_saida && row.data_saida <= dataCorte) return false;
  return row.status === 'ativo' || row.status === 'trancado';
}

function cursoRow(row: AlunoRow) {
  return firstRelation(row.cursos);
}

function tipoRow(row: AlunoRow) {
  return firstRelation(row.tipos_matricula);
}

function isBanda(row: AlunoRow): boolean {
  return cursoRow(row)?.is_projeto_banda === true;
}

function isCoral(row: AlunoRow): boolean {
  return String(cursoRow(row)?.nome || '').toLowerCase().includes('canto coral');
}

function isSegundoCursoExecutivo(row: AlunoRow): boolean {
  return row.is_segundo_curso === true && !isBanda(row) && !isCoral(row);
}

function isBolsaIntegral(row: AlunoRow): boolean {
  return tipoRow(row)?.codigo === 'BOLSISTA_INT' && !isBanda(row);
}

function isBolsaParcial(row: AlunoRow): boolean {
  return tipoRow(row)?.codigo === 'BOLSISTA_PARC' && !isBanda(row);
}

function isParcelaRecorrentePagante(row: AlunoRow): boolean {
  return tipoRow(row)?.entra_ticket_medio === true && n(row.valor_parcela) > 0;
}

function isNovaMatriculaExecutiva(row: AlunoRow, inicioMes: string, dataCorte: string): boolean {
  const tipo = tipoRow(row);
  if (!row.data_matricula || row.data_matricula < inicioMes || row.data_matricula > dataCorte) return false;
  if (row.is_segundo_curso === true) return false;
  if (isBanda(row) || isCoral(row)) return false;
  if (tipo?.codigo === 'BOLSISTA_INT' || tipo?.codigo === 'BOLSISTA_PARC') return false;
  return (tipo?.conta_como_pagante === true || tipo?.entra_ticket_medio === true) && n(row.valor_parcela) > 0;
}

async function fetchAllPages<T>(buildQuery: () => any): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await buildQuery().range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;

    const page = (data || []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;

    offset += PAGE_SIZE;
  }

  return rows;
}

export function calcularKPIsAlunosVivosCanonicos(
  alunos: AlunoRow[],
  movimentacoes: MovimentoRow[],
  unidades: Array<{ id: string; nome: string }>,
  {
    ano,
    mes,
    temposPermanenciaPorUnidade = new Map<string, number>(),
  }: { ano: number; mes: number; temposPermanenciaPorUnidade?: Map<string, number> }
): KPIsAlunosVivosPorUnidade[] {
  const dataCorte = dataCorteParaCompetenciaAtual(ano, mes);
  const inicioMes = dataInicioMes(ano, mes);
  const unidadesMap = new Map(unidades.map(unidade => [String(unidade.id), unidade.nome]));

  return unidades.map(unidade => {
    const unidadeId = String(unidade.id);
    const alunosUnidade = alunos
      .filter(row => String(row.unidade_id || '') === unidadeId)
      .filter(row => isRowAtivoNaData(row, dataCorte));

    const pessoas = new Map<string, {
      idade: number | null;
      mrr: number;
      bolsistaIntegral: boolean;
      bolsistaParcial: boolean;
    }>();

    alunosUnidade.forEach(row => {
      const key = pessoaKey(row);
      if (!key) return;

      const pessoa = pessoas.get(key) || {
        idade: null,
        mrr: 0,
        bolsistaIntegral: false,
        bolsistaParcial: false,
      };

      if (row.idade_atual !== null && row.idade_atual !== undefined) {
        pessoa.idade = pessoa.idade === null ? n(row.idade_atual) : Math.max(pessoa.idade, n(row.idade_atual));
      }

      if (isParcelaRecorrentePagante(row)) {
        pessoa.mrr += n(row.valor_parcela);
      }

      pessoa.bolsistaIntegral = pessoa.bolsistaIntegral || isBolsaIntegral(row);
      pessoa.bolsistaParcial = pessoa.bolsistaParcial || isBolsaParcial(row);
      pessoas.set(key, pessoa);
    });

    const pessoasArray = Array.from(pessoas.values());
    const alunosPagantes = pessoasArray.filter(pessoa => pessoa.mrr > 0).length;
    const mrr = pessoasArray.reduce((acc, pessoa) => acc + pessoa.mrr, 0);

    const novasMatriculasKeys = new Set(
      alunosUnidade
        .filter(row => isNovaMatriculaExecutiva(row, inicioMes, dataCorte))
        .map(row => pessoaKey(row))
        .filter(Boolean) as string[]
    );

    const evasoesKeys = new Set(
      movimentacoes
        .filter(mov => String(mov.unidade_id || '') === unidadeId)
        .filter(mov => mov.data && mov.data >= inicioMes && mov.data <= dataCorte)
        .filter(mov => mov.tipo === 'evasao' || mov.tipo === 'nao_renovacao')
        .map(mov => mov.aluno_id ? String(mov.aluno_id) : String(mov.aluno_nome || '').trim().toLowerCase())
        .filter(Boolean)
    );

    const tempoPermanencia = temposPermanenciaPorUnidade.get(unidadeId) || 0;
    const ticketMedio = alunosPagantes > 0 ? mrr / alunosPagantes : 0;

    return {
      unidade_id: unidadeId,
      unidade_nome: unidadesMap.get(unidadeId) || unidade.nome || 'Unidade',
      ano,
      mes,
      alunosAtivos: pessoasArray.length,
      alunosPagantes,
      ticketMedio,
      mrr,
      arr: mrr * 12,
      churnRate: alunosPagantes > 0 ? (evasoesKeys.size / alunosPagantes) * 100 : 0,
      evasoes: evasoesKeys.size,
      inadimplencia: 0,
      tempoPermanencia,
      ltv: ticketMedio * tempoPermanencia,
      matriculasAtivas: alunosUnidade.length,
      matriculasBanda: alunosUnidade.filter(isBanda).length,
      matriculasSegundoCurso: alunosUnidade.filter(isSegundoCursoExecutivo).length,
      matriculasCoral: alunosUnidade.filter(isCoral).length,
      novasMatriculas: novasMatriculasKeys.size,
      bolsistasIntegrais: pessoasArray.filter(pessoa => pessoa.bolsistaIntegral).length,
      bolsistasParciais: pessoasArray.filter(pessoa => pessoa.bolsistaParcial).length,
      kids: pessoasArray.filter(pessoa => pessoa.idade !== null && pessoa.idade <= 11).length,
      school: pessoasArray.filter(pessoa => pessoa.idade !== null && pessoa.idade >= 12).length,
      semClassificacao: pessoasArray.filter(pessoa => pessoa.idade === null).length,
      faturamentoPrevisto: mrr,
      faturamentoRealizado: mrr,
      reajustePct: 0,
    };
  });
}

export async function fetchKPIsAlunosVivosCanonicos({
  unidadeId = 'todos',
  ano,
  mes,
}: FetchKPIsAlunosVivosParams): Promise<KPIsAlunosVivosPorUnidade[]> {
  const unidadeFiltro = unidadeId && unidadeId !== 'todos' ? String(unidadeId) : null;
  const dataCorte = dataCorteParaCompetenciaAtual(ano, mes);
  const inicioMes = dataInicioMes(ano, mes);

  let unidadesQuery = supabase
    .from('unidades')
    .select('id, nome')
    .eq('ativo', true)
    .order('nome');

  if (unidadeFiltro) {
    unidadesQuery = unidadesQuery.eq('id', unidadeFiltro);
  }

  const { data: unidadesData, error: unidadesError } = await unidadesQuery;
  if (unidadesError) throw unidadesError;

  const unidades = (unidadesData || []).map((unidade: any) => ({
    id: String(unidade.id),
    nome: String(unidade.nome || 'Unidade'),
  }));

  const selectAlunos = `
    id, nome, idade_atual, status, data_matricula, data_saida, unidade_id,
    valor_parcela, is_segundo_curso, arquivado_em,
    cursos:curso_id!left(nome, is_projeto_banda),
    tipos_matricula:tipo_matricula_id!left(codigo, conta_como_pagante, entra_ticket_medio)
  `;

  const alunos = await fetchAllPages<AlunoRow>(() => {
    let query = supabase
      .from('alunos')
      .select(selectAlunos)
      .is('arquivado_em', null)
      .in('status', ['ativo', 'trancado'])
      .order('nome');

    if (unidadeFiltro) {
      query = query.eq('unidade_id', unidadeFiltro);
    }

    return query;
  });

  const movimentacoes = await fetchAllPages<MovimentoRow>(() => {
    let query = supabase
      .from('movimentacoes_admin')
      .select('id, aluno_id, aluno_nome, unidade_id, tipo, data')
      .in('tipo', ['evasao', 'nao_renovacao'])
      .gte('data', inicioMes)
      .lte('data', dataCorte)
      .order('data', { ascending: false });

    if (unidadeFiltro) {
      query = query.eq('unidade_id', unidadeFiltro);
    }

    return query;
  });

  const temposPermanenciaPorUnidade = new Map<string, number>();
  const { data: tempoData, error: tempoError } = await supabase.rpc('get_tempo_permanencia', {
    p_unidade_id: unidadeFiltro,
    p_ano: ano,
    p_mes: mes,
  });

  if (tempoError) {
    console.warn('Falha ao carregar tempo de permanencia canonico', tempoError);
  } else {
    ((tempoData || []) as TempoPermanenciaRow[]).forEach(row => {
      const unidadeId = String(row.unidade_id || '');
      if (!unidadeId) return;
      temposPermanenciaPorUnidade.set(unidadeId, n(row.tempo_permanencia_medio));
    });
  }

  return calcularKPIsAlunosVivosCanonicos(alunos, movimentacoes, unidades, {
    ano,
    mes,
    temposPermanenciaPorUnidade,
  });
}
