import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { abaFoiPortada, rotaTemFaixaPorAba } from '../src/mobile/abasPortadas.ts';

const le = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const pagina = le('../src/components/App/Agenda/AgendaPage.tsx');
const rotas = le('../src/mobile/rotasPortadas.ts');

test('as visoes portadas sao professor e sala — chamada e calendario continuam avisando', () => {
  assert.equal(abaFoiPortada('/app/agenda', 'professor'), true);
  assert.equal(abaFoiPortada('/app/agenda', 'sala'), true);
  assert.equal(abaFoiPortada('/app/agenda', 'chamada'), false);
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

test('o ramo mobile vem ANTES do curto-circuito de dia vazio', () => {
  // Dia sem aula ainda precisa do palco para deslizar. Se o "Nenhuma aula
  // neste dia" vier antes, o arrasto morre justamente no domingo.
  const vazio = pagina.indexOf('Nenhuma aula neste dia');
  const mobile = pagina.indexOf('<AgendaMobile');
  assert.ok(mobile > -1, 'AgendaMobile nao foi montada');
  assert.ok(mobile < vazio, 'o ramo mobile precisa vir antes do curto-circuito de dia vazio');
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
