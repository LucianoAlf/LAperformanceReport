import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "jsr:@std/assert@1";

import {
  autorizarServiceRole,
  CAIXA_LIA_ID,
  processarUmAlerta,
  validarPedidoDispatcher,
  type CaixaLia,
  type ClaimAlerta,
  type DispatcherAdapters,
} from "./dispatcher.ts";

Deno.test("autoriza somente o bearer service role exato", () => {
  assertEquals(autorizarServiceRole("Bearer CHAVE-INTERNA", "CHAVE-INTERNA"), true);
  assertEquals(autorizarServiceRole("Bearer outra", "CHAVE-INTERNA"), false);
  assertEquals(autorizarServiceRole(null, "CHAVE-INTERNA"), false);
  assertEquals(autorizarServiceRole("Bearer CHAVE-INTERNA", ""), false);
});

Deno.test("pedido aceita somente alerta_id UUID opcional", () => {
  assertEquals(validarPedidoDispatcher({}), { alertaId: null });
  assertEquals(
    validarPedidoDispatcher({
      alerta_id: "10000000-0000-4000-8000-000000000001",
    }),
    { alertaId: "10000000-0000-4000-8000-000000000001" },
  );
  for (const invalido of [
    null,
    [],
    { alerta_id: "nao-uuid" },
    { destino: "5521981278047" },
    { alerta_id: null },
  ]) {
    assertThrows(() => validarPedidoDispatcher(invalido));
  }
});

const CLAIM: ClaimAlerta = {
  alerta_id: "10000000-0000-4000-8000-000000000001",
  claim_token: "20000000-0000-4000-8000-000000000001",
  destino: "5521981278047",
  mensagem: "Alerta interno sem conteúdo privado",
  evento_tipo: "resposta_nova",
  ambiente: "teste",
  caixa_id: CAIXA_LIA_ID,
};

const CAIXA: CaixaLia = {
  id: CAIXA_LIA_ID,
  nome: "Lia - Sucesso do Aluno",
  ativo: true,
  provedor: "uazapi",
  uazapi_url: "https://fixture.invalid/",
  uazapi_token: "TOKEN-FIXTURE-NAO-REAL",
};

function criarCenario(overrides: Partial<DispatcherAdapters> = {}) {
  const chamadas = {
    claim: [] as Array<[string, string | null]>,
    caixa: [] as number[],
    provider: [] as Array<[string, RequestInit]>,
    concluir: [] as Array<[string, string, string]>,
    falhar: [] as Array<[string, string, string, boolean]>,
    logs: [] as Array<Record<string, unknown>>,
  };

  const adapters: DispatcherAdapters = {
    claim: (workerId, alertaId) => {
      chamadas.claim.push([workerId, alertaId]);
      return Promise.resolve(CLAIM);
    },
    buscarCaixaExata: (caixaId) => {
      chamadas.caixa.push(caixaId);
      return Promise.resolve(CAIXA);
    },
    fetchProvider: (url, init) => {
      chamadas.provider.push([url, init]);
      return Promise.resolve(new Response(
        JSON.stringify({ messageid: "MSG-CONFIRMADA-1" }),
        { status: 200 },
      ));
    },
    concluir: (alertaId, claimToken, messageId) => {
      chamadas.concluir.push([alertaId, claimToken, messageId]);
      return Promise.resolve(true);
    },
    falhar: (alertaId, claimToken, codigo, ambiguo) => {
      chamadas.falhar.push([alertaId, claimToken, codigo, ambiguo]);
      return Promise.resolve(true);
    },
    log: (evento) => chamadas.logs.push(evento),
    agora: () => 1_000,
    ...overrides,
  };

  return { adapters, chamadas };
}

Deno.test("sem pendência não chama caixa nem provedor", async () => {
  const { adapters, chamadas } = criarCenario({
    claim: () => Promise.resolve(null),
  });

  const resultado = await processarUmAlerta(adapters, null);

  assertEquals(resultado, { status: "sem_pendencia" });
  assertEquals(chamadas.caixa.length, 0);
  assertEquals(chamadas.provider.length, 0);
});

Deno.test("envia uma única mensagem pela caixa 3 e exige message_id", async () => {
  const { adapters, chamadas } = criarCenario();

  const resultado = await processarUmAlerta(adapters, CLAIM.alerta_id);

  assertEquals(resultado, {
    status: "enviado",
    alerta_id: CLAIM.alerta_id,
    provider_message_id: "MSG-CONFIRMADA-1",
  });
  assertEquals(chamadas.claim.length, 1);
  assertEquals(chamadas.claim[0][1], CLAIM.alerta_id);
  assertEquals(chamadas.caixa, [CAIXA_LIA_ID]);
  assertEquals(chamadas.provider.length, 1);
  assertEquals(chamadas.provider[0][0], "https://fixture.invalid/send/text");
  assertEquals(
    JSON.parse(String(chamadas.provider[0][1].body)),
    {
      number: CLAIM.destino,
      text: CLAIM.mensagem,
      delay: 500,
      readchat: true,
    },
  );
  assertEquals(
    new Headers(chamadas.provider[0][1].headers).get("token"),
    CAIXA.uazapi_token,
  );
  assertEquals(chamadas.concluir, [[
    CLAIM.alerta_id,
    CLAIM.claim_token,
    "MSG-CONFIRMADA-1",
  ]]);
  assertEquals(chamadas.falhar.length, 0);

  const logs = JSON.stringify(chamadas.logs);
  for (const proibido of [CLAIM.destino, CLAIM.mensagem, CAIXA.uazapi_token]) {
    assertEquals(logs.includes(proibido), false);
  }
});

Deno.test("caixa divergente falha fechado antes do provedor", async () => {
  const { adapters, chamadas } = criarCenario({
    claim: () => Promise.resolve({ ...CLAIM, caixa_id: 2 }),
  });

  const resultado = await processarUmAlerta(adapters, CLAIM.alerta_id);

  assertEquals(resultado.status, "falha");
  assertEquals(chamadas.caixa.length, 0);
  assertEquals(chamadas.provider.length, 0);
  assertEquals(chamadas.falhar, [[
    CLAIM.alerta_id,
    CLAIM.claim_token,
    "provider_configuracao",
    false,
  ]]);
});

Deno.test("HTTP rejeitado termina em falha sem retry", async () => {
  const { adapters, chamadas } = criarCenario();
  adapters.fetchProvider = (url, init) => {
    chamadas.provider.push([url, init]);
    return Promise.resolve(new Response("rejeitada", { status: 503 }));
  };

  const resultado = await processarUmAlerta(adapters, CLAIM.alerta_id);

  assertEquals(resultado.status, "falha");
  assertEquals(chamadas.provider.length, 1);
  assertEquals(chamadas.falhar, [[
    CLAIM.alerta_id,
    CLAIM.claim_token,
    "provider_http",
    false,
  ]]);
});

for (const cenario of [
  {
    nome: "timeout",
    erro: new DOMException("timeout", "AbortError"),
    codigo: "provider_timeout",
  },
  {
    nome: "conexão encerrada",
    erro: new TypeError("connection closed"),
    codigo: "provider_conexao_encerrada",
  },
]) {
  Deno.test(`${cenario.nome} vira resultado ambíguo sem retry`, async () => {
    const { adapters, chamadas } = criarCenario();
    adapters.fetchProvider = (url, init) => {
      chamadas.provider.push([url, init]);
      return Promise.reject(cenario.erro);
    };

    const resultado = await processarUmAlerta(adapters, CLAIM.alerta_id);

    assertEquals(resultado.status, "resultado_ambiguo");
    assertEquals(chamadas.provider.length, 1);
    assertEquals(chamadas.falhar, [[
      CLAIM.alerta_id,
      CLAIM.claim_token,
      cenario.codigo,
      true,
    ]]);
  });
}

Deno.test("JSON inválido após HTTP aceito é resultado ambíguo", async () => {
  const { adapters, chamadas } = criarCenario({
    fetchProvider: () => Promise.resolve(
      new Response("não-json", { status: 200 }),
    ),
  });

  const resultado = await processarUmAlerta(adapters, CLAIM.alerta_id);

  assertEquals(resultado.status, "resultado_ambiguo");
  assertEquals(chamadas.falhar[0][2], "provider_json_invalido");
  assertEquals(chamadas.falhar[0][3], true);
});

Deno.test("HTTP aceito sem ID é resultado ambíguo", async () => {
  const { adapters, chamadas } = criarCenario({
    fetchProvider: () => Promise.resolve(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    ),
  });

  const resultado = await processarUmAlerta(adapters, CLAIM.alerta_id);

  assertEquals(resultado.status, "resultado_ambiguo");
  assertEquals(chamadas.falhar[0][2], "provider_confirmacao_ambigua");
  assertEquals(chamadas.falhar[0][3], true);
});

Deno.test("não aceita caixa inativa ou de outro provedor", async () => {
  for (const caixa of [
    { ...CAIXA, ativo: false },
    { ...CAIXA, provedor: "waha" },
    { ...CAIXA, nome: "Sol" },
  ]) {
    const { adapters } = criarCenario({
      buscarCaixaExata: () => Promise.resolve(caixa),
    });
    const resultado = await processarUmAlerta(adapters, CLAIM.alerta_id);
    assertEquals(resultado.status, "falha");
  }
});

Deno.test("propaga erro se o desfecho não reconhecer o claim", async () => {
  const { adapters } = criarCenario({
    concluir: () => Promise.resolve(false),
  });

  await assertRejects(
    () => processarUmAlerta(adapters, CLAIM.alerta_id),
    Error,
    "claim_desfecho_nao_reconhecido",
  );
});
