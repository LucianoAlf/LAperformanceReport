import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('src/components/App/Professores/ProfessoresPage.tsx', 'utf8');

test('Cadastro é o único tab que inicia KPI canônico pesado no contêiner pai', () => {
  assert.match(source, /const carregarKpisCadastro\s*=\s*abaAtiva\s*===\s*['"]cadastro['"]/);
  assert.match(
    source,
    /carregarKpisCadastro\s*\?\s*buscarKpisProfessoresCanonicos\(filtroPeriodo\)\s*:\s*Promise\.resolve\(\[\]\)/,
  );
  assert.match(
    source,
    /carregarKpisCadastro\s*\?\s*buscarKpisTurmasCanonicos\(filtroPeriodo\)[\s\S]*?:\s*Promise\.resolve\(null\)/,
  );
});
