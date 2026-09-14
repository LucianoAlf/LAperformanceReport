#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { criarInstrumento } = require('../../vps/la-hq/sol/runtime/caixa-governanca-shadow.cjs');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sol-gov-shadow-'));
  const log = path.join(dir, 'shadow.jsonl');
  const secret = 'segredo-de-ensaio-com-mais-de-trinta-e-dois-bytes';
  const chamadas = [];
  const instrumento = criarInstrumento({
    enabled: true, remoteEnabled: true, secret, keyId: 'teste', logPath: log,
    remoteUrl: 'https://sol.invalid', remoteKey: 'chave-publicavel-de-ensaio',
    remoteTokenId: 'writer-ensaio', remoteWriterToken: 'token-escritor-de-ensaio',
    fetchFn: async (url, opts) => { chamadas.push({ url, body: JSON.parse(opts.body) }); return { ok: true, status: 200 }; },
  });

  const entrada = {
    chatId: 'grupo-financeiro@g.us', messageId: 'MENSAGEM-123', unitName: 'Recreio',
    hasMedia: false, mediaType: '', body: 'texto que jamais pode aparecer',
    senderPhone: '5521999999999', senderName: 'Pessoa Privada',
  };
  const a = instrumento.beginEpisode(entrada);
  const b = instrumento.beginEpisode(entrada);
  assert(a && b && a.episode_id === b.episode_id, 'episode HMAC precisa ser estável na redelivery');
  assert(/^ep1\.teste\.[0-9a-f]{64}$/.test(a.episode_id));
  assert.strictEqual(instrumento.adoptEpisode(a.episode_id, { unitName: 'Recreio' }).episode_id, a.episode_id);

  await instrumento.record(a, 'tool_selected', {
    tool_name: 'caixa_preparar_lancamento', engine: 'agent_tools',
    preview_ref: 'PREVIEW-REAL', raw_text: entrada.body, phone: entrada.senderPhone,
    reason_code: entrada.body,
  });
  await instrumento.record(a, 'receipt_sent', {
    receipt_ref: 'RECIBO-REAL', movement_ref: 'MOVIMENTO-REAL', outcome: 'ok',
  });

  await new Promise((resolve) => setTimeout(resolve, 20));
  const bruto = fs.readFileSync(log, 'utf8');
  for (const proibido of [entrada.chatId, entrada.messageId, entrada.body, entrada.senderPhone,
    entrada.senderName, 'PREVIEW-REAL', 'RECIBO-REAL', 'MOVIMENTO-REAL', secret]) {
    assert(!bruto.includes(proibido), `dado cru vazou: ${proibido}`);
  }
  const linhas = bruto.trim().split('\n').map(JSON.parse);
  assert(linhas.some((x) => x.event_type === 'message_observed'));
  assert(linhas.some((x) => x.event_type === 'redelivery_observed'));
  assert(linhas.some((x) => x.event_type === 'tool_selected'));
  assert(linhas.every((x) => !x.details || !('raw_text' in x.details)));
  assert(linhas.some((x) => x.event_type === 'tool_selected' && x.details.reason_code === 'unknown'));
  assert(linhas.some((x) => x.details && /^ref1\.teste\.[0-9a-f]{64}$/.test(x.details.receipt_ref || '')));
  assert(chamadas.length >= 4, 'eventos remotos não foram emitidos');
  assert(chamadas.every((x) => x.url.endsWith('/rpc/sol_caixa_governanca_registrar_v2')));
  assert(chamadas.every((x) => x.body.p_token_id === 'writer-ensaio'));
  assert(chamadas.every((x) => x.body.p_writer_token === 'token-escritor-de-ensaio'));
  assert(chamadas.every((x) => x.body.p_payload && !('raw_text' in (x.body.p_payload.details || {}))));

  const falhaLog = path.join(dir, 'remote-falhou.jsonl');
  const falho = criarInstrumento({
    enabled: true, remoteEnabled: true, secret, keyId: 'teste', logPath: falhaLog,
    remoteUrl: 'https://sol.invalid', remoteKey: 'publicavel',
    remoteTokenId: 'writer-ensaio', remoteWriterToken: 'token-escritor-de-ensaio',
    fetchFn: async () => ({ ok: false, status: 503 }),
  });
  const epFalho = falho.beginEpisode({ ...entrada, messageId: 'MENSAGEM-FALHA' });
  await falho.record(epFalho, 'route_decided', { route: 'legacy', engine: 'legacy_parser' });
  await new Promise((resolve) => setTimeout(resolve, 20));
  const linhasFalha = fs.readFileSync(falhaLog, 'utf8').trim().split('\n').map(JSON.parse);
  assert(linhasFalha.some((x) => x.event_type === 'instrument_failure'
    && x.details.reason_code === 'remote_write_failed'));

  const semSegredoLog = path.join(dir, 'sem-segredo.jsonl');
  const semSegredo = criarInstrumento({ enabled: true, secret: '', logPath: semSegredoLog });
  assert.strictEqual(semSegredo.beginEpisode(entrada), null);
  assert(/hmac_secret_missing/.test(fs.readFileSync(semSegredoLog, 'utf8')));

  const desligadoLog = path.join(dir, 'desligado.jsonl');
  const desligado = criarInstrumento({ enabled: false, secret, logPath: desligadoLog });
  assert.strictEqual(desligado.beginEpisode(entrada), null);
  assert(!fs.existsSync(desligadoLog), 'modo OFF não pode produzir efeito');

  console.log('governança Caixa shadow: HMAC, redelivery, sanitização, remoto e fail-safe OK');
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
