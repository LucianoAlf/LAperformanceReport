import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { rotaFoiPortada } from '../src/mobile/rotasPortadas.ts';

const le = (caminho) => readFileSync(new URL(caminho, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const responsivo = le('../src/components/App/Dashboard/DashboardResponsivo.tsx');
const shellLayout = le('../src/components/App/Layout/ResponsiveLayout.tsx');
const hookShell = le('../src/hooks/useShellMobile.ts');
const router = le('../src/router.tsx');
const rotas = le('../src/mobile/rotasPortadas.ts');

test('a rota index passou a apontar para o DashboardResponsivo', () => {
  // Ancorado no par index:true + element:<DashboardResponsivo/>, nao em qualquer
  // mencao solta a DashboardResponsivo no arquivo (poderia ser so um import nao usado).
  assert.match(router, /index:\s*true,\s*element:\s*<DashboardResponsivo\s*\/>/);
});

test('DashboardResponsivo importa o DashboardPage por import direto (nao lazy)', () => {
  // O desktop nao pode pagar o custo de Suspense/lazy para a tela que ja usa hoje.
  assert.match(responsivo, /import\s+DashboardPage\s+from\s+'\.\/DashboardPage'/);
});

test('o Dashboard mobile entra por lazy dentro de um Suspense — nao pesa no bundle do desktop', () => {
  assert.match(responsivo, /const\s+DashboardMobile\s*=\s*lazy\(\(\)\s*=>\s*import\('@\/mobile\/telas\/DashboardMobile'\)\)/);
  // Nao basta "tem Suspense" e "tem DashboardMobile" em qualquer lugar do arquivo:
  // o <DashboardMobile /> tem que estar DENTRO das tags <Suspense>...</Suspense>,
  // senao passaria uma implementacao que monta os dois lado a lado sem fallback.
  const blocoSuspense = responsivo.match(/<Suspense[^>]*>([\s\S]*?)<\/Suspense>/);
  assert.ok(blocoSuspense, 'nao achei um bloco <Suspense>...</Suspense>');
  assert.match(blocoSuspense[1], /<DashboardMobile\s*\/>/);
});

// As proibicoes abaixo valem para o CODIGO, nao para a prosa: o comentario que
// explica por que a tela consome o hook cita VITE_MOBILE_SHELL e localStorage de
// proposito. Nenhum dos dois arquivos tem string com // ou /*, entao o corte e
// seguro aqui — e codigo escondido num comentario nao roda, que e o ponto.
const semComentarios = (fonte) => fonte
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

const CONSUMIDORES_DO_SHELL = [
  ['DashboardResponsivo', semComentarios(responsivo)],
  ['ResponsiveLayout', semComentarios(shellLayout)],
];

test('a tela e o shell decidem pela MESMA funcao — nao apenas pelo mesmo breakpoint', () => {
  // O assert anterior exigia useIsMobile() aqui e proibia matchMedia/1023/1024.
  // Ele provava "nao duplicou o corte de LARGURA" e era satisfeito por uma
  // implementacao que ignora as outras DUAS entradas da decisao: o kill switch
  // (VITE_MOBILE_SHELL=off) e o override de localStorage. Era assim que a tela
  // e o shell discordavam — com VITE_MOBILE_SHELL=off o shell voltava para o
  // desktop e a tela continuava mobile, e com shell-override='mobile' num
  // desktop acontecia o inverso.
  const importaHook = /import\s*\{\s*useShellMobile\s*\}\s*from\s*'@\/hooks\/useShellMobile'/;
  for (const [nome, arquivo] of CONSUMIDORES_DO_SHELL) {
    assert.match(arquivo, importaHook, `${nome} nao importa useShellMobile`);
    // Import sozinho nao prova consumo: exigir a chamada.
    assert.match(arquivo, /useShellMobile\(\)/, `${nome} importa o hook mas nao o chama`);
  }
});

test('nenhum dos dois le as entradas da decisao por conta propria', () => {
  // Uma leitura local de qualquer das 3 entradas e uma segunda versao da regra
  // — e sao exatamente as 3 versoes locais que produziram a discordancia.
  for (const [nome, arquivo] of CONSUMIDORES_DO_SHELL) {
    assert.doesNotMatch(arquivo, /useIsMobile/, `${nome} le a largura por conta propria`);
    assert.doesNotMatch(arquivo, /VITE_MOBILE_SHELL/, `${nome} le o kill switch por conta propria`);
    assert.doesNotMatch(arquivo, /localStorage/, `${nome} le o override por conta propria`);
    assert.doesNotMatch(arquivo, /matchMedia|innerWidth|1023|1024/, `${nome} duplicou o breakpoint`);
    assert.doesNotMatch(arquivo, /resolverShell/, `${nome} remonta a decisao em vez de consumir o hook`);
  }
});

test('useShellMobile e a fonte unica: as 3 entradas alimentam resolverShell', () => {
  assert.match(hookShell, /useIsMobile\(\)/, 'a largura nao vem de useIsMobile');
  assert.match(hookShell, /VITE_MOBILE_SHELL === 'off'/, 'o kill switch nao vem de VITE_MOBILE_SHELL');
  assert.match(hookShell, /getItem\('shell-override'\)/, 'o override nao vem do localStorage');
  // As 3 entram em resolverShell de fato — nao ficam soltas no arquivo.
  assert.match(
    hookShell,
    /resolverShell\(\{[\s\S]{0,240}larguraMobile[\s\S]{0,240}flagDesligada[\s\S]{0,240}override/,
    'as 3 entradas nao alimentam resolverShell',
  );
  // Storage bloqueado (aba anonima, cookies barrados) nao pode derrubar a tela.
  assert.match(
    hookShell,
    /try\s*\{[\s\S]{0,200}getItem\('shell-override'\)[\s\S]{0,200}\}\s*catch/,
    'a leitura do localStorage precisa do try/catch',
  );
});

test('o desktop continua recebendo o DashboardPage intacto, e so quando o shell NAO e mobile', () => {
  // Regra completa: declara shell via useShellMobile(), e SO retorna DashboardPage
  // no ramo "nao mobile" -- nao basta a string existir em algum lugar do arquivo
  // (uma implementacao invertida, ou que sempre renderiza DashboardPage, tambem
  // conteria a substring "return <DashboardPage />").
  const declaraShell = responsivo.match(/const\s+shell\s*=\s*useShellMobile\(\);/);
  assert.ok(declaraShell, 'shell precisa vir direto de useShellMobile()');

  const guardaDesktop = responsivo.match(/if\s*\(shell\s*!==\s*'mobile'\)\s*return\s*<DashboardPage\s*\/>;?/);
  assert.ok(guardaDesktop, 'o ramo desktop precisa ser "if (shell !== \'mobile\') return <DashboardPage />"');

  // E a guarda do desktop precisa vir ANTES do Suspense/DashboardMobile no corpo da
  // funcao -- senao ela poderia estar morta depois de um return incondicional anterior.
  const posSuspense = responsivo.indexOf('<Suspense');
  assert.ok(posSuspense > guardaDesktop.index, 'a guarda do desktop precisa vir antes do ramo mobile');
});

test('a faixa sumiu do Dashboard e de Alunos, e continua nos outros 16 modulos', () => {
  assert.match(rotas, /ROTAS_PORTADAS[^=]*=\s*\['\/app',\s*'\/app\/alunos'\]/);
});

test('rotaFoiPortada: a raiz NAO contagia as sub-rotas, e cada porte entra sozinho', () => {
  // A regra do RAIZ_APP: com ['/app'], a raiz casa e nenhuma sub-rota herda o
  // estado — senao portar o Dashboard apagaria a faixa de Alunos, Agenda e
  // mais 15 de uma vez.
  assert.equal(rotaFoiPortada('/app', ['/app']), true);
  assert.equal(rotaFoiPortada('/app/alunos', ['/app']), false);
  assert.equal(rotaFoiPortada('/app/agenda', ['/app']), false);

  // Com Alunos na lista, so ele e suas sub-rotas saem da faixa.
  const HOJE = ['/app', '/app/alunos'];
  assert.equal(rotaFoiPortada('/app/alunos', HOJE), true);
  assert.equal(rotaFoiPortada('/app/alunos/123', HOJE), true);
  assert.equal(rotaFoiPortada('/app/agenda', HOJE), false);
});

test('a rota so entra na lista com a tela ligada no router — uma fonte, um commit', () => {
  const lista = rotas.match(/ROTAS_PORTADAS[^=]*=\s*\[([^\]]*)\]/);
  assert.ok(lista, 'nao achei ROTAS_PORTADAS');
  const declaradas = [...lista[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  // Ao portar o proximo modulo, este teste obriga a ligar a tela no router no
  // mesmo commit em que a faixa some — rota sem tela mostraria o desktop
  // dizendo que foi adaptado.
  assert.deepEqual(declaradas, ['/app', '/app/alunos']);
  assert.match(router, /DashboardResponsivo/);
  assert.match(router, /AlunosResponsivo/);
});
