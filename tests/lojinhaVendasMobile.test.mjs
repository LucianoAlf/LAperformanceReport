// O carrinho do PDV no celular (LAPE-32).
//
// 🔴 O defeito que originou isto: no celular o painel do carrinho era o
// segundo item de um `grid-cols-1`, logo DEPOIS da grade de 12 produtos —
// ~1.200px a 390px. Tocar num produto mandava o que a pessoa acabou de
// escolher para fora da vista, e ela precisava rolar para descobrir se o
// toque tinha funcionado. Relato do Hugo em 25/09: "eu clico no item e eu
// nao vejo o modal, tenho que rolar para baixo para ver".
//
// O que este teste trava e' a SUBSTANCIA: uma fonte so' para o formulario de
// venda, o painel do desktop intocado, e a barra que da o recibo do toque.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const tela = readFileSync(join(RAIZ, 'src/components/App/Lojinha/TabVendas.tsx'), 'utf8');

test('🔴 o formulario de venda tem UMA fonte, lida pelas duas telas', () => {
  // Duas copias do carrinho dariam duas regras para o mesmo dinheiro — e o
  // desconto, o vendedor e a forma de pagamento poderiam divergir entre o
  // computador e o celular sem nada acusar.
  const declaracoes = tela.match(/const corpoCarrinho = \(/g) ?? [];
  assert.equal(declaracoes.length, 1, 'o corpo do carrinho deixou de ter fonte unica');

  const usos = tela.match(/\{corpoCarrinho\}/g) ?? [];
  assert.equal(usos.length, 2, 'o corpo do carrinho precisa servir ao painel do desktop E a folha');

  // O botao que fecha a venda existe uma vez so' no arquivo inteiro.
  const finalizar = tela.match(/Finalizar Venda \(R\$/g) ?? [];
  assert.equal(finalizar.length, 1, 'o botao de finalizar foi duplicado');
});

test('o painel do desktop continua sendo o de sempre, e so ele', () => {
  const iGuarda = tela.indexOf('{!ehCelular && (');
  const iPainel = tela.indexOf('rounded-xl flex flex-col h-fit sticky top-4');
  assert.ok(iGuarda > 0, 'a guarda do ramo desktop sumiu');
  assert.ok(iPainel > iGuarda, 'o painel lateral saiu de dentro do ramo desktop');

  // Nenhuma regra de celular pode ter vazado para o painel do computador.
  const painel = tela.slice(iGuarda, tela.indexOf('{corpoCarrinho}', iGuarda));
  assert.doesNotMatch(painel, /max-lg:|sticky bottom-0|FolhaMobile/);
});

test('🔴 a barra usa `sticky bottom-0`, NUNCA `fixed`', () => {
  // `fixed bottom-0` ficaria POR CIMA da barra de navegacao do shell, e
  // acertar isso exigiria conhecer a altura dela aqui dentro — uma segunda
  // verdade sobre o layout do shell, que muda sozinha quando o shell mudar.
  // `sticky bottom-0` para exatamente onde o <main> termina.
  // Medido a 390px: barra em 712→781px, navegacao comecando em 793px, nas
  // quatro posicoes de rolagem.
  const i = tela.indexOf('{ehCelular && carrinho.length > 0 && (');
  assert.ok(i > 0, 'a barra do carrinho sumiu');
  const barra = tela.slice(i, tela.indexOf('</div>\n        )}', i));
  assert.match(barra, /sticky bottom-0/);
  assert.doesNotMatch(barra, /\bfixed\b/, 'a barra voltou a ser `fixed` e cobre a navegacao');

  // A barra e' o RECIBO do toque: precisa dizer qual item entrou, senao ela
  // so' repete um total e nao responde "funcionou o que eu acabei de tocar?".
  assert.match(barra, /carrinho\[carrinho\.length - 1\]\.produto_nome/);
  // E precisa ser alvo de toque de verdade.
  assert.match(barra, /min-h-\[48px\]/);
});

test('a folha e a casca compartilhada, nao um modal proprio desta tela', () => {
  assert.match(tela, /import \{ FolhaMobile \} from '@\/mobile\/FolhaMobile'/);
  assert.doesNotMatch(
    tela,
    /<Dialog[\s\S]{0,200}Carrinho/,
    'o carrinho do celular ganhou um modal proprio em vez da folha padrao',
  );
});

test('🔴 a folha fecha quando a venda sai', () => {
  // Sem isto a folha fica aberta sobre um carrinho ja' vazio, e a tela diz
  // "0 itens" logo depois de a pessoa ter vendido — indistinguivel de falha.
  const i = tela.indexOf('// Limpar carrinho e dados');
  assert.ok(i > 0);
  const limpeza = tela.slice(i, i + 200);
  assert.match(limpeza, /setCarrinhoAberto\(false\)/);
});

test('a aba Vendas NAO entra em ABAS_PORTADAS', () => {
  // So' o PDV foi tratado; o Historico segue sendo a tabela do computador
  // virando cards pelo CSS do shell. Marcar a aba apagaria a faixa ambar de
  // quem ainda nao foi adaptado — o erro cometido com Alunos em 14/09.
  const abas = readFileSync(join(RAIZ, 'src/mobile/abasPortadas.ts'), 'utf8');
  assert.doesNotMatch(abas, /'vendas'/);
});
