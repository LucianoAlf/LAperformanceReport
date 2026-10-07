/**
 * Transferência para o Sonoramente (07/10/2026).
 *
 * Roda a função REAL (compilada do .ts com esbuild), não uma cópia — mesmo padrão de
 * tests/comunidadeWaContato.test.mjs. Trava também que a migration mantém as peças que
 * fazem a saída deixar de contar como evasão.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'sonoramente-'));
const saida = join(dir, 'sonoramente.mjs');
execFileSync('npx', ['esbuild', 'src/lib/sonoramente.ts', '--format=esm', `--outfile=${saida}`], {
  stdio: 'pipe', shell: process.platform === 'win32',
});
const lib = await import(pathToFileURL(saida).href);
rmSync(dir, { recursive: true, force: true });

test('reconhece o destino Sonoramente sem depender de caixa/espaço', () => {
  assert.equal(lib.isDestinoSonoramente('sonoramente'), true);
  assert.equal(lib.isDestinoSonoramente(' Sonoramente '), true);
  assert.equal(lib.isDestinoSonoramente(null), false);
  assert.equal(lib.isDestinoSonoramente(''), false);
  assert.equal(lib.isDestinoSonoramente('barra'), false);
});

test('indexa só transferências para o Sonoramente e guarda a data mais recente', () => {
  const mapa = lib.indexarTransferenciasSonoramente([
    { aluno_id: 10, data_transferencia: '2026-10-01', destino_externo: 'sonoramente' },
    { aluno_id: 10, data_transferencia: '2026-10-05', destino_externo: 'sonoramente' },
    { aluno_id: 11, data_transferencia: '2026-10-02', destino_externo: null }, // entre unidades
    { aluno_id: '12', data_transferencia: '2026-10-03', destino_externo: 'sonoramente' },
    { aluno_id: null, data_transferencia: '2026-10-03', destino_externo: 'sonoramente' },
  ]);
  assert.equal(mapa.get(10), '2026-10-05');
  assert.equal(mapa.has(11), false);
  assert.equal(mapa.get(12), '2026-10-03');
  assert.equal(mapa.size, 2);
});

test('lista vazia ou nula não quebra', () => {
  assert.equal(lib.indexarTransferenciasSonoramente(null).size, 0);
  assert.equal(lib.indexarTransferenciasSonoramente([]).size, 0);
});

test('migration mantém as peças que tiram a transferência da conta de evasão', () => {
  const sql = readFileSync('supabase/migrations/20261007150000_transferencia_sonoramente.sql', 'utf8');
  // KPI ao vivo, fechamento e helper por id (pesquisa de evasão, score do professor).
  assert.match(sql, /get_kpis_alunos_canonicos_base_p01q/);
  assert.match(sql, /recalcular_dados_mensais_unguarded/);
  assert.match(sql, /is_movimentacao_admin_retencao_valida/);
  // Guarda de âncora: replace que não acha o trecho tem de abortar, não seguir calado.
  assert.match(sql, /ancora esperava 1 ocorrencia/);
  // Evasão que chega depois do registro também é marcada.
  assert.match(sql, /trg_marcar_evasao_transferida_sonoramente/);
  // O gatilho NÃO reage a tipo_evasao, senão ninguém conseguiria desfazer a marcação.
  assert.doesNotMatch(sql, /update of tipo, aluno_id, data, unidade_id, tipo_evasao/);
  // A RPC do botão não fica exposta para anon.
  assert.match(sql, /registrar_transferencia_sonoramente_v1\(bigint, date, text\) from public, anon/);
});
