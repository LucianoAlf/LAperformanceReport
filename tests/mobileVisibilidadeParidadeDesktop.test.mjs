import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * `visibilidade` em menuItems.tsx e' a fonte unica DECLARADA, mas o
 * AppSidebar do desktop continua filtrando por `path` hardcoded (nao le
 * `visibilidade` — mexer no JSX dele e' proibido nesta etapa). Hoje as duas
 * coisas dao o mesmo resultado; amanha, um modulo sensivel novo marcado so
 * com `visibilidade` sumiria do mobile e apareceria no desktop sem ninguem
 * notar. Este teste falha ANTES disso virar incidente.
 */

const itensFonte = readFileSync('src/lib/menuItems.tsx', 'utf8');
const sidebarFonte = readFileSync('src/components/App/Layout/AppSidebar.tsx', 'utf8');

function corpoForaDoMenuAdmin(fonte) {
  // MENU_ADMIN e' duplicacao CONSCIENTE (o AppSidebar tem o JSX proprio dele,
  // nunca vai ler este array) — fica de fora da checagem de paridade.
  const inicio = fonte.indexOf('export const MENU_ADMIN');
  const fimMarcador = '\n];';
  if (inicio === -1) return fonte;
  const fim = fonte.indexOf(fimMarcador, inicio);
  if (fim === -1) return fonte;
  return fonte.slice(0, inicio) + fonte.slice(fim + fimMarcador.length);
}

function itensComVisibilidade(fonte) {
  const corpo = corpoForaDoMenuAdmin(fonte);
  // [^}] (nao [\s\S]) e' o que importa aqui: cada item e' um objeto de uma
  // linha so, e sem essa barreira o "path" de um item sem `visibilidade` casa
  // com o "visibilidade" do PROXIMO item (foi o que aconteceu com
  // '/app/pre-atendimento' pegando o 'campanhas' de '/app/campanhas', a
  // linha seguinte) — falso positivo que faria o teste acusar item errado.
  const re = /\{[^}]*?path:\s*'([^']+)'[^}]*?visibilidade:\s*'([^']+)'[^}]*?\}/gu;
  const achados = [];
  let m;
  while ((m = re.exec(corpo))) {
    achados.push({ path: m[1], regra: m[2] });
  }
  return achados;
}

test('menuItems.tsx tem itens sensiveis marcados (guarda contra o teste passar vazio)', () => {
  const itens = itensComVisibilidade(itensFonte);
  assert.ok(itens.length >= 2, `esperava >=2 itens com visibilidade fora do MENU_ADMIN, achei ${itens.length}`);
});

test('todo item com `visibilidade` (fora do MENU_ADMIN) tem gate equivalente no AppSidebar', () => {
  const itens = itensComVisibilidade(itensFonte);

  for (const { path, regra } of itens) {
    const escapado = path.replace(/\//gu, '\\/');
    const gate = new RegExp(`item\\.path !== '${escapado}'`, 'u');
    assert.match(
      sidebarFonte,
      gate,
      `menuItems.tsx declara visibilidade:'${regra}' para ${path}, mas AppSidebar.tsx nao filtra por ` +
        `esse path — um modulo sensivel novo desse jeito apareceria SEMPRE no desktop e sumiria do mobile`,
    );
  }
});
