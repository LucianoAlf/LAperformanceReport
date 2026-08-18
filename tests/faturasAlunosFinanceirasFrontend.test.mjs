import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file) => readFileSync(file, 'utf8');

test('visao financeira consome a RPC global, sem consulta direta a espelhos ou alunos', () => {
  const reader = read('src/lib/faturasAlunosFinanceiras.ts');
  const page = read('src/components/App/FaturasAlunos/FaturasAlunosFinanceirasPage.tsx');

  assert.match(reader, /get_faturas_alunos_financeiro_v1/);
  assert.match(reader, /p_modo_periodo/);
  assert.match(reader, /p_status/);
  assert.match(page, /carregarFaturasAlunosFinanceiras/);
  assert.doesNotMatch(page, /\.from\(['"](?:alunos|sync_run_items|emusys_faturas)['"]\)/);
  assert.doesNotMatch(page, /0\.02|0\.01\s*\*/);
});

test('pagina usa selects do design system e apresenta o ciclo inteiro da fatura', () => {
  const page = read('src/components/App/FaturasAlunos/FaturasAlunosFinanceirasPage.tsx');

  assert.match(page, /from ['"]@\/components\/ui\/select['"]/);
  assert.match(page, /<SelectTrigger/);
  assert.match(page, /<SelectContent/);
  assert.doesNotMatch(page, /<select\b/);

  for (const label of [
    'Todas as faturas',
    'Pagas',
    'Em aberto',
    'Em atraso',
    'A vencer',
    'Canceladas',
    'Reconcilia',
    'Valor com desconto',
    'Sem desconto condicional',
    'Valor atualizado',
    'Calculado pelo contrato',
    'Forma prevista',
    'Pago via',
  ]) {
    assert.match(page, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
  assert.doesNotMatch(page, /Cobrar agora D\+2/);
  assert.doesNotMatch(page, /Em atraso D\+0/);
  assert.doesNotMatch(page, /Valor hoje/i);
});

test('cartoes de resumo mapeiam quantidade e valor retornados pela leitura canonica', () => {
  const page = read('src/components/App/FaturasAlunos/FaturasAlunosFinanceirasPage.tsx');

  assert.doesNotMatch(page, /<MetricCard[^>]*\{\.\.\.state\.totals\./);

  for (const situacao of ['todas', 'pagas', 'em_aberto', 'em_atraso_d0', 'a_vencer']) {
    assert.match(page, new RegExp(`count=\\{state\\.totals\\.${situacao}\\.quantidade\\}`));
    assert.match(page, new RegExp(`value=\\{state\\.totals\\.${situacao}\\.valor\\}`));
  }
});

test('reconciliacao financeira fica na pagina dedicada e D+2 permanece fora desta tela', () => {
  const page = read('src/components/App/FaturasAlunos/FaturasAlunosFinanceirasPage.tsx');

  assert.match(page, /Reconcilia[cç][aã]o financeira/i);
  assert.match(page, /sourceMissing/);
  assert.match(page, /identidadeInvalida/);
  assert.match(page, /source_missing|nao observada na origem/i);
  assert.doesNotMatch(page, /Cobrar agora D\+2/);
  assert.doesNotMatch(page, /\/app\/alunos\?tab=conciliacao/);
});

test('faturas usa a competencia mensal do layout e nunca nasce em janela de tres meses', () => {
  const page = read('src/components/App/FaturasAlunos/FaturasAlunosFinanceirasPage.tsx');

  assert.match(page, /modoPeriodo\s*=\s*['"]competencia['"]/);
  assert.match(page, /context\?\.competencia/);
  assert.doesNotMatch(page, /value=\{competenciaParam\?\.value\s*\?\?\s*['"]janela_3['"]\}/);
  assert.doesNotMatch(page, /Últimas 3 competências/);
});

test('unidade vem do escopo autenticado e nao existe seletor local duplicado', () => {
  const page = read('src/components/App/FaturasAlunos/FaturasAlunosFinanceirasPage.tsx');

  assert.match(page, /useAuth\(\)/);
  assert.match(page, /isAdmin/);
  assert.match(page, /unidadeId/);
  assert.doesNotMatch(page, /<SelectItem value="todos">Todas as unidades<\/SelectItem>/);
});

test('cards sao os filtros principais e acoes operacionais ficam separadas', () => {
  const page = read('src/components/App/FaturasAlunos/FaturasAlunosFinanceirasPage.tsx');

  assert.doesNotMatch(page, /<PageTabs/);
  assert.match(page, /aria-pressed=\{active\}/);
  assert.match(page, /Reconciliação financeira/);
  assert.match(page, /Canceladas/);
});

test('formas de pagamento possuem icones semanticamente distintos', () => {
  const page = read('src/components/App/FaturasAlunos/FaturasAlunosFinanceirasPage.tsx');

  for (const icon of ['QrCode', 'CreditCard', 'Barcode', 'FileCheck2', 'Banknote', 'Landmark', 'CircleHelp']) {
    assert.match(page, new RegExp(icon));
  }
  assert.match(page, /normalizarFormaPagamento/);
  assert.match(page, /iconeFormaPagamento/);
});

test('contrato financeiro expõe foto atual do aluno e fallback legado', () => {
  const migrationPath = 'supabase/migrations/20260817221354_financeiro_faturas_aluno_fotos.sql';
  assert.ok(existsSync(migrationPath), 'a migration de fotos da fatura precisa existir');
  const migration = read(migrationPath);

  assert.match(migration, /financeiro_enriquecer_fatura_item/);
  assert.match(migration, /'foto_url'/);
  assert.match(migration, /'photo_url'/);
  assert.match(migration, /unidade_id/);
});
