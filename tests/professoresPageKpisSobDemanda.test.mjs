import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('src/components/App/Professores/ProfessoresPage.tsx', 'utf8');

test('Cadastro é o único tab que inicia KPI canônico pesado no contêiner pai', () => {
  assert.match(source, /const carregarKpisCadastro\s*=\s*abaAtiva\s*===\s*['"]cadastro['"]/);
  assert.match(
    source,
    /carregarKpisCadastro\s*\?\s*await buscarKpisProfessoresCadastroCanonicos\(filtroPeriodo\)\s*:\s*\[\]/,
  );
  assert.doesNotMatch(source, /buscarKpisProfessoresCanonicos\(filtroPeriodo\)/);
  assert.doesNotMatch(source, /buscarKpisTurmasCanonicos\(filtroPeriodo\)/);
});

test('Performance e Carteira não carregam a base do Cadastro no contêiner pai', () => {
  assert.match(
    source,
    /const carregarDados = async \(\) => \{[\s\S]*?if \(abaAtiva !== ['"]cadastro['"]\) \{\s*setLoading\(false\);\s*return;\s*\}[\s\S]*?await carregarProfessores\(\);/,
  );
});
