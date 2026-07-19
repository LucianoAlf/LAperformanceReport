import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(path, 'utf8');

test('serializador de IA preserva snapshot V3 e estados sem base', () => {
  const source = read('src/lib/healthScoreProfessorV3Performance.ts');

  assert.match(source, /export function serializeHealthScoreV3ForAi/);
  assert.match(source, /estado_publicacao/);
  assert.match(source, /ranking_habilitado/);
  assert.match(source, /motivo_sem_base/);
  assert.match(source, /valor_bruto/);
  assert.match(source, /metrica_publicavel/);
});

test('relatorio e insights individuais recebem V3 sem recalcular a V2', () => {
  const modal = read('src/components/App/Professores/ModalDetalhesProfessorPerformance.tsx');
  const insightsBlock = modal.slice(
    modal.indexOf('const gerarInsightsIA'),
    modal.indexOf('const gerarRelatorioIndividual'),
  );
  const reportBlock = modal.slice(
    modal.indexOf('const gerarRelatorioIndividual'),
    modal.indexOf('const copiarRelatorio'),
  );

  assert.match(modal, /serializeHealthScoreV3ForAi/);
  assert.match(modal, /health_score_v3/);
  assert.doesNotMatch(insightsBlock, /calcularHealthScore\s*\(/);
  assert.doesNotMatch(reportBlock, /calcularHealthScore\s*\(/);
});

test('geradores pedagogicos consomem V3 e nao recalculam Health Score legado', () => {
  const paths = [
    'supabase/functions/gemini-relatorio-professor-individual/index.ts',
    'supabase/functions/gemini-relatorio-coordenacao/index.ts',
    'supabase/functions/gemini-insights-professor/index.ts',
    'supabase/functions/gemini-insights-equipe/index.ts',
  ];

  for (const path of paths) {
    const source = read(path);
    assert.match(source, /health_score_v3/i, path);
    assert.match(source, /estado_publicacao/i, path);
    assert.match(source, /sem_base/i, path);
    assert.doesNotMatch(source, /function calcularHealthScore\s*\(/i, path);
  }
});

test('ranking V3 falha fechado enquanto o ciclo nao for oficial', () => {
  const source = read('supabase/functions/gemini-ranking-professores/index.ts');

  assert.match(source, /ranking_habilitado/i);
  assert.match(source, /estado_publicacao\s*!==\s*['"]oficial['"]/i);
  assert.doesNotMatch(source, /function calcularHealthScore\s*\(/i);
});

test('configuracao V2 fica somente leitura durante a observacao V3', () => {
  const source = read('src/components/App/Professores/ProfessoresPage.tsx');

  assert.match(source, /<HealthScoreConfig[\s\S]*?readOnly/);
  assert.match(source, /Hist[oó]rico V2/i);
});

test('Dashboard e Analytics usam snapshots V3 sem habilitar ranking parcial', () => {
  const dashboard = read('src/components/App/Dashboard/DashboardPage.tsx');
  const analytics = read('src/components/GestaoMensal/TabProfessoresNew.tsx');

  assert.match(dashboard, /useHealthScoreProfessorV3Performance/);
  assert.match(dashboard, /Health Score parcial/i);
  assert.match(analytics, /useHealthScoreProfessorV3Performance/);
  assert.match(analytics, /rankingHabilitado/);
  assert.match(analytics, /Health Score parcial/i);
});

test('Analytics consulta o ciclo pela competencia selecionada sem deslocar o mes', () => {
  const analytics = read('src/components/GestaoMensal/TabProfessoresNew.tsx');

  assert.match(analytics, /const healthReferenceMonth = mes;/);
  assert.doesNotMatch(analytics, /healthPeriodicity\s*===\s*['"]ciclo['"][\s\S]{0,120}mes\s*\+\s*1/);
});

test('Carteira usa o snapshot V3 e nao recalcula o Health Score legado', () => {
  const carteira = read('src/components/App/Professores/TabCarteiraProfessores.tsx');

  assert.match(carteira, /get_health_score_professor_v3_performance/);
  assert.match(carteira, /normalizeHealthScoreV3PerformanceRows/);
  assert.match(carteira, /estadoPublicacao/);
  assert.match(carteira, /health_score_estado_publicacao === 'parcial'/);
  assert.match(carteira, /Parcial/);
  assert.doesNotMatch(carteira, /calcularHealthScore\s*\(/);
});
