import {
  normalizarInadimplenciaCanonica,
  type InadimplenciaCanonicaItem,
  type InadimplenciaCanonicaState,
} from './inadimplenciaCanonica.ts';

export type FaturasAlunosSituacao = 'todas' | 'confirmadas' | 'cobranca_d2';

export interface CadastroFaturaAluno {
  id: number;
  nome: string;
  unidadeId: string;
  cursoNome: string | null;
  status?: string | null;
}

export interface FaturasAlunosFiltros {
  unidadeId?: string | 'todos' | null;
  alunoId?: number | null;
  matriculaId?: string | null;
  competencia?: string | null;
  situacao?: FaturasAlunosSituacao;
  busca?: string;
  curso?: string | null;
}

export interface CanonicalRpcClient {
  rpc(
    name: 'get_inadimplencia_canonica',
    args: { p_unidade_id: string | null; p_as_of_date: string },
  ): Promise<{ data: unknown; error: { message?: string } | null }>;
}

export interface CarregarLeituraFaturasAlunosOptions {
  unidadeId?: string | 'todos' | null;
  asOfDate: string;
}

const COMPETENCIA = /^\d{4}-(?:0[1-9]|1[0-2])-01$/;

const textoBusca = (value: unknown) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLocaleLowerCase('pt-BR');

export function competenciaFatura(item: InadimplenciaCanonicaItem): string {
  const competencia = 'competencia' in item ? item.competencia : null;
  return typeof competencia === 'string' && COMPETENCIA.test(competencia)
    ? competencia
    : `${item.data_vencimento.slice(0, 7)}-01`;
}

export function chaveFaturaAluno(item: InadimplenciaCanonicaItem): string {
  return [
    item.unidade_id,
    item.emusys_matricula_id,
    item.canonical_fatura_id,
  ].join('|');
}

export async function carregarLeituraFaturasAlunos(
  client: CanonicalRpcClient,
  options: CarregarLeituraFaturasAlunosOptions,
): Promise<InadimplenciaCanonicaState> {
  const unidadeId = options.unidadeId && options.unidadeId !== 'todos'
    ? options.unidadeId
    : null;
  const { data, error } = await client.rpc('get_inadimplencia_canonica', {
    p_unidade_id: unidadeId,
    p_as_of_date: options.asOfDate,
  });
  const state = normalizarInadimplenciaCanonica(data, error);
  if (state.status === 'error' || state.schemaVersion === 3 || state.schemaVersion === 4) return state;
  return normalizarInadimplenciaCanonica(null, {
    message: 'A pagina de faturas exige o contrato canonico v3 ou v4.',
  });
}

export function filtrarFaturasAlunos(
  items: InadimplenciaCanonicaItem[],
  cadastros: ReadonlyMap<number, CadastroFaturaAluno>,
  filtros: FaturasAlunosFiltros,
): InadimplenciaCanonicaItem[] {
  const busca = textoBusca(filtros.busca);
  const curso = textoBusca(filtros.curso);
  const matricula = filtros.matriculaId?.trim() || null;

  return items.filter((item) => {
    if ((item as InadimplenciaCanonicaItem & { source_missing?: boolean }).source_missing === true) {
      return false;
    }
    if (filtros.unidadeId && filtros.unidadeId !== 'todos' && item.unidade_id !== filtros.unidadeId) {
      return false;
    }
    if (filtros.alunoId && item.aluno_id_canonico !== filtros.alunoId) return false;
    if (matricula && item.emusys_matricula_id !== matricula) return false;
    if (filtros.competencia && competenciaFatura(item) !== filtros.competencia) return false;
    if (filtros.situacao === 'cobranca_d2' && item.dias_atraso < 2) return false;

    const cadastro = item.aluno_id_canonico === null
      ? null
      : cadastros.get(item.aluno_id_canonico) ?? null;
    if (cadastro && cadastro.unidadeId !== item.unidade_id) return false;
    if (curso && textoBusca(cadastro?.cursoNome) !== curso) return false;
    if (busca) {
      const haystack = textoBusca([
        cadastro?.nome,
        cadastro?.cursoNome,
        item.emusys_matricula_id,
        item.emusys_fatura_id,
      ].filter(Boolean).join(' '));
      if (!haystack.includes(busca)) return false;
    }
    return true;
  });
}

export function criarUrlFaturasAlunos(filtros: FaturasAlunosFiltros): string {
  const params = new URLSearchParams();
  if (filtros.unidadeId && filtros.unidadeId !== 'todos') params.set('unidade', filtros.unidadeId);
  if (filtros.alunoId) params.set('aluno', String(filtros.alunoId));
  if (filtros.matriculaId?.trim()) params.set('matricula', filtros.matriculaId.trim());
  if (filtros.competencia) params.set('competencia', filtros.competencia);
  if (filtros.situacao && filtros.situacao !== 'todas') params.set('situacao', filtros.situacao);
  if (filtros.busca?.trim()) params.set('busca', filtros.busca.trim());
  if (filtros.curso?.trim()) params.set('curso', filtros.curso.trim());
  const query = params.toString();
  return query ? `/app/faturas?${query}` : '/app/faturas';
}
