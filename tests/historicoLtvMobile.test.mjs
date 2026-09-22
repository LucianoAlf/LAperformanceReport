import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import {
  CATEGORIAS_SAIDA_LTV,
  acoesDoRegistroLtv,
  filtrarRegistrosLtv,
  formatarMesesLtv,
  normalizarNomeLtv,
  ordenarRegistrosLtv,
  registroLtvEditavel,
  tomDoTempoLtv,
  validarNovoRegistroLtv,
} from '../src/lib/historicoLtv.ts';
import { ABAS_PORTADAS, abaFoiPortada } from '../src/mobile/abasPortadas.ts';

const le = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tela = le('../src/mobile/telas/alunos/HistoricoLtvMobile.tsx');
const linha = le('../src/mobile/telas/alunos/LinhaExAluno.tsx');
const desktop = le('../src/components/App/Alunos/TabHistoricoLTV.tsx');

/** Corta comentários: um assert que proíbe um símbolo não pode reprovar o
 *  comentário que explica por que aquele símbolo não está ali. */
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const reg = (parcial = {}) => ({
  nome: 'Davi Borges',
  tempo_permanencia_meses: 12,
  categoria_saida: 'Interrompido',
  mes_saida: 'Abril/2026',
  fonte: 'historico',
  qtd_passagens_pessoa: 1,
  ...parcial,
});

// ---------------------------------------------------------------- valor ----

test('a busca ignora acento e caixa', () => {
  const base = [reg({ nome: 'JOÃO SILVÉRIO' }), reg({ nome: 'Maria' })];
  assert.equal(filtrarRegistrosLtv(base, { busca: 'joao' }).length, 1);
  assert.equal(filtrarRegistrosLtv(base, { busca: 'SILVERIO' }).length, 1);
  assert.equal(normalizarNomeLtv('  Ana Clára  '), 'ana clara');
});

test('🔴 a busca NÃO casa categoria — senão "evadido" devolve a base inteira', () => {
  const base = [reg({ nome: 'Ana', categoria_saida: 'Evadido' }), reg({ nome: 'Bia', categoria_saida: 'Evadido' })];
  assert.equal(filtrarRegistrosLtv(base, { busca: 'evadido' }).length, 0);
});

test('os filtros se somam, como na tabela do desktop', () => {
  const base = [
    reg({ nome: 'Ana', categoria_saida: 'Evadido', fonte: 'historico' }),
    reg({ nome: 'Ana Paula', categoria_saida: 'Evadido', fonte: 'sistema' }),
    reg({ nome: 'Bruno', categoria_saida: 'Não renovou', fonte: 'historico' }),
  ];
  assert.deepEqual(
    filtrarRegistrosLtv(base, { busca: 'ana', categoria: 'Evadido', fonte: 'sistema' }).map((r) => r.nome),
    ['Ana Paula'],
  );
  assert.equal(filtrarRegistrosLtv(base).length, 3, 'sem filtro nenhum devolve tudo');
});

test('ordenar por tempo, nos dois sentidos, com desempate estável', () => {
  const base = [
    reg({ nome: 'Carla', tempo_permanencia_meses: 10 }),
    reg({ nome: 'Ana', tempo_permanencia_meses: 30 }),
    reg({ nome: 'Bruno', tempo_permanencia_meses: 30 }),
  ];
  assert.deepEqual(ordenarRegistrosLtv(base, 'mais_tempo').map((r) => r.nome), ['Ana', 'Bruno', 'Carla']);
  assert.deepEqual(ordenarRegistrosLtv(base, 'menos_tempo').map((r) => r.nome), ['Carla', 'Ana', 'Bruno']);
  assert.deepEqual(ordenarRegistrosLtv(base, 'nome').map((r) => r.nome), ['Ana', 'Bruno', 'Carla']);
  // Empate desempatado pelo nome nos DOIS sentidos: sem isso a lista dança
  // entre renderizações e a pessoa perde o lugar onde estava lendo.
  assert.deepEqual(
    ordenarRegistrosLtv([reg({ nome: 'Zeca', tempo_permanencia_meses: 5 }), reg({ nome: 'Ana', tempo_permanencia_meses: 5 })], 'menos_tempo').map((r) => r.nome),
    ['Ana', 'Zeca'],
  );
});

test('ordenar não altera o array de quem chamou', () => {
  const base = [reg({ nome: 'Carla', tempo_permanencia_meses: 1 }), reg({ nome: 'Ana', tempo_permanencia_meses: 9 })];
  const copia = [...base];
  ordenarRegistrosLtv(base, 'mais_tempo');
  assert.deepEqual(base.map((r) => r.nome), copia.map((r) => r.nome));
});

test('🔴 não existe ordem por mês de saída — a coluna é texto livre', () => {
  // "Abril/2026" antes de "Janeiro/2026" pareceria cronológico e seria
  // alfabético. Oferecer a ordem seria prometer uma leitura que a coluna não
  // sustenta.
  const fonte = semComentarios(le('../src/lib/historicoLtv.ts'));
  assert.doesNotMatch(fonte, /mes_saida[\s\S]{0,40}localeCompare/);
  assert.doesNotMatch(semComentarios(tela), /ordem.*mes_saida|mes_saida.*ordem/);
});

test('o tempo sai com uma casa e vírgula', () => {
  assert.equal(formatarMesesLtv(95.73), '95,7');
  assert.equal(formatarMesesLtv(12), '12,0');
  assert.equal(formatarMesesLtv(Number.NaN), '—');
});

test('12 meses é o corte do ciclo do contrato', () => {
  assert.equal(tomDoTempoLtv(11.9), 'curto');
  assert.equal(tomDoTempoLtv(12), 'longo');
});

test('só registro do histórico é editável', () => {
  assert.equal(registroLtvEditavel('historico'), true);
  assert.equal(registroLtvEditavel('sistema'), false);
});

test('🔴 linha sem ação nenhuma NÃO vira botão', () => {
  // Registro do sistema, passagem única: não há o que fazer ao tocar. Um botão
  // que não faz nada promete, é anunciado como comando pelo leitor de tela, e
  // o dedo tenta.
  const inerte = acoesDoRegistroLtv({ fonte: 'sistema', qtd_passagens_pessoa: 1 });
  assert.equal(inerte.temAlguma, false);
  assert.deepEqual([inerte.verPassagens, inerte.editar, inerte.excluir], [false, false, false]);

  // Do sistema, mas com 2 passagens: há o histórico para abrir.
  const comHistorico = acoesDoRegistroLtv({ fonte: 'sistema', qtd_passagens_pessoa: 2 });
  assert.deepEqual([comHistorico.verPassagens, comHistorico.editar, comHistorico.temAlguma], [true, false, true]);

  // Do histórico: edita e exclui, mesmo com uma passagem só.
  const editavel = acoesDoRegistroLtv({ fonte: 'historico', qtd_passagens_pessoa: 1 });
  assert.deepEqual([editavel.editar, editavel.excluir, editavel.temAlguma], [true, true, true]);
});

test('a validação do lançamento manual DIZ o que faltou', () => {
  assert.equal(validarNovoRegistroLtv({ nome: 'Ana', tempo: '7', categoria: 'Evadido', mes_saida: '' }).ok, true);

  const semNome = validarNovoRegistroLtv({ nome: '   ', tempo: '7', categoria: 'Evadido', mes_saida: '' });
  assert.equal(semNome.ok, false);
  assert.match(semNome.erro, /nome/i);

  const semTempo = validarNovoRegistroLtv({ nome: 'Ana', tempo: 'abc', categoria: 'Evadido', mes_saida: '' });
  assert.equal(semTempo.ok, false);
  assert.match(semTempo.erro, /mes(es)?/i);

  const zero = validarNovoRegistroLtv({ nome: 'Ana', tempo: '0', categoria: 'Evadido', mes_saida: '' });
  assert.equal(zero.ok, false);
  assert.match(zero.erro, /1 m[êe]s/i);
});

// ------------------------------------------------------- contrato do código ----

test('🔴 o celular e o computador usam a MESMA validação', () => {
  // Enquanto a regra morava dentro do componente do desktop, a folha do
  // celular teria a sua — e divergiriam na primeira vez que alguém mexesse
  // numa delas.
  assert.match(desktop, /validarNovoRegistroLtv\(/);
  assert.doesNotMatch(
    semComentarios(desktop),
    /isNaN\(tempo\)\s*\|\|\s*tempo\s*<\s*1/,
    'a validação antiga voltou a viver dentro do desktop',
  );
  assert.match(tela, /validarNovoRegistroLtv\(/);
});

test('🔴 nenhuma regra de recorte nasce na tela do celular', () => {
  assert.match(tela, /from '@\/lib\/historicoLtv'/);
  for (const [nome, fonte] of [['HistoricoLtvMobile', tela], ['LinhaExAluno', linha]]) {
    const limpo = semComentarios(fonte);
    assert.doesNotMatch(limpo, /from '@\/lib\/supabase'/, `${nome} importa o client`);
    assert.doesNotMatch(limpo, /supabase\.rpc\(/, `${nome} chama RPC direto`);
    assert.doesNotMatch(limpo, /useHistoricoLTV\(/, `${nome} monta o hook por conta própria`);
    // O recorte declarado no rodapé da tabela (4+ meses, sem bolsista/banda)
    // é do banco: refazê-lo no cliente criaria um segundo critério.
    assert.doesNotMatch(limpo, /tempo_permanencia_meses\s*[<>]=?\s*4/, `${nome} reimplementou o corte de 4 meses`);
  }
});

test('a escrita passa pelas funções do hook, nunca por uma porta nova', () => {
  assert.match(tela, /atualizarRegistro\(/);
  assert.match(tela, /excluirRegistro\(/);
  assert.match(tela, /adicionarRegistro\(/);
  assert.doesNotMatch(semComentarios(tela), /\.from\('alunos_historico'\)|\.update\(|\.delete\(/);
});

test('todo alvo de toque tem 44px — menos os chips, que têm 36', () => {
  // O desktop trabalha com 28px nos botões de ação e 36px nos campos, o que
  // funciona com mouse. Aqui quem mira está de pé, com o polegar.
  const alturas = [...tela.matchAll(/min-h-\[(\d+)px\]/g)].map((m) => Number(m[1]));
  assert.ok(alturas.length >= 6, 'poucos alvos declaram altura mínima');
  for (const px of alturas) {
    assert.ok(px >= 36, `alvo de ${px}px`);
  }
  const acoes = alturas.filter((px) => px !== 36);
  assert.ok(acoes.length > 0 && acoes.every((px) => px >= 44), 'ação com menos de 44px');
});

test('🔴 excluir no celular NÃO é mais fácil que no computador', () => {
  // Lá a exclusão abre um diálogo de confirmação. Uma folha que apagasse no
  // primeiro toque tornaria destrutivo justamente o aparelho onde o toque
  // erra mais.
  assert.match(tela, /confirmandoExclusao/);
  const trecho = tela.slice(tela.indexOf('confirmandoExclusao ?'), tela.indexOf('Excluir registro'));
  assert.match(trecho, /não há desfazer|nao ha desfazer/i, 'a confirmação não diz que é definitivo');
  assert.match(trecho, /Cancelar/);
});

test('🔴 o histórico de passagens é o MESMO componente do desktop', () => {
  // Uma segunda versão dele seria a segunda resposta para "quem é esta pessoa
  // e quantas vezes ela passou pela escola".
  const arquivos = readdirSync(new URL('../src/mobile/telas/alunos/', import.meta.url));
  for (const f of arquivos) {
    const fonte = semComentarios(le(`../src/mobile/telas/alunos/${f}`));
    assert.doesNotMatch(fonte, /anularPassagem|reverterAnulacao/, `${f} reimplementa o histórico de passagens`);
  }
  assert.match(desktop, /ehCelular[\s\S]{0,900}<ModalPassagensAluno/);
});

test('🔴 filtro e ordem não acendem da mesma cor', () => {
  // Os dois dividem o segundo trilho. Dois chips azuis lado a lado leem-se
  // como dois filtros ligados — e um deles não recorta nada, só reordena.
  assert.match(tela, /tom === 'ordem'/);
  assert.match(tela, /tom="ordem"/);
  const trecho = tela.slice(tela.indexOf('function Chip('), tela.indexOf('function Chip(') + 1200);
  const cyanNaOrdem = /tom === 'ordem' && '[^']*cyan/.test(trecho);
  assert.equal(cyanNaOrdem, false, 'a ordem voltou a acender como filtro');
});

test('os dois trilhos não repetem a MESMA palavra', () => {
  // "Todas" em categoria e "Todas" em fonte, um sob o outro, fazem parecer a
  // mesma pergunta feita duas vezes.
  assert.match(tela, /Todas as saídas/);
  assert.match(tela, /Todas as fontes/);
});

test('a aba entrou nas portadas, e a função responde pela lista viva', () => {
  assert.equal(abaFoiPortada('/app/alunos', 'historico'), true);

  // ⚠️ A lista de pendentes é DERIVADA, nunca escrita à mão: cada aba nova
  // deixava vermelho o teste da anterior, e vermelho de rotina é assert que
  // ninguém mais lê.
  const TODAS = ['lista', 'turmas', 'grade', 'distribuicao', 'importar', 'automacao', 'historico', 'conciliacao'];
  const portadas = ABAS_PORTADAS['/app/alunos'];
  for (const aba of TODAS) {
    assert.equal(
      abaFoiPortada('/app/alunos', aba),
      portadas.includes(aba),
      `${aba}: a função discorda da lista`,
    );
  }
  // E aba que ninguém declarou nunca é "portada" — o padrão é avisar.
  assert.equal(abaFoiPortada('/app/alunos', 'aba_que_nao_existe'), false);
  assert.equal(abaFoiPortada('/rota/desconhecida', 'lista'), false);
});

test('⚠️ a bifurcação fica DEPOIS dos hooks', () => {
  // Hook não pode ficar atrás de um `return` condicional: a ordem deles mudaria
  // entre renderizações. O `if (ehCelular)` vem depois de todos.
  const iHook = desktop.lastIndexOf('useMemo(');
  const iBifurcacao = desktop.indexOf('if (ehCelular) {');
  assert.ok(iBifurcacao > -1, 'a bifurcação sumiu');
  assert.ok(iHook < iBifurcacao, 'há hook depois da bifurcação');
});

test('⚠️ o JSX do desktop segue intacto', () => {
  // A restrição fundadora: o computador não muda. A tabela, os filtros e a
  // paginação continuam exatamente onde estavam.
  const i = desktop.indexOf('if (ehCelular) {');
  const bloco = desktop.slice(i);
  assert.match(bloco, /overflow-x-auto max-h-\[60vh\]/, 'a tabela do desktop sumiu');
  assert.match(bloco, /w-\[160px\] h-9/, 'o filtro de categoria do desktop mudou');
  assert.match(bloco, /POR_PAGINA/, 'a paginação do desktop sumiu');
});

test('CATEGORIAS_SAIDA_LTV é a lista única, e o desktop lê dela', () => {
  assert.deepEqual(
    CATEGORIAS_SAIDA_LTV.map((c) => c.value),
    ['Interrompido', 'Não renovou', 'Evadido', 'Transferência'],
  );
});
