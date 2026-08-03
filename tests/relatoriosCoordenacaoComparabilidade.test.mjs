import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { gerarRelatorioCoordenacaoCanonico } from '../src/lib/relatorioCoordenacaoCanonico.ts';

const migrationPath = 'supabase/migrations/20260803123000_health_score_v3_comparabilidade.sql';
const instantaneoPath = 'src/lib/relatorioCoordenacaoInstantaneo.ts';
const edgePath = 'supabase/functions/gemini-relatorio-coordenacao/index.ts';

const professor = ({
  id,
  nome,
  estado,
  scoreObservado,
  scoreComparavel = null,
  cobertura,
  pilares,
}) => ({
  professor_id: id,
  nome,
  score: scoreObservado,
  score_observado: scoreObservado,
  score_comparavel: scoreComparavel,
  cobertura,
  pilares_validos: pilares,
  pilares_esperados: 5,
  comparabilidade_estado: estado,
  comparabilidade_motivo: estado === 'comparavel' ? 'criterios_atendidos' : 'pilares_insuficientes',
  score_exibivel: estado === 'comparavel',
  classificacao: estado === 'comparavel' ? 'saudavel' : null,
  ranking_habilitado: false,
  estado_publicacao: 'em_andamento',
  competencia_referencia: estado === 'comparavel' ? null : '2026-07-01',
  score_referencia: estado === 'comparavel' ? null : 84,
  classificacao_referencia: estado === 'comparavel' ? null : 'saudavel',
  metricas: {},
  operacional: {},
});

function contrato() {
  return {
    schema_version: 2,
    periodo: {
      unidade_id: '95553e96-971b-4590-a6eb-0201d013c14d',
      unidade_nome: 'Recreio',
      ano: 2026,
      mes: 8,
      inicio: '2026-08-01',
      fim: '2026-08-31',
    },
    resumo_equipe: {
      total_professores: 3,
      comparaveis: 1,
      em_maturacao: 1,
      sem_base_operacional: 1,
      score_medio_comparavel: 86,
    },
    professores: [
      professor({ id: 1, nome: 'Professor Comparável', estado: 'comparavel', scoreObservado: 86, scoreComparavel: 86, cobertura: 65, pilares: 4 }),
      professor({ id: 2, nome: 'Professor Novo', estado: 'em_maturacao', scoreObservado: 100, cobertura: 30, pilares: 2 }),
      professor({ id: 3, nome: 'Professor Sem Base', estado: 'sem_base_operacional', scoreObservado: null, cobertura: 0, pilares: 0 }),
    ],
    presenca: {},
    carteira_carga: {},
    retencao_permanencia: {},
    saidas_retencao: {},
    ranking_oficial: null,
  };
}

test('contrato SQL enriquece os cinco relatórios sem alterar snapshots fechados', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /enriquecer_relatorio_coordenacao_v2_comparabilidade/i);
  assert.match(sql, /score_observado/i);
  assert.match(sql, /score_comparavel/i);
  assert.match(sql, /comparabilidade_estado/i);
  assert.match(sql, /pilares_validos/i);
  assert.match(sql, /get_relatorio_coordenacao_canonico_v2/i);
  assert.doesNotMatch(sql, /update\s+public\.fechamento_mensal_snapshots/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.fechamento_mensal_snapshots/i);
});

test('relatório de desempenho separa comparáveis, maturação e sem base', () => {
  const texto = gerarRelatorioCoordenacaoCanonico({
    tipo: 'ranking',
    contrato: contrato(),
    dataGeracao: new Date('2026-08-03T12:00:00-03:00'),
  });

  assert.match(texto, /PROFESSORES COM HEALTH SCORE COMPARÁVEL/);
  assert.match(texto, /Professor Comparável[^\n]*86,0 pontos/);
  assert.match(texto, /EM MATURAÇÃO/);
  assert.match(texto, /Professor Novo[^\n]*Desempenho observado: 100,0/);
  assert.match(texto, /2\/5 pilares/);
  assert.match(texto, /SEM BASE OPERACIONAL/);
  assert.match(texto, /Professor Sem Base/);
  assert.doesNotMatch(texto, /Professor Novo[^\n]*Health Score/i);
});

test('consumidores recebem comparabilidade pronta e não inferem pelo score numérico', () => {
  const instantaneo = fs.readFileSync(instantaneoPath, 'utf8');
  const edge = fs.readFileSync(edgePath, 'utf8');

  for (const source of [instantaneo, edge]) {
    assert.match(source, /scoreComparavel|score_comparavel/);
    assert.match(source, /comparabilidadeEstado|comparabilidade_estado/);
    assert.match(source, /pilaresValidos|pilares_validos/);
  }
  assert.doesNotMatch(edge, /score\s*>=\s*80/);
});
