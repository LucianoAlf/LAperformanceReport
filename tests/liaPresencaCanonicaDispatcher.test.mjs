import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import * as dispatcherModule from "../supabase/functions/processar-alertas-lia/dispatcher.ts";
import {
  CAIXA_LIA_ID,
  processarUmAlerta,
} from "../supabase/functions/processar-alertas-lia/dispatcher.ts";

const ALERTA_ID = "10000000-0000-4000-8000-000000000071";
const CLAIM_TOKEN = "20000000-0000-4000-8000-000000000071";
const UNIDADE_ID = "30000000-0000-4000-8000-000000000071";

function criarCenario(
  contextoPresenca,
  requisitoPresenca = {
    dependeFrequencia: true,
    unidadeId: UNIDADE_ID,
    data: "2026-08-26",
  },
) {
  const chamadas = {
    contexto: [],
    adiamentos: [],
    provider: 0,
    conclusoes: 0,
    falhas: 0,
  };

  const adapters = {
    claim: async () => ({
      alerta_id: ALERTA_ID,
      claim_token: CLAIM_TOKEN,
      destino: "5521999999999",
      mensagem: "Alerta de frequencia",
      evento_tipo: "resposta_nova",
      ambiente: "teste",
      caixa_id: CAIXA_LIA_ID,
    }),
    buscarRequisitoPresenca: async () => requisitoPresenca,
    buscarContextoPresenca: async (unidadeId, data) => {
      chamadas.contexto.push([unidadeId, data]);
      return contextoPresenca;
    },
    adiar: async (alertaId, claimToken, motivo) => {
      chamadas.adiamentos.push([alertaId, claimToken, motivo]);
      return true;
    },
    buscarCaixaExata: async () => ({
      id: CAIXA_LIA_ID,
      nome: "Lia - Sucesso do Aluno",
      ativo: true,
      provedor: "uazapi",
      uazapi_url: "https://fixture.invalid",
      uazapi_token: "TOKEN-FIXTURE",
    }),
    fetchProvider: async () => {
      chamadas.provider += 1;
      return new Response(JSON.stringify({ messageid: "MSG-1" }));
    },
    concluir: async () => {
      chamadas.conclusoes += 1;
      return true;
    },
    falhar: async () => {
      chamadas.falhas += 1;
      return true;
    },
    log: () => {},
    agora: () => 1_000,
  };

  return { adapters, chamadas };
}

test("adia alerta dependente de frequencia quando o contexto canonico esta desatualizado", async () => {
  const { adapters, chamadas } = criarCenario({
    dados_status: "desatualizados",
    estado_publicacao: "em_auditoria",
    universo_eventos: 12,
  });

  const resultado = await processarUmAlerta(adapters, ALERTA_ID);

  assert.deepEqual(resultado, {
    status: "adiado",
    alerta_id: ALERTA_ID,
    motivo: "presenca_desatualizada",
  });
  assert.deepEqual(chamadas.contexto, [[UNIDADE_ID, "2026-08-26"]]);
  assert.deepEqual(chamadas.adiamentos, [[
    ALERTA_ID,
    CLAIM_TOKEN,
    "presenca_desatualizada",
  ]]);
  assert.equal(chamadas.provider, 0);
  assert.equal(chamadas.conclusoes, 0);
  assert.equal(chamadas.falhas, 0);
});

for (
  const cenario of [
    {
      nome: "publicacao esta em auditoria",
      contexto: {
        dados_status: "atualizados",
        estado_publicacao: "em_auditoria",
        universo_eventos: 12,
      },
    },
    {
      nome: "universo publicavel nao tem eventos",
      contexto: {
        dados_status: "atualizados",
        estado_publicacao: "publicavel",
        universo_eventos: 0,
      },
    },
    {
      nome: "denominador explicito esta ausente",
      contexto: {
        dados_status: "atualizados",
        estado_publicacao: "publicavel",
        universo_eventos: 12,
        denominador: null,
      },
    },
  ]
) {
  test(`adia alerta de frequencia quando ${cenario.nome}`, async () => {
    const { adapters, chamadas } = criarCenario(cenario.contexto);

    const resultado = await processarUmAlerta(adapters, ALERTA_ID);

    assert.equal(resultado.status, "adiado");
    assert.equal(resultado.motivo, "presenca_desatualizada");
    assert.equal(chamadas.provider, 0);
    assert.equal(chamadas.conclusoes, 0);
    assert.equal(chamadas.adiamentos.length, 1);
  });
}

test("envia alerta de frequencia somente com contexto atualizado e universo publicavel", async () => {
  const { adapters, chamadas } = criarCenario({
    dados_status: "atualizados",
    estado_publicacao: "publicavel",
    universo_eventos: 12,
  });

  const resultado = await processarUmAlerta(adapters, ALERTA_ID);

  assert.equal(resultado.status, "enviado");
  assert.equal(chamadas.contexto.length, 1);
  assert.equal(chamadas.adiamentos.length, 0);
  assert.equal(chamadas.provider, 1);
  assert.equal(chamadas.conclusoes, 1);
});

test("preserva alertas que nao dependem de frequencia sem consultar o contexto", async () => {
  const { adapters, chamadas } = criarCenario(
    null,
    { dependeFrequencia: false },
  );

  const resultado = await processarUmAlerta(adapters, ALERTA_ID);

  assert.equal(resultado.status, "enviado");
  assert.equal(chamadas.contexto.length, 0);
  assert.equal(chamadas.adiamentos.length, 0);
  assert.equal(chamadas.provider, 1);
});

test("classifica apenas templates explicitamente dependentes de presenca ou frequencia", () => {
  assert.equal(
    typeof dispatcherModule.templateDependeFrequencia,
    "function",
  );
  assert.equal(
    dispatcherModule.templateDependeFrequencia("lia_frequencia_baixa"),
    true,
  );
  assert.equal(
    dispatcherModule.templateDependeFrequencia("lia_presenca_consecutiva"),
    true,
  );
  for (
    const template of [
      "lia_evasao_resposta_nova",
      "lia_evasao_rodada_nova_pos_revisao",
      "lia_evasao_opt_out",
      "lia_evasao_followup_3d_resumo",
    ]
  ) {
    assert.equal(dispatcherModule.templateDependeFrequencia(template), false);
  }
});

test("Edge consulta o contexto Lia por unidade e data e adia o claim de forma atomica", () => {
  const source = readFileSync(
    new URL(
      "../supabase/functions/processar-alertas-lia/index.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(source, /get_presenca_contexto_agente_v1/);
  assert.match(source, /p_unidade_id\s*:\s*unidadeId/);
  assert.match(source, /p_data\s*:\s*data/);
  assert.match(source, /p_escopo\s*:\s*["']lia["']/);
  assert.match(source, /motivo_pendencia\s*:\s*motivo/);
  assert.match(source, /status\s*:\s*["']fila_administrativa["']/);
  assert.match(source, /claim_token["']?\s*,\s*claimToken/);
});
