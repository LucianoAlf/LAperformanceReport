#!/usr/bin/env node
'use strict';

// Regressao Recreio 22/09/2026: o preview reconheceu passaporte puro, mas a
// primeira consulta canonica falhou somente na janela futura. O retry respondeu
// aluno_nao_encontrado, o card pediu "pode" e a confirmacao foi recusada pelo
// flag residual da primeira tentativa. Passaporte declarado nao exige fatura;
// parcela continua fail-closed sob a mesma falha.
process.env.SOL_CAIXA_LOTE_MS = '0';
process.env.SOL_CAIXA_V3_LEDGER_MODE = 'production';
process.env.SOL_CAIXA_V3_LEDGER_STRICT = '1';
process.env.SOL_CAIXA_V3_LEDGER_FAKE = '1';
process.env.SOL_CAIXA_V4_SHADOW = '0';
process.env.SOL_CAIXA_V4_CANARIO = '';

const assert = require('node:assert/strict');
const mod = require('./_alvo.cjs');

const CHAT = '5521973870998-1583848991@g.us';
const UNIDADE = '95553e96-971b-4590-a6eb-0201d013c14d';

function fixture(categoria) {
  const envios = [];
  const logs = [];
  const lancamentos = [];
  let canonicaCalls = 0;
  let seq = 0;
  const h = mod.criarHandlerFinanceiro({
    grupos: { [CHAT]: { grupo_jid: CHAT, unidade_id: UNIDADE, nome: 'Recreio' } },
    sendFn: async (_chatId, texto) => { envios.push(String(texto)); return `msg-${++seq}`; },
    ocrFn: async () => ({ text: 'Comprovante Pix valor R$ 430,00', status: 'ok', file_bytes: 12345 }),
    visaoFn: async () => ({ valor: 430, forma: 'pix' }),
    interpretarFn: async () => ({ categoria, aluno: 'Aluno Teste', competencia: null, forma: 'pix' }),
    interpretarMultiFn: async () => null,
    canonicaFn: async () => {
      canonicaCalls += 1;
      return canonicaCalls === 1
        ? { ok: false, motivo: 'fonte_competencia_futura_indisponivel' }
        : { ok: false, motivo: 'aluno_nao_encontrado' };
    },
    casarFn: async () => null,
    pagadorFn: async () => ({ ok: false }),
    identificarAlunoNovoFn: async () => ({
      ok: true, nome: 'Aluno Teste', origem: 'aluno_matriculado', aluno_id: 123,
      responsavel_nome: 'Responsavel Teste', confianca: 1,
    }),
    responsavelFn: async () => ({
      ok: true, aluno_nome: 'Aluno Teste', responsavel_nome: 'Responsavel Teste',
    }),
    faturasMesFn: async () => null,
    duplicataFn: async () => ({ ja_lancado: false }),
    identidadeFn: async () => ({ identificado: true, nome: 'ADM Teste' }),
    lancarFn: async (payload) => {
      lancamentos.push(payload);
      return { ok: true, movimentacao_id: 'mov-1', valor: Number(payload.valor), forma: payload.forma };
    },
    buscarMovimentosFn: async () => ({ ok: true, items: [{ movimentacao_id: 'mov-1' }] }),
    log: (linha) => logs.push(linha),
  });
  return { h, envios, logs, lancamentos };
}

const evento = (messageId, body, hasMedia = false) => ({
  chatId: CHAT, senderPhone: '5521999990000', senderId: '5521999990000@c.us',
  messageId, body, hasMedia, mediaType: hasMedia ? 'image' : '',
  mediaUrls: hasMedia ? ['fake://comprovante.jpg'] : [],
});

(async () => {
  const passaporte = fixture('passaporte');
  const preview = await passaporte.h.handle(evento(
    'passaporte-1', 'Passaporte promocional do aluno Aluno Teste - R$430,00', true,
  ));
  assert.equal(preview.acao, 'preview_enviado');
  const pendencia = passaporte.h._pendentes.get(CHAT)[0];
  assert.equal(pendencia.categoria, 'passaporte');
  assert.equal(pendencia.faturaIndisponivel, false);
  assert.equal(pendencia.bloqueiaFonteIndisponivel, false);
  assert.match(passaporte.envios[0], /Posso lan[cç]ar/i);
  assert.equal(passaporte.logs.some((x) => x.acao === 'passaporte_declarado_independe_fatura'), true);

  const aprovado = await passaporte.h.handle(evento('passaporte-2', 'pode'));
  assert.equal(aprovado.acao, 'lancado');
  assert.equal(passaporte.lancamentos.length, 1);
  assert.equal(passaporte.lancamentos[0].categoria, 'passaporte');
  assert.equal(Object.hasOwn(passaporte.lancamentos[0], 'fatura_id'), false);

  const parcela = fixture('parcela');
  const previewParcela = await parcela.h.handle(evento(
    'parcela-1', 'Parcela do aluno Aluno Teste - R$430,00', true,
  ));
  assert.equal(previewParcela.acao, 'preview_enviado');
  const pendenciaParcela = parcela.h._pendentes.get(CHAT)[0];
  assert.equal(pendenciaParcela.bloqueiaFonteIndisponivel, true);
  assert.doesNotMatch(parcela.envios[0], /Posso lan[cç]ar/i);
  assert.match(parcela.envios[0], /Confirma aluno, compet[eê]ncia e curso\/parcela/i);
  const recusado = await parcela.h.handle(evento('parcela-2', 'pode'));
  assert.equal(recusado.acao, 'bloqueado_fonte_indisponivel');
  assert.equal(parcela.lancamentos.length, 0);

  console.log('ok: passaporte puro ignora falha lateral de fatura; parcela continua fail-closed');
})().catch((erro) => {
  console.error(erro && erro.stack || erro);
  process.exit(1);
});
