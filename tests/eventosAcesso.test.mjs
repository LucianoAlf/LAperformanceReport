// Acesso ao modulo Eventos (recital) — LAPE-39.
//
// RBAC desde 27/09/2026: `podeVerEventos` recebe `hasPermission('eventos.ver')` dos tres
// consumidores. Antes: aberto a todo autenticado (19/09), e antes disso gate por e-mail.
//
// O que este teste protege NAO e quem ve — e o fato de existir UM UNICO ponto de corte:
// os tres consumidores passam pela funcao em vez de repetir a regra, e nenhum deles
// carrega e-mail do modulo.
//
// O Trafego Pago e o contra-exemplo vivo: a lista de e-mails dele esta escrita em 3
// arquivos (router.tsx, AppSidebar.tsx, MobileLayout.tsx), entao liberar aquele modulo
// exige lembrar dos tres — e esquecer um deixa o item fora do menu com a URL funcionando,
// ou o inverso. E a divida da LAPE-32.
//
// ⚠️ Abrir o MENU nao abre o DADO: o escopo por unidade e da RLS das tabelas, nao desta
// funcao. Provado contra o banco nos tres perfis em 19/09.
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

test('a funcao responde ao booleano de permissao que os consumidores passam', () => {
  // A decisao (hasPermission + admin) mora nos consumidores; aqui dentro e repasse.
  assert.equal(podeVerEventos(true), true);
  assert.equal(podeVerEventos(false), false);
});

test('os consumidores passam a permissao, nao o e-mail', () => {
  // O RBAC virou real em 27/09/2026: quem chamava `podeVerEventos(usuario?.email)`
  // liberava para qualquer autenticado. Cada consumidor tem de chamar
  // `podeVerEventos(hasPermission('eventos.ver'))`.
  for (const arquivo of [
    'src/router.tsx',
    'src/components/App/Layout/AppSidebar.tsx',
    'src/mobile/MobileLayout.tsx',
  ]) {
    const fonte = readFileSync(arquivo, 'utf8');
    assert.match(
      fonte,
      /podeVerEventos\(hasPermission\('eventos\.ver'\)\)/u,
      `${arquivo} precisa passar hasPermission('eventos.ver') para podeVerEventos`,
    );
  }
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
