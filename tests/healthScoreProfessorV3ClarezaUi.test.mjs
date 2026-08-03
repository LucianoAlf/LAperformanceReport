import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import * as healthScoreV3 from '../src/lib/healthScoreProfessorV3Performance.ts';

const tabPath = new URL(
  '../src/components/App/Professores/TabPerformanceProfessores.tsx',
  import.meta.url,
);
const modalPath = new URL(
  '../src/components/App/Professores/ModalDetalhesProfessorPerformance.tsx',
  import.meta.url,
);

test('distingue valor visivel de pilar que realmente compoe a nota', () => {
  assert.equal(
    typeof healthScoreV3.doesHealthScoreV3MetricContributeToScore,
    'function',
    'deve existir uma unica regra de apresentacao para identificar pilares que compoem a nota',
  );

  const contributes = healthScoreV3.doesHealthScoreV3MetricContributeToScore;

  assert.equal(contributes({
    papel: 'nota',
    nota: 70.42,
    pesoDisponivel: true,
    pesoEfetivo: 45.4545,
    detalhes: {},
  }), true, 'permanencia valida deve aparecer como parte da nota');

  assert.equal(contributes({
    papel: 'nota',
    nota: null,
    pesoDisponivel: false,
    pesoEfetivo: 0,
    detalhes: {},
  }), false, 'retencao apenas observada nao pode parecer parte da nota');

  assert.equal(contributes({
    papel: 'nota',
    nota: null,
    pesoDisponivel: false,
    pesoEfetivo: 0,
    detalhes: { nao_compoe_nota_atual: true },
  }), false, 'referencia do mes anterior deve ficar explicitamente fora da nota atual');

  assert.equal(contributes({
    papel: 'diagnostico',
    nota: null,
    pesoDisponivel: false,
    pesoEfetivo: 0,
    detalhes: {},
  }), false, 'carteira diagnostica nunca deve compor a nota');
});

test('tabela mantem contexto das colunas e explica base em formacao sem quebra ruim', () => {
  const source = fs.readFileSync(tabPath, 'utf8');
  const modalSource = fs.readFileSync(modalPath, 'utf8');

  assert.match(source, /<thead[^>]*className="[^"]*sticky[^"]*"/);
  assert.match(source, /className="[^"]*max-h-\[70vh\][^"]*overflow-auto[^"]*"/);
  assert.match(source, /<thead[^>]*className="[^"]*top-0[^"]*"/);
  assert.match(source, /Nota em forma[cç][aã]o/i);
  assert.match(source, /fora da nota/i);
  assert.match(source, /whitespace-nowrap/);
  assert.match(modalSource, /Nota em forma/i);
  assert.match(modalSource, /pilares na nota/i);
  assert.match(modalSource, /Compõe a nota/i);
  assert.match(modalSource, /Diagnóstico · fora da nota/i);
  assert.match(modalSource, /whitespace-nowrap/);
  assert.doesNotMatch(modalSource, /Desempenho observado/i);
  assert.doesNotMatch(modalSource, /V3 em matura/i);
  assert.doesNotMatch(source, /professor\{alerta\.quantidade[\s\S]{0,900}em matura[cç][aã]o[\s\S]{0,120}\? 's'/i);
});
