import { supabase } from '@/lib/supabase';
import { percentualReajusteMedioCanonico } from '@/lib/retencaoOperacionalCanonica';
import { isCompetenciaNoPeriodo } from '@/lib/renovacoesAntecipadas';
import { isAtividadeExtraAcademica } from '@/lib/atividadesExtras';
import { isTipoMatriculaForaNovaComercial } from '@/lib/comercialMatriculasCanonicas';

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
  matriculasBaseAlunosAtivos: number;
  matriculasBanda: number;
  matriculasSegundoCurso: number;
  alunosComSegundoCurso: number;
  matriculasSegundoCursoExtras: number;
  matriculasCoral: number;
  novasMatriculas: number;
  bolsistasIntegrais: number;
  bolsistasIntegraisRegulares: number;
  bolsistasIntegraisSegundoCurso: number;
  bolsistasParciais: number;
  kids: number;
  school: number;
  semClassificacao: number;
  faturamentoPrevisto: number;
  faturamentoRealizado: number;
  reajustePct: number;
  reajustesValidos: number;
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
  status_pagamento: string | null;
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
  competencia_referencia?: string | null;
  renovacao_primeira_aula_novo_ciclo?: string | null;
  renovacao_status?: 'pendente_validacao' | 'confirmada' | 'antecipada_pendente' | 'antecipada_confirmada' | null;
  renovacao_antecipada?: boolean | null;
  valor_parcela_anterior?: number | string | null;
  valor_parcela_novo?: number | string | null;
  forma_pagamento_id?: number | string | null;
  agente_comercial?: string | null;
  curso_id?: number | string | null;
  curso_nome?: string | null;
  cursos?: any;
  alunos?: any;
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
  return row.status === 'ativo';
}

function cursoRow(row: AlunoRow) {
  return firstRelation(row.cursos);
}

function tipoRow(row: AlunoRow) {
  return firstRelation(row.tipos_matricula);
}

function tipoCodigo(row: AlunoRow): string {
  return String(tipoRow(row)?.codigo || '');
}

function isBanda(row: AlunoRow): boolean {
  return cursoRow(row)?.is_projeto_banda === true;
}

function isCoral(row: AlunoRow): boolean {
  const curso = cursoRow(row);
  return String(curso?.nome || '').toLowerCase().includes('canto coral');
}

function isSegundoCursoExecutivo(row: AlunoRow): boolean {
  return row.is_segundo_curso === true && tipoCodigo(row) !== 'REGULAR' && !isBanda(row) && !isCoral(row);
}

function isBolsaIntegral(row: AlunoRow): boolean {
  return tipoRow(row)?.codigo === 'BOLSISTA_INT' && !isBanda(row);
}

function isBolsaIntegralRegular(row: AlunoRow): boolean {
  return isBolsaIntegral(row) && row.is_segundo_curso !== true;
}

function isBolsaIntegralSegundoCurso(row: AlunoRow): boolean {
  return isBolsaIntegral(row) && row.is_segundo_curso === true;
}

function isBolsaParcial(row: AlunoRow): boolean {
  return tipoRow(row)?.codigo === 'BOLSISTA_PARC' && !isBanda(row);
}

function isParcelaRecorrentePagante(row: AlunoRow): boolean {
  return tipoRow(row)?.entra_ticket_medio === true && n(row.valor_parcela) > 0;
}

function isParcelaInadimplente(row: AlunoRow): boolean {
  return row.status === 'ativo' && String(row.status_pagamento || '').toLowerCase() === 'inadimplente' && n(row.valor_parcela) > 0;
}

function isNovaMatriculaExecutiva(row: AlunoRow, inicioMes: string, dataCorte: string): boolean {
  const tipo = tipoRow(row);
  if (!row.data_matricula || row.data_matricula < inicioMes || row.data_matricula > dataCorte) return false;
  if (row.is_segundo_curso === true) return false;
  if (isBanda(row) || isCoral(row)) return false;
  if (isTipoMatriculaForaNovaComercial(tipo?.codigo)) return false;
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
      inadimplente: boolean;
      valorInadimplente: number;
      bolsistaIntegral: boolean;
      bolsistaIntegralRegular: boolean;
      bolsistaIntegralSegundoCurso: boolean;
      bolsistaParcial: boolean;
      segundosCursos: number;
    }>();

    alunosUnidade.forEach(row => {
      const key = pessoaKey(row);
      if (!key) return;

      const pessoa = pessoas.get(key) || {
        idade: null,
        mrr: 0,
        inadimplente: false,
        valorInadimplente: 0,
        bolsistaIntegral: false,
        bolsistaIntegralRegular: false,
        bolsistaIntegralSegundoCurso: false,
        bolsistaParcial: false,
        segundosCursos: 0,
      };

      if (row.idade_atual !== null && row.idade_atual !== undefined) {
        pessoa.idade = pessoa.idade === null ? n(row.idade_atual) : Math.max(pessoa.idade, n(row.idade_atual));
      }

      if (isParcelaRecorrentePagante(row)) {
        pessoa.mrr += n(row.valor_parcela);
      }

      if (isParcelaInadimplente(row)) {
        pessoa.inadimplente = true;
        pessoa.valorInadimplente += n(row.valor_parcela);
      }

      pessoa.bolsistaIntegral = pessoa.bolsistaIntegral || isBolsaIntegral(row);
      pessoa.bolsistaIntegralRegular = pessoa.bolsistaIntegralRegular || isBolsaIntegralRegular(row);
      pessoa.bolsistaIntegralSegundoCurso = pessoa.bolsistaIntegralSegundoCurso || isBolsaIntegralSegundoCurso(row);
      pessoa.bolsistaParcial = pessoa.bolsistaParcial || isBolsaParcial(row);
      if (isSegundoCursoExecutivo(row)) {
        pessoa.segundosCursos += 1;
      }
      pessoas.set(key, pessoa);
    });

    const pessoasArray = Array.from(pessoas.values());
    const alunosPagantes = pessoasArray.filter(pessoa => pessoa.mrr > 0).length;
    const mrr = pessoasArray.reduce((acc, pessoa) => acc + pessoa.mrr, 0);
    const inadimplentes = pessoasArray.filter(pessoa => pessoa.inadimplente).length;
    const valorInadimplente = pessoasArray.reduce((acc, pessoa) => acc + pessoa.valorInadimplente, 0);
    const inadimplenciaPct = alunosPagantes > 0 ? (inadimplentes / alunosPagantes) * 100 : 0;
    const alunosAtivos = pessoasArray.length;
    const matriculasBanda = alunosUnidade.filter(isBanda).length;
    const matriculasSegundoCurso = alunosUnidade.filter(isSegundoCursoExecutivo).length;
    const alunosComSegundoCurso = pessoasArray.filter(pessoa => pessoa.segundosCursos > 0).length;
    const matriculasCoral = alunosUnidade.filter(isCoral).length;
    const matriculasAtivas = alunosAtivos + matriculasBanda + matriculasSegundoCurso + matriculasCoral;

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
        .filter(mov => !isAtividadeExtraAcademica(mov))
        .map(mov => mov.aluno_id ? String(mov.aluno_id) : String(mov.aluno_nome || '').trim().toLowerCase())
        .filter(Boolean)
    );

    const tempoPermanencia = temposPermanenciaPorUnidade.get(unidadeId) || 0;
    const ticketMedio = alunosPagantes > 0 ? mrr / alunosPagantes : 0;
    const reajustesConfirmados = movimentacoes
      .filter(mov => String(mov.unidade_id || '') === unidadeId)
      .filter(mov => isCompetenciaNoPeriodo(mov, inicioMes, dataCorte))
      .map(percentualReajusteMedioCanonico)
      .filter((valor): valor is number => valor !== null);
    const reajustePct = reajustesConfirmados.length > 0
      ? reajustesConfirmados.reduce((acc, valor) => acc + valor, 0) / reajustesConfirmados.length
      : 0;

    return {
      unidade_id: unidadeId,
      unidade_nome: unidadesMap.get(unidadeId) || unidade.nome || 'Unidade',
      ano,
      mes,
      alunosAtivos,
      alunosPagantes,
      ticketMedio,
      mrr,
      arr: mrr * 12,
      churnRate: alunosPagantes > 0 ? (evasoesKeys.size / alunosPagantes) * 100 : 0,
      evasoes: evasoesKeys.size,
      inadimplencia: inadimplenciaPct,
      tempoPermanencia,
      ltv: ticketMedio * tempoPermanencia,
      matriculasAtivas,
      matriculasBaseAlunosAtivos: alunosAtivos,
      matriculasBanda,
      matriculasSegundoCurso,
      alunosComSegundoCurso,
      matriculasSegundoCursoExtras: Math.max(matriculasSegundoCurso - alunosComSegundoCurso, 0),
      matriculasCoral,
      novasMatriculas: novasMatriculasKeys.size,
      bolsistasIntegrais: pessoasArray.filter(pessoa => pessoa.bolsistaIntegralRegular).length,
      bolsistasIntegraisRegulares: pessoasArray.filter(pessoa => pessoa.bolsistaIntegralRegular).length,
      bolsistasIntegraisSegundoCurso: pessoasArray.filter(pessoa =>
        pessoa.bolsistaIntegralSegundoCurso && !pessoa.bolsistaIntegralRegular
      ).length,
      bolsistasParciais: pessoasArray.filter(pessoa => pessoa.bolsistaParcial).length,
      kids: pessoasArray.filter(pessoa => pessoa.idade !== null && pessoa.idade <= 11).length,
      school: pessoasArray.filter(pessoa => pessoa.idade !== null && pessoa.idade >= 12).length,
      semClassificacao: pessoasArray.filter(pessoa => pessoa.idade === null).length,
      faturamentoPrevisto: mrr,
      faturamentoRealizado: Math.max(mrr - valorInadimplente, 0),
      reajustePct,
      reajustesValidos: reajustesConfirmados.length,
    };
  });
}

export async function fetchKPIsAlunosVivosCanonicos({
  unidadeId = 'todos',
  ano,
  mes,
}: FetchKPIsAlunosVivosParams): Promise<KPIsAlunosVivosPorUnidade[]> {
  const unidadeFiltro = unidadeId && unidadeId !== 'todos' ? String(unidadeId) : null;
  const { data, error } = await supabase.rpc('get_kpis_alunos_canonicos', {
    p_unidade_id: unidadeFiltro,
    p_ano: ano,
    p_mes: mes,
  });

  if (error) throw error;

  return (data?.por_unidade || []).map((row: any) => ({
    unidade_id: String(row.unidade_id || ''),
    unidade_nome: String(row.unidade_nome || 'Unidade'),
    ano: n(row.ano ?? ano),
    mes: n(row.mes ?? mes),
    alunosAtivos: n(row.alunos_ativos),
    alunosPagantes: n(row.alunos_pagantes),
    ticketMedio: n(row.ticket_medio),
    mrr: n(row.mrr),
    arr: n(row.arr),
    churnRate: n(row.churn_rate),
    evasoes: n(row.evasoes),
    inadimplencia: n(row.inadimplencia ?? row.inadimplencia_pct),
    tempoPermanencia: n(row.tempo_permanencia ?? row.tempo_permanencia_medio),
    ltv: n(row.ltv_medio),
    matriculasAtivas: n(row.matriculas_ativas),
    matriculasBaseAlunosAtivos: n(row.matriculas_base_alunos_ativos),
    matriculasBanda: n(row.matriculas_banda),
    matriculasSegundoCurso: n(row.matriculas_2_curso),
    alunosComSegundoCurso: n(row.alunos_com_2_curso),
    matriculasSegundoCursoExtras: n(row.matriculas_2_curso_extras),
    matriculasCoral: n(row.matriculas_coral),
    novasMatriculas: n(row.novas_matriculas),
    bolsistasIntegrais: n(row.bolsistas_integrais),
    bolsistasIntegraisRegulares: n(row.bolsistas_integrais_regulares),
    bolsistasIntegraisSegundoCurso: n(row.bolsistas_integrais_segundo_curso),
    bolsistasParciais: n(row.bolsistas_parciais),
    kids: n(row.alunos_kids),
    school: n(row.alunos_school),
    semClassificacao: n(row.alunos_sem_classificacao),
    faturamentoPrevisto: n(row.faturamento_previsto),
    faturamentoRealizado: n(row.faturamento_realizado),
    reajustePct: n(row.reajuste_pct ?? row.reajuste_medio),
    reajustesValidos: n(row.reajustes_validos),
  }));
}
