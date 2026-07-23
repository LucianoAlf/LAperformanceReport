import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { gerarRelatorioCoordenacaoInstantaneo } from '../src/lib/relatorioCoordenacaoInstantaneo.ts';

const sourcePath = 'src/lib/relatorioCoordenacaoInstantaneo.ts';

test('relatorio instantaneo nao publica nenhum ranking durante ciclo parcial', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const rankingBlock = source.slice(
    source.indexOf('function gerarRanking'),
    source.indexOf('function gerarCarteira'),
  );

  assert.match(rankingBlock, /if\s*\(healthPublicaveis\.length\s*===\s*0\)/i);
  assert.match(rankingBlock, /Rankings e premiacoes serao liberados somente apos o fechamento oficial do ciclo/i);
  assert.match(rankingBlock, /return\s*linhas\.join\(['"]\\n['"]\)/i);
});

function professor(id, nome, scoreLegado, scoreV3) {
  return {
    id,
    nome,
    total_alunos: 10,
    total_turmas: 8,
    alunos_via_turmas: 10,
    turmas_elegiveis_media: 8,
    media_alunos_turma: 1.25,
    taxa_retencao: 95,
    taxa_conversao: 70,
    experimentais: 10,
    experimentais_faltas: 0,
    matriculas_pos_exp: 7,
    matriculas_diretas: 0,
    taxa_presenca: 90,
    taxa_faltas: 10,
    presenca_publicavel: true,
    presenca_confianca: 'alta',
    presenca_cobertura: 1,
    presenca_eventos_confirmados: 20,
    presenca_eventos_incertos: 0,
    evasoes_mes: 0,
    nao_renovacoes_mes: 0,
    mrr_perdido: 0,
    status: 'excelente',
    health_score: scoreLegado,
    health_status: 'saudavel',
    health_score_confiavel: true,
    fator_demanda_ponderado: 1,
    healthV3: {
      score: scoreV3,
      cobertura: 100,
      classificacao: 'saudavel',
      estadoPublicacao: 'oficial',
      scoreExibivel: true,
      rankingHabilitado: true,
      periodicidade: 'ciclo',
      cicloCodigo: '2026-JUN-AGO',
    },
  };
}

test('relatorio oficial ordena Health Score pelo snapshot V3, nao pelo campo legado', () => {
  const relatorio = gerarRelatorioCoordenacaoInstantaneo({
    tipo: 'ranking',
    unidadeNome: 'Barra',
    periodoLabel: 'Jun-Ago/2026',
    intervaloLabel: '01/06/2026 ate 31/08/2026',
    dataGeracao: new Date('2026-09-30T12:00:00-03:00'),
    professores: [
      professor(1, 'Professor V3 Alto', 10, 90),
      professor(2, 'Professor V3 Baixo', 99, 70),
    ],
  });

  assert.ok(
    relatorio.indexOf('Professor V3 Alto') < relatorio.indexOf('Professor V3 Baixo'),
    'o ranking oficial deve ordenar pelo score do snapshot V3',
  );
});

test('relatorio oficial exclui professores parciais de todos os rankings em coorte mista', () => {
  const oficial = professor(1, 'Professor Oficial', 80, 80);
  const parcial = professor(2, 'Professor Parcial', 99, 99);
  parcial.total_alunos = 999;
  parcial.media_alunos_turma = 9.99;
  parcial.taxa_presenca = 100;
  parcial.matriculas_pos_exp = 99;
  parcial.healthV3.estadoPublicacao = 'parcial';
  parcial.healthV3.rankingHabilitado = false;

  const relatorio = gerarRelatorioCoordenacaoInstantaneo({
    tipo: 'ranking',
    unidadeNome: 'Barra',
    periodoLabel: 'Jun-Ago/2026',
    intervaloLabel: '01/06/2026 ate 31/08/2026',
    dataGeracao: new Date('2026-09-30T12:00:00-03:00'),
    professores: [oficial, parcial],
  });

  assert.match(relatorio, /Professor Oficial/);
  assert.doesNotMatch(relatorio, /Professor Parcial/);
});
