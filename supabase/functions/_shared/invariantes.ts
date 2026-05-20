// supabase/functions/_shared/invariantes.ts

export type Severidade = 'critico' | 'aviso';

export type Invariante = {
  regra: string;
  severidade: Severidade;
  mensagem: string;
};

export type GravarLogParams = {
  evento: string;
  acao: string;
  aluno_nome: string;
  aluno_id?: number | null;
  lead_id?: number | null;
  unidade_nome?: string | null;
  payload_bruto?: unknown;
  idempotency_key?: string | null;
  invariantes?: Invariante[];
  detalhes?: unknown;
  workflow_id?: string | null;
  execution_id?: string | null;
};

/**
 * Wrapper que captura exceções de uma função checar*.
 * Se a checagem falhar, retorna uma invariante 'invariante_checagem_falhou'
 * em vez de propagar o erro.
 */
export function comFallback(fn: () => Invariante[]): Invariante[] {
  try {
    return fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return [{
      regra: 'invariante_checagem_falhou',
      severidade: 'critico',
      mensagem: `Checagem lançou exceção: ${msg}`,
    }];
  }
}

/**
 * Grava 1 linha em automacao_log + 0..N linhas em automacao_invariantes.
 *
 * Status derivado das invariantes:
 *   - 'erro' se alguma é crítica
 *   - 'warn' se tem só aviso
 *   - 'ok' se array vazio
 *
 * Idempotência: se idempotency_key já existe em automacao_log, retorna
 * silenciosamente sem inserir.
 */
// deno-lint-ignore no-explicit-any
export async function gravarLog(supabase: any, params: GravarLogParams): Promise<void> {
  const invariantes = params.invariantes ?? [];
  const status: 'ok' | 'warn' | 'erro' =
    invariantes.some(i => i.severidade === 'critico') ? 'erro'
    : invariantes.length > 0 ? 'warn'
    : 'ok';

  const { data: log, error } = await supabase
    .from('automacao_log')
    .insert({
      evento: params.evento,
      acao: params.acao,
      aluno_nome: params.aluno_nome,
      aluno_id: params.aluno_id ?? null,
      lead_id: params.lead_id ?? null,
      unidade_nome: params.unidade_nome ?? null,
      payload_bruto: params.payload_bruto ?? null,
      idempotency_key: params.idempotency_key ?? null,
      detalhes: params.detalhes ?? null,
      workflow_id: params.workflow_id ?? null,
      execution_id: params.execution_id ?? null,
      status,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return; // unique violation = idempotência
    console.error('[gravarLog] erro ao inserir automacao_log:', error);
    return;
  }

  if (log && invariantes.length > 0) {
    const rows = invariantes.map(i => ({
      log_id: log.id,
      regra: i.regra,
      severidade: i.severidade,
      mensagem: i.mensagem,
    }));
    const { error: errInv } = await supabase
      .from('automacao_invariantes')
      .insert(rows);
    if (errInv) {
      console.error('[gravarLog] erro ao inserir invariantes:', errInv);
    }
  }
}

/**
 * Hash determinístico para idempotency_key.
 * Usa Deno crypto SubtleCrypto (SHA-256) e retorna hex.
 */
export async function computarHash(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(hashBuffer);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
