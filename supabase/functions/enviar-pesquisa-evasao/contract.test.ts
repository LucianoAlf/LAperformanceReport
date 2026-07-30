// deno-lint-ignore-file no-import-prefix
/// <reference lib="deno.ns" />

import { assertEquals, assertNotEquals, assertThrows } from "jsr:@std/assert@1";
import {
  hashPreview,
  mascararTelefone,
  type PreviewSnapshot,
  renderizarMensagem,
  resolverDestinoPesquisa,
  resolverTelefonePesquisa,
  telefonePesquisaValido,
  validarRequest,
} from "./contract.ts";

Deno.test("telefone de teste tem prioridade sobre os dados do aluno", () => {
  assertEquals(
    resolverTelefonePesquisa({
      telefoneOverride: "(21) 99999-0000",
      telefoneSnapshot: "21988887777",
      whatsappAluno: "21977776666",
      telefoneAluno: "21966665555",
    }),
    "5521999990000",
  );
});

Deno.test("usa whatsapp do aluno quando o snapshot da movimentacao esta vazio", () => {
  assertEquals(
    resolverTelefonePesquisa({
      telefoneOverride: "",
      telefoneSnapshot: null,
      whatsappAluno: "(21) 98888-7777",
      telefoneAluno: null,
    }),
    "5521988887777",
  );
});

Deno.test("normaliza numero brasileiro local com DDD", () => {
  assertEquals(
    resolverTelefonePesquisa({
      telefoneSnapshot: "21 99929-2881",
    }),
    "5521999292881",
  );
});

Deno.test("rejeita telefone curto", () => {
  assertEquals(telefonePesquisaValido("5521999292881"), true);
  assertEquals(telefonePesquisaValido("999292881"), false);
});

Deno.test("request de preview rejeita campos controlaveis pelo cliente", () => {
  for (
    const campo of [
      "operador",
      "mensagem",
      "assinatura_nome",
      "telefone_override",
    ]
  ) {
    assertThrows(
      () =>
        validarRequest({
          acao: "previsualizar",
          evasao_id: 123,
          modo_teste: false,
          [campo]: "forjado",
        }),
      Error,
      `Campo nao permitido: ${campo}`,
    );
  }
});

Deno.test("telefone_teste so e aceito em preview de modo teste", () => {
  assertThrows(
    () =>
      validarRequest({
        acao: "previsualizar",
        evasao_id: 123,
        modo_teste: false,
        telefone_teste: "5521999990000",
      }),
    Error,
    "telefone_teste exige modo_teste=true",
  );

  assertEquals(
    validarRequest({
      acao: "previsualizar",
      evasao_id: 123,
      modo_teste: true,
      telefone_teste: "(21) 99999-0000",
    }),
    {
      acao: "previsualizar",
      evasao_id: 123,
      modo_teste: true,
      telefone_teste: "5521999990000",
    },
  );
});

Deno.test("confirmacao aceita somente preview_id", () => {
  const previewId = "6a77c6d4-6090-43ad-bfe9-da4bf5f468a8";

  assertEquals(validarRequest({ acao: "confirmar", preview_id: previewId }), {
    acao: "confirmar",
    preview_id: previewId,
  });

  for (
    const campo of [
      "evasao_id",
      "modo_teste",
      "telefone_teste",
      "operador",
      "mensagem",
      "telefone_override",
    ]
  ) {
    assertThrows(
      () =>
        validarRequest({
          acao: "confirmar",
          preview_id: previewId,
          [campo]: "forjado",
        }),
      Error,
      `Campo nao permitido: ${campo}`,
    );
  }
});

Deno.test("producao usa apenas o snapshot canonico e ignora telefone de teste", () => {
  assertEquals(
    resolverDestinoPesquisa({
      modoTeste: false,
      telefoneTeste: "5521999990000",
      telefoneSnapshot: "(21) 98888-7777",
      whatsappAluno: "(21) 97777-6666",
      telefoneAluno: "(21) 96666-5555",
    }),
    {
      telefone: "5521988887777",
      origem: "telefone_snapshot",
      modoTeste: false,
    },
  );
});

Deno.test("modo teste fica separado e nao altera fontes canonicas", () => {
  const input = {
    modoTeste: true,
    telefoneTeste: "(21) 99999-0000",
    telefoneSnapshot: "(21) 98888-7777",
    whatsappAluno: "(21) 97777-6666",
    telefoneAluno: "(21) 96666-5555",
  };
  const fontesAntes = structuredClone(input);

  assertEquals(resolverDestinoPesquisa(input), {
    telefone: "5521999990000",
    origem: "telefone_teste",
    modoTeste: true,
  });
  assertEquals(input, fontesAntes);
});

Deno.test("renderiza mensagem para aluno adulto com a assinatura autenticada", () => {
  assertEquals(
    renderizarMensagem({
      template:
        "Oi, *{{aluno_primeiro_nome}}*! Aqui e a *{{assinatura_nome}}*, do Sucesso do Aluno.",
      valores: {
        aluno_primeiro_nome: "Marina",
        assinatura_nome: "Fabi",
      },
    }),
    "Oi, *Marina*! Aqui e a *Fabi*, do Sucesso do Aluno.",
  );
});

Deno.test("renderiza mensagem para responsavel de menor", () => {
  assertEquals(
    renderizarMensagem({
      template:
        "Oi, *{{responsavel_primeiro_nome}}*! Como foi a experiencia de {{aluno_primeiro_nome}}? Assinado: {{assinatura_nome}}.",
      valores: {
        responsavel_primeiro_nome: "Carlos",
        aluno_primeiro_nome: "Bia",
        assinatura_nome: "Jessica",
      },
    }),
    "Oi, *Carlos*! Como foi a experiencia de Bia? Assinado: Jessica.",
  );
});

Deno.test("Fabi e Jessica produzem suas proprias assinaturas", () => {
  const template = "Aqui e a {{assinatura_nome}}.";

  assertEquals(
    renderizarMensagem({
      template,
      valores: { assinatura_nome: "Fabi" },
    }),
    "Aqui e a Fabi.",
  );
  assertEquals(
    renderizarMensagem({
      template,
      valores: { assinatura_nome: "Jessica" },
    }),
    "Aqui e a Jessica.",
  );
});

Deno.test("rejeita placeholder desconhecido ou sintaxe quebrada", () => {
  assertThrows(
    () =>
      renderizarMensagem({
        template: "Aqui e {{operador}}.",
        valores: { operador: "sistema" },
      }),
    Error,
    "Placeholder invalido: operador",
  );

  assertThrows(
    () =>
      renderizarMensagem({
        template: "Oi, {{aluno_primeiro_nome.",
        valores: { aluno_primeiro_nome: "Ana" },
      }),
    Error,
    "Placeholder invalido no template",
  );
});

Deno.test("rejeita placeholder obrigatorio ausente ou vazio", () => {
  assertThrows(
    () =>
      renderizarMensagem({
        template: "Oi, {{aluno_primeiro_nome}}! Aqui e {{assinatura_nome}}.",
        valores: {
          aluno_primeiro_nome: "Ana",
          assinatura_nome: " ",
        },
      }),
    Error,
    "Placeholder ausente: assinatura_nome",
  );
});

Deno.test("hash do preview e deterministico e muda com o conteudo", async () => {
  const snapshot: PreviewSnapshot = {
    evasaoId: 123,
    unidadeId: "368d47f5-2d88-4475-bc14-ba084a9a348e",
    usuarioId: 30,
    authUserId: "b066e362-58a5-4f2c-af92-4c5180268e17",
    assinaturaId: "e770863c-8a71-46cb-99bd-aad349d9c34e",
    templateId: "fe5dc413-5cf8-4507-a4bc-87ec58a3ad04",
    templateVersao: 1,
    caixaId: 3,
    modoTeste: false,
    destinatarioTipo: "aluno",
    telefoneDestino: "5521999990000",
    mensagemRenderizada: "Mensagem aprovada.",
  };

  const primeiro = await hashPreview(snapshot);
  const segundo = await hashPreview(structuredClone(snapshot));
  const alterado = await hashPreview({
    ...snapshot,
    mensagemRenderizada: "Mensagem aprovada!",
  });

  assertEquals(primeiro, segundo);
  assertEquals(primeiro.length, 64);
  assertNotEquals(primeiro, alterado);
});

Deno.test("mascara telefone sem expor o numero completo", () => {
  assertEquals(mascararTelefone("5521999292881"), "+55 (21) *****-2881");
  assertEquals(mascararTelefone("552199292881"), "+55 (21) ****-2881");
});
