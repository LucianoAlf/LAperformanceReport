/**
 * Trava a regra que impede o defeito de 10/09/2026 voltar.
 *
 * A tela le `coalesce(data_prevista_saida, mes_saida - 1)`, mas o formulario
 * so editava `mes_saida`. Resultado medido: aviso da Perola Reis (CG) marcado
 * como vencido em 07/09 enquanto o Emusys ja dizia 14/09 — e nenhuma edicao
 * pela tela conseguia corrigir, porque o campo lido nao estava no formulario.
 *
 * Testa a funcao real (transpilada do TS), nao uma reimplementacao — a copia
 * passaria enquanto o app continua errado.
 */
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const lib = await (async () => {
  const { code } = await esbuild.transform(readFileSync('src/lib/avisoPrevioSaida.ts', 'utf8'), {
    loader: 'ts',
    format: 'esm',
  });
  const arquivo = path.join(mkdtempSync(path.join(tmpdir(), 'avp-')), 'avisoPrevioSaida.mjs');
  writeFileSync(arquivo, code, 'utf8');
  return import(pathToFileURL(arquivo).href);
})();

const { derivarSaidaAvisoPrevio, mesSaidaDaDataPrevista, fimDoAviso, paraISO } = lib;

test('a data prevista manda: o mes de saida e derivado dela', () => {
  const r = derivarSaidaAvisoPrevio('2026-09-14', '2026-10-01');
  assert.equal(r.data_prevista_saida, '2026-09-14');
  // O mes escolhido no select é IGNORADO quando ha data — senao os dois
  // divergem e a tela volta a mostrar o valor velho.
  assert.equal(r.mes_saida, '2026-09-01');
});

test('caso Perola: corrigir 07/09 para 14/09 muda o que a tela le', () => {
  const antes = derivarSaidaAvisoPrevio('2026-09-07', null);
  const depois = derivarSaidaAvisoPrevio('2026-09-14', null);
  assert.equal(fimDoAviso(antes.data_prevista_saida, antes.mes_saida), '2026-09-07');
  assert.equal(fimDoAviso(depois.data_prevista_saida, depois.mes_saida), '2026-09-14');
});

test('caso Andre: mexer so no mes com data preenchida nao muda o vencimento', () => {
  // Reproduz o audit_log de 03/09/2026: mes_saida out -> nov, data intacta.
  const soMes = derivarSaidaAvisoPrevio('2026-10-31', '2026-11-01');
  assert.equal(fimDoAviso(soMes.data_prevista_saida, soMes.mes_saida), '2026-10-31');
  // ... e o mes gravado acompanha a data, em vez de guardar novembro sozinho.
  assert.equal(soMes.mes_saida, '2026-10-01');
});

test('sem data prevista o select de mes continua mandando (aviso lancado a mao)', () => {
  const r = derivarSaidaAvisoPrevio(null, '2026-09-01');
  assert.equal(r.data_prevista_saida, null);
  assert.equal(r.mes_saida, '2026-09-01');
  // Espelha `mes_saida - 1` do SQL: ultimo dia do mes anterior, que a tela
  // marca com "~" de data estimada.
  assert.equal(fimDoAviso(null, '2026-09-01'), '2026-08-31');
});

test('fimDoAviso atravessa a virada de ano igual ao SQL', () => {
  assert.equal(fimDoAviso(null, '2026-01-01'), '2025-12-31');
});

test('data vazia ou malformada nao inventa mes', () => {
  assert.equal(mesSaidaDaDataPrevista(null), null);
  assert.equal(mesSaidaDaDataPrevista(''), null);
  assert.equal(mesSaidaDaDataPrevista('14/09/2026'), null);
});

test('paraISO usa o fuso local — toISOString voltaria um dia em BRT', () => {
  // Meia-noite em BRT vira 03:00 UTC do mesmo dia; o risco e o inverso:
  // 21h de 13/09 em BRT ja e 14/09 em UTC. Construimos a data local.
  assert.equal(paraISO(new Date(2026, 8, 14)), '2026-09-14');
  assert.equal(paraISO(new Date(2026, 0, 1)), '2026-01-01');
});
