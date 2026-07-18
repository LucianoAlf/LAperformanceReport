import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const arquivosV2 = [
  'src/hooks/useHealthScore.ts',
  'src/hooks/useHealthScoreConfig.ts',
  'src/lib/professoresKpisCanonicos.ts',
  'src/lib/relatorioCoordenacaoInstantaneo.ts',
  'src/components/App/Professores/ProfessoresPage.tsx',
  'src/components/App/Professores/TabCarteiraProfessores.tsx',
  'src/components/App/Professores/ModalRelatorioCoordenacao.tsx',
  'src/components/App/Dashboard/DashboardPage.tsx',
];

const ler = (arquivo) => fs.readFileSync(arquivo, 'utf8');

test('consumidores produtivos V2 nao apontam para objetos do Health Score V3', () => {
  for (const arquivo of arquivosV2) {
    const fonte = ler(arquivo);
    assert.doesNotMatch(
      fonte,
      /health_score_professor_v3_|get_(?:health_score|professor_\w+)_v3_sombra/i,
      `${arquivo} nao pode consumir a camada V3 antes do cutover`,
    );
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

test('consumidores ainda nao migrados continuam compondo o score pelo motor V2', () => {
  const arquivo = 'src/components/App/Professores/TabCarteiraProfessores.tsx';
  assert.match(
    ler(arquivo),
    /calcularHealthScore/,
    `${arquivo} deve continuar no motor V2 durante a sombra`,
  );
});
