import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migracao = path.join(
  root,
  'supabase/migrations/20260902121000_fechamento_automatico_dia1.sql',
);
const sql = () => fs.readFileSync(migracao, 'utf8');

test('a migration existe', () => {
  assert.ok(fs.existsSync(migracao), 'migration da guarda de dia 1o nao encontrada');
});

test('a guarda passa a exigir o dia 1o, nao o ultimo dia do mes', () => {
  const corpo = sql();
  const funcao = corpo.slice(corpo.indexOf('create or replace function'));
  assert.match(
    funcao,
    /extract\s*\(\s*day\s+from\s+v_hoje_brt\s*\)[^;]*<>\s*1/u,
    'a guarda tem de recusar qualquer dia que nao seja o 1o',
  );
  assert.doesNotMatch(
    funcao,
    /v_ultimo_dia/u,
    'o corpo NOVO nao pode mais falar em ultimo dia — so o comentario de rollback pode',
  );
});

test('a competencia alvo e o mes anterior, em BRT', () => {
  const corpo = sql();
  const funcao = corpo.slice(corpo.indexOf('create or replace function'));
  assert.match(funcao, /date_trunc\s*\(\s*'month'[^)]*\)\s*-\s*interval\s+'1 month'/u);
  assert.match(funcao, /America\/Sao_Paulo/u, 'data de negocio e BRT, nunca UTC');
});

test('o corpo anterior fica no cabecalho, para rollback', () => {
  const corpo = sql();
  const cabecalho = corpo.slice(0, corpo.indexOf('create or replace function'));
  assert.match(cabecalho, /ROLLBACK/u);
  assert.match(
    cabecalho,
    /v_ultimo_dia/u,
    'o rollback precisa trazer a guarda de ultimo dia que esta sendo substituida',
  );
});
