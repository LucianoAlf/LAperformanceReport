export interface EstadoAntesDoEnvio {
  respostaStatus: string;
  envioStatus: string;
  optOutEm: string | null;
  // pesquisa_evasao_mensagens nao tem coluna de toque: isto conta qualquer
  // saida ja registrada para a pesquisa, nao especificamente a deste toque.
  jaExisteSaidaNaPesquisa: boolean;
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
  if (estado.jaExisteSaidaNaPesquisa) {
    return { acao: "cancelar", motivo: "ja_enviada" };
  }
  // NAO existe mais guarda de "outro aluno no mesmo telefone ja respondeu".
  // A pesquisa e por ALUNO: dois irmaos que evadiram tem duas pesquisas, sobre
  // experiencias distintas -- no caso real de 05/08/2026, professores
  // diferentes (Miguel/Pedro e Heitor/Willian), e o pai respondeu as duas.
  // A guarda antiga recusava a repescagem do irmao que AINDA NAO respondeu, que
  // e exatamente quem precisa dela: foi ela a unica recusa no teste do lote.
  // Quem impede cobrar a mesma pessoa duas vezes e o check de respostaStatus
  // abaixo, que olha a PROPRIA pesquisa.
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
