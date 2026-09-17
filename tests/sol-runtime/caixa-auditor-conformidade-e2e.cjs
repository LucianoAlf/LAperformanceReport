#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { auditarReadback } = require('../../vps/la-hq/sol/runtime/caixa-auditor-conformidade.cjs');

const root = path.resolve(__dirname, '../..');
const now = '2026-09-17T01:00:00.000Z';
const ep = (hex) => `ep1.teste.${hex.repeat(64)}`;
let seq = 0;
function evento(episodeId, eventType, details = {}, minute = 0) {
  seq += 1;
  return {
    event_key: `evt1.teste.${seq.toString(16).padStart(64, '0')}`,
    episode_id: episodeId,
    event_type: eventType,
    occurred_at: `2026-09-17T00:${String(minute).padStart(2, '0')}:00.000Z`,
    unit_code: 'recreio', source: 'whatsapp_group', message_kind: 'text', key_id: 'teste', details,
  };
}
function readback(events) {
  const ids = Array.from(new Set(events.map((e) => e.episode_id)));
  return {
    ok: true, schema_version: 1, generated_at: now,
    counts: { events: events.length, episodes: ids.length },
    episodes: ids.map((episode_id) => ({ episode_id })), events,
  };
}

const ignorada = ep('a');
const consulta = ep('b');
const escrita = ep('c');
const recusada = ep('f');
const positivos = [
  evento(ignorada, 'message_observed'),
  evento(ignorada, 'relevance_decided', { relevance: 'irrelevant', reason_code: 'standby', outcome: 'contained' }, 1),
  evento(ignorada, 'contained_with_reason', { route: 'contained', engine: 'bridge', reason_code: 'standby', outcome: 'contained' }, 1),
  evento(ignorada, 'episode_closed', { terminal_state: 'ignored_by_policy', action: 'standby', outcome: 'contained' }, 1),

  evento(consulta, 'message_observed'),
  evento(consulta, 'relevance_decided', { relevance: 'relevant', reason_code: 'agent_first_candidate', outcome: 'ok' }, 2),
  evento(consulta, 'route_decided', { route: 'agent_first', engine: 'agent_tools', outcome: 'pending' }, 2),
  evento(consulta, 'tool_selected', { tool_name: 'caixa_do_dia', action: 'readback', engine: 'agent_tools' }, 3),
  evento(consulta, 'readback_confirmed', { action: 'caixa_do_dia', outcome: 'ok', readback_status: 'confirmed' }, 3),
  evento(consulta, 'episode_closed', { terminal_state: 'readback_confirmed', action: 'caixa_do_dia', outcome: 'ok' }, 3),

  evento(escrita, 'message_observed'),
  evento(escrita, 'relevance_decided', { relevance: 'relevant', reason_code: 'agent_first_candidate', outcome: 'ok' }, 4),
  evento(escrita, 'route_decided', { route: 'agent_first', engine: 'agent_tools', outcome: 'pending' }, 4),
  evento(escrita, 'tool_selected', { tool_name: 'caixa_preparar_lancamento', action: 'preparar_lancamento', engine: 'agent_tools' }, 5),
  evento(escrita, 'preview_sent', { preview_ref: 'ref1.teste.aaaaaaaa', outcome: 'ok' }, 5),
  evento(escrita, 'approval_observed', { approval_ref: 'ref1.teste.bbbbbbbb', outcome: 'ok' }, 6),
  evento(escrita, 'approval_consumed', { approval_ref: 'ref1.teste.bbbbbbbb', outcome: 'ok' }, 6),
  evento(escrita, 'write_applied', { movement_ref: 'ref1.teste.cccccccc', outcome: 'ok' }, 7),
  evento(escrita, 'receipt_sent', { receipt_ref: 'ref1.teste.dddddddd', outcome: 'ok' }, 7),
  evento(escrita, 'readback_confirmed', { readback_ref: 'ref1.teste.eeeeeeee', outcome: 'ok' }, 8),
  evento(escrita, 'episode_closed', { terminal_state: 'verified', action: 'lancamento', outcome: 'ok' }, 8),

  evento(recusada, 'message_observed'),
  evento(recusada, 'relevance_decided', { relevance: 'relevant', reason_code: 'deterministic_abf', outcome: 'ok' }, 9),
  evento(recusada, 'route_decided', { route: 'deterministic_abf', engine: 'abf', outcome: 'pending' }, 9),
  evento(recusada, 'approval_observed', { action: 'abrir', outcome: 'pending' }, 10),
  evento(recusada, 'write_refused', { action: 'abrir', outcome: 'refused', reason_code: 'caixa_anterior_aberto' }, 10),
  evento(recusada, 'receipt_sent', { action: 'abrir_recusado', outcome: 'ok', receipt_ref: 'ref1.teste.22222222' }, 10),
  evento(recusada, 'episode_closed', { terminal_state: 'handled', action: 'abrir_recusado', outcome: 'ok' }, 10),
];

const ok = auditarReadback(readback(positivos), {
  now,
  evidence: {
    [consulta]: { origin_observed: true, expected_relevance: 'relevant', expected_route: 'agent_first', expected_tool: 'caixa_do_dia' },
    [escrita]: {
      origin_observed: true, expected_relevance: 'relevant', expected_route: 'agent_first', expected_tool: 'caixa_preparar_lancamento',
      financial_effect_exists: true, outbound_receipt_exists: true, readback_exists: true,
      raw_text: 'este campo não pode atravessar',
    },
  },
});
assert.equal(ok.verdict, 'apta_para_revisao_humana');
assert.equal(ok.certification, 'human_gate_required');
assert.equal(ok.read_only, true);
assert.equal(ok.counts.findings, 0);
assert.equal(ok.counts.by_disposition.ignored_by_policy, 1);
assert.equal(ok.counts.by_disposition.agent_first, 2);
assert.equal(ok.counts.by_disposition.deterministic, 1);
assert(ok.conformidade.every((r) => r.state === 'cumprida'));
assert(!JSON.stringify(ok).includes('este campo'));

const aberto = ep('d');
const negativo = ep('e');
const ruins = [
  evento(aberto, 'message_observed', {}, 1),
  evento(aberto, 'route_decided', { route: 'agent_first', engine: 'agent_tools', outcome: 'pending' }, 1),
  evento(aberto, 'correlation_gap', { correlation_status: 'missing_terminal', outcome: 'inconclusive' }, 1),
  evento(negativo, 'message_observed', {}, 1),
  evento(negativo, 'relevance_decided', { relevance: 'relevant', reason_code: 'agent_first_candidate', outcome: 'ok' }, 1),
  evento(negativo, 'route_decided', { route: 'agent_first', engine: 'agent_tools', outcome: 'pending' }, 1),
  evento(negativo, 'tool_selected', { tool_name: 'caixa_preparar_saida', action: 'preparar_saida', engine: 'agent_tools' }, 2),
  evento(negativo, 'write_applied', { movement_ref: 'ref1.teste.ffffffff', outcome: 'ok' }, 2),
  evento(negativo, 'receipt_sent', { receipt_ref: 'ref1.teste.11111111', outcome: 'ok' }, 2),
  evento(negativo, 'episode_closed', { terminal_state: 'receipted', action: 'saida', outcome: 'ok' }, 2),
];
const falhou = auditarReadback(readback(ruins), {
  now,
  graceMs: 60_000,
  evidence: { [negativo]: { expected_tool: 'caixa_preparar_lancamento', financial_effect_exists: true, readback_exists: false } },
});
assert.equal(falhou.verdict, 'contrariada');
for (const tipo of ['silent_drop', 'correlation_gap', 'approval_mismatch', 'readback_missing', 'routing_error']) {
  assert(falhou.findings.some((f) => f.type === tipo), `finding conhecido não reencontrado: ${tipo}`);
}
assert(falhou.findings.some((f) => f.rule === 'expected_tool' && f.severity === 'critical'),
  'negativo plantado com ferramenta errada precisa reprovar');
assert(falhou.conformidade.some((r) => r.rule === 'write_authorized_chain' && r.state === 'contrariada'));

const auditorSrc = fs.readFileSync(path.join(root, 'vps/la-hq/sol/runtime/caixa-auditor-conformidade.cjs'), 'utf8');
for (const proibido of ["require('fs')", "require('http')", "require('https')", 'fetch(', '.insert(', '.update(', '.delete(']) {
  assert(!auditorSrc.includes(proibido), `Auditor ganhou capacidade de escrita/rede: ${proibido}`);
}
const bridgeSrc = fs.readFileSync(path.join(root, 'vps/la-hq/sol/runtime/bridge.js'), 'utf8');
assert(bridgeSrc.includes("'relevance_decided'"));
assert(bridgeSrc.includes("'contained_with_reason'"));
assert(bridgeSrc.includes("terminal_state: 'ignored_by_policy'"));
assert(bridgeSrc.includes("route: _agentFirst ? 'agent_first' : 'group_engagement'"));
assert(bridgeSrc.includes('agent_first_text_candidate_pos_abf'));
assert(!bridgeSrc.includes("terminal_state: 'routed_to_group_engagement'"),
  'group engagement não pode fechar antes do envio real');

console.log('CP3 Auditor + Conformidade: incidentes, negativo, política e gate humano — OK');
