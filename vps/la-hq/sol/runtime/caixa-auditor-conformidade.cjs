'use strict';

// Checkpoint 3 — Auditor + Conformidade do Caixa da Sol.
//
// Contrato: função pura, read-only e fail-closed. Recebe somente o readback
// sanitizado do ledger e evidência independente igualmente enumerada. Não
// acessa banco, rede, filesystem, Caixa ou grupos; não corrige e não certifica.

const ESTADOS = Object.freeze({
  CUMPRIDA: 'cumprida',
  CONTRARIADA: 'contrariada',
  NAO_MENSURAVEL: 'nao_mensuravel',
});

const TIPOS_EVENTO = new Set([
  'message_observed', 'redelivery_observed', 'relevance_decided',
  'contained_with_reason', 'route_decided', 'tool_selected',
  'preview_prepared', 'preview_sent', 'approval_observed', 'approval_consumed',
  'write_applied', 'write_refused', 'receipt_sent', 'readback_confirmed',
  'readback_failed', 'episode_closed', 'correlation_gap', 'instrument_failure',
]);

const EVIDENCIA_CAMPOS = new Set([
  'origin_observed', 'expected_relevance', 'expected_route', 'expected_tool',
  'financial_effect_exists', 'outbound_receipt_exists', 'readback_exists',
]);

function token(valor, fallback = 'unknown') {
  const s = String(valor || '').trim().toLowerCase();
  return /^[a-z0-9_.-]{1,180}$/.test(s) ? s : fallback;
}

function dataMs(valor) {
  const n = Date.parse(String(valor || ''));
  return Number.isFinite(n) ? n : null;
}

function normalizarEvidencia(evidencia = {}) {
  const out = new Map();
  for (const [episodeId, bruto] of Object.entries(evidencia || {})) {
    if (!/^ep1\.[a-z0-9_-]{1,24}\.[0-9a-f]{64}$/.test(episodeId) || !bruto || typeof bruto !== 'object') continue;
    const limpo = {};
    for (const [chave, valor] of Object.entries(bruto)) {
      if (!EVIDENCIA_CAMPOS.has(chave)) continue;
      limpo[chave] = typeof valor === 'boolean' ? valor : token(valor);
    }
    out.set(episodeId, limpo);
  }
  return out;
}

function validarReadback(readback) {
  if (!readback || typeof readback !== 'object' || readback.ok !== true
      || Number(readback.schema_version) !== 1
      || !Array.isArray(readback.events) || !Array.isArray(readback.episodes)) {
    throw new Error('readback_sanitizado_invalido');
  }
  for (const evento of readback.events) {
    if (!evento || typeof evento !== 'object'
        || !/^ep1\.[a-z0-9_-]{1,24}\.[0-9a-f]{64}$/.test(String(evento.episode_id || ''))
        || !TIPOS_EVENTO.has(String(evento.event_type || ''))
        || dataMs(evento.occurred_at) === null
        || !evento.details || typeof evento.details !== 'object' || Array.isArray(evento.details)) {
      throw new Error('evento_sanitizado_invalido');
    }
    for (const valor of Object.values(evento.details)) {
      if (typeof valor !== 'string' && typeof valor !== 'boolean') throw new Error('details_sanitizados_invalidos');
    }
  }
}

function agrupar(readback) {
  const mapa = new Map();
  for (const ep of readback.episodes) {
    if (!ep || !ep.episode_id) continue;
    mapa.set(ep.episode_id, { meta: ep, eventos: [] });
  }
  for (const evento of readback.events) {
    if (!mapa.has(evento.episode_id)) mapa.set(evento.episode_id, { meta: { episode_id: evento.episode_id }, eventos: [] });
    mapa.get(evento.episode_id).eventos.push(evento);
  }
  for (const item of mapa.values()) {
    item.eventos.sort((a, b) => dataMs(a.occurred_at) - dataMs(b.occurred_at)
      || String(a.event_key || '').localeCompare(String(b.event_key || '')));
  }
  return mapa;
}

function eventosTipo(item, tipo) {
  return item.eventos.filter((e) => e.event_type === tipo);
}

function ultimoDetalhe(item, tipo, campo) {
  const xs = eventosTipo(item, tipo);
  return xs.length ? token(xs.at(-1).details && xs.at(-1).details[campo]) : null;
}

function classificarDisposicao(item) {
  const terminal = ultimoDetalhe(item, 'episode_closed', 'terminal_state');
  const rota = ultimoDetalhe(item, 'route_decided', 'route');
  if (terminal === 'ignored_by_policy' || terminal === 'courtesy_sent' || terminal === 'courtesy_failed') return 'ignored_by_policy';
  if (rota === 'agent_first') return 'agent_first';
  if (rota === 'group_engagement' || terminal === 'agent_reply_sent' || terminal === 'agent_reply_failed') return 'responded';
  if (['deterministic_abf', 'legacy', 'ocr', 'fallback'].includes(rota)) return 'deterministic';
  return terminal ? 'responded' : 'unclassified';
}

function auditarReadback(readback, opcoes = {}) {
  validarReadback(readback);
  const nowMs = dataMs(opcoes.now || readback.generated_at) || Date.now();
  const graceMs = Math.max(0, Number(opcoes.graceMs ?? 5 * 60 * 1000));
  const evidencia = normalizarEvidencia(opcoes.evidence || {});
  const episodios = agrupar(readback);
  const findings = [];
  const medidas = new Map();
  const disposicoes = { responded: 0, ignored_by_policy: 0, deterministic: 0, agent_first: 0, unclassified: 0 };

  function medir(regra, aplicavel, ok) {
    if (!medidas.has(regra)) medidas.set(regra, { denominator: 0, violations: 0 });
    const m = medidas.get(regra);
    if (!aplicavel) return;
    m.denominator += 1;
    if (!ok) m.violations += 1;
  }

  function finding(episodeId, type, severity, rule, evidenceCode) {
    findings.push({ episode_id: episodeId, type, severity, rule, evidence_code: token(evidenceCode) });
  }

  for (const [episodeId, item] of episodios) {
    const observed = eventosTipo(item, 'message_observed');
    const relevance = eventosTipo(item, 'relevance_decided');
    const routes = eventosTipo(item, 'route_decided');
    const tools = eventosTipo(item, 'tool_selected');
    const terminals = eventosTipo(item, 'episode_closed');
    const writes = eventosTipo(item, 'write_applied');
    const writeRefusals = eventosTipo(item, 'write_refused');
    const previews = eventosTipo(item, 'preview_sent');
    const approvals = eventosTipo(item, 'approval_observed');
    const consumptions = eventosTipo(item, 'approval_consumed');
    const receipts = eventosTipo(item, 'receipt_sent');
    const readbacks = eventosTipo(item, 'readback_confirmed');
    const correlationGaps = eventosTipo(item, 'correlation_gap');
    const instrumentFailures = eventosTipo(item, 'instrument_failure');
    const latestMs = Math.max(0, ...item.eventos.map((e) => dataMs(e.occurred_at) || 0));
    const vencido = latestMs > 0 && nowMs - latestMs >= graceMs;
    const ev = evidencia.get(episodeId) || {};

    const disposition = classificarDisposicao(item);
    disposicoes[disposition] = (disposicoes[disposition] || 0) + 1;

    medir('coverage_observed', true, observed.length === 1 && ev.origin_observed !== false);
    if (observed.length !== 1 || ev.origin_observed === false) {
      finding(episodeId, 'coverage_gap', 'high', 'coverage_observed', observed.length ? 'origin_missing' : 'message_observed_missing');
    }

    medir('relevance_classified', true, relevance.length === 1);
    if (relevance.length !== 1) finding(episodeId, 'coverage_gap', 'high', 'relevance_classified', 'relevance_missing_or_duplicate');

    medir('no_correlation_gap', true, correlationGaps.length === 0);
    if (correlationGaps.length > 0) finding(episodeId, 'correlation_gap', 'critical', 'no_correlation_gap', 'correlation_gap_recorded');

    medir('instrument_healthy', true, instrumentFailures.length === 0);
    if (instrumentFailures.length > 0) finding(episodeId, 'instrument_failure', 'high', 'instrument_healthy', 'instrument_failure_recorded');

    const terminalMensuravel = terminals.length > 0 || vencido;
    medir('single_terminal', terminalMensuravel, terminals.length === 1);
    if (terminals.length === 0 && vencido) finding(episodeId, 'silent_drop', 'critical', 'single_terminal', 'terminal_missing_after_grace');
    if (terminals.length > 1) finding(episodeId, 'correlation_gap', 'critical', 'single_terminal', 'terminal_duplicate');

    const relevanceActual = ultimoDetalhe(item, 'relevance_decided', 'relevance');
    const routeActual = ultimoDetalhe(item, 'route_decided', 'route');
    const toolActual = ultimoDetalhe(item, 'tool_selected', 'tool_name');
    if (ev.expected_relevance) {
      medir('expected_relevance', true, relevanceActual === ev.expected_relevance);
      if (relevanceActual !== ev.expected_relevance) finding(episodeId, 'routing_error', 'high', 'expected_relevance', 'relevance_divergence');
    }
    if (ev.expected_route) {
      medir('expected_route', true, routeActual === ev.expected_route);
      if (routeActual !== ev.expected_route) finding(episodeId, 'routing_error', 'high', 'expected_route', 'route_divergence');
    }
    if (ev.expected_tool) {
      medir('expected_tool', true, toolActual === ev.expected_tool);
      if (toolActual !== ev.expected_tool) finding(episodeId, 'routing_error', 'critical', 'expected_tool', 'tool_divergence');
    }

    const temWrite = writes.length > 0;
    const cadeiaAutorizada = previews.length > 0 && approvals.length > 0 && consumptions.length > 0;
    medir('write_authorized_chain', temWrite, cadeiaAutorizada);
    if (temWrite && !cadeiaAutorizada) finding(episodeId, 'approval_mismatch', 'critical', 'write_authorized_chain', 'write_without_full_approval_chain');

    medir('single_financial_effect', temWrite, writes.length === 1);
    if (writes.length > 1) finding(episodeId, 'duplicate_effect', 'critical', 'single_financial_effect', 'multiple_write_applied');

    const receiptTemDesfecho = temWrite || writeRefusals.length > 0;
    medir('receipt_matches_outcome', receipts.length > 0, receiptTemDesfecho);
    if (receipts.length > 0 && !receiptTemDesfecho) {
      finding(episodeId, 'false_receipt', 'critical', 'receipt_matches_outcome', 'receipt_without_write_or_refusal');
    }

    medir('readback_after_write', temWrite, readbacks.length > 0);
    if (temWrite && readbacks.length === 0) finding(episodeId, 'readback_missing', 'critical', 'readback_after_write', 'write_without_readback');

    if (ev.financial_effect_exists !== undefined) {
      medir('source_effect_parity', true, temWrite === ev.financial_effect_exists);
      if (temWrite !== ev.financial_effect_exists) finding(episodeId, 'preview_effect_divergence', 'critical', 'source_effect_parity', 'effect_source_divergence');
    }
    if (ev.outbound_receipt_exists !== undefined) {
      medir('source_receipt_parity', true, (receipts.length > 0) === ev.outbound_receipt_exists);
      if ((receipts.length > 0) !== ev.outbound_receipt_exists) finding(episodeId, 'false_receipt', 'critical', 'source_receipt_parity', 'receipt_source_divergence');
    }
    if (ev.readback_exists !== undefined) {
      medir('source_readback_parity', true, (readbacks.length > 0) === ev.readback_exists);
      if ((readbacks.length > 0) !== ev.readback_exists) finding(episodeId, 'readback_missing', 'critical', 'source_readback_parity', 'readback_source_divergence');
    }

    if (routes.length === 0 && relevanceActual === 'relevant') {
      finding(episodeId, 'routing_error', 'high', 'route_present_for_relevant', 'relevant_without_route');
    }
    medir('route_present_for_relevant', relevanceActual === 'relevant', routes.length > 0);
  }

  const conformidade = Array.from(medidas, ([rule, m]) => ({
    rule,
    state: m.denominator === 0 ? ESTADOS.NAO_MENSURAVEL
      : m.violations > 0 ? ESTADOS.CONTRARIADA : ESTADOS.CUMPRIDA,
    denominator: m.denominator,
    violations: m.violations,
  })).sort((a, b) => a.rule.localeCompare(b.rule));

  const contrariada = conformidade.some((r) => r.state === ESTADOS.CONTRARIADA);
  const naoMensuravel = conformidade.some((r) => r.state === ESTADOS.NAO_MENSURAVEL);
  const verdict = contrariada ? 'contrariada' : naoMensuravel ? 'inconclusiva' : 'apta_para_revisao_humana';

  return {
    schema_version: 1,
    generated_at: new Date(nowMs).toISOString(),
    verdict,
    certification: 'human_gate_required',
    read_only: true,
    counts: {
      episodes: episodios.size,
      findings: findings.length,
      critical_findings: findings.filter((f) => f.severity === 'critical').length,
      by_disposition: disposicoes,
    },
    conformidade,
    findings: findings.sort((a, b) => a.episode_id.localeCompare(b.episode_id) || a.type.localeCompare(b.type)),
  };
}

module.exports = { auditarReadback, validarReadback, ESTADOS };
