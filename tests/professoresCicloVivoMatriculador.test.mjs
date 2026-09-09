import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { gerarRelatorioCoordenacaoCanonico } from '../src/lib/relatorioCoordenacaoCanonico.ts';
import { resolveHealthScoreV3EvidenceMessage } from '../src/lib/healthScoreProfessorV3Performance.ts';

const migrationPath = 'supabase/migrations/20260908230249_professores_ciclo_vivo_matriculador_canonico.sql';
const cadastroPagePath = 'src/components/App/Professores/ProfessoresPage.tsx';
const cadastroHelperPath = 'src/lib/professoresCadastroKpisCanonicos.ts';
const edgeCoordenacaoPath = 'supabase/functions/gemini-relatorio-coordenacao/index.ts';
const edgeRankingLegadoPath = 'supabase/functions/gemini-ranking-professores/index.ts';
const modalDetalhesPresencaPath = 'src/components/App/Professores/ModalDetalhesPresenca.tsx';
const modalDetalhesPerformancePath = 'src/components/App/Professores/ModalDetalhesProfessorPerformance.tsx';

function professor(nome, {
  score = 80,
  conversaoValor,
  matriculasPosExperimental,
  matriculasComerciais,
}) {
  return {
    professor_id: nome.length,
    nome,
    score_observado: score,
    score_comparavel: score,
    cobertura: 60,
    comparabilidade_estado: 'comparavel',
    pilares_validos: 3,
    pilares_esperados: 5,
    operacional: {
      matriculas_comerciais: matriculasComerciais,
    },
    metricas: {
      conversao: {
        valor: conversaoValor,
        numerador: matriculasPosExperimental,
        denominador: 6,
        amostra: 6,
      },
    },
  };
}

function contratoRanking(professores) {
  return {
    schema_version: 3,
    periodo: {
      unidade_id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
      unidade_nome: 'Campo Grande',
      ano: 2026,
      mes: 8,
      inicio: '2026-06-01',
      fim: '2026-08-31',
      periodicidade: 'ciclo',
      ciclo_codigo: '2026-JUN-AGO',
      label: 'Jun / Jul / Ago',
      estado_publicacao: 'oficial',
      publicacao_oficial: true,
      ranking_habilitado: true,
    },
    resumo_equipe: {
      total_professores: professores.length,
      comparaveis: professores.length,
      em_maturacao: 0,
      sem_base_operacional: 0,
      score_medio_comparavel: 80,
    },
    professores,
    ranking_oficial: [],
  };
}

test('Matriculador usa matrícula comercial canônica, não o numerador de conversão', () => {
  const relatorio = gerarRelatorioCoordenacaoCanonico({
    tipo: 'ranking',
    contrato: contratoRanking([
      professor('Valdo Delfino', {
        conversaoValor: 33.3,
        matriculasPosExperimental: 2,
        matriculasComerciais: 6,
      }),
      professor('Caio Tenório de Araújo', {
        conversaoValor: 75,
        matriculasPosExperimental: 3,
        matriculasComerciais: 3,
      }),
    ]),
    dataGeracao: new Date('2026-09-08T20:00:00-03:00'),
  });

  const inicioMatriculador = relatorio.indexOf('MATRICULADOR');
  const inicioConversao = relatorio.indexOf('CONVERSÃO');
  assert.ok(inicioMatriculador >= 0, 'o relatório deve conter Matriculador');
  assert.ok(inicioConversao > inicioMatriculador, 'conversão continua em bloco próprio');

  const blocoMatriculador = relatorio.slice(inicioMatriculador, inicioConversao);
  const blocoConversao = relatorio.slice(inicioConversao);
  assert.ok(
    blocoMatriculador.indexOf('Valdo Delfino') < blocoMatriculador.indexOf('Caio Tenório de Araújo'),
    'Valdo deve liderar pelo total comercial 6, não ficar atrás pelo 2/6 de conversão',
  );
  assert.match(blocoMatriculador, /6 matrículas/i);
  assert.ok(
    blocoConversao.indexOf('Caio Tenório de Araújo') < blocoConversao.indexOf('Valdo Delfino'),
    'a taxa de conversão permanece um ranking separado',
  );
});

test('Cadastro usa uma RPC leve e não abre a cadeia de presença', () => {
  const page = fs.readFileSync(cadastroPagePath, 'utf8');
  assert.equal(fs.existsSync(cadastroHelperPath), true, 'adaptador leve do Cadastro deve existir');
  assert.match(page, /buscarKpisProfessoresCadastroCanonicos\(filtroPeriodo\)/);
  assert.doesNotMatch(page, /buscarKpisProfessoresCanonicos\(filtroPeriodo\)/);
  assert.doesNotMatch(page, /buscarKpisTurmasCanonicos\(filtroPeriodo\)/);
});

test('os três renderizadores usam matrícula comercial para Matriculador', () => {
  for (const path of [
    'src/lib/relatorioCoordenacaoCanonico.ts',
    edgeCoordenacaoPath,
    edgeRankingLegadoPath,
  ]) {
    const source = fs.readFileSync(path, 'utf8');
    assert.match(source, /matriculas_comerciais/);
    assert.doesNotMatch(source, /chave:\s*["']matriculador["'][\s\S]{0,400}conversao\?\.numerador/);
  }
});

test('indisponibilidade de retrato não usa mais o rótulo genérico de auditoria', () => {
  assert.equal(
    resolveHealthScoreV3EvidenceMessage('fonte_canonica_indisponivel'),
    'Sem retrato disponível para o período',
  );

  for (const path of [
    modalDetalhesPresencaPath,
    modalDetalhesPerformancePath,
    edgeRankingLegadoPath,
  ]) {
    const source = fs.readFileSync(path, 'utf8');
    assert.doesNotMatch(source, /['"`]Em auditoria['"`]/i, path);
  }
});

test('migration aditiva prevê leitor leve, ciclo aberto e jobs separados', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.match(sql, /get_kpis_professores_cadastro_canonicos_v1/);
  assert.match(sql, /matriculas_comerciais/);
  assert.match(sql, /periodicidade\s+in\s*\(\s*'mensal'\s*,\s*'ciclo'\s*\)/i);
  assert.match(sql, /executar_health_score_professor_v3_job_ciclo_escopo/);
  assert.match(sql, /materializar-health-score-professor-v3-ciclo-unidade-/);
  assert.match(sql, /materializar-health-score-professor-v3-ciclo-consolidado/);
  assert.doesNotMatch(sql, /statement_timeout/i);
});
