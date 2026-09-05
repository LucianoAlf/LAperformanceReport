import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260905180228_saida_emusys_canonica_por_matricula.sql', import.meta.url),
  'utf8',
);
const processar = readFileSync(
  new URL('../supabase/functions/processar-matricula-emusys/index.ts', import.meta.url),
  'utf8',
);
const sync = readFileSync(
  new URL('../supabase/functions/sync-matriculas-emusys/index.ts', import.meta.url),
  'utf8',
);

test('movimentacao registra origem e identidade externa sem misturar unidades', () => {
  assert.match(migration, /add\s+column\s+if\s+not\s+exists\s+origem_registro\s+text/i);
  assert.match(migration, /default\s+'manual'/i);
  assert.match(
    migration,
    /unidade_id\s*=\s*p_unidade_id[\s\S]{0,500}emusys_matricula_id\s*=\s*btrim\(p_emusys_matricula_id\)/i,
  );
  assert.match(processar, /origem_registro:\s*'webhook_emusys'/);
  assert.match(processar, /emusys_matricula_id:\s*p\.matriculaIdEmusys\s*\?\?\s*null/);
});

test('finalizacao posterior supersede apenas a mesma saida automatica recente', () => {
  assert.match(migration, /registrar_saida_automatica_emusys_v1/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /origem_registro\s*=\s*'webhook_emusys'/i);
  assert.match(migration, /p_data\s*-\s*60/i);
  assert.match(migration, /m\.tipo\s+in\s*\(\s*'evasao'\s*,\s*'nao_renovacao'\s*\)/i);
  assert.match(migration, /anulado\s*=\s*true/i);
  assert.match(migration, /evento_anterior_substituido/i);
  assert.match(processar, /registrar_saida_automatica_emusys_v1/);
  assert.match(processar, /evento_antigo_ignorado/);
});

test('matricula ativa so desfaz saida comprovadamente automatica e deixa auditoria', () => {
  assert.match(migration, /reconciliar_saida_automatica_cancelada_v1/i);
  assert.match(migration, /status[\s\S]{0,100}'ativa'/i);
  assert.match(migration, /v_aluno\.status\s+not\s+in\s*\(\s*'evadido'\s*,\s*'inativo'\s*\)/i);
  assert.match(migration, /a\.data_saida\s*=\s*m\.data/i);
  assert.match(migration, /update\s+public\.alunos_historico/i);
  assert.match(migration, /insert\s+into\s+public\.automacao_log/i);
  assert.match(migration, /grant\s+execute[\s\S]+service_role/i);
  assert.match(sync, /reconciliarSaidasAutomaticasCanceladas/);
  assert.match(sync, /reconciliar_saida_automatica_cancelada_v1/);
  assert.match(processar, /reconciliarSaidaAutomaticaCanceladaWebhook/);
});

test('saida manual nunca entra na compensacao automatica', () => {
  const block = migration.match(
    /create\s+or\s+replace\s+function\s+public\.reconciliar_saida_automatica_cancelada_v1[\s\S]*?\n\$function\$;/i,
  )?.[0] ?? '';
  assert.match(block, /origem_registro\s*=\s*'webhook_emusys'/i);
  assert.doesNotMatch(block, /or\s+m\.origem_registro\s*=\s*'manual'/i);
});
