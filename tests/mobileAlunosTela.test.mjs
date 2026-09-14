// Alunos no celular — arquetipos 1 ("lista densa") e 3 ("ficha") do spec.
//
// A tabela do desktop tem 16 colunas e nao encolhe para 351px. A linha carrega
// tres coisas (quem · com quem/quando · o que exige acao) e o resto mora na
// FICHA, que e a mesma do desktop.
//
// As funcoes puras rodam de verdade (bundle por esbuild), nao por regex.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const selo = await (async () => {
  const saida = path.join(mkdtempSync(path.join(tmpdir(), 'selo-')), 'seloAluno.mjs');
  await esbuild.build({
    entryPoints: ['src/mobile/telas/alunos/seloAluno.ts'],
    bundle: true,
    format: 'esm',
    outfile: saida,
    alias: { '@': path.resolve('src') },
    logLevel: 'silent',
  });
  return import(pathToFileURL(saida).href);
})();

const { seloDoAluno, quandoTemAula } = selo;

// As classes da ficha sao lidas como VALOR, nao como texto do arquivo: a
// primeira versao deste teste proibia a string "h-screen" e ficou vermelha por
// causa do COMENTARIO que explica por que nao usar h-screen.
const fichaClasses = await (async () => {
  const saida = path.join(mkdtempSync(path.join(tmpdir(), 'ficha-')), 'fichaTelaCheia.mjs');
  await esbuild.build({
    entryPoints: ['src/mobile/fichaTelaCheia.ts'],
    bundle: true,
    format: 'esm',
    outfile: saida,
    logLevel: 'silent',
  });
  return import(pathToFileURL(saida).href);
})();

const aluno = (extra) => ({
  id: 1,
  nome: 'Fulano',
  status: 'ativo',
  status_pagamento: null,
  aguardando_renovacao: false,
  dia_aula: null,
  horario_aula: null,
  ...extra,
});

// ── o selo (regra de negocio, executada) ────────────────────────────────────

test('aluno ativo e em dia NAO recebe selo', () => {
  // Cor e vocabulario de excecao: numa lista em que tudo esta destacado, nada
  // esta. E a regra que a Agenda ja segue desde 03/08/2026.
  assert.equal(seloDoAluno(aluno({})), null);
});

test('inadimplente so e sinalizado enquanto a matricula esta ATIVA', () => {
  assert.equal(seloDoAluno(aluno({ status_pagamento: 'inadimplente' })).texto, 'Inadimplente');
  // Quem evadiu devendo continua devendo, mas cobrar na lista de alunos aponta
  // para uma matricula que nao existe mais — o lugar disso e o financeiro.
  assert.equal(seloDoAluno(aluno({ status: 'inativo', status_pagamento: 'inadimplente' })).texto, 'Saiu');
  assert.equal(seloDoAluno(aluno({ status: 'trancado', status_pagamento: 'inadimplente' })).texto, 'Trancado');
});

test('o selo e UM valor, e o mais grave vence', () => {
  // Condicoes independentes dariam dois selos e, com twMerge, a ultima classe
  // venceria — bug real ja acontecido na Agenda (cor contradizendo o badge).
  const doisEstados = seloDoAluno(aluno({ status_pagamento: 'inadimplente', aguardando_renovacao: true }));
  assert.equal(doisEstados.texto, 'Inadimplente', 'inadimplente + renovar sinaliza o que exige acao hoje');

  assert.equal(seloDoAluno(aluno({ aguardando_renovacao: true })).texto, 'Renovar');
  assert.equal(
    seloDoAluno(aluno({ aguardando_renovacao: true, status: 'aviso_previo' })).texto,
    'Aviso prévio',
  );
});

test('⚠️ aviso previo ANULA a inadimplencia — e isso vem do desktop, nao daqui', () => {
  // `getStatusPagamentoOperacional` so devolve 'inadimplente' quando
  // `status === 'ativo'`, e aviso previo nao e 'ativo'. Ou seja: quem esta de
  // saida DEVENDO nao e sinalizado em lugar nenhum do sistema, nem no desktop.
  //
  // O teste existe para a decisao ficar VISIVEL: se a casa mudar de ideia, o
  // lugar e `src/lib/alunosStatus.ts`, e as duas telas mudam juntas.
  assert.equal(
    seloDoAluno(aluno({ status: 'aviso_previo', status_pagamento: 'inadimplente' })).texto,
    'Aviso prévio',
  );
});

test('quandoTemAula nao deixa traco solto quando falta dia ou horario', () => {
  assert.equal(quandoTemAula('Terça', '14:00:00'), 'Terça 14:00');
  assert.equal(quandoTemAula('Terça', null), 'Terça');
  assert.equal(quandoTemAula(null, '14:00:00'), '14:00');
  assert.equal(quandoTemAula(null, null), '');
});

// ── fonte unica ─────────────────────────────────────────────────────────────

const ler = (p) => readFileSync(p, 'utf8');
const seloFonte = ler('src/mobile/telas/alunos/seloAluno.ts');
const listaFonte = ler('src/mobile/telas/alunos/ListaAlunosMobile.tsx');
const tabelaDesktop = ler('src/components/App/Alunos/TabelaAlunos.tsx');
const pagina = ler('src/components/App/Alunos/AlunosPage.tsx');
const ficha = ler('src/components/App/Alunos/ModalFichaAluno.tsx');

test('celular e desktop leem a MESMA regra de status de pagamento', () => {
  // A regra morava como funcao privada dentro de TabelaAlunos.tsx. Copia-la
  // criaria duas versoes da mesma regra de negocio — a causa-raiz documentada
  // das duplicatas de renovacao.
  for (const [nome, fonte] of [['selo do celular', seloFonte], ['tabela do desktop', tabelaDesktop]]) {
    assert.match(fonte, /from '@\/lib\/alunosStatus'/, `${nome} deixou de usar a regra compartilhada`);
  }
  // Ancorado na REIMPLEMENTACAO, nao na palavra.
  for (const [nome, fonte] of [['selo do celular', seloFonte], ['lista do celular', listaFonte]]) {
    assert.doesNotMatch(
      fonte,
      /function\s+isMatriculaAtivaParaInadimplencia/,
      `${nome} reimplementou a regra em vez de importar`,
    );
  }
});

test('🔴 o toque no aluno abre a FICHA de 9 abas, nao uma versao pobre dela', () => {
  // Houve aqui uma folha de detalhe com 9 campos. Era uma segunda ficha, mais
  // pobre, para a mesma pessoa: quem abrisse um aluno no celular veria 9
  // campos onde o desktop mostra 9 abas. Foi removida.
  assert.ok(
    !existsSync('src/mobile/telas/alunos/DetalheAlunoSheet.tsx'),
    'a folha de detalhe voltou — ela e uma segunda ficha para a mesma pessoa',
  );
  assert.doesNotMatch(listaFonte, /DetalheAlunoSheet/);
  assert.match(listaFonte, /onAbrirAluno: \(alunoId: number\) => void/);
  // E a pagina monta a ficha REAL, a mesma que o desktop usa.
  assert.match(pagina, /ehCelular && fichaAlunoId !== null/);
  assert.match(pagina, /<ModalFichaAluno/);
  assert.match(pagina, /onAbrirAluno=\{setFichaAlunoId\}/);
});

test('a ficha guarda o ID do aluno, nunca o objeto', () => {
  // A lista e remontada a cada recarga; um objeto preso ficaria velho na tela
  // enquanto o resto da pagina ja mostra o dado novo.
  assert.match(pagina, /useState<number \| null>\(null\)/);
  assert.match(pagina, /alunosComTurma\.find\(\(a\) => a\.id === fichaAlunoId\)/);
  // Aluno que sai do recorte com a ficha aberta fecha em silencio — melhor que
  // renderizar ficha vazia.
  assert.match(pagina, /if \(!alunoAberto\) return null;/);
});

test('a lista nao fala com o banco: recebe os alunos de quem ja os tem', () => {
  // Buscar aqui criaria uma segunda leitura da lista de alunos.
  assert.doesNotMatch(listaFonte, /supabase\.(from|rpc)\(/);
  assert.match(listaFonte, /alunos: AlunoNaLinha\[\]/);
  assert.match(pagina, /<ListaAlunosMobile\s*\n?\s*alunos=\{alunosComTurma\}/);
  // ⚠️ O hook paralelo `useAlunosLista` foi removido junto com a tela autonoma:
  // era uma segunda consulta a mesma tabela, com os mesmos filtros copiados a
  // mao.
  assert.ok(!existsSync('src/hooks/useAlunosLista.ts'), 'voltou a existir uma segunda leitura da lista');
  assert.ok(!existsSync('src/mobile/telas/AlunosMobile.tsx'), 'voltou a existir uma segunda tela de Alunos');
});

test('o desktop continua com a tabela', () => {
  assert.match(pagina, /tabAtiva === 'lista' && !ehCelular && \(\s*<TabelaAlunos/);
});

// ── a ficha em tela cheia (arquetipo 3) ─────────────────────────────────────

test('a ficha TOMA a tela no celular, e o deslocamento do dialogo e zerado', () => {
  const cls = fichaClasses.FICHA_TELA_CHEIA;
  // ⚠️ `w-screen h-screen` sozinho nao basta: o DialogContent e
  // `fixed left-[50%] top-[50%] translate-*-[-50%]`, entao sem zerar o
  // deslocamento metade da ficha fica fora da tela.
  for (const classe of ['left-0', 'top-0', 'translate-x-0', 'translate-y-0']) {
    assert.ok(cls.split(' ').includes(classe), `FICHA_TELA_CHEIA perdeu ${classe}`);
  }
  // ⚠️ 100dvh, nao 100vh: no iOS o 100vh inclui a barra de endereco retratil,
  // e o rodape de acoes some abaixo da dobra justamente enquanto ela aparece.
  assert.ok(cls.split(' ').includes('h-[100dvh]'));
  assert.ok(!cls.split(' ').includes('h-screen'), 'h-screen corta o rodape no iOS');
  // E o dialogo perde a largura maxima do desktop, senao a ficha continua
  // sendo um retangulo flutuante com margem dos dois lados.
  assert.ok(cls.split(' ').includes('max-w-none'));
  assert.match(ficha, /ehCelular && FICHA_TELA_CHEIA/);
});

test('as 9 abas da ficha deixam de ser 9 colunas de 41px', () => {
  // grid-cols-9 em 375px da 41px por aba: abaixo do alvo de 44px, e com o
  // rotulo escondido (`hidden sm:inline`) sobra so um icone para distinguir
  // "Academico" de "Pedagogico".
  assert.match(ficha, /ehCelular \? FICHA_ABAS_CELULAR : 'grid grid-cols-9'/);
  const comAlvo = ficha.split('ehCelular && FICHA_ABA_CELULAR').length - 1;
  assert.equal(comAlvo, 9, `esperava as 9 abas com alvo de toque, achei ${comAlvo}`);
  // O rotulo aparece no celular em vez de ficar so o icone.
  const comRotulo = ficha.split("ehCelular ? 'whitespace-nowrap' : 'hidden sm:inline'").length - 1;
  assert.equal(comRotulo, 9, `esperava as 9 abas com rotulo no celular, achei ${comRotulo}`);
});

test('a acao de maior valor fica na base, acima da faixa do gesto', () => {
  // No iPhone a faixa do gesto de inicio cobre os ultimos ~34px.
  assert.match(fichaClasses.ESTILO_RODAPE_CELULAR.paddingBottom, /env\(safe-area-inset-bottom\)/);
  assert.match(ficha, /style=\{ehCelular \? ESTILO_RODAPE_CELULAR : undefined\}/);
  // Salvar ocupa o dobro de Cancelar: as duas nao podem ter o mesmo peso no
  // alvo do polegar.
  assert.match(ficha, /ehCelular && 'min-h-\[44px\] flex-\[2\]'/);
  assert.match(ficha, /ehCelular && 'min-h-\[44px\] flex-1'/);
});
