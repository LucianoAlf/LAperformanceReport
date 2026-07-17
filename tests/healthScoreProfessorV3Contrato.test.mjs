import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const arquivosV2 = [
  'src/hooks/useHealthScore.ts',
  'src/hooks/useHealthScoreConfig.ts',
  'src/lib/professoresKpisCanonicos.ts',
  'src/lib/relatorioCoordenacaoInstantaneo.ts',
  'src/components/App/Professores/ProfessoresPage.tsx',
  'src/components/App/Professores/TabPerformanceProfessores.tsx',
  'src/components/App/Professores/TabCarteiraProfessores.tsx',
  'src/components/App/Professores/ModalDetalhesProfessorPerformance.tsx',
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

test('telas produtivas continuam compondo o score pelo motor V2', () => {
  for (const arquivo of [
    'src/components/App/Professores/TabPerformanceProfessores.tsx',
    'src/components/App/Professores/TabCarteiraProfessores.tsx',
    'src/components/App/Professores/ModalDetalhesProfessorPerformance.tsx',
  ]) {
    assert.match(
      ler(arquivo),
      /calcularHealthScore/,
      `${arquivo} deve continuar no motor V2 durante a sombra`,
    );
  }
});
