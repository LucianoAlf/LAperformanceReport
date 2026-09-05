import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migrationPath = new URL(
  '../supabase/migrations/20260905113741_aviso_previo_fonte_confiavel.sql',
  import.meta.url,
);
const matriculaExataPath = new URL(
  '../supabase/migrations/20260905115806_aviso_previo_matricula_exata.sql',
  import.meta.url,
);

test('pendencias excluem matricula ja encerrada antes de consultar o Emusys', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.match(sql, /join\s+public\.alunos\s+a\s+on\s+a\.id\s*=\s*m\.aluno_id/i);
  assert.match(sql, /a\.status\s+in\s*\(\s*'ativo'\s*,\s*'aviso_previo'\s*\)/i);
  assert.match(sql, /jsonb_build_object\([\s\S]*?'emusys_aviso_previo_id'/i);
});

test('aba vencidos nao reapresenta veredito cancelado ou aluno ja encerrado', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.match(sql, /coalesce\(v\.situacao,\s*'nao_verificado'\)\s+in\s*\(\s*'cobrar'\s*,\s*'divergente'\s*,\s*'nao_verificado'\s*\)/i);
});

test('reparo de dados e estreito e auditavel', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  for (const id of [3116, 3187, 3489]) {
    assert.match(sql, new RegExp(`id\\s*=\\s*${id}\\b`, 'i'));
  }
  assert.match(sql, /anulado_por\s*=\s*'auditoria_aviso_previo_20260905'/i);
  assert.match(sql, /2026-10-01[\s\S]*?where\s+id\s*=\s*3786/i);
  assert.match(sql, /2026-09-14[\s\S]*?where\s+id\s*=\s*3717/i);
});

test('pendencia entrega a matricula exata ao veredito', () => {
  const sql = fs.readFileSync(matriculaExataPath, 'utf8');
  assert.match(sql, /m\.emusys_matricula_id/i);
  assert.match(sql, /'emusys_matricula_id'\s*,\s*e\.emusys_matricula_id/i);
  assert.match(sql, /revoke all on function public\.aviso_previo_pendencias\(uuid, date\) from authenticated/i);
  assert.match(sql, /grant execute on function public\.aviso_previo_pendencias\(uuid, date\) to service_role/i);
});
