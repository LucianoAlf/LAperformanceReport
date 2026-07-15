import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260715163000_presenca_semantica_evidencia_bruta.sql',
  'utf8',
);

test('view expõe origem bruta e separa sincronização de resposta humana', () => {
  assert.match(migration, /emusys_presenca_bruta/i);
  assert.match(migration, /sincronizado_emusys_em/i);
  assert.match(migration, /evidencia_registrada_em/i);
  assert.match(migration, /respondido_em_confiavel/i);
  assert.match(migration, /presenca-semantica-v1\.1/i);
});

test('presença do professor é evidência de aula, não confirmação automática de falta', () => {
  assert.match(migration, /professor_presenca_emusys/i);
  assert.match(migration, /professor_presenca_emusys\s*=\s*'presente'/i);
  assert.match(migration, /'falta_provavel'/i);
  assert.doesNotMatch(
    migration,
    /professor_presenca_emusys\s*=\s*'presente'[\s\S]{0,220}'falta_confirmada'/i,
  );
});

test('ausência automática do Emusys não entra no denominador oficial', () => {
  assert.match(
    migration,
    /resultado_pedagogico\s+IN\s*\(\s*'presente',\s*'falta_confirmada'\s*\)/i,
  );
  assert.match(migration, /resultado_pedagogico\s*=\s*'falta_confirmada'/i);
  assert.doesNotMatch(
    migration,
    /estado_emusys_bruto\s*=\s*'ausente'[\s\S]{0,240}'falta_confirmada'/i,
  );
});

test('a camada permanece sombra e restrita ao service role', () => {
  assert.match(migration, /security_invoker\s*=\s*true/i);
  assert.match(migration, /revoke\s+all[\s\S]*public[\s\S]*anon[\s\S]*authenticated/i);
  assert.match(migration, /grant\s+select[\s\S]*service_role/i);
  assert.doesNotMatch(migration, /\b(update|delete|truncate)\s+(from\s+)?public\.aluno_presenca/i);
});
