import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { rotaFoiPortada } from '../src/mobile/rotasPortadas.ts';

const le = (caminho) => readFileSync(new URL(caminho, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const responsivo = le('../src/components/App/Dashboard/DashboardResponsivo.tsx');
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

test('a escolha usa o mesmo corte do shell, nao um breakpoint proprio', () => {
  assert.match(responsivo, /useIsMobile\(\)/);
  assert.doesNotMatch(
    responsivo,
    /matchMedia|innerWidth|1023|1024/,
    'breakpoint duplicado: a decisao tem que vir de useIsMobile',
  );
});

test('o desktop continua recebendo o DashboardPage intacto, e so quando NAO e mobile', () => {
  // Regra completa: declara isMobile via useIsMobile(), e SO retorna DashboardPage
  // no ramo "nao mobile" -- nao basta a string existir em algum lugar do arquivo
  // (uma implementacao invertida, ou que sempre renderiza DashboardPage, tambem
  // conteria a substring "return <DashboardPage />").
  const declaraIsMobile = responsivo.match(/const\s+isMobile\s*=\s*useIsMobile\(\);/);
  assert.ok(declaraIsMobile, 'isMobile precisa vir direto de useIsMobile()');

  const guardaDesktop = responsivo.match(/if\s*\(!isMobile\)\s*return\s*<DashboardPage\s*\/>;?/);
  assert.ok(guardaDesktop, 'o ramo desktop precisa ser "if (!isMobile) return <DashboardPage />"');

  // E a guarda do desktop precisa vir ANTES do Suspense/DashboardMobile no corpo da
  // funcao -- senao "if (!isMobile) return <DashboardPage />" poderia estar morto
  // depois de um return incondicional anterior.
  const posGuarda = guardaDesktop.index;
  const posSuspense = responsivo.indexOf('<Suspense');
  assert.ok(posSuspense > posGuarda, 'a guarda do desktop precisa vir antes do ramo mobile');
});

test('a faixa de aviso sumiu do Dashboard e continua nos outros 17 modulos', () => {
  assert.match(rotas, /ROTAS_PORTADAS[^=]*=\s*\['\/app'\]/);
});

test('rotaFoiPortada: /app foi portada, mas /app/alunos (e as demais sub-rotas) continuam com a faixa', () => {
  // Prova viva do comentario acima: com ROTAS_PORTADAS = ['/app'], a raiz casa e
  // nenhuma sub-rota herda o estado -- e o corpo de rotaFoiPortada (regra do
  // RAIZ_APP) nao precisou mudar nesta task.
  const ROTAS_PORTADAS = ['/app'];
  assert.equal(rotaFoiPortada('/app', ROTAS_PORTADAS), true);
  assert.equal(rotaFoiPortada('/app/alunos', ROTAS_PORTADAS), false);
  assert.equal(rotaFoiPortada('/app/agenda', ROTAS_PORTADAS), false);
});

test('a rota so entra na lista com a tela ligada no router — uma fonte, um commit', () => {
  const lista = rotas.match(/ROTAS_PORTADAS[^=]*=\s*\[([^\]]*)\]/);
  assert.ok(lista, 'nao achei ROTAS_PORTADAS');
  const declaradas = [...lista[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  // Hoje so o Dashboard. Ao portar o proximo modulo, este teste obriga a
  // ligar a tela no router no mesmo commit em que a faixa some.
  assert.deepEqual(declaradas, ['/app']);
  assert.match(router, /DashboardResponsivo/);
});
