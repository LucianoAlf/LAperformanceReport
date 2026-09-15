import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// O working tree deste repo guarda .tsx em CRLF no Windows; normalizar deixa
// os regex abaixo previsíveis independente do fim de linha (padrão já usado
// em tests/dashboardDadosContrato.test.mjs).
const fonte = readFileSync(new URL('../src/mobile/telas/dashboard/SecaoKPIs.tsx', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');

test('a grade e de 2 colunas — 5 colunas do desktop nao cabem em 390px', () => {
  assert.match(fonte, /grid-cols-2/);
  assert.doesNotMatch(fonte, /grid-cols-[3-9]/, 'grade larga do desktop vazou para o mobile');
});

test('o cabecalho da secao repete o vocabulario do desktop (uppercase, slate-400)', () => {
  // Ancorar no elemento <h3> do titulo, e nao na "substring existe no
  // arquivo": um className solto de outro elemento (ex. um wrapper qualquer)
  // satisfaria assert.match(fonte, ...) sem provar que o CABECALHO da secao
  // e' quem carrega o vocabulario do desktop.
  const h3 = fonte.match(/<h3[^>]*className="([^"]*)"/);
  assert.ok(h3, 'nao achei um <h3> com className no arquivo');
  assert.match(h3[1], /uppercase/, 'o <h3> do titulo nao tem uppercase');
  assert.match(h3[1], /text-slate-400/, 'o <h3> do titulo nao tem text-slate-400');
});

test('a cor do icone e prop, nunca fixa — quem monta a tela decide a paleta', () => {
  // corIcone precisa aparecer como parametro do componente (desestruturado
  // das props) e ser usado na classe do icone — sem isso, um componente que
  // hardcoda uma cor (ex. "text-amber-400" fixo) passaria pelos dois testes
  // acima sem violar a regra "corIcone e decisao de quem monta a tela".
  assert.match(fonte, /corIcone/, 'corIcone nao aparece no arquivo — a cor deixou de ser prop');
  // Tag auto-fechada completa (nao so o className=\{...\}): a className usa
  // template literal (`h-4 w-4 ${corIcone}`), cujo ${...} tem um "}" proprio
  // que confundiria um regex ingenuo de "ate o primeiro fecha-chave".
  const iconeTag = fonte.match(/<Icone\b[\s\S]*?\/>/);
  assert.ok(iconeTag, 'nao achei o elemento <Icone .../> auto-fechado');
  assert.match(iconeTag[0], /className=/, 'o elemento <Icone> nao tem className');
  assert.match(iconeTag[0], /corIcone/, 'a className do icone nao referencia corIcone');
});

test('alvo de toque nao entra aqui — SecaoKPIs e cabecalho + grade, sem elemento clicavel proprio', () => {
  assert.doesNotMatch(fonte, /<button|onClick/, 'SecaoKPIs ganhou interacao propria — isso pertence ao KPICard');
});
