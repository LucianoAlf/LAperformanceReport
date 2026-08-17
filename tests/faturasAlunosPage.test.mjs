import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

test('rota e menu operacional publicam a tela financeira de Faturas', () => {
  const router = read('src/router.tsx');
  const sidebar = read('src/components/App/Layout/AppSidebar.tsx');
  const entrypoint = read('src/components/App/FaturasAlunos/index.ts');
  const compatibility = read('src/components/App/FaturasAlunos/FaturasAlunosPage.tsx');

  assert.match(router, /FaturasAlunosPage/);
  assert.match(router, /path:\s*['"]faturas['"]/);
  assert.match(sidebar, /['"]\/app\/faturas['"]/);
  assert.match(sidebar, /label:\s*['"]Faturas['"]/);
  assert.match(sidebar, /components\/App\/FaturasAlunos/);
  assert.match(entrypoint, /FaturasAlunosFinanceirasPage/);
  assert.match(compatibility, /FaturasAlunosFinanceirasPage/);
});

test('pagina publicada consome o adaptador financeiro e nunca acessa espelhos', () => {
  const page = read('src/components/App/FaturasAlunos/FaturasAlunosFinanceirasPage.tsx');

  assert.match(page, /carregarFaturasAlunosFinanceiras/);
  assert.match(page, /collectionAllowed/);
  assert.match(page, /get_faturas_alunos_financeiro_v1|carregarFaturasAlunosFinanceiras/);
  assert.doesNotMatch(page, /sync_run_items|emusys_faturas|service_role|inadimplente_emusys/);
  assert.doesNotMatch(page, /0\.02|0\.01\s*\*/);
});

test('estados partial e stale separam consulta, reconciliacao e cobranca', () => {
  const page = read('src/components/App/FaturasAlunos/FaturasAlunosFinanceirasPage.tsx');

  assert.match(page, /Leitura parcial/);
  assert.match(page, /Reconcilia/);
  assert.match(page, /Snapshot expirado/);
  assert.match(page, /histórico em consulta/i);
  assert.match(page, /Cobrar agora D\+2/);
  assert.match(page, /!state\.collectionAllowed/);
  assert.doesNotMatch(page, /source_missing[^\n]{0,80}(?:paga|pago)/i);
});

test('atalhos A+C usam a mesma URL canonica em Alunos, ficha e Comercial', () => {
  const alunos = read('src/components/App/Alunos/AlunosPage.tsx');
  const tabela = read('src/components/App/Alunos/TabelaAlunos.tsx');
  const ficha = read('src/components/App/Alunos/ModalFichaAluno.tsx');
  const comercial = read('src/components/App/Comercial/ComercialPage.tsx');
  for (const source of [alunos, tabela, ficha, comercial]) {
    assert.match(source, /criarUrlFaturasAlunos/);
  }
  assert.match(ficha, /Ver faturas can[oô]nicas/i);
  assert.match(comercial, /Faturas de alunos/i);
});

test('tabela financeira mostra forma e os tres valores contratuais', () => {
  const page = read('src/components/App/FaturasAlunos/FaturasAlunosFinanceirasPage.tsx');

  assert.match(page, /const moeda\s*=\s*\(value: number\)\s*=>\s*formatCurrency\(value, 2\)/);
  assert.match(page, /Valor com desconto/);
  assert.match(page, /Sem desconto condicional/);
  assert.match(page, /Valor hoje/);
  assert.match(page, /rotuloFormaPagamento/);
  assert.match(page, /Pago via/);
  assert.match(page, /Forma prevista/);
  assert.doesNotMatch(page, /format="currency"/);
});
