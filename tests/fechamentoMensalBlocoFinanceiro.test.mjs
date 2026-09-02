import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migracao = path.join(
  root,
  'supabase/migrations/20260902120000_garantir_bloco_financeiro_gerencial.sql',
);

test('a migration do bloco financeiro existe', () => {
  assert.ok(fs.existsSync(migracao), 'migration nao encontrada');
});

test('grava o bloco na forma canonica kpis_gestao[0]', () => {
  const sql = fs.readFileSync(migracao, 'utf8');
  assert.match(sql, /kpis_gestao,0,financeiro_faturas_emusys/u);
});

test('preserva capturado_em da versao anterior', () => {
  const sql = fs.readFileSync(migracao, 'utf8');
  assert.match(
    sql,
    /v_snapshot\.capturado_em/u,
    'capturado_em da nova versao tem de vir da versao anterior — e o corte '
      + '(a.created_at <= capturado_em) que a lista do relatorio usa',
  );
});

test('e fail-closed quando a fonte financeira nao tem dados', () => {
  const sql = fs.readFileSync(migracao, 'utf8');
  assert.match(sql, /fonte_indisponivel/u);
  assert.match(sql, /tem_dados/u);
});

test('nunca sobrescreve bloco ja existente', () => {
  const sql = fs.readFileSync(migracao, 'utf8');
  assert.match(sql, /ja_presente/u);
});

test('revoga execute de anon nominalmente', () => {
  const sql = fs.readFileSync(migracao, 'utf8');
  assert.match(
    sql,
    /revoke\s+execute\s+on\s+function\s+public\.garantir_bloco_financeiro_gerencial_v1[^;]*from[^;]*anon/isu,
    'ALTER DEFAULT PRIVILEGES concede execute a anon — revoke precisa ser nominal',
  );
});
