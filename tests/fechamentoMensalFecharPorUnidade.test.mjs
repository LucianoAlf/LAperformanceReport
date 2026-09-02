import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migracao = path.join(
  root,
  'supabase/migrations/20260902120500_fechar_competencia_mensal_canonica_v2.sql',
);
const sql = () => fs.readFileSync(migracao, 'utf8');

test('a migration existe', () => {
  assert.ok(fs.existsSync(migracao));
});

test('o update de snapshots filtra escopo E unidade', () => {
  const corpo = sql();
  const update = corpo.slice(corpo.search(/update\s+public\.fechamento_mensal_snapshots/iu));
  assert.match(update, /escopo\s*=\s*'unidade'/u,
    'sem filtro de escopo, fechar uma unidade carimba os 11 snapshots consolidados');
  assert.match(update, /unidade_id\s*=\s*p_unidade_id/u);
});

test('exige os 6 dominios da unidade', () => {
  const corpo = sql();
  for (const dominio of [
    'alunos_admin', 'alunos_executivo', 'comercial',
    'relatorio_gerencial', 'relatorio_admin_mensal', 'relatorio_comercial_mensal',
  ]) {
    assert.ok(corpo.includes(dominio), `dominio ausente: ${dominio}`);
  }
});

test('nao altera a v1', () => {
  const corpo = sql();
  assert.doesNotMatch(
    corpo,
    /(create\s+or\s+replace|drop)\s+function\s+public\.fechar_competencia_mensal_canonica_v1/isu,
    'a v1 tem consumidores e deve ficar intacta',
  );
});

test('revoga execute de anon nominalmente', () => {
  assert.match(
    sql(),
    /revoke\s+execute\s+on\s+function\s+public\.fechar_competencia_mensal_canonica_v2[^;]*from[^;]*anon/isu,
  );
});
