import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const itens = readFileSync('src/lib/menuItems.tsx', 'utf8');
const sidebar = readFileSync('src/components/App/Layout/AppSidebar.tsx', 'utf8');
const sheet = readFileSync('src/mobile/MobileMaisSheet.tsx', 'utf8');

const ADMIN_ESPERADOS = [
  { path: '/app/admin/usuarios', label: 'Gerenciar Usuários', icon: 'UserCog' },
  { path: '/app/admin/permissoes', label: 'Permissões', icon: 'Shield' },
  { path: '/app/automacoes', label: 'Saúde das Automações', icon: 'Activity' },
  { path: '/app/apresentacoes-2025', label: 'Apresentações 2025', icon: 'FolderArchive' },
];

test('MENU_ADMIN tem os 4 destinos hardcoded no AppSidebar, todos admin-only', () => {
  for (const { path, label, icon } of ADMIN_ESPERADOS) {
    const escapado = path.replace(/\//gu, '\\/');
    const bloco = new RegExp(
      `path: '${escapado}'[^}]*?visibilidade: 'admin'`,
      'u',
    );
    assert.match(itens, bloco, `MENU_ADMIN precisa declarar ${path} com visibilidade: 'admin'`);
    assert.match(itens, new RegExp(`icon: ${icon}[,}]`, 'u'), `icone de ${path} deveria ser ${icon}, igual ao AppSidebar`);

    // Nao inventar rotulo: tem que ser o MESMO texto que o usuario ja ve
    // hoje no desktop (JSX hardcoded do AppSidebar).
    assert.match(sidebar, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  }
});

test('AppSidebar continua com o JSX hardcoded — nao foi migrado para MENU_ADMIN', () => {
  assert.doesNotMatch(sidebar, /from '@\/lib\/menuItems'[\s\S]{0,120}MENU_ADMIN/u);
  assert.doesNotMatch(sidebar, /MENU_ADMIN/u, 'a duplicacao e temporaria e consciente — nao ligar o AppSidebar nela');
});

test('a folha "Mais" ganhou a 3a secao "Administração", filtrada como as outras', () => {
  assert.match(sheet, /MENU_ADMIN/u);
  assert.match(sheet, /<Grupo titulo="Administração" itens=\{admin\}/u);
  assert.match(sheet, /const admin = filtrarVisiveis\(MENU_ADMIN, contexto\)/u);
});
