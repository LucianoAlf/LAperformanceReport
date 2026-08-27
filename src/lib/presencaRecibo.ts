/**
 * Recibo das acoes de presenca — Checkpoint 4 do rollout de presenca canonica
 * (plano `2026-08-26-presenca-canonica-ponta-a-ponta`, Tasks 4.3 e 4.4).
 *
 * Toda escrita humana de presenca passa a levar um `request_id` gerado aqui.
 * Com ele o banco grava a INTENCAO antes de aplicar (`presenca_comandos`),
 * o resultado de cada aluno (`presenca_acao_eventos`) e QUEM pediu
 * (`auth_user_id`/`usuario_id`) — que era justamente o que faltava: em 26/08,
 * das 224 marcacoes da Agenda, so 2 sabiam dizer quem clicou.
 *
 * O id e reusado no retry de propósito. Se cada clique gerasse um id novo, o
 * banco nao teria como saber que e a mesma acao e a idempotencia nao
 * protegeria de nada — o recibo viraria so mais uma linha de log.
 */

export type StatusRecibo =
  | 'nao_recebido'
  | 'recebido'
  | 'processando'
  | 'concluido'
  | 'parcial'
  | 'falhou';

const STATUS_RECIBO: ReadonlySet<string> = new Set<StatusRecibo>([
  'nao_recebido',
  'recebido',
  'processando',
  'concluido',
  'parcial',
  'falhou',
]);

const STATUS_RESOLVIDO = new Set<StatusRecibo>([
  'nao_recebido',
  'concluido',
  'parcial',
  'falhou',
]);

function statusReciboValido(status: string): status is StatusRecibo {
  return STATUS_RECIBO.has(status);
}

export interface ErroRecibo {
  aluno_id?: number;
  professor_id?: number;
  codigo: string;
}

export interface ReciboPresenca {
  request_id?: string;
  status: StatusRecibo;
  aplicados: number;
  rejeitados: number;
  erros: ErroRecibo[];
}

export interface ArmazenamentoPedidos {
  getItem(chave: string): string | null;
  setItem(chave: string, valor: string): void;
  removeItem(chave: string): void;
}

/**
 * O banco devolve os codigos em MAIUSCULO (`app_aplicar_comando_presenca_v1`
 * normaliza com `upper()`), mas as regras internas os produzem em minusculo.
 * A busca aqui e case-insensitive para nao depender de qual camada respondeu.
 */
const MENSAGENS_ERRO: Record<string, string> = {
  aula_nao_encontrada: 'aula não encontrada',
  sem_permissao_unidade: 'sem permissão nesta unidade',
  sem_permissao: 'sem permissão',
  sem_permissao_comando: 'sem permissão para este pedido',
  aula_cancelada: 'aula cancelada',
  status_invalido: 'status inválido',
  motivo_obrigatorio_justificada: 'justificativa exige motivo',
  aluno_fora_do_roster: 'aluno fora do roster da aula',
  experimental_nao_encontrada: 'aula experimental não encontrada',
  decisao_forte_preservada: 'já havia uma marcação mais forte, preservada',
  sem_aulas_alvo: 'nenhuma aula deste professor no dia',
  roster_nao_confirmado: 'lista de alunos da aula ainda não confirmada',
  roster_incompleto: 'lista de alunos da aula está incompleta',
  roster_nao_sincronizado: 'aula sem lista de alunos sincronizada',
  chamada_ainda_nao_disponivel: 'a aula ainda não começou',
  janela_de_chamada_encerrada: 'janela de lançamento encerrada',
};

export function descreverErro(codigo: string): string {
  const chave = String(codigo ?? '').toLowerCase();
  return MENSAGENS_ERRO[chave] ?? chave.replace(/_/g, ' ');
}

/** `crypto.randomUUID` exige contexto seguro; o fallback cobre http em rede local. */
export function novoRequestId(): string {
  const cripto = globalThis.crypto;
  if (cripto?.randomUUID) return cripto.randomUUID();
  const bytes = new Uint8Array(16);
  cripto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Carteira de pedidos em voo: mesma intencao => mesmo `request_id` ate o banco
 * responder. Repetir o id com o MESMO conteudo devolve o recibo anterior sem
 * reaplicar; repetir com conteudo diferente e recusado pelo banco
 * (`request_id_reutilizado`), por isso a chave inclui o payload.
 */
const PREFIXO_PEDIDO = 'la-report:presenca:pedidos:v2:';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const pedidosEmVoo = new Map<string, string>();

function requestIdValido(requestId: unknown): requestId is string {
  return typeof requestId === 'string' && UUID_V4.test(requestId);
}

function storagePadrao(): ArmazenamentoPedidos | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function chaveStorage(chave: string): string {
  return `${PREFIXO_PEDIDO}${chave}`;
}

export function chaveDoPedido(usuarioId: string, escopo: string, payload: unknown): string {
  if (!usuarioId) throw new Error('Usuário autenticado obrigatório para registrar presença');
  return `${usuarioId}:${escopo}:${JSON.stringify(payload)}`;
}

export function requestIdDoPedido(
  chave: string,
  storage: ArmazenamentoPedidos | null = storagePadrao(),
  memoria: Map<string, string> = pedidosEmVoo,
): string {
  const emMemoria = memoria.get(chave);
  if (emMemoria) return emMemoria;

  try {
    const bruto = storage?.getItem(chaveStorage(chave));
    if (bruto) {
      const salvo = JSON.parse(bruto) as { requestId?: unknown };
      if (requestIdValido(salvo.requestId)) {
        memoria.set(chave, salvo.requestId);
        return salvo.requestId;
      }
      storage?.removeItem(chaveStorage(chave));
    }
  } catch {
    try {
      storage?.removeItem(chaveStorage(chave));
    } catch {
      // A memória segue disponível mesmo se o storage estiver indisponível.
    }
  }

  const requestId = novoRequestId();
  memoria.set(chave, requestId);
  try {
    storage?.setItem(chaveStorage(chave), JSON.stringify({ requestId }));
  } catch {
    // Persistência de sessão é best effort; a memória mantém a intenção.
  }
  return requestId;
}

/**
 * Encerra o pedido quando o banco RESPONDEU (mesmo recusando) — dali em diante
 * um novo clique e uma nova intencao. Falha de rede NAO encerra: e exatamente
 * o caso em que nao se sabe se chegou, e o retry precisa do mesmo id.
 */
export function encerrarPedido(
  chave: string,
  storage: ArmazenamentoPedidos | null = storagePadrao(),
  memoria: Map<string, string> = pedidosEmVoo,
): void {
  memoria.delete(chave);
  try {
    storage?.removeItem(chaveStorage(chave));
  } catch {
    // A limpeza em memória já ocorreu.
  }
}

export function interpretarRecibo(data: unknown): ReciboPresenca {
  const bruto = (data ?? {}) as Record<string, unknown>;
  const status = bruto.status;
  if (typeof status !== 'string') {
    throw new Error('Resposta inesperada do banco: recibo sem status');
  }
  if (!statusReciboValido(status)) {
    throw new Error('Resposta inesperada do banco: status desconhecido');
  }

  const aplicados = bruto.aplicados;
  const rejeitados = bruto.rejeitados;
  if (
    typeof aplicados !== 'number'
    || !Number.isInteger(aplicados)
    || aplicados < 0
    || typeof rejeitados !== 'number'
    || !Number.isInteger(rejeitados)
    || rejeitados < 0
  ) {
    throw new Error('Resposta inesperada do banco: contadores inválidos');
  }
  if (!Array.isArray(bruto.erros)) {
    throw new Error('Resposta inesperada do banco: erros inválidos');
  }

  const erros = bruto.erros;
  return {
    request_id: typeof bruto.request_id === 'string' ? bruto.request_id : undefined,
    status,
    aplicados,
    rejeitados,
    erros: erros.map((erro) => {
      const e = typeof erro === 'object' && erro !== null
        ? (erro as Record<string, unknown>)
        : {};
      return {
        aluno_id: typeof e.aluno_id === 'number' ? e.aluno_id : undefined,
        professor_id: typeof e.professor_id === 'number' ? e.professor_id : undefined,
        codigo: String(e.codigo ?? 'erro_desconhecido'),
      };
    }),
  };
}

export function interpretarEEncerrarPedido(
  chave: string,
  requestIdEsperado: string,
  data: unknown,
  storage: ArmazenamentoPedidos | null = storagePadrao(),
  memoria: Map<string, string> = pedidosEmVoo,
): ReciboPresenca {
  const recibo = interpretarRecibo(data);
  if (recibo.request_id !== requestIdEsperado) {
    throw new Error('Resposta inesperada do banco: request_id divergente');
  }
  if (STATUS_RESOLVIDO.has(recibo.status)) encerrarPedido(chave, storage, memoria);
  return recibo;
}

export function descreverErrosDoRecibo(recibo: ReciboPresenca, opcoes?: { comAluno?: boolean }): string {
  if (recibo.erros.length === 0) return '';
  return recibo.erros
    .map((e) =>
      opcoes?.comAluno && e.aluno_id != null
        ? `aluno ${e.aluno_id}: ${descreverErro(e.codigo)}`
        : descreverErro(e.codigo),
    )
    .join('; ');
}

/** Mensagem legivel de um erro do supabase-js, que NAO e instancia de Error. */
export function mensagemDeErro(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null && 'message' in e) {
    return String((e as Record<string, unknown>).message);
  }
  return String(e);
}
