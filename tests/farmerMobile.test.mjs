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

// ─── Etapa 2 (29/09): botão de seção + Dashboard em resumo ─────────────────
//
// Aprovado pelo Hugo em 29/09, com a exigência: "o botão tem que funcionar
// exatamente como as abas hoje funcionam". Por isso a folha não tem lista
// própria — lê a mesma `tabs`/`subTabs` e chama a mesma troca.

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const leRaiz = (p) => readFileSync(join(RAIZ, p), 'utf8').replace(/\r\n/g, '\n');
const semComentarios = (f) => f.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const { montarLinhasResumo } = await (async () => {
  const { outputFiles } = await esbuild.build({
    entryPoints: [join(RAIZ, 'src/lib/farmerResumo.ts')], bundle: true, format: 'esm', write: false,
  });
  const arq = join(mkdtempSync(join(tmpdir(), 'farmer-')), 'farmerResumo.mjs');
  writeFileSync(arq, outputFiles[0].text);
  return import(pathToFileURL(arq).href);
})();

const BASE = {
  checklistsComAlerta: 0, checklistsVencidos: 0, totalAlertas: 0, renovacoesVencidas: 0,
  tarefasAtrasadas: 0, tarefasTotal: 0, rotinasConcluidas: 0, rotinasTotal: 0,
  alunosCriticos: 0, professoresSemFeedback: 0, equipe: 0,
};
const linha = (e, chave) => montarLinhasResumo({ ...BASE, ...e }).find((l) => l.chave === chave);

test('a ordem aprovada: vencido, depois o do dia, depois o contexto', () => {
  assert.deepEqual(
    montarLinhasResumo(BASE).map((l) => l.chave),
    ['checklists', 'alertas', 'tarefas', 'rotinas', 'criticos', 'feedback', 'equipe'],
  );
});

test('🔴 linha sem bloco não abre — o computador também não desenha o bloco', () => {
  // Checklists, tarefas e equipe só existem no computador com conteúdo.
  assert.equal(linha({}, 'checklists').abre, false);
  assert.equal(linha({ checklistsComAlerta: 1 }, 'checklists').abre, true);
  assert.equal(linha({}, 'tarefas').abre, false);
  assert.equal(linha({ tarefasTotal: 2 }, 'tarefas').abre, true);
  assert.equal(linha({}, 'equipe').abre, false);
  // Alertas e rotinas existem sempre (com "Tudo em dia" / "Nenhuma rotina").
  assert.equal(linha({}, 'alertas').abre, true);
  assert.equal(linha({}, 'rotinas').abre, true);
});

test('o tom: rosa pede ação hoje, âmbar pede atenção, zerado fica neutro', () => {
  assert.equal(linha({ checklistsComAlerta: 2, checklistsVencidos: 1 }, 'checklists').tom, 'critico');
  assert.equal(linha({ checklistsComAlerta: 2 }, 'checklists').tom, 'atencao');
  assert.equal(linha({ totalAlertas: 5, renovacoesVencidas: 1 }, 'alertas').tom, 'critico');
  assert.equal(linha({ totalAlertas: 5 }, 'alertas').tom, 'atencao');
  assert.equal(linha({}, 'alertas').tom, 'neutro');
  assert.equal(linha({ tarefasTotal: 3, tarefasAtrasadas: 1 }, 'tarefas').tom, 'critico');
  assert.equal(linha({ rotinasConcluidas: 1, rotinasTotal: 3 }, 'rotinas').tom, 'atencao');
  assert.equal(linha({ rotinasConcluidas: 3, rotinasTotal: 3 }, 'rotinas').tom, 'neutro');
  assert.equal(linha({ rotinasConcluidas: 1, rotinasTotal: 3 }, 'rotinas').valor, '1/3');
  assert.equal(linha({ alunosCriticos: 36 }, 'criticos').tom, 'critico');
  assert.equal(linha({ alunosCriticos: 1 }, 'criticos').rotulo, 'Aluno com saúde crítica');
});

test('🔴 o botão das abas usa a MESMA lista e a MESMA troca do trilho', () => {
  const pt = semComentarios(leRaiz('src/components/ui/page-tabs.tsx'));
  const i = pt.indexOf('seletorNoCelular !== undefined');
  const bloco = pt.slice(i);
  assert.match(bloco, /tabs\.filter\(t => !t\.disabled\)\.map/, 'a folha deixou de ler a lista das abas');
  assert.match(bloco, /onClick=\{\(\) => onTabChange\(tab\.id\)\}/, 'a folha deixou de chamar a troca das abas');
  // O bloco do computador segue sem condição nenhuma do botão.
  assert.match(pt, /\{\/\* Desktop Tabs \*\/\}|<div className="hidden lg:block">/);

  const adm = leRaiz('src/components/App/Administrativo/AdministrativoPage.tsx');
  assert.match(adm, /seletorNoCelular="Administrativo"/);
  assert.equal((adm.match(/<PageTabs\b/g) ?? []).length, 1, 'as abas principais existem num lugar só');
  assert.match(adm, /abasPaiNoCelular=\{ehCelular \? abasPrincipais : undefined\}/);

  const pf = semComentarios(le('index.tsx'));
  const cel = pf.slice(pf.indexOf('if (abasPaiNoCelular)'), pf.indexOf('function conteudo()'));
  assert.match(cel, /subTabs\.map/);
  assert.match(cel, /onClick=\{\(\) => setActiveSubTab\(tab\.id\)\}/);
  // O conteúdo das sub-abas é um só para os dois ramos.
  assert.equal((pf.match(/\{conteudo\(\)\}/g) ?? []).length, 2);
});

test('🔴 o Dashboard do celular abre os MESMOS blocos do computador', () => {
  const d = semComentarios(le('DashboardTab.tsx'));
  for (const b of ['blocoChecklists', 'blocoAlertasDia', 'blocoTarefas', 'blocoRotinas', 'blocoEquipe']) {
    assert.equal((d.match(new RegExp(`const ${b} = \\(`, 'g')) ?? []).length, 1, `${b} declarado uma vez`);
    // Usado no ramo do celular E no do computador.
    assert.ok((d.match(new RegExp(`\\b${b}\\b`, 'g')) ?? []).length >= 3, `${b} não chega aos dois ramos`);
  }
  // O modal de Nova Tarefa fica fora da bifurcação.
  assert.match(d, /<\/>\s*\)\}\s*<Dialog open=\{modalNovaTarefaAberto\}/, 'o modal caiu para dentro de um ramo');
  // Cartão do computador e linha do celular vão para o mesmo endereço.
  assert.equal((d.match(/LINK_ALUNOS_CRITICOS/g) ?? []).length, 3);
  assert.equal((d.match(/LINK_ENVIAR_FEEDBACK/g) ?? []).length, 3);

  const m = semComentarios(leRaiz('src/mobile/telas/farmer/DashboardFarmerMobile.tsx'));
  assert.doesNotMatch(m, /supabase|use(Alertas|Tarefas|Rotinas|DashboardStats)\(/, 'a tela do celular não busca nada');
  assert.doesNotMatch(m, /AlertaItem|RotinaItem|TarefaItem/, 'nenhum bloco do computador foi copiado');
});

test('os dois botões do topo têm alvo de 44px; a Agenda segue compacta', () => {
  assert.match(leRaiz('src/components/ui/page-tabs.tsx'), /compacto\n\s*alvoCheio\n/);
  assert.match(le('index.tsx'), /<SeletorSecaoMobile ehCelular compacto alvoCheio /);
  assert.match(leRaiz('src/mobile/SeletorSecaoMobile.tsx'), /alvoCheio \? 'min-h-\[44px\] px-3' : 'min-h-\[32px\] px-2\.5'/);
  assert.doesNotMatch(leRaiz('src/components/App/Agenda/AgendaPage.tsx'), /alvoCheio/);
});
