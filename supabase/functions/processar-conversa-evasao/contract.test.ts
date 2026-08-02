// deno-lint-ignore-file no-import-prefix
/// <reference lib="deno.ns" />

import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  autenticarWorkerInterno,
  type ConversaParaConsolidar,
  decidirConsolidacao,
  listarMensagensComTranscricaoPendente,
} from "./contract.ts";

const MINUTO = 60_000;
const DIA = 24 * 60 * MINUTO;
const agora = new Date("2026-08-02T18:00:00.000Z");

function conversa(
  overrides: Partial<ConversaParaConsolidar> = {},
): ConversaParaConsolidar {
  return {
    pesquisaId: "10000000-0000-4000-8000-000000000001",
    enviadoEm: new Date(agora.getTime() - DIA).toISOString(),
    respostaStatus: "coletando",
    ultimaAnalise: null,
    mensagens: [{
      id: "20000000-0000-4000-8000-000000000001",
      tipo: "texto",
      texto: "O horário ficou difícil para nossa família.",
      substantividade: "conteudo_substantivo",
      providerCreatedAt: new Date(agora.getTime() - MINUTO).toISOString(),
      recebidoEm: new Date(agora.getTime() - MINUTO).toISOString(),
      criadoEm: new Date(agora.getTime() - MINUTO).toISOString(),
      transcricoes: [],
    }],
    ...overrides,
  };
}

Deno.test("worker interno autentica por segredo antes de processar", () => {
  assertEquals(autenticarWorkerInterno("segredo", "segredo"), true);
  assertEquals(autenticarWorkerInterno("errado", "segredo"), false);
  assertEquals(autenticarWorkerInterno(null, "segredo"), false);
});

Deno.test("59s ainda aguarda e 60s cria consolidação provisória", () => {
  const base = conversa();
  const recente = {
    ...base,
    mensagens: base.mensagens.map((m) => ({
      ...m,
      providerCreatedAt: new Date(agora.getTime() - 59_000).toISOString(),
    })),
  };
  assertEquals(decidirConsolidacao(recente, agora).acao, "aguardar");

  const decisao = decidirConsolidacao(base, agora);
  assertEquals(decisao.acao, "salvar_rascunho");
  if (decisao.acao === "salvar_rascunho") {
    assertStringIncludes(decisao.textoConsolidado, "horário ficou difícil");
    assertEquals(decisao.respostaStatus, "coletando");
  }
});

Deno.test("14m59s coleta e 15m de silêncio deixa conteúdo pronto", () => {
  const base = conversa();
  const em = (idadeMs: number) =>
    conversa({
      mensagens: base.mensagens.map((m) => ({
        ...m,
        providerCreatedAt: new Date(agora.getTime() - idadeMs).toISOString(),
      })),
    });
  const quase = decidirConsolidacao(em(15 * MINUTO - 1_000), agora);
  assertEquals(quase.acao, "salvar_rascunho");
  if (quase.acao === "salvar_rascunho") {
    assertEquals(quase.respostaStatus, "coletando");
  }
  const pronta = decidirConsolidacao(em(15 * MINUTO), agora);
  assertEquals(pronta.acao, "salvar_rascunho");
  if (pronta.acao === "salvar_rascunho") {
    assertEquals(pronta.respostaStatus, "pronta_para_revisao");
  }
});

Deno.test("áudio usa última transcrição concluída e pendência impede prontidão", () => {
  const audio = conversa().mensagens[0];
  const comAudio = conversa({
    mensagens: [{
      ...audio,
      tipo: "audio",
      texto: null,
      substantividade: "indeterminado",
      providerCreatedAt: new Date(agora.getTime() - 20 * MINUTO).toISOString(),
      transcricoes: [{ versao: 1, status: "pendente", texto: null }],
    }],
  });
  const pendente = decidirConsolidacao(comAudio, agora);
  assertEquals(pendente.acao, "aguardar");

  comAudio.mensagens[0].transcricoes = [
    { versao: 1, status: "concluida", texto: "O valor pesou bastante" },
    { versao: 2, status: "concluida", texto: "O horário também ficou ruim" },
  ];
  const concluida = decidirConsolidacao(comAudio, agora);
  assertEquals(concluida.acao, "salvar_rascunho");
  if (concluida.acao === "salvar_rascunho") {
    assertStringIncludes(concluida.textoConsolidado, "horário também ficou ruim");
    assertEquals(concluida.textoConsolidado.includes("áudio pendente"), false);
    assertEquals(concluida.respostaTipo, "audio");
  }
});

Deno.test("worker identifica somente áudios pendentes para retentar", () => {
  const base = conversa().mensagens[0];
  assertEquals(
    listarMensagensComTranscricaoPendente([
      {
        ...base,
        id: "audio-pendente",
        tipo: "audio",
        transcricoes: [{ versao: 1, status: "pendente", texto: null }],
      },
      {
        ...base,
        id: "audio-processando",
        tipo: "audio",
        transcricoes: [{ versao: 1, status: "processando", texto: null }],
      },
      base,
    ]),
    ["audio-pendente"],
  );
});

Deno.test("ordem é determinística por horário, criação e id", () => {
  const original = conversa().mensagens[0];
  const decisao = decidirConsolidacao(
    conversa({
      mensagens: [
        {
          ...original,
          id: "b",
          texto: "segundo",
          criadoEm: "2026-08-02T17:01:01Z",
        },
        {
          ...original,
          id: "a",
          texto: "primeiro",
          criadoEm: "2026-08-02T17:01:00Z",
        },
      ],
    }),
    agora,
  );
  assertEquals(decisao.acao, "salvar_rascunho");
  if (decisao.acao === "salvar_rascunho") {
    assertEquals(
      decisao.textoConsolidado.indexOf("primeiro") <
        decisao.textoConsolidado.indexOf("segundo"),
      true,
    );
  }
});

Deno.test("abertura, adiamento e opt-out não viram análise de motivos", () => {
  const original = conversa().mensagens[0];
  for (const substantividade of ["abertura", "adiamento", "opt_out"]) {
    const decisao = decidirConsolidacao(
      conversa({
        mensagens: [{ ...original, substantividade }],
      }),
      agora,
    );
    assertEquals(
      decisao.acao,
      substantividade === "opt_out" ? "ignorar" : "aguardar",
    );
  }
});

Deno.test("sete dias sem conteúdo válido expira", () => {
  const original = conversa().mensagens[0];
  const decisao = decidirConsolidacao(
    conversa({
      enviadoEm: new Date(agora.getTime() - 7 * DIA).toISOString(),
      mensagens: [{ ...original, substantividade: "abertura" }],
    }),
    agora,
  );
  assertEquals(decisao.acao, "expirar");
});

Deno.test("worker reaproveita somente rascunho e nunca reabre versão revisada", () => {
  const rascunho = decidirConsolidacao(
    conversa({
      ultimaAnalise: { versao: 2, status: "rascunho" },
    }),
    agora,
  );
  const revisada = decidirConsolidacao(
    conversa({
      ultimaAnalise: { versao: 2, status: "revisada" },
    }),
    agora,
  );
  if (rascunho.acao === "salvar_rascunho") assertEquals(rascunho.versao, 2);
  assertEquals(revisada.acao, "ignorar");
});

Deno.test("rodada pronta para revisao e imutavel para o worker", () => {
  const pronta = decidirConsolidacao(
    conversa({
      ultimaAnalise: { versao: 4, status: "pronta_para_revisao" },
    }),
    agora,
  );

  assertEquals(pronta.acao, "ignorar");
});
