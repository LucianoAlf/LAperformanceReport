// Acesso ao modulo Eventos (recital) — LAPE-39.
//
// ABERTO a todo usuario autenticado desde 19/09/2026 (decisao do Hugo), com aviso de
// "em desenvolvimento" na tela. Antes era gate por e-mail.
//
// O que este teste protege NAO e quem ve — e o fato de existir UM UNICO ponto de corte,
// que continua valendo depois da abertura: o dia em que a regra virar
// `hasPermission('eventos.ver')`, mexer num lugar so tem de bastar.
//
// O Trafego Pago e o contra-exemplo vivo: a lista de e-mails dele esta escrita em 3
// arquivos (router.tsx, AppSidebar.tsx, MobileLayout.tsx), entao liberar aquele modulo
// exige lembrar dos tres — e esquecer um deixa o item fora do menu com a URL funcionando,
// ou o inverso. E a divida da LAPE-32.
//
// ⚠️ Abrir o MENU nao abre o DADO: o escopo por unidade e da RLS das cinco tabelas, nao
// desta funcao. Provado contra o banco nos tres perfis em 19/09.
//
// Roda a funcao REAL (transpilada por esbuild) e confere os consumidores por leitura.
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const lib = await (async () => {
  const { code } = await esbuild.transform(
    readFileSync('src/lib/menuVisibilidade.ts', 'utf8'),
    { loader: 'ts', format: 'esm' },
  );
  const arquivo = path.join(mkdtempSync(path.join(tmpdir(), 'evt-')), 'menuVisibilidade.mjs');
  writeFileSync(arquivo, code);
  return import(pathToFileURL(arquivo).href);
})();

const { podeVerEventos, itemVisivel } = lib;

test('o modulo esta aberto a todo usuario autenticado', () => {
  assert.equal(podeVerEventos('hugo@gmail.com'), true);
  assert.equal(podeVerEventos('lucianoalf.la@gmail.com'), true);
  assert.equal(podeVerEventos('krissya@lamusic.com.br'), true);
  assert.equal(podeVerEventos('duda@lamusic.com.br'), true);
});

test('quem ainda nao resolveu o perfil tambem ve — a tela nao pisca', () => {
  // `usuario` e null enquanto o fetch do AuthContext nao resolve. Com o gate por e-mail
  // isso tinha de ser fail-CLOSED (modulo restrito nao pode vazar num instante de
  // carregamento); aberto, o fail-closed faria o item sumir e reaparecer do menu.
  //
  // ⚠️ Isto NAO abre dado nenhum: a rota exige sessao e as cinco tabelas tem RLS por
  // unidade. Sem sessao nao ha o que ler, entao o pior caso e um item de menu inutil.
  assert.equal(podeVerEventos(null), true);
  assert.equal(podeVerEventos(undefined), true);
  assert.equal(podeVerEventos(''), true);
});

test('a regra `eventos` do menu responde ao contexto', () => {
  // A regra continua ligada ao contexto, e nao fixa em `true` no `itemVisivel`: e o que
  // permite fechar o modulo de novo mexendo so em `podeVerEventos`.
  const base = { isAdmin: true, campanhasVisivel: true, trafegoPagoVisivel: true };
  assert.equal(itemVisivel('eventos', { ...base, eventosVisivel: true }), true);
  assert.equal(itemVisivel('eventos', { ...base, eventosVisivel: false }), false);
});

test('os 3 consumidores usam a funcao, em vez de repetir a regra', () => {
  const consumidores = [
    'src/router.tsx',
    'src/components/App/Layout/AppSidebar.tsx',
    'src/mobile/MobileLayout.tsx',
  ];
  for (const arquivo of consumidores) {
    const fonte = readFileSync(arquivo, 'utf8');
    assert.match(
      fonte,
      /podeVerEventos\(/u,
      `${arquivo} precisa chamar podeVerEventos — sem isso a regra de acesso ganha uma segunda verdade`,
    );
  }
});

test('nenhum consumidor carrega e-mail do modulo Eventos', () => {
  // O gate por e-mail acabou. Se algum dia um e-mail for copiado para um consumidor, o
  // ponto unico de corte deixa de existir e fechar o modulo de novo passa a exigir
  // lembrar de N arquivos — que e exatamente a divida do Trafego Pago.
  for (const arquivo of ['src/components/App/Layout/AppSidebar.tsx', 'src/mobile/MobileLayout.tsx']) {
    const texto = readFileSync(arquivo, 'utf8');
    const linhasDeEventos = texto
      .split('\n')
      .filter((l) => /eventos/iu.test(l) && /@[a-z0-9.-]+\.[a-z]{2,}/iu.test(l));
    assert.equal(
      linhasDeEventos.length, 0,
      `${arquivo} nao pode carregar e-mail junto do modulo Eventos — a regra mora em podeVerEventos`,
    );
  }
});

test('o aviso de "em desenvolvimento" e fonte unica e esta nas DUAS telas', () => {
  // O modulo foi aberto com as fases 5 a 7 por fazer. Quem entra precisa saber disso
  // antes de montar um recital inteiro e descobrir que ainda nao da para imprimir.
  const aviso = readFileSync('src/components/App/Eventos/AvisoEmDesenvolvimento.tsx', 'utf8');
  assert.match(aviso, /em desenvolvimento/iu);

  for (const tela of [
    'src/components/App/Eventos/EventosPage.tsx',
    'src/components/App/Eventos/EventoDetalhePage.tsx',
  ]) {
    const texto = readFileSync(tela, 'utf8');
    assert.match(
      texto,
      /<AvisoEmDesenvolvimento\s*\/>/u,
      `${tela} precisa exibir o aviso enquanto o modulo estiver em construcao`,
    );
  }
});

test('TODA rota de eventos passa pelo guard, inclusive a de detalhe', () => {
  // Rota filha nao herda guard de irma: `eventos/:eventoId` precisa do seu proprio.
  // Sem isto, a URL direta do detalhe seria a porta dos fundos de um modulo em teste —
  // e o furo so apareceria quando alguem compartilhasse o link.
  const router = readFileSync('src/router.tsx', 'utf8');
  const rotas = [...router.matchAll(/path: '(eventos[^']*)'[\s\S]{0,400}?element: (<[^\n]*)/gu)];

  assert.ok(rotas.length >= 2, 'esperava ao menos a lista e o detalhe de eventos');
  for (const [, caminho, elemento] of rotas) {
    assert.match(
      elemento,
      /<EventosGuard>/u,
      `a rota '${caminho}' esta fora do EventosGuard`,
    );
  }
});

test('a permissao RBAC de destino ja existe na migration', () => {
  // A virada para producao nao pode depender de migration nova: as permissoes nascem
  // junto com as tabelas para que liberar seja so marcar na tela de Permissoes.
  const migration = readFileSync(
    'supabase/migrations/20260918120000_modulo_eventos_recital.sql', 'utf8',
  );
  assert.match(migration, /'eventos\.ver'/u);
  assert.match(migration, /'eventos\.editar'/u);
});
