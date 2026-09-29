// Comissões da Lojinha no celular (LAPE-32, 29/09/2026).
//
// Recorte declarado: só as carteiras (saldo, Lalitas) e as ações sobre elas.
// Os cartões e o histórico da tela do computador são dados de exemplo
// escritos no código e ficaram fora do celular; o computador não mudou.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import esbuild from 'esbuild';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const le = (p) => readFileSync(join(RAIZ, p), 'utf8').replace(/\r\n/g, '\n');
const semComentarios = (f) => f.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const lib = await (async () => {
  const { outputFiles } = await esbuild.build({
    entryPoints: [join(RAIZ, 'src/lib/lojinhaComissoes.ts')],
    bundle: true,
    format: 'esm',
    write: false,
  });
  const arquivo = join(mkdtempSync(join(tmpdir(), 'comissoes-')), 'lojinhaComissoes.mjs');
  writeFileSync(arquivo, outputFiles[0].text);
  return import(pathToFileURL(arquivo).href);
})();

const { nomeDaCarteira, ordenarCarteiras, formatarSaldo } = lib;

test('o nome da carteira: apelido do farmer, nome do professor', () => {
  assert.equal(nomeDaCarteira({ tipo_titular: 'farmer', colaboradores: { apelido: 'Duda', nome: 'Maria Eduarda' } }), 'Duda');
  assert.equal(nomeDaCarteira({ tipo_titular: 'farmer', colaboradores: { apelido: null, nome: 'Arthur' } }), 'Arthur');
  assert.equal(nomeDaCarteira({ tipo_titular: 'professor', professores: { nome: 'Gabriel Leão' } }), 'Gabriel Leão');
});

test('🔴 a ordem é por nome — a consulta não pede ordem e o banco devolve como quiser', () => {
  const lista = ordenarCarteiras([
    { id: 2, tipo_titular: 'farmer', colaboradores: { apelido: 'Jhon' } },
    { id: 1, tipo_titular: 'farmer', colaboradores: { apelido: 'Gabi' } },
  ]);
  assert.deepEqual(lista.map((c) => c.id), [1, 2]);
});

test('saldo em reais, e texto numeric do banco vira número', () => {
  assert.equal(formatarSaldo('214.5').replace(/\s/g, ' '), 'R$ 214,50');
  assert.equal(formatarSaldo(null).replace(/\s/g, ' '), 'R$ 0,00');
});

const tab = le('src/components/App/Lojinha/TabComissoes.tsx');
const cel = le('src/mobile/telas/lojinha/ComissoesMobile.tsx');

test('a TabComissoes bifurca e os modais ficam FORA da bifurcação', () => {
  assert.match(tab, /\{ehCelular \? \(\s*<ComissoesMobile/);
  const iFim = tab.indexOf('{/* Modais */}');
  assert.ok(iFim > tab.indexOf('<ComissoesMobile'));
  assert.ok(iFim > tab.lastIndexOf('</>\n      )}'), 'os modais caíram para dentro de um ramo');
});

test('🔴 o celular não traz os números de exemplo do computador', () => {
  const c = semComentarios(cel);
  assert.doesNotMatch(c, /movimentacoesExemplo|comissoesExemplo|vendas este mês|totalComissoesMes/);
  assert.doesNotMatch(c, /supabase/, 'a tela do celular não busca nem escreve');
});

test('as ações são as do computador: farmer tem Histórico, professor tem Enviar Relatório', () => {
  assert.match(cel, /aberta\.tipo_titular === 'farmer' \? \(\s*<Acao onClick=\{agir\(onHistorico\)\}/);
  assert.match(cel, /<Acao onClick=\{agir\(onEnviarRelatorio\)\}/);
  assert.match(cel, /<Acao onClick=\{agir\(onUsarLoja\)\}/);
  assert.match(cel, /<Acao onClick=\{agir\(onSaque\)\}/);
  // E chegam aos MESMOS handlers do computador.
  for (const h of ['handleUsarLoja', 'handleSaque', 'handleHistorico', 'handleEnviarRelatorio']) {
    assert.match(tab, new RegExp(`=\\{${h}\\}`));
  }
});

test('🔴 a folha fecha antes de o modal abrir — nunca duas camadas', () => {
  assert.match(cel, /setAberta\(null\);\s*fn\(c\);/);
});

test('alvos de toque de 44px ou mais', () => {
  assert.match(cel, /<button[\s\S]{0,120}min-h-\[56px\]/);
  assert.equal((cel.match(/min-h-\[48px\]/g) ?? []).length, 2);
});

test('Configurações: os botões estreitos ganham largura só no celular', () => {
  const cfg = le('src/components/App/Lojinha/TabConfiguracoes.tsx');
  assert.match(cfg, /className="h-6 w-6 p-0 max-lg:w-11"/);
  assert.equal((cfg.match(/max-lg:min-w-\[44px\]/g) ?? []).length, 2);
});
