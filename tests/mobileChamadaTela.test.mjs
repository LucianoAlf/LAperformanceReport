import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const le = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tela = le('../src/mobile/telas/agenda/ChamadaMobile.tsx');
const linha = le('../src/mobile/telas/agenda/LinhaPendencia.tsx');

/** Corta comentarios: um assert que proibe um simbolo nao pode reprovar o
 *  comentario que explica por que aquele simbolo nao esta la. */
const semComentarios = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

test('a tela nao consulta o banco — os dados chegam por props', () => {
  for (const [nome, fonte] of [['ChamadaMobile', tela], ['LinhaPendencia', linha]]) {
    assert.doesNotMatch(fonte, /from '@\/lib\/supabase'/, `${nome} importa o client`);
    assert.doesNotMatch(fonte, /supabase\.rpc\(/, `${nome} chama RPC direto`);
    assert.doesNotMatch(fonte, /useAgendaDia\(/, `${nome} monta o hook por conta propria`);
  }
});

test('🔴 nenhuma regra de presenca nasce no celular', () => {
  // A tela COMPOE o que ja existe. Reescrever "esta fechada?" aqui criaria uma
  // segunda resposta para a pergunta que o relatorio das 9h tambem faz, e as
  // duas passariam a discordar sobre quem esta devendo.
  assert.match(tela, /from '@\/lib\/chamadaFila'/);
  assert.match(tela, /montarFilaDaChamada\(/);
  for (const proibido of [
    'function chamadaCompleta(',
    'function alunoSemDestino(',
    'function estadoDoAluno(',
    'function adaptarPresencaProfessorCanonica(',
  ]) {
    for (const [nome, fonte] of [['ChamadaMobile', tela], ['LinhaPendencia', linha]]) {
      assert.ok(!semComentarios(fonte).includes(proibido), `${nome} reimplementou ${proibido}`);
    }
  }
});

test('a escrita reusa os hooks que o desktop ja usa', () => {
  // `useChamadaAcoes` (aluno) e `useProfessorPresenca` (professor) sao os dois
  // caminhos de escrita, e os dois sao agnosticos de layout.
  assert.match(tela, /useChamadaAcoes/);
  assert.match(tela, /useProfessorPresenca/);
  // E nao ha uma terceira porta: quem escreve sao eles.
  assert.doesNotMatch(tela, /app_registrar_presenca|app_remover_presenca|app_registrar_chamada/);
});

test('o alvo de toque tem 44px — a mao mira pior que o mouse', () => {
  // Os botoes da tela do desktop tem 25px de altura; a 390px, com a pessoa de
  // pe na recepcao, isso e 40% do alvo recomendado.
  const menores = [...linha.matchAll(/min-h-\[(\d+)px\]/g)].map((m) => Number(m[1]));
  assert.ok(menores.length > 0, 'nenhum alvo declara altura minima');
  for (const px of menores) {
    assert.ok(px >= 44, `alvo de ${px}px — o minimo e 44`);
  }
});

test('o vazio e uma conquista, nao uma tela quebrada', () => {
  // Fila zerada e o objetivo do recorte. Precisa parecer sucesso, nao erro.
  assert.match(tela, /Tudo fechado/);
  assert.match(tela, /emerald/, 'o vazio deveria ser verde, nao cinza de erro');
});

test('o cabecalho gruda no topo e cobre a sangria do <main>', () => {
  // `top-0` gruda no topo do CONTEUDO, nao do padding: sem o pseudo-elemento,
  // sobram 12px por onde as linhas passam por cima do cabecalho. Margem
  // negativa NAO resolve — quando grudado, quem manda e o `top`.
  assert.match(tela, /sticky top-0/);
  assert.match(tela, /before:bottom-full/);
  assert.match(tela, /before:h-3/);
});

test('a fila diz o que falta, com numero', () => {
  // "Faltam 12" e diferente de uma lista sem fim: o numero e o que deixa a
  // pessoa medir o proprio progresso.
  assert.match(tela, /fila\.total/);
  assert.match(tela, /fila\.professores/);
  assert.match(tela, /fila\.aulas/);
});

test('nao ha div clicavel — o que age e <button>', () => {
  for (const [nome, fonte] of [['ChamadaMobile', tela], ['LinhaPendencia', linha]]) {
    assert.doesNotMatch(fonte, /<div[^>]*onClick/, `${nome} tem div clicavel`);
    assert.doesNotMatch(fonte, /role="button"/, `${nome} finge que uma div e botao`);
  }
});

test('🔴 a Chamada mobile nao duplica o detalhe da aula', () => {
  // Quem mostra uma aula por inteiro e o AgendaDrawer, que ja tem casca de
  // folha. Uma segunda versao aqui seria a segunda resposta para "o que se
  // sabe desta aula".
  const arquivos = readdirSync(new URL('../src/mobile/telas/agenda/', import.meta.url));
  for (const f of arquivos) {
    const fonte = semComentarios(le(`../src/mobile/telas/agenda/${f}`));
    assert.ok(
      !/presenca_canonica|risco_pct.*frescor|progresso_contrato/.test(fonte),
      `${f} parece reimplementar o detalhe da aula`,
    );
  }
});
