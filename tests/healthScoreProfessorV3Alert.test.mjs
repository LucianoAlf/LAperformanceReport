import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..\\', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('alerta de falha do Health Score usa a configuracao e a execucao auditada', async () => {
  const edge = await read('supabase/functions/projeto-alertas-whatsapp/index.ts');

  assert.match(edge, /health_score_professor_v3_falha/i);
  assert.match(edge, /health_score_professor_v3_materializacao_execucoes/i);
  assert.match(edge, /execution_id/i);
  assert.match(edge, /getConfig\('health_score_professor_v3_falha'\)/i);
});

test('cron usa endpoint autenticado e destinatarios exatos, nunca heuristica ampla', async () => {
  const sql = await read('supabase/migrations/20260808193000_health_score_v3_cron_diario_idempotente.sql');

  assert.match(sql, /https:\/\/ouqwbbermlzqqvtqwlul\.supabase\.co\/functions\/v1\/projeto-alertas-whatsapp/i);
  assert.match(sql, /lower\(coalesce\(u\.nome,\s*''\)\)\s*=\s*'hugo'/i);
  assert.doesNotMatch(sql, /like\s+'%hugo%'/i);
});
