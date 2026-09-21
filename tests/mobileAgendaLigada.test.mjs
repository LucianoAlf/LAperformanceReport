import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { abaFoiPortada, rotaTemFaixaPorAba } from '../src/mobile/abasPortadas.ts';

const le = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const pagina = le('../src/components/App/Agenda/AgendaPage.tsx');
const tela = le('../src/mobile/telas/agenda/AgendaMobile.tsx');
const rotas = le('../src/mobile/rotasPortadas.ts');

test('professor, sala e chamada portadas — o calendario continua avisando', () => {
  // A chamada entrou na etapa 4 (a fila do que falta). O calendario segue
  // FORA de proposito: ele abre a tela do desktop, com a faixa ambar, e e o
  // que impede esta linha de virar 'a rota inteira esta pronta'.
  assert.equal(abaFoiPortada('/app/agenda', 'professor'), true);
  assert.equal(abaFoiPortada('/app/agenda', 'sala'), true);
  assert.equal(abaFoiPortada('/app/agenda', 'chamada'), true);
  assert.equal(abaFoiPortada('/app/agenda', 'calendario'), false);
});

test('a Agenda usa faixa POR ABA, e nao entra em ROTAS_PORTADAS', () => {
  assert.equal(rotaTemFaixaPorAba('/app/agenda'), true);
  // Entrar aqui apagaria a faixa de Chamada e Calendario de uma vez — o erro
  // de 14/09 com Alunos, revertido no mesmo dia.
  assert.doesNotMatch(rotas, /'\/app\/agenda'/);
});

test('a pagina decide pelo MESMO hook do shell', () => {
  assert.match(pagina, /import\s*\{\s*useShellMobile\s*\}\s*from\s*'@\/hooks\/useShellMobile'/);
  assert.match(pagina, /useShellMobile\(\)\s*===\s*'mobile'/);
  assert.doesNotMatch(pagina, /useIsMobile/, 'a pagina le a largura por conta propria');
});

test('o aviso aparece so nas visoes nao portadas', () => {
  assert.match(pagina, /ehCelular\s*&&\s*!abaFoiPortada\('\/app\/agenda',\s*visao\)/);
});

test('o ramo mobile vem ANTES de TODOS os curto-circuitos de vazio', () => {
  // 🔴 A versao anterior deste teste checava so 'Nenhuma aula neste dia' e
  // passava com a tela quebrada: ha DUAS mensagens de vazio, e a outra
  // ('Nenhuma aula corresponde ao filtro') vinha antes do ramo mobile. Com um
  // filtro que nao casava nada, a AgendaMobile nem renderizava — sumiam o
  // trilho de chips, as setas de dia e qualquer jeito de desfazer o filtro.
  // A tela ficava SEM SAIDA, com uma frase e mais nada. Relatado com print.
  const mobile = pagina.indexOf('<AgendaMobile');
  assert.ok(mobile > -1, 'AgendaMobile nao foi montada');

  for (const frase of ['Nenhuma aula corresponde ao filtro', 'Nenhuma aula neste dia']) {
    const pos = pagina.indexOf(frase);
    assert.ok(pos > -1, `nao achei a mensagem de vazio: ${frase}`);
    assert.ok(mobile < pos, `o ramo mobile precisa vir antes de "${frase}"`);
  }
});

test('no celular sempre ha como desfazer o filtro', () => {
  // O filtro que trava a tela pode ter vindo da busca ou da categoria,
  // herdadas do desktop — limpar so o professor nao destravaria.
  assert.match(tela, /onFiltrar\(FILTROS_AGENDA_VAZIOS\)/);
  assert.match(tela, /Limpar filtros/);
  // E o titulo nao pode assumir que o filtro e de professor: com professor
  // nulo, o template renderizava "null nao tem aula neste dia".
  assert.match(tela, /filtros\.professor !== null/);
});

test('a AgendaMobile entra por lazy — o desktop nao paga o bundle dela', () => {
  assert.match(pagina, /lazy\(\(\)\s*=>\s*import\('@\/mobile\/telas\/agenda\/AgendaMobile'\)\)/);
});

test('o desktop continua recebendo a AgendaTimeline intacta', () => {
  assert.match(pagina, /<AgendaTimeline/);
  assert.match(pagina, /agruparPor=\{agruparPor\}/);
});

test('no celular a barra de comando do desktop NAO renderiza', () => {
  // Ela duplicava duas coisas que a AgendaMobile ja faz: a navegacao de dia
  // (la com arrasto) e o filtro de professor (la como trilho de chips). Alem
  // disso o segmented de 4 opcoes e a busca de 224px fixos nao cabem em 375px.
  assert.match(
    pagina,
    /\{!ehCelular && \(\s*<header/,
    'o <header> da barra de comando precisa estar atras de !ehCelular',
  );
});

test('os 7 KPI cards nao renderizam no celular', () => {
  // Empilhados num telefone, empurravam a primeira aula para depois de ~3
  // telas de rolagem — numa tela cuja pergunta e "o que esta acontecendo
  // agora". Continuam inteiros no desktop.
  assert.match(pagina, /\{!ehCalendario && !ehCelular && \(/);
});

test('a visao e escolhida por folha no celular — mesmo gesto do periodo', () => {
  assert.match(pagina, /<SeletorSecaoMobile/);
  assert.match(pagina, /rotuloAtual=\{ROTULO_VISAO\[visao\]\}/);
  // A folha fecha por delegacao, procurando [role="tab"] no alvo do clique
  // (SeletorSecaoMobile). Sem o papel, escolher a visao deixaria a folha
  // aberta por cima da agenda.
  assert.match(pagina, /role="tab"/, 'os gatilhos da folha precisam de role="tab"');
});

test('os rotulos das visoes tem FONTE UNICA', () => {
  assert.match(pagina, /const ROTULO_VISAO/);
  // O trilho do desktop e a folha do celular nao podem chamar a mesma visao
  // por nomes diferentes. Os literais sairam do <Grupo>.
  assert.doesNotMatch(
    pagina,
    /rotulo: 'Professores'/,
    'o trilho do desktop voltou a ter rotulo literal em vez de ler ROTULO_VISAO',
  );
});

test('o resumo do celular so mostra o que e acionavel, e so quando ha o que dizer', () => {
  // Numero zerado nao ocupa espaco: "0 sem destino" e ruido numa faixa de uma
  // linha so.
  assert.match(pagina, /agora\.aulas > 0 &&/);
  assert.match(pagina, /\(pendenciasChamada \?\? 0\) > 0 &&/);
  assert.match(pagina, /emRisco > 0 &&/);
});
