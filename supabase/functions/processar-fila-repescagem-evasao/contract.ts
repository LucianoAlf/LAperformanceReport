export interface EstadoAntesDoEnvio {
  respostaStatus: string;
  envioStatus: string;
  optOutEm: string | null;
  jaExisteSaidaDoToque: boolean;
}

export type DecisaoEnvio =
  | { acao: "enviar" }
  | { acao: "cancelar"; motivo: string };

/**
 * Revalida na hora do disparo o que a RPC validou no enfileiramento. A linha
 * pode ter esperado horas na fila, e nesse meio tempo a pessoa pode ter
 * respondido ou pedido para nao receber mais.
 */
export function decidirEnvioRepescagem(estado: EstadoAntesDoEnvio): DecisaoEnvio {
  if (estado.optOutEm !== null) {
    return { acao: "cancelar", motivo: "opt_out" };
  }
  if (estado.jaExisteSaidaDoToque) {
    return { acao: "cancelar", motivo: "ja_enviada" };
  }
  if (estado.respostaStatus !== "sem_resposta") {
    return { acao: "cancelar", motivo: "respondeu_durante_a_espera" };
  }
  if (!["enviado", "entregue", "lido"].includes(estado.envioStatus)) {
    return { acao: "cancelar", motivo: "primeiro_toque_nao_confirmado" };
  }
  return { acao: "enviar" };
}

/** Comparacao do token do cron, mesmo padrao de processar-conversa-evasao. */
export function autenticarWorkerInterno(
  recebido: string | null,
  esperado: string,
): boolean {
  if (!esperado) return false;
  const a = new TextEncoder().encode(recebido ?? "");
  const b = new TextEncoder().encode(esperado);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}
