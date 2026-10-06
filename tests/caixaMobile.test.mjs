// Caixa no celular (LAPE-32, 06/10/2026).
//
// Medido a 390px antes: 3.678px (4,4 telas), lista de lançamentos a 1.091px do
// topo e a tabela de 900px deixando valor, responsável, editar e excluir FORA
// da tela. Depois: 753px com 3 lançamentos, nada além da borda, nenhum alvo
// abaixo de 44px. Aprovado pelo Hugo em 06/10 ("sim").

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

const { linhaExtratoCaixa, destaqueDoCofre, rotuloDiaCaixa, valoresIniciaisDoMovimento } = await (async () => {
  const { outputFiles } = await esbuild.build({
    entryPoints: [join(RAIZ, 'src/lib/caixaMobile.ts')], bundle: true, format: 'esm', write: false,
  });
  const arq = join(mkdtempSync(join(tmpdir(), 'caixa-')), 'caixaMobile.mjs');
  writeFileSync(arq, outputFiles[0].text);
  return import(pathToFileURL(arq).href);
})();

const MOV = {
  id: 'm1', caixa_diario_id: 'c1', unidade_id: 'u1', data_movimento: '2026-10-06',
  ambiente: 'venda', tipo: 'entrada', forma_pagamento: 'pix', categoria: 'parcela',
  descricao: 'Parcela 2/12 10/2026 - Isabella', valor: 407, cartao_modalidade: null,
  cartao_parcelas: null, link_pagamento: null, responsavel: 'Mayra · via Sol',
  criado_por: null, created_at: '', updated_at: '',
};

test('linha de extrato: valor com sinal, sem rótulo "Venda" em toda linha', () => {
  const l = linhaExtratoCaixa(MOV, []);
  assert.equal(l.entrada, true);
  assert.match(l.valor, /^\+R\$\s?407,00$/);
  assert.doesNotMatch(l.detalhe, /Venda/, '"Venda" empurrava o responsável para fora');
  assert.match(l.detalhe, /^Pix · .+ · Mayra · via Sol$/);

  const saida = linhaExtratoCaixa({ ...MOV, tipo: 'saida', ambiente: 'cofre', forma_pagamento: 'dinheiro', responsavel: null }, []);
  assert.match(saida.valor, /^−R\$/);
  assert.match(saida.detalhe, /^Cofre · Dinheiro · /, 'a exceção (cofre) continua marcada');
  assert.doesNotMatch(saida.detalhe, /· $/);

  const cartao = linhaExtratoCaixa({ ...MOV, forma_pagamento: 'cartao', cartao_modalidade: 'credito', cartao_parcelas: 3 }, []);
  assert.match(cartao.detalhe, /^Cartão crédito 3x/);
});

test('🔴 destaque do cofre: "agora" só no caixa de hoje e aberto', () => {
  assert.equal(destaqueDoCofre({ fechado: false, ehHoje: true, previsto: 795.2, conferido: null }).rotulo, 'No cofre agora');
  assert.equal(destaqueDoCofre({ fechado: false, ehHoje: false, previsto: 795.2, conferido: null }).rotulo, 'Saldo previsto do cofre');
  const fechado = destaqueDoCofre({ fechado: true, ehHoje: false, previsto: 795.2, conferido: 795.2 });
  assert.equal(fechado.rotulo, 'Conferido no fechamento');
  assert.equal(fechado.nota, null, 'sem diferença, sem nota');
  const dif = destaqueDoCofre({ fechado: true, ehHoje: true, previsto: 800, conferido: 790 });
  assert.equal(dif.valor, 790);
  assert.match(dif.nota, /diferença −R\$\s?10,00/);
});

test('rótulo do dia não depende do fuso', () => {
  assert.equal(rotuloDiaCaixa('2026-10-06'), 'ter, 06/10');
  assert.equal(rotuloDiaCaixa('2026-10-05'), 'seg, 05/10');
});

test('🔴 a edição abre com os MESMOS valores no computador e no celular', () => {
  assert.deepEqual(Object.keys(valoresIniciaisDoMovimento(MOV)).sort(), [
    'ambiente', 'cartao_modalidade', 'cartao_parcelas', 'categoria', 'descricao',
    'forma_pagamento', 'link_pagamento', 'responsavel', 'tipo', 'valor',
  ]);
  const tabela = le('src/components/App/Administrativo/CaixaFinanceiro/CaixaMovimentacoesTable.tsx');
  assert.match(tabela, /initialValues=\{valoresIniciaisDoMovimento\(movimentoEditando\)\}/);
  assert.doesNotMatch(tabela, /ambiente: movimentoEditando\.ambiente/, 'voltou a cópia literal');
  const tab = le('src/components/App/Administrativo/CaixaFinanceiro/CaixaFinanceiroTab.tsx');
  assert.match(tab, /initialValues=\{valoresIniciaisDoMovimento\(mov\)\}/);
});

test('🔴 o celular abre os MESMOS blocos do computador, sem segunda versão', () => {
  const tab = semComentarios(le('src/components/App/Administrativo/CaixaFinanceiro/CaixaFinanceiroTab.tsx'));
  for (const b of ['blocoFaixaFechado', 'blocoMensagem', 'blocoEditarSaldo', 'blocoWhatsApp', 'blocoConferencia', 'blocoAbrir', 'blocoCarregando']) {
    assert.equal((tab.match(new RegExp(`const ${b} = `, 'g')) ?? []).length, 1, `${b} declarado uma vez`);
    assert.ok((tab.match(new RegExp(`\\b${b}\\b`, 'g')) ?? []).length >= 3, `${b} não chega aos dois ramos`);
  }
  assert.equal((tab.match(/<CaixaWhatsAppPreview\b/g) ?? []).length, 1);
  assert.equal((tab.match(/Conferencia final/g) ?? []).length, 1);
  // Formulário de lançar: um só, chamado sem argumento no computador e com `aoSalvar` no celular.
  assert.match(tab, /\{formularioNovo\(\)\}/);
  assert.match(tab, /lancar: formularioNovo/);
  // As mensagens de sucesso e erro moram num lugar só.
  assert.equal((tab.match(/'Movimentacao adicionada\.'/g) ?? []).length, 1);
  assert.equal((tab.match(/'Movimentacao excluida\.'/g) ?? []).length, 1);
  assert.equal((tab.match(/'Movimentacao atualizada\.'/g) ?? []).length, 1);

  for (const arq of ['CaixaMobile.tsx', 'HistoricoCaixaMobile.tsx']) {
    const m = semComentarios(le(`src/mobile/telas/caixa/${arq}`));
    assert.doesNotMatch(m, /supabase|\.rpc\(|\.from\(/, `${arq} não busca direto`);
  }
  const tela = semComentarios(le('src/mobile/telas/caixa/CaixaMobile.tsx'));
  assert.doesNotMatch(tela, /CaixaMovimentacaoForm|CaixaWhatsAppPreview|AlertDialog/, 'nenhum bloco do computador foi copiado');
  // O histórico usa a MESMA fonte do painel do computador.
  assert.match(le('src/mobile/telas/caixa/HistoricoCaixaMobile.tsx'), /useCaixaHistorico\(\{ unidadeId, excluirData: dataCaixaAtual, limite: 30 \}\)/);
});

test('🔴 excluir no celular pede um segundo toque', () => {
  const m = le('src/mobile/telas/caixa/CaixaMobile.tsx');
  assert.match(m, /if \(!confirmarExclusao\) return setConfirmarExclusao\(true\);\s*if \(await onExcluir\(selecionado\.id\)\) fechar\(\);/);
});

test('alvos de 44px no formulário só no celular; aba marcada como portada', () => {
  const f = le('src/components/App/Administrativo/CaixaFinanceiro/CaixaMovimentacaoForm.tsx');
  assert.match(f, /'rounded-md px-3 py-2 text-xs font-medium transition-colors max-lg:min-h-\[44px\]'/);
  assert.match(f, /text-\[11px\] text-slate-400 max-lg:min-h-\[44px\]">/);
  assert.match(le('src/mobile/abasPortadas.ts'), /'\/app\/administrativo': \[[^\]]*'caixa_financeiro'/);
  assert.doesNotMatch(le('src/mobile/abasPortadas.ts'), /'\/app\/administrativo': \[[^\]]*'caixa_entrada'/);
});
