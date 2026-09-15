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

test('as 9 secoes da ficha deixam de ser 9 colunas de 41px', () => {
  // grid-cols-9 em 375px da 41px por aba: abaixo do alvo de 44px, e com o
  // rotulo escondido (`hidden sm:inline`) sobra so um icone para distinguir
  // "Academico" de "Pedagogico".
  assert.match(ficha, /ehCelular \? FICHA_SECOES_CELULAR : 'grid grid-cols-9'/);
  // As 9 sao DADO, nao 9 blocos de JSX repetidos: o rotulo aparece na pilula e
  // na linha da folha, e duas copias divergem.
  const secoes = ficha.slice(ficha.indexOf('const SECOES_FICHA'), ficha.indexOf('] as const;'));
  const quantas = secoes.split('label:').length - 1;
  assert.equal(quantas, 9, `esperava 9 secoes declaradas, achei ${quantas}`);
  for (const nome of ['Pessoal', 'Academico', 'Anamnese', 'Pedagogico']) {
    assert.ok(secoes.normalize('NFD').replace(/[̀-ͯ]/g, '').includes(nome), `sumiu a secao ${nome}`);
  }
  // Alvo de toque e rotulo continuam existindo — agora uma vez so, no map.
  assert.match(ficha, /ehCelular && FICHA_ABA_CELULAR/);
  assert.match(ficha, /ehCelular \? 'whitespace-nowrap' : 'hidden sm:inline'/);
});

test('🔴 o icone da aba nao pode travar a largura NO DESKTOP', () => {
  // Medido no app (dialogo de 846px): as 9 abas ficam com celulas de 93px e
  // "Academico" (96), "Financeiro" (94), "Anamnese" (94) e "Pedagogico" (98)
  // pedem mais — sao os 2-5px que o icone cede encolhendo. Com `flex-none`
  // fixo ele nao cede, o conteudo transborda a celula do grid e encosta na
  // aba vizinha: 4 abas transbordando; removendo o flex-none, zero.
  //
  // ⚠️ Foi a frente mobile que introduziu o `flex-none` (o icone nao pode
  // achatar na lista do celular) — e ele vazou para o desktop, que nao tinha
  // esse problema. Guardar por `ehCelular` e' o que mantem os dois certos.
  assert.doesNotMatch(ficha, /<Icone className="w-4 h-4 flex-none"/);
  assert.match(ficha, /<Icone className=\{cn\('w-4 h-4', ehCelular && 'flex-none'\)\} \/>/);
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

test('🔴 o formulario da ficha vira UMA coluna no celular', () => {
  // Medido na tela real (print do Hugo, 375px): com `grid-cols-2` fixo cada
  // coluna fica com ~170px, e o resultado foi "18/01/1972" com o selo EMLA
  // por cima, "(calculado)" cortado na borda e rolagem horizontal dentro da
  // ficha. Nenhum teste de classe pegaria isso — foi o print que pegou.
  //
  // ⚠️ `sm:grid-cols-2` mantem o desktop identico ao de antes.
  const doisFixos = ficha.split('grid grid-cols-2').length - 1;
  assert.equal(doisFixos, 0, `sobraram ${doisFixos} grids de 2 colunas fixas na ficha`);
  const umaColuna = ficha.split('grid-cols-1').length - 1;
  assert.ok(umaColuna >= 9, `esperava >= 9 grids de 1 coluna no celular, achei ${umaColuna}`);
  assert.match(ficha, /sm:grid-cols-2/, 'o desktop perdeu as 2 colunas');
});

test('🔴 as 9 secoes ficam TODAS a vista, em vez de 3 e meia numa faixa', () => {
  // Medido em 375px: a faixa deslizante mostrava Pessoal, Academico,
  // Financeiro e meio Comercial. Anamnese, Historico, Pesquisas, Aulas e
  // Pedagogico ficavam inteiramente fora da tela — e a Anamnese e' uma das
  // que a secretaria mais abre. Hoje a pilula diz onde se esta e a folha
  // lista as 9.
  assert.ok(!('FICHA_ABAS_CELULAR' in fichaClasses), 'a faixa deslizante voltou');
  assert.match(fichaClasses.FICHA_SECOES_CELULAR, /flex-col/, 'as secoes precisam empilhar');
  // ⚠️ O TabsList do projeto e' uma barra horizontal por padrao
  // (`inline-flex h-10 bg-slate-800 p-1`) — sem desfazer isso, empilhar da
  // uma barra de 40px com 9 linhas dentro.
  for (const classe of ['h-auto', 'bg-transparent', 'p-0']) {
    assert.ok(fichaClasses.FICHA_SECOES_CELULAR.split(' ').includes(classe), `faltou ${classe}`);
  }
  // A linha inteira e' o alvo, e o texto comeca na esquerda (uma lista com
  // rotulos centrados vira uma coluna de textos desalinhados).
  assert.match(fichaClasses.FICHA_ABA_CELULAR, /min-h-\[44px\]/);
  assert.match(fichaClasses.FICHA_ABA_CELULAR, /justify-start/);

  const seletor = readFileSync('src/mobile/SeletorSecaoMobile.tsx', 'utf8');
  // ⚠️ A lista fica montada (`hidden`) quando a folha fecha: `aria-labelledby`
  // resolve texto de elemento oculto, entao os 9 TabsContent seguem rotulados.
  // Desmontar deixaria cada um apontando para um id que nao existe.
  assert.match(seletor, /<div hidden>\{children\}<\/div>/);
  // Escolher a secao encerra a decisao — a folha fecha no mesmo toque.
  assert.match(seletor, /closest\('\[role="tab"\]'\)/);
  // E o gesto e' o MESMO do periodo: uma pilula que diz o estado e uma folha
  // por baixo. Dois vocabularios de navegacao na mesma tela e' o que a ficha
  // tinha ate aqui.
  assert.match(seletor, /aria-haspopup="dialog"/);
  assert.match(seletor, /env\(safe-area-inset-bottom\)/);
});

test('🔴 col-span-2 dentro de grid de 1 coluna RECRIA a segunda coluna', () => {
  // Medido no app real: com `grid-cols-1` aplicado e `sm` INATIVO (375px), o
  // grid computava `112.781px 214.219px` — duas colunas de larguras
  // diferentes. A causa nao era o grid: um filho pedia `col-span-2`, e um item
  // que pede duas colunas num grid de uma faz o navegador CRIAR a segunda,
  // implicita. Por isso "Data de Nascimento" e "Idade" continuavam lado a
  // lado, com a data ilegivel por baixo do selo.
  //
  // ⚠️ Trocar `grid-cols-2` sem olhar os `col-span` dos filhos nao resolve
  // nada — e o teste anterior (que so contava grids) passava.
  const spansFixos = ficha.split('className="col-span-2"').length - 1;
  assert.equal(spansFixos, 0, `sobraram ${spansFixos} col-span-2 fixos, que recriam a 2a coluna`);
  const spansResponsivos = ficha.split('col-span-1 sm:col-span-2').length - 1;
  assert.equal(spansResponsivos, 4, `esperava 4 col-span responsivos, achei ${spansResponsivos}`);
});
