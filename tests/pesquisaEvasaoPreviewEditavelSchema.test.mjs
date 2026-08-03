import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath = new URL(
  '../supabase/migrations/20260803220000_pesquisa_evasao_preview_editavel.sql',
  import.meta.url,
);

function readMigration() {
  return readFileSync(migrationPath, 'utf8');
}

const previewColumns = [
  'mensagem_template_original',
  'mensagem_editada',
  'editado_por_usuario_id',
  'editado_por_auth_user_id',
  'editado_em',
  'payload_hash_original',
];

const pesquisaColumns = [
  'mensagem_template_original_snapshot',
  'mensagem_editada',
  'mensagem_editada_por_usuario_id',
  'mensagem_editada_por_auth_user_id',
  'mensagem_editada_em',
  'payload_hash_original_snapshot',
  'payload_hash_snapshot',
];

test('migration adiciona auditoria da previa e snapshots da pesquisa', () => {
  const sql = readMigration();

  for (const column of previewColumns) {
    assert.match(sql, new RegExp(`add\\s+column\\s+if\\s+not\\s+exists\\s+${column}\\b`, 'i'));
  }
  for (const column of pesquisaColumns) {
    assert.match(sql, new RegExp(`add\\s+column\\s+if\\s+not\\s+exists\\s+${column}\\b`, 'i'));
  }

  assert.match(sql, /mensagem_template_original\s*=\s*mensagem_renderizada/i);
  assert.match(sql, /payload_hash_original\s*=\s*payload_hash/i);
  assert.match(sql, /where\s+pe\.preview_id\s*=\s*pp\.id/i);
  assert.match(sql, /not\s+valid/i);
  assert.match(sql, /validate\s+constraint/i);
});

test('claim editavel e service-only, atomico e preserva o claim antigo', () => {
  const sql = readMigration();
  const signature = /claim_pesquisa_evasao_preview_editavel\s*\(\s*p_preview_id\s+uuid\s*,\s*p_auth_user_id\s+uuid\s*,\s*p_mensagem_final\s+text\s*,\s*p_payload_hash_final\s+text\s*\)/i;

  assert.match(sql, signature);
  assert.match(sql, /auth\.role\(\)\s+is\s+distinct\s+from\s+'service_role'/i);
  assert.match(sql, /for\s+update/i);
  assert.match(sql, /btrim\s*\(\s*p_mensagem_final\s*\)/i);
  assert.match(sql, /char_length\s*\(\s*p_mensagem_final\s*\)\s*>\s*2000/i);
  assert.match(sql, /PESQUISA_EVASAO_PREVIEW_TEXTO_DIVERGENTE/i);
  assert.match(sql, /errcode\s*=\s*'40001'/i);
  assert.match(sql, /with\s+claim\s+as\s+materialized/i);
  assert.match(sql, /claim_pesquisa_evasao_preview\s*\(/i);
  assert.doesNotMatch(sql, /drop\s+function[\s\S]*claim_pesquisa_evasao_preview\s*\(\s*uuid\s*,\s*uuid\s*\)/i);

  assert.match(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.claim_pesquisa_evasao_preview_editavel\s*\(\s*uuid\s*,\s*uuid\s*,\s*text\s*,\s*text\s*\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i,
  );
  assert.match(
    sql,
    /grant\s+execute\s+on\s+function\s+public\.claim_pesquisa_evasao_preview_editavel\s*\(\s*uuid\s*,\s*uuid\s*,\s*text\s*,\s*text\s*\)\s+to\s+service_role/i,
  );
});

test('migration e estritamente aditiva fora da auditoria de envio', () => {
  const sql = readMigration();

  assert.doesNotMatch(sql, /\bdrop\s+table\b/i);
  assert.doesNotMatch(sql, /\btruncate\b/i);
  assert.doesNotMatch(sql, /update\s+public\.pesquisa_evasao_(?:mensagens|transcricoes|analises)\b/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.pesquisa_evasao_(?:mensagens|transcricoes|analises)\b/i);
});
