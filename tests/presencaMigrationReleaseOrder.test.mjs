import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const REMOTE_BASELINE_VERSION = '20260827024840';
const LATEST_REMOTE_LEDGER_VERSION = '20260827213234';

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

const RELEASE_CANDIDATE_SUFFIXES = [
  'presenca_request_id_arbitragem.sql',
  'presenca_ausencia_bruta_fail_closed.sql',
  'presenca_roster_v2_expansao_aditiva.sql',
  'presenca_slot_lock_core.sql',
  'presenca_portas_reservadas_duais.sql',
  'presenca_roster_v2_publicacao_gatada.sql',
];

const FASE4_SUFFIXES = RELEASE_CANDIDATE_SUFFIXES.slice(2);

const FORBIDDEN_WIP_VERSIONS = [
  '20260827143000',
  '20260827143100',
  '20260827143200',
  '20260827143300',
];

function filesForSuffixes(suffixes) {
  const names = readdirSync('supabase/migrations');
  return suffixes.map((suffix) => {
    const matches = names.filter((name) => name.endsWith(`_${suffix}`));
    assert.equal(matches.length, 1, `${suffix}: esperado exatamente um arquivo`);
    return matches[0];
  });
}

function candidateFiles() {
  return filesForSuffixes(CANDIDATE_SUFFIXES);
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

test('release de presenca ordena explicitamente Fase 2, Fase 3 e as quatro migrations da Fase 4', () => {
  const migrations = readdirSync('supabase/migrations');
  const files = filesForSuffixes(RELEASE_CANDIDATE_SUFFIXES);
  const versions = files.map((name) => name.slice(0, 14));

  assert.deepEqual(files.slice(0, 2), [
    '20260827223000_presenca_request_id_arbitragem.sql',
    '20260828001259_presenca_ausencia_bruta_fail_closed.sql',
  ]);
  assert.equal(new Set(versions).size, versions.length, 'versoes duplicadas no release');
  assert.ok(
    versions.every((version) => version > LATEST_REMOTE_LEDGER_VERSION),
    `migration nao posterior ao ledger ${LATEST_REMOTE_LEDGER_VERSION}: ${files.join(', ')}`,
  );
  assert.deepEqual(versions, [...versions].sort(), 'ordem dos seis candidatos diverge do release');

  for (const forbidden of FORBIDDEN_WIP_VERSIONS) {
    assert.equal(
      migrations.some((name) => name.startsWith(`${forbidden}_`)),
      false,
      `WIP proibida presente no release: ${forbidden}`,
    );
  }
});

test('migrations da Fase 4 nao reconstroem funcoes por introspeccao ou captura generica', () => {
  const files = filesForSuffixes(FASE4_SUFFIXES);
  const forbiddenPatterns = [
    ['pg_get_functiondef', /\bpg_get_functiondef\s*\(/iu],
    ['regexp_replace', /\bregexp_replace\s*\(/iu],
    ['exception when others', /\bexception\s+when\s+others\b/iu],
  ];

  for (const name of files) {
    const sql = readFileSync(`supabase/migrations/${name}`, 'utf8');
    for (const [label, pattern] of forbiddenPatterns) {
      assert.doesNotMatch(sql, pattern, `${name}: uso proibido de ${label}`);
    }
  }
});

test('helpers privados do LA Teacher sao marcados internos sem abrir ACL', () => {
  const [name] = filesForSuffixes(['presenca_la_teacher_helpers_internos.sql']);
  const sql = readFileSync(`supabase/migrations/${name}`, 'utf8');

  for (const signature of [
    /comment\s+on\s+function\s+public\.app_minha_agenda_sessao_publicacao_legado_v1\s*\(\s*date\s*\)\s+is\s+'\[interna\]/iu,
    /comment\s+on\s+function\s+public\.app_registrar_presencas_aula_canonica_v2_interno\s*\(\s*uuid\s*,\s*integer\s*,\s*integer\[\]\s*\)\s+is\s+'\[interna\]/iu,
    /comment\s+on\s+function\s+public\.app_registrar_presencas_aula_publicacao_legado_v1\s*\(\s*integer\s*,\s*integer\[\]\s*,\s*uuid\s*\)\s+is\s+'\[interna\]/iu,
  ]) {
    assert.match(sql, signature);
  }

  assert.doesNotMatch(sql, /grant\s+execute[\s\S]*authenticated/iu);
  assert.doesNotMatch(sql, /create\s+(?:or\s+replace\s+)?function/iu);
  assert.doesNotMatch(sql, /\b(?:insert|update|delete)\b/iu);
});
