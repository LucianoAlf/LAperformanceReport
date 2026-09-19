// Acesso ao modulo Eventos (recital) — LAPE-39.
//
// O modulo nasce visivel so para o Hugo, e esse gate e CODIGO DESCARTAVEL: na virada
// para producao ele vira `hasPermission('eventos.ver')`. O que este teste protege nao e
// o e-mail — e o fato de existir UM UNICO ponto de corte.
//
// O Trafego Pago e o contra-exemplo vivo: a lista de e-mails dele esta escrita em 3
// arquivos (router.tsx, AppSidebar.tsx, MobileLayout.tsx), entao liberar aquele modulo
// exige lembrar dos tres — e esquecer um deixa o item fora do menu com a URL funcionando,
// ou o inverso. E a divida da LAPE-32.
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

test('so o e-mail de teste enxerga o modulo', () => {
  assert.equal(podeVerEventos('hugo@gmail.com'), true);
  assert.equal(podeVerEventos('lucianoalf.la@gmail.com'), false);
  assert.equal(podeVerEventos('krissya@lamusic.com.br'), false);
});

test('e-mail ausente nao vaza o modulo (fail-closed)', () => {
  // `usuario` e null enquanto o fetch do AuthContext nao resolve: nesse instante o
  // modulo tem de ficar FECHADO, nunca aberto.
  assert.equal(podeVerEventos(null), false);
  assert.equal(podeVerEventos(undefined), false);
  assert.equal(podeVerEventos(''), false);
});

test('a comparacao ignora caixa (o e-mail chega como o usuario digitou)', () => {
  assert.equal(podeVerEventos('Hugo@Gmail.com'), true);
  assert.equal(podeVerEventos('HUGO@GMAIL.COM'), true);
});

test('a regra `eventos` do menu responde ao contexto', () => {
  const base = { isAdmin: true, campanhasVisivel: true, trafegoPagoVisivel: true };
  assert.equal(itemVisivel('eventos', { ...base, eventosVisivel: true }), true);
  // Nem admin ve o modulo enquanto ele estiver restrito.
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

test('o e-mail de teste aparece UMA vez no src, e e na fonte unica', () => {
  const fonte = readFileSync('src/lib/menuVisibilidade.ts', 'utf8');
  assert.match(fonte, /EVENTOS_EMAIL_TESTE = 'hugo@gmail\.com'/u);

  // Se o e-mail for copiado para um consumidor, o ponto unico de corte deixa de existir.
  for (const arquivo of ['src/components/App/Layout/AppSidebar.tsx', 'src/mobile/MobileLayout.tsx']) {
    const texto = readFileSync(arquivo, 'utf8');
    const linhasDeEventos = texto
      .split('\n')
      .filter((l) => /eventos/iu.test(l) && /hugo@gmail\.com/u.test(l));
    assert.equal(
      linhasDeEventos.length, 0,
      `${arquivo} nao pode carregar o e-mail do modulo Eventos — a regra mora em podeVerEventos`,
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
