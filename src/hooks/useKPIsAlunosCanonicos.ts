import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchKPIsAlunosVivosCanonicos } from '@/lib/kpisAlunosVivosCanonicos';

export type FonteKPIAlunos = 'dados_mensais' | 'vivo' | 'preliminar' | 'indisponivel';

export interface KPIsAlunosCanonicosPorUnidade {
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

export interface KPIsAlunosCanonicos {
  fonte: FonteKPIAlunos;
  fonteLabel: string;
  competenciaFechada: boolean;
  competenciaParcial: boolean;
  alertasFonte: string[];
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
  reajustesValidos: number;
  porUnidade: KPIsAlunosCanonicosPorUnidade[];
}

interface FetchKPIsAlunosCanonicosParams {
  unidadeId?: string | 'todos' | null;
  ano: number;
  mes: number;
  mesFim?: number;
}

interface UseKPIsAlunosCanonicosResult {
  data: KPIsAlunosCanonicos | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

const ZERO_KPIS = {
  alunosAtivos: 0,
  alunosPagantes: 0,
  ticketMedio: 0,
  mrr: 0,
  arr: 0,
  churnRate: 0,
  evasoes: 0,
  inadimplencia: 0,
  tempoPermanencia: 0,
  ltv: 0,
  matriculasAtivas: 0,
  matriculasBaseAlunosAtivos: 0,
  matriculasBanda: 0,
  matriculasSegundoCurso: 0,
  alunosComSegundoCurso: 0,
  matriculasSegundoCursoExtras: 0,
  matriculasCoral: 0,
  novasMatriculas: 0,
  bolsistasIntegrais: 0,
  bolsistasIntegraisRegulares: 0,
  bolsistasIntegraisSegundoCurso: 0,
  bolsistasParciais: 0,
  kids: 0,
  school: 0,
  semClassificacao: 0,
  faturamentoPrevisto: 0,
  faturamentoRealizado: 0,
  reajustePct: 0,
  reajustesValidos: 0,
};

function n(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isMesAtual(ano: number, mes: number) {
  const hoje = new Date();
  return ano === hoje.getFullYear() && mes === hoje.getMonth() + 1;
}

function fonteLabel(fonte: FonteKPIAlunos): string {
  if (fonte === 'dados_mensais') return 'Snapshot fechado';
  if (fonte === 'vivo') return 'Cálculo vivo';
  if (fonte === 'preliminar') return 'Preliminar';
  return 'Indisponível';
}

function mapDadosMensais(row: any): KPIsAlunosCanonicosPorUnidade {
  const mrr = n(row.faturamento_estimado);
  const ticketMedio = n(row.ticket_medio);
  const tempoPermanencia = n(row.tempo_permanencia);
  const matriculasAtivas = n(row.matriculas_ativas);
  const matriculasBanda = n(row.matriculas_banda);
  const matriculasSegundoCurso = n(row.matriculas_2_curso);
  const matriculasCoral = n(row.matriculas_coral || row.alunos_coral);

  return {
    unidade_id: String(row.unidade_id || ''),
    unidade_nome: row.unidades?.nome || row.unidade_nome || 'Unidade',
    ano: n(row.ano),
    mes: n(row.mes),
    alunosAtivos: n(row.alunos_ativos),
    alunosPagantes: n(row.alunos_pagantes),
    ticketMedio,
    mrr,
    arr: mrr * 12,
    churnRate: n(row.churn_rate),
    evasoes: n(row.evasoes),
    inadimplencia: n(row.inadimplencia),
    tempoPermanencia,
    ltv: ticketMedio * tempoPermanencia,
    matriculasAtivas,
    matriculasBaseAlunosAtivos: n(row.matriculas_base_alunos_ativos) || n(row.alunos_ativos),
    matriculasBanda,
    matriculasSegundoCurso,
    alunosComSegundoCurso: n(row.alunos_com_2_curso),
    matriculasSegundoCursoExtras: n(row.matriculas_2_curso_extras),
    matriculasCoral,
    novasMatriculas: n(row.novas_matriculas),
    bolsistasIntegrais: n(row.bolsistas_integrais),
    bolsistasIntegraisRegulares: n(row.bolsistas_integrais_regulares),
    bolsistasIntegraisSegundoCurso: n(row.bolsistas_integrais_segundo_curso),
    bolsistasParciais: n(row.bolsistas_parciais),
    kids: n(row.la_music_kids || row.total_la_kids),
    school: n(row.la_music_school || row.total_la_adultos),
    semClassificacao: n(row.la_music_sem_classificacao || row.total_la_sem_classificacao),
    faturamentoPrevisto: mrr,
    faturamentoRealizado: mrr * (1 - n(row.inadimplencia) / 100),
    reajustePct: n(row.reajuste_parcelas),
    reajustesValidos: n(row.reajustes_validos),
  };
}

export function consolidarKPIsAlunosCanonicos(
  rows: KPIsAlunosCanonicosPorUnidade[],
  base: Pick<KPIsAlunosCanonicos, 'fonte' | 'competenciaFechada' | 'competenciaParcial' | 'alertasFonte' | 'ano' | 'mes'>,
  unidadeId: string | 'todos' = 'todos'
): KPIsAlunosCanonicos {
  const totalPagantes = rows.reduce((acc, row) => acc + row.alunosPagantes, 0);
  const totalMrr = rows.reduce((acc, row) => acc + row.mrr, 0);
  const totalAtivos = rows.reduce((acc, row) => acc + row.alunosAtivos, 0);
  const totalEvasoes = rows.reduce((acc, row) => acc + row.evasoes, 0);
  const totalReajustesValidos = rows.reduce((acc, row) => acc + row.reajustesValidos, 0);
  const count = rows.length || 1;
  const unidadeNome = unidadeId === 'todos'
    ? 'Consolidado'
    : rows[0]?.unidade_nome || 'Unidade';
  const reajustePct = totalReajustesValidos > 0
    ? rows.reduce((acc, row) => acc + (row.reajustePct * row.reajustesValidos), 0) / totalReajustesValidos
    : rows.reduce((acc, row) => acc + row.reajustePct, 0) / count;

  return {
    ...base,
    fonteLabel: fonteLabel(base.fonte),
    unidade_id: unidadeId,
    unidade_nome: unidadeNome,
    alunosAtivos: totalAtivos,
    alunosPagantes: totalPagantes,
    ticketMedio: totalPagantes > 0 ? totalMrr / totalPagantes : 0,
    mrr: totalMrr,
    arr: totalMrr * 12,
    churnRate: rows.length === 1 ? rows[0].churnRate : rows.reduce((acc, row) => acc + row.churnRate, 0) / count,
    evasoes: totalEvasoes,
    inadimplencia: rows.reduce((acc, row) => acc + row.inadimplencia, 0) / count,
    tempoPermanencia: rows.reduce((acc, row) => acc + row.tempoPermanencia, 0) / count,
    ltv: rows.reduce((acc, row) => acc + row.ltv, 0) / count,
    matriculasAtivas: rows.reduce((acc, row) => acc + row.matriculasAtivas, 0),
    matriculasBaseAlunosAtivos: rows.reduce((acc, row) => acc + row.matriculasBaseAlunosAtivos, 0),
    matriculasBanda: rows.reduce((acc, row) => acc + row.matriculasBanda, 0),
    matriculasSegundoCurso: rows.reduce((acc, row) => acc + row.matriculasSegundoCurso, 0),
    alunosComSegundoCurso: rows.reduce((acc, row) => acc + row.alunosComSegundoCurso, 0),
    matriculasSegundoCursoExtras: rows.reduce((acc, row) => acc + row.matriculasSegundoCursoExtras, 0),
    matriculasCoral: rows.reduce((acc, row) => acc + row.matriculasCoral, 0),
    novasMatriculas: rows.reduce((acc, row) => acc + row.novasMatriculas, 0),
    bolsistasIntegrais: rows.reduce((acc, row) => acc + row.bolsistasIntegrais, 0),
    bolsistasIntegraisRegulares: rows.reduce((acc, row) => acc + row.bolsistasIntegraisRegulares, 0),
    bolsistasIntegraisSegundoCurso: rows.reduce((acc, row) => acc + row.bolsistasIntegraisSegundoCurso, 0),
    bolsistasParciais: rows.reduce((acc, row) => acc + row.bolsistasParciais, 0),
    kids: rows.reduce((acc, row) => acc + row.kids, 0),
    school: rows.reduce((acc, row) => acc + row.school, 0),
    semClassificacao: rows.reduce((acc, row) => acc + row.semClassificacao, 0),
    faturamentoPrevisto: rows.reduce((acc, row) => acc + row.faturamentoPrevisto, 0),
    faturamentoRealizado: rows.reduce((acc, row) => acc + row.faturamentoRealizado, 0),
    reajustePct,
    reajustesValidos: totalReajustesValidos,
    porUnidade: rows,
  };
}

export async function fetchKPIsAlunosCanonicos({
  unidadeId = 'todos',
  ano,
  mes,
  mesFim = mes,
}: FetchKPIsAlunosCanonicosParams): Promise<KPIsAlunosCanonicos> {
  const unidadeFiltro = unidadeId && unidadeId !== 'todos' ? unidadeId : null;
  const periodoAtualUnico = mes === mesFim && isMesAtual(ano, mes);

  let competenciasQuery = supabase
    .from('competencias_mensais')
    .select('unidade_id, status')
    .eq('ano', ano)
    .gte('mes', mes)
    .lte('mes', mesFim);

  if (unidadeFiltro) {
    competenciasQuery = competenciasQuery.eq('unidade_id', unidadeFiltro);
  }

  const { data: competencias, error: competenciasError } = await competenciasQuery;
  if (competenciasError) throw competenciasError;

  const fechadas = (competencias || []).filter((row: any) => row.status === 'fechado' || row.status === 'retificacao_pendente');
  const competenciaFechada = unidadeFiltro
    ? fechadas.length > 0
    : (competencias || []).length > 0 && fechadas.length === (competencias || []).length;
  const competenciaParcial = !unidadeFiltro && fechadas.length > 0 && !competenciaFechada;

  if (periodoAtualUnico && fechadas.length === 0) {
    const rows = await fetchKPIsAlunosVivosCanonicos({ unidadeId, ano, mes });
    return consolidarKPIsAlunosCanonicos(rows, {
      fonte: rows.length > 0 ? 'vivo' : 'indisponivel',
      competenciaFechada: false,
      competenciaParcial: false,
      alertasFonte: rows.length > 0
        ? ['Mês atual aberto: KPIs executivos de alunos calculados pela fonte viva canônica.']
        : ['Mês atual sem dados na fonte viva canônica.'],
      ano,
      mes,
    }, unidadeId || 'todos');
  }

  let dadosQuery = supabase
    .from('dados_mensais')
    .select('*, unidades:unidade_id(nome)')
    .eq('ano', ano)
    .gte('mes', mes)
    .lte('mes', mesFim);

  if (unidadeFiltro) {
    dadosQuery = dadosQuery.eq('unidade_id', unidadeFiltro);
  }

  const { data: dadosMensais, error: dadosMensaisError } = await dadosQuery;
  if (dadosMensaisError) throw dadosMensaisError;

  if (dadosMensais && dadosMensais.length > 0) {
    const rows = dadosMensais.map(mapDadosMensais);
    return consolidarKPIsAlunosCanonicos(rows, {
      fonte: competenciaFechada || competenciaParcial ? 'dados_mensais' : 'preliminar',
      competenciaFechada,
      competenciaParcial,
      alertasFonte: competenciaFechada || competenciaParcial
        ? ['Competência fechada: KPIs executivos lidos de dados_mensais.']
        : ['Competência aberta com snapshot existente: exibir como preliminar até fechamento formal.'],
      ano,
      mes,
    }, unidadeId || 'todos');
  }

  return consolidarKPIsAlunosCanonicos([], {
    fonte: 'indisponivel',
    competenciaFechada: false,
    competenciaParcial: false,
    alertasFonte: ['Competência sem snapshot em dados_mensais. Recalcular silenciosamente a partir de alunos está bloqueado.'],
    ano,
    mes,
  }, unidadeId || 'todos');
}

export function emptyKPIsAlunosCanonicos(ano: number, mes: number): KPIsAlunosCanonicos {
  return {
    fonte: 'indisponivel',
    fonteLabel: fonteLabel('indisponivel'),
    competenciaFechada: false,
    competenciaParcial: false,
    alertasFonte: ['Competência indisponível.'],
    unidade_id: 'todos',
    unidade_nome: 'Consolidado',
    ano,
    mes,
    ...ZERO_KPIS,
    porUnidade: [],
  };
}

export function useKPIsAlunosCanonicos(params: FetchKPIsAlunosCanonicosParams): UseKPIsAlunosCanonicosResult {
  const [data, setData] = useState<KPIsAlunosCanonicos | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await fetchKPIsAlunosCanonicos(params);
      setData(result);
    } catch (err) {
      console.error('Erro ao buscar KPIs canônicos de alunos:', err);
      setError(err as Error);
      setData(emptyKPIsAlunosCanonicos(params.ano, params.mes));
    } finally {
      setIsLoading(false);
    }
  }, [params.unidadeId, params.ano, params.mes, params.mesFim]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}

export default useKPIsAlunosCanonicos;
