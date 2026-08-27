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

type JsonCanonico = null | boolean | number | string | JsonCanonico[] | { [chave: string]: JsonCanonico };

function normalizarRequestId(requestId: unknown): string | null {
  return typeof requestId === 'string' && UUID_V4.test(requestId)
    ? requestId.toLowerCase()
    : null;
}

function storagePadrao(): ArmazenamentoPedidos | null {
  return typeof window === 'undefined' ? null : window.sessionStorage;
}

function chaveStorage(chave: string): string {
  return `${PREFIXO_PEDIDO}${chave}`;
}

function falharPayloadNaoSeguro(): never {
  throw new Error('Payload de presença não é JSON seguro');
}

function canonizarJson(valor: unknown, ativos = new WeakSet<object>()): JsonCanonico {
  if (valor === null) return null;
  if (typeof valor === 'string' || typeof valor === 'boolean') return valor;
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) return falharPayloadNaoSeguro();
    return valor;
  }
  if (typeof valor !== 'object') return falharPayloadNaoSeguro();

  if (ativos.has(valor)) return falharPayloadNaoSeguro();
  ativos.add(valor);

  if (Array.isArray(valor)) {
    if (Object.getOwnPropertySymbols(valor).length > 0) return falharPayloadNaoSeguro();
    const possuiPropriedadeExtra = Object.getOwnPropertyNames(valor).some((chave) => {
      if (chave === 'length') return false;
      const indice = Number(chave);
      return !Number.isInteger(indice)
        || indice < 0
        || indice >= valor.length
        || String(indice) !== chave;
    });
    if (possuiPropriedadeExtra) return falharPayloadNaoSeguro();
    const resultado: JsonCanonico[] = [];
    for (let indice = 0; indice < valor.length; indice += 1) {
      if (!Object.prototype.hasOwnProperty.call(valor, indice)) return falharPayloadNaoSeguro();
      resultado.push(canonizarJson(valor[indice], ativos));
    }
    ativos.delete(valor);
    return resultado;
  }

  const prototipo = Object.getPrototypeOf(valor);
  if (prototipo !== Object.prototype && prototipo !== null) return falharPayloadNaoSeguro();
  if (Object.getOwnPropertySymbols(valor).length > 0) return falharPayloadNaoSeguro();

  const origem = valor as Record<string, unknown>;
  const resultado = Object.create(null) as Record<string, JsonCanonico>;
  for (const chave of Object.keys(origem).sort()) {
    if (origem[chave] === undefined) continue;
    resultado[chave] = canonizarJson(origem[chave], ativos);
  }
  ativos.delete(valor);
  return resultado;
}

function garantirStorageNoBrowser(storage: ArmazenamentoPedidos | null): void {
  if (storage === null && typeof window !== 'undefined') {
    throw new Error('sessionStorage indisponível para registrar presença');
  }
}

function lerRequestIdPersistido(storage: ArmazenamentoPedidos, chave: string): string | null {
  const persistida = chaveStorage(chave);
  const bruto = storage.getItem(persistida);
  if (!bruto) return null;

  let salvo: unknown;
  try {
    salvo = JSON.parse(bruto);
  } catch {
    storage.removeItem(persistida);
    return null;
  }

  const requestIdBruto = typeof salvo === 'object' && salvo !== null && !Array.isArray(salvo)
    ? (salvo as Record<string, unknown>).requestId
    : undefined;
  const requestId = normalizarRequestId(requestIdBruto);
  if (!requestId) {
    storage.removeItem(persistida);
    return null;
  }
  if (requestIdBruto !== requestId) {
    storage.setItem(persistida, JSON.stringify({ requestId }));
  }
  return requestId;
}

export function chaveDoPedido(usuarioId: string, escopo: string, payload: unknown): string {
  if (!usuarioId) throw new Error('Usuário autenticado obrigatório para registrar presença');
  return JSON.stringify(canonizarJson([usuarioId, escopo, payload]));
}

export function requestIdDoPedido(
  chave: string,
  storage: ArmazenamentoPedidos | null = storagePadrao(),
  memoria: Map<string, string> = pedidosEmVoo,
): string {
  garantirStorageNoBrowser(storage);
  const emMemoria = memoria.get(chave);
  if (emMemoria) {
    const canonico = normalizarRequestId(emMemoria);
    if (!canonico) {
      memoria.delete(chave);
      throw new Error('request_id inválido na memória de presença');
    }
    if (canonico !== emMemoria) memoria.set(chave, canonico);
    return canonico;
  }

  const persistido = storage ? lerRequestIdPersistido(storage, chave) : null;
  if (persistido) {
    memoria.set(chave, persistido);
    return persistido;
  }

  const requestId = normalizarRequestId(novoRequestId());
  if (!requestId) throw new Error('Não foi possível gerar request_id válido para presença');
  memoria.set(chave, requestId);
  if (storage) {
    try {
      storage.setItem(chaveStorage(chave), JSON.stringify({ requestId }));
    } catch (erro) {
      if (memoria.get(chave) === requestId) memoria.delete(chave);
      throw erro;
    }
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
  requestIdEsperado?: string,
): void {
  garantirStorageNoBrowser(storage);
  const emMemoriaBruto = memoria.get(chave);
  const emMemoria = emMemoriaBruto === undefined ? null : normalizarRequestId(emMemoriaBruto);
  if (emMemoriaBruto !== undefined && !emMemoria) {
    throw new Error('request_id inválido na memória de presença');
  }
  const persistido = storage ? lerRequestIdPersistido(storage, chave) : null;
  const esperado = requestIdEsperado === undefined
    ? (emMemoria ?? persistido)
    : normalizarRequestId(requestIdEsperado);
  if (requestIdEsperado !== undefined && !esperado) {
    throw new Error('request_id esperado inválido para encerrar presença');
  }
  if (!esperado) return;

  if (storage && persistido === esperado) {
    try {
      storage.removeItem(chaveStorage(chave));
    } catch (erro) {
      // Web Storage não oferece transação: uma implementação pode efetivar a
      // remoção e ainda assim lançar. Releia de forma síncrona para distinguir
      // "não removeu" de "removeu e falhou ao responder". Só o primeiro caso
      // mantém a intenção pendente; no segundo, o recibo terminal já encerrou o
      // pedido e deixar o ID apenas na memória quebraria a regra após reload.
      const depoisDaFalha = lerRequestIdPersistido(storage, chave);
      if (depoisDaFalha === esperado) throw erro;
    }
  }
  if (emMemoria === esperado) memoria.delete(chave);
}

function inteiroNaoNegativo(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 0;
}

function erroReciboValido(erro: unknown): erro is ErroRecibo {
  if (typeof erro !== 'object' || erro === null || Array.isArray(erro)) return false;
  const item = erro as Record<string, unknown>;
  if (typeof item.codigo !== 'string' || item.codigo.trim().length === 0) return false;
  for (const campo of ['aluno_id', 'professor_id'] as const) {
    if (Object.prototype.hasOwnProperty.call(item, campo) && !inteiroNaoNegativo(item[campo])) return false;
  }
  return true;
}

function invariantesReciboValidas(
  status: StatusRecibo,
  aplicados: number,
  rejeitados: number,
  erros: ErroRecibo[],
): boolean {
  switch (status) {
    case 'nao_recebido':
    case 'recebido':
    case 'processando':
      return aplicados === 0 && rejeitados === 0 && erros.length === 0;
    case 'concluido':
      return rejeitados === 0 && erros.length === 0;
    case 'parcial':
      return aplicados > 0 && rejeitados > 0 && erros.length === rejeitados;
    case 'falhou':
      return aplicados === 0 && rejeitados > 0 && erros.length === rejeitados;
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

  if (!bruto.erros.every(erroReciboValido)) {
    throw new Error('Resposta inesperada do banco: erros inválidos');
  }
  const erros = bruto.erros.map((erro) => ({
    ...(Object.prototype.hasOwnProperty.call(erro, 'aluno_id') ? { aluno_id: erro.aluno_id } : {}),
    ...(Object.prototype.hasOwnProperty.call(erro, 'professor_id') ? { professor_id: erro.professor_id } : {}),
    codigo: erro.codigo.trim(),
  }));
  if (!invariantesReciboValidas(status, aplicados, rejeitados, erros)) {
    throw new Error('Resposta inesperada do banco: invariantes inválidas');
  }
  return {
    request_id: typeof bruto.request_id === 'string' ? bruto.request_id.toLowerCase() : undefined,
    status,
    aplicados,
    rejeitados,
    erros,
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
  const requestIdCanonico = normalizarRequestId(recibo.request_id);
  const esperadoCanonico = normalizarRequestId(requestIdEsperado);
  if (!requestIdCanonico || !esperadoCanonico || requestIdCanonico !== esperadoCanonico) {
    throw new Error('Resposta inesperada do banco: request_id divergente');
  }
  recibo.request_id = requestIdCanonico;
  if (STATUS_RESOLVIDO.has(recibo.status)) {
    encerrarPedido(chave, storage, memoria, esperadoCanonico);
  }
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
