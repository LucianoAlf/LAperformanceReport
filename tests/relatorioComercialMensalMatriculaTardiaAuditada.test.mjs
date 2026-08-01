import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  root,
  'supabase/migrations/20260801213000_retificar_barra_julho_matricula_tardia.sql',
);
const gerencial = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260801193000_relatorio_gerencial_canonico.sql'),
  'utf8',
);

test('gerencial usa o gerente vigente sem reescrever o fechamento mensal', () => {
  assert.match(
    gerencial,
    /'gerente'\s*,\s*coalesce\(\s*nullif\(v_unidade\.gerente_nome\s*,\s*''\)\s*,\s*v_admin#>>'\{unidade,gerente\}'\s*\)/i,
  );
});

test('retificacao tardia e allowlist auditada e nao reabre julho', () => {
  assert.equal(fs.existsSync(migrationPath), true, 'migration da matrícula tardia ausente');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /aplicar_retificacao_relatorio_comercial_matricula_tardia_v1/i);
  assert.match(sql, /p_aluno_id\s+bigint/i);
  assert.match(sql, /p_emusys_matricula_id\s+text/i);
  assert.match(sql, /p_data_matricula\s+date/i);
  assert.match(sql, /a\.created_at\s*>\s*v_snapshot\.capturado_em/i);
  assert.match(sql, /get_conciliacao_experimentais_v2/i);
  assert.match(sql, /fechamento_mensal_retificacoes/i);
  assert.match(sql, /fechamento_mensal_auditoria/i);
  assert.doesNotMatch(sql, /update\s+public\.fechamento_mensal_snapshots/i);

  assert.doesNotMatch(sql, /368d47f5-2d88-4475-bc14-ba084a9a348e/i);
  assert.doesNotMatch(sql, /95553e96-971b-4590-a6eb-0201d013c14d/i);
  assert.doesNotMatch(sql, /\b1893\b/);
  assert.match(sql, /upper\(btrim\(u\.codigo\)\)\s*=\s*'BARRA'/i);
  assert.match(sql, /upper\(btrim\(u\.nome\)\)\s*=\s*'BARRA'/i);
  assert.match(sql, /a\.emusys_matricula_id\s*=\s*'840'/i);
  assert.match(sql, /lower\(btrim\(a\.nome\)\)\s*=\s*lower\('Luíza P Caruso'\)/i);
  assert.match(sql, /'840'/);
  assert.match(sql, /date\s+'2026-07-31'/i);
  assert.match(sql, /136c1626f4c512e82b82138c395f585a5c3de7e10ad1269862176d7acd8d0458/i);

  assert.match(
    sql,
    /upper\(btrim\(u\.codigo\)\)\s*=\s*'REC'[\s\S]*upper\(btrim\(u\.nome\)\)\s*=\s*'RECREIO'[\s\S]*gerente_nome\s*=\s*'Clayton'[\s\S]*gerente_nome\s*=\s*'Fabiola\/Clayton'/i,
  );
});
