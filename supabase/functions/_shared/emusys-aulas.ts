export const EMUSYS_API_BASE = "https://api.emusys.com.br/v1";

export interface EmusysPaginacao {
  tem_mais: boolean;
  proximo_cursor?: string | null;
}

export interface EmusysPaginaAulas<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  items: T[];
  paginacao: EmusysPaginacao;
}

export interface BuscarPaginaAulasParams {
  token: string;
  dataInicio: string;
  dataFim: string;
  cursor?: string | null;
  limite?: number;
  signal?: AbortSignal;
  apiBase?: string;
}

export class EmusysApiError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfter: string | null,
    message = `Emusys API respondeu HTTP ${status}`,
  ) {
    super(message);
    this.name = "EmusysApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePaginaAulas<T extends Record<string, unknown>>(
  payload: unknown,
): EmusysPaginaAulas<T> {
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new Error("EMUSYS_AULAS_PAYLOAD_INVALIDO");
  }
  if (!payload.items.every(isRecord) || !isRecord(payload.paginacao)) {
    throw new Error("EMUSYS_AULAS_PAYLOAD_INVALIDO");
  }
  if (typeof payload.paginacao.tem_mais !== "boolean") {
    throw new Error("EMUSYS_AULAS_PAYLOAD_INVALIDO");
  }

  const cursor = payload.paginacao.proximo_cursor;
  let proximoCursor: string | null | undefined;
  if (typeof cursor === "string") proximoCursor = cursor;
  else if (cursor === null) proximoCursor = null;

  return {
    items: payload.items as T[],
    paginacao: {
      tem_mais: payload.paginacao.tem_mais,
      proximo_cursor: proximoCursor,
    },
  };
}

export function parseDataHoraEmusys(dataHora: string): string {
  return dataHora.replace(" ", "T") + ":00-03:00";
}

function validarDataIso(data: string, campo: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    throw new Error(`${campo} deve estar em YYYY-MM-DD`);
  }
}

export function montarUrlAulasEmusys({
  dataInicio,
  dataFim,
  cursor = null,
  limite: limiteRecebido = 100,
  apiBase = EMUSYS_API_BASE,
}: Omit<BuscarPaginaAulasParams, "token" | "signal">): string {
  validarDataIso(dataInicio, "dataInicio");
  validarDataIso(dataFim, "dataFim");

  const limite = Math.max(1, Math.min(Math.trunc(limiteRecebido), 100));
  let url = `${
    apiBase.replace(/\/$/, "")
  }/aulas/?data_hora_inicial=${dataInicio}T00:00:00&data_hora_final=${dataFim}T23:59:59&limite=${limite}`;
  if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
  return url;
}

export async function buscarPaginaAulasEmusys<
  T extends Record<string, unknown> = Record<string, unknown>,
>({
  token,
  signal,
  ...params
}: BuscarPaginaAulasParams): Promise<EmusysPaginaAulas<T>> {
  const url = montarUrlAulasEmusys(params);
  const response = await fetch(url, { headers: { token }, signal });

  if (!response.ok) {
    throw new EmusysApiError(
      response.status,
      response.headers.get("Retry-After"),
    );
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new Error("EMUSYS_AULAS_JSON_INVALIDO");
  }

  return parsePaginaAulas<T>(json);
}

export interface AlunoNaAulaEmusys {
  id_aluno: number | null;
  id_lead: number | null;
  nome_aluno: string;
  telefone_aluno: string | null;
}

export interface VinculoAulaAluno {
  aula_emusys_id: number;
  unidade_id: string;
  emusys_aluno_id: number | null;
  lead_id: number | null;
  nome: string;
  telefone: string | null;
}

/**
 * Transforma o alunos[] que o GET /aulas ja devolve em linhas de aula_alunos.
 * Sem isso a grade futura sabe curso/turma/sala mas nao sabe de quem e a aula.
 * `idPorEmusysId` mapeia o id do Emusys para o id interno de aulas_emusys.
 */
export function montarVinculosAulaAlunos(
  aulas: Array<{ id: number; alunos?: AlunoNaAulaEmusys[] }>,
  idPorEmusysId: Map<number, number>,
  unidadeId: string,
): VinculoAulaAluno[] {
  const vinculos: VinculoAulaAluno[] = [];

  for (const aula of aulas) {
    const aulaId = idPorEmusysId.get(aula.id);
    if (!aulaId) continue;

    for (const aluno of aula.alunos || []) {
      // nome e a chave do upsert (aula_emusys_id, nome): sem nome, sem linha.
      if (!aluno.nome_aluno) continue;
      vinculos.push({
        aula_emusys_id: aulaId,
        unidade_id: unidadeId,
        emusys_aluno_id: aluno.id_aluno || null,
        lead_id: aluno.id_lead || null,
        nome: aluno.nome_aluno,
        telefone: aluno.telefone_aluno || null,
      });
    }
  }

  return vinculos;
}

/** Grava os vinculos em lotes. Idempotente pelo unique (aula_emusys_id, nome). */
export async function gravarVinculosAulaAlunos(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  vinculos: VinculoAulaAluno[],
  tamanhoLote = 500,
): Promise<{ gravados: number; erros: string[] }> {
  const erros: string[] = [];
  let gravados = 0;
  const agora = new Date().toISOString();

  for (let offset = 0; offset < vinculos.length; offset += tamanhoLote) {
    const lote = vinculos
      .slice(offset, offset + tamanhoLote)
      .map((v) => ({ ...v, updated_at: agora }));

    const { error } = await supabase
      .from("aula_alunos")
      .upsert(lote, { onConflict: "aula_emusys_id,nome", ignoreDuplicates: false });

    if (error) erros.push(error.message);
    else gravados += lote.length;
  }

  return { gravados, erros };
}
