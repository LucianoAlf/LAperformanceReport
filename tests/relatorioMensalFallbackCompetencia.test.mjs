import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { competenciaFechadaAnterior } from '../supabase/functions/_shared/relatorios-mensais-canonicos.ts';

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

test('a edge usa a funcao pura em vez de recalcular a ordenacao inline', () => {
  assert.match(edge, /competenciaFechadaAnterior\(/);
});

test('so erro de ausencia de fechamento entra no ramo de fallback', () => {
  assert.match(edge, /RELATORIO_ADMIN_MENSAL_FECHADO_INVALIDO/);
  assert.match(edge, /RELATORIO_MENSAL_FECHADO_INDISPONIVEL/);
});

test('o erro da consulta de competencias fechadas nao e engolido', () => {
  assert.match(edge, /error:\s*fechadosError/);
  assert.match(edge, /console\.error\([^)]*fechadosError/);
});

// --- Testes comportamentais da regra de ordenacao (prova real contra a inversao) ---

test('pedir agosto com julho disponivel devolve julho', () => {
  assert.deepEqual(
    competenciaFechadaAnterior([{ ano: 2026, mes: 7 }], 2026, 8),
    { ano: 2026, mes: 7 },
  );
});

test('pedir junho sem nada anterior devolve null', () => {
  assert.equal(competenciaFechadaAnterior([], 2026, 6), null);
});

test('o fallback NUNCA avanca no tempo: junho com apenas julho devolve null', () => {
  assert.equal(competenciaFechadaAnterior([{ ano: 2026, mes: 7 }], 2026, 6), null);
});

test('o fallback nunca devolve a propria competencia pedida', () => {
  assert.equal(competenciaFechadaAnterior([{ ano: 2026, mes: 7 }], 2026, 7), null);
});

test('com varios meses devolve o mais recente estritamente anterior', () => {
  assert.deepEqual(
    competenciaFechadaAnterior(
      [
        { ano: 2025, mes: 12 },
        { ano: 2026, mes: 3 },
        { ano: 2026, mes: 8 },
        { ano: 2026, mes: 5 },
      ],
      2026,
      8,
    ),
    { ano: 2026, mes: 5 },
  );
});

test('atravessa a virada de ano', () => {
  assert.deepEqual(
    competenciaFechadaAnterior([{ ano: 2025, mes: 12 }], 2026, 1),
    { ano: 2025, mes: 12 },
  );
});

test('lista vazia ou nula devolve null', () => {
  assert.equal(competenciaFechadaAnterior([], 2026, 8), null);
  assert.equal(competenciaFechadaAnterior(null, 2026, 8), null);
});

test('modo manual de envio exige autenticacao', () => {
  const manual = edge.slice(edge.indexOf('=== MODO MANUAL'));
  const ateEnvio = manual.slice(0, manual.indexOf('// Modo teste'));

  assert.match(
    ateEnvio,
    /Authorization/,
    'o ramo que dispara WhatsApp precisa ler o header Authorization antes de enviar',
  );
  assert.match(
    ateEnvio,
    /getUser\(\)/,
    'o ramo manual precisa validar o usuario quando o bearer nao e a service_role',
  );
  assert.match(ateEnvio, /status:\s*401/);
});
