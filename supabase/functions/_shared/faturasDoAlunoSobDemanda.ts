// Busca sob demanda das faturas de UM aluno no Emusys (botao do caixa, LAPE-56).
//
// Por que existe: o espelho `emusys_faturas` so' traz a competencia +2 em diante
// uma vez por dia (backlog diario desde 20260923213000). Matricula nova com
// pagamento adiantado ou credito de 2 meses a frente fica sem a fatura no Report
// ate o dia seguinte, e o caixa nao deixa lancar parcela sem fatura (lancar
// sem vinculo contaria o dinheiro duas vezes como receita). Caso real: 29/09/2026,
// Recreio, credito de R$ 100 na Parcela 11/2026 que so' existiria no dia seguinte.
//
// Esta escrita e' AVULSA de proposito: grava so' em `emusys_faturas` (upsert por
// unidade_id + emusys_fatura_id) e nao toca em sync_runs/sync_run_items. A
// marcacao de "ausente" do sync compara com a rodada anterior (sync_run_items),
// nunca com o espelho — entao linha gravada aqui nao vira ausente, e a proxima
// rodada daquela competencia apenas a sobrescreve com o que a API devolver.

import {
  EmusysHttpError,
  EmusysRateLimitError,
  type FaturaEmusys,
  GlobalRateLimiter,
  mapFatura,
  retryAfterMs,
  type UnidadeSyncConfig,
} from './faturasSync.ts';

/** Um aluno raramente passa de ~30 faturas; mais que isso indica filtro ignorado pela API. */
export const LIMITE_FATURAS_POR_ALUNO = 300;
export const LIMITE_PAGINAS = 10;

export class EmusysTimeoutError extends Error {
  readonly code = 'EMUSYS_TIMEOUT';
  constructor(unidade: string, prazoMs: number) {
    super(`Emusys /faturas ${unidade}: sem resposta em ${Math.round(prazoMs / 1000)}s`);
    this.name = 'EmusysTimeoutError';
  }
}

export class RespostaInesperadaError extends Error {
  readonly code = 'EMUSYS_RESPOSTA_INESPERADA';
  constructor(message: string) {
    super(message);
    this.name = 'RespostaInesperadaError';
  }
}

export const competenciaDoVencimento = (dataVencimento: string) => `${dataVencimento.slice(0, 7)}-01`;

export async function coletarFaturasDoAluno(options: {
  apiBaseUrl: string;
  unidadeCodigo: string;
  unidade: UnidadeSyncConfig;
  emusysStudentId: string;
  /** Prazo TOTAL da coleta (todas as paginas), em ms. */
  prazoMs?: number;
  limiter?: GlobalRateLimiter;
  fetchFn?: typeof fetch;
  nowFn?: () => number;
}) {
  const {
    apiBaseUrl,
    unidadeCodigo,
    unidade,
    emusysStudentId,
    prazoMs = 20_000,
    limiter = new GlobalRateLimiter(),
    fetchFn = fetch,
    nowFn = () => Date.now(),
  } = options;

  if (!/^[1-9]\d*$/.test(emusysStudentId)) {
    throw new RespostaInesperadaError(`emusys_student_id invalido: ${emusysStudentId}`);
  }

  const inicio = nowFn();
  const rawItems: FaturaEmusys[] = [];
  const cursores = new Set<string>();
  let cursor = '';
  let paginas = 0;

  while (true) {
    const restante = prazoMs - (nowFn() - inicio);
    if (restante <= 0) throw new EmusysTimeoutError(unidade.nome, prazoMs);

    const params = new URLSearchParams({ aluno_id: emusysStudentId, status: 'todas', limite: '50' });
    if (cursor) params.set('cursor', cursor);

    await limiter.wait();
    let response: Response;
    try {
      response = await fetchFn(`${apiBaseUrl}/faturas?${params.toString()}`, {
        headers: { token: unidade.token },
        signal: AbortSignal.timeout(restante),
      });
    } catch (erro) {
      const nome = erro instanceof Error ? erro.name : '';
      if (nome === 'TimeoutError' || nome === 'AbortError') {
        throw new EmusysTimeoutError(unidade.nome, prazoMs);
      }
      throw erro;
    }
    if (response.status === 429) {
      throw new EmusysRateLimitError(retryAfterMs(response.headers.get('Retry-After'), nowFn()), unidade.nome);
    }
    if (!response.ok) {
      throw new EmusysHttpError(
        response.status,
        `Emusys /faturas ${unidade.nome}: HTTP ${response.status} - ${(await response.text()).slice(0, 300)}`,
      );
    }
    const payload = await response.json();
    const pageItems: FaturaEmusys[] = Array.isArray(payload?.items)
      ? payload.items
      : (Array.isArray(payload?.dados) ? payload.dados : []);
    const nextCursor = String(payload?.paginacao?.proximo_cursor ?? payload?.proximo_cursor ?? '').trim();
    const temMaisRaw = payload?.paginacao?.tem_mais ?? payload?.tem_mais;
    const temMais = temMaisRaw == null ? Boolean(nextCursor) : temMaisRaw === true;

    paginas += 1;
    rawItems.push(...pageItems);
    if (rawItems.length > LIMITE_FATURAS_POR_ALUNO) {
      throw new RespostaInesperadaError(
        `Emusys devolveu mais de ${LIMITE_FATURAS_POR_ALUNO} faturas para o aluno ${emusysStudentId} — filtro aluno_id possivelmente ignorado`,
      );
    }
    if (!temMais) break;
    if (!nextCursor) throw new RespostaInesperadaError(`Emusys /faturas ${unidade.nome}: tem_mais sem cursor`);
    if (pageItems.length === 0) throw new RespostaInesperadaError(`Emusys /faturas ${unidade.nome}: pagina vazia com tem_mais`);
    if (cursores.has(nextCursor)) throw new RespostaInesperadaError(`Emusys /faturas ${unidade.nome}: cursor repetido`);
    if (paginas >= LIMITE_PAGINAS) {
      throw new RespostaInesperadaError(`Emusys /faturas ${unidade.nome}: mais de ${LIMITE_PAGINAS} paginas para um aluno`);
    }
    cursores.add(nextCursor);
    cursor = nextCursor;
  }

  // Defesa: se a API ignorasse o filtro, gravariamos faturas de outros alunos
  // atribuidas corretamente (o aluno vem da propria fatura), mas o botao estaria
  // fazendo varredura da unidade. Recusar e' mais honesto que aceitar em silencio.
  const deOutroAluno = rawItems.filter((row) => String(row.aluno_id ?? '').trim() !== emusysStudentId);
  if (deOutroAluno.length > 0) {
    throw new RespostaInesperadaError(
      `Emusys devolveu ${deOutroAluno.length} fatura(s) de outro aluno ao filtrar aluno_id=${emusysStudentId} (ex.: fatura ${deOutroAluno[0].id}, aluno ${deOutroAluno[0].aluno_id})`,
    );
  }

  const rows = rawItems.map((row) => {
    const vencimento = String(row.data_vencimento ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimento)) {
      throw new RespostaInesperadaError(`fatura ${row.id} sem data_vencimento valida (${vencimento || 'vazia'})`);
    }
    const { validation_issues: _issues, ...linha } = mapFatura(row, unidadeCodigo, unidade, competenciaDoVencimento(vencimento));
    return linha;
  });

  const ids = new Set<string>();
  for (const row of rows) {
    if (ids.has(row.emusys_fatura_id)) {
      throw new RespostaInesperadaError(`Emusys /faturas ${unidade.nome}: fatura ${row.emusys_fatura_id} repetida`);
    }
    ids.add(row.emusys_fatura_id);
  }

  return { rows, paginas };
}

export type LinhaFaturaEspelho = Awaited<ReturnType<typeof coletarFaturasDoAluno>>['rows'][number];

export interface FaturaExistente {
  emusys_fatura_id: string | number;
  status: string | null;
  valor_pago: string | number | null;
  valor_original: string | number | null;
  data_vencimento: string | null;
}

/**
 * Compara o que veio da API com o que o espelho ja tinha, para a tela dizer
 * "N novas" em vez de so' "atualizado" — sem isso, "nada mudou" e "funcionou"
 * sao indistinguiveis para quem clicou.
 */
export function compararComEspelho(rows: LinhaFaturaEspelho[], existentes: FaturaExistente[]) {
  const porId = new Map(existentes.map((e) => [String(e.emusys_fatura_id), e]));
  const num = (v: unknown) => (v == null || v === '' ? null : Number(v));
  const novas: LinhaFaturaEspelho[] = [];
  const alteradas: LinhaFaturaEspelho[] = [];
  for (const row of rows) {
    const antes = porId.get(row.emusys_fatura_id);
    if (!antes) {
      novas.push(row);
      continue;
    }
    if (
      (antes.status ?? null) !== row.status ||
      num(antes.valor_pago) !== row.valor_pago ||
      num(antes.valor_original) !== row.valor_original ||
      (antes.data_vencimento ?? null) !== row.data_vencimento
    ) {
      alteradas.push(row);
    }
  }
  return { novas, alteradas, iguais: rows.length - novas.length - alteradas.length };
}
