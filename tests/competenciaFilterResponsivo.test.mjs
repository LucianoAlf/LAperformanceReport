import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const filtro = readFileSync('src/components/ui/CompetenciaFilter.tsx', 'utf8');
const dashboardMobile = readFileSync('src/mobile/telas/DashboardMobile.tsx', 'utf8');
const mobileLayout = readFileSync('src/mobile/MobileLayout.tsx', 'utf8');
const seletorMobile = readFileSync('src/mobile/SeletorPeriodoMobile.tsx', 'utf8');
const seletorAgenda = readFileSync('src/components/App/Agenda/SeletorPeriodo.tsx', 'utf8');
const painel = readFileSync('src/components/ui/PainelPeriodo.tsx', 'utf8');

/**
 * O CompetenciaFilter soma ~760px (7 tipos + seletor de ano + seletor de
 * periodo) e a faixa util do celular tem ~350px. Num `flex` sem wrap o que
 * passa do fim da linha nao encolhe nem quebra: fica FORA da tela — e o que
 * caia ali era justamente o seletor de ano/mes, o controle mais usado do
 * filtro.
 *
 * Os asserts ancoram na classe do container de cada bloco, nao em "o arquivo
 * menciona flex-wrap": mencionar em um lugar nao protege os outros tres.
 */

test('guarda: o filtro tem mesmo os 7 tipos que motivam a quebra de linha', () => {
  // Sem isto, um arquivo esvaziado passaria em todos os testes abaixo.
  for (const id of ['todos', 'diario', 'mensal', 'trimestral', 'semestral', 'anual', 'personalizado']) {
    assert.ok(filtro.includes(`id: '${id}'`), `tipo ${id} sumiu do CompetenciaFilter`);
  }
});

test('o container raiz do filtro quebra em linhas', () => {
  assert.ok(
    filtro.includes('cn("flex flex-wrap items-center gap-2 sm:gap-3", className)'),
    'o container raiz voltou a ser flex sem wrap — o bloco de seletores sai da tela no celular',
  );
});

test('o segmented dos tipos quebra em linhas', () => {
  assert.ok(
    filtro.includes('p-1 rounded-lg inline-flex flex-wrap gap-1'),
    'o segmented dos 7 tipos voltou a ser inline-flex sem wrap',
  );
});

test('os dois blocos de seletores (periodo e personalizado) quebram em linhas', () => {
  const ocorrencias = filtro.split('<div className="flex flex-wrap items-center gap-2">').length - 1;
  assert.equal(
    ocorrencias,
    2,
    `esperado 2 blocos de seletores com flex-wrap (periodo e personalizado), achei ${ocorrencias}`,
  );
});

test('o alvo de toque dos tipos e de 44px so no ponteiro grosso', () => {
  assert.ok(
    filtro.includes("'[@media(pointer:coarse)]:min-h-[44px]'"),
    'o alvo de toque de 44px sumiu do seletor de tipo',
  );
  // No ponteiro fino o botao NAO pode crescer: o mesmo filtro roda em ~20
  // telas de desktop, onde a altura veio de py-2 desde sempre.
  assert.doesNotMatch(
    filtro,
    /'min-h-\[44px\]/,
    'min-h-[44px] sem a variante de ponteiro grosso aumentaria o botao no desktop',
  );
});

test('o Dashboard mobile nao esconde estouro com rolagem lateral', () => {
  // Rolagem lateral e a DEGRADACAO das telas ainda nao portadas (spec §8).
  // Numa tela ja adaptada ela nao degrada nada: esconde o defeito de layout.
  assert.doesNotMatch(
    dashboardMobile,
    /overflow-x-auto/,
    'voltou rolagem lateral ao Dashboard mobile — tela portada que rola para o lado nao esta portada',
  );
});

test('celular e Agenda usam O MESMO PainelPeriodo', () => {
  // A grade de meses/trimestres/semestres tem UMA fonte. Antes da extracao
  // (14/09) havia duas — `CompetenciaFilter` e o painel da Agenda —, e a folha
  // do celular seria a terceira. Copia divergiria na primeira competencia nova,
  // que e a causa-raiz documentada das duplicatas de renovacao.
  for (const [nome, fonte] of [['seletor mobile', seletorMobile], ['SeletorPeriodo da Agenda', seletorAgenda]]) {
    assert.match(
      fonte,
      /import \{ PainelPeriodo(, type PainelPeriodoProps)? \} from '@\/components\/ui\/PainelPeriodo'/,
      `${nome} deixou de usar o PainelPeriodo compartilhado`,
    );
    assert.match(fonte, /<PainelPeriodo\b/, `${nome} importa mas nao renderiza o PainelPeriodo`);
    // ⚠️ Ancorar em DECLARACAO de lista, nunca na palavra solta: "Trimestre"
    // aparece em `setTrimestre`, que e o nome do handler — um assert por
    // substring daria vermelho na implementacao certa.
    assert.doesNotMatch(
      fonte,
      /const (TIPOS|MESES|MESES_CURTO|TRIMESTRES|SEMESTRES|ESCOPOS|ATALHOS)\s*[:=]/,
      `a lista de periodos foi redeclarada em ${nome} — ela tem uma fonte so`,
    );
    for (const rotulo of ["'Janeiro'", "'Jan'", "'T1'", "id: 'mensal'"]) {
      assert.ok(
        !fonte.includes(rotulo),
        `o rotulo ${rotulo} foi copiado para ${nome} — ele pertence ao PainelPeriodo`,
      );
    }
  }
});

test('os dois layouts do painel existem e sao escolhidos por quem embrulha', () => {
  assert.match(painel, /layout\?: 'colunas' \| 'empilhado'/, 'o painel perdeu a escolha de layout');
  assert.match(seletorMobile, /layout="empilhado"/, 'a folha do celular deixou de empilhar');
  assert.match(seletorAgenda, /layout="colunas"/, 'a Agenda deixou de usar as duas colunas');
});

test('escolher um VALOR fecha; trocar de ESCOPO nao', () => {
  // Fechar ao trocar de escopo interromperia a decisao no meio — o proximo
  // toque ainda esta por vir na grade.
  assert.match(painel, /onEscolheuValor\?\.\(\)/, 'o painel nao avisa mais quem o embrulha');
  assert.match(
    painel,
    /botaoEscopo\(e, false\)/,
    'trocar de escopo passou a fechar o painel no meio da decisao',
  );
  assert.match(painel, /botaoEscopo\(a, true\)/, 'os atalhos (Hoje/Tudo) deixaram de encerrar a decisao');
});

test('o Dashboard mobile chega ao filtro pelo seletor compacto', () => {
  assert.match(
    dashboardMobile,
    /<SeletorPeriodoMobile\b/,
    'o Dashboard mobile perdeu o seletor de periodo — a tela fica sem como trocar a competencia',
  );
  // Aberto o tempo todo o filtro custa 148px do topo; a pilula custa 36px.
  assert.ok(
    !dashboardMobile.includes('<CompetenciaFilter'),
    'o filtro voltou a ficar aberto direto na tela, ocupando o topo inteiro',
  );
});

test('a folha do seletor fecha no Esc e tem scrim clicavel', () => {
  assert.match(seletorMobile, /e\.key === 'Escape'/, 'a folha nao fecha no Esc');
  assert.match(seletorMobile, /aria-label="Fechar seletor de período"/, 'a folha nao tem scrim de fechar');
  assert.match(seletorMobile, /role="dialog"/, 'a folha nao se anuncia como dialog');
});

test('o <main> do shell so rola para o lado em rota NAO portada', () => {
  assert.ok(
    mobileLayout.includes("portada ? 'overflow-x-hidden' : 'overflow-x-auto'"),
    'o <main> voltou a rolar para o lado em qualquer rota',
  );
  // A mesma leitura serve ao aviso e a politica de rolagem: duas leituras
  // poderiam divergir num refactor e a tela diria "adaptada" enquanto rola.
  assert.ok(
    mobileLayout.includes('const portada = rotaFoiPortada(location.pathname)'),
    'a decisao "esta tela foi adaptada?" deixou de ter leitura unica',
  );
  // O aviso ganhou um segundo termo em 14/09 (`!faixaPorAba`, para /app/alunos
  // mostrar a faixa por ABA la dentro), mas segue lendo o MESMO `portada` da
  // politica de rolagem — que e o que este assert protege.
  assert.ok(
    mobileLayout.includes('{!portada && !faixaPorAba && <AvisoNaoOtimizado />}'),
    'o aviso de tela nao adaptada deixou de usar a mesma leitura da rolagem',
  );
});
