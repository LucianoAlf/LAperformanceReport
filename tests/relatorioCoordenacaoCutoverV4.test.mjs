import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { gerarRelatorioCoordenacaoCanonico } from '../src/lib/relatorioCoordenacaoCanonico.ts';

const modalPath = 'src/components/App/Professores/ModalRelatorioCoordenacao.tsx';
const formatterPath = 'src/lib/relatorioCoordenacaoCanonico.ts';
const edgePath = 'supabase/functions/gemini-relatorio-coordenacao/index.ts';
const migrationPath = 'supabase/migrations/20260909043050_relatorio_coordenacao_cutover_v4.sql';
const privacyMigrationPath =
  'supabase/migrations/20260909053633_relatorio_coordenacao_documentos_privados_v4.sql';
const carteiraPainelMigrationPath =
  'supabase/migrations/20260909053853_relatorio_coordenacao_carteira_espelha_painel_v4.sql';

function professor(indice, overrides = {}) {
  const nome = `Professor ${String(indice).padStart(2, '0')}`;
  const valor = 100 - indice;
  return {
    professor_id: indice,
    nome,
    score_observado: valor,
    score_comparavel: valor,
    cobertura: 100,
    comparabilidade_estado: 'comparavel',
    comparabilidade_motivo: 'criterios_atendidos',
    pilares_validos: 5,
    pilares_esperados: 5,
    operacional: {
      total_turmas: valor,
      alunos_via_turmas: valor * 2,
      turmas_elegiveis_media: valor,
      matriculas_comerciais: 20 - indice,
      matriculas_origem_completa: true,
    },
    metricas: {
      numero_alunos: { valor, amostra: 3 },
      media_turma: { valor: 2 - indice / 100, amostra: valor },
      permanencia: { valor, amostra: valor },
      retencao: { valor, amostra: valor },
      presenca: { valor, numerador: valor, denominador: 100, amostra: 100 },
      conversao: { valor, numerador: 20 - indice, denominador: 20, amostra: 20 },
    },
    ...overrides,
  };
}

function contratoV4(professores = Array.from({ length: 12 }, (_, index) => professor(index + 1))) {
  return {
    schema_version: 4,
    documento: {
      id: '40000000-0000-0000-0000-000000000001',
      versao: 2,
      hash: 'fixture-hash',
      status: 'preview',
      gerado_em: '2026-09-09T10:00:00-03:00',
    },
    periodo: {
      unidade_id: null,
      unidade_nome: 'Consolidado',
      ano: 2026,
      mes: 9,
      inicio: '2026-09-01',
      fim: '2026-11-30',
      periodicidade: 'ciclo',
      ciclo_codigo: '2026-SET-NOV',
      label: 'Set-Nov/2026',
      estado_publicacao: 'ciclo_em_acompanhamento',
      publicacao_oficial: false,
      ranking_habilitado: false,
      data_corte: '2026-09-09',
    },
    resumo_equipe: {
      total_professores: professores.length,
      comparaveis: professores.length,
      em_maturacao: 0,
      sem_base_operacional: 0,
      score_medio_comparavel: 92.5,
    },
    professores,
    presenca: {
      presenca_media: 92.5,
      professores_com_evidencia: professores.length,
      pendencias: 0,
      eventos_elegiveis: 1200,
      presencas_confirmadas: 1110,
    },
    carteira_carga: {
      alunos_na_carteira: 1110,
      professores_com_carteira_observada: professores.length,
      media_por_professor: 92.5,
      total_turmas_operacionais: 1110,
      ocupacoes_elegiveis: 2220,
      turmas_elegiveis: 1110,
      media_alunos_turma: 2,
    },
    retencao_permanencia: {
      retencao_media: 92.5,
      professores_com_retencao: professores.length,
    },
    saidas_retencao: {
      evasoes_validas: 1,
      nao_renovacoes_validas: 0,
      saidas_validas_total: 1,
      saidas_atribuiveis_professor: 0,
      mrr_perdido_total: null,
      mrr_perdido_atribuivel: 0,
      valores_mrr_pendentes: 1,
      valores_mrr_atribuiveis_pendentes: 0,
      movimentos: [{
        id: 1,
        data: '2026-09-08',
        tipo: 'evasao',
        aluno_nome: 'Aluno sem valor',
        professor_id: null,
        professor_nome: null,
        motivo: 'Mudanca de endereco',
        valor_mrr: null,
        conta_score_professor: false,
      }],
    },
    ranking_oficial: null,
    qualidade_dados: {},
  };
}

function bloco(texto, inicio, fim) {
  const start = texto.indexOf(inicio);
  assert.notEqual(start, -1, `bloco ${inicio} deve existir`);
  const end = fim ? texto.indexOf(fim, start + inicio.length) : texto.length;
  return texto.slice(start, end === -1 ? texto.length : end);
}

test('os cinco consumidores leem o documento V4 e nao recompõem o V3 no clique', () => {
  const modal = fs.readFileSync(modalPath, 'utf8');
  const edge = fs.readFileSync(edgePath, 'utf8');
  const migration = fs.readFileSync(migrationPath, 'utf8');

  assert.match(modal, /get_relatorio_coordenacao_documento_v4/);
  assert.doesNotMatch(modal, /get_relatorio_coordenacao_canonico_v3/);
  assert.match(edge, /get_relatorio_coordenacao_documento_v4_por_id/);
  assert.doesNotMatch(edge, /get_relatorio_coordenacao_canonico_v3/);
  assert.match(edge, /schema_version\s*!==\s*4/);
  assert.match(migration, /get_relatorio_coordenacao_canonico_v3[\s\S]*get_relatorio_coordenacao_documento_v4/);
});

test('modal fixa a identidade do documento também no relatório narrativo', () => {
  const modal = fs.readFileSync(modalPath, 'utf8');
  const edge = fs.readFileSync(edgePath, 'utf8');

  assert.match(modal, /documento_id:\s*documento\.documento\.id/);
  assert.match(modal, /responseIA\.documento_id\s*!==\s*documento\.documento\.id/);
  assert.match(edge, /documento_id/);
  assert.match(edge, /contrato\.documento\?\.id/);
});

test('ciclo abre exatamente a competencia selecionada na tela mesmo no inicio do mes', () => {
  const modal = fs.readFileSync(modalPath, 'utf8');

  assert.match(
    modal,
    /function deveAbrirMesAnterior\([\s\S]*periodicidade:\s*'mensal'\s*\|\s*'ciclo'[\s\S]*periodicidade\s*!==\s*'mensal'[\s\S]*return false/,
  );
  assert.equal(
    [...modal.matchAll(/deveAbrirMesAnterior\(ano, mes, periodicidade\)/g)].length,
    3,
  );
});

test('documentos da coordenacao nao podem ser lidos nem alterados direto na tabela', () => {
  assert.equal(fs.existsSync(privacyMigrationPath), true);
  const migration = fs.readFileSync(privacyMigrationPath, 'utf8');

  assert.match(migration, /as\s+restrictive\s+for\s+all\s+to\s+anon\s*,\s*authenticated/i);
  assert.match(migration, /dominio\s+not\s+in\s*\([\s\S]*relatorio_coordenacao[\s\S]*relatorio_coordenacao_ciclo/i);
  assert.match(migration, /with\s+check/i);
});

test('carteira do documento e copiada do mesmo leitor exibido no painel', () => {
  assert.equal(fs.existsSync(carteiraPainelMigrationPath), true);
  const migration = fs.readFileSync(carteiraPainelMigrationPath, 'utf8');

  assert.match(migration, /get_health_score_professor_v3_performance_snapshot_v3/i);
  assert.match(migration, /where\s+p\.metrica\s*=\s*'numero_alunos'/i);
  assert.match(migration, /jsonb_object_agg[\s\S]*professor_id/i);
  assert.match(migration, /\{carteira_carga,alunos_na_carteira\}/i);
  assert.match(migration, /\{carteira_carga,media_por_professor\}/i);
});

test('schema V4 gera ordem diagnostica completa no ciclo aberto sem ranking oficial', () => {
  const texto = gerarRelatorioCoordenacaoCanonico({
    tipo: 'ranking',
    contrato: contratoV4(),
    dataGeracao: new Date('2026-09-09T12:00:00-03:00'),
  });

  assert.match(texto, /Ciclo em acompanhamento/i);
  assert.match(texto, /ORDEM DO PAINEL.*LEITURA DIAGNÓSTICA/i);
  assert.match(texto, /1\. Professor 01.*99,0 pontos/);
  assert.match(texto, /12\. Professor 12.*88,0 pontos/);
  assert.doesNotMatch(texto, /RANKING OFICIAL DO CICLO/i);
});

test('todos os destaques usam Top 10, inclusive carteira e volume de turmas', () => {
  const contrato = contratoV4();
  const ranking = gerarRelatorioCoordenacaoCanonico({ tipo: 'ranking', contrato });
  const carteira = gerarRelatorioCoordenacaoCanonico({ tipo: 'carteira', contrato });
  const retencao = gerarRelatorioCoordenacaoCanonico({ tipo: 'retencao', contrato });

  for (const trecho of [
    bloco(ranking, 'MAIOR CARTEIRA', 'MÉDIA DE ALUNOS'),
    bloco(ranking, 'MATRICULADOR', 'CONVERSÃO DE EXPERIMENTAIS'),
    bloco(carteira, 'MAIORES CARTEIRAS', 'MAIOR VOLUME DE TURMAS'),
    bloco(carteira, 'MAIOR VOLUME DE TURMAS', 'MÉDIAS QUE PEDEM'),
  ]) {
    assert.match(trecho, /10\. Professor 10/);
    assert.doesNotMatch(trecho, /Professor 11|Professor 12/);
  }

  const retencaoAbaixo = bloco(
    retencao,
    'RETENÇÃO ABAIXO DE 100%',
    'A movimentação total',
  );
  assert.match(retencaoAbaixo, /10\. Professor 03/);
  assert.doesNotMatch(retencaoAbaixo, /\n11\.|\n12\./);

  for (const path of [formatterPath, edgePath]) {
    const source = fs.readFileSync(path, 'utf8');
    assert.match(source, /LIMITE_DESTAQUES_POR_INDICADOR\s*=\s*10/);
  }
});

test('Matriculador nao publica professor com zero ou origem incompleta', () => {
  const contrato = contratoV4([
    professor(1, { operacional: { matriculas_comerciais: 6, matriculas_origem_completa: true } }),
    professor(2, { operacional: { matriculas_comerciais: 0, matriculas_origem_completa: true } }),
    professor(3, { operacional: { matriculas_comerciais: null, matriculas_origem_completa: false } }),
  ]);
  const texto = gerarRelatorioCoordenacaoCanonico({ tipo: 'ranking', contrato });
  const matriculador = bloco(texto, 'MATRICULADOR', 'CONVERSÃO DE EXPERIMENTAIS');

  assert.match(matriculador, /Professor 01.*6 matrículas/);
  assert.doesNotMatch(matriculador, /Professor 02|Professor 03|0 matrículas/);
});

test('valor monetario ausente permanece ausente e informa a cobertura', () => {
  const texto = gerarRelatorioCoordenacaoCanonico({
    tipo: 'retencao',
    contrato: contratoV4(),
  });

  assert.match(texto, /MRR perdido total: \*Valor não informado\*/);
  assert.match(texto, /Movimentações com valor não informado: \*1\*/);
  assert.match(texto, /Aluno sem valor[\s\S]*MRR perdido: Valor não informado/);
  assert.doesNotMatch(texto, /Aluno sem valor[\s\S]{0,300}MRR perdido: R\$ 0,00/);
});

test('texto entregue a coordenacao nao vaza termos de implementacao', () => {
  const contrato = contratoV4([
    professor(1),
    professor(2, {
      comparabilidade_estado: 'em_maturacao',
      score_comparavel: null,
      score_observado: 85,
      cobertura: 40,
      comparabilidade_motivo: 'sem_pilares_validos_em_auditoria',
      pilares_validos: 2,
      pilares_esperados: 5,
    }),
  ]);

  for (const tipo of ['ranking', 'carteira', 'presenca', 'retencao']) {
    const texto = gerarRelatorioCoordenacaoCanonico({ tipo, contrato });
    assert.doesNotMatch(texto, /can[oô]nic|auditoria|snapshot|\bRPC\b|migration|pilar/i);
  }
});

test('nomes proprios do negocio nao sao bloqueados nem reescritos', () => {
  const contrato = contratoV4([
    professor(1, { nome: 'Pilar Auditora' }),
  ]);
  contrato.periodo.unidade_nome = 'Escola Pilar';
  contrato.saidas_retencao.movimentos[0].aluno_nome = 'Canonica Pilar';

  const ranking = gerarRelatorioCoordenacaoCanonico({ tipo: 'ranking', contrato });
  const retencao = gerarRelatorioCoordenacaoCanonico({ tipo: 'retencao', contrato });

  assert.match(ranking, /Pilar Auditora/);
  assert.match(ranking, /Escola Pilar/i);
  assert.match(retencao, /Canonica Pilar/);
});

test('cutover agenda atualizacao diaria por escopo sem depender do leitor publico', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8');

  assert.match(migration, /executar_relatorio_coordenacao_documento_v4_diario/);
  assert.match(migration, /materializar_relatorio_coordenacao_documento_v4/);
  assert.match(migration, /relatorio-coordenacao-v4-unidade-/);
  assert.match(migration, /relatorio-coordenacao-v4-consolidado/);
  assert.match(migration, /cron\.schedule/);
  assert.match(migration, /'mensal'/);
  assert.match(migration, /'ciclo'/);
});
