export const REQUEST_INTERVAL_MS = 1200;

export interface UnidadeSyncConfig {
  nome: string;
  id: string;
  token: string;
}

export interface FaturaEmusys {
  id?: number | string | null;
  matricula_id?: number | string | null;
  contrato_id?: number | string | null;
  aluno_id?: number | string | null;
  descricao?: string | null;
  status?: string | null;
  data_vencimento?: string | null;
  data_pagamento?: string | null;
  valor_original?: number | string | null;
  valor_pago?: number | string | null;
  juros_e_multa?: number | string | null;
  desconto_aplicado?: number | string | null;
  desconto_fixo?: number | string | null;
  desconto_condicional?: number | string | null;
}

export class GlobalRateLimiter {
  readonly intervalMs: number;
  readonly sleepFn: (ms: number) => Promise<void>;
  readonly nowFn: () => number;
  private lastRequestAt: number | null = null;

  constructor(
    intervalMs = REQUEST_INTERVAL_MS,
    sleepFn: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    nowFn: () => number = () => Date.now(),
  ) {
    this.intervalMs = intervalMs;
    this.sleepFn = sleepFn;
    this.nowFn = nowFn;
  }

  async wait(): Promise<void> {
    if (this.lastRequestAt != null) {
      const elapsed = this.nowFn() - this.lastRequestAt;
      const remaining = this.intervalMs - elapsed;
      if (remaining > 0) await this.sleepFn(remaining);
    }
    this.lastRequestAt = this.nowFn();
  }
}

const identifier = (
  value: unknown,
  field: string,
  options: { required?: boolean; zeroAsNull?: boolean } = {},
) => {
  const { required = false, zeroAsNull = false } = options;
  if (value == null || String(value).trim() === '') {
    if (required) throw new Error(`identificador invalido em ${field}`);
    return null;
  }
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new Error(`identificador invalido ou inseguro em ${field}`);
  }
  const normalized = String(value).trim();
  if (zeroAsNull && normalized === '0') return null;
  if (!/^[1-9]\d*$/.test(normalized)) {
    throw new Error(`identificador invalido em ${field}`);
  }
  return normalized;
};

const strictDate = (value: unknown, field: string, required = false) => {
  if (value == null || String(value).trim() === '' || value === '0000-00-00') {
    if (required) throw new Error(`data invalida em ${field}`);
    return null;
  }
  const normalized = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`data invalida em ${field}`);
  }
  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new Error(`data invalida em ${field}`);
  }
  return normalized;
};

const money = (value: unknown, field: string, nullable = false) => {
  if (nullable && (value == null || String(value).trim() === '')) return null;
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) throw new Error(`valor invalido em ${field}`);
  return Number(parsed.toFixed(2));
};

const cleanStatus = (value: unknown) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'aberta' || normalized === 'paga' || normalized === 'cancelada') return normalized;
  return 'desconhecido';
};

const validateCompetencia = (value: string) => {
  const competencia = strictDate(value, 'competencia', true)!;
  if (!competencia.endsWith('-01')) throw new Error('competencia invalida: use YYYY-MM-01');
  return competencia;
};

const isParcela = (row: { descricao: string }) => /^\s*parcela\b/i.test(row.descricao);

export function mapFatura(
  row: FaturaEmusys,
  unidadeCodigo: string,
  unidade: UnidadeSyncConfig,
  competenciaValue: string,
) {
  const competencia = validateCompetencia(competenciaValue);
  const dataVencimento = strictDate(row.data_vencimento, 'data_vencimento', true)!;
  if (`${dataVencimento.slice(0, 7)}-01` !== competencia) {
    throw new Error(`data_vencimento fora da competencia ${competencia}`);
  }

  return {
    unidade_id: unidade.id,
    unidade_codigo: unidadeCodigo,
    emusys_fatura_id: identifier(row.id, 'id', { required: true })!,
    emusys_matricula_id: identifier(row.matricula_id, 'matricula_id', { zeroAsNull: true }),
    emusys_contrato_id: identifier(row.contrato_id, 'contrato_id', { zeroAsNull: true }),
    emusys_student_id: identifier(row.aluno_id, 'aluno_id'),
    descricao: String(row.descricao ?? '').trim(),
    status: cleanStatus(row.status),
    data_vencimento: dataVencimento,
    data_pagamento: strictDate(row.data_pagamento, 'data_pagamento'),
    competencia,
    valor_original: money(row.valor_original, 'valor_original'),
    valor_pago: money(row.valor_pago, 'valor_pago', true),
    juros_e_multa: money(row.juros_e_multa, 'juros_e_multa'),
    desconto_aplicado: money(row.desconto_aplicado, 'desconto_aplicado'),
    desconto_fixo: money(row.desconto_fixo, 'desconto_fixo'),
    desconto_condicional: money(row.desconto_condicional, 'desconto_condicional'),
    payload: row,
  };
}

const retryAfterMs = (header: string | null, now: number) => {
  if (!header) return 2000;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.max(1000, Math.ceil(seconds * 1000));
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(1000, date - now);
  return 2000;
};

async function fetchPage({
  url,
  unidade,
  limiter,
  fetchFn,
  sleepFn,
}: {
  url: string;
  unidade: UnidadeSyncConfig;
  limiter: GlobalRateLimiter;
  fetchFn: typeof fetch;
  sleepFn: (ms: number) => Promise<void>;
}) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await limiter.wait();
    const response = await fetchFn(url, { headers: { token: unidade.token } });
    if (response.status === 429) {
      if (attempt === 4) throw new Error(`Emusys /faturas ${unidade.nome}: HTTP 429 apos 5 tentativas`);
      await sleepFn(retryAfterMs(response.headers.get('Retry-After'), Date.now()));
      continue;
    }
    if (!response.ok) {
      throw new Error(`Emusys /faturas ${unidade.nome}: HTTP ${response.status} - ${await response.text()}`);
    }
    return await response.json();
  }
  throw new Error(`Emusys /faturas ${unidade.nome}: retry esgotado`);
}

export async function coletarFaturasUnidade(options: {
  apiBaseUrl: string;
  competencia: string;
  unidadeCodigo: string;
  unidade: UnidadeSyncConfig;
  limiter: GlobalRateLimiter;
  fetchFn?: typeof fetch;
  sleepFn?: (ms: number) => Promise<void>;
}) {
  const {
    apiBaseUrl,
    unidadeCodigo,
    unidade,
    limiter,
    fetchFn = fetch,
    sleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = options;
  const competencia = validateCompetencia(options.competencia);
  const year = Number(competencia.slice(0, 4));
  const month = Number(competencia.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dataInicio = competencia;
  const dataFim = `${competencia.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`;
  const rawItems: FaturaEmusys[] = [];
  const seenCursors = new Set<string>();
  let cursor = '';
  let paginas = 0;

  while (true) {
    const params = new URLSearchParams({
      status: 'todas',
      data_vencimento_inicial: dataInicio,
      data_vencimento_final: dataFim,
      limite: '50',
    });
    if (cursor) params.set('cursor', cursor);
    const payload = await fetchPage({
      url: `${apiBaseUrl}/faturas?${params.toString()}`,
      unidade,
      limiter,
      fetchFn,
      sleepFn,
    });
    const pageItems = Array.isArray(payload?.items)
      ? payload.items
      : (Array.isArray(payload?.dados) ? payload.dados : []);
    const nextCursor = String(
      payload?.paginacao?.proximo_cursor ?? payload?.proximo_cursor ?? '',
    ).trim();
    const temMaisRaw = payload?.paginacao?.tem_mais ?? payload?.tem_mais;
    const temMais = temMaisRaw == null ? Boolean(nextCursor) : temMaisRaw === true;

    paginas += 1;
    if (temMais && !nextCursor) {
      throw new Error(`Emusys /faturas ${unidade.nome}: tem_mais exige cursor`);
    }
    if (temMais && pageItems.length === 0) {
      throw new Error(`Emusys /faturas ${unidade.nome}: pagina vazia com tem_mais`);
    }
    rawItems.push(...pageItems);
    if (!temMais) break;
    if (seenCursors.has(nextCursor)) {
      throw new Error(`Emusys /faturas ${unidade.nome}: cursor repetido`);
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
    if (paginas >= 100) {
      throw new Error(`Emusys /faturas ${unidade.nome}: paginacao excedeu limite de seguranca`);
    }
  }

  const rows = rawItems.map((row) => mapFatura(row, unidadeCodigo, unidade, competencia));
  const ids = new Set<string>();
  for (const row of rows) {
    if (ids.has(row.emusys_fatura_id)) {
      throw new Error(`Emusys /faturas ${unidade.nome}: ID duplicado ${row.emusys_fatura_id}`);
    }
    ids.add(row.emusys_fatura_id);
  }

  const parcelas = rows.filter(isParcela);
  const totalRecebidoParcelas = parcelas.reduce((sum, row) => (
    row.status === 'paga' ? sum + Number(row.valor_pago ?? 0) : sum
  ), 0);
  const totalPrevistoParcelas = parcelas.reduce((sum, row) => (
    sum + (row.status === 'paga'
      ? Number(row.valor_pago ?? 0)
      : row.valor_original + row.juros_e_multa - row.desconto_aplicado)
  ), 0);

  return {
    rows,
    resumo: {
      unidade: unidade.nome,
      unidade_id: unidade.id,
      unidade_codigo: unidadeCodigo,
      paginas,
      recebidas_api: rawItems.length,
      processadas: rows.length,
      parcelas: parcelas.length,
      parcelas_pagas: parcelas.filter((row) => row.status === 'paga').length,
      parcelas_abertas: parcelas.filter((row) => row.status !== 'paga').length,
      total_recebido_parcelas: Number(totalRecebidoParcelas.toFixed(2)),
      faturamento_previsto_parcelas: Number(totalPrevistoParcelas.toFixed(2)),
      complete: true,
    },
  };
}
