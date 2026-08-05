import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchKPIsAlunosVivosCanonicos } from '@/lib/kpisAlunosVivosCanonicos';

export type FonteKPIAlunos = 'snapshot' | 'dados_mensais' | 'vivo' | 'preliminar' | 'indisponivel';

export interface KPIsAlunosCanonicosPorUnidade {
  unidade_id: string;
  unidade_nome: string;
  ano: number;
  mes: number;
  alunosAtivos: number;
  alunosPagantes: number;
  ticketMedio: number;
  ticketMedioPrevisto?: number;
  ticketDenominadorFaturas?: number;
  ticketDenominadorFaturasPrevisto?: number;
  financeiroFaturasEmusys?: boolean;
  mrr: number;
  arr: number;
  churnRate: number;
  evasoes: number;
  inadimplencia: number;
  tempoPermanencia: number;
  ltv: number;
  matriculasAtivas: number;
  matriculasBaseAlunosAtivos: number | null;
  matriculasBanda: number;
  matriculasSegundoCurso: number;
  alunosComSegundoCurso: number | null;
  matriculasSegundoCursoExtras: number | null;
  matriculasCoral: number | null;
  novasMatriculas: number;
  bolsistasIntegrais: number;
  bolsistasIntegraisRegulares: number | null;
  bolsistasIntegraisSegundoCurso: number | null;
  bolsistasParciais: number;
  kids: number | null;
  school: number | null;
  semClassificacao: number | null;
  faturamentoPrevisto: number;
  faturamentoRealizado: number;
  reajustePct: number;
  reajustesValidos: number | null;
  snapshotId?: string | null;
  snapshotVersao?: number | null;
  snapshotStatus?: string | null;
  snapshotCapturadoEm?: string | null;
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
  ticketMedioPrevisto?: number;
  ticketDenominadorFaturas?: number;
  ticketDenominadorFaturasPrevisto?: number;
  financeiroFaturasEmusys?: boolean;
  mrr: number;
  arr: number;
  churnRate: number;
  evasoes: number;
  inadimplencia: number;
  tempoPermanencia: number;
  ltv: number;
  matriculasAtivas: number;
  matriculasBaseAlunosAtivos: number | null;
  matriculasBanda: number;
  matriculasSegundoCurso: number;
  alunosComSegundoCurso: number | null;
  matriculasSegundoCursoExtras: number | null;
  matriculasCoral: number | null;
  novasMatriculas: number;
  bolsistasIntegrais: number;
  bolsistasIntegraisRegulares: number | null;
  bolsistasIntegraisSegundoCurso: number | null;
  bolsistasParciais: number;
  kids: number | null;
  school: number | null;
  semClassificacao: number | null;
  faturamentoPrevisto: number;
  faturamentoRealizado: number;
  reajustePct: number;
  reajustesValidos: number | null;
  snapshotId?: string | null;
  snapshotVersao?: number | null;
  snapshotStatus?: string | null;
  snapshotCapturadoEm?: string | null;
  porUnidade: KPIsAlunosCanonicosPorUnidade[];
}

interface SnapshotAlunosExecutivoRow {
  id: string;
  ano: number;
  mes: number;
  escopo: 'unidade' | 'consolidado';
  unidade_id: string | null;
  versao: number;
  status: string;
  payload: Record<string, unknown>;
  capturado_em: string | null;
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
  ticketMedioPrevisto: 0,
  ticketDenominadorFaturas: 0,
  ticketDenominadorFaturasPrevisto: 0,
  financeiroFaturasEmusys: false,
  mrr: 0,
  arr: 0,
  churnRate: 0,
  evasoes: 0,
  inadimplencia: 0,
  tempoPermanencia: 0,
  ltv: 0,
  matriculasAtivas: 0,
  matriculasBaseAlunosAtivos: null,
  matriculasBanda: 0,
  matriculasSegundoCurso: 0,
  alunosComSegundoCurso: null,
  matriculasSegundoCursoExtras: null,
  matriculasCoral: null,
  novasMatriculas: 0,
  bolsistasIntegrais: 0,
  bolsistasIntegraisRegulares: null,
  bolsistasIntegraisSegundoCurso: null,
  bolsistasParciais: 0,
  kids: null,
  school: null,
  semClassificacao: null,
  faturamentoPrevisto: 0,
  faturamentoRealizado: 0,
  reajustePct: 0,
  reajustesValidos: null,
};

function n(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nNullable(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function somarCampoCompleto(
  rows: KPIsAlunosCanonicosPorUnidade[],
  selecionar: (row: KPIsAlunosCanonicosPorUnidade) => number | null
): number | null {
  if (rows.length === 0) return null;
  const valores = rows.map(selecionar);
  if (valores.some(valor => valor === null)) return null;
  return (valores as number[]).reduce((total, valor) => total + valor, 0);
}

function isMesAtual(ano: number, mes: number) {
  const hoje = new Date();
  return ano === hoje.getFullYear() && mes === hoje.getMonth() + 1;
}

function fonteLabel(fonte: FonteKPIAlunos): string {
  if (fonte === 'snapshot') return 'Snapshot canônico fechado';
  if (fonte === 'dados_mensais') return 'Histórico legado';
  if (fonte === 'vivo') return 'Cálculo vivo';
  if (fonte === 'preliminar') return 'Preliminar';
  return 'Indisponível';
}

function mapSnapshotAlunosExecutivo(snapshot: SnapshotAlunosExecutivoRow): KPIsAlunosCanonicosPorUnidade {
  const payload = snapshot.payload || {};
  const mrr = n(payload.mrr);
  const ticketMedio = n(payload.ticket_medio);
  const tempoPermanencia = n(payload.tempo_permanencia_medio ?? payload.tempo_permanencia);

  return {
    unidade_id: String(snapshot.unidade_id || payload.unidade_id || ''),
    unidade_nome: String(payload.unidade_nome || (snapshot.escopo === 'consolidado' ? 'Consolidado' : 'Unidade')),
    ano: snapshot.ano,
    mes: snapshot.mes,
    alunosAtivos: n(payload.alunos_ativos ?? payload.total_alunos_ativos),
    alunosPagantes: n(payload.alunos_pagantes ?? payload.total_alunos_pagantes),
    ticketMedio,
    ticketMedioPrevisto: ticketMedio,
    ticketDenominadorFaturas: 0,
    ticketDenominadorFaturasPrevisto: 0,
    financeiroFaturasEmusys: false,
    mrr,
    arr: n(payload.arr) || mrr * 12,
    churnRate: n(payload.churn_rate),
    evasoes: n(payload.evasoes ?? payload.total_evasoes),
    inadimplencia: n(payload.inadimplencia_pct ?? payload.inadimplencia),
    tempoPermanencia,
    ltv: n(payload.ltv_medio) || ticketMedio * tempoPermanencia,
    matriculasAtivas: n(payload.matriculas_ativas),
    matriculasBaseAlunosAtivos: nNullable(payload.matriculas_base_alunos_ativos),
    matriculasBanda: n(payload.matriculas_banda),
    matriculasSegundoCurso: n(payload.matriculas_2_curso),
    alunosComSegundoCurso: nNullable(payload.alunos_com_2_curso),
    matriculasSegundoCursoExtras: nNullable(payload.matriculas_2_curso_extras),
    matriculasCoral: nNullable(payload.matriculas_coral),
    novasMatriculas: n(payload.novas_matriculas),
    bolsistasIntegrais: n(payload.bolsistas_integrais ?? payload.total_bolsistas_integrais),
    bolsistasIntegraisRegulares: nNullable(payload.bolsistas_integrais_regulares),
    bolsistasIntegraisSegundoCurso: nNullable(payload.bolsistas_integrais_segundo_curso),
    bolsistasParciais: n(payload.bolsistas_parciais ?? payload.total_bolsistas_parciais),
    kids: nNullable(payload.alunos_kids),
    school: nNullable(payload.alunos_school),
    semClassificacao: nNullable(payload.alunos_sem_classificacao),
    faturamentoPrevisto: n(payload.faturamento_previsto) || mrr,
    faturamentoRealizado: n(payload.faturamento_realizado),
    reajustePct: n(payload.reajuste_pct ?? payload.reajuste_medio),
    reajustesValidos: nNullable(payload.reajustes_validos),
    snapshotId: snapshot.id,
    snapshotVersao: snapshot.versao,
    snapshotStatus: snapshot.status,
    snapshotCapturadoEm: snapshot.capturado_em,
  };
}

function chaveSnapshot(snapshot: SnapshotAlunosExecutivoRow): string {
  return `${snapshot.ano}:${snapshot.mes}:${snapshot.escopo}:${snapshot.unidade_id || 'consolidado'}`;
}

async function fetchSnapshotsAlunosExecutivo({
  unidadeId,
  ano,
  mes,
  mesFim,
}: Required<Pick<FetchKPIsAlunosCanonicosParams, 'ano' | 'mes' | 'mesFim'>> & {
  unidadeId?: string | 'todos' | null;
}): Promise<SnapshotAlunosExecutivoRow[]> {
  let query = supabase
    .from('fechamento_mensal_snapshots')
    .select('id, ano, mes, escopo, unidade_id, versao, status, payload, capturado_em')
    .eq('dominio', 'alunos_executivo')
    .eq('ano', ano)
    .gte('mes', mes)
    .lte('mes', mesFim)
    .in('status', ['fechado', 'retificado'])
    .order('versao', { ascending: false });

  if (unidadeId && unidadeId !== 'todos') {
    query = query.eq('escopo', 'unidade').eq('unidade_id', unidadeId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const maisRecentes = new Map<string, SnapshotAlunosExecutivoRow>();
  for (const row of (data || []) as SnapshotAlunosExecutivoRow[]) {
    const chave = chaveSnapshot(row);
    if (!maisRecentes.has(chave)) {
      maisRecentes.set(chave, row);
    }
  }
  return [...maisRecentes.values()];
}

function aplicarTotaisDoSnapshotConsolidado(
  base: KPIsAlunosCanonicos,
  snapshotConsolidado: KPIsAlunosCanonicosPorUnidade,
  rowsUnidade: KPIsAlunosCanonicosPorUnidade[]
): KPIsAlunosCanonicos {
  const { unidade_id: _unidadeId, unidade_nome: _unidadeNome, ...totais } = snapshotConsolidado;
  return {
    ...base,
    ...totais,
    unidade_id: 'todos',
    unidade_nome: 'Consolidado',
    porUnidade: rowsUnidade,
  };
}

function montarKPIsDeSnapshots(
  snapshots: SnapshotAlunosExecutivoRow[],
  {
    unidadeId,
    ano,
    mes,
    mesFim,
  }: Required<Pick<FetchKPIsAlunosCanonicosParams, 'ano' | 'mes' | 'mesFim'>> & {
    unidadeId?: string | 'todos' | null;
  }
): KPIsAlunosCanonicos | null {
  const mesesEsperados = Array.from({ length: Math.max(mesFim - mes + 1, 0) }, (_, index) => mes + index);
  const unidadeFiltro = unidadeId && unidadeId !== 'todos' ? unidadeId : null;
  const snapshotsUnidade = snapshots.filter(snapshot => snapshot.escopo === 'unidade');
  const snapshotsConsolidados = snapshots.filter(snapshot => snapshot.escopo === 'consolidado');
  const coberturaCompleta = unidadeFiltro
    ? mesesEsperados.every(mesAtual => snapshotsUnidade.some(snapshot => snapshot.mes === mesAtual && snapshot.unidade_id === unidadeFiltro))
    : mesesEsperados.every(mesAtual => snapshotsConsolidados.some(snapshot => snapshot.mes === mesAtual));

  if (!coberturaCompleta) return null;

  const rowsUnidade = snapshotsUnidade.map(mapSnapshotAlunosExecutivo);
  const base = consolidarKPIsAlunosCanonicos(rowsUnidade, {
    fonte: 'snapshot',
    competenciaFechada: true,
    competenciaParcial: false,
    alertasFonte: ['Competência fechada: KPIs de gestão lidos do snapshot canônico versionado.'],
    ano,
    mes,
  }, unidadeId || 'todos');

  if (!unidadeFiltro && mes === mesFim) {
    const snapshotConsolidado = snapshotsConsolidados.find(snapshot => snapshot.mes === mes);
    if (snapshotConsolidado) {
      return aplicarTotaisDoSnapshotConsolidado(base, mapSnapshotAlunosExecutivo(snapshotConsolidado), rowsUnidade);
    }
  }

  return base;
}

function mapDadosMensais(row: any): KPIsAlunosCanonicosPorUnidade {
  const mrr = n(row.faturamento_estimado);
  const ticketMedio = n(row.ticket_medio);
  const tempoPermanencia = n(row.tempo_permanencia);
  const matriculasAtivas = n(row.matriculas_ativas);
  const matriculasBanda = n(row.matriculas_banda);
  const matriculasSegundoCurso = n(row.matriculas_2_curso);

  return {
    unidade_id: String(row.unidade_id || ''),
    unidade_nome: row.unidades?.nome || row.unidade_nome || 'Unidade',
    ano: n(row.ano),
    mes: n(row.mes),
    alunosAtivos: n(row.alunos_ativos),
    alunosPagantes: n(row.alunos_pagantes),
    ticketMedio,
    ticketMedioPrevisto: ticketMedio,
    ticketDenominadorFaturas: 0,
    ticketDenominadorFaturasPrevisto: 0,
    financeiroFaturasEmusys: false,
    mrr,
    arr: mrr * 12,
    churnRate: n(row.churn_rate),
    evasoes: n(row.evasoes),
    inadimplencia: n(row.inadimplencia),
    tempoPermanencia,
    ltv: ticketMedio * tempoPermanencia,
    matriculasAtivas,
    // dados_mensais nao possui o detalhamento abaixo. Ausencia de coluna e
    // desconhecido, nao zero e nao equivale a outro indicador.
    matriculasBaseAlunosAtivos: null,
    matriculasBanda,
    matriculasSegundoCurso,
    alunosComSegundoCurso: null,
    matriculasSegundoCursoExtras: null,
    matriculasCoral: null,
    novasMatriculas: n(row.novas_matriculas),
    bolsistasIntegrais: n(row.bolsistas_integrais),
    bolsistasIntegraisRegulares: null,
    bolsistasIntegraisSegundoCurso: null,
    bolsistasParciais: n(row.bolsistas_parciais),
    kids: null,
    school: null,
    semClassificacao: null,
    faturamentoPrevisto: mrr,
    faturamentoRealizado: mrr * (1 - n(row.inadimplencia) / 100),
    reajustePct: n(row.reajuste_parcelas),
    reajustesValidos: null,
  };
}

export function consolidarKPIsAlunosCanonicos(
  rows: KPIsAlunosCanonicosPorUnidade[],
  base: Pick<KPIsAlunosCanonicos, 'fonte' | 'competenciaFechada' | 'competenciaParcial' | 'alertasFonte' | 'ano' | 'mes'>,
  unidadeId: string | 'todos' = 'todos'
): KPIsAlunosCanonicos {
  const totalPagantes = rows.reduce((acc, row) => acc + row.alunosPagantes, 0);
  const totalMrr = rows.reduce((acc, row) => acc + row.mrr, 0);
  const totalFaturamentoPrevisto = rows.reduce((acc, row) => acc + row.faturamentoPrevisto, 0);
  const totalTicketDenominador = rows.reduce((acc, row) => acc + (row.ticketDenominadorFaturas || 0), 0);
  const totalTicketDenominadorPrevisto = rows.reduce((acc, row) => acc + (row.ticketDenominadorFaturasPrevisto || 0), 0);
  const totalAtivos = rows.reduce((acc, row) => acc + row.alunosAtivos, 0);
  const totalEvasoes = rows.reduce((acc, row) => acc + row.evasoes, 0);
  const totalReajustesValidos = somarCampoCompleto(rows, row => row.reajustesValidos);
  const count = rows.length || 1;
  const financeiroFaturasEmusys = rows.some(row => row.financeiroFaturasEmusys);
  const ticketMedio = totalTicketDenominador > 0
    ? totalMrr / totalTicketDenominador
    : totalPagantes > 0 ? totalMrr / totalPagantes : 0;
  const ticketMedioPrevisto = totalTicketDenominadorPrevisto > 0
    ? totalFaturamentoPrevisto / totalTicketDenominadorPrevisto
    : ticketMedio;
  const unidadeNome = unidadeId === 'todos'
    ? 'Consolidado'
    : rows[0]?.unidade_nome || 'Unidade';
  const reajustePct = totalReajustesValidos !== null && totalReajustesValidos > 0
    ? rows.reduce((acc, row) => acc + (row.reajustePct * (row.reajustesValidos ?? 0)), 0) / totalReajustesValidos
    : rows.reduce((acc, row) => acc + row.reajustePct, 0) / count;

  return {
    ...base,
    alertasFonte: base.alertasFonte,
    fonteLabel: fonteLabel(base.fonte),
    unidade_id: unidadeId,
    unidade_nome: unidadeNome,
    alunosAtivos: totalAtivos,
    alunosPagantes: totalPagantes,
    ticketMedio,
    ticketMedioPrevisto,
    ticketDenominadorFaturas: totalTicketDenominador,
    ticketDenominadorFaturasPrevisto: totalTicketDenominadorPrevisto,
    financeiroFaturasEmusys,
    mrr: totalMrr,
    arr: totalMrr * 12,
    churnRate: rows.length === 1 ? rows[0].churnRate : rows.reduce((acc, row) => acc + row.churnRate, 0) / count,
    evasoes: totalEvasoes,
    inadimplencia: rows.reduce((acc, row) => acc + row.inadimplencia, 0) / count,
    tempoPermanencia: rows.reduce((acc, row) => acc + row.tempoPermanencia, 0) / count,
    ltv: rows.reduce((acc, row) => acc + row.ltv, 0) / count,
    matriculasAtivas: rows.reduce((acc, row) => acc + row.matriculasAtivas, 0),
    matriculasBaseAlunosAtivos: somarCampoCompleto(rows, row => row.matriculasBaseAlunosAtivos),
    matriculasBanda: rows.reduce((acc, row) => acc + row.matriculasBanda, 0),
    matriculasSegundoCurso: rows.reduce((acc, row) => acc + row.matriculasSegundoCurso, 0),
    alunosComSegundoCurso: somarCampoCompleto(rows, row => row.alunosComSegundoCurso),
    matriculasSegundoCursoExtras: somarCampoCompleto(rows, row => row.matriculasSegundoCursoExtras),
    matriculasCoral: somarCampoCompleto(rows, row => row.matriculasCoral),
    novasMatriculas: rows.reduce((acc, row) => acc + row.novasMatriculas, 0),
    bolsistasIntegrais: rows.reduce((acc, row) => acc + row.bolsistasIntegrais, 0),
    bolsistasIntegraisRegulares: somarCampoCompleto(rows, row => row.bolsistasIntegraisRegulares),
    bolsistasIntegraisSegundoCurso: somarCampoCompleto(rows, row => row.bolsistasIntegraisSegundoCurso),
    bolsistasParciais: rows.reduce((acc, row) => acc + row.bolsistasParciais, 0),
    kids: somarCampoCompleto(rows, row => row.kids),
    school: somarCampoCompleto(rows, row => row.school),
    semClassificacao: somarCampoCompleto(rows, row => row.semClassificacao),
    faturamentoPrevisto: totalFaturamentoPrevisto,
    faturamentoRealizado: rows.reduce((acc, row) => acc + row.faturamentoRealizado, 0),
    reajustePct,
    reajustesValidos: totalReajustesValidos,
    snapshotId: rows.length === 1 ? rows[0].snapshotId ?? null : null,
    snapshotVersao: rows.length === 1 ? rows[0].snapshotVersao ?? null : null,
    snapshotStatus: rows.length === 1 ? rows[0].snapshotStatus ?? null : null,
    snapshotCapturadoEm: rows.length === 1 ? rows[0].snapshotCapturadoEm ?? null : null,
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

  const snapshots = await fetchSnapshotsAlunosExecutivo({ unidadeId, ano, mes, mesFim });
  const snapshotCanonico = montarKPIsDeSnapshots(snapshots, { unidadeId, ano, mes, mesFim });
  if (snapshotCanonico) {
    return snapshotCanonico;
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
