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
  assertEquals(classificarSubstantividade("Olá"), "abertura");
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
  assertEquals(repo.cabecalhos[0].respostaStatus, "coletando");

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
