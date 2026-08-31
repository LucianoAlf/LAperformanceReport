// deno-lint-ignore-file no-explicit-any

import {
  classificarSubstantividade,
  type Substantividade,
} from "../_shared/pesquisa-evasao-substantividade.ts";
import {
  dentroDaJanelaDeResposta,
  referenciaDaJanela,
} from "../_shared/pesquisa-evasao-janela.ts";

export { classificarSubstantividade };
export type { Substantividade };

export type RespostaIngestaoVersao = "legado_v1" | "multipartes_v2";
export type TipoEventoEvasao = "texto" | "audio";
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
  /**
   * Ultima mensagem NOSSA enviada nesta pesquisa (`direcao='saida'`), quando existe
   * -- na pratica, a repescagem. E dela que a janela de 7 dias conta; sem isso, toda
   * resposta a um 2o toque cai fora da janela e vai parar no motor legado.
   */
  ultimaSaidaEm: string | null;
}

export type ResolucaoPesquisa =
  | {
    status: "resolvida";
    criterio: "mensagem_citada" | "telefone_caixa" | "unica_aguardando";
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
  // "coletando" quando chega conteudo de verdade; qualquer outro valor aqui e
  // a preservacao do status atual (adiamento/saudacao nao mudam o estado da
  // pesquisa -- ver o comentario em ingerirEvento).
  respostaStatus: string;
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
  criarTranscricaoPendente(mensagemId: string): Promise<void>;
  dispararTranscricao(mensagemId: string): void;
}

export type IngestResult =
  | { status: "ignored"; handled: false }
  | { status: "legado"; handled: false; pesquisaId: string }
  | { status: "duplicate"; handled: boolean; pesquisaId: string | null }
  | { status: "triagem"; handled: false; mensagemId: string | null }
  | {
    status: "opt_out";
    handled: true;
    pesquisaId: string;
    mensagemId: string | null;
  }
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

// JANELA_RESPOSTA_MS saiu daqui: mora em `_shared/pesquisa-evasao-janela.ts`, junto
// da regra que a usa. Deixar uma copia do numero aqui e como o prazo comecou a
// divergir entre os dois motores.
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

function dentroDaJanela(
  pesquisa: PesquisaCandidata,
  evento: EventoInbound,
): boolean {
  if (!STATUS_ABERTOS.has(pesquisa.respostaStatus)) return false;
  // A conta mora em `_shared/pesquisa-evasao-janela.ts` e e a MESMA que a
  // consolidacao usa. Ver o cabecalho de la para o incidente que exigiu isso.
  return dentroDaJanelaDeResposta(
    referenciaDaJanela(pesquisa.enviadoEm, pesquisa.ultimaSaidaEm),
    evento.recebidoEm,
  );
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

  const multipartes = unicas.filter(
    (item) => item.respostaIngestaoVersao === "multipartes_v2",
  );
  if (multipartes.length === 1) {
    return {
      status: "resolvida",
      criterio: "telefone_caixa",
      pesquisa: multipartes[0],
    };
  }
  if (multipartes.length > 1) {
    // Irmaos no mesmo telefone: a pesquisa e por ALUNO, entao duas pesquisas
    // do mesmo numero sao perguntas diferentes -- sobre professores
    // diferentes, inclusive. Caso real (05/08/2026): Miguel (prof. Pedro) e
    // Heitor (prof. Willian). O pai respondeu as duas, mas a do Heitor caiu
    // como `ambigua` e ficou `sem_resposta` ate hoje, porque a do Miguel --
    // ja respondida E revisada no dia anterior -- continuava concorrendo:
    // STATUS_ABERTOS inclui `revisada` (de proposito, para permitir
    // complemento depois).
    //
    // Uma pesquisa ja respondida nao deve disputar em pe de igualdade com uma
    // que ainda espera resposta. Se apenas UMA das candidatas esta aguardando,
    // e ela -- sem adivinhacao e sem LLM.
    const aguardando = multipartes.filter(
      (item) => item.respostaStatus === "sem_resposta",
    );
    if (aguardando.length === 1) {
      return {
        status: "resolvida",
        criterio: "unica_aguardando",
        pesquisa: aguardando[0],
      };
    }
    // Duas ou mais aguardando de verdade: continua ambiguo. Nao chutar.
    return {
      status: "ambigua",
      candidatos: multipartes.map((item) => item.id),
    };
  }

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

  if (evento.tipo === "audio" && persistida.id) {
    await repository.criarTranscricaoPendente(persistida.id);
    repository.dispararTranscricao(persistida.id);
  }

  if (!pesquisa) {
    return { status: "triagem", handled: false, mensagemId: persistida.id };
  }

  // O trigger transacional grava a recusa e remove a fila. Não sobrescrever
  // esse estado com o cabeçalho de compatibilidade logo após o INSERT.
  if (substantividade === "opt_out") {
    return {
      status: "opt_out",
      handled: true,
      pesquisaId: pesquisa.id,
      mensagemId: persistida.id,
    };
  }

  if (pesquisa.respostaStatus === "revisada") {
    await repository.criarNovaVersaoAnalise(pesquisa.id);
  }

  const ehSubstantivo = substantividade === "conteudo_substantivo";
  // So conteudo de verdade tira a pesquisa de `sem_resposta`.
  //
  // Antes isto era "coletando" incondicional -- adiamento e saudacao mudavam o
  // status igual. E `sem_resposta` e exatamente o filtro da REPESCAGEM: quem
  // dissesse "respondo amanha" saia da fila de reenvio na hora, para sempre,
  // mesmo sem nunca ter respondido. Ou seja, quem demonstrou interesse virava
  // a unica pessoa que o sistema nunca mais cobrava -- e se sumisse de vez, a
  // pesquisa ainda expirava em 7 dias, tambem fora de `sem_resposta`.
  //
  // Caso real (Joachim, 05/08/2026): prometeu, cumpriu 21 dias depois, e nunca
  // foi repescado. Com a correcao do reconhecimento de adiamento este buraco
  // ficaria MAIS visivel, nao menos: mais gente reconhecida = mais gente
  // silenciosamente fora da fila.
  //
  // Mantendo `sem_resposta`, o encadeamento se resolve sozinho: cumpriu em ate
  // 3 dias, e capturado; sumiu, vira candidata a repescagem -- e "po, nao
  // esquece da gente nao" e exatamente a mensagem certa para quem prometeu.
  await repository.atualizarCabecalho({
    pesquisaId: pesquisa.id,
    respostaStatus: ehSubstantivo ? "coletando" : pesquisa.respostaStatus,
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
    ultimaSaidaEm: null,
  };
}

/**
 * Preenche `ultimaSaidaEm` das candidatas com o toque mais recente que saiu.
 *
 * ⚠️ Falha aqui NAO derruba a resolucao: sem a ultima saida a janela volta a contar
 * do 1o toque, que e o comportamento antigo -- pior, porem conhecido. Derrubar
 * significaria a mensagem nao ser processada de forma alguma, e a assimetria
 * importa: perder a resposta e irreversivel, contar do 1o toque nao.
 *
 * Sao no maximo 3 candidatas (o `limit(3)` de `listarPesquisasAbertas`), entao isso
 * e uma consulta por mensagem recebida, com `in` sobre chave indexada.
 */
async function anexarUltimaSaida(
  supabase: any,
  pesquisas: PesquisaCandidata[],
): Promise<PesquisaCandidata[]> {
  if (pesquisas.length === 0) return pesquisas;
  try {
    const { data, error } = await supabase
      .from("pesquisa_evasao_mensagens")
      .select("pesquisa_id,criado_em")
      .in("pesquisa_id", pesquisas.map((item) => item.id))
      .eq("direcao", "saida")
      .order("criado_em", { ascending: false });
    if (error) throw error;
    const maisRecentePorPesquisa = new Map<string, string>();
    for (const linha of data ?? []) {
      // A consulta ja vem ordenada do mais novo para o mais antigo: a primeira
      // ocorrencia de cada pesquisa e a que vale.
      if (!maisRecentePorPesquisa.has(linha.pesquisa_id)) {
        maisRecentePorPesquisa.set(linha.pesquisa_id, linha.criado_em);
      }
    }
    return pesquisas.map((item) => ({
      ...item,
      ultimaSaidaEm: maisRecentePorPesquisa.get(item.id) ?? null,
    }));
  } catch (erro) {
    console.error(
      "[evasao] falha ao buscar ultima saida das pesquisas",
      pesquisas.map((item) => item.id).join(","),
      erro instanceof Error ? erro.message : String(erro),
    );
    return pesquisas;
  }
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
      if (!data) return null;
      const [comSaida] = await anexarUltimaSaida(supabase, [mapPesquisa(data)]);
      return comSaida;
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
      return await anexarUltimaSaida(supabase, (data ?? []).map(mapPesquisa));
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

    async criarTranscricaoPendente(mensagemId) {
      const { error } = await supabase
        .from("pesquisa_evasao_transcricoes")
        .insert({ mensagem_id: mensagemId, versao: 1, status: "pendente" });
      if (error) throw new Error("falha_enfileirar_transcricao_evasao");
    },

    dispararTranscricao(mensagemId) {
      const tarefa = supabase.functions.invoke("transcrever-mensagem-evasao", {
        body: { mensagem_id: mensagemId },
      });
      const runtime = (globalThis as Record<string, any>).EdgeRuntime;
      if (runtime?.waitUntil) {
        runtime.waitUntil(Promise.resolve(tarefa).catch(() => undefined));
      } else {
        void Promise.resolve(tarefa).catch(() => undefined);
      }
    },
  };
}
