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

// =============================================================================
// Resultado esperado das funções de processamento (passado às checar*)
// =============================================================================

export type ResultadoMatricula = {
  aluno_id: number | null;
  curso_id: number | null;
  professor_id: number | null;
  lead_id: number | null;
  unidade_id: string | null;
  // deno-lint-ignore no-explicit-any
  payload?: any;
};

// =============================================================================
// Helpers internos
// =============================================================================

// deno-lint-ignore no-explicit-any
function isEmpty(v: any): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

// =============================================================================
// checarMatricula (matricula_nova / inserido_segundo_curso)
// =============================================================================

// deno-lint-ignore no-explicit-any
export function checarMatricula(payload: any, resultado: ResultadoMatricula): Invariante[] {
  const v: Invariante[] = [];
  const m = payload?.matricula ?? {};
  const aluno = payload?.aluno ?? m?.aluno ?? {};
  const disciplinas: any[] = m?.disciplinas ?? [];

  // Payload Emusys: nome em matricula.nome_aluno. Fallback: aluno.nome (formato antigo).
  const nomeAluno = m?.nome_aluno ?? aluno?.nome;
  if (isEmpty(nomeAluno)) {
    v.push({ regra: 'matricula_sem_aluno_nome', severidade: 'critico',
      mensagem: 'matricula.nome_aluno ausente ou vazio' });
  }
  // Payload Emusys: matricula.matricula_id. Fallback: id_matricula (formato antigo).
  const matriculaId = m?.matricula_id ?? m?.id_matricula ?? payload?.id_matricula;
  if (isEmpty(matriculaId)) {
    v.push({ regra: 'matricula_sem_emusys_matricula_id', severidade: 'critico',
      mensagem: 'matricula_id ausente — impede idempotência' });
  }
  if (!Array.isArray(disciplinas) || disciplinas.length === 0) {
    v.push({ regra: 'matricula_sem_disciplinas', severidade: 'critico',
      mensagem: 'payload.matricula.disciplinas[] vazio ou ausente' });
    return v;
  }

  const d0 = disciplinas[0] ?? {};
  if (isEmpty(d0?.id_professor)) {
    v.push({ regra: 'matricula_sem_professor', severidade: 'critico',
      mensagem: 'disciplinas[0].id_professor ausente no payload' });
  } else if (resultado.professor_id === null) {
    v.push({ regra: 'matricula_professor_nao_resolvido', severidade: 'critico',
      mensagem: `id_professor=${d0.id_professor} nome="${d0?.nome_professor ?? '?'}" veio mas não casou em professores_unidades (nem por id nem por nome)` });
  }

  // Payload Emusys: curso_id em matricula.curso_id (e disciplinas[].id reflete o mesmo).
  const cursoIdPayload = m?.curso_id ?? d0?.id_curso ?? d0?.id;
  if (isEmpty(cursoIdPayload) && resultado.curso_id === null) {
    v.push({ regra: 'matricula_sem_curso', severidade: 'critico',
      mensagem: 'curso_id ausente ou não casou' });
  }

  // Payload Emusys: telefone em matricula.telefone_aluno / telefone_responsavel.
  const telefone = m?.telefone_aluno ?? m?.telefone_responsavel ?? aluno?.telefone;
  if (resultado.lead_id === null && !isEmpty(telefone)) {
    v.push({ regra: 'matricula_sem_lead_origem', severidade: 'aviso',
      mensagem: `nenhum lead com telefone ${telefone} encontrado — matrícula direta` });
  }

  // Payload Emusys: taxa em matricula.valor_taxa_matricula. Fallback: valor_passaporte.
  const vp = Number(m?.valor_taxa_matricula ?? m?.valor_passaporte ?? 0);
  if (vp === 0) {
    v.push({ regra: 'matricula_sem_valor_passaporte', severidade: 'aviso',
      mensagem: 'valor_taxa_matricula = 0 (re-matrícula, bolsista ou erro?)' });
  }

  return v;
}

// =============================================================================
// checarRenovacao
// =============================================================================

// deno-lint-ignore no-explicit-any
export function checarRenovacao(payload: any, resultado: ResultadoMatricula): Invariante[] {
  const v: Invariante[] = [];

  if (resultado.aluno_id === null) {
    v.push({ regra: 'renovacao_sem_matricula_anterior', severidade: 'critico',
      mensagem: 'não achou matrícula prévia por emusys_matricula_id nem por (aluno+curso)' });
  }

  // Payload Emusys: mensalidade em matricula.valor. Fallback: valor_parcela.
  const valorNovo = Number(payload?.matricula?.valor ?? payload?.matricula?.valor_parcela ?? 0);
  const valorAnterior = Number(payload?.matricula?.valor_parcela_anterior ?? 0);
  if (valorAnterior > 0 && valorNovo > 0) {
    const reajuste = (valorNovo - valorAnterior) / valorAnterior;
    if (reajuste > 0.30) {
      v.push({ regra: 'renovacao_reajuste_acima_30pct', severidade: 'aviso',
        mensagem: `reajuste ${(reajuste * 100).toFixed(1)}% (de ${valorAnterior} para ${valorNovo})` });
    }
  }

  return v;
}

// =============================================================================
// checarTrancamento
// =============================================================================

// deno-lint-ignore no-explicit-any
export function checarTrancamento(payload: any, resultado: ResultadoMatricula): Invariante[] {
  const v: Invariante[] = [];

  if (resultado.aluno_id === null) {
    v.push({ regra: 'trancamento_aluno_nao_encontrado', severidade: 'critico',
      mensagem: 'aluno não localizado por emusys_matricula_id nem (aluno+curso)' });
  }

  // Payload Emusys: motivo em trancamento.motivo. Fallbacks: matricula.motivo / motivo.
  const motivoTranc = payload?.trancamento?.motivo ?? payload?.matricula?.motivo ?? payload?.motivo;
  if (isEmpty(motivoTranc)) {
    v.push({ regra: 'trancamento_sem_motivo', severidade: 'aviso',
      mensagem: 'motivo do trancamento vazio' });
  }

  return v;
}

// =============================================================================
// checarFinalizacao (evasão)
// =============================================================================

// deno-lint-ignore no-explicit-any
export function checarFinalizacao(payload: any, resultado: ResultadoMatricula): Invariante[] {
  const v: Invariante[] = [];

  if (resultado.aluno_id === null) {
    v.push({ regra: 'evasao_aluno_nao_encontrado', severidade: 'critico',
      mensagem: 'aluno não localizado' });
  }

  // Payload Emusys: motivo de evasão em finalizacao.motivo. Fallbacks: matricula.motivo / motivo.
  const motivoTexto = payload?.finalizacao?.motivo ?? payload?.matricula?.motivo ?? payload?.motivo;
  const motivoId = payload?.finalizacao?.motivo_saida_id ?? payload?.matricula?.motivo_saida_id ?? payload?.motivo_saida_id;
  if (isEmpty(motivoTexto) && isEmpty(motivoId)) {
    v.push({ regra: 'evasao_motivo_nulo', severidade: 'aviso',
      mensagem: 'motivo da evasão vazio (não impacta score)' });
  } else if (isEmpty(motivoId)) {
    v.push({ regra: 'evasao_sem_motivo_saida_id', severidade: 'aviso',
      mensagem: `motivo veio só como texto: "${motivoTexto}" — impacta cálculo de score` });
  }

  return v;
}
