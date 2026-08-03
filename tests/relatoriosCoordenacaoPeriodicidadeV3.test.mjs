import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { gerarRelatorioCoordenacaoCanonico } from '../src/lib/relatorioCoordenacaoCanonico.ts';

const migrationPath = 'supabase/migrations/20260803223000_relatorios_coordenacao_periodicidade_canonica.sql';
const modalPath = 'src/components/App/Professores/ModalRelatorioCoordenacao.tsx';
const tabPath = 'src/components/App/Professores/TabPerformanceProfessores.tsx';
const edgePath = 'supabase/functions/gemini-relatorio-coordenacao/index.ts';

const metrica = (valor, numerador, denominador, pesoEfetivo = 0) => ({
  valor,
  valor_bruto: valor,
  numerador,
  denominador,
  amostra: denominador,
  peso_efetivo: pesoEfetivo,
  papel: 'nota',
  codigo_evidencia: denominador > 0 ? 'evidencia_valida' : 'sem_base',
});

const contratoCiclo = {
  schema_version: 3,
  periodo: {
    unidade_id: '95553e96-971b-4590-a6eb-0201d013c14d',
    unidade_nome: 'Recreio',
    ano: 2026,
    mes: 8,
    inicio: '2026-06-01',
    fim: '2026-08-31',
    periodicidade: 'ciclo',
    ciclo_codigo: '2026-JUN-AGO',
    label: 'Jun-Ago/2026',
    estado_publicacao: 'ciclo_em_acompanhamento',
    data_corte: '2026-08-03',
  },
  resumo_equipe: {
    total_professores: 2,
    comparaveis: 1,
    em_maturacao: 1,
    sem_base_operacional: 0,
    score_medio_comparavel: 88,
  },
  professores: [
    {
      professor_id: 1,
      nome: 'Professor Comparável',
      score_observado: 88,
      score_comparavel: 88,
      cobertura: 72.2,
      classificacao: 'saudavel',
      estado_publicacao: 'ciclo_em_acompanhamento',
      ranking_habilitado: false,
      pilares_validos: 4,
      pilares_esperados: 5,
      comparabilidade_estado: 'comparavel',
      comparabilidade_motivo: 'criterios_atendidos',
      metricas: {
        retencao: metrica(95, 19, 20, 30.8),
        permanencia: metrica(12, 120, 10, 30.8),
        conversao: metrica(50, 3, 6, 18.4),
        media_turma: metrica(1.5, 30, 20, 18.4),
        numero_alunos: { ...metrica(20, 20, 20), papel: 'diagnostico' },
        presenca: metrica(80, 80, 100, 12.3),
      },
      operacional: { total_turmas: 20, alunos_via_turmas: 30, turmas_elegiveis_media: 20 },
    },
    {
      professor_id: 2,
      nome: 'Professor em Formação',
      score_observado: 96,
      score_comparavel: null,
      cobertura: 33.3,
      classificacao: null,
      estado_publicacao: 'ciclo_em_acompanhamento',
      ranking_habilitado: false,
      pilares_validos: 2,
      pilares_esperados: 5,
      comparabilidade_estado: 'em_maturacao',
      comparabilidade_motivo: 'pilares_insuficientes',
      metricas: {
        retencao: metrica(100, 5, 5, 62.5),
        permanencia: metrica(null, 0, 0, 0),
        conversao: metrica(null, 0, 0, 0),
        media_turma: metrica(1.2, 6, 5, 37.5),
        numero_alunos: { ...metrica(5, 5, 5), papel: 'diagnostico' },
        presenca: metrica(null, 0, 0, 0),
      },
      operacional: { total_turmas: 5, alunos_via_turmas: 6, turmas_elegiveis_media: 5 },
    },
  ],
  presenca: {
    presenca_media: 80,
    professores_com_evidencia: 1,
    pendencias: 1,
    eventos_elegiveis: 100,
    presencas_confirmadas: 80,
  },
  carteira_carga: {
    alunos_na_carteira: 25,
    professores_com_carteira_observada: 2,
    media_por_professor: 12.5,
    total_turmas_operacionais: 25,
    ocupacoes_elegiveis: 36,
    turmas_elegiveis: 25,
    media_alunos_turma: 1.44,
  },
  retencao_permanencia: {
    retencao_media: 96,
    professores_com_retencao: 2,
  },
  saidas_retencao: {
    evasoes_validas: 1,
    nao_renovacoes_validas: 0,
    saidas_validas_total: 1,
    saidas_atribuiveis_professor: 1,
    mrr_perdido_total: 400,
    mrr_perdido_atribuivel: 400,
    movimentos: [],
  },
  ranking_oficial: null,
  qualidade_dados: {
    capacidade_estimada_pendente: { professores_afetados: 2, agrupamentos_estimados: 3 },
  },
  auditoria: {
    contrato: 'relatorio-coordenacao-pedagogica-3',
    fonte_publica: 'Health Score Professor V3',
    periodicidade: 'ciclo',
  },
};

test('contrato V3 usa o mesmo produtor canonico para mensal e ciclo', () => {
  assert.equal(fs.existsSync(migrationPath), true);
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /get_relatorio_coordenacao_canonico_v3/i);
  assert.match(sql, /p_periodicidade\s+text/i);
  assert.match(sql, /get_health_score_professor_v3_performance[\s\S]*p_periodicidade/i);
  assert.match(sql, /sum\s*\(\s*coalesce\s*\(\s*nullif\s*\(\s*item->>'numerador'/i);
  assert.match(sql, /m\.data\s+between\s+v_periodo_inicio\s+and\s+v_periodo_fim/i);
  assert.match(sql, /estado_publicacao[\s\S]*oficial/i);
  assert.match(sql, /capacidade_estimada_pendente/i);
  assert.doesNotMatch(sql, /update\s+public\.fechamento_mensal_snapshots/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.fechamento_mensal_snapshots/i);
});

test('modal e Edge enviam explicitamente a periodicidade do relatorio', () => {
  const modal = fs.readFileSync(modalPath, 'utf8');
  const tab = fs.readFileSync(tabPath, 'utf8');
  const edge = fs.readFileSync(edgePath, 'utf8');

  assert.match(tab, /<ModalRelatorioCoordenacao[\s\S]*periodicidade=\{modoVisualizacao === 'trimestre' \? 'ciclo' : 'mensal'\}/);
  assert.match(modal, /periodicidade:\s*'mensal'\s*\|\s*'ciclo'/);
  assert.match(modal, /get_relatorio_coordenacao_canonico_v3/);
  assert.match(modal, /p_periodicidade:\s*periodicidade/);
  assert.match(modal, /body:\s*\{[^}]*periodicidade/s);
  assert.match(edge, /get_relatorio_coordenacao_canonico_v3/);
  assert.match(edge, /periodicidade/);
  assert.match(edge, /schema_version\s*!==\s*3/);
});

test('relatorio de ciclo deixa claro o periodo e nao publica ranking aberto', () => {
  const texto = gerarRelatorioCoordenacaoCanonico({
    tipo: 'ranking',
    contrato: contratoCiclo,
    dataGeracao: new Date('2026-08-03T12:00:00-03:00'),
  });

  assert.match(texto, /CICLO JUN-AGO\/2026/);
  assert.match(texto, /Ciclo em acompanhamento/i);
  assert.match(texto, /Professor Comparável[^\n]*88,0 pontos/);
  assert.doesNotMatch(texto, /1\. Professor Comparável/);
  assert.match(texto, /ranking e premiação exigem ciclo oficial fechado/i);
  assert.match(texto, /Professor em Formação[^\n]*Desempenho observado: 96,0/);
});

test('relatorio mensal se identifica como evidencias do mes', () => {
  const mensal = structuredClone(contratoCiclo);
  mensal.periodo = {
    ...mensal.periodo,
    inicio: '2026-08-01',
    fim: '2026-08-31',
    periodicidade: 'mensal',
    ciclo_codigo: '2026-08',
    label: '08/2026',
    estado_publicacao: 'em_andamento',
  };
  mensal.auditoria.periodicidade = 'mensal';

  const texto = gerarRelatorioCoordenacaoCanonico({
    tipo: 'presenca',
    contrato: mensal,
    dataGeracao: new Date('2026-08-03T12:00:00-03:00'),
  });

  assert.match(texto, /EVIDÊNCIAS DO MÊS — AGOSTO DE 2026/);
  assert.match(texto, /Período: 01\/08\/2026 até 31\/08\/2026/);
});
