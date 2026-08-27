import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const REMOTE_BASELINE_VERSION = '20260827024840';

const CANDIDATE_SUFFIXES = [
  'presenca_funcoes_vivas_baseline.sql',
  'presenca_ocorrencia_canonica_v2.sql',
  'presenca_sync_cobertura_idempotente.sql',
  'presenca_sync_crons_operacional_e_backlog.sql',
  'presenca_sync_saude_operacional.sql',
  'presenca_roster_operacional.sql',
  'presenca_comando_auditoria.sql',
  'presenca_comando_porta_professor.sql',
  'presenca_comando_portas_fabio.sql',
  'presenca_comando_overloads_compatibilidade.sql',
  'presenca_pendencias_canonicas_v2.sql',
  'la_teacher_presenca_canonica_v2.sql',
  'presenca_contexto_agentes_v1.sql',
  'presenca_consumidores_numericos_v2.sql',
  'presenca_interfaces_consulta_v2.sql',
  'presenca_shadow_comparacao_v2.sql',
  'presenca_rollout_config.sql',
  'presenca_rollout_adapters.sql',
  'presenca_rollout_kpis.sql',
  'presenca_hardening_funcoes_internas.sql',
  'presenca_rollout_detalhes.sql',
  'presenca_rollout_fabio_periodo.sql',
];

function candidateFiles() {
  const names = readdirSync('supabase/migrations');
  return CANDIDATE_SUFFIXES.map((suffix) => {
    const matches = names.filter((name) => name.endsWith(`_${suffix}`));
    assert.equal(matches.length, 1, `${suffix}: esperado exatamente um arquivo`);
    return matches[0];
  });
}

test('lote de presenca fica integralmente depois do baseline remoto e em ordem causal', () => {
  const files = candidateFiles();
  const versions = files.map((name) => name.slice(0, 14));

  assert.equal(new Set(versions).size, versions.length, 'versoes duplicadas');
  assert.ok(
    versions.every((version) => version > REMOTE_BASELINE_VERSION),
    `migration fora de ordem em relacao a ${REMOTE_BASELINE_VERSION}: ${files.join(', ')}`,
  );
  assert.deepEqual(versions, [...versions].sort(), 'ordem causal diverge da ordem do ledger');
});

test('manifesto do lote possui hash sha256 reproduzivel para cada migration', () => {
  const manifest = candidateFiles().map((name) => ({
    name,
    sha256: createHash('sha256')
      .update(readFileSync(`supabase/migrations/${name}`))
      .digest('hex'),
  }));

  assert.equal(manifest.length, CANDIDATE_SUFFIXES.length);
  assert.ok(manifest.every(({ sha256 }) => /^[0-9a-f]{64}$/u.test(sha256)));
});
