import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const ler = (arquivo) => fs.readFileSync(arquivo, 'utf8');

test('consumidores migrados apontam para o contrato V3 sem acesso direto às tabelas internas', () => {
  const consumidores = [
    ['src/lib/relatorioCoordenacaoInstantaneo.ts', /healthV3/],
    ['src/components/App/Professores/ProfessoresPage.tsx', /HEALTH_SCORE_V3_CONFIG_ENABLED/],
    ['src/components/App/Professores/ModalRelatorioCoordenacao.tsx', /health_score_v3/],
    ['src/components/App/Dashboard/DashboardPage.tsx', /useHealthScoreProfessorV3Performance/],
    ['src/components/App/Professores/TabCarteiraProfessores.tsx', /get_health_score_professor_v3_performance/],
  ];

  for (const [arquivo, contrato] of consumidores) {
    const fonte = ler(arquivo);
    assert.match(fonte, contrato, `${arquivo} deve consumir o contrato V3`);
    assert.doesNotMatch(fonte, /\.from\(['"]health_score_professor_v3_/i);
  }
});

test('motor e configuracao produtivos V2 permanecem identificaveis', () => {
  assert.match(
    ler('src/hooks/useHealthScore.ts'),
    /export function calcularHealthScore\s*\(/,
  );
  assert.match(
    ler('src/hooks/useHealthScoreConfig.ts'),
    /\.from\(['"]config_health_score_professor['"]\)/,
  );
});

test('KPIs produtivos de professor continuam na RPC canonica vigente', () => {
  assert.match(
    ler('src/lib/professoresKpisCanonicos.ts'),
    /\.rpc\(['"]get_kpis_professor_periodo_canonico_v3['"]\s*,/,
  );
});

test('consumidores migrados em homologacao preservam rollback explicito para V2', () => {
  const migrados = [
    ['src/components/App/Professores/TabPerformanceProfessores.tsx', 'VITE_HEALTH_SCORE_V3_PERFORMANCE_ENABLED'],
    ['src/components/App/Professores/ModalDetalhesProfessorPerformance.tsx', 'VITE_HEALTH_SCORE_V3_MODAL_ENABLED'],
  ];

  for (const [arquivo, flag] of migrados) {
    const fonte = ler(arquivo);
    assert.match(fonte, new RegExp(flag));
    assert.match(fonte, /calcularHealthScore/, `${arquivo} deve preservar rollback V2`);
  }
});

test('Carteira migrada deixa de compor Health Score no navegador', () => {
  const arquivo = 'src/components/App/Professores/TabCarteiraProfessores.tsx';
  const fonte = ler(arquivo);
  assert.match(fonte, /get_health_score_professor_v3_performance/);
  assert.doesNotMatch(fonte, /calcularHealthScore/);
});
