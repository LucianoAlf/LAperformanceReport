export const CAIXA_LIA_ID = 3;
const CAIXA_LIA_NOME = "Lia - Sucesso do Aluno";
const PROVIDER_TIMEOUT_MS = 30_000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function extrairServiceRoleToken(
  authorization: string | null,
  projectRefEsperado: string,
): string | null {
  if (!projectRefEsperado || !authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  if (!token) return null;

  const partes = token.split(".");
  if (partes.length !== 3) return null;

  try {
    const base64 = partes[1]
      .replaceAll("-", "+")
      .replaceAll("_", "/")
      .padEnd(Math.ceil(partes[1].length / 4) * 4, "=");
    const claims = JSON.parse(atob(base64)) as Record<string, unknown>;
    if (
      claims.role !== "service_role" ||
      claims.ref !== projectRefEsperado
    ) {
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export function validarPedidoDispatcher(
  body: unknown,
): { alertaId: string | null } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("pedido_invalido");
  }
  const data = body as Record<string, unknown>;
  const chaves = Object.keys(data);
  if (chaves.some((chave) => chave !== "alerta_id")) {
    throw new Error("pedido_invalido");
  }
  if (!("alerta_id" in data)) return { alertaId: null };
  if (typeof data.alerta_id !== "string" || !UUID_RE.test(data.alerta_id)) {
    throw new Error("pedido_invalido");
  }
  return { alertaId: data.alerta_id };
}

export type ClaimAlerta = {
  alerta_id: string;
  claim_token: string;
  destino: string;
  mensagem: string;
  evento_tipo: "resposta_nova" | "rodada_nova_pos_revisao" | "opt_out";
  ambiente: "teste" | "producao";
  caixa_id: number;
};

export type CaixaLia = {
  id: number;
  nome: string;
  ativo: boolean;
  provedor: string;
  uazapi_url: string;
  uazapi_token: string;
};

export type CodigoFalhaProvider =
  | "provider_timeout"
  | "provider_conexao_encerrada"
  | "provider_json_invalido"
  | "provider_confirmacao_ambigua"
  | "provider_rejeitado"
  | "provider_http"
  | "provider_configuracao"
  | "provider_interno";

export type DispatcherAdapters = {
  claim(workerId: string, alertaId: string | null): Promise<ClaimAlerta | null>;
  buscarCaixaExata(caixaId: number): Promise<CaixaLia | null>;
  fetchProvider(url: string, init: RequestInit): Promise<Response>;
  concluir(
    alertaId: string,
    claimToken: string,
    messageId: string,
  ): Promise<boolean>;
  falhar(
    alertaId: string,
    claimToken: string,
    codigo: CodigoFalhaProvider,
    ambiguo: boolean,
  ): Promise<boolean>;
  log(evento: Record<string, unknown>): void;
  agora(): number;
};

export type ResultadoDispatcher =
  | { status: "sem_pendencia" }
  | {
    status: "enviado";
    alerta_id: string;
    provider_message_id: string;
  }
  | {
    status: "falha" | "resultado_ambiguo";
    alerta_id: string;
    erro_codigo: CodigoFalhaProvider;
  };

function validarCaixa(caixa: CaixaLia | null): CaixaLia {
  if (
    !caixa ||
    caixa.id !== CAIXA_LIA_ID ||
    caixa.ativo !== true ||
    caixa.nome !== CAIXA_LIA_NOME ||
    caixa.provedor !== "uazapi" ||
    !caixa.uazapi_url?.trim() ||
    !caixa.uazapi_token?.trim()
  ) {
    throw new Error("provider_configuracao");
  }

  let url: URL;
  try {
    url = new URL(caixa.uazapi_url);
  } catch {
    throw new Error("provider_configuracao");
  }
  if (url.protocol !== "https:") {
    throw new Error("provider_configuracao");
  }

  return caixa;
}

function extrairMessageId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const data = payload as Record<string, unknown>;
  const candidatos = [
    data.messageid,
    data.id,
    data.msgId,
    data.messageId,
    data.key && typeof data.key === "object" && !Array.isArray(data.key)
      ? (data.key as Record<string, unknown>).id
      : null,
  ];
  for (const candidato of candidatos) {
    if (typeof candidato === "string" && candidato.trim()) {
      return candidato.trim();
    }
  }
  return null;
}

function logSanitizado(
  adapters: DispatcherAdapters,
  inicio: number,
  campos: Record<string, unknown>,
) {
  adapters.log({
    evento: "lia_alerta_dispatcher",
    ...campos,
    duracao_ms: Math.max(0, adapters.agora() - inicio),
  });
}

async function registrarFalha(
  adapters: DispatcherAdapters,
  claim: ClaimAlerta,
  inicio: number,
  codigo: CodigoFalhaProvider,
  ambiguo: boolean,
): Promise<ResultadoDispatcher> {
  const reconhecido = await adapters.falhar(
    claim.alerta_id,
    claim.claim_token,
    codigo,
    ambiguo,
  );
  if (!reconhecido) {
    throw new Error("claim_desfecho_nao_reconhecido");
  }

  const status = ambiguo ? "resultado_ambiguo" : "falha";
  logSanitizado(adapters, inicio, {
    alerta_id: claim.alerta_id,
    evento_tipo: claim.evento_tipo,
    ambiente: claim.ambiente,
    status,
    erro_codigo: codigo,
  });
  return {
    status,
    alerta_id: claim.alerta_id,
    erro_codigo: codigo,
  };
}

export async function processarUmAlerta(
  adapters: DispatcherAdapters,
  alertaId: string | null = null,
): Promise<ResultadoDispatcher> {
  const inicio = adapters.agora();
  const workerId = crypto.randomUUID();
  const claim = await adapters.claim(workerId, alertaId);

  if (!claim) {
    logSanitizado(adapters, inicio, { status: "sem_pendencia" });
    return { status: "sem_pendencia" };
  }

  if (claim.caixa_id !== CAIXA_LIA_ID) {
    return await registrarFalha(
      adapters,
      claim,
      inicio,
      "provider_configuracao",
      false,
    );
  }

  let caixa: CaixaLia;
  try {
    caixa = validarCaixa(await adapters.buscarCaixaExata(CAIXA_LIA_ID));
  } catch {
    return await registrarFalha(
      adapters,
      claim,
      inicio,
      "provider_configuracao",
      false,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  let response: Response;
  try {
    const baseUrl = caixa.uazapi_url.replace(/\/+$/, "");
    response = await adapters.fetchProvider(`${baseUrl}/send/text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        token: caixa.uazapi_token,
      },
      body: JSON.stringify({
        number: claim.destino,
        text: claim.mensagem,
        delay: 500,
        readchat: true,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    const codigo = error instanceof DOMException && error.name === "AbortError"
      ? "provider_timeout"
      : "provider_conexao_encerrada";
    return await registrarFalha(adapters, claim, inicio, codigo, true);
  }
  clearTimeout(timeout);

  if (!response.ok) {
    return await registrarFalha(
      adapters,
      claim,
      inicio,
      "provider_http",
      false,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return await registrarFalha(
      adapters,
      claim,
      inicio,
      "provider_json_invalido",
      true,
    );
  }

  const messageId = extrairMessageId(payload);
  if (!messageId) {
    return await registrarFalha(
      adapters,
      claim,
      inicio,
      "provider_confirmacao_ambigua",
      true,
    );
  }

  const concluido = await adapters.concluir(
    claim.alerta_id,
    claim.claim_token,
    messageId,
  );
  if (!concluido) {
    throw new Error("claim_desfecho_nao_reconhecido");
  }

  logSanitizado(adapters, inicio, {
    alerta_id: claim.alerta_id,
    evento_tipo: claim.evento_tipo,
    ambiente: claim.ambiente,
    status: "enviado",
  });
  return {
    status: "enviado",
    alerta_id: claim.alerta_id,
    provider_message_id: messageId,
  };
}
