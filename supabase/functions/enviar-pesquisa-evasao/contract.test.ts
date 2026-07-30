// deno-lint-ignore-file no-import-prefix
/// <reference lib="deno.ns" />

import {
  assertEquals,
  assertNotEquals,
  assertRejects,
  assertThrows,
} from "jsr:@std/assert@1";
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

const previewIdCanonico = "6a77c6d4-6090-43ad-bfe9-da4bf5f468a8";

const snapshotValido: PreviewSnapshot = {
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

Deno.test("validarRequest normaliza celular e fixo locais com DDD 55", () => {
  for (
    const [informado, esperado] of [
      ["(55) 99999-0000", "5555999990000"],
      ["(55) 3333-4444", "555533334444"],
      ["+55 (55) 99999-0000", "5555999990000"],
      ["+55 (55) 3333-4444", "555533334444"],
    ]
  ) {
    assertEquals(
      validarRequest({
        acao: "previsualizar",
        evasao_id: 123,
        modo_teste: true,
        telefone_teste: informado,
      }),
      {
        acao: "previsualizar",
        evasao_id: 123,
        modo_teste: true,
        telefone_teste: esperado,
      },
    );
  }
});

Deno.test("confirmacao aceita somente preview_id", () => {
  assertEquals(
    validarRequest({
      acao: "confirmar",
      preview_id: previewIdCanonico,
    }),
    {
      acao: "confirmar",
      preview_id: previewIdCanonico,
    },
  );

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
          preview_id: previewIdCanonico,
          [campo]: "forjado",
        }),
      Error,
      `Campo nao permitido: ${campo}`,
    );
  }
});

Deno.test("validarRequest aceita somente objeto JSON simples com campos proprios", () => {
  const requestSemPrototipo = Object.assign(Object.create(null), {
    acao: "confirmar",
    preview_id: previewIdCanonico,
  });
  assertEquals(validarRequest(requestSemPrototipo), {
    acao: "confirmar",
    preview_id: previewIdCanonico,
  });

  class RequestForjado {
    acao = "confirmar";
    preview_id = previewIdCanonico;
  }
  for (
    const input of [
      new RequestForjado(),
      new Date(),
      Object.create({
        acao: "confirmar",
        preview_id: previewIdCanonico,
      }),
    ]
  ) {
    assertThrows(
      () => validarRequest(input),
      Error,
      "Request deve ser objeto JSON simples",
    );
  }

  assertThrows(
    () =>
      validarRequest(Object.assign(Object.create(null), {
        acao: "confirmar",
      })),
    Error,
    "Campo obrigatorio ausente: preview_id",
  );
});

Deno.test("validarRequest rejeita chaves perigosas proprias", () => {
  const comProtoProprio = JSON.parse(
    `{"acao":"confirmar","preview_id":"${previewIdCanonico}","__proto__":{"operador":"forjado"}}`,
  );

  assertThrows(
    () => validarRequest(comProtoProprio),
    Error,
    "Campo nao permitido: __proto__",
  );
  assertThrows(
    () =>
      validarRequest({
        acao: "confirmar",
        preview_id: previewIdCanonico,
        constructor: "forjado",
      }),
    Error,
    "Campo nao permitido: constructor",
  );
});

Deno.test("validarRequest exige evasao_id inteiro seguro", () => {
  for (
    const evasaoId of [
      Number.MAX_SAFE_INTEGER + 1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]
  ) {
    assertThrows(
      () =>
        validarRequest({
          acao: "previsualizar",
          evasao_id: evasaoId,
          modo_teste: false,
        }),
      Error,
      "evasao_id invalido",
    );
  }
});

Deno.test("validarRequest valida e canoniza preview_id UUID", () => {
  assertEquals(
    validarRequest({
      acao: "confirmar",
      preview_id: " 6A77C6D4-6090-43AD-BFE9-DA4BF5F468A8 ",
    }),
    {
      acao: "confirmar",
      preview_id: previewIdCanonico,
    },
  );

  for (const previewId of ["nao-e-uuid", "", "00000000-0000-0000-0000"]) {
    assertThrows(
      () =>
        validarRequest({
          acao: "confirmar",
          preview_id: previewId,
        }),
      Error,
      "preview_id invalido",
    );
  }
});

Deno.test("producao usa apenas o snapshot canonico e ignora telefone de teste", () => {
  assertEquals(
    resolverDestinoPesquisa({
      modoTeste: false,
      telefoneTeste: "5521999990000",
      telefoneSnapshot: "(21) 98888-7777",
    }),
    {
      telefone: "5521988887777",
      origem: "telefone_snapshot",
      modoTeste: false,
    },
  );
});

Deno.test("producao falha sem snapshot valido mesmo com telefones atuais validos", () => {
  const telefonesAtuaisNaoCanonicos = {
    modoTeste: false,
    telefoneSnapshot: null,
    whatsappAluno: "(21) 97777-6666",
    telefoneAluno: "(21) 96666-5555",
  };

  assertThrows(
    () => resolverDestinoPesquisa(telefonesAtuaisNaoCanonicos),
    Error,
    "Telefone snapshot invalido ou ausente",
  );
  assertThrows(
    () =>
      resolverDestinoPesquisa({
        ...telefonesAtuaisNaoCanonicos,
        telefoneSnapshot: "123",
      }),
    Error,
    "Telefone snapshot invalido ou ausente",
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

Deno.test("resolverDestinoPesquisa normaliza celular e fixo locais com DDD 55", () => {
  assertEquals(
    resolverDestinoPesquisa({
      modoTeste: true,
      telefoneTeste: "(55) 99999-0000",
    }),
    {
      telefone: "5555999990000",
      origem: "telefone_teste",
      modoTeste: true,
    },
  );
  assertEquals(
    resolverDestinoPesquisa({
      modoTeste: false,
      telefoneSnapshot: "(55) 3333-4444",
    }),
    {
      telefone: "555533334444",
      origem: "telefone_snapshot",
      modoTeste: false,
    },
  );
  assertEquals(
    resolverDestinoPesquisa({
      modoTeste: false,
      telefoneSnapshot: "+55 (55) 99999-0000",
    }).telefone,
    "5555999990000",
  );
  assertEquals(
    resolverDestinoPesquisa({
      modoTeste: false,
      telefoneSnapshot: "+55 (55) 3333-4444",
    }).telefone,
    "555533334444",
  );
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
  const primeiro = await hashPreview(snapshotValido);
  const segundo = await hashPreview(structuredClone(snapshotValido));
  const alterado = await hashPreview({
    ...snapshotValido,
    mensagemRenderizada: "Mensagem aprovada!",
  });

  assertEquals(primeiro, segundo);
  assertEquals(primeiro.length, 64);
  assertNotEquals(primeiro, alterado);
});

Deno.test("cada campo relevante participa do hash do preview", async () => {
  const hashBase = await hashPreview(snapshotValido);
  const alteracoes: Array<
    [keyof PreviewSnapshot, PreviewSnapshot[keyof PreviewSnapshot]]
  > = [
    ["evasaoId", 124],
    ["unidadeId", "95553e96-971b-4590-a6eb-0201d013c14d"],
    ["usuarioId", 29],
    ["authUserId", "88db996f-5b83-4fe6-8ca1-d120bb2c62a6"],
    ["assinaturaId", "12ef9461-c8a3-42a1-8303-2755021400d2"],
    ["templateId", "d2f6b33c-da27-4900-b566-f16deebcaeef"],
    ["templateVersao", 2],
    ["caixaId", 4],
    ["modoTeste", true],
    ["destinatarioTipo", "responsavel"],
    ["telefoneDestino", "5521988887777"],
    ["mensagemRenderizada", "Mensagem aprovada!"],
  ];

  for (const [campo, valor] of alteracoes) {
    const alterado = { ...snapshotValido, [campo]: valor } as PreviewSnapshot;
    assertNotEquals(
      await hashPreview(alterado),
      hashBase,
      `O campo ${campo} deve participar do hash`,
    );
  }
});

Deno.test("hashPreview rejeita snapshot invalido antes de serializar", async () => {
  const invalidos: Array<[keyof PreviewSnapshot, unknown]> = [
    ["evasaoId", Number.NaN],
    ["unidadeId", "unidade-invalida"],
    ["usuarioId", Number.POSITIVE_INFINITY],
    ["authUserId", "auth-invalido"],
    ["assinaturaId", "assinatura-invalida"],
    ["templateId", "template-invalido"],
    ["templateVersao", 0],
    ["caixaId", 1.5],
    ["modoTeste", "false"],
    ["destinatarioTipo", "desconhecido"],
    ["telefoneDestino", "559999"],
    ["mensagemRenderizada", "   "],
  ];

  for (const [campo, valor] of invalidos) {
    await assertRejects(
      () =>
        hashPreview({
          ...snapshotValido,
          [campo]: valor,
        } as PreviewSnapshot),
      Error,
      `Snapshot invalido: ${campo}`,
    );
  }
});

Deno.test("mascara telefone sem expor o numero completo", () => {
  assertEquals(mascararTelefone("5521999292881"), "+55 (21) *****-2881");
  assertEquals(mascararTelefone("552199292881"), "+55 (21) ****-2881");
});

Deno.test("mascara celular e fixo locais com DDD 55 sem quebrar numero completo", () => {
  for (
    const [informado, esperado] of [
      ["(55) 99999-0000", "+55 (55) *****-0000"],
      ["(55) 3333-4444", "+55 (55) ****-4444"],
      ["+55 (55) 99999-0000", "+55 (55) *****-0000"],
      ["+55 (55) 3333-4444", "+55 (55) ****-4444"],
    ]
  ) {
    assertEquals(mascararTelefone(informado), esperado);
  }
});
