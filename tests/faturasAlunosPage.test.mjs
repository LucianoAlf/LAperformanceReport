import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

test('rota e menu operacional publicam Faturas de Alunos com prefetch', () => {
  const router = read('src/router.tsx');
  const sidebar = read('src/components/App/Layout/AppSidebar.tsx');
  assert.match(router, /FaturasAlunosPage/);
  assert.match(router, /path:\s*['"]faturas['"]/);
  assert.match(sidebar, /['"]\/app\/faturas['"]/);
  assert.match(sidebar, /label:\s*['"]Faturas['"]/);
  assert.match(sidebar, /components\/App\/FaturasAlunos/);
});

test('pagina consome o adaptador canonico e nunca acessa espelhos financeiros', () => {
  const page = read('src/components/App/FaturasAlunos/FaturasAlunosPage.tsx');
  assert.match(page, /carregarLeituraFaturasAlunos/);
  assert.match(page, /collectionAllowed/);
  assert.match(page, /get_inadimplencia_canonica|carregarLeituraFaturasAlunos/);
  assert.doesNotMatch(page, /sync_run_items|emusys_faturas|service_role|inadimplente_emusys/);
  assert.doesNotMatch(page, /0\.02|0\.01\s*\*/);
});

test('estados partial e bloqueados separam confirmados de reconciliacao', () => {
  const page = read('src/components/App/FaturasAlunos/FaturasAlunosPage.tsx');
  assert.match(page, /Leitura parcial/);
  assert.match(page, /aguardando confirma[cç][aã]o na origem/i);
  assert.match(page, /Snapshot expirado/);
  assert.match(page, /Leitura incompleta/);
  assert.match(page, /Falha na leitura financeira/);
  assert.match(page, /Nenhuma fatura confirmada no recorte/);
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

test('cards financeiros flexionam pessoa, elegibilidade, validacao e contato como frases inteiras', () => {
  const page = read('src/components/App/FaturasAlunos/FaturasAlunosPage.tsx');
  assert.match(page, /pessoasD2 === 1 \? 'pessoa elegível' : 'pessoas elegíveis'/);
  assert.match(page, /contactResolutionPendingCount === 1 \? 'contato pendente' : 'contatos pendentes'/);
  assert.doesNotMatch(page, /elegíveleis/);
});

test('valores financeiros preservam duas casas decimais em cards, tabela e detalhe', () => {
  const page = read('src/components/App/FaturasAlunos/FaturasAlunosPage.tsx');
  assert.match(page, /formatarMoedaFinanceira\s*=\s*\(value: number\).*formatCurrency\(value, 2\)/);
  assert.match(page, /value=\{formatarMoedaFinanceira\(state\.totalAtualizado\)\}/);
  assert.doesNotMatch(page, /format=\"currency\"/);
});
