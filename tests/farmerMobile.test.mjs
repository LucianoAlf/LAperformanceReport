// Painel Farmer no celular (LAPE-32, 29/09/2026).
//
// A Farmer já empilhava em uma coluna; o que estava quebrado, medido a 390px
// com login real: Rotinas com 1.197px de largura (a fileira "Ver rotinas de"
// não quebrava), Checklists 31px além da borda (o cabeçalho com dois botões),
// 19 alvos abaixo de 44px e as ações de editar/excluir escondidas até o
// mouse passar — no telefone não há mouse, então elas nunca apareciam.
//
// Tudo com `max-lg:`: acima de 1024px nenhuma dessas classes existe, então o
// computador não muda por construção. Este teste trava o que foi corrigido.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PASTA = 'src/components/App/Administrativo/PainelFarmer/';
const le = (arq) => readFileSync(join(RAIZ, PASTA, arq), 'utf8').replace(/\r\n/g, '\n');

test('🔴 nenhuma ação fica escondida atrás do hover no celular', () => {
  // `opacity-0 group-hover:opacity-100` sem o par de celular = botão invisível
  // no telefone. Toda ocorrência tem de trazer `max-lg:opacity-100`.
  for (const arq of ['RotinasTab.tsx', 'TarefasTab.tsx', 'DashboardTab.tsx', 'ChecklistDetail.tsx']) {
    const fonte = le(arq);
    const ocultas = fonte.match(/opacity-0 group-hover(?:\/\w+)?:opacity-100[^"'`]*/g) ?? [];
    assert.ok(ocultas.length > 0, `${arq}: o padrão de hover sumiu — conferir o teste`);
    for (const o of ocultas) {
      assert.match(o, /max-lg:opacity-100/, `${arq}: ação escondida no celular: ${o}`);
    }
  }
});

test('🔴 as fileiras que estouravam a largura quebram linha no celular', () => {
  const rot = le('RotinasTab.tsx');
  assert.match(rot, /👤 Ver rotinas de:<\/span>\n\s*<div className="flex gap-2 max-lg:flex-wrap">/);
  assert.match(rot, /Filtros por Frequência \*\/\}\n\s*<div className="flex gap-2 max-lg:flex-wrap">/);
  for (const [arq, titulo] of [['RotinasTab.tsx', 'Minhas Rotinas'], ['ChecklistsTab.tsx', 'Checklists'], ['TarefasTab.tsx', 'Tarefas']]) {
    const f = le(arq);
    const i = f.indexOf(`>${titulo}</h3>`);
    const cab = f.lastIndexOf('<div className="flex items-center justify-between', i);
    assert.match(f.slice(cab, i), /max-lg:flex-wrap/, `${arq}: o cabeçalho voltou a não quebrar`);
  }
});

test('alvos de toque de 44px nos filtros, nas sub-abas e nas ações', () => {
  assert.match(le('index.tsx'), /border-b-0 max-lg:min-h-\[44px\]/);
  assert.equal((le('RotinasTab.tsx').match(/'px-3 py-1\.5 rounded-lg text-sm font-medium transition-all max-lg:min-h-\[44px\]'/g) ?? []).length, 3);
  const chk = le('ChecklistsTab.tsx');
  assert.match(chk, /'px-3 py-1\.5 text-xs font-medium rounded-lg transition-all max-lg:min-h-\[44px\]'/);
  assert.match(chk, /'px-3 py-1\.5 text-xs font-medium rounded-lg border transition-all max-lg:min-h-\[44px\]'/);
  const tar = le('TarefasTab.tsx');
  // A bolinha de concluir segue com 24px; o toque cresce por um pseudo-elemento.
  assert.match(tar, /'w-6 h-6 rounded-full[^']*max-lg:before:-inset-\[10px\]/);
  assert.match(tar, /onClick=\{onDelete\} className="max-lg:min-w-\[44px\]"/);
  assert.match(le('DashboardTab.tsx'), /h-7 w-7 p-0 text-slate-400 hover:text-rose-400 max-lg:h-11 max-lg:w-11/);
});
