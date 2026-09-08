import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { gerarRelatorioCoordenacaoCanonico } from '../src/lib/relatorioCoordenacaoCanonico.ts';

const migrationPath = 'supabase/migrations/20260908181141_relatorio_coordenacao_snapshot_canonico.sql';
const performanceMigrationPath = 'supabase/migrations/20260908183928_relatorio_coordenacao_remove_kpi_redundante.sql';
const panelParityMigrationPath = 'supabase/migrations/20260908200000_relatorio_coordenacao_espelha_painel.sql';
const edgePath = 'supabase/functions/gemini-relatorio-coordenacao/index.ts';
const orderingHelperPath = '../supabase/functions/_shared/ordenacaoProfessoresRelatorio.ts';
const presentationHelperPath = '../supabase/functions/_shared/apresentacaoRelatorioCoordenacao.ts';

function professor(nome, { score = 80, estado = 'comparavel', conversaoValor, matriculas }) {
  return {
    professor_id: nome.length,
    nome,
    score_observado: score,
    score_comparavel: estado === 'comparavel' ? score : null,
    cobertura: estado === 'comparavel' ? 60 : 40,
    comparabilidade_estado: estado,
    pilares_validos: estado === 'comparavel' ? 3 : 2,
    pilares_esperados: 5,
    metricas: {
      conversao: {
        valor: conversaoValor,
        numerador: matriculas,
        denominador: 10,
        amostra: 10,
      },
    },
  };
}

function contratoRanking(professores) {
  return {
    schema_version: 3,
    periodo: {
      unidade_id: '95553e96-971b-4590-a6eb-0201d013c14d',
      unidade_nome: 'Recreio',
      ano: 2026,
      mes: 8,
      inicio: '2026-08-01',
      fim: '2026-08-31',
      periodicidade: 'mensal',
      publicacao_oficial: false,
      ranking_habilitado: false,
    },
    resumo_equipe: {
      total_professores: professores.length,
      comparaveis: professores.filter((p) => p.comparabilidade_estado === 'comparavel').length,
      em_maturacao: professores.filter((p) => p.comparabilidade_estado === 'em_maturacao').length,
      sem_base_operacional: 0,
      score_medio_comparavel: 80,
    },
    professores,
    ranking_oficial: null,
  };
}

test('relatorio da Coordenacao passa a ler o mesmo snapshot canonico exibido no painel', () => {
  assert.equal(fs.existsSync(migrationPath), true, 'migration corretiva deve existir');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /enriquecer_relatorio_coordenacao_v2_comparabilidade/i);
  assert.match(sql, /montar_relatorio_coordenacao_payload_v3/i);
  assert.match(sql, /get_health_score_professor_v3_performance_snapshot_v3/i);
  assert.match(sql, /pg_get_functiondef/i, 'patch deve preservar a definicao vigente em producao');
  assert.match(sql, /RELATORIO_COORDENACAO_SNAPSHOT_PATCH_DIVERGENTE/i);
});

test('payload do relatorio elimina a segunda leitura ampla de KPIs', () => {
  assert.equal(fs.existsSync(performanceMigrationPath), true, 'migration de performance deve existir');
  const sql = fs.readFileSync(performanceMigrationPath, 'utf8');

  assert.match(sql, /jsonb_each\(v_operacional\)/);
  assert.match(sql, /v_base->''professores''/);
  assert.match(sql, /RELATORIO_COORDENACAO_KPI_PATCH_DIVERGENTE/);
  assert.match(sql, /pg_get_functiondef/);
});

test('payload final usa periodo completo, roster ativo e metadados oficiais do ciclo', () => {
  assert.equal(fs.existsSync(panelParityMigrationPath), true, 'migration de paridade com o painel deve existir');
  const sql = fs.readFileSync(panelParityMigrationPath, 'utf8');

  assert.match(sql, /00e8489216514a053208cb38740d1f87/,
    'patch deve aceitar somente a definicao viva auditada');
  assert.match(sql, /get_kpis_professor_periodo_canonico_base_20260711/);
  assert.match(sql, /v_periodo_inicio/);
  assert.match(sql, /v_periodo_fim/);
  assert.match(sql, /active_roster/);
  assert.match(sql, /prof\.ativo/);
  assert.match(sql, /pu\.emusys_ativo/);
  assert.match(sql, /pu\.validacao_status <> ''ignorado''/);
  assert.match(sql, /health_score_professor_v3_ciclos/);
  assert.match(sql, /v_periodo_publicacao_oficial/);
  assert.match(sql, /v_periodo_ranking_habilitado/);
  assert.match(sql, /professores_sem_fonte/,
    'qualidade deve carregar a contagem de sem base do mesmo resumo do painel');
  assert.match(sql, /RELATORIO_COORDENACAO_PAINEL_HASH_DIVERGENTE/);
});

test('payload final nao entra no produtor legado e monta o contexto pela fotografia do painel', () => {
  const sql = fs.readFileSync(panelParityMigrationPath, 'utf8');
  const inicioSinais = sql.indexOf('create or replace function public.get_health_score_professor_v3_sinais_snapshot_v1');
  const fimSinais = sql.indexOf('create or replace function public.montar_relatorio_coordenacao_contexto_v3_v1');

  assert.ok(inicioSinais >= 0, 'migration deve criar o leitor de sinais sobre a fotografia');
  assert.ok(fimSinais > inicioSinais, 'migration deve criar o contexto leve do relatorio');

  const leitorSinais = sql.slice(inicioSinais, fimSinais);
  assert.match(leitorSinais, /get_health_score_professor_v3_performance_snapshot_v3/);
  assert.doesNotMatch(
    leitorSinais,
    /get_health_score_professor_v3_performance\s*\(/,
    'sinais nao podem recalcular a fotografia exibida no painel',
  );

  assert.match(sql, /v_new_base[\s\S]*montar_relatorio_coordenacao_contexto_v3_v1/);
  assert.match(sql, /strpos\(v_patched, 'get_relatorio_coordenacao_canonico_v2\('/);
  assert.match(sql, /RELATORIO_COORDENACAO_CONTEXTO_LEGADO_REMANESCENTE/);
});

test('lista publica usa exatamente a ordem operacional do painel', async () => {
  const { ordenarProfessoresPorScoreVisivel } = await import(orderingHelperPath);
  const entrada = [
    { nome: 'Comparavel 77', comparabilidade_estado: 'comparavel', score_comparavel: 77, score_observado: 77 },
    { nome: 'Maturacao 95 cobertura baixa', comparabilidade_estado: 'em_maturacao', score_comparavel: null, score_observado: 95, cobertura: 20, pilares_validos: 1 },
    { nome: 'Maturacao 70 cobertura alta', comparabilidade_estado: 'em_maturacao', score_comparavel: null, score_observado: 70, cobertura: 40, pilares_validos: 2 },
    { nome: 'Sem nota com score cru', comparabilidade_estado: 'sem_base_operacional', score_comparavel: null, score_observado: 99 },
  ];
  const ordemOriginal = entrada.map((item) => item.nome);

  assert.deepEqual(
    ordenarProfessoresPorScoreVisivel(entrada).map((item) => item.nome),
    [
      'Comparavel 77',
      'Maturacao 70 cobertura alta',
      'Maturacao 95 cobertura baixa',
      'Sem nota com score cru',
    ],
  );
  assert.deepEqual(entrada.map((item) => item.nome), ordemOriginal, 'helper nao deve mutar o payload canonico');

  const { scoreVisivelProfessor } = await import(orderingHelperPath);
  assert.equal(scoreVisivelProfessor(entrada[3]), null,
    'sem_base nunca deve exibir um score cru que o painel esconde');

  const edge = fs.readFileSync(edgePath, 'utf8');
  assert.match(edge, /ordenarProfessoresPorScoreVisivel\(dados\.professores\)/);
  assert.doesNotMatch(edge, /ranking_oficial\s*&&\s*dados\.ranking_oficial\.length/);
});

test('ranking Matriculador usa quantidade absoluta e preserva conversao como indicador separado', () => {
  const relatorio = gerarRelatorioCoordenacaoCanonico({
    tipo: 'ranking',
    contrato: contratoRanking([
      professor('Taxa Alta', { conversaoValor: 100, matriculas: 1 }),
      professor('Mais Matriculas', { conversaoValor: 50, matriculas: 5 }),
    ]),
    dataGeracao: new Date('2026-09-08T12:00:00-03:00'),
  });

  const inicioMatriculador = relatorio.indexOf('MATRICULADOR');
  const inicioConversao = relatorio.indexOf('CONVERS');
  assert.ok(inicioMatriculador >= 0, 'relatorio deve conter destaque Matriculador');
  assert.ok(inicioConversao > inicioMatriculador, 'taxa de conversao deve continuar separada');

  const blocoMatriculador = relatorio.slice(inicioMatriculador, inicioConversao);
  assert.ok(blocoMatriculador.indexOf('Mais Matriculas') < blocoMatriculador.indexOf('Taxa Alta'));
  assert.match(blocoMatriculador, /5 matr[ií]culas/i);

  const blocoConversao = relatorio.slice(inicioConversao);
  assert.ok(blocoConversao.indexOf('Taxa Alta') < blocoConversao.indexOf('Mais Matriculas'));
});

test('ranking espelha o painel mesmo quando o recorte oficial legado esta vazio', () => {
  const contrato = contratoRanking([
    professor('Comparavel 77', { score: 77, conversaoValor: 50, matriculas: 2 }),
    professor('Maturacao 85', {
      score: 85,
      estado: 'em_maturacao',
      conversaoValor: 40,
      matriculas: 2,
    }),
    professor('Sem nota', {
      score: null,
      estado: 'sem_base_operacional',
      conversaoValor: null,
      matriculas: null,
    }),
  ]);
  contrato.periodo.periodicidade = 'ciclo';
  contrato.periodo.estado_publicacao = 'oficial';
  contrato.periodo.publicacao_oficial = true;
  contrato.periodo.ranking_habilitado = true;
  contrato.ranking_oficial = [];

  const relatorio = gerarRelatorioCoordenacaoCanonico({
    tipo: 'ranking',
    contrato,
    dataGeracao: new Date('2026-09-08T12:00:00-03:00'),
  });

  assert.ok(relatorio.indexOf('Comparavel 77') < relatorio.indexOf('Maturacao 85'));
  assert.match(relatorio, /SEM NOTA NO RECORTE/);
  assert.match(relatorio, /FORA DA CLASSIFICA[CÇ][AÃ]O/);
  assert.match(relatorio, /• Sem nota.*n[aã]o recebeu nota zero/);
  assert.doesNotMatch(relatorio, /\d+\. Sem nota/);
  assert.doesNotMatch(relatorio, /Nenhum professor compar[aÃ¡]vel/);

  const edge = fs.readFileSync(edgePath, 'utf8');
  assert.doesNotMatch(edge, /dados\.ranking_oficial\.map/);
  assert.doesNotMatch(edge, /Boolean\(dados\.ranking_oficial/);
  assert.match(edge, /ordenarProfessoresPorScoreVisivel/);
  assert.match(
    edge,
    /sem_base_operacional[\s\S]*permanece na lista da equipe e n[aã]o recebeu nota zero/i,
    'professor sem nota deve continuar visivel sem um festival de metricas inexistentes',
  );
});

test('ciclo somente se apresenta como oficial fechado quando os dois gates oficiais estao abertos', () => {
  const contrato = contratoRanking([
    professor('Professor comparavel', { score: 88, conversaoValor: 50, matriculas: 2 }),
  ]);
  contrato.periodo.periodicidade = 'ciclo';
  contrato.periodo.estado_publicacao = 'parcial';
  contrato.periodo.publicacao_oficial = false;
  contrato.periodo.ranking_habilitado = false;

  const emAcompanhamento = gerarRelatorioCoordenacaoCanonico({
    tipo: 'ranking',
    contrato,
    dataGeracao: new Date('2026-09-08T12:00:00-03:00'),
  });
  assert.match(emAcompanhamento, /Ciclo em acompanhamento/i);
  assert.doesNotMatch(
    emAcompanhamento,
    /Dados oficiais[^\n]*Ciclo oficial fechado/i,
  );

  contrato.periodo.estado_publicacao = 'oficial';
  contrato.periodo.publicacao_oficial = true;
  contrato.periodo.ranking_habilitado = true;
  const oficial = gerarRelatorioCoordenacaoCanonico({
    tipo: 'ranking',
    contrato,
    dataGeracao: new Date('2026-09-08T12:00:00-03:00'),
  });
  assert.match(oficial, /Ciclo oficial fechado/i);
});

test('recesso parcial respeita o estado oficial do ciclo sem produzir mensagem contraditoria', async () => {
  const { descreverContextoOperacionalRelatorio } = await import(presentationHelperPath);
  const base = {
    periodicidade: 'ciclo',
    contextoOperacional: 'recesso_parcial',
    competenciaEmAndamento: false,
    contextoPeriodo: 'Ciclo oficial Jun-Ago/2026.',
  };

  const oficial = descreverContextoOperacionalRelatorio({
    ...base,
    cicloOficial: true,
  });
  assert.match(oficial, /oficialmente fechado/i);
  assert.doesNotMatch(oficial, /aguarda|aguardam|ainda n[aã]o (?:e|é) oficial/i);

  const acompanhamento = descreverContextoOperacionalRelatorio({
    ...base,
    cicloOficial: false,
  });
  assert.match(acompanhamento, /em acompanhamento/i);
  assert.match(acompanhamento, /ainda n[aã]o (?:é oficial|são oficiais)/i);
});

test('qualidade deriva professores sem dados do mesmo resumo exibido no painel', async () => {
  const { contarProfessoresSemDadosOficiais } = await import(presentationHelperPath);

  assert.equal(contarProfessoresSemDadosOficiais({
    resumoSemBaseOperacional: 3,
    qualidadeProfessoresSemFonte: undefined,
    professores: [],
  }), 3);
  assert.equal(contarProfessoresSemDadosOficiais({
    resumoSemBaseOperacional: undefined,
    qualidadeProfessoresSemFonte: undefined,
    professores: [
      { comparabilidade_estado: 'comparavel' },
      { comparabilidade_estado: 'sem_base_operacional' },
      { comparabilidade_estado: 'sem_base_operacional' },
    ],
  }), 2);
});

test('teste PostgreSQL comum usa somente Docker e fixture versionada, nunca credencial viva', () => {
  const postgresTest = fs.readFileSync(
    'tests/relatorioCoordenacaoSnapshotCanonicoPostgres.test.mjs',
    'utf8',
  );
  assert.doesNotMatch(postgresTest, /\.env\.local/);
  assert.doesNotMatch(postgresTest, /SUPABASE_DB_PASSWORD/);
  assert.doesNotMatch(postgresTest, /rejectUnauthorized\s*:\s*false/);
  assert.match(postgresTest, /relatorio-coordenacao-live-functions-20260908\.sql/);
});
