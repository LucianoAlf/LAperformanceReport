import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(path, 'utf8');

test('serializador de IA preserva snapshot V3 e estados sem base', () => {
  const source = read('src/lib/healthScoreProfessorV3Performance.ts');

  assert.match(source, /export function serializeHealthScoreV3ForAi/);
  assert.match(source, /estado_publicacao/);
  assert.match(source, /ranking_habilitado/);
  assert.match(source, /motivo_sem_base/);
  assert.match(source, /valor_bruto/);
  assert.match(source, /metrica_publicavel/);
});

test('relatorio e insights individuais recebem V3 sem recalcular a V2', () => {
  const modal = read('src/components/App/Professores/ModalDetalhesProfessorPerformance.tsx');
  const insightsBlock = modal.slice(
    modal.indexOf('const gerarInsightsIA'),
    modal.indexOf('const gerarRelatorioIndividual'),
  );
  const reportBlock = modal.slice(
    modal.indexOf('const gerarRelatorioIndividual'),
    modal.indexOf('const copiarRelatorio'),
  );

  assert.match(modal, /serializeHealthScoreV3ForAi/);
  assert.match(modal, /health_score_v3/);
  assert.doesNotMatch(insightsBlock, /calcularHealthScore\s*\(/);
  assert.doesNotMatch(reportBlock, /calcularHealthScore\s*\(/);
});

test('relatorio da coordenacao deriva totais das mesmas linhas canonicas dos professores', () => {
  const modal = read('src/components/App/Professores/ModalRelatorioCoordenacao.tsx');

  assert.match(modal, /const totaisCanonicos = calcularTotaisRelatorioCoordenacao\(kpisCanonicos\)/);
  assert.match(modal, /totais:\s*\{[\s\S]*\.\.\.totaisCanonicos/);
  assert.match(modal, /fonte_totais:\s*'kpis_professores_canonicos'/);
  assert.match(modal, /kpi\.presenca_publicavel[\s\S]*kpi\.presenca_eventos_confirmados\s*>\s*0/);
  assert.match(modal, /Number\(kpi\.media_presenca\)\s*\*\s*kpi\.presenca_eventos_confirmados/);
  assert.match(modal, /media_presenca:\s*totalEventosPresenca\s*>\s*0/);
});

test('relatorio IA usa presenca operacional canonica e pondera pelos eventos confirmados', () => {
  const edge = read('supabase/functions/gemini-relatorio-coordenacao/index.ts');

  assert.match(edge, /p\.presenca_publicavel\s*===\s*true/);
  assert.match(edge, /p\.presenca_eventos_confirmados/);
  assert.match(edge, /p\.media_presenca\s*\*\s*p\.presenca_eventos_confirmados/);
  assert.doesNotMatch(edge, /presenca\?\.metrica_publicavel\s*\?\s*presenca\.valor_bruto/);
});

test('relatorio instantaneo calcula presenca da equipe pelo total de eventos', async () => {
  const { calcularResumoRelatorioCoordenacao } = await import(
    '../src/lib/relatorioCoordenacaoInstantaneo.ts'
  );
  const base = {
    total_alunos: 1,
    total_turmas: 1,
    alunos_via_turmas: 1,
    turmas_elegiveis_media: 1,
    evasoes_mes: 0,
    nao_renovacoes_mes: 0,
    mrr_perdido: 0,
    experimentais: 0,
    matriculas_pos_exp: 0,
    taxa_retencao: 100,
    presenca_publicavel: true,
    presenca_eventos_incertos: 0,
  };
  const resumo = calcularResumoRelatorioCoordenacao([
    { ...base, taxa_presenca: 50, presenca_eventos_confirmados: 10 },
    { ...base, taxa_presenca: 100, presenca_eventos_confirmados: 90 },
  ]);

  assert.equal(resumo.mediaPresenca, 95);
});

test('Analytics exclui vinculo historico e pondera presenca por eventos confirmados', async () => {
  const {
    calcularPresencaMediaConfirmada,
    filtrarKpisPorVinculosAtivos,
  } = await import('../src/lib/professoresKpisAgregados.ts');
  const linhas = [
    { professor_id: 1, unidade_id: 'barra', presenca_publicavel: true, media_presenca: 50, presenca_eventos_confirmados: 10 },
    { professor_id: 2, unidade_id: 'recreio', presenca_publicavel: true, media_presenca: 100, presenca_eventos_confirmados: 90 },
    { professor_id: 3, unidade_id: 'campo-grande', presenca_publicavel: true, media_presenca: 100, presenca_eventos_confirmados: 100 },
  ];
  const ativas = filtrarKpisPorVinculosAtivos(
    linhas,
    new Set([1, 2, 3]),
    new Set(['1:barra', '2:recreio']),
  );

  assert.deepEqual(ativas.map((linha) => linha.professor_id), [1, 2]);
  assert.equal(calcularPresencaMediaConfirmada(ativas), 95);
  assert.equal(calcularPresencaMediaConfirmada([{ ...linhas[0], presenca_publicavel: false }]), null);
});

test('geradores pedagogicos consomem V3 e nao recalculam Health Score legado', () => {
  const paths = [
    'supabase/functions/gemini-relatorio-professor-individual/index.ts',
    'supabase/functions/gemini-relatorio-coordenacao/index.ts',
    'supabase/functions/gemini-insights-professor/index.ts',
    'supabase/functions/gemini-insights-equipe/index.ts',
  ];

  for (const path of paths) {
    const source = read(path);
    assert.match(source, /health_score_v3/i, path);
    assert.match(source, /estado_publicacao/i, path);
    assert.match(source, /sem_base/i, path);
    assert.doesNotMatch(source, /function calcularHealthScore\s*\(/i, path);
  }
});

test('ranking V3 falha fechado enquanto o ciclo nao for oficial', () => {
  const source = read('supabase/functions/gemini-ranking-professores/index.ts');

  assert.match(source, /ranking_habilitado/i);
  assert.match(source, /estado_publicacao\s*!==\s*['"]oficial['"]/i);
  assert.doesNotMatch(source, /function calcularHealthScore\s*\(/i);
});

test('configuracao V2 fica somente leitura durante a observacao V3', () => {
  const source = read('src/components/App/Professores/ProfessoresPage.tsx');

  assert.match(source, /<HealthScoreConfig[\s\S]*?readOnly/);
  assert.match(source, /Hist[oó]rico V2/i);
});

test('Dashboard e Analytics usam snapshots V3 sem habilitar ranking parcial', () => {
  const dashboard = read('src/components/App/Dashboard/DashboardPage.tsx');
  const analytics = read('src/components/GestaoMensal/TabProfessoresNew.tsx');

  assert.match(dashboard, /useHealthScoreProfessorV3Performance/);
  assert.match(dashboard, /Health Score parcial/i);
  assert.match(analytics, /useHealthScoreProfessorV3Performance/);
  assert.match(analytics, /rankingHabilitado/);
  assert.match(analytics, /Health Score parcial/i);
});

test('Dashboard e Analytics resumem somente snapshots da equipe ativa no recorte', () => {
  const dashboard = read('src/components/App/Dashboard/DashboardPage.tsx');
  const analytics = read('src/components/GestaoMensal/TabProfessoresNew.tsx');

  assert.match(dashboard, /professores_ativos_ids/);
  assert.match(dashboard, /healthScoreV3Snapshots\.filter\([\s\S]*professoresAtivos\.has\(snapshot\.professorId\)/);
  assert.match(analytics, /const healthSnapshotsEquipe = healthSnapshots\.filter/);
  assert.match(analytics, /professoresNoRecorte\.has\(snapshot\.professorId\)/);
  assert.match(analytics, /visibleHealthSnapshots = healthSnapshotsEquipe\.filter/);
  assert.match(analytics, /rankingHabilitado = healthSnapshotsEquipe\.some/);
});

test('Dashboard e Performance agregam somente KPIs de vinculos ativos', () => {
  const dashboard = read('src/components/App/Dashboard/DashboardPage.tsx');
  const performance = read('src/components/App/Professores/TabPerformanceProfessores.tsx');

  assert.match(dashboard, /filtrarKpisPorVinculosAtivos/);
  assert.match(dashboard, /const kpisProfessoresAtivos = filtrarKpisPorVinculosAtivos/);
  assert.match(performance, /filtrarKpisPorVinculosAtivos/);
  assert.match(performance, /const kpisAtivos = filtrarKpisPorVinculosAtivos/);
});

test('Analytics consulta vinculos ativos e preserva ausencia de base da presenca', () => {
  const analytics = read('src/components/GestaoMensal/TabProfessoresNew.tsx');

  assert.match(analytics, /from\('professores_unidades'\)/);
  assert.match(analytics, /\.eq\('emusys_ativo',\s*true\)/);
  assert.match(analytics, /filtrarKpisPorVinculosAtivos/);
  assert.match(analytics, /presenca_media:\s*totais\.mediaPresenca/);
  assert.match(analytics, /dados\.presenca_media\s*===\s*null\s*\?\s*'Em auditoria'/);
});

test('Analytics consulta o ciclo pela competencia selecionada sem deslocar o mes', () => {
  const analytics = read('src/components/GestaoMensal/TabProfessoresNew.tsx');

  assert.match(analytics, /const healthReferenceMonth = mes;/);
  assert.doesNotMatch(analytics, /healthPeriodicity\s*===\s*['"]ciclo['"][\s\S]{0,120}mes\s*\+\s*1/);
});

test('Carteira usa o snapshot V3 e nao recalcula o Health Score legado', () => {
  const carteira = read('src/components/App/Professores/TabCarteiraProfessores.tsx');

  assert.match(carteira, /get_health_score_professor_v3_performance/);
  assert.match(carteira, /normalizeHealthScoreV3PerformanceRows/);
  assert.match(carteira, /filtrarKpisPorVinculosAtivos/);
  assert.match(carteira, /const carteirasFinanceirasPorProfessor = new Map/);
  assert.match(carteira, /const carteirasCalculadas[^=]*= kpisData\.map/);
  assert.doesNotMatch(carteira, /const carteirasCalculadas[^=]*= \(carteiraData as any\[\]\)\.map/);
  assert.match(carteira, /estadoPublicacao/);
  assert.match(carteira, /health_score_estado_publicacao === 'parcial'/);
  assert.match(carteira, /Parcial/);
  assert.doesNotMatch(carteira, /calcularHealthScore\s*\(/);
});

test('Carteira exibe permanencia com o professor da mesma fonte V3 da Performance', () => {
  const carteira = read('src/components/App/Professores/TabCarteiraProfessores.tsx');

  assert.match(
    carteira,
    /resolveHealthScoreV3MetricDisplay\(snapshot,\s*'permanencia'\)\.value/,
  );
  assert.match(
    carteira,
    /tempo_medio_meses:\s*Number\(permanenciaV3\s*\?\?\s*row\?\.tempo_medio_meses\s*\?\?\s*0\)/,
  );
});

test('Carteira calcula ticket contratual com o mesmo denominador canonico exibido no card', () => {
  const carteira = read('src/components/App/Professores/TabCarteiraProfessores.tsx');

  assert.match(carteira, /const mrrTotal = Number\(row\?\.mrr_total \?\? 0\)/);
  assert.match(carteira, /ticket_medio:\s*totalAlunos > 0 \? mrrTotal \/ totalAlunos : 0/);
  assert.doesNotMatch(carteira, /ticket_medio:\s*Number\(row\?\.ticket_medio/);
});

test('detalhes da Carteira usam jornada canonica e nunca professor_atual_id legado', () => {
  const carteira = read('src/components/App/Professores/TabCarteiraProfessores.tsx');
  const modal = read('src/components/App/Professores/ModalCarteiraProfessor.tsx');
  const helper = read('src/lib/carteiraProfessorDetalheCanonica.ts');

  assert.match(carteira, /buscarCarteiraProfessorDetalheCanonica/);
  assert.match(modal, /buscarCarteiraProfessorDetalheCanonica/);
  assert.doesNotMatch(carteira, /\.eq\(['"]professor_atual_id['"]/);
  assert.doesNotMatch(modal, /\.eq\(['"]professor_atual_id['"]/);
  assert.match(helper, /\.rpc\(['"]get_jornada_professor['"]/);
  assert.match(helper, /emusys_aluno_id/);
  assert.match(helper, /unidade_id/);
  assert.match(helper, /new Map<string, AlunoCarteiraCanonico>/);
});

test('detalhe canonico deduplica pessoa por unidade e preserva os cursos', async () => {
  const { agruparCarteiraProfessorCanonica } = await import(
    '../src/lib/carteiraProfessorDetalheCanonica.ts'
  );
  const jornadas = [
    {
      unidade_id: 'barra', unidade_nome: 'Barra', aluno_id: 10, aluno_nome: 'Aluno A',
      emusys_aluno_id: 500, curso_id: 1, curso_nome: 'Piano', status_matricula: 'ativa',
      dia_semana: 'Segunda', horario: '14:00',
    },
    {
      unidade_id: 'barra', unidade_nome: 'Barra', aluno_id: 11, aluno_nome: 'Aluno A',
      emusys_aluno_id: 500, curso_id: 2, curso_nome: 'Canto', status_matricula: 'ativa',
      dia_semana: 'Quarta', horario: '16:00',
    },
    {
      unidade_id: 'recreio', unidade_nome: 'Recreio', aluno_id: 12, aluno_nome: 'Aluno A',
      emusys_aluno_id: 500, curso_id: 3, curso_nome: 'Bateria', status_matricula: 'ativa',
      dia_semana: 'Sexta', horario: '18:00',
    },
  ];
  const alunos = [
    { id: 10, nome: 'Aluno A', classificacao: 'EMLA', status: 'ativo' },
    { id: 11, nome: 'Aluno A', classificacao: 'EMLA', status: 'ativo' },
    { id: 12, nome: 'Aluno A', classificacao: 'EMLA', status: 'ativo' },
  ];

  const resultado = agruparCarteiraProfessorCanonica(jornadas, alunos);

  assert.equal(resultado.alunos.length, 2);
  assert.deepEqual(resultado.alunos[0].cursos_lista, ['Canto', 'Piano']);
  assert.equal(resultado.distribuicaoCursos.find((item) => item.curso === 'Piano')?.quantidade, 1);
  assert.equal(resultado.distribuicaoCursos.find((item) => item.curso === 'Canto')?.quantidade, 1);
  assert.equal(resultado.distribuicaoCursos.find((item) => item.curso === 'Bateria')?.quantidade, 1);
});

test('detalhe canonico usa a jornada ativa como status e resume LAMK EMLA das mesmas pessoas', async () => {
  const {
    agruparCarteiraProfessorCanonica,
    resumirClassificacaoCarteiraCanonica,
  } = await import('../src/lib/carteiraProfessorDetalheCanonica.ts');
  const jornadas = [
    {
      unidade_id: 'campo-grande', unidade_nome: 'Campo Grande', aluno_id: 10,
      aluno_nome: 'Aluno Kids', emusys_aluno_id: 500, curso_id: 1,
      curso_nome: 'Musicalizacao Infantil', status_matricula: 'ativa',
      dia_semana: 'Sabado', horario: '10:00',
    },
    {
      unidade_id: 'campo-grande', unidade_nome: 'Campo Grande', aluno_id: 20,
      aluno_nome: 'Aluno School', emusys_aluno_id: 600, curso_id: 2,
      curso_nome: 'Bateria', status_matricula: 'ativa',
      dia_semana: 'Segunda', horario: '14:00',
    },
  ];
  const alunos = [
    { id: 10, nome: 'Aluno Kids', classificacao: 'LAMK', status: 'trancado' },
    { id: 20, nome: 'Aluno School', classificacao: 'EMLA', status: 'ativo' },
  ];

  const resultado = agruparCarteiraProfessorCanonica(jornadas, alunos);
  const resumo = resumirClassificacaoCarteiraCanonica(resultado.alunos);

  assert.deepEqual(resultado.alunos.map((aluno) => aluno.status), ['ativo', 'ativo']);
  assert.deepEqual(resumo, {
    total: 2,
    lamk: 1,
    emla: 1,
    percentualLamk: 50,
    percentualEmla: 50,
  });
});

test('modal da Carteira calcula LAMK EMLA a partir do detalhe canonico carregado', () => {
  const modal = read('src/components/App/Professores/ModalCarteiraProfessor.tsx');

  assert.match(modal, /resumirClassificacaoCarteiraCanonica\(alunosCompletos\)/);
  assert.match(modal, /resumoClassificacao\.lamk/);
  assert.match(modal, /resumoClassificacao\.emla/);
  assert.doesNotMatch(modal, /professor\.alunos_lamk/);
  assert.doesNotMatch(modal, /professor\.alunos_emla/);
});

test('modal de turmas detalha a mesma carteira canonica sem professor_atual_id', () => {
  const modal = read('src/components/App/Professores/ModalDetalhesTurmas.tsx');

  assert.match(modal, /buscarOcupacoesTurmasProfessorCanonicas/);
  assert.doesNotMatch(modal, /\.eq\(['"]professor_atual_id['"]/);
});

test('ocupacoes canonicas deduplicam pessoa por turma e excluem projeto de banda', async () => {
  const { agruparOcupacoesTurmasProfessorCanonicas } = await import(
    '../src/lib/carteiraProfessorDetalheCanonica.ts'
  );
  const jornadas = [
    {
      unidade_id: 'barra', unidade_nome: 'Barra', aluno_id: 10, aluno_nome: 'Aluno A',
      emusys_aluno_id: 500, curso_id: 1, curso_nome: 'Piano', status_matricula: 'ativa',
      dia_semana: 'Segunda', horario: '14:00',
    },
    {
      unidade_id: 'barra', unidade_nome: 'Barra', aluno_id: 11, aluno_nome: 'Aluno A',
      emusys_aluno_id: 500, curso_id: 1, curso_nome: 'Piano', status_matricula: 'ativa',
      dia_semana: 'Segunda', horario: '14:00',
    },
    {
      unidade_id: 'barra', unidade_nome: 'Barra', aluno_id: 10, aluno_nome: 'Aluno A',
      emusys_aluno_id: 500, curso_id: 1, curso_nome: 'Piano', status_matricula: 'ativa',
      dia_semana: 'Quarta', horario: '16:00',
    },
    {
      unidade_id: 'barra', unidade_nome: 'Barra', aluno_id: 20, aluno_nome: 'Aluno B',
      emusys_aluno_id: 600, curso_id: 9, curso_nome: 'Banda', status_matricula: 'ativa',
      dia_semana: 'Sábado', horario: '09:00',
    },
  ];

  const ocupacoes = agruparOcupacoesTurmasProfessorCanonicas(jornadas, new Set([9]));

  assert.equal(ocupacoes.length, 2);
  assert.deepEqual(ocupacoes.map((row) => row.turma_chave), [
    '1:Segunda:14:00',
    '1:Quarta:16:00',
  ]);
});
