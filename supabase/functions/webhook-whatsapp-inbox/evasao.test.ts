// deno-lint-ignore-file no-import-prefix
/// <reference lib="deno.ns" />

import { assertEquals, assertExists } from "jsr:@std/assert@1";
import {
  type AtualizacaoCabecalho,
  classificarSubstantividade,
  type EventoInbound,
  ingerirEvento,
  type MensagemPersistida,
  normalizarEventoUazapi,
  type NovaMensagem,
  type PesquisaCandidata,
  type PesquisaRepository,
  resolverPesquisa,
} from "./evasao.ts";

const AGORA = "2026-08-02T15:00:00.000Z";

function evento(overrides: Partial<EventoInbound> = {}): EventoInbound {
  return {
    caixaId: 3,
    providerMessageId: "msg-1",
    quotedProviderMessageId: null,
    telefoneNormalizado: "5521999999999",
    tipo: "texto",
    texto: "O professor chegava atrasado nas aulas.",
    providerCreatedAt: AGORA,
    recebidoEm: AGORA,
    correlationId: "10000000-0000-4000-8000-000000000001",
    fromMe: false,
    buttonOrListid: null,
    ...overrides,
  };
}

function pesquisa(
  overrides: Partial<PesquisaCandidata> = {},
): PesquisaCandidata {
  return {
    id: "20000000-0000-4000-8000-000000000001",
    respostaIngestaoVersao: "multipartes_v2",
    respostaStatus: "sem_resposta",
    enviadoEm: "2026-08-01T15:00:00.000Z",
    primeiraInteracaoEm: null,
    ...overrides,
  };
}

class FakeRepository implements PesquisaRepository {
  citada: PesquisaCandidata | null = null;
  abertas: PesquisaCandidata[] = [];
  mensagens: NovaMensagem[] = [];
  cabecalhos: AtualizacaoCabecalho[] = [];
  novasAnalises: string[] = [];
  providerIds = new Set<string>();
  transcricoesPendentes: string[] = [];
  transcricoesDisparadas: string[] = [];

  buscarPorMensagemCitada(): Promise<PesquisaCandidata | null> {
    return Promise.resolve(this.citada);
  }

  listarPesquisasAbertas(): Promise<PesquisaCandidata[]> {
    return Promise.resolve(this.abertas);
  }

  inserirMensagem(mensagem: NovaMensagem): Promise<MensagemPersistida> {
    if (
      mensagem.providerMessageId &&
      this.providerIds.has(`${mensagem.caixaId}:${mensagem.providerMessageId}`)
    ) {
      return Promise.resolve({ id: null, duplicate: true });
    }
    if (mensagem.providerMessageId) {
      this.providerIds.add(`${mensagem.caixaId}:${mensagem.providerMessageId}`);
    }
    this.mensagens.push(mensagem);
    return Promise.resolve({
      id: `30000000-0000-4000-8000-${
        String(this.mensagens.length).padStart(12, "0")
      }`,
      duplicate: false,
    });
  }

  atualizarCabecalho(atualizacao: AtualizacaoCabecalho): Promise<void> {
    this.cabecalhos.push(atualizacao);
    return Promise.resolve();
  }

  criarNovaVersaoAnalise(pesquisaId: string): Promise<number> {
    this.novasAnalises.push(pesquisaId);
    return Promise.resolve(this.novasAnalises.length + 1);
  }

  criarTranscricaoPendente(mensagemId: string): Promise<void> {
    this.transcricoesPendentes.push(mensagemId);
    return Promise.resolve();
  }

  dispararTranscricao(mensagemId: string): void {
    this.transcricoesDisparadas.push(mensagemId);
  }
}

Deno.test("normaliza texto, audio, citação e timestamp UAZAPI sem payload bruto", () => {
  const texto = normalizarEventoUazapi({
    key: { id: "texto-1", fromMe: false },
    message: { conversation: "Minha resposta" },
    quotedProviderMessageId: "outbound-1",
    messageTimestamp: 1_754_147_600_000,
  }, {
    caixaId: 3,
    telefoneNormalizado: "5521999999999",
    correlationId: "10000000-0000-4000-8000-000000000001",
    recebidoEm: AGORA,
  });
  const audio = normalizarEventoUazapi({
    key: { id: "audio-1", fromMe: false },
    message: { audioMessage: { mimetype: "audio/ogg" } },
    messageTimestamp: 1_754_147_601,
  }, {
    caixaId: 3,
    telefoneNormalizado: "5521999999999",
    correlationId: "10000000-0000-4000-8000-000000000002",
    recebidoEm: AGORA,
  });

  assertEquals(texto?.tipo, "texto");
  assertEquals(texto?.texto, "Minha resposta");
  assertEquals(texto?.quotedProviderMessageId, "outbound-1");
  assertEquals(audio?.tipo, "audio");
  assertEquals(audio?.texto, null);
  assertExists(audio?.providerCreatedAt);
});

Deno.test("mensagem citada prevalece sobre dois candidatos por telefone", async () => {
  const repo = new FakeRepository();
  repo.citada = pesquisa({ id: "citada" });
  repo.abertas = [pesquisa({ id: "a" }), pesquisa({ id: "b" })];

  const resolucao = await resolverPesquisa(
    evento({ quotedProviderMessageId: "outbound-1" }),
    repo,
  );

  assertEquals(resolucao.status, "resolvida");
  if (resolucao.status === "resolvida") {
    assertEquals(resolucao.pesquisa.id, "citada");
    assertEquals(resolucao.criterio, "mensagem_citada");
  }
});

Deno.test("única pesquisa aberta resolve por telefone e caixa", async () => {
  const repo = new FakeRepository();
  repo.abertas = [pesquisa({ id: "unica" })];

  const resolucao = await resolverPesquisa(evento(), repo);

  assertEquals(resolucao.status, "resolvida");
  if (resolucao.status === "resolvida") {
    assertEquals(resolucao.pesquisa.id, "unica");
    assertEquals(resolucao.criterio, "telefone_caixa");
  }
});

Deno.test("zero candidato vira sem_pesquisa e dois viram ambigua", async () => {
  const vazio = new FakeRepository();
  assertEquals(
    (await resolverPesquisa(evento(), vazio)).status,
    "sem_pesquisa",
  );

  const duplo = new FakeRepository();
  duplo.abertas = [pesquisa({ id: "a" }), pesquisa({ id: "b" })];
  assertEquals((await resolverPesquisa(evento(), duplo)).status, "ambigua");
});

Deno.test("irmaos no mesmo telefone: vence quem ainda aguarda resposta", async () => {
  // Caso real de 05/08/2026. Miguel (prof. Pedro) respondeu em 04/08 e sua
  // pesquisa ja estava `revisada`; Heitor (prof. Willian) recebeu a dele em
  // 05/08 10:33 e o pai respondeu 10:35 -- "o professor Wil foi...". Como
  // STATUS_ABERTOS inclui `revisada`, as duas concorriam, a resolucao dava
  // `ambigua` e a resposta do Heitor virou orfa: a pesquisa segue
  // `sem_resposta` ate hoje.
  const repo = new FakeRepository();
  repo.abertas = [
    pesquisa({ id: "miguel", respostaStatus: "revisada" }),
    pesquisa({ id: "heitor", respostaStatus: "sem_resposta" }),
  ];

  const resolucao = await resolverPesquisa(evento(), repo);

  assertEquals(resolucao.status, "resolvida");
  if (resolucao.status === "resolvida") {
    assertEquals(resolucao.pesquisa.id, "heitor");
    assertEquals(resolucao.criterio, "unica_aguardando");
  }
});

Deno.test("duas aguardando de verdade continuam ambiguas -- nao chutar", async () => {
  const repo = new FakeRepository();
  repo.abertas = [
    pesquisa({ id: "irmao-a", respostaStatus: "sem_resposta" }),
    pesquisa({ id: "irmao-b", respostaStatus: "sem_resposta" }),
  ];

  assertEquals((await resolverPesquisa(evento(), repo)).status, "ambigua");
});

Deno.test("citacao continua ganhando de tudo, inclusive do desempate", async () => {
  // A mensagem citada e prova; o desempate por "unica aguardando" e inferencia.
  const repo = new FakeRepository();
  repo.citada = pesquisa({ id: "citada", respostaStatus: "revisada" });
  repo.abertas = [pesquisa({ id: "aguardando", respostaStatus: "sem_resposta" })];

  const resolucao = await resolverPesquisa(
    evento({ quotedProviderMessageId: "abc" }),
    repo,
  );

  assertEquals(resolucao.status, "resolvida");
  if (resolucao.status === "resolvida") {
    assertEquals(resolucao.pesquisa.id, "citada");
    assertEquals(resolucao.criterio, "mensagem_citada");
  }
});

Deno.test("unica V2 prevalece sobre pesquisas legadas abertas no mesmo telefone", async () => {
  const repo = new FakeRepository();
  repo.abertas = [
    pesquisa({ id: "legado-a", respostaIngestaoVersao: "legado_v1" }),
    pesquisa({ id: "v2", respostaIngestaoVersao: "multipartes_v2" }),
    pesquisa({ id: "legado-b", respostaIngestaoVersao: "legado_v1" }),
  ];

  const resolucao = await resolverPesquisa(evento(), repo);

  assertEquals(resolucao.status, "resolvida");
  if (resolucao.status === "resolvida") {
    assertEquals(resolucao.pesquisa.id, "v2");
    assertEquals(resolucao.criterio, "telefone_caixa");
  }
});

Deno.test("pesquisa expirada não é associada silenciosamente", async () => {
  const repo = new FakeRepository();
  repo.abertas = [pesquisa({ enviadoEm: "2026-07-01T00:00:00.000Z" })];

  assertEquals((await resolverPesquisa(evento(), repo)).status, "sem_pesquisa");
});

Deno.test("legado_v1 não escreve nas tabelas multipartes", async () => {
  const repo = new FakeRepository();
  const resolucao = {
    status: "resolvida" as const,
    criterio: "telefone_caixa" as const,
    pesquisa: pesquisa({ respostaIngestaoVersao: "legado_v1" }),
  };

  const resultado = await ingerirEvento(evento(), resolucao, repo);

  assertEquals(resultado.status, "legado");
  assertEquals(repo.mensagens.length, 0);
  assertEquals(repo.cabecalhos.length, 0);
});

Deno.test("dois textos V2 criam dois eventos sem sobrescrever o primeiro", async () => {
  const repo = new FakeRepository();
  const alvo = pesquisa();
  const resolucao = {
    status: "resolvida" as const,
    criterio: "telefone_caixa" as const,
    pesquisa: alvo,
  };

  await ingerirEvento(
    evento({
      providerMessageId: "parte-1",
      texto: "Primeira parte importante",
    }),
    resolucao,
    repo,
  );
  await ingerirEvento(
    evento({ providerMessageId: "parte-2", texto: "Segunda parte importante" }),
    resolucao,
    repo,
  );

  assertEquals(repo.mensagens.length, 2);
  assertEquals(repo.mensagens.map((item) => item.texto), [
    "Primeira parte importante",
    "Segunda parte importante",
  ]);
  assertEquals(repo.cabecalhos.length, 2);
  assertEquals(repo.cabecalhos[0].respostaStatus, "coletando");
});

Deno.test("texto, áudio e texto preservam tipo, timestamp e ordem de chegada", async () => {
  const repo = new FakeRepository();
  const resolucao = {
    status: "resolvida" as const,
    criterio: "telefone_caixa" as const,
    pesquisa: pesquisa(),
  };

  await ingerirEvento(
    evento({
      providerMessageId: "1",
      providerCreatedAt: "2026-08-02T15:00:01Z",
    }),
    resolucao,
    repo,
  );
  await ingerirEvento(
    evento({
      providerMessageId: "2",
      tipo: "audio",
      texto: null,
      providerCreatedAt: "2026-08-02T15:00:02Z",
    }),
    resolucao,
    repo,
  );
  await ingerirEvento(
    evento({
      providerMessageId: "3",
      texto: "Fim",
      providerCreatedAt: "2026-08-02T15:00:03Z",
    }),
    resolucao,
    repo,
  );

  assertEquals(repo.mensagens.map((item) => item.tipo), [
    "texto",
    "audio",
    "texto",
  ]);
  assertEquals(repo.mensagens.map((item) => item.providerCreatedAt), [
    "2026-08-02T15:00:01Z",
    "2026-08-02T15:00:02Z",
    "2026-08-02T15:00:03Z",
  ]);
  assertEquals(repo.transcricoesPendentes.length, 1);
  assertEquals(repo.transcricoesDisparadas, repo.transcricoesPendentes);
});

Deno.test("duplicata pelo provider id é sucesso idempotente sem segundo evento", async () => {
  const repo = new FakeRepository();
  const resolucao = {
    status: "resolvida" as const,
    criterio: "telefone_caixa" as const,
    pesquisa: pesquisa(),
  };
  const mesma = evento({ providerMessageId: "duplicada" });

  assertEquals(
    (await ingerirEvento(mesma, resolucao, repo)).status,
    "registrada",
  );
  assertEquals(
    (await ingerirEvento(mesma, resolucao, repo)).status,
    "duplicate",
  );
  assertEquals(repo.mensagens.length, 1);
  assertEquals(repo.cabecalhos.length, 1);
});

Deno.test("fromMe não cria evento e evento sem pesquisa fica disponível para triagem", async () => {
  const repo = new FakeRepository();
  assertEquals(
    (await ingerirEvento(
      evento({ fromMe: true }),
      { status: "sem_pesquisa" },
      repo,
    )).status,
    "ignored",
  );
  assertEquals(repo.mensagens.length, 0);

  const triagem = await ingerirEvento(
    evento(),
    { status: "sem_pesquisa" },
    repo,
  );
  assertEquals(triagem.status, "triagem");
  assertEquals(repo.mensagens[0].resolutionStatus, "sem_pesquisa");
  assertEquals(repo.mensagens[0].pesquisaId, null);
});

Deno.test("adiamento e abertura não atualizam última interação substantiva", async () => {
  assertEquals(classificarSubstantividade("vou responder amanhã"), "adiamento");
  // Formas que a versao anterior classificava como conteudo substantivo e
  // fechavam a pesquisa com a promessa no lugar da resposta.
  assertEquals(classificarSubstantividade("Mando mais tarde"), "adiamento");
  assertEquals(classificarSubstantividade("te mando amanhã"), "adiamento");
  assertEquals(classificarSubstantividade("envio mais tarde"), "adiamento");
  assertEquals(classificarSubstantividade("depois te retorno"), "adiamento");
  // Ordem invertida: o tempo vem antes do verbo (o verbo ja estava na lista).
  assertEquals(classificarSubstantividade("daqui a pouco eu respondo"), "adiamento");
  assertEquals(classificarSubstantividade("amanhã eu mando"), "adiamento");
  // Respostas REAIS ja registradas nao podem virar adiamento por engano.
  assertEquals(
    classificarSubstantividade(
      "Por isso ficou mais interessante para nós sair da escola, considerando que o valor pago não valia o que realmente era consumido por nós.",
    ),
    "conteudo_substantivo",
  );
  assertEquals(
    classificarSubstantividade(
      "Boa dia, Jéssica! Respondo o mesmo que anteriormente. Não mudaria nada. O professor Wil foi muito bom",
    ),
    "conteudo_substantivo",
  );
  assertEquals(classificarSubstantividade("Olá"), "abertura");
  assertEquals(
    classificarSubstantividade("Olha, deixa eu te falar uma coisa"),
    "abertura",
  );
  assertEquals(
    classificarSubstantividade("Oi, deixa eu te contar uma coisa"),
    "abertura",
  );
  assertEquals(
    classificarSubstantividade("Oi, deixa eu te falar uma coisinha"),
    "abertura",
  );
  assertEquals(
    classificarSubstantividade(
      "O professor sempre começava vinte minutos atrasado",
    ),
    "conteudo_substantivo",
  );

  const repo = new FakeRepository();
  const resolucao = {
    status: "resolvida" as const,
    criterio: "telefone_caixa" as const,
    pesquisa: pesquisa(),
  };
  await ingerirEvento(
    evento({ texto: "vou responder amanhã" }),
    resolucao,
    repo,
  );

  assertEquals(repo.cabecalhos[0].ultimaInteracaoEm, null);
  // Adiamento NAO tira a pesquisa de `sem_resposta`. Esse status e o filtro da
  // repescagem: com "coletando" aqui, quem prometia responder saia da fila de
  // reenvio na hora e nunca mais era cobrado -- justamente quem demonstrou
  // interesse. Caso real: Joachim prometeu em 05/08 e cumpriu 21 dias depois.
  assertEquals(repo.cabecalhos[0].respostaStatus, "sem_resposta");

  await ingerirEvento(
    evento({
      providerMessageId: "conteudo-1",
      texto: "O professor sempre começava vinte minutos atrasado",
      recebidoEm: "2026-08-02T15:10:00.000Z",
    }),
    resolucao,
    repo,
  );
  assertEquals(
    repo.cabecalhos[1].ultimaInteracaoEm,
    "2026-08-02T15:10:00.000Z",
  );
});

Deno.test("continuação após revisão abre nova versão de análise", async () => {
  const repo = new FakeRepository();
  const alvo = pesquisa({ respostaStatus: "revisada" });
  const resolucao = {
    status: "resolvida" as const,
    criterio: "telefone_caixa" as const,
    pesquisa: alvo,
  };

  await ingerirEvento(evento(), resolucao, repo);

  assertEquals(repo.novasAnalises, [alvo.id]);
  assertEquals(repo.cabecalhos[0].respostaStatus, "coletando");
});

Deno.test("opt-out explícito é conservador e adiamento tem precedência", async () => {
  for (
    const frase of [
      "não quero responder",
      "Nao quero responder",
      "não me mande mais mensagens",
      "pare de mandar mensagens",
      "remova o meu número",
    ]
  ) {
    assertEquals(classificarSubstantividade(frase), "opt_out");
  }
  assertEquals(
    classificarSubstantividade("não quero responder agora, amanhã falo"),
    "adiamento",
  );
  assertEquals(classificarSubstantividade(null), "indeterminado");

  const repo = new FakeRepository();
  const alvo = pesquisa();
  const resultado = await ingerirEvento(
    evento({ texto: "não me mande mais mensagens" }),
    {
      status: "resolvida",
      criterio: "telefone_caixa",
      pesquisa: alvo,
    },
    repo,
  );

  assertEquals(repo.mensagens[0].substantividade, "opt_out");
  assertEquals(repo.cabecalhos.length, 0);
  assertEquals(repo.novasAnalises.length, 0);
  assertEquals(resultado, {
    status: "opt_out",
    handled: true,
    pesquisaId: alvo.id,
    mensagemId: "30000000-0000-4000-8000-000000000001",
  });
});
