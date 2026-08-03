import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareHealthScoreV3OperationalRows,
  normalizeHealthScoreV3PerformanceRows,
  resolveHealthScoreV3EvidenceMessage,
  resolveHealthScoreV3UiStatus,
  serializeHealthScoreV3ForAi,
} from '../src/lib/healthScoreProfessorV3Performance.ts';

function row(overrides = {}) {
  return {
    professor_id: 62,
    unidade_id: 'cg',
    escopo: 'unidade',
    competencia: '2026-07-01',
    trimestre_inicio: '2026-07-01',
    periodicidade: 'mensal',
    periodo_inicio: '2026-07-01',
    periodo_fim: '2026-07-31',
    ciclo_codigo: '2026-07',
    estado_publicacao: 'parcial',
    score_exibivel: false,
    ranking_habilitado: false,
    config_versao: 4,
    revisao: 1,
    score: 100,
    score_observado: 100,
    score_comparavel: null,
    cobertura: 15,
    pilares_validos: 1,
    pilares_esperados: 5,
    comparabilidade_estado: 'em_maturacao',
    comparabilidade_motivo: 'pilares_insuficientes',
    competencia_referencia: null,
    score_referencia: null,
    classificacao_referencia: null,
    classificacao: null,
    estado: 'em_maturacao',
    snapshot_publicavel: false,
    publicado: false,
    motivo_bloqueio: 'pilares_insuficientes',
    regra_versao_snapshot: 'v3-comparabilidade',
    metrica: 'media_turma',
    valor_bruto: 2.17,
    numerador: 13,
    denominador: 6,
    nota: 100,
    peso: 15,
    peso_disponivel: true,
    peso_efetivo: 100,
    contribuicao: 100,
    meta: 1.5,
    amostra: 6,
    estado_base: 'ok',
    metrica_publicavel: true,
    confianca: 'alta',
    fonte: 'canonica',
    regra_versao_metrica: 'v3',
    motivo_sem_base: null,
    codigo_evidencia: 'evidencia_valida',
    papel: 'nota',
    detalhes: {},
    ...overrides,
  };
}

test('normalizador preserva observado sem promove-lo a Health Score comparavel', () => {
  const [adriana] = normalizeHealthScoreV3PerformanceRows([row()]);

  assert.equal(adriana.scoreObservado, 100);
  assert.equal(adriana.scoreComparavel, null);
  assert.equal(adriana.comparabilidadeEstado, 'em_maturacao');
  assert.equal(adriana.pilaresValidos, 1);
  assert.equal(adriana.pilaresEsperados, 5);
  assert.equal(adriana.classificacao, null);
  assert.equal(resolveHealthScoreV3UiStatus(adriana), 'em_maturacao');
});

test('ordenacao separa comparaveis, maturacao e sem base sem usar score observado como vantagem', () => {
  const comparable = (nome, score, cobertura) => ({
    nome,
    healthV3: {
      comparabilidadeEstado: 'comparavel',
      scoreComparavel: score,
      scoreObservado: score,
      cobertura,
      pilaresValidos: 4,
    },
  });
  const maturacao = (nome, observado, cobertura, pilares) => ({
    nome,
    healthV3: {
      comparabilidadeEstado: 'em_maturacao',
      scoreComparavel: null,
      scoreObservado: observado,
      cobertura,
      pilaresValidos: pilares,
    },
  });
  const semBase = (nome) => ({
    nome,
    healthV3: {
      comparabilidadeEstado: 'sem_base_operacional',
      scoreComparavel: null,
      scoreObservado: null,
      cobertura: 0,
      pilaresValidos: 0,
    },
  });

  const professores = [
    maturacao('Adriana', 100, 15, 1),
    comparable('Joel', 82, 75),
    semBase('Zuleica'),
    maturacao('Fabricio', 100, 40, 2),
    comparable('Willian', 92, 75),
    maturacao('Ana', 70, 40, 3),
    semBase('Alberto'),
  ];

  professores.sort(compareHealthScoreV3OperationalRows);
  assert.deepEqual(
    professores.map((professor) => professor.nome),
    ['Willian', 'Joel', 'Ana', 'Fabricio', 'Adriana', 'Alberto', 'Zuleica'],
  );
});

test('mensagens de evidencia explicam causa real e amostra', () => {
  assert.equal(
    resolveHealthScoreV3EvidenceMessage('sem_experimental_periodo', 'conversao'),
    'N\u00e3o realizou experimental no per\u00edodo',
  );
  assert.equal(
    resolveHealthScoreV3EvidenceMessage('amostra_insuficiente', 'conversao', null, {
      amostra: 2,
      amostraMinima: 3,
    }),
    'Amostra em forma\u00e7\u00e3o: 2 de 3',
  );
  assert.equal(
    resolveHealthScoreV3EvidenceMessage('calendario_sem_aulas_elegiveis', 'presenca'),
    'Sem aulas eleg\u00edveis no per\u00edodo',
  );
  assert.equal(
    resolveHealthScoreV3EvidenceMessage('presenca_em_auditoria', 'presenca'),
    'Presen\u00e7a em auditoria',
  );
  assert.equal(
    resolveHealthScoreV3EvidenceMessage('metrica_nao_aplicavel', 'conversao'),
    'N\u00e3o aplic\u00e1vel neste per\u00edodo',
  );
});

test('payload da IA recebe comparabilidade pronta e nao precisa recalcular', () => {
  const [professor] = normalizeHealthScoreV3PerformanceRows([row({
    competencia_referencia: '2026-06-01',
    score_referencia: 88,
    classificacao_referencia: 'saudavel',
  })]);
  const payload = serializeHealthScoreV3ForAi(professor);

  assert.equal(payload.score_observado, 100);
  assert.equal(payload.score_comparavel, null);
  assert.equal(payload.comparabilidade_estado, 'em_maturacao');
  assert.equal(payload.pilares_validos, 1);
  assert.equal(payload.competencia_referencia, '2026-06-01');
  assert.equal(payload.score_referencia, 88);
});
