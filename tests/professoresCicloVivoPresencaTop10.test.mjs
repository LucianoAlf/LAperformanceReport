import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { gerarRelatorioCoordenacaoCanonico } from '../src/lib/relatorioCoordenacaoCanonico.ts';

const migrationPath = 'supabase/migrations/20260909000911_professores_ciclo_presenca_referencia_top10.sql';
const browserReportPath = 'src/lib/relatorioCoordenacaoCanonico.ts';
const edgeReportPath = 'supabase/functions/gemini-relatorio-coordenacao/index.ts';

function professor(indice) {
  return {
    professor_id: indice,
    nome: `Professor ${String(indice).padStart(2, '0')}`,
    score_observado: 100 - indice,
    score_comparavel: 100 - indice,
    cobertura: 60,
    comparabilidade_estado: 'comparavel',
    pilares_validos: 3,
    pilares_esperados: 5,
    operacional: { matriculas_comerciais: 20 - indice },
    metricas: {
      conversao: { valor: 100 - indice, numerador: 20 - indice, denominador: 20, amostra: 20 },
    },
  };
}

function contratoRanking(professores) {
  return {
    schema_version: 3,
    periodo: {
      unidade_id: null,
      unidade_nome: 'Consolidado',
      ano: 2026,
      mes: 9,
      inicio: '2026-09-01',
      fim: '2026-11-30',
      periodicidade: 'ciclo',
      ciclo_codigo: '2026-SET-NOV',
      label: 'Set / Out / Nov',
      estado_publicacao: 'ciclo_em_acompanhamento',
      publicacao_oficial: false,
      ranking_habilitado: false,
    },
    resumo_equipe: {
      total_professores: professores.length,
      comparaveis: professores.length,
      em_maturacao: 0,
      sem_base_operacional: 0,
      score_medio_comparavel: 90,
    },
    professores,
    ranking_oficial: [],
  };
}

test('destaques por indicador usam Top 10, inclusive Matriculador', () => {
  const relatorio = gerarRelatorioCoordenacaoCanonico({
    tipo: 'ranking',
    contrato: contratoRanking(Array.from({ length: 12 }, (_, indice) => professor(indice + 1))),
    dataGeracao: new Date('2026-09-08T21:00:00-03:00'),
  });
  const inicio = relatorio.indexOf('MATRICULADOR');
  const fim = relatorio.indexOf('CONVERSÃO', inicio);
  const bloco = relatorio.slice(inicio, fim);

  for (let indice = 1; indice <= 10; indice += 1) {
    assert.match(bloco, new RegExp(`Professor ${String(indice).padStart(2, '0')}`));
  }
  assert.doesNotMatch(bloco, /Professor 11/);
  assert.doesNotMatch(bloco, /Professor 12/);
});

test('browser e Edge compartilham limite Top 10 para os sete indicadores', () => {
  for (const path of [browserReportPath, edgeReportPath]) {
    const source = fs.readFileSync(path, 'utf8');
    assert.match(source, /LIMITE_DESTAQUES_POR_INDICADOR\s*=\s*10/);
    assert.match(source, /\.slice\(0,\s*LIMITE_DESTAQUES_POR_INDICADOR\)/);
  }
});

test('migration preserva ciclo vivo e injeta apenas referência mensal disponível', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.match(sql, /get_health_score_professor_v3_presenca_ciclo_acompanhamento_v1/);
  assert.match(sql, /p_periodicidade\s*=\s*'ciclo'/i);
  assert.match(sql, /periodicidade\s*=\s*'mensal'/i);
  assert.match(sql, /presenca_ciclo_em_acompanhamento/);
  assert.match(sql, /ciclo\.valor_bruto\s+is\s+null/i);
  assert.match(sql, /peso_disponivel\s*=\s*false/i);
  assert.doesNotMatch(sql, /update\s+public\.health_score_professor_v3_snapshots/i);
});
