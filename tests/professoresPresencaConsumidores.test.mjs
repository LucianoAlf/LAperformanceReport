import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

const performance = read('src/components/App/Professores/TabPerformanceProfessores.tsx');
const plano = read('src/components/App/Professores/PlanoAcaoEquipe.tsx');
const modalCoordenacao = read('src/components/App/Professores/ModalRelatorioCoordenacao.tsx');
const relatorioInstantaneo = read('src/lib/relatorioCoordenacaoInstantaneo.ts');
const edgeEquipe = read('supabase/functions/gemini-insights-equipe/index.ts');
const edgeProfessor = read('supabase/functions/gemini-insights-professor/index.ts');
const edgeIndividual = read('supabase/functions/gemini-relatorio-professor-individual/index.ts');
const edgeCoordenacao = read('supabase/functions/gemini-relatorio-coordenacao/index.ts');
const edgeRanking = read('supabase/functions/gemini-ranking-professores/index.ts');

test('performance bloqueia presenca e health sem confianca alta', () => {
  assert.match(performance, /presenca_publicavel/);
  assert.match(performance, /health_score_confiavel/);
  assert.match(performance, /Em auditoria/);
  assert.match(performance, /professor\.presenca_publicavel\s*&&\s*professor\.taxa_presenca\s*!==\s*null/);
});

test('plano de equipe transporta a qualidade da presenca sem converter null em zero', () => {
  assert.match(plano, /taxa_presenca:\s*number\s*\|\s*null/);
  assert.match(plano, /presenca_publicavel:\s*boolean/);
  assert.match(plano, /health_score_v3:\s*HealthScoreV3AiPayload\s*\|\s*null/);
  assert.doesNotMatch(plano, /taxa_presenca\s*\|\|\s*0/);
});

test('relatorios instantaneos preservam null e bloqueiam ranking de presenca e health', () => {
  assert.match(relatorioInstantaneo, /taxa_presenca:\s*number\s*\|\s*null/);
  assert.match(relatorioInstantaneo, /presenca_publicavel:\s*boolean/);
  assert.match(relatorioInstantaneo, /health_score_confiavel:\s*boolean/);
  assert.match(relatorioInstantaneo, /Presenca em auditoria/i);
  assert.doesNotMatch(relatorioInstantaneo, /taxa_presenca:\s*numeroSeguro\s*\(/);
});

test('modal da coordenacao envia KPIs canonicos enriquecidos com o Health Score V3', () => {
  assert.match(modalCoordenacao, /buscarKpisProfessoresCanonicos/);
  assert.match(modalCoordenacao, /get_kpis_professor_periodo_canonico_v2|buscarKpisProfessoresCanonicos/);
  assert.match(modalCoordenacao, /const\s+kpisComHealthV3\s*=\s*kpisCanonicos\.map/);
  assert.match(modalCoordenacao, /health_score_v3:\s*serializeHealthScoreV3ForAi/);
  assert.match(modalCoordenacao, /kpis_professores:\s*kpisComHealthV3/);
});

test('edges de professores respeitam o bloqueio de publicacao', () => {
  for (const source of [edgeEquipe, edgeProfessor, edgeIndividual, edgeCoordenacao, edgeRanking]) {
    assert.match(source, /presenca_publicavel/);
  }
  assert.doesNotMatch(edgeEquipe, /taxa_presenca:\s*number;/);
  assert.doesNotMatch(edgeIndividual, /taxa_presenca:\s*number;/);
  assert.doesNotMatch(edgeRanking, /Number\(p\.media_presenca\)\s*\|\|\s*0/);
});
