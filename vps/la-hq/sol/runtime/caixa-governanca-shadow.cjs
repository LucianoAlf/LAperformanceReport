'use strict';

// Ledger operacional SHADOW do Caixa da Sol.
//
// Este módulo não decide, não aprova e não escreve dinheiro. Ele produz apenas
// evidência sanitizada sobre o caminho operacional. A ativação é explícita e,
// se a telemetria falhar, o Caixa continua no trilho atual enquanto a falha do
// instrumento fica registrada localmente.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const EVENTOS = new Set([
  'message_observed', 'redelivery_observed', 'relevance_decided',
  'contained_with_reason', 'route_decided', 'tool_selected',
  'preview_prepared', 'preview_sent', 'approval_observed', 'approval_consumed',
  'write_applied', 'write_refused', 'receipt_sent', 'readback_confirmed',
  'readback_failed', 'episode_closed', 'correlation_gap', 'instrument_failure',
]);
const ROTAS = new Set(['deterministic_abf', 'agent_first', 'group_engagement', 'legacy', 'ocr', 'fallback', 'contained', 'unknown']);
const MOTORES = new Set(['abf', 'agent_tools', 'agent_llm', 'legacy_parser', 'ocr', 'vision', 'fallback_llm', 'bank_rpc', 'bridge', 'unknown']);
const RESULTADOS = new Set(['ok', 'refused', 'error', 'inconclusive', 'duplicate', 'contained', 'pending']);
const REFERENCIAS = new Set(['preview_ref', 'approval_ref', 'movement_ref', 'receipt_ref', 'readback_ref', 'tool_call_ref']);
const CAMPOS = new Set([
  'route', 'engine', 'tool_name', 'action', 'outcome', 'reason_code', 'media_kind',
  'relevance',
  'terminal_state', 'readback_status', 'correlation_status', 'duplicate',
  ...REFERENCIAS,
]);

function envLigado(nome) {
  return String(process.env[nome] || '').trim() === '1';
}

function codigoSeguro(valor, fallback = 'unknown') {
  const s = String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
  return s || fallback;
}

function tokenEstrito(valor, fallback = 'unknown') {
  const s = String(valor || '').trim().toLowerCase();
  return /^[a-z0-9_-]{1,80}$/.test(s) ? s : fallback;
}

function unidadeCodigo(valor) {
  const s = codigoSeguro(valor);
  if (s.includes('recreio')) return 'recreio';
  if (s.includes('barra')) return 'barra';
  if (s.includes('campo') || s.includes('grande') || s === 'cg') return 'campo_grande';
  return 'unknown';
}

function criarInstrumento(opcoes = {}) {
  const enabled = opcoes.enabled !== undefined ? !!opcoes.enabled : envLigado('SOL_CAIXA_GOVERNANCA_SHADOW');
  const remoteEnabled = opcoes.remoteEnabled !== undefined ? !!opcoes.remoteEnabled : envLigado('SOL_CAIXA_GOVERNANCA_REMOTE');
  const secret = String(opcoes.secret || process.env.SOL_CAIXA_GOVERNANCA_HMAC_SECRET || '');
  const keyId = codigoSeguro(opcoes.keyId || process.env.SOL_CAIXA_GOVERNANCA_HMAC_KEY_ID || 'k1', 'k1').slice(0, 24);
  const logPath = opcoes.logPath || process.env.SOL_CAIXA_GOVERNANCA_LOG
    || path.join(process.env.HERMES_HOME || '/home/sol/.hermes', 'profiles', 'sol', 'caixa-ingestao', 'governanca-shadow.jsonl');
  const fetchFn = opcoes.fetchFn || global.fetch;
  // Destino deliberadamente dedicado. A rota preferida reutiliza o escritor
  // estreito do control plane da Sol (anon key + token opaco); service_role
  // fica apenas como compatibilidade explícita. Nunca há fallback para as
  // variáveis genéricas do banco financeiro.
  const remoteUrl = String(opcoes.remoteUrl
    || process.env.SOL_GOVERNANCE_SUPABASE_URL
    || process.env.SOL_GOVERNANCA_SUPABASE_URL || '').replace(/\/$/, '');
  const remoteKey = String(opcoes.remoteKey
    || process.env.SOL_GOVERNANCE_SUPABASE_ANON_KEY
    || process.env.SOL_GOVERNANCA_SERVICE_ROLE_KEY || '');
  const remoteTokenId = String(opcoes.remoteTokenId || process.env.SOL_GOVERNANCE_WRITER_TOKEN_ID || '');
  const remoteWriterToken = String(opcoes.remoteWriterToken || process.env.SOL_GOVERNANCE_WRITER_TOKEN || '');
  const maxLogBytes = Math.max(1024 * 1024, Number(opcoes.maxLogBytes || process.env.SOL_CAIXA_GOVERNANCA_LOG_MAX_BYTES || 10 * 1024 * 1024));
  const keepLogFiles = Math.max(1, Math.min(30, Number(opcoes.keepLogFiles || process.env.SOL_CAIXA_GOVERNANCA_LOG_KEEP || 7)));
  const vistos = new Set();
  const segredoValido = secret.length >= 32;

  function hmac(valor) {
    if (!segredoValido) return null;
    return crypto.createHmac('sha256', secret).update(String(valor || '')).digest('hex');
  }

  function referencia(valor) {
    if (valor === null || valor === undefined || valor === '') return null;
    const hash = hmac(`ref|${valor}`);
    return hash ? `ref1.${keyId}.${hash}` : null;
  }

  function appendLocal(payload) {
    try {
      fs.mkdirSync(path.dirname(logPath), { recursive: true, mode: 0o700 });
      try {
        if (fs.statSync(logPath).size >= maxLogBytes) {
          try { fs.unlinkSync(`${logPath}.${keepLogFiles}`); } catch (_) {}
          for (let i = keepLogFiles - 1; i >= 1; i -= 1) {
            try { fs.renameSync(`${logPath}.${i}`, `${logPath}.${i + 1}`); } catch (_) {}
          }
          fs.renameSync(logPath, `${logPath}.1`);
        }
      } catch (_) {}
      fs.appendFileSync(logPath, JSON.stringify(payload) + '\n', { encoding: 'utf8', mode: 0o600 });
      try { fs.chmodSync(logPath, 0o600); } catch (_) {}
      return true;
    } catch (_) {
      return false;
    }
  }

  async function enviarRemoto(payload) {
    if (!remoteEnabled) return { ok: false, skipped: true, reason: 'remote_disabled' };
    if (!remoteUrl || !remoteKey || typeof fetchFn !== 'function') {
      return { ok: false, skipped: true, reason: 'remote_credentials_missing' };
    }
    const escritorEstreito = !!(remoteTokenId && remoteWriterToken);
    try {
      const endpoint = escritorEstreito
        ? 'sol_caixa_governanca_registrar_v2'
        : 'sol_caixa_governanca_registrar_v1';
      const body = escritorEstreito
        ? { p_token_id: remoteTokenId, p_writer_token: remoteWriterToken, p_payload: payload }
        : { p_payload: payload };
      const r = await fetchFn(`${remoteUrl}/rest/v1/rpc/${endpoint}`, {
        method: 'POST',
        headers: { apikey: remoteKey, Authorization: `Bearer ${remoteKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) return { ok: false, status: r.status, reason: 'remote_write_failed' };
      return { ok: true };
    } catch (_) {
      return { ok: false, status: 0, reason: 'remote_write_failed' };
    }
  }

  function limparDetalhes(detalhes = {}) {
    const out = {};
    for (const [chave, valor] of Object.entries(detalhes || {})) {
      if (!CAMPOS.has(chave) || valor === undefined || valor === null || valor === '') continue;
      if (REFERENCIAS.has(chave)) {
        const ref = referencia(valor);
        if (ref) out[chave] = ref;
      } else if (chave === 'duplicate') {
        out[chave] = !!valor;
      } else if (chave === 'route') {
        const v = tokenEstrito(valor); out[chave] = ROTAS.has(v) ? v : 'unknown';
      } else if (chave === 'engine') {
        const v = tokenEstrito(valor); out[chave] = MOTORES.has(v) ? v : 'unknown';
      } else if (chave === 'outcome') {
        const v = tokenEstrito(valor); out[chave] = RESULTADOS.has(v) ? v : 'inconclusive';
      } else {
        // Campos sem enum fechado continuam sendo tokens, nunca texto
        // normalizado. Uma frase, e-mail ou telefone acidental vira unknown.
        out[chave] = tokenEstrito(valor);
      }
    }
    return out;
  }

  function payloadEvento(episode, eventType, detalhes) {
    const type = EVENTOS.has(eventType) ? eventType : 'instrument_failure';
    const limpos = limparDetalhes(detalhes);
    const dedupe = `${type}|${JSON.stringify(limpos)}`;
    return {
      schema_version: 1,
      episode_id: episode.episode_id,
      event_key: `evt1.${keyId}.${hmac(`${episode.episode_id}|${dedupe}`)}`,
      event_type: type,
      occurred_at: new Date().toISOString(),
      unit_code: episode.unit_code,
      source: episode.source,
      message_kind: episode.message_kind,
      key_id: keyId,
      details: limpos,
    };
  }

  function record(episode, eventType, detalhes = {}) {
    if (!enabled || !episode || !segredoValido) return Promise.resolve({ ok: false, disabled: !enabled, missing_secret: enabled && !segredoValido });
    const payload = payloadEvento(episode, eventType, detalhes);
    const local = appendLocal(payload);
    return enviarRemoto(payload).then((remote) => {
      if (remoteEnabled && !remote.ok) {
        appendLocal(payloadEvento(episode, 'instrument_failure', {
          reason_code: remote.reason || 'remote_write_failed',
          engine: 'bridge', outcome: 'error',
        }));
      }
      return { ok: local || remote.ok, local, remote };
    });
  }

  function beginEpisode({ chatId, messageId, unitName, hasMedia, mediaType, source = 'whatsapp_group' } = {}) {
    if (!enabled) return null;
    if (!segredoValido || !chatId || !messageId) {
      appendLocal({ schema_version: 1, event_type: 'instrument_failure', occurred_at: new Date().toISOString(), reason_code: !segredoValido ? 'hmac_secret_missing' : 'message_key_missing' });
      return null;
    }
    const digest = hmac(`episode|${chatId}|${messageId}`);
    const episode = {
      episode_id: `ep1.${keyId}.${digest}`,
      unit_code: unidadeCodigo(unitName),
      source: codigoSeguro(source, 'unknown'),
      message_kind: hasMedia ? codigoSeguro(mediaType || 'media') : 'text',
    };
    const duplicate = vistos.has(episode.episode_id);
    vistos.add(episode.episode_id);
    void record(episode, duplicate ? 'redelivery_observed' : 'message_observed', { duplicate, media_kind: episode.message_kind });
    return episode;
  }

  function adoptEpisode(episodeId, { unitName, source = 'whatsapp_group', messageKind = 'text' } = {}) {
    if (!enabled || !segredoValido) return null;
    const id = String(episodeId || '').trim();
    if (!new RegExp(`^ep1\\.${keyId}\\.[0-9a-f]{64}$`).test(id)) return null;
    return { episode_id: id, unit_code: unidadeCodigo(unitName), source: codigoSeguro(source), message_kind: codigoSeguro(messageKind) };
  }

  return {
    enabled, remoteEnabled, keyId, beginEpisode, adoptEpisode, record, referencia,
    header(episode) { return episode && episode.episode_id ? `[episode_caixa: ${episode.episode_id}]` : ''; },
  };
}

module.exports = { criarInstrumento, EVENTOS };
