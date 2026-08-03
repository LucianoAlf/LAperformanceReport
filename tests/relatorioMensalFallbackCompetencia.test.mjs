import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const edge = await readFile(
  new URL('../supabase/functions/relatorio-admin-whatsapp/index.ts', import.meta.url),
  'utf8',
);
const shared = await readFile(
  new URL('../supabase/functions/_shared/relatorios-mensais-canonicos.ts', import.meta.url),
  'utf8',
);

test('rotulo de competencia e exportado do shared', () => {
  assert.match(shared, /export function rotuloCompetencia\s*\(/);
});

test('409 de fechamento indisponivel carrega o motivo e o fallback', () => {
  assert.match(edge, /motivo:\s*'fechamento_indisponivel'/);
  assert.match(edge, /competencia_solicitada:/);
  assert.match(edge, /fallback:/);
});

test('fallback so considera snapshot fechado de unidade no dominio certo', () => {
  assert.match(edge, /relatorio_comercial_mensal/);
  assert.match(edge, /\.eq\('status',\s*'fechado'\)/);
  assert.match(edge, /\.eq\('escopo',\s*'unidade'\)/);
});

test('acesso negado continua 403 e sem fallback', () => {
  assert.match(edge, /status:\s*403/);
  assert.doesNotMatch(
    edge,
    /acessoNegado\s*\?\s*403\s*:\s*409/,
    'o ramo 403 deve sair antes do calculo de fallback',
  );
});

test('o relatorio diario do cron nao ganha fallback', () => {
  const cron = edge.slice(edge.indexOf("payload.modo === 'cron'"));
  assert.doesNotMatch(cron, /fechamento_indisponivel/);
});
