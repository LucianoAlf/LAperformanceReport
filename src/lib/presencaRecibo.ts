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

export type StatusRecibo = 'concluido' | 'parcial' | 'falhou' | 'nao_recebido';

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
const pedidosEmVoo = new Map<string, string>();

export function chaveDoPedido(escopo: string, payload: unknown): string {
  return `${escopo}:${JSON.stringify(payload)}`;
}

export function requestIdDoPedido(chave: string): string {
  const existente = pedidosEmVoo.get(chave);
  if (existente) return existente;
  const novo = novoRequestId();
  pedidosEmVoo.set(chave, novo);
  return novo;
}

/**
 * Encerra o pedido quando o banco RESPONDEU (mesmo recusando) — dali em diante
 * um novo clique e uma nova intencao. Falha de rede NAO encerra: e exatamente
 * o caso em que nao se sabe se chegou, e o retry precisa do mesmo id.
 */
export function encerrarPedido(chave: string): void {
  pedidosEmVoo.delete(chave);
}

export function interpretarRecibo(data: unknown): ReciboPresenca {
  const bruto = (data ?? {}) as Record<string, unknown>;
  const status = bruto.status;
  if (typeof status !== 'string') {
    throw new Error('Resposta inesperada do banco: recibo sem status');
  }
  const erros = Array.isArray(bruto.erros) ? (bruto.erros as Record<string, unknown>[]) : [];
  return {
    request_id: typeof bruto.request_id === 'string' ? bruto.request_id : undefined,
    status: status as StatusRecibo,
    aplicados: Number(bruto.aplicados ?? 0),
    rejeitados: Number(bruto.rejeitados ?? 0),
    erros: erros.map((e) => ({
      aluno_id: typeof e.aluno_id === 'number' ? e.aluno_id : undefined,
      professor_id: typeof e.professor_id === 'number' ? e.professor_id : undefined,
      codigo: String(e.codigo ?? 'erro_desconhecido'),
    })),
  };
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
