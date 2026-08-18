export type FaturasFinanceirasSituacao =
  | 'todas'
  | 'pagas'
  | 'em_aberto'
  | 'em_atraso_d0'
  | 'a_vencer'
  | 'canceladas'
  | 'cobranca_d2'
  | 'reconciliacao';

export type FaturasFinanceirasStatusLeitura = 'loading' | 'ok' | 'partial' | 'stale' | 'error';

export type FaturaFinanceiraTipo =
  | 'parcela'
  | 'passaporte_taxa_matricula'
  | 'lojinha_produto'
  | 'venda_ingressos'
  | 'avulsa_outro';

export interface FaturaFinanceiraItem {
  canonical_fatura_id: string;
  unidade_id: string;
  unidade_codigo: string | null;
  competencia: string;
  emusys_fatura_id: string;
  emusys_matricula_id: string | null;
  emusys_contrato_id: string | null;
  emusys_student_id: string | null;
  descricao: string | null;
  tipo_fatura: FaturaFinanceiraTipo;
  numero_parcela: number | null;
  total_parcelas_contrato: number | null;
  status: 'aberta' | 'paga' | 'cancelada';
  data_vencimento: string;
  data_pagamento: string | null;
  aluno: {
    id: number | null;
    nome: string;
    curso_nome: string | null;
    estado_operacional: string | null;
    vinculo_local_fonte: 'matricula_canonica' | 'aluno_unico_canonico' | null;
    foto_url: string | null;
    photo_url: string | null;
  };
  forma_pagamento: {
    rotulo: 'Pago via' | 'Forma prevista' | 'Forma informada' | 'Forma nao informada';
    nome: string | null;
    fonte: 'transacao' | 'matricula' | 'emusys_matricula' | 'manual' | 'ausente';
  };
  valores: {
    valor_com_desconto: number;
    valor_sem_desconto_condicional: number;
    multa: number;
    mora: number;
    valor_hoje: number | null;
    valor_pago: number | null;
    juros_e_multa_snapshot: number;
  };
  cobranca: {
    d0: boolean;
    d2_elegivel: boolean;
    motivo_nao_elegivel: string | null;
  };
  sync_completed_at: string | null;
  sync_fresh_until: string | null;
}

export interface FaturaFinanceiraReconciliacaoItem {
  canonical_fatura_id: string;
  unidade_id: string;
  unidade_codigo: string | null;
  competencia: string;
  emusys_fatura_id: string;
  emusys_matricula_id: string | null;
  emusys_contrato_id: string | null;
  emusys_student_id: string | null;
  descricao: string | null;
  tipo_fatura: FaturaFinanceiraTipo;
  numero_parcela: number | null;
  total_parcelas_contrato: number | null;
  status: string;
  data_vencimento: string;
  data_pagamento: string | null;
  aluno: FaturaFinanceiraItem['aluno'];
  forma_pagamento: FaturaFinanceiraItem['forma_pagamento'];
  valores: {
    valor_original: number;
    valor_com_desconto: number;
    valor_sem_desconto_condicional: number;
    multa: number;
    mora: number;
    valor_hoje: number | null;
    valor_pago: number | null;
    juros_e_multa_snapshot: number;
  };
  motivos: string[];
  validation_issues: unknown[];
  source_missing_reason: string | null;
  sync_completed_at: string | null;
}

export interface FaturasFinanceirasTotals {
  quantidade: number;
  valor: number;
}

export interface FaturasFinanceirasState {
  schemaVersion: number | null;
  source: string | null;
  status: FaturasFinanceirasStatusLeitura;
  error: string | null;
  asOfDate: string | null;
  periodo: {
    modo: 'janela_3' | 'competencia';
    competenciaInicio: string | null;
    competenciaFim: string | null;
  };
  freshness: {
    competenciasNecessarias: number;
    competenciasFrescas: number;
    competenciasStale: number;
    syncMaisAntigo: string | null;
    validoAte: string | null;
  };
  collectionAllowed: boolean;
  collectionScope: string;
  totals: Record<Exclude<FaturasFinanceirasSituacao, 'reconciliacao'>, FaturasFinanceirasTotals> & {
    visaoAtual: FaturasFinanceirasTotals & { status: string };
  };
  items: FaturaFinanceiraItem[];
  reconciliation: {
    sourceMissing: number;
    identidadeInvalida: number;
    statusDesconhecido: number;
    validacoesOrigem: number;
    formaPagamentoAusente: number;
    contatoPendente: number;
    total: number;
    resolvidasManualmente: number;
    foraOperacao: {
      historicoExAluno: number;
      registroNaoAluno: number;
      total: number;
    };
    items: FaturaFinanceiraReconciliacaoItem[];
  };
}

export interface FinanceiroRpcClient {
  rpc(
    name: 'get_faturas_alunos_financeiro_v1',
    args: {
      p_unidade_id: string | null;
      p_ano: number;
      p_mes: number;
      p_modo_periodo: 'janela_3' | 'competencia';
      p_status: FaturasFinanceirasSituacao;
      p_as_of_date: string;
    },
  ): Promise<{ data: unknown; error: { message?: string } | null }>;
}

export interface CarregarFaturasAlunosFinanceirasOptions {
  unidadeId?: string | 'todos' | null;
  ano: number;
  mes: number;
  modoPeriodo: 'janela_3' | 'competencia';
  situacao: FaturasFinanceirasSituacao;
  asOfDate: string;
}

export interface FaturasFinanceirasFiltrosLocais {
  busca?: string | null;
  curso?: string | null;
  pagamento?: string | null;
  tipoFatura?: FaturaFinanceiraTipo | null;
  alunoId?: number | null;
  matriculaId?: string | null;
}

const SITUACOES = new Set<FaturasFinanceirasSituacao>([
  'todas',
  'pagas',
  'em_aberto',
  'em_atraso_d0',
  'a_vencer',
  'canceladas',
  'cobranca_d2',
  'reconciliacao',
]);

const emptyTotals = (): FaturasFinanceirasTotals => ({ quantidade: 0, valor: 0 });

const emptyState = (status: FaturasFinanceirasStatusLeitura, error: string | null): FaturasFinanceirasState => ({
  schemaVersion: null,
  source: null,
  status,
  error,
  asOfDate: null,
  periodo: { modo: 'janela_3', competenciaInicio: null, competenciaFim: null },
  freshness: {
    competenciasNecessarias: 0,
    competenciasFrescas: 0,
    competenciasStale: 0,
    syncMaisAntigo: null,
    validoAte: null,
  },
  collectionAllowed: false,
  collectionScope: 'blocked',
  totals: {
    todas: emptyTotals(),
    pagas: emptyTotals(),
    em_aberto: emptyTotals(),
    em_atraso_d0: emptyTotals(),
    a_vencer: emptyTotals(),
    canceladas: emptyTotals(),
    cobranca_d2: emptyTotals(),
    visaoAtual: { ...emptyTotals(), status: 'todas' },
  },
  items: [],
  reconciliation: {
    sourceMissing: 0,
    identidadeInvalida: 0,
    statusDesconhecido: 0,
    validacoesOrigem: 0,
    formaPagamentoAusente: 0,
    contatoPendente: 0,
    total: 0,
    resolvidasManualmente: 0,
    foraOperacao: {
      historicoExAluno: 0,
      registroNaoAluno: 0,
      total: 0,
    },
    items: [],
  },
});

export const FATURAS_FINANCEIRAS_LOADING = emptyState('loading', null);

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const asText = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const asNumber = (value: unknown, fallback = 0): number => (
  typeof value === 'number' && Number.isFinite(value)
    ? value
    : typeof value === 'string' && Number.isFinite(Number(value))
      ? Number(value)
      : fallback
);

const asFiniteNumberOrNull = (value: unknown): number | null => {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const isIsoDate = (value: string | null): value is string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
};

const isIsoTimestamp = (value: string | null): value is string => (
  Boolean(value)
  && /^\d{4}-\d{2}-\d{2}T/u.test(value)
  && !Number.isNaN(Date.parse(value))
);

const isNonNegative = (value: number | null): value is number => (
  value != null && value >= 0
);

const asIntegerOrNull = (value: unknown): number | null => (
  typeof value === 'number' && Number.isInteger(value) ? value : null
);

const TIPOS_FATURA = new Set<FaturaFinanceiraTipo>([
  'parcela',
  'passaporte_taxa_matricula',
  'lojinha_produto',
  'venda_ingressos',
  'avulsa_outro',
]);

const parseTipoFatura = (value: unknown): FaturaFinanceiraTipo | null => (
  typeof value === 'string' && TIPOS_FATURA.has(value as FaturaFinanceiraTipo)
    ? value as FaturaFinanceiraTipo
    : null
);

const parsePositiveIntegerOrNull = (value: unknown): number | null => {
  const parsed = asIntegerOrNull(value);
  return parsed == null || parsed < 1 ? null : parsed;
};

const asBoolean = (value: unknown): boolean => value === true;

function parseTotals(value: unknown): FaturasFinanceirasTotals | null {
  const record = asRecord(value);
  const quantidade = asFiniteNumberOrNull(record?.quantidade);
  const valor = asFiniteNumberOrNull(record?.valor);
  if (!Number.isInteger(quantidade) || !isNonNegative(quantidade) || !isNonNegative(valor)) return null;
  return {
    quantidade,
    valor,
  };
}

function parseItem(value: unknown): FaturaFinanceiraItem | null {
  const row = asRecord(value);
  if (!row) return null;
  const aluno = asRecord(row.aluno);
  const forma = asRecord(row.forma_pagamento);
  const valores = asRecord(row.valores);
  const cobranca = asRecord(row.cobranca);
  const status = asText(row.status);
  const id = asText(row.canonical_fatura_id);
  const unidadeId = asText(row.unidade_id);
  const competencia = asText(row.competencia);
  const vencimento = asText(row.data_vencimento);
  const faturaId = asText(row.emusys_fatura_id);
  const tipoFatura = parseTipoFatura(row.tipo_fatura);
  const numeroParcela = parsePositiveIntegerOrNull(row.numero_parcela);
  const totalParcelasContrato = parsePositiveIntegerOrNull(row.total_parcelas_contrato);
  if (!id || !unidadeId || !competencia || !vencimento || !faturaId || !aluno || !forma || !valores || !cobranca || !tipoFatura) return null;
  if ((tipoFatura === 'parcela' && numeroParcela == null) || (tipoFatura !== 'parcela' && numeroParcela != null)) return null;
  if (status !== 'aberta' && status !== 'paga' && status !== 'cancelada') return null;
  if (!isIsoDate(competencia) || !isIsoDate(vencimento)) return null;

  const valorComDesconto = asFiniteNumberOrNull(valores.valor_com_desconto);
  const valorSemDescontoCondicional = asFiniteNumberOrNull(valores.valor_sem_desconto_condicional);
  const multa = asFiniteNumberOrNull(valores.multa);
  const mora = asFiniteNumberOrNull(valores.mora);
  const jurosEMultaSnapshot = asFiniteNumberOrNull(valores.juros_e_multa_snapshot);
  const valorHoje = valores.valor_hoje == null ? null : asFiniteNumberOrNull(valores.valor_hoje);
  const valorPago = valores.valor_pago == null ? null : asFiniteNumberOrNull(valores.valor_pago);
  if (![valorComDesconto, valorSemDescontoCondicional, multa, mora, jurosEMultaSnapshot].every(isNonNegative)) return null;
  if (valorHoje !== null && !isNonNegative(valorHoje)) return null;
  if (valorPago !== null && !isNonNegative(valorPago)) return null;
  if (status === 'aberta' && valorHoje === null) return null;
  if (status === 'paga' && (valorHoje !== null || valorPago === null)) return null;
  if (status === 'cancelada' && (valorHoje !== null || valorPago !== null)) return null;

  const rotulo = asText(forma.rotulo);
  const fonte = asText(forma.fonte);
  if (
    (rotulo !== 'Pago via' && rotulo !== 'Forma prevista' && rotulo !== 'Forma informada' && rotulo !== 'Forma nao informada')
    || (fonte !== 'transacao' && fonte !== 'matricula' && fonte !== 'emusys_matricula' && fonte !== 'manual' && fonte !== 'ausente')
  ) return null;
  if (
    (fonte === 'transacao' && (rotulo !== 'Pago via' || !asText(forma.nome)))
    || (fonte === 'matricula' && (rotulo !== 'Forma prevista' || !asText(forma.nome)))
    || (fonte === 'emusys_matricula' && (rotulo !== 'Forma prevista' || !asText(forma.nome)))
    || (fonte === 'manual' && (rotulo !== 'Forma informada' || !asText(forma.nome)))
    || (fonte === 'ausente' && rotulo !== 'Forma nao informada')
  ) return null;
  const dataPagamento = asText(row.data_pagamento);
  const syncCompletedAt = asText(row.sync_completed_at);
  const syncFreshUntil = asText(row.sync_fresh_until);
  if ((dataPagamento && !isIsoDate(dataPagamento))
    || (syncCompletedAt && !isIsoTimestamp(syncCompletedAt))
    || (syncFreshUntil && !isIsoTimestamp(syncFreshUntil))) return null;

  return {
    canonical_fatura_id: id,
    unidade_id: unidadeId,
    unidade_codigo: asText(row.unidade_codigo),
    competencia,
    emusys_fatura_id: faturaId,
    emusys_matricula_id: asText(row.emusys_matricula_id),
    emusys_contrato_id: asText(row.emusys_contrato_id),
    emusys_student_id: asText(row.emusys_student_id),
    descricao: asText(row.descricao),
    tipo_fatura: tipoFatura,
    numero_parcela: numeroParcela,
    total_parcelas_contrato: totalParcelasContrato,
    status,
    data_vencimento: vencimento,
    data_pagamento: dataPagamento,
    aluno: {
      id: asIntegerOrNull(aluno.id),
      nome: asText(aluno.nome) ?? 'Aluno nao vinculado',
      curso_nome: asText(aluno.curso_nome),
      estado_operacional: asText(aluno.estado_operacional),
      vinculo_local_fonte: asText(aluno.vinculo_local_fonte) as FaturaFinanceiraItem['aluno']['vinculo_local_fonte'],
      foto_url: asText(aluno.foto_url),
      photo_url: asText(aluno.photo_url),
    },
    forma_pagamento: {
      rotulo,
      nome: asText(forma.nome),
      fonte,
    },
    valores: {
      valor_com_desconto: valorComDesconto,
      valor_sem_desconto_condicional: valorSemDescontoCondicional,
      multa,
      mora,
      valor_hoje: valorHoje,
      valor_pago: valorPago,
      juros_e_multa_snapshot: jurosEMultaSnapshot,
    },
    cobranca: {
      d0: asBoolean(cobranca.d0),
      d2_elegivel: asBoolean(cobranca.d2_elegivel),
      motivo_nao_elegivel: asText(cobranca.motivo_nao_elegivel),
    },
    sync_completed_at: syncCompletedAt,
    sync_fresh_until: syncFreshUntil,
  };
}

function parseReconciliationItem(value: unknown): FaturaFinanceiraReconciliacaoItem | null {
  const row = asRecord(value);
  if (!row) return null;
  const aluno = asRecord(row.aluno);
  const forma = asRecord(row.forma_pagamento);
  const valores = asRecord(row.valores);
  const id = asText(row.canonical_fatura_id);
  const unidadeId = asText(row.unidade_id);
  const competencia = asText(row.competencia);
  const vencimento = asText(row.data_vencimento);
  const faturaId = asText(row.emusys_fatura_id);
  const tipoFatura = parseTipoFatura(row.tipo_fatura);
  const numeroParcela = parsePositiveIntegerOrNull(row.numero_parcela);
  const totalParcelasContrato = parsePositiveIntegerOrNull(row.total_parcelas_contrato);
  if (!id || !unidadeId || !competencia || !vencimento || !faturaId || !aluno || !forma || !valores || !tipoFatura) return null;
  if ((tipoFatura === 'parcela' && numeroParcela == null) || (tipoFatura !== 'parcela' && numeroParcela != null)) return null;
  if (!isIsoDate(competencia) || !isIsoDate(vencimento)) return null;
  const rotulo = asText(forma.rotulo);
  const fonte = asText(forma.fonte);
  if (
    (rotulo !== 'Pago via' && rotulo !== 'Forma prevista' && rotulo !== 'Forma informada' && rotulo !== 'Forma nao informada')
    || (fonte !== 'transacao' && fonte !== 'matricula' && fonte !== 'emusys_matricula' && fonte !== 'manual' && fonte !== 'ausente')
  ) return null;
  if (
    (fonte === 'transacao' && (rotulo !== 'Pago via' || !asText(forma.nome)))
    || (fonte === 'matricula' && (rotulo !== 'Forma prevista' || !asText(forma.nome)))
    || (fonte === 'emusys_matricula' && (rotulo !== 'Forma prevista' || !asText(forma.nome)))
    || (fonte === 'manual' && (rotulo !== 'Forma informada' || !asText(forma.nome)))
    || (fonte === 'ausente' && rotulo !== 'Forma nao informada')
  ) return null;
  const valorOriginal = asFiniteNumberOrNull(valores.valor_original);
  const valorComDesconto = asFiniteNumberOrNull(valores.valor_com_desconto);
  const valorSemDescontoCondicional = asFiniteNumberOrNull(valores.valor_sem_desconto_condicional);
  const multa = asFiniteNumberOrNull(valores.multa);
  const mora = asFiniteNumberOrNull(valores.mora);
  const jurosEMultaSnapshot = asFiniteNumberOrNull(valores.juros_e_multa_snapshot);
  const valorHoje = valores.valor_hoje == null ? null : asFiniteNumberOrNull(valores.valor_hoje);
  const valorPago = valores.valor_pago == null ? null : asFiniteNumberOrNull(valores.valor_pago);
  if (![valorOriginal, valorComDesconto, valorSemDescontoCondicional, multa, mora, jurosEMultaSnapshot].every(isNonNegative)) return null;
  if (valorHoje !== null && !isNonNegative(valorHoje)) return null;
  if (valorPago !== null && !isNonNegative(valorPago)) return null;
  const dataPagamento = asText(row.data_pagamento);
  if (dataPagamento && !isIsoDate(dataPagamento)) return null;
  const syncCompletedAt = asText(row.sync_completed_at);
  if (syncCompletedAt && !isIsoTimestamp(syncCompletedAt)) return null;
  return {
    canonical_fatura_id: id,
    unidade_id: unidadeId,
    unidade_codigo: asText(row.unidade_codigo),
    competencia,
    emusys_fatura_id: faturaId,
    emusys_matricula_id: asText(row.emusys_matricula_id),
    emusys_contrato_id: asText(row.emusys_contrato_id),
    emusys_student_id: asText(row.emusys_student_id),
    descricao: asText(row.descricao),
    tipo_fatura: tipoFatura,
    numero_parcela: numeroParcela,
    total_parcelas_contrato: totalParcelasContrato,
    status: asText(row.status) ?? 'desconhecido',
    data_vencimento: vencimento,
    data_pagamento: dataPagamento,
    aluno: {
      id: asIntegerOrNull(aluno.id),
      nome: asText(aluno.nome) ?? 'Aluno nao vinculado',
      curso_nome: asText(aluno.curso_nome),
      estado_operacional: asText(aluno.estado_operacional),
      vinculo_local_fonte: asText(aluno.vinculo_local_fonte) as FaturaFinanceiraItem['aluno']['vinculo_local_fonte'],
      foto_url: asText(aluno.foto_url),
      photo_url: asText(aluno.photo_url),
    },
    forma_pagamento: {
      rotulo,
      nome: asText(forma.nome),
      fonte,
    },
    valores: {
      valor_original: valorOriginal,
      valor_com_desconto: valorComDesconto,
      valor_sem_desconto_condicional: valorSemDescontoCondicional,
      multa,
      mora,
      valor_hoje: valorHoje,
      valor_pago: valorPago,
      juros_e_multa_snapshot: jurosEMultaSnapshot,
    },
    motivos: Array.isArray(row.motivos)
      ? row.motivos.flatMap((motivo) => asText(motivo) ? [asText(motivo) as string] : [])
      : [],
    validation_issues: Array.isArray(row.validation_issues) ? row.validation_issues : [],
    source_missing_reason: asText(row.source_missing_reason),
    sync_completed_at: syncCompletedAt,
  };
}

export function normalizarSituacaoFaturasFinanceiras(value: string | null | undefined): FaturasFinanceirasSituacao {
  // URLs A+C ja publicadas usavam "confirmadas" para D+0. Mantemos o link
  // compartilhavel sem perpetuar esse termo na nova UX global.
  if (value === 'confirmadas') return 'em_atraso_d0';
  return value && SITUACOES.has(value as FaturasFinanceirasSituacao)
    ? value as FaturasFinanceirasSituacao
    : 'todas';
}

export function normalizarFaturasAlunosFinanceiras(payload: unknown, error?: { message?: string } | null): FaturasFinanceirasState {
  if (error) return emptyState('error', error.message ?? 'Falha ao consultar faturas.');
  const root = asRecord(payload);
  if (!root || root.schema_version !== 1) {
    return emptyState('error', 'A leitura financeira nao respondeu com o contrato esperado.');
  }
  if (asText(root.fonte) !== 'sync_run_items' || !isIsoDate(asText(root.as_of_date))) {
    return emptyState('error', 'A leitura financeira nao informou fonte ou data de corte validas.');
  }
  const status = asText(root.status);
  if (status !== 'ok' && status !== 'partial' && status !== 'stale') {
    return emptyState('error', 'O status da leitura financeira e invalido.');
  }
  const periodo = asRecord(root.periodo);
  const freshness = asRecord(root.freshness);
  const operational = asRecord(root.operational);
  const totals = asRecord(root.totais);
  const reconciliation = asRecord(root.reconciliation);
  if (!periodo || !freshness || !operational || !totals || !reconciliation) {
    return emptyState('error', 'A leitura financeira veio incompleta.');
  }
  const modo = asText(periodo.modo);
  if (modo !== 'janela_3' && modo !== 'competencia') return emptyState('error', 'Periodo financeiro invalido.');
  const competenciaInicio = asText(periodo.competencia_inicio);
  const competenciaFim = asText(periodo.competencia_fim);
  if (!isIsoDate(competenciaInicio) || !isIsoDate(competenciaFim)) {
    return emptyState('error', 'O periodo financeiro nao e uma competencia valida.');
  }
  const frescorNumerico = [
    asFiniteNumberOrNull(freshness.competencias_necessarias),
    asFiniteNumberOrNull(freshness.competencias_frescas),
    asFiniteNumberOrNull(freshness.competencias_stale),
  ];
  if (!frescorNumerico.every((value) => Number.isInteger(value) && isNonNegative(value))) {
    return emptyState('error', 'O frescor financeiro veio invalido.');
  }
  const syncMaisAntigo = asText(freshness.sync_mais_antigo);
  const validoAte = asText(freshness.valido_ate);
  if ((syncMaisAntigo && !isIsoTimestamp(syncMaisAntigo)) || (validoAte && !isIsoTimestamp(validoAte))) {
    return emptyState('error', 'Os timestamps de frescor financeiro sao invalidos.');
  }
  if (typeof operational.collection_allowed !== 'boolean') {
    return emptyState('error', 'A permissao operacional de cobranca veio invalida.');
  }

  const parsedTotals = {
    todas: parseTotals(totals.todas),
    pagas: parseTotals(totals.pagas),
    em_aberto: parseTotals(totals.em_aberto),
    em_atraso_d0: parseTotals(totals.em_atraso_d0),
    a_vencer: parseTotals(totals.a_vencer),
    canceladas: parseTotals(totals.canceladas),
    cobranca_d2: parseTotals(totals.cobranca_d2),
    visaoAtual: parseTotals(totals.visao_atual),
  };
  if (Object.values(parsedTotals).some((value) => value === null)) {
    return emptyState('error', 'Os totais financeiros vieram invalidos.');
  }
  const visaoAtualStatus = asText(asRecord(totals.visao_atual)?.status);
  if (!visaoAtualStatus) return emptyState('error', 'A visao financeira atual nao foi identificada.');

  if (!Array.isArray(root.items) || !Array.isArray(reconciliation.items)) {
    return emptyState('error', 'A leitura financeira nao trouxe as listas esperadas.');
  }
  const parsedItems = root.items.map(parseItem);
  const parsedReconciliationItems = reconciliation.items.map(parseReconciliationItem);
  if (parsedItems.some((item) => item === null) || parsedReconciliationItems.some((item) => item === null)) {
    return emptyState('error', 'Uma fatura ou pendencia financeira veio fora do contrato.');
  }
  const reconciliationCounts = [
    asFiniteNumberOrNull(reconciliation.source_missing),
    asFiniteNumberOrNull(reconciliation.identidade_invalida),
    asFiniteNumberOrNull(reconciliation.status_desconhecido),
    asFiniteNumberOrNull(reconciliation.validacoes_origem),
    asFiniteNumberOrNull(reconciliation.forma_pagamento_ausente),
    asFiniteNumberOrNull(reconciliation.contato_pendente),
    asFiniteNumberOrNull(reconciliation.total),
  ];
  if (!reconciliationCounts.every((value) => Number.isInteger(value) && isNonNegative(value))) {
    return emptyState('error', 'Os totais de reconciliacao vieram invalidos.');
  }
  const collectionAllowed = status !== 'stale' && operational.collection_allowed;
  const resolvidasManualmente = asFiniteNumberOrNull(reconciliation.resolvidas_manualmente) ?? 0;
  const foraOperacao = asRecord(reconciliation.fora_operacao);
  const foraHistorico = asFiniteNumberOrNull(foraOperacao?.historico_ex_aluno) ?? 0;
  const foraAvulso = asFiniteNumberOrNull(foraOperacao?.registro_nao_aluno) ?? 0;

  return {
    schemaVersion: 1,
    source: asText(root.fonte),
    status,
    error: null,
    asOfDate: asText(root.as_of_date),
    periodo: {
      modo,
      competenciaInicio,
      competenciaFim,
    },
    freshness: {
      competenciasNecessarias: frescorNumerico[0],
      competenciasFrescas: frescorNumerico[1],
      competenciasStale: frescorNumerico[2],
      syncMaisAntigo,
      validoAte,
    },
    collectionAllowed,
    collectionScope: collectionAllowed ? asText(operational.collection_scope) ?? 'blocked' : 'blocked',
    totals: {
      todas: parsedTotals.todas,
      pagas: parsedTotals.pagas,
      em_aberto: parsedTotals.em_aberto,
      em_atraso_d0: parsedTotals.em_atraso_d0,
      a_vencer: parsedTotals.a_vencer,
      canceladas: parsedTotals.canceladas,
      cobranca_d2: parsedTotals.cobranca_d2,
      visaoAtual: {
        ...parsedTotals.visaoAtual,
        status: visaoAtualStatus,
      },
    },
    items: parsedItems,
    reconciliation: {
      sourceMissing: reconciliationCounts[0],
      identidadeInvalida: reconciliationCounts[1],
      statusDesconhecido: reconciliationCounts[2],
      validacoesOrigem: reconciliationCounts[3],
      formaPagamentoAusente: reconciliationCounts[4],
      contatoPendente: reconciliationCounts[5],
      total: reconciliationCounts[6],
      resolvidasManualmente,
      foraOperacao: {
        historicoExAluno: foraHistorico,
        registroNaoAluno: foraAvulso,
        total: asFiniteNumberOrNull(foraOperacao?.total) ?? foraHistorico + foraAvulso,
      },
      items: parsedReconciliationItems,
    },
  };
}

export async function carregarFaturasAlunosFinanceiras(
  client: FinanceiroRpcClient,
  options: CarregarFaturasAlunosFinanceirasOptions,
): Promise<FaturasFinanceirasState> {
  const unidadeId = options.unidadeId && options.unidadeId !== 'todos'
    ? options.unidadeId
    : null;
  const { data, error } = await client.rpc('get_faturas_alunos_financeiro_v1', {
    p_unidade_id: unidadeId,
    p_ano: options.ano,
    p_mes: options.mes,
    p_modo_periodo: options.modoPeriodo,
    p_status: options.situacao,
    p_as_of_date: options.asOfDate,
  });
  return normalizarFaturasAlunosFinanceiras(data, error);
}

const normalizarTexto = (value: unknown) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLocaleLowerCase('pt-BR');

export function filtrarFaturasFinanceirasLocais(
  items: FaturaFinanceiraItem[],
  filtros: FaturasFinanceirasFiltrosLocais,
) {
  const busca = normalizarTexto(filtros.busca);
  const curso = normalizarTexto(filtros.curso);
  const pagamento = normalizarTexto(filtros.pagamento);
  const tipoFatura = filtros.tipoFatura ?? null;
  const matricula = filtros.matriculaId?.trim() ?? '';
  return items.filter((item) => {
    if (filtros.alunoId != null && item.aluno.id !== filtros.alunoId) return false;
    if (matricula && item.emusys_matricula_id !== matricula) return false;
    if (curso && normalizarTexto(item.aluno.curso_nome) !== curso) return false;
    if (pagamento && normalizarTexto(item.forma_pagamento.nome) !== pagamento) return false;
    if (tipoFatura && item.tipo_fatura !== tipoFatura) return false;
    if (!busca) return true;
    return normalizarTexto([
      item.aluno.nome,
      item.aluno.curso_nome,
      item.emusys_matricula_id,
      item.emusys_fatura_id,
      item.descricao,
    ].filter(Boolean).join(' ')).includes(busca);
  });
}
