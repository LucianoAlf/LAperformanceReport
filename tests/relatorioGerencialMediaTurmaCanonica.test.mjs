import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  root,
  'supabase/migrations/20260811180149_relatorio_gerencial_media_turma_canonica.sql',
);

test('ranking mensal de media_turma usa o KPI canonico de turmas', () => {
  assert.equal(fs.existsSync(migrationPath), true, 'migration de media_turma canonica ausente');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(
    sql,
    /get_kpis_turmas_canonicos_v2\s*\(/i,
    'o ranking precisa consultar a cadeia canonica de turmas',
  );
  assert.match(
    sql,
    /media_turma[\s\S]{0,1200}get_kpis_turmas_canonicos_v2/i,
    'media_turma deve ser montada a partir do resultado canonico de turmas',
  );
  assert.match(
    sql,
    /jsonb_set\([\s\S]{0,500}\{media_turma\}[\s\S]{0,500}v_media/i,
    'o bloco media_turma canonico precisa substituir o bloco derivado do snapshot',
  );
});
