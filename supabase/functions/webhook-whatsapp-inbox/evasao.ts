// deno-lint-ignore-file no-explicit-any

export type RespostaIngestaoVersao = "legado_v1" | "multipartes_v2";
export type TipoEventoEvasao = "texto" | "audio";
export type Substantividade =
  | "adiamento"
  | "abertura"
  | "conteudo_substantivo"
  | "opt_out"
  | "indeterminado";
export type ResolutionStatus = "resolvida" | "sem_pesquisa" | "ambigua";

export interface EventoInbound {
  caixaId: number;
  providerMessageId: string | null;
  quotedProviderMessageId: string | null;
  telefoneNormalizado: string;
  tipo: TipoEventoEvasao;
  texto: string | null;
  providerCreatedAt: string | null;
  recebidoEm: string;
  correlationId: string;
  fromMe: boolean;
  buttonOrListid: string | null;
}

export interface PesquisaCandidata {
  id: string;
  respostaIngestaoVersao: RespostaIngestaoVersao;
  respostaStatus: string;
  enviadoEm: string;
  primeiraInteracaoEm: string | null;
}

export type ResolucaoPesquisa =
  | {
    status: "resolvida";
    criterio: "mensagem_citada" | "telefone_caixa";
    pesquisa: PesquisaCandidata;
  }
  | { status: "sem_pesquisa" }
  | { status: "ambigua"; candidatos: string[] };

export interface NovaMensagem {
  pesquisaId: string | null;
  caixaId: number;
  direcao: "entrada";
  providerMessageId: string | null;
  telefoneNormalizado: string;
  tipo: TipoEventoEvasao;
  texto: string | null;
  providerCreatedAt: string | null;
  recebidoEm: string;
  resolutionStatus: ResolutionStatus;
  substantividade: Substantividade;
  correlationId: string;
}

export interface MensagemPersistida {
  id: string | null;
  duplicate: boolean;
}

export interface AtualizacaoCabecalho {
  pesquisaId: string;
  respostaStatus: "coletando";
  primeiraInteracaoEm: string;
  ultimaInteracaoEm: string | null;
  respostaTipoCompatibilidade: TipoEventoEvasao;
  respostaTextoCompatibilidade?: string;
  atualizadoEm: string;
}

export interface PesquisaRepository {
  buscarPorMensagemCitada(
    evento: EventoInbound,
  ): Promise<PesquisaCandidata | null>;
  listarPesquisasAbertas(
    evento: EventoInbound,
  ): Promise<PesquisaCandidata[]>;
  inserirMensagem(mensagem: NovaMensagem): Promise<MensagemPersistida>;
  atualizarCabecalho(atualizacao: AtualizacaoCabecalho): Promise<void>;
  criarNovaVersaoAnalise(pesquisaId: string): Promise<number>;
}

export type IngestResult =
  | { status: "ignored"; handled: false }
  | { status: "legado"; handled: false; pesquisaId: string }
  | { status: "duplicate"; handled: boolean; pesquisaId: string | null }
  | { status: "triagem"; handled: false; mensagemId: string | null }
  | {
    status: "registrada";
    handled: true;
    pesquisaId: string;
    mensagemId: string;
  };

export interface NormalizarEventoContexto {
  caixaId: number | null;
  telefoneNormalizado: string;
  correlationId: string;
  recebidoEm?: string;
}

const JANELA_RESPOSTA_MS = 7 * 24 * 60 * 60 * 1000;
const STATUS_ABERTOS = new Set([
  "sem_resposta",
  "coletando",
  "pronta_para_revisao",
  "em_revisao",
  "revisada",
]);

function textoNaoVazio(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const texto = valor.trim();
  return texto.length > 0 ? texto : null;
}

function timestampIso(valor: unknown): string | null {
  const numero = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(numero) || numero <= 0) return null;
  const milissegundos = numero < 1_000_000_000_000 ? numero * 1000 : numero;
  const data = new Date(milissegundos);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

export function normalizarEventoUazapi(
  payload: unknown,
  contexto: NormalizarEventoContexto,
): EventoInbound | null {
  if (!payload || typeof payload !== "object") return null;
  if (!contexto.caixaId || contexto.caixaId <= 0) return null;

  const bruto = payload as Record<string, any>;
  const message = bruto.message ?? {};
  const texto = textoNaoVazio(
    message.conversation ?? message.extendedTextMessage?.text ?? bruto.text,
  );
  const ehAudio = Boolean(
    message.audioMessage ?? message.ptt ?? bruto.type === "audio",
  );
  if (!texto && !ehAudio) return null;

  const telefone = contexto.telefoneNormalizado.replace(/\D/g, "");
  if (!telefone) return null;

  return {
    caixaId: contexto.caixaId,
    providerMessageId: textoNaoVazio(
      bruto.key?.id ?? bruto.id ?? bruto.messageId ?? bruto.messageid,
    ),
    quotedProviderMessageId: textoNaoVazio(
      bruto.quotedProviderMessageId ??
        bruto.quoted ??
        message.extendedTextMessage?.contextInfo?.stanzaId ??
        message.contextInfo?.stanzaId,
    ),
    telefoneNormalizado: telefone,
    tipo: ehAudio ? "audio" : "texto",
    texto: ehAudio ? null : texto,
    providerCreatedAt: timestampIso(
      bruto.messageTimestamp ?? bruto.timestamp,
    ),
    recebidoEm: contexto.recebidoEm ?? new Date().toISOString(),
    correlationId: contexto.correlationId,
    fromMe: bruto.key?.fromMe === true || bruto.fromMe === true,
    buttonOrListid: textoNaoVazio(bruto.buttonOrListid),
  };
}

function normalizarParaClassificacao(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function classificarSubstantividade(
  texto: string | null,
): Substantividade {
  if (!texto?.trim()) return "indeterminado";
  const normalizado = normalizarParaClassificacao(texto);

  if (
    /\b(nao quero responder|nao me mande mais mensagens|pare de mandar mensagem|remova meu numero)\b/
      .test(
        normalizado,
      )
  ) {
    return "opt_out";
  }

  if (
    /\b(respondo|responder|falo|falamos)\b.*\b(amanha|depois|mais tarde|daqui a pouco)\b/
      .test(
        normalizado,
      ) || /\b(agora nao|depois eu respondo)\b/.test(normalizado)
  ) {
    return "adiamento";
  }

  if (
    /^(oi|ola|bom dia|boa tarde|boa noite|tudo bem|entao|pois e|deixa eu te falar)$/i
      .test(
        normalizado,
      )
  ) {
    return "abertura";
  }

  return normalizado.split(" ").filter(Boolean).length >= 3
    ? "conteudo_substantivo"
    : "indeterminado";
}

function dentroDaJanela(
  pesquisa: PesquisaCandidata,
  evento: EventoInbound,
): boolean {
  if (!STATUS_ABERTOS.has(pesquisa.respostaStatus)) return false;
  const envio = Date.parse(pesquisa.enviadoEm);
  const recebimento = Date.parse(evento.recebidoEm);
  if (!Number.isFinite(envio) || !Number.isFinite(recebimento)) return false;
  return recebimento >= envio && recebimento - envio <= JANELA_RESPOSTA_MS;
}

export async function resolverPesquisa(
  evento: EventoInbound,
  repository: PesquisaRepository,
): Promise<ResolucaoPesquisa> {
  if (evento.quotedProviderMessageId) {
    const citada = await repository.buscarPorMensagemCitada(evento);
    if (citada && dentroDaJanela(citada, evento)) {
      return {
        status: "resolvida",
        criterio: "mensagem_citada",
        pesquisa: citada,
      };
    }
  }

  const candidatas = (await repository.listarPesquisasAbertas(evento))
    .filter((item) => dentroDaJanela(item, evento));
  const unicas = [
    ...new Map(candidatas.map((item) => [item.id, item])).values(),
  ];

  if (unicas.length === 1) {
    return {
      status: "resolvida",
      criterio: "telefone_caixa",
      pesquisa: unicas[0],
    };
  }
  if (unicas.length > 1) {
    return { status: "ambigua", candidatos: unicas.map((item) => item.id) };
  }
  return { status: "sem_pesquisa" };
}

export async function ingerirEvento(
  evento: EventoInbound,
  resolution: ResolucaoPesquisa,
  repository: PesquisaRepository,
): Promise<IngestResult> {
  if (evento.fromMe || evento.buttonOrListid) {
    return { status: "ignored", handled: false };
  }

  if (
    resolution.status === "resolvida" &&
    resolution.pesquisa.respostaIngestaoVersao === "legado_v1"
  ) {
    return {
      status: "legado",
      handled: false,
      pesquisaId: resolution.pesquisa.id,
    };
  }

  const substantividade = classificarSubstantividade(evento.texto);
  const pesquisa = resolution.status === "resolvida"
    ? resolution.pesquisa
    : null;
  const persistida = await repository.inserirMensagem({
    pesquisaId: pesquisa?.id ?? null,
    caixaId: evento.caixaId,
    direcao: "entrada",
    providerMessageId: evento.providerMessageId,
    telefoneNormalizado: evento.telefoneNormalizado,
    tipo: evento.tipo,
    texto: evento.texto,
    providerCreatedAt: evento.providerCreatedAt,
    recebidoEm: evento.recebidoEm,
    resolutionStatus: resolution.status === "resolvida"
      ? "resolvida"
      : resolution.status,
    substantividade,
    correlationId: evento.correlationId,
  });

  if (persistida.duplicate) {
    return {
      status: "duplicate",
      handled: resolution.status === "resolvida",
      pesquisaId: pesquisa?.id ?? null,
    };
  }

  if (!pesquisa) {
    return { status: "triagem", handled: false, mensagemId: persistida.id };
  }

  if (pesquisa.respostaStatus === "revisada") {
    await repository.criarNovaVersaoAnalise(pesquisa.id);
  }

  const ehSubstantivo = substantividade === "conteudo_substantivo";
  await repository.atualizarCabecalho({
    pesquisaId: pesquisa.id,
    respostaStatus: "coletando",
    primeiraInteracaoEm: pesquisa.primeiraInteracaoEm ?? evento.recebidoEm,
    ultimaInteracaoEm: ehSubstantivo ? evento.recebidoEm : null,
    respostaTipoCompatibilidade: evento.tipo,
    ...(evento.tipo === "texto" && evento.texto
      ? { respostaTextoCompatibilidade: evento.texto }
      : {}),
    atualizadoEm: evento.recebidoEm,
  });

  return {
    status: "registrada",
    handled: true,
    pesquisaId: pesquisa.id,
    mensagemId: persistida.id!,
  };
}

const PESQUISA_SELECT = [
  "id",
  "resposta_ingestao_versao",
  "resposta_status",
  "enviado_em",
  "primeira_interacao_em",
].join(",");

function mapPesquisa(row: Record<string, any>): PesquisaCandidata {
  return {
    id: row.id,
    respostaIngestaoVersao: row.resposta_ingestao_versao,
    respostaStatus: row.resposta_status,
    enviadoEm: row.enviado_em,
    primeiraInteracaoEm: row.primeira_interacao_em,
  };
}

export function criarRepositorioPesquisaEvasao(
  supabase: any,
): PesquisaRepository {
  return {
    async buscarPorMensagemCitada(evento) {
      if (!evento.quotedProviderMessageId) return null;
      const { data, error } = await supabase
        .from("pesquisa_evasao")
        .select(PESQUISA_SELECT)
        .eq("caixa_id", evento.caixaId)
        .eq("provider_message_id", evento.quotedProviderMessageId)
        .in("envio_status", ["enviado", "entregue", "lido"])
        .limit(1)
        .maybeSingle();
      if (error) throw new Error("falha_resolver_pesquisa_citada");
      return data ? mapPesquisa(data) : null;
    },

    async listarPesquisasAbertas(evento) {
      const { data, error } = await supabase
        .from("pesquisa_evasao")
        .select(PESQUISA_SELECT)
        .eq("caixa_id", evento.caixaId)
        .eq("telefone_destino_snapshot", evento.telefoneNormalizado)
        .in("envio_status", ["enviado", "entregue", "lido"])
        .in("resposta_status", [...STATUS_ABERTOS])
        .order("enviado_em", { ascending: false })
        .limit(3);
      if (error) throw new Error("falha_resolver_pesquisa_telefone_caixa");
      return (data ?? []).map(mapPesquisa);
    },

    async inserirMensagem(mensagem) {
      const { data, error } = await supabase
        .from("pesquisa_evasao_mensagens")
        .insert({
          pesquisa_id: mensagem.pesquisaId,
          caixa_id: mensagem.caixaId,
          direcao: mensagem.direcao,
          provider_message_id: mensagem.providerMessageId,
          telefone_normalizado: mensagem.telefoneNormalizado,
          tipo: mensagem.tipo,
          texto: mensagem.texto,
          provider_created_at: mensagem.providerCreatedAt,
          recebido_em: mensagem.recebidoEm,
          resolution_status: mensagem.resolutionStatus,
          substantividade: mensagem.substantividade,
          correlation_id: mensagem.correlationId,
        })
        .select("id")
        .single();
      if (error?.code === "23505") return { id: null, duplicate: true };
      if (error) throw new Error("falha_persistir_evento_evasao");
      return { id: data.id, duplicate: false };
    },

    async atualizarCabecalho(atualizacao) {
      const patch: Record<string, unknown> = {
        resposta_status: atualizacao.respostaStatus,
        primeira_interacao_em: atualizacao.primeiraInteracaoEm,
        resposta_tipo: atualizacao.respostaTipoCompatibilidade,
        updated_at: atualizacao.atualizadoEm,
      };
      if (atualizacao.ultimaInteracaoEm) {
        patch.ultima_interacao_em = atualizacao.ultimaInteracaoEm;
      }
      if (atualizacao.respostaTextoCompatibilidade !== undefined) {
        patch.resposta_texto = atualizacao.respostaTextoCompatibilidade;
      }

      const { error } = await supabase
        .from("pesquisa_evasao")
        .update(patch)
        .eq("id", atualizacao.pesquisaId)
        .eq("resposta_ingestao_versao", "multipartes_v2");
      if (error) throw new Error("falha_atualizar_cabecalho_evasao");
    },

    async criarNovaVersaoAnalise(pesquisaId) {
      const { data, error } = await supabase.rpc(
        "preparar_nova_analise_pesquisa_evasao",
        { p_pesquisa_id: pesquisaId },
      );
      if (error) throw new Error("falha_preparar_nova_analise_evasao");
      return Number(data);
    },
  };
}
