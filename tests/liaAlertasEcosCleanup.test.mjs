import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const path = 'supabase/migrations/20260803133500_lia_alertas_ecos_admin_cleanup.sql';

test('limpeza mira somente os dois ecos confirmados e falha fechada', () => {
  const sql = fs.readFileSync(path, 'utf8');

  assert.match(sql, /3EB01E74F9436FFE432905/);
  assert.match(sql, /3EB0D39B4723961827A2A2/);
  assert.match(sql, /a9d1ad72-8621-429b-baf1-559e6850c0f9/);
  assert.match(sql, /if\s+v_admin_count\s*<>\s*2/i);
  assert.match(sql, /if\s+v_outbox_count\s*<>\s*2/i);
  assert.match(sql, /if\s+v_evasao_count\s*<>\s*0/i);
  assert.match(sql, /am\.conteudo\s+is\s+distinct\s+from\s+lap\.mensagem_renderizada/i);
  assert.match(sql, /lpe\.ambiente\s*=\s*'teste'/i);
  assert.match(sql, /lap\.caixa_id\s*=\s*3/i);
});

test('limpeza preserva conversa e recompõe metadados pela última mensagem restante', () => {
  const sql = fs.readFileSync(path, 'utf8');

  assert.doesNotMatch(sql, /delete\s+from\s+public\.admin_conversas/i);
  assert.match(sql, /delete\s+from\s+public\.admin_mensagens/i);
  assert.match(sql, /order\s+by\s+am\.created_at\s+desc/i);
  assert.match(sql, /ultima_mensagem_at\s*=\s*v_latest_at/i);
  assert.match(sql, /ultima_mensagem_preview\s*=\s*v_latest_preview/i);
  assert.doesNotMatch(sql, /nao_lidas\s*=/i);
});
