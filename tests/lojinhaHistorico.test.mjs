// Histórico de Vendas da Lojinha — computador e celular (LAPE-32, 29/09/2026).
//
// 🔴 O defeito: o histórico lia só `loja_vendas` (o "Novo Pedido", parado
// desde 20/05) e as vendas reais — lançadas pela Sol no caixa — nunca
// apareciam. De quebra, mostrava as três unidades, a busca não buscava, o
// cartão do mês dizia "Fev/2026" fixo e "hoje" era em UTC.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import esbuild from 'esbuild';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const le = (p) => readFileSync(join(RAIZ, p), 'utf8').replace(/\r\n/g, '\n');

const lib = await (async () => {
  const { outputFiles } = await esbuild.build({
    entryPoints: [join(RAIZ, 'src/lib/lojinhaHistorico.ts')],
    bundle: true,
    format: 'esm',
    write: false,
  });
  const arquivo = join(mkdtempSync(join(tmpdir(), 'historico-')), 'lojinhaHistorico.mjs');
  writeFileSync(arquivo, outputFiles[0].text);
  return import(pathToFileURL(arquivo).href);
})();

const { juntarHistorico, filtrarHistorico, resumirHistorico, inicioDaJanela, diaBrt, limparDescricaoCaixa } = lib;

const pdv = (id, data_venda, total, extra = {}) => ({
  id, data_venda, total, status: 'concluida', forma_pagamento: 'pix', tipo_cliente: 'aluno',
  cliente_nome: null, alunos: { nome: `Aluno ${id}` }, loja_vendas_itens: [{ quantidade: 1, produto_nome: 'Palheta' }],
  ...extra,
});
const caixa = (id, data_movimento, valor, descricao = 'Lojinha/Venda - Baqueta - Fulano') => ({
  id, data_movimento, created_at: `${data_movimento}T15:00:00Z`, forma_pagamento: 'cartao', descricao, valor: String(valor), responsavel: 'Arthur · via Sol',
});

test('🔴 as vendas do caixa entram no histórico, junto das do PDV', () => {
  const h = juntarHistorico([pdv(1, '2026-05-20T15:00:00Z', 40)], [caixa('a', '2026-09-28', 80)]);
  assert.equal(h.length, 2);
  assert.deepEqual(h.map((v) => v.origem), ['caixa', 'pdv'], 'mais recente primeiro');
  const c = h[0];
  assert.equal(c.total, 80, 'valor do caixa vem como texto numeric e tem de virar número');
  assert.equal(c.cliente, null, 'o caixa não separa cliente — não se inventa um');
  assert.equal(c.detalhe, 'Baqueta - Fulano');
  assert.equal(c.vendaPdv, null, 'venda do caixa não abre o modal do PDV');
  assert.ok(h[1].vendaPdv, 'venda do PDV continua abrindo detalhes/estorno');
});

test('a descrição do caixa perde o prefixo repetido e a etiqueta do backfill', () => {
  assert.equal(limparDescricaoCaixa('Lojinha/Venda - Livro - Miguel'), 'Livro - Miguel');
  assert.equal(limparDescricaoCaixa('Lojinha - capotraste [pix:95ead4fa]'), 'capotraste');
  assert.equal(limparDescricaoCaixa('Venda no controle de estoque. Produto: X'), 'Venda no controle de estoque. Produto: X');
});

test('🔴 a busca filtra — por produto, cliente e vendedor', () => {
  const h = juntarHistorico([pdv(1, '2026-09-10T15:00:00Z', 40)], [caixa('a', '2026-09-28', 80, 'Lojinha - Correia - Ana')]);
  assert.equal(filtrarHistorico(h, 'correia').length, 1);
  assert.equal(filtrarHistorico(h, 'ALUNO 1').length, 1);
  assert.equal(filtrarHistorico(h, 'arthur').length, 1);
  assert.equal(filtrarHistorico(h, '   ').length, 2);
  assert.equal(filtrarHistorico(h, 'inexistente').length, 0);
});

test('🔴 "hoje" é o dia de Brasília, não o de UTC', () => {
  // 29/09 às 22h BRT = 30/09 01h UTC. Uma venda feita às 22h BRT é de HOJE.
  const agora = new Date('2026-09-30T01:00:00Z');
  const h = juntarHistorico([pdv(1, '2026-09-30T00:30:00Z', 50)], []);
  assert.equal(h[0].dia, '2026-09-29');
  const r = resumirHistorico(h, agora);
  assert.equal(r.hojeTotal, 50);
  assert.equal(r.hojeQtd, 1);
});

test('🔴 o cartão do mês diz o mês de verdade e soma só o mês; estornada não conta', () => {
  const agora = new Date('2026-09-29T15:00:00Z');
  const h = juntarHistorico(
    [pdv(1, '2026-09-10T15:00:00Z', 40), pdv(2, '2026-09-11T15:00:00Z', 999, { status: 'estornada' }), pdv(3, '2026-08-31T15:00:00Z', 100)],
    [caixa('a', '2026-09-28', 60)],
  );
  const r = resumirHistorico(h, agora);
  assert.equal(r.mesRotulo, 'Setembro/2026');
  assert.equal(r.mesTotal, 100);
  assert.equal(r.mesQtd, 2);
  assert.equal(r.ticketMedio, 50);
});

test('a janela começa no dia 1º de dois meses atrás, virando o ano certo', () => {
  assert.equal(inicioDaJanela(new Date('2026-09-29T15:00:00Z')), '2026-07-01');
  assert.equal(inicioDaJanela(new Date('2026-02-10T15:00:00Z')), '2025-12-01');
  assert.equal(diaBrt('2026-09-01T02:00:00Z'), '2026-08-31');
});

const tela = le('src/components/App/Lojinha/TabVendas.tsx');

test('🔴 a TabVendas lê o caixa, recorta pela unidade e não usa mais `limit(50)`', () => {
  assert.match(tela, /from\('caixa_movimentacoes'\)[\s\S]{0,400}\.eq\('categoria', 'lojinha'\)[\s\S]{0,80}\.eq\('tipo', 'entrada'\)[\s\S]{0,80}\.eq\('ambiente', 'venda'\)/);
  assert.match(tela, /vendasQuery = vendasQuery\.eq\('unidade_id', escopo\.unidadeId\)/);
  assert.match(tela, /caixaQuery = caixaQuery\.eq\('unidade_id', escopo\.unidadeId\)/);
  assert.doesNotMatch(tela, /\.limit\(50\)/);
  assert.match(tela, /if \(escopo\.tipo === 'aguardando'\)/, 'sem unidade não se consulta');
});

test('🔴 falha de leitura aparece na tela, não vira histórico vazio', () => {
  assert.match(tela, /import \{ toast \} from 'sonner'/);
  assert.match(tela, /if \(erroVendas\)[\s\S]{0,200}toast\.error/);
  assert.match(tela, /if \(erroCaixa\)[\s\S]{0,200}toast\.error/);
});

test('🔴 os cartões falsos saíram do computador', () => {
  // Sem os comentários: o que explica o defeito cita o texto antigo.
  const codigo = tela.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(codigo, /Fev\/2026/);
  assert.doesNotMatch(codigo, /Meta Lojinha Q1/);
  assert.doesNotMatch(codigo, /R\$ 3\.000/);
  assert.doesNotMatch(codigo, /toISOString\(\)\.split\('T'\)\[0\]/, '"hoje" em UTC voltou');
});

test('🔴 o "em estoque" do PDV é da unidade, numa consulta só', () => {
  assert.doesNotMatch(tela, /prods\.map\(async/);
  assert.match(tela, /estoqueQuery = estoqueQuery\.eq\('unidade_id', escopo\.unidadeId\)/);
});

test('computador e celular leem a MESMA lista montada pela lib', () => {
  assert.equal((tela.match(/juntarHistorico\(/g) ?? []).length, 1);
  assert.match(tela, /<HistoricoVendasMobile[\s\S]{0,200}vendas=\{historicoFiltrado\}/);
  assert.match(tela, /historicoFiltrado\.map\(\(venda\)/);
  // Os modais seguem fora da bifurcação — o celular abre o mesmo detalhe.
  const iModais = tela.indexOf('{/* Modais */}');
  assert.ok(iModais > tela.indexOf("subTab === 'historico' && !ehCelular"));
});

const mobile = le('src/mobile/telas/lojinha/HistoricoVendasMobile.tsx');

test('a tela do celular não busca nem escreve', () => {
  assert.doesNotMatch(mobile, /supabase/);
  assert.doesNotMatch(mobile, /from '@\/lib\/supabase'/);
});

test('alvos de toque do celular com 44px ou mais', () => {
  assert.match(mobile, /min-h-\[44px\][^"]*"\s*\/>|type="search"[\s\S]{0,200}min-h-\[44px\]/);
  assert.match(mobile, /<button[\s\S]{0,120}min-h-\[56px\]/);
  // As duas sub-abas (Novo Pedido / Histórico) também.
  assert.equal((tela.match(/max-lg:min-h-\[44px\] max-lg:flex-1/g) ?? []).length, 2);
});

test('venda do caixa não vira botão mudo', () => {
  assert.match(mobile, /if \(!venda\.vendaPdv\) \{\s*return <div/);
});
