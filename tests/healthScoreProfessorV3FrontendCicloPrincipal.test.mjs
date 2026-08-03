import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  isHealthScoreV3SnapshotRankable,
  normalizeHealthScoreV3PerformanceRows,
  resolveHealthScoreV3PublicationLabel,
} from '../src/lib/healthScoreProfessorV3Performance.ts';

const tabPath = 'src/components/App/Professores/TabPerformanceProfessores.tsx';

function cycleRow(overrides = {}) {
  return {
    professor_id: 10,
    unidade_id: '00000000-0000-0000-0000-000000000010',
    escopo: 'unidade',
    competencia: '2026-08-01',
    trimestre_inicio: '2026-06-01',
    periodicidade: 'ciclo',
    periodo_inicio: '2026-06-01',
    periodo_fim: '2026-08-31',
    ciclo_codigo: 'JUN-AGO-2026',
    estado_publicacao: 'ciclo_em_acompanhamento',
    score_exibivel: true,
    ranking_habilitado: false,
    config_versao: 4,
    revisao: 1,
    score: 88,
    score_observado: 88,
    score_comparavel: 88,
    cobertura: 61.1,
    pilares_validos: 3,
    pilares_esperados: 5,
    comparabilidade_estado: 'comparavel',
    comparabilidade_motivo: 'criterios_atendidos',
    classificacao: 'saudavel',
    estado: 'em_andamento',
    snapshot_publicavel: false,
    publicado: false,
    motivo_bloqueio: null,
    regra_versao_snapshot: 'v3-ciclo',
    data_corte: '2026-08-03',
    config_id: '00000000-0000-0000-0000-000000000004',
    regra_fingerprint: 'sha256:regra-v4',
    peso_pontuavel_total: 90,
    peso_disponivel_total: 55,
    cobertura_normalizada: 61.1,
    cobertura_minima_aplicada: 60,
    comparabilidade_motivos: [],
    metrica: 'retencao',
    valor_bruto: 100,
    numerador: 10,
    denominador: 10,
    nota: 100,
    peso: 25,
    peso_disponivel: true,
    peso_efetivo: 45.5,
    contribuicao: 45.5,
    meta: 90,
    amostra: 10,
    estado_base: 'ok',
    metrica_publicavel: true,
    confianca: 'alta',
    fonte: 'dados_oficiais_periodo',
    regra_versao_metrica: 'v3',
    motivo_sem_base: null,
    codigo_evidencia: 'evidencia_valida',
    papel: 'nota',
    detalhes: {},
    ...overrides,
  };
}

test('normalizador preserva a auditoria completa do ciclo aberto', () => {
  const [snapshot] = normalizeHealthScoreV3PerformanceRows([cycleRow()]);

  assert.equal(snapshot.estadoPublicacao, 'ciclo_em_acompanhamento');
  assert.equal(resolveHealthScoreV3PublicationLabel(snapshot), 'Ciclo em acompanhamento');
  assert.equal(snapshot.dataCorte, '2026-08-03');
  assert.equal(snapshot.configId, '00000000-0000-0000-0000-000000000004');
  assert.equal(snapshot.regraFingerprint, 'sha256:regra-v4');
  assert.equal(snapshot.pesoPontuavelTotal, 90);
  assert.equal(snapshot.pesoDisponivelTotal, 55);
  assert.equal(snapshot.coberturaNormalizada, 61.1);
  assert.equal(snapshot.coberturaMinimaAplicada, 60);
  assert.deepEqual(snapshot.comparabilidadeMotivos, []);
  assert.equal(isHealthScoreV3SnapshotRankable(snapshot), false);
});

test('tela abre no ciclo oficial e deixa o mensal como evidencia do mes', () => {
  const source = fs.readFileSync(tabPath, 'utf8');

  assert.match(source, /useState<'mensal'\s*\|\s*'trimestre'>\('trimestre'\)/);
  assert.match(source, /Vis[aã]o principal[^\n]*ciclo oficial/i);
  assert.match(source, /Mensal[^\n]*evid[eê]ncias do m[eê]s/i);
});
