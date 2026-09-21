import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ABAS_PORTADAS, abaFoiPortada } from '../src/mobile/abasPortadas.ts';

const le = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const page = le('../src/components/App/Agenda/AgendaPage.tsx');

test('no celular a visao chamada renderiza a fila, nao a ChamadaView', () => {
  assert.match(page, /ehCelular && ehChamada \? \(/);
  assert.match(page, /<ChamadaMobile/);
  // E o ramo do desktop vem DEPOIS — senao ele vence e a fila nunca aparece.
  assert.ok(
    page.indexOf('ehCelular && ehChamada ?') < page.indexOf('      ) : ehChamada ? ('),
    'o ramo do desktop esta vencendo o do celular',
  );
});

test('🔴 a rota NAO entra em ROTAS_PORTADAS — so a aba', () => {
  // Marcar `/app/agenda` inteira apagaria a faixa ambar do Calendario junto,
  // que e o erro cometido com Alunos em 14/09 e revertido no mesmo dia:
  // quem abrisse veria MENOS sem nenhum sinal de que esta vendo menos.
  const rotas = le('../src/mobile/rotasPortadas.ts');
  assert.doesNotMatch(rotas, /\/app\/agenda/, 'a rota da agenda entrou em ROTAS_PORTADAS');
});

test('chamada esta portada; calendario continua com a faixa', () => {
  assert.equal(abaFoiPortada('/app/agenda', 'chamada'), true);
  assert.equal(abaFoiPortada('/app/agenda', 'calendario'), false);
  assert.deepEqual([...ABAS_PORTADAS['/app/agenda']].sort(), ['chamada', 'professor', 'sala']);
});

test('o seletor de visao aparece UMA vez na chamada', () => {
  // A tela o recebe como slot no cabecalho sticky. Deixa-lo tambem na faixa
  // solta daria dois seletores empilhados.
  assert.doesNotMatch(page, /ehCelular && \(ehChamada \|\| ehCalendario\)/);
  assert.match(page, /ehCelular && ehCalendario && <div>\{seletorVisaoMobile\}<\/div>/);
});

test('tocar numa aula abre o MESMO detalhe da Agenda', () => {
  // Uma segunda versao do detalhe aqui seria a segunda resposta para "o que se
  // sabe desta aula" — o padrao que gerou as duplicatas de renovacao.
  const trecho = page.slice(page.indexOf('<ChamadaMobile'), page.indexOf('      ) : ehChamada ? ('));
  assert.match(trecho, /onAbrirAula=\{setSelecionada\}/);
  assert.match(trecho, /variante="folha"/);
});
