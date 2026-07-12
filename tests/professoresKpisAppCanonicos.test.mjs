import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';

const helper = read('src/lib/professoresKpisCanonicos.ts');
const dashboard = read('src/components/App/Dashboard/DashboardPage.tsx');
const cadastro = read('src/components/App/Professores/ProfessoresPage.tsx');
const analytics = read('src/components/GestaoMensal/TabProfessoresNew.tsx');
const carteira = read('src/components/App/Professores/TabCarteiraProfessores.tsx');
const hook = read('src/hooks/useKPIsProfessor.ts');
const modalTurmas = read('src/components/App/Professores/ModalDetalhesTurmas.tsx');
const performance = read('src/components/App/Professores/TabPerformanceProfessores.tsx');
const retencao = read('src/hooks/useProfessoresPerformance.ts');

test('helper centraliza a RPC e a media ponderada canonica', () => {
  assert.match(helper, /get_kpis_professor_periodo_canonico/);
  assert.match(helper, /alunos_via_turmas/);
  assert.match(helper, /turmas_elegiveis_media/);
  assert.match(helper, /totalOcupacoes\s*\/\s*totalTurmasElegiveis/);
});

test('dashboard nao recalcula media de professores pela view operacional', () => {
  assert.match(dashboard, /buscarKpisProfessoresCanonicos/);
  assert.doesNotMatch(dashboard, /from\(['"]vw_turmas_implicitas['"]\)/);
});

test('cadastro de professores usa mapas canonicos por professor e unidade', () => {
  assert.match(cadastro, /buscarKpisProfessoresCanonicos/);
  assert.doesNotMatch(cadastro, /from\(['"]vw_turmas_implicitas['"]\)/);
  assert.doesNotMatch(cadastro, /M[eé]dia das m[eé]dias por professor/i);
});

test('analytics usa a RPC canonica e nao mistura views legadas de KPI', () => {
  assert.match(analytics, /buscarKpisProfessoresCanonicos/);
  assert.doesNotMatch(analytics, /vw_kpis_professor_(mensal|historico|completo)/);
  assert.doesNotMatch(analytics, /vw_evasoes_professores/);
  assert.doesNotMatch(analytics, /from\(['"]vw_turmas_implicitas['"]\)/);
});

test('carteira e hook nao publicam KPI de views legadas', () => {
  assert.match(carteira, /buscarKpisProfessoresCanonicos/);
  assert.doesNotMatch(carteira, /vw_kpis_professor_mensal/);
  assert.match(hook, /buscarKpisProfessoresCanonicos/);
  assert.doesNotMatch(hook, /vw_kpis_professor_completo/);
});

test('modal de turmas exibe resumo oficial recebido da fonte canonica', () => {
  assert.match(modalTurmas, /resumoCanonico/);
  assert.doesNotMatch(modalTurmas, /alunosAtivosUnicos\s*\/\s*totalTurmas/);
});

test('performance e retencao historica nao retornam para tabelas agregadas legadas', () => {
  assert.match(performance, /buscarKpisProfessoresCanonicos/);
  assert.doesNotMatch(performance, /vw_kpis_professor_mensal/);
  assert.match(retencao, /buscarKpisProfessoresCanonicos/);
  assert.doesNotMatch(retencao, /professores_performance/);
});
