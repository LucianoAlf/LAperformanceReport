import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/migrations/20260715180000_fabio_consumidores_pedagogicos_canonicos.sql', import.meta.url),
  'utf8',
);

test('contexto e briefing do Fabio usam carteira e presenca semantica', () => {
  assert.match(migration, /vw_professor_carteira_pessoa_canonica_sombra/i);
  assert.match(migration, /vw_aluno_presenca_semantica_v1/i);
  assert.match(migration, /chamada_situacao/i);
  assert.doesNotMatch(migration, /from\s+public\.aluno_presenca\b/i);
});

test('pente-fino conta somente faltas confirmadas por pessoa', () => {
  assert.match(migration, /resultado_pedagogico\s*=\s*'falta_confirmada'/i);
  assert.match(migration, /aluno_ids_locais/i);
  assert.doesNotMatch(migration, /ap\.status\s*=\s*'ausente'/i);
  assert.match(migration, /get_frequencia_professor_periodo_publicavel_v1/i);
});

test('pente-fino permanece fechado para o agente durante a auditoria', () => {
  assert.match(
    migration,
    /revoke\s+all\s+on\s+function\s+public\.fabio_pente_fino_unidade\([^;]+from\s+fabio_agent/i,
  );
  assert.match(
    migration,
    /grant\s+execute\s+on\s+function\s+public\.fabio_pente_fino_unidade\([^;]+to\s+service_role/i,
  );
  assert.doesNotMatch(
    migration,
    /grant\s+execute\s+on\s+function\s+public\.fabio_pente_fino_unidade\([^;]+to\s+fabio_agent/i,
  );
});
