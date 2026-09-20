import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const diretorioMigrations = 'supabase/migrations';

function lerMigrationCanonica() {
  const nome = fs.readdirSync(diretorioMigrations)
    .find((arquivo) => /_agenda_experimental_vinculo_canonico\.sql$/.test(arquivo));

  assert.ok(nome, 'migration agenda_experimental_vinculo_canonico deve existir');
  return fs.readFileSync(path.join(diretorioMigrations, nome), 'utf8');
}

test('a chamada usa somente o vinculo ativo entre a experimental e a aula fisica', () => {
  const sql = lerMigrationCanonica();
  const inicioView = sql.indexOf('CREATE OR REPLACE VIEW public.vw_experimental_aula_canonica');
  assert.ok(inicioView >= 0, 'a migration deve recriar a view canônica da Agenda');
  const view = sql.slice(inicioView);

  assert.match(view, /from\s+public\.lead_experimental_aulas\s+lea/i);
  assert.match(view, /lea\.aula_local_id\s+is\s+not\s+null/i);
  assert.match(view, /lea\.substituido_em\s+is\s+null/i);
  assert.match(view, /lea\.cancelado_em\s+is\s+null/i);
  assert.match(view, /lea\.estado\s*<>\s*'cancelado'/i);
  assert.match(view, /from\s+public\.aulas_emusys\s+ae/i);
  assert.match(view, /join\s+aulas\s+ae\s+on\s+ae\.aula_local_id\s*=\s*lea\.aula_local_id/i);
  assert.match(view, /join\s+public\.lead_experimentais\s+le\s+on\s+le\.id\s*=\s*lea\.lead_experimental_id/i);
  assert.match(view, /row_number\(\)\s+over\s*\(/i);
  assert.match(view, /not exists\s*\(\s*select 1\s+from\s+vinculos_ativos/i);
  assert.doesNotMatch(view, /(?:insert|update|delete)\s+into\s+public\.(?:aluno_presenca|lead_experimentais)/i);
});
