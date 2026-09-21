import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const le = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const drawer = le('../src/components/App/Agenda/AgendaDrawer.tsx');
const page = le('../src/components/App/Agenda/AgendaPage.tsx');

test('tocar numa aula abre o detalhe no celular', () => {
  // 🔴 Nao abria NADA: o painel de detalhe so era montado no ramo do desktop,
  // entao as 158 linhas da lista eram botoes mudos — a pessoa toca, nada
  // acontece, e conclui que o aplicativo travou.
  const ramoMobile = page.match(/<AgendaMobile[\s\S]*?<\/Suspense>/u);
  assert.ok(ramoMobile, 'o ramo mobile da AgendaPage sumiu');
  assert.match(ramoMobile[0], /<AgendaDrawer/u, 'o ramo mobile precisa montar o detalhe da aula');
  assert.match(ramoMobile[0], /variante="folha"/u);
});

test('o CONTEUDO do detalhe e um so — o celular troca a casca, nao a resposta', () => {
  // Sao ~400 linhas decidindo o que se mostra de uma aula: presenca canonica,
  // risco e seu frescor, progresso no contrato, turma, leads da experimental.
  // Uma copia em src/mobile/ seria a segunda versao da mesma resposta — o
  // padrao que gerou as duplicatas de renovacao.
  const arquivosMobile = readdirSync(new URL('../src/mobile/telas/agenda', import.meta.url));
  for (const nome of arquivosMobile) {
    const fonte = le(`../src/mobile/telas/agenda/${nome}`);
    assert.doesNotMatch(
      fonte,
      /Progresso no contrato|adaptarPresencaCanonica|riscoDesatualizado/u,
      `${nome} reimplementou o detalhe da aula em vez de reusar o AgendaDrawer`,
    );
  }
  // E o conteudo mora numa variavel unica, servida pelas duas cascas.
  assert.match(drawer, /const conteudo = \(/u);
});

test('o padrao continua sendo o painel de 296px do desktop', () => {
  // A prop e opcional e o desktop nao a passa: quem ja usava o componente nao
  // muda de comportamento por causa da casca nova.
  assert.match(drawer, /variante = 'painel'/u, 'o default precisa preservar o desktop');
  assert.match(drawer, /w-\[296px\]/u);
  const usoDesktop = page.match(/<AgendaTimeline[\s\S]*?<\/div>\s*\)\}/u);
  assert.ok(usoDesktop, 'nao achei o ramo do desktop');
  assert.doesNotMatch(usoDesktop[0], /variante=/u, 'o desktop nao declara variante — fica no padrao');
});

test('a folha tem saida por toque fora e rola por dentro', () => {
  const folha = drawer.match(/if \(variante === 'folha'\) \{[\s\S]*?\n  \}/u);
  assert.ok(folha, 'a casca de folha sumiu');
  assert.match(folha[0], /role="dialog"/u);
  assert.match(folha[0], /aria-modal="true"/u);
  assert.match(folha[0], /aria-label="Fechar detalhe da aula"/u, 'falta o scrim que fecha');
  // ⚠️ Aqui a rolagem interna E necessaria: ao contrario do painel, a folha
  // nao herda a altura de uma grade irma — ela tem teto e o conteudo de uma
  // turma cheia passa dele.
  assert.match(folha[0], /overflow-y-auto/u);
  assert.match(folha[0], /max-h-\[88%\]/u);
  // Barra de gestos do telefone: sem isto o fim do conteudo fica embaixo dela.
  assert.match(folha[0], /safe-area-inset-bottom/u);
});
