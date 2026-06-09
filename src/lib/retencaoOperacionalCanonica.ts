import type { KPIsAlunosCanonicosPorUnidade } from '@/hooks/useKPIsAlunosCanonicos';

export type TipoMovimentacaoRetencao =
  | 'renovacao'
  | 'nao_renovacao'
  | 'aviso_previo'
  | 'evasao'
  | 'trancamento';

export interface MovimentacaoRetencaoRow {
  id?: number | string | null;
  aluno_id?: number | string | null;
  aluno_nome?: string | null;
  unidade_id?: string | null;
  tipo?: string | null;
  data?: string | null;
  mes_saida?: string | null;
  valor_parcela_evasao?: number | string | null;
  valor_parcela_anterior?: number | string | null;
  valor_parcela_novo?: number | string | null;
  tempo_permanencia_meses?: number | string | null;
  forma_pagamento_id?: number | string | null;
  tipo_evasao?: string | null;
  motivo?: string | null;
  observacoes?: string | null;
  agente_comercial?: string | null;
  professor_id?: number | string | null;
  professor_nome?: string | null;
  motivos_saida?: any;
  professores?: any;
  alunos?: {
    valor_parcela?: number | string | null;
    data_matricula?: string | null;
    data_saida?: string | null;
    tipo_matricula_id?: number | string | null;
    is_segundo_curso?: boolean | null;
    classificacao?: string | null;
  } | null;
}

export interface RetencaoOperacionalPorUnidade {
  unidade_id: string;
  unidade_nome: string;
  ano: number;
  mes: number;
  total_evasoes: number;
  evasoes_interrompidas: number;
  avisos_previos: number;
  transferencias: number;
  taxa_evasao: number;
  mrr_perdido: number;
  renovacoes_previstas: number;
  renovacoes_realizadas: number;
  nao_renovacoes: number;
  renovacoes_pendentes: number;
  renovacoes_atrasadas: number;
  taxa_renovacao: number;
  taxa_nao_renovacao: number;
  evasoes_por_motivo: Record<string, number>;
  evasoes_por_professor: Record<string, number>;
  base_alunos_pagantes: number;
}

interface CalcularRetencaoParams {
  movimentacoes: MovimentacaoRetencaoRow[];
  unidades: Array<{ id: string; nome: string }>;
  alunosPagantesPorUnidade: Map<string, number>;
  ano: number;
  mes: number;
  mesFim?: number;
}

function n(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstRelation<T = any>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function inicioMes(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}-01`;
}

function fimMes(ano: number, mes: number): string {
  const dia = new Date(ano, mes, 0).getDate();
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function rangeMesSeguinte(ano: number, mes: number): { inicio: string; fim: string } {
  const proximoMes = mes === 12 ? 1 : mes + 1;
  const proximoAno = mes === 12 ? ano + 1 : ano;
  return {
    inicio: inicioMes(proximoAno, proximoMes),
    fim: fimMes(proximoAno, proximoMes),
  };
}

function chavePessoaMovimentacao(mov: MovimentacaoRetencaoRow): string | null {
  if (mov.aluno_id !== null && mov.aluno_id !== undefined) {
    const alunoId = String(mov.aluno_id).trim();
    if (alunoId) return `id:${alunoId}`;
  }

  const nome = String(mov.aluno_nome || '').trim().toLowerCase();
  const unidadeId = String(mov.unidade_id || '').trim();
  if (!nome || !unidadeId) return null;
  return `nome:${nome}|${unidadeId}`;
}

function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split('T')[0].split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function diffMesesCompletos(inicio: Date, fim: Date): number {
  let meses = (fim.getFullYear() - inicio.getFullYear()) * 12 + (fim.getMonth() - inicio.getMonth());
  if (fim.getDate() < inicio.getDate()) meses -= 1;
  return Math.max(0, meses);
}

export function calcularTempoPermanenciaMovimentacao(mov: MovimentacaoRetencaoRow): number {
  if (mov.tempo_permanencia_meses !== null && mov.tempo_permanencia_meses !== undefined) {
    return n(mov.tempo_permanencia_meses);
  }

  const inicio = parseDateOnly(mov.alunos?.data_matricula);
  const fim = parseDateOnly(mov.data || mov.alunos?.data_saida || null);
  if (!inicio || !fim) return 0;

  return diffMesesCompletos(inicio, fim);
}

export function valorPerdidoMovimentacao(mov: MovimentacaoRetencaoRow): number {
  return n(
    mov.valor_parcela_evasao
      ?? mov.valor_parcela_anterior
      ?? mov.valor_parcela_novo
      ?? mov.alunos?.valor_parcela
  );
}

export function aplicarFallbacksRetencao(mov: MovimentacaoRetencaoRow): MovimentacaoRetencaoRow {
  if (mov.tipo !== 'evasao' && mov.tipo !== 'nao_renovacao') {
    return mov;
  }

  const valor = valorPerdidoMovimentacao(mov);
  const tempo = calcularTempoPermanenciaMovimentacao(mov);

  return {
    ...mov,
    valor_parcela_evasao: mov.valor_parcela_evasao ?? (valor > 0 ? valor : mov.valor_parcela_evasao),
    tempo_permanencia_meses: mov.tempo_permanencia_meses ?? (tempo > 0 ? tempo : mov.tempo_permanencia_meses),
  };
}

function normalizeText(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function isRenovacaoAutomaticaEmusys(mov: MovimentacaoRetencaoRow): boolean {
  if (mov.tipo !== 'renovacao') return false;
  const texto = normalizeText(`${mov.motivo || ''} ${mov.observacoes || ''}`);
  const pareceAutomacao = texto.includes('renovacao automatica via emusys')
    || (texto.includes('automatic') && texto.includes('emusys'));
  return pareceAutomacao || !isRenovacaoConfirmadaOperacional(mov);
}

export function isRenovacaoConfirmadaOperacional(mov: MovimentacaoRetencaoRow): boolean {
  if (mov.tipo !== 'renovacao') return false;

  const agente = String(mov.agente_comercial || '').trim();
  if (!agente) return false;

  const valorAnteriorInformado = mov.valor_parcela_anterior !== null && mov.valor_parcela_anterior !== undefined;
  const valorNovoInformado = mov.valor_parcela_novo !== null && mov.valor_parcela_novo !== undefined;

  return valorAnteriorInformado || valorNovoInformado || Boolean(mov.forma_pagamento_id);
}

function motivoSaida(mov: MovimentacaoRetencaoRow): string {
  const motivoRel = firstRelation(mov.motivos_saida);
  return (
    String(mov.motivo || '').trim() ||
    String(motivoRel?.nome || '').trim() ||
    String(mov.tipo_evasao || '').trim() ||
    'Nao informado'
  );
}

function professorSaida(mov: MovimentacaoRetencaoRow): string {
  const profRel = firstRelation(mov.professores);
  return (
    String(mov.professor_nome || '').trim() ||
    String(profRel?.nome || '').trim() ||
    (mov.professor_id ? `Professor ${mov.professor_id}` : 'Sem professor')
  );
}

function estaNoPeriodoPorData(mov: MovimentacaoRetencaoRow, inicio: string, fim: string): boolean {
  return Boolean(mov.data && mov.data >= inicio && mov.data <= fim);
}

function avisoNoPeriodo(mov: MovimentacaoRetencaoRow, inicio: string, fim: string): boolean {
  return Boolean(mov.mes_saida && mov.mes_saida >= inicio && mov.mes_saida <= fim);
}

function increment(map: Map<string, number>, key: string, value = 1) {
  map.set(key, (map.get(key) || 0) + value);
}

export function calcularRetencaoOperacionalCanonica({
  movimentacoes,
  unidades,
  alunosPagantesPorUnidade,
  ano,
  mes,
  mesFim = mes,
}: CalcularRetencaoParams): RetencaoOperacionalPorUnidade[] {
  const inicio = inicioMes(ano, mes);
  const fim = fimMes(ano, mesFim);
  const saidaAviso = rangeMesSeguinte(ano, mesFim);

  return unidades.map(unidade => {
    const unidadeId = String(unidade.id);
    const movimentosUnidade = movimentacoes.filter(mov => String(mov.unidade_id || '') === unidadeId);
    const movimentosNoPeriodo = movimentosUnidade.filter(mov => {
      if (mov.tipo === 'aviso_previo') return avisoNoPeriodo(mov, saidaAviso.inicio, saidaAviso.fim);
      return estaNoPeriodoPorData(mov, inicio, fim);
    });

    const renovacoes = movimentosNoPeriodo.filter(mov => mov.tipo === 'renovacao');
    const renovacoesConfirmadas = renovacoes.filter(isRenovacaoConfirmadaOperacional);
    const renovacoesPendentesConfirmacao = renovacoes.filter(mov => !isRenovacaoConfirmadaOperacional(mov));
    const avisosPrevios = new Set(
      movimentosNoPeriodo
        .filter(mov => mov.tipo === 'aviso_previo')
        .map(chavePessoaMovimentacao)
        .filter(Boolean) as string[]
    );

    const evasoesMap = new Map<string, MovimentacaoRetencaoRow>();
    const naoRenovacoesMap = new Map<string, MovimentacaoRetencaoRow>();
    const transferenciasMap = new Map<string, MovimentacaoRetencaoRow>();
    const motivosMap = new Map<string, number>();
    const professoresMap = new Map<string, number>();

    movimentosNoPeriodo.forEach(mov => {
      if (mov.tipo !== 'evasao' && mov.tipo !== 'nao_renovacao') return;

      const key = chavePessoaMovimentacao(mov);
      if (!key) return;

      if (mov.tipo === 'evasao') evasoesMap.set(key, mov);
      if (mov.tipo === 'nao_renovacao') naoRenovacoesMap.set(key, mov);

      const tipoEvasao = String(mov.tipo_evasao || '').toLowerCase();
      const motivo = motivoSaida(mov);
      if (tipoEvasao.includes('transfer') || motivo.toLowerCase().includes('transfer')) {
        transferenciasMap.set(key, mov);
      }

      increment(motivosMap, motivo);
      increment(professoresMap, professorSaida(mov));
    });

    const evasoesInterrompidas = evasoesMap.size;
    const naoRenovacoes = naoRenovacoesMap.size;
    const totalEvasoes = evasoesInterrompidas + naoRenovacoes;
    const transferencias = transferenciasMap.size;
    const basePagantes = alunosPagantesPorUnidade.get(unidadeId) || 0;
    const mrrPerdido = [...evasoesMap.values(), ...naoRenovacoesMap.values()]
      .reduce((acc, mov) => acc + valorPerdidoMovimentacao(mov), 0);
    const renovacoesRealizadas = renovacoesConfirmadas.length;
    const renovacoesPendentes = renovacoesPendentesConfirmacao.length;
    const renovacoesPrevistas = renovacoesRealizadas + naoRenovacoes + renovacoesPendentes;

    return {
      unidade_id: unidadeId,
      unidade_nome: unidade.nome || 'Unidade',
      ano,
      mes,
      total_evasoes: totalEvasoes,
      evasoes_interrompidas: evasoesInterrompidas,
      avisos_previos: avisosPrevios.size,
      transferencias,
      taxa_evasao: basePagantes > 0 ? ((totalEvasoes - transferencias) / basePagantes) * 100 : 0,
      mrr_perdido: mrrPerdido,
      renovacoes_previstas: renovacoesPrevistas,
      renovacoes_realizadas: renovacoesRealizadas,
      nao_renovacoes: naoRenovacoes,
      renovacoes_pendentes: renovacoesPendentes,
      renovacoes_atrasadas: 0,
      taxa_renovacao: renovacoesPrevistas > 0 ? (renovacoesRealizadas / renovacoesPrevistas) * 100 : 0,
      taxa_nao_renovacao: renovacoesPrevistas > 0 ? (naoRenovacoes / renovacoesPrevistas) * 100 : 0,
      evasoes_por_motivo: Object.fromEntries(motivosMap),
      evasoes_por_professor: Object.fromEntries(professoresMap),
      base_alunos_pagantes: basePagantes,
    };
  });
}

export function unidadesFromKPIsCanonicos(rows: KPIsAlunosCanonicosPorUnidade[]) {
  return rows.map(row => ({
    id: row.unidade_id,
    nome: row.unidade_nome,
  }));
}

export function pagantesMapFromKPIsCanonicos(rows: KPIsAlunosCanonicosPorUnidade[]) {
  return new Map(rows.map(row => [row.unidade_id, row.alunosPagantes]));
}

export function consolidarRetencaoOperacional(
  rows: RetencaoOperacionalPorUnidade[],
  unidadeId: string | 'todos',
  ano: number,
  mes: number
): RetencaoOperacionalPorUnidade {
  const base = rows.reduce((acc, row) => acc + row.base_alunos_pagantes, 0);
  const totalEvasoes = rows.reduce((acc, row) => acc + row.total_evasoes, 0);
  const transferencias = rows.reduce((acc, row) => acc + row.transferencias, 0);
  const renovacoesPrevistas = rows.reduce((acc, row) => acc + row.renovacoes_previstas, 0);
  const renovacoesRealizadas = rows.reduce((acc, row) => acc + row.renovacoes_realizadas, 0);
  const naoRenovacoes = rows.reduce((acc, row) => acc + row.nao_renovacoes, 0);
  const motivosMap = new Map<string, number>();
  const professoresMap = new Map<string, number>();

  rows.forEach(row => {
    Object.entries(row.evasoes_por_motivo || {}).forEach(([key, value]) => increment(motivosMap, key, value));
    Object.entries(row.evasoes_por_professor || {}).forEach(([key, value]) => increment(professoresMap, key, value));
  });

  return {
    unidade_id: unidadeId === 'todos' ? 'todos' : rows[0]?.unidade_id || unidadeId,
    unidade_nome: unidadeId === 'todos' ? 'Consolidado' : rows[0]?.unidade_nome || 'Unidade',
    ano,
    mes,
    total_evasoes: totalEvasoes,
    evasoes_interrompidas: rows.reduce((acc, row) => acc + row.evasoes_interrompidas, 0),
    avisos_previos: rows.reduce((acc, row) => acc + row.avisos_previos, 0),
    transferencias,
    taxa_evasao: base > 0 ? ((totalEvasoes - transferencias) / base) * 100 : 0,
    mrr_perdido: rows.reduce((acc, row) => acc + row.mrr_perdido, 0),
    renovacoes_previstas: renovacoesPrevistas,
    renovacoes_realizadas: renovacoesRealizadas,
    nao_renovacoes: naoRenovacoes,
    renovacoes_pendentes: rows.reduce((acc, row) => acc + row.renovacoes_pendentes, 0),
    renovacoes_atrasadas: rows.reduce((acc, row) => acc + row.renovacoes_atrasadas, 0),
    taxa_renovacao: renovacoesPrevistas > 0 ? (renovacoesRealizadas / renovacoesPrevistas) * 100 : 0,
    taxa_nao_renovacao: renovacoesPrevistas > 0 ? (naoRenovacoes / renovacoesPrevistas) * 100 : 0,
    evasoes_por_motivo: Object.fromEntries(motivosMap),
    evasoes_por_professor: Object.fromEntries(professoresMap),
    base_alunos_pagantes: base,
  };
}
