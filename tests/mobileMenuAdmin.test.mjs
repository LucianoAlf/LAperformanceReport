import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const itens = readFileSync('src/lib/menuItems.tsx', 'utf8');
const sidebar = readFileSync('src/components/App/Layout/AppSidebar.tsx', 'utf8');
const sheet = readFileSync('src/mobile/MobileMaisSheet.tsx', 'utf8');

// So o bloco `{isAdmin && (...)}` do AppSidebar (linha ~246) — NAO inclui
// "Apresentacoes 2025", que mora num bloco "Historico" SEPARADO e visivel a
// todo mundo (ver MENU_HISTORICO abaixo). Contar os dois juntos como "admin"
// foi o erro do item 5 original desta review.
const ADMIN_ESPERADOS = [
  { path: '/app/admin/usuarios', label: 'Gerenciar Usuários', icon: 'UserCog' },
  { path: '/app/admin/permissoes', label: 'Permissões', icon: 'Shield' },
  { path: '/app/automacoes', label: 'Saúde das Automações', icon: 'Activity' },
];

const HISTORICO_ESPERADOS = [
  { path: '/app/apresentacoes-2025', label: 'Apresentações 2025', icon: 'FolderArchive' },
];

test('MENU_ADMIN tem os 3 destinos do bloco Admin do AppSidebar, todos admin-only', () => {
  for (const { path, label, icon } of ADMIN_ESPERADOS) {
    const escapado = path.replace(/\//gu, '\\/');
    const bloco = new RegExp(
      `path: '${escapado}'[^}]*?visibilidade: 'admin'`,
      'u',
    );
    assert.match(itens, bloco, `MENU_ADMIN precisa declarar ${path} com visibilidade: 'admin'`);
    assert.match(itens, new RegExp(`icon: ${icon}\\s*[,}]`, 'u'), `icone de ${path} deveria ser ${icon}, igual ao AppSidebar`);

    // Nao inventar rotulo: tem que ser o MESMO texto que o usuario ja ve
    // hoje no desktop (JSX hardcoded do AppSidebar).
    assert.match(sidebar, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  }

  // "Apresentacoes 2025" NAO pode estar em MENU_ADMIN — e' do bloco
  // Historico, fora do gate de admin no desktop. Bloco delimitado ate o
  // PRIMEIRO "];" depois da declaracao — sem esse limite, o non-greedy
  // atravessa o fechamento de MENU_ADMIN e acha "apresentacoes-2025" la' na
  // frente, em MENU_HISTORICO, dando falso positivo.
  const inicioAdmin = itens.indexOf('export const MENU_ADMIN');
  const fimAdmin = itens.indexOf('\n];', inicioAdmin);
  const blocoAdmin = itens.slice(inicioAdmin, fimAdmin);
  assert.doesNotMatch(
    blocoAdmin,
    /apresentacoes-2025/u,
    'apresentacoes-2025 nao e admin-only no desktop — nao pode entrar em MENU_ADMIN',
  );
});

test('MENU_HISTORICO tem "Apresentações 2025" SEM `visibilidade` — visivel a todo mundo, como no desktop', () => {
  for (const { path, label, icon } of HISTORICO_ESPERADOS) {
    const escapado = path.replace(/\//gu, '\\/');
    // Ate o fechamento do objeto (`}` ou `,`), nao pode aparecer `visibilidade:`.
    const bloco = new RegExp(`path: '${escapado}'[^}]*\\}`, 'u');
    const m = itens.match(bloco);
    assert.ok(m, `MENU_HISTORICO precisa declarar ${path}`);
    assert.doesNotMatch(m[0], /visibilidade:/u, `${path} e' visivel a todo mundo no desktop — nao pode levar visibilidade`);
    assert.match(itens, new RegExp(`icon: ${icon}\\s*[,}]`, 'u'), `icone de ${path} deveria ser ${icon}, igual ao AppSidebar`);
    assert.match(sidebar, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  }
});

test('a "Apresentacoes 2025" do AppSidebar fica FORA do bloco isAdmin (prova da fonte)', () => {
  // Ancora a premissa que separa os dois grupos: o bloco Admin fecha antes
  // do heading "Historico" comecar.
  const fimBlocoAdmin = sidebar.indexOf('Histórico');
  // Ancorado no NavLink (`to="..."`), nao na string solta — ela tambem
  // aparece antes, no prefetchMap do topo do arquivo, o que daria falso
  // negativo (prefetch nao e' o mesmo que "estar dentro do bloco isAdmin").
  const inicioApresentacoes = sidebar.indexOf('to="/app/apresentacoes-2025"');
  assert.ok(fimBlocoAdmin > -1 && inicioApresentacoes > -1, 'nao achei os marcadores no AppSidebar');
  assert.ok(inicioApresentacoes > fimBlocoAdmin, 'apresentacoes-2025 deveria vir DEPOIS do heading Historico, fora do isAdmin');
});

test('AppSidebar continua com o JSX hardcoded — nao foi migrado para MENU_ADMIN/MENU_HISTORICO', () => {
  assert.doesNotMatch(sidebar, /from '@\/lib\/menuItems'[\s\S]{0,120}MENU_ADMIN/u);
  assert.doesNotMatch(sidebar, /MENU_ADMIN/u, 'a duplicacao e temporaria e consciente — nao ligar o AppSidebar nela');
  assert.doesNotMatch(sidebar, /MENU_HISTORICO/u, 'idem para o bloco Historico');
});

test('a folha "Mais" tem as secoes "Administração" e "Histórico", cada uma filtrada', () => {
  assert.match(sheet, /MENU_ADMIN/u);
  assert.match(sheet, /MENU_HISTORICO/u);
  assert.match(sheet, /<Grupo titulo="Administração" itens=\{admin\}/u);
  assert.match(sheet, /<Grupo titulo="Histórico" itens=\{historico\}/u);
  assert.match(sheet, /const admin = filtrarVisiveis\(MENU_ADMIN, contexto\)/u);
  assert.match(sheet, /const historico = filtrarVisiveis\(MENU_HISTORICO, contexto\)/u);
});
