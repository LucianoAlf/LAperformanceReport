export type StatusTranscricao =
  | "pendente"
  | "processando"
  | "concluida"
  | "falhou";

export interface ContextoMensagemAudio {
  mensagemId: string;
  pesquisaId: string | null;
  caixaId: number;
  providerMessageId: string;
  tipo: string;
  audioStoragePath: string | null;
}

export interface TranscricaoRegistro {
  id: string;
  versao: number;
  status: StatusTranscricao;
  texto: string | null;
}

export interface RepositorioTranscricao {
  carregarMensagem(mensagemId: string): Promise<ContextoMensagemAudio | null>;
  buscarUltima(mensagemId: string): Promise<TranscricaoRegistro | null>;
  criarPendente(
    mensagemId: string,
    versao: number,
  ): Promise<TranscricaoRegistro>;
  claimPendente(transcricaoId: string): Promise<boolean>;
  concluir(transcricaoId: string, texto: string): Promise<void>;
  falhar(transcricaoId: string, codigo: string): Promise<void>;
  atualizarStoragePath(mensagemId: string, path: string): Promise<void>;
}

export interface MidiaProcessada {
  texto: string | null;
  arquivo: Uint8Array;
  contentType: string;
}

export interface ProcessadorMidia {
  obterDoProvedor(contexto: ContextoMensagemAudio): Promise<MidiaProcessada>;
  salvarPrivado(
    contexto: ContextoMensagemAudio,
    midia: MidiaProcessada,
  ): Promise<string>;
}

export class ErroTranscricao extends Error {
  constructor(public readonly codigo: string, mensagem?: string) {
    super(mensagem ?? codigo);
  }
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODIGOS_PERMITIDOS = new Set([
  "mensagem_nao_encontrada",
  "mensagem_nao_audio",
  "provider_id_ausente",
  "provedor_indisponivel",
  "resposta_provedor_invalida",
  "midia_indisponivel",
  "storage_falhou",
  "transcricao_vazia",
]);

export function autenticarServiceRole(
  authorization: string | null,
  serviceRoleKey: string,
): boolean {
  if (!serviceRoleKey || !authorization?.startsWith("Bearer ")) return false;
  const recebido = authorization.slice(7);
  if (recebido.length !== serviceRoleKey.length) return false;
  let diferenca = 0;
  for (let i = 0; i < recebido.length; i += 1) {
    diferenca |= recebido.charCodeAt(i) ^ serviceRoleKey.charCodeAt(i);
  }
  return diferenca === 0;
}

export function validarPedidoTranscricao(body: unknown): string {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("pedido_invalido");
  }
  const record = body as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "mensagem_id")) {
    throw new Error("pedido_invalido");
  }
  if (
    typeof record.mensagem_id !== "string" || !UUID.test(record.mensagem_id)
  ) {
    throw new Error("mensagem_id_invalido");
  }
  return record.mensagem_id;
}

function codigoSeguro(error: unknown): string {
  if (
    error instanceof ErroTranscricao && CODIGOS_PERMITIDOS.has(error.codigo)
  ) {
    return error.codigo;
  }
  return "erro_interno";
}

export type ResultadoTranscricao =
  | { status: "concluida"; versao: number; cached?: true }
  | { status: "processando"; versao: number }
  | { status: "falhou"; versao: number; codigo: string };

export async function processarTranscricao(
  mensagemId: string,
  repositorio: RepositorioTranscricao,
  processador: ProcessadorMidia,
): Promise<ResultadoTranscricao> {
  const contexto = await repositorio.carregarMensagem(mensagemId);
  if (!contexto) throw new ErroTranscricao("mensagem_nao_encontrada");
  if (contexto.tipo !== "audio") {
    throw new ErroTranscricao("mensagem_nao_audio");
  }
  if (!contexto.providerMessageId) {
    throw new ErroTranscricao("provider_id_ausente");
  }

  let transcricao = await repositorio.buscarUltima(mensagemId);
  if (transcricao?.status === "concluida") {
    return { status: "concluida", versao: transcricao.versao, cached: true };
  }
  if (transcricao?.status === "processando") {
    return { status: "processando", versao: transcricao.versao };
  }
  if (!transcricao || transcricao.status === "falhou") {
    transcricao = await repositorio.criarPendente(
      mensagemId,
      (transcricao?.versao ?? 0) + 1,
    );
  }

  const claimed = await repositorio.claimPendente(transcricao.id);
  if (!claimed) {
    return { status: "processando", versao: transcricao.versao };
  }

  try {
    const midia = await processador.obterDoProvedor(contexto);
    const texto = midia.texto?.trim();
    if (!texto) throw new ErroTranscricao("transcricao_vazia");
    if (midia.arquivo.byteLength === 0) {
      throw new ErroTranscricao("midia_indisponivel");
    }
    const storagePath = contexto.audioStoragePath ??
      await processador.salvarPrivado(contexto, midia);
    if (!contexto.audioStoragePath) {
      await repositorio.atualizarStoragePath(mensagemId, storagePath);
    }
    await repositorio.concluir(transcricao.id, texto);
    return { status: "concluida", versao: transcricao.versao };
  } catch (error) {
    const codigo = codigoSeguro(error);
    await repositorio.falhar(transcricao.id, codigo);
    return { status: "falhou", versao: transcricao.versao, codigo };
  }
}
