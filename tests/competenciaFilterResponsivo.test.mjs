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

/**
 * 14/09/2026 — o conserto passou a morar no COMPONENTE, nao na tela.
 *
 * A versao de celular deste filtro (pilula + folha) nasceu dentro do Dashboard
 * mobile. Resultado: a tela de Alunos abriu com o filtro largo de novo, e o
 * Hugo perguntou "vou ter que ficar falando isso toda pagina que voce criar?".
 * A resposta tem de ser nao — e e' isto que estes testes protegem.
 */

test('o CompetenciaFilter decide sozinho a versao de celular', () => {
  // Sem isto, cada uma das 10 telas que o usam precisa do mesmo conserto de
  // novo, e a proxima nasce larga outra vez.
  assert.match(filtro, /useShellMobile/, 'o filtro voltou a ignorar o shell');
  assert.match(
    filtro,
    /if \(ehCelular\) \{[\s\S]{0,400}<SeletorPeriodoMobile/,
    'o filtro nao troca mais pela folha no celular',
  );
  // Pela MESMA decisao que escolhe o shell, nunca por largura solta: ler so a
  // largura faz o filtro discordar do resto da tela sob VITE_MOBILE_SHELL=off.
  assert.doesNotMatch(filtro, /matchMedia|innerWidth|1023/);
});

test('a restricao de escopos sobrevive a troca de apresentacao', () => {
  // Tela que so faz sentido no recorte mensal nao pode ganhar "Semestre" de
  // brinde so porque virou folha no celular.
  assert.match(filtro, /tiposPermitidos=\{tiposPermitidos\}/);
  assert.match(painel, /tiposPermitidos\?: TipoCompetencia\[\]/);
  assert.match(painel, /ESCOPOS\.filter\(\(e\) => permitido\(e\.id\)\)/);
  assert.match(painel, /ATALHOS\.filter\(\(a\) => permitido\(a\.id\)\)/);
  // Lista vazia cai em "todos": um painel sem escopo nenhum nao deixaria
  // escolher nada — falha muda, pior que o defeito.
  assert.match(painel, /!tiposPermitidos \|\| tiposPermitidos\.length === 0/);
});

test('a barra de filtros compartilhada quebra linha e nao cola na borda', () => {
  const barra = readFileSync('src/components/ui/page-filter-bar.tsx', 'utf8');
  // Sem flex-wrap o que nao cabe fica FORA da tela, nao desce — item de flex
  // nao encolhe abaixo do proprio min-content.
  assert.match(barra, /flex flex-wrap items-center justify-start[^"]*sm:justify-end/);
});

test('o selo de competencia mostra so o ESTADO no celular', () => {
  const selo = readFileSync('src/components/ui/SeloCompetencia.tsx', 'utf8');
  // `badgeLabel` e' "<unidade> · <competencia> · <estado>", e no telefone os
  // dois primeiros ja estao na tela a centimetros dali (cabecalho e pilula).
  // Repetir os tres custava 76px de altura numa faixa de 375px; medido depois
  // do fix: 40px, com pilula e selo na mesma linha.
  assert.match(selo, /ehCelular\s*\n?\s*\?\s*status\.label\s*\n?\s*:\s*status\.badgeLabel/);
  // O texto completo nao se perde — vai para o title.
  assert.match(selo, /title=\{status\.loading \? undefined : `\$\{status\.badgeLabel\}/);
});

test('as 3 telas que tinham o selo copiado passaram a usar o componente', () => {
  // Trecho igual em 3 lugares vira 3 consertos — foi assim que o filtro de
  // periodo chegou a Alunos ainda largo depois de resolvido no Dashboard.
  for (const caminho of [
    'src/components/App/Alunos/AlunosPage.tsx',
    'src/components/GestaoMensal/TabGestao.tsx',
    'src/components/GestaoMensal/TabComercialNew.tsx',
  ]) {
    const fonte = readFileSync(caminho, 'utf8');
    assert.match(fonte, /<SeloCompetencia\b/, `${caminho} nao usa o selo compartilhado`);
    assert.doesNotMatch(
      fonte,
      /competenciaMensal\.loading \? 'Validando competência' : competenciaMensal\.badgeLabel/,
      `${caminho} voltou a montar o selo a mao`,
    );
  }
});

test('a faixa de KPIs deixa de empilhar no celular — medido, nao estimado', () => {
  const grade = readFileSync('src/components/ui/GradeKPIs.tsx', 'utf8');
  // 7 cartoes em 2 colunas de 375px davam 551px (4 linhas). Com os 248px de
  // cabecalho e filtros, as abas so apareciam depois de ~860px numa tela de
  // 812px: para chegar a lista era preciso passar uma tela inteira de
  // indicadores. Medido depois: 134px, e as abas cabem na primeira tela.
  assert.match(grade, /useShellMobile/, 'a faixa voltou a ignorar o shell');
  assert.match(grade, /snap-x snap-mandatory/, 'a faixa perdeu o snap — o gesto fica solto');
  // O vizinho cortado e' a affordance: faixa que termina na borda parece
  // completa, e ai a rolagem vira informacao escondida.
  assert.match(grade, /\[&>\*\]:w-\[63%\]/);
  // ⚠️ `scrollbar-hide` aparece em 2 telas deste repo e NAO esta definida em
  // lugar nenhum (plugin que o projeto nao tem — Tailwind roda pelo Play CDN,
  // sem config). Copia-la aqui seria fingir um no-op.
  assert.doesNotMatch(grade, /scrollbar-hide/);
  // No desktop nada muda: a grade recebida pela tela e' usada como esta.
  assert.match(grade, /<section data-tour=\{dataTour\} className=\{className\}>/);
});

test('a pagina de Alunos usa a faixa compartilhada, nao uma grade propria', () => {
  const pagina = readFileSync('src/components/App/Alunos/AlunosPage.tsx', 'utf8');
  assert.match(pagina, /<GradeKPIs data-tour="alunos-kpis"/);
  assert.match(pagina, /<\/GradeKPIs>/);
  // O tour depende do atributo; perde-lo quebraria o onboarding em silencio.
  assert.match(pagina, /data-tour="alunos-kpis"/);
});
