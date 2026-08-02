import { classificarSubstantividade } from "../_shared/pesquisa-evasao-substantividade.ts";

export type StatusRespostaConversa =
  | "sem_resposta"
  | "coletando"
  | "pronta_para_revisao"
  | "em_revisao"
  | "revisada"
  | "expirada"
  | "invalidada"
  | "recusada_opt_out";

export interface TranscricaoDaMensagem {
  versao: number;
  status: "pendente" | "processando" | "concluida" | "falhou";
  texto: string | null;
}

export interface MensagemDaConversa {
  id: string;
  tipo: "texto" | "audio";
  texto: string | null;
  substantividade: string;
  providerCreatedAt: string | null;
  recebidoEm: string;
  criadoEm: string;
  transcricoes: TranscricaoDaMensagem[];
}

export interface ConversaParaConsolidar {
  pesquisaId: string;
  enviadoEm: string;
  respostaStatus: StatusRespostaConversa;
  ultimaAnalise: { versao: number; status: string } | null;
  mensagens: MensagemDaConversa[];
}

export type DecisaoConsolidacao =
  | { acao: "ignorar" }
  | { acao: "expirar" }
  | { acao: "aguardar"; proximaExecucaoEm: string }
  | {
    acao: "salvar_rascunho";
    versao: number;
    textoConsolidado: string;
    respostaTipo: "texto" | "audio";
    respostaStatus: "coletando" | "pronta_para_revisao";
    proximaExecucaoEm: string | null;
  };

const SEGUNDO = 1_000;
const MINUTO = 60 * SEGUNDO;
const JANELA_RAJADA = 60 * SEGUNDO;
const JANELA_REVISAO = 15 * MINUTO;
const JANELA_EXPIRACAO = 7 * 24 * 60 * MINUTO;

export function autenticarWorkerInterno(
  recebido: string | null,
  esperado: string,
): boolean {
  if (!recebido || !esperado || recebido.length !== esperado.length) {
    return false;
  }
  let diferenca = 0;
  for (let i = 0; i < recebido.length; i += 1) {
    diferenca |= recebido.charCodeAt(i) ^ esperado.charCodeAt(i);
  }
  return diferenca === 0;
}

function instanteOrdenacao(mensagem: MensagemDaConversa): number {
  return Date.parse(mensagem.providerCreatedAt ?? mensagem.recebidoEm);
}

function ordenarMensagens(
  mensagens: MensagemDaConversa[],
): MensagemDaConversa[] {
  return [...mensagens].sort((a, b) =>
    instanteOrdenacao(a) - instanteOrdenacao(b) ||
    Date.parse(a.criadoEm) - Date.parse(b.criadoEm) ||
    a.id.localeCompare(b.id)
  );
}

function ultimaTranscricaoConcluida(
  mensagem: MensagemDaConversa,
): TranscricaoDaMensagem | null {
  return [...mensagem.transcricoes]
    .filter((item) => item.status === "concluida" && item.texto?.trim())
    .sort((a, b) => b.versao - a.versao)[0] ?? null;
}

function temTranscricaoPendente(mensagem: MensagemDaConversa): boolean {
  return mensagem.tipo === "audio" &&
    mensagem.transcricoes.some((item) =>
      item.status === "pendente" || item.status === "processando"
    );
}

function substantividadeEfetiva(mensagem: MensagemDaConversa): string {
  if (mensagem.tipo === "texto") return mensagem.substantividade;
  const transcricao = ultimaTranscricaoConcluida(mensagem);
  return transcricao
    ? classificarSubstantividade(transcricao.texto)
    : mensagem.substantividade;
}

export function listarMensagensComTranscricaoPendente(
  mensagens: MensagemDaConversa[],
): string[] {
  return mensagens.flatMap((mensagem) =>
    mensagem.tipo === "audio" &&
      mensagem.transcricoes.some((item) => item.status === "pendente")
      ? [mensagem.id]
      : []
  );
}

function conteudoOficial(mensagem: MensagemDaConversa): string | null {
  if (substantividadeEfetiva(mensagem) !== "conteudo_substantivo") return null;
  if (mensagem.tipo === "texto") return mensagem.texto?.trim() || null;
  return ultimaTranscricaoConcluida(mensagem)?.texto?.trim() || null;
}

function consolidar(mensagens: MensagemDaConversa[]): string {
  return mensagens.flatMap((mensagem) => {
    const conteudo = conteudoOficial(mensagem);
    if (!conteudo) return [];
    const timestamp = new Date(instanteOrdenacao(mensagem)).toISOString();
    return [`[${timestamp} | ${mensagem.tipo}]\n${conteudo}`];
  }).join("\n\n");
}

function proximaVersao(conversa: ConversaParaConsolidar): number {
  if (!conversa.ultimaAnalise) return 1;
  return conversa.ultimaAnalise.status === "revisada"
    ? conversa.ultimaAnalise.versao + 1
    : conversa.ultimaAnalise.versao;
}

export function decidirConsolidacao(
  conversa: ConversaParaConsolidar,
  agora: Date,
): DecisaoConsolidacao {
  if (
    conversa.respostaStatus === "recusada_opt_out" ||
    conversa.mensagens.some((item) => substantividadeEfetiva(item) === "opt_out")
  ) {
    return { acao: "ignorar" };
  }

  const mensagens = ordenarMensagens(conversa.mensagens);
  const expiraEm = Date.parse(conversa.enviadoEm) + JANELA_EXPIRACAO;
  const conteudo = consolidar(mensagens);
  const temConteudo = conteudo.length > 0;

  if (!temConteudo && agora.getTime() >= expiraEm) {
    return { acao: "expirar" };
  }
  if (mensagens.length === 0) {
    return {
      acao: "aguardar",
      proximaExecucaoEm: new Date(expiraEm).toISOString(),
    };
  }

  const ultimaMensagemEm = instanteOrdenacao(mensagens[mensagens.length - 1]);
  const silencioMs = agora.getTime() - ultimaMensagemEm;
  if (silencioMs < JANELA_RAJADA) {
    return {
      acao: "aguardar",
      proximaExecucaoEm: new Date(ultimaMensagemEm + JANELA_RAJADA)
        .toISOString(),
    };
  }

  if (mensagens.some(temTranscricaoPendente)) {
    return {
      acao: "aguardar",
      proximaExecucaoEm: new Date(agora.getTime() + MINUTO).toISOString(),
    };
  }
  if (!temConteudo) {
    return {
      acao: "aguardar",
      proximaExecucaoEm: new Date(expiraEm).toISOString(),
    };
  }

  const pronta = silencioMs >= JANELA_REVISAO;
  const respostaTipo =
    mensagens.some((mensagem) =>
        mensagem.tipo === "audio" && Boolean(conteudoOficial(mensagem))
      )
      ? "audio"
      : "texto";
  return {
    acao: "salvar_rascunho",
    versao: proximaVersao(conversa),
    textoConsolidado: conteudo,
    respostaTipo,
    respostaStatus: pronta ? "pronta_para_revisao" : "coletando",
    proximaExecucaoEm: pronta
      ? null
      : new Date(ultimaMensagemEm + JANELA_REVISAO).toISOString(),
  };
}
