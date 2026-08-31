import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const hook = readFileSync(
  new URL('../src/components/App/SucessoCliente/hooks/useRepescagemEvasao.ts', import.meta.url),
  'utf8',
);
const tela = readFileSync(
  new URL('../src/components/App/SucessoCliente/FilaFollowupEvasao.tsx', import.meta.url),
  'utf8',
);

test('hook usa as RPCs canonicas e le a fila direto da tabela', () => {
  assert.match(hook, /rpc\(\s*'enfileirar_repescagem_evasao'/);
  assert.match(hook, /rpc\(\s*'cancelar_repescagem_evasao'/);
  assert.match(hook, /from\(\s*'pesquisa_evasao_envios_fila'\s*\)/);
});

test('hook nao reimplementa elegibilidade no cliente', () => {
  // a decisao de quem pode ser repescado e do banco; o cliente so exibe o motivo
  assert.doesNotMatch(hook, /recusada_opt_out|resposta_status\s*!==/);
});

test('tela oferece repescar, repescar todos e cancelar', () => {
  assert.match(tela, /Reenviar/);
  assert.match(tela, /useRepescagemEvasao/);
  assert.match(tela, /cancelar/i);
});

test('item 6 do review: cancelamento legitimo (respondeu na espera / opt-out / ja enviada) nao aparece como falha vermelha', () => {
  // os 3 motivos precisam ter rotulo neutro proprio, distinto do vermelho de falha
  assert.match(tela, /respondeu_durante_a_espera/);
  assert.match(tela, /opt_out/);
  assert.match(tela, /ja_enviada/);
  assert.match(tela, /classeBadgeRepescagem/);
});

test('botao de reenvio fica desabilitado depois que a repescagem ja saiu', () => {
  const fonte = tela;

  // O botao individual vira "Reenviada" e nao clicavel.
  assert.match(fonte, /disabled=\{jaTeveRepescagem\}/);

  // ⚠️ So estado VIVO ou CONCLUIDO bloqueia. `cancelada` e `falhou` ficam de
  // fora: cancelar e desfazer, nao gastar o toque -- bloquear tirava a pessoa
  // da repescagem para sempre por um clique errado. A RPC casa com isto
  // (reativa a linha, porque o unique de (pesquisa_id, toque) impede criar
  // outra).
  assert.match(
    fonte,
    /REPESCAGEM_BLOQUEIA_REENVIO = new Set\(\['pendente', 'enviando', 'enviada'\]\)/,
  );
  assert.doesNotMatch(fonte, /'cancelada'.*REPESCAGEM_BLOQUEIA/);
  assert.match(fonte, /jaTeveRepescagem = REPESCAGEM_BLOQUEIA_REENVIO\.has\(/);
  assert.match(fonte, /jaTeveRepescagem \? 'Reenviada' : 'Reenviar'/);

  // O "Reenviar para todos" conta so quem ainda pode receber -- senao o numero
  // mente sobre quantas mensagens sairiam e a operadora clica para receber
  // recusa `ja_enfileirada`.
  //
  // ⚠️ A assercao e sobre a CONTAGEM, nao sobre a frase. O rotulo era "Reenviar
  // para todos" e virou "Reenviar os N desta pagina" quando a pagina caiu de 50
  // para 8: o botao SEMPRE alcancou so os ids carregados, e com 50 contra 35 casos
  // isso coincidia com "todos", entao o texto antigo passava por acaso. Travar a
  // copia fazia o teste reprovar justamente a correcao que tornou o rotulo honesto.
  assert.match(fonte, /\{pesquisaIdsElegiveis\.length\} desta página/);
  assert.doesNotMatch(fonte, /Reenviar[^\n]*\{itens\.length\}/);

  // ⚠️ Ordem obrigatoria: pesquisaIds e ENTRADA do hook, estadoPorPesquisa e
  // saida. Derivar a lista de elegiveis antes da chamada fecharia um ciclo e
  // leria a variavel antes da declaracao (ReferenceError em runtime).
  const posHook = fonte.indexOf('useRepescagemEvasao(pesquisaIds)');
  const posElegiveis = fonte.indexOf('const pesquisaIdsElegiveis');
  assert.ok(posHook > 0 && posElegiveis > posHook,
    'pesquisaIdsElegiveis precisa ser derivado DEPOIS de useRepescagemEvasao');
});

test('arquivo de encerradas: sem reenvio em massa, e cada linha diz por que terminou', () => {
  // Reenviar em massa a partir de um arquivo de casos encerrados nao faz sentido --
  // o botao existe so na aba de trabalho.
  assert.match(tela, /aba === 'em_aberto' && pesquisaIdsElegiveis\.length > 0/);

  // ⚠️ "Follow-up realizado" ao lado de "Concluida" le como arquivo errado, e a
  // duvida e legitima: os dois nao terminaram do mesmo jeito. Um fechou com
  // desfecho; o outro nunca teve resposta e por isso NAO PODE receber desfecho
  // (registrar desfecho exige analise, analise exige resposta). Sem esta linha a
  // aba parece estar misturando as duas coisas.
  assert.match(tela, /function motivoDoArquivamento/);
  for (const estado of ['concluida', 'followup_realizado', 'followup_dispensado', 'opt_out']) {
    assert.match(tela, new RegExp(`case '${estado}':`),
      `motivoDoArquivamento precisa explicar o estado ${estado}`);
  }
  assert.match(tela, /aba === 'encerradas' && motivoDoArquivamento\(/);
});

test('a paginacao precisa entrar em acao, e pagina vazia nao pode virar "nenhum caso"', () => {
  // Pagina de 50 contra uma fila de 35 casos deixava os controles presos em "1/1":
  // a paginacao existia e nunca funcionava. Qualquer valor que volte a passar do
  // tamanho da fila reintroduz a rolagem infinita.
  const hookFollowups = readFileSync(
    new URL('../src/components/App/SucessoCliente/hooks/useFollowupsEvasao.ts', import.meta.url),
    'utf8',
  );
  const tamanho = hookFollowups.match(/const TAMANHO_PAGINA = (\d+);/);
  assert.ok(tamanho, 'TAMANHO_PAGINA precisa ser uma constante literal');
  assert.ok(Number(tamanho[1]) <= 20,
    `TAMANHO_PAGINA=${tamanho[1]} volta a ser maior que a fila real e a paginacao deixa de existir`);

  // ⚠️ Com pagina pequena, agir no ultimo caso de uma pagina a faz deixar de
  // existir -- e a tela diria "Nenhum caso neste filtro" com dezenas de casos
  // vivos. Quem desempata e o contador do GRUPO, que nao passa pela paginacao.
  assert.match(tela, /itens\.length === 0 && pagina > 1 && totalDoGrupo > 0/);
});
