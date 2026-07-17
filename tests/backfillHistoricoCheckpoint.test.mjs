import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const helperPath = path.resolve(
  'supabase/functions/_shared/checkpoint-historico-professor.mjs',
);
const collectorPath =
  'supabase/functions/backfill-historico-professor-emusys/index.ts';
const rebuildPath =
  'supabase/functions/reconstruir-periodos-professor/index.ts';
const cliPath = 'scripts/backfill-historico-professor-emusys.mjs';

async function carregarHelper() {
  if (!fs.existsSync(helperPath)) return null;
  return import(`${pathToFileURL(helperPath).href}?t=${Date.now()}`);
}

test('checkpoint temporal pausa somente depois de concluir a data de corte', async () => {
  const helper = await carregarHelper();
  assert.ok(helper, 'helper de checkpoint historico deve existir');

  assert.equal(
    helper.devePausarAposCheckpoint({
      status: 'executando',
      janela_inicio_atual: '2022-01-01',
      cursor_atual: null,
    }, '2021-12-31'),
    true,
  );
  assert.equal(
    helper.devePausarAposCheckpoint({
      status: 'executando',
      janela_inicio_atual: '2021-12-01',
      cursor_atual: 'cursor-opaco',
    }, '2021-12-31'),
    false,
  );
  assert.equal(
    helper.devePausarAposCheckpoint({
      status: 'executando',
      janela_inicio_atual: '2021-12-01',
      cursor_atual: null,
    }, '2021-12-31'),
    false,
  );
});

test('reconstrucao aceita concluido ou pausado com recorte integralmente coletado', async () => {
  const helper = await carregarHelper();
  assert.ok(helper, 'helper de checkpoint historico deve existir');

  const base = {
    unidade_id: 'unidade-1',
    data_inicio: '2018-01-01',
    data_fim: '2026-07-16',
  };

  assert.equal(helper.execucaoCobreRecorte({
    ...base,
    status: 'concluido',
    janela_inicio_atual: '2026-07-01',
    cursor_atual: null,
  }, {
    unidade_id: 'unidade-1',
    data_inicio: '2018-01-01',
    data_fim: '2026-07-16',
  }), true);

  assert.equal(helper.execucaoCobreRecorte({
    ...base,
    status: 'pausado',
    janela_inicio_atual: '2022-01-01',
    cursor_atual: null,
  }, {
    unidade_id: 'unidade-1',
    data_inicio: '2018-01-01',
    data_fim: '2021-12-31',
  }), true);

  assert.equal(helper.execucaoCobreRecorte({
    ...base,
    status: 'pausado',
    janela_inicio_atual: '2021-12-01',
    cursor_atual: 'cursor-opaco',
  }, {
    unidade_id: 'unidade-1',
    data_inicio: '2018-01-01',
    data_fim: '2021-12-31',
  }), false);

  assert.equal(helper.execucaoCobreRecorte({
    ...base,
    status: 'pausado',
    janela_inicio_atual: '2021-12-01',
    cursor_atual: null,
  }, {
    unidade_id: 'unidade-1',
    data_inicio: '2018-01-01',
    data_fim: '2021-12-31',
  }), false);
});

test('collector e reconstrutor usam o contrato compartilhado de checkpoint', () => {
  const collector = fs.readFileSync(collectorPath, 'utf8');
  const rebuild = fs.readFileSync(rebuildPath, 'utf8');
  const cli = fs.readFileSync(cliPath, 'utf8');

  assert.match(collector, /devePausarAposCheckpoint/);
  assert.match(collector, /pausar_apos_data/);
  assert.match(rebuild, /execucaoCobreRecorte/);
  assert.match(rebuild, /janela_inicio_atual/);
  assert.match(rebuild, /cursor_atual/);
  assert.match(cli, /--pausar-apos/);
  assert.match(cli, /pausar_apos_data/);
});
