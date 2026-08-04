import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260804224500_pesquisa_evasao_subprojeto_c_d1.sql',
);
const edgePath = resolve(
  repoRoot,
  'supabase/functions/enviar-pesquisa-evasao/index.ts',
);
const tabPath = resolve(
  repoRoot,
  'src/components/App/SucessoCliente/PesquisaEvasaoTab.tsx',
);
const typesPath = resolve(
  repoRoot,
  'src/components/App/SucessoCliente/pesquisaEvasao.types.ts',
);

const read = (path) => readFileSync(path, 'utf8');

test('migration D+1 existe e calcula 10h BRT sem automatizar disparo', () => {
  assert.equal(existsSync(migrationPath), true, 'migration D+1 ausente');

  const sql = read(migrationPath);
  assert.match(sql, /pesquisa_evasao_elegivel_a_partir_v1/i);
  assert.match(sql, /interval\s+'1 day'/i);
  assert.match(sql, /time\s+'10:00'/i);
  assert.match(sql, /America\/Sao_Paulo/i);
  assert.match(sql, /listar_evadidos_para_pesquisa_v3/i);
  assert.match(sql, /aguardando_d1/i);

  assert.doesNotMatch(sql, /cron\.schedule|pg_net|net\.http|http_post/i);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.pesquisa_evasao/i);
  assert.doesNotMatch(sql, /update\s+public\.pesquisa_evasao\b/i);
});

test('D+1 endurece apenas novos envios produtivos e preserva modo teste', () => {
  const edge = read(edgePath);

  assert.match(edge, /async function exigirEvasaoElegivelParaEnvio/);
  assert.match(edge, /if\s*\(\s*modoTeste\s*\)\s*return/);
  assert.match(edge, /rpc\(\s*["']pode_enviar_pesquisa_evasao["']/);
  assert.match(edge, /throw\s+new\s+ErroHttp\(\s*409[\s\S]*?D\+1/i);
  assert.equal(
    (edge.match(/await exigirEvasaoElegivelParaEnvio\(/g) ?? []).length,
    2,
    'preview e confirmacao precisam repetir o gate D+1',
  );
});

test('fila usa read model v3 e mostra quando a movimentacao fica elegivel', () => {
  const tab = read(tabPath);
  const types = read(typesPath);

  assert.match(tab, /listar_evadidos_para_pesquisa_v3/);
  assert.match(tab, /Aguardando D\+1/);
  assert.match(tab, /elegivel_a_partir_em/);
  assert.match(types, /elegivel_a_partir_em:\s*string\s*\|\s*null/);
});
