import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const schemaMigration =
  'supabase/migrations/20260719120000_health_score_v3_ciclos_publicacao_parcial.sql';
const metricsMigration =
  'supabase/migrations/20260719121000_health_score_v3_metricas_periodicas.sql';
const materializerGuardMigration =
  'supabase/migrations/20260719121700_health_score_v3_materializador_guard.sql';
const readModelMigration =
  'supabase/migrations/20260719122000_health_score_v3_readmodels_cutover.sql';
const carteiraCorrectionMigration =
  'supabase/migrations/20260719123000_health_score_v3_carteira_canonica_periodo.sql';
const optimizedMetricsMigration =
  'supabase/migrations/20260719123500_health_score_v3_metricas_periodo_otimizada.sql';
const partialObservedReadModelMigration =
  'supabase/migrations/20260719143000_health_score_v3_parcial_observado_readmodels.sql';
const partialPresenceFallbackMigration =
  'supabase/migrations/20260719150000_health_score_v3_presenca_parcial_canonica.sql';
const presencePublicationPolicyMigration =
  'supabase/migrations/20260719153000_presenca_publicavel_respeita_politica_unidade.sql';
const periodsHelper = 'src/lib/healthScoreProfessorV3Periodos.ts';
const performanceHook = 'src/hooks/useHealthScoreProfessorV3Performance.ts';
const modalHook = 'src/hooks/useHealthScoreProfessorV3.ts';
const performanceHelper = 'src/lib/healthScoreProfessorV3Performance.ts';
const performanceTab = 'src/components/App/Professores/TabPerformanceProfessores.tsx';
const coordinationReport = 'src/lib/relatorioCoordenacaoInstantaneo.ts';

const read = (path) => fs.readFileSync(path, 'utf8');

test('calendario V3 usa os quatro ciclos fixos aprovados', async () => {
  assert.equal(fs.existsSync(periodsHelper), true, 'helper de ciclos ainda nao existe');
  const { getHealthScoreV3Period } = await import(`../${periodsHelper}`);

  assert.deepEqual(getHealthScoreV3Period(2026, 6, 'ciclo'), {
    periodicidade: 'ciclo',
    inicio: '2026-06-01',
    fim: '2026-08-31',
    codigo: '2026-JUN-AGO',
    label: 'Jun-Ago/2026',
  });
  assert.equal(getHealthScoreV3Period(2026, 11, 'ciclo').codigo, '2026-SET-NOV');
  assert.equal(getHealthScoreV3Period(2026, 12, 'ciclo').codigo, '2026-DEZ-2027-FEV');
  assert.equal(getHealthScoreV3Period(2027, 2, 'ciclo').codigo, '2026-DEZ-2027-FEV');
  assert.equal(getHealthScoreV3Period(2027, 3, 'ciclo').codigo, '2027-MAR-MAI');

  const mensal = getHealthScoreV3Period(2026, 7, 'mensal');
  assert.equal(mensal.inicio, '2026-07-01');
  assert.equal(mensal.fim, '2026-07-31');
  assert.equal(mensal.codigo, '2026-07');
});

test('schema adiciona periodo, publicacao parcial e fechamento oficial sem reescrever legado', () => {
  assert.equal(fs.existsSync(schemaMigration), true, 'migration de ciclos ainda nao existe');
  const sql = read(schemaMigration);

  assert.match(sql, /create table if not exists public\.health_score_professor_v3_ciclos/i);
  assert.match(sql, /periodicidade[\s\S]*mensal[\s\S]*ciclo[\s\S]*legado_calendario/i);
  assert.match(sql, /periodo_inicio/i);
  assert.match(sql, /periodo_fim/i);
  assert.match(sql, /ciclo_codigo/i);
  assert.match(sql, /estado_publicacao[\s\S]*parcial[\s\S]*oficial[\s\S]*sem_base/i);
  assert.match(sql, /ranking_habilitado/i);
  assert.match(sql, /publicacao_oficial[\s\S]*false/i);
  assert.match(sql, /Jun-Ago|JUN-AGO/i);
  assert.match(sql, /Set-Nov|SET-NOV/i);
  assert.match(sql, /Dez-Fev|DEZ-[\s\S]*FEV/i);
  assert.match(sql, /Mar-Mai|MAR-MAI/i);
  assert.match(
    sql,
    /disable trigger trg_health_score_professor_v3_snapshot_imutavel[\s\S]*update public\.health_score_professor_v3_snapshots[\s\S]*enable trigger trg_health_score_professor_v3_snapshot_imutavel/i,
  );
  assert.match(sql, /2,\s*'rascunho'[\s\S]*insert into public\.health_score_professor_v3_config_metricas/i);
  assert.match(
    sql,
    /insert into public\.health_score_professor_v3_config_metricas[\s\S]*set status = 'ativa'[\s\S]*where versao = 2/i,
  );
  assert.match(
    sql,
    /simular_health_score_professor_v3_config[\s\S]*set status = 'ativa'[\s\S]*where versao = 2/i,
  );
});

test('metricas periodicas preservam fontes canonicas e regras aprovadas', () => {
  assert.equal(fs.existsSync(metricsMigration), true, 'migration de metricas ainda nao existe');
  const sql = read(metricsMigration);

  assert.match(sql, /vw_aluno_identidade_unidade_canonica/i);
  assert.match(sql, /vw_professor_periodos_efetivos_v3_sombra/i);
  assert.match(sql, /vw_aluno_presenca_semantica_v1/i);
  assert.match(sql, /aula_alunos_emusys/i);
  assert.match(sql, /movimentacoes_admin/i);
  assert.match(sql, /motivos_saida/i);
  assert.match(sql, /Desist[eê]ncia/i);
  assert.match(sql, /Des[aâ]nimo/i);
  assert.match(sql, /Insatisfa[cç][aã]o/i);
  assert.match(sql, /Abandono de Curso/i);
  assert.match(sql, /Perdeu o Interesse/i);
  assert.doesNotMatch(sql, /similarity\s*\(|levenshtein\s*\(/i);
  assert.match(sql, /exige_revisao_operacional/i);
  assert.match(sql, /Campo Grande/i);
  assert.match(sql, /Barra/i);
  assert.match(sql, /Recreio/i);
  assert.match(sql, /meta_versionada/i);
  assert.match(sql, /valor_bruto\s*\/\s*[^\n]*meta[^\n]*\*\s*100/i);
  assert.match(sql, /pr\.nome::text/i);

  const guard = read(materializerGuardMigration);
  assert.match(guard, /materializar_health_score_professor_v3_periodo/i);
  assert.match(guard, /set_config\s*\(\s*'app\.health_score_v3_mutacao_controlada'\s*,\s*'on'/i);
  assert.match(guard, /periodo_impl/i);
  assert.match(guard, /revoke all[\s\S]*periodo_impl[\s\S]*service_role/i);
});

test('numero de alunos e media por turma reutilizam a carteira canonica homologada', () => {
  assert.equal(
    fs.existsSync(carteiraCorrectionMigration),
    true,
    'migration corretiva da carteira canonica ainda nao existe',
  );
  const sql = read(carteiraCorrectionMigration);

  assert.match(sql, /get_carteira_professor_periodo_canonica/i);
  assert.match(sql, /professor_carteira_mensal_canonica/i);
  assert.match(sql, /snapshot mensal auditado no fechado/i);
  assert.match(sql, /media_fechamentos_disponiveis/i);
  assert.match(sql, /soma_ocupacoes_sobre_soma_turmas/i);
  assert.match(sql, /where b\.metrica not in \('media_turma', 'numero_alunos'\)/i);
  assert.doesNotMatch(
    sql,
    /vw_professor_periodos_efetivos_v3_sombra/i,
    'carteira atual nao pode ser inferida do historico reconstruido',
  );

  const optimized = read(optimizedMetricsMigration);
  assert.match(optimized, /get_health_score_professor_v3_carteira_periodo/i);
  assert.doesNotMatch(
    optimized,
    /-- MEDIA DE ALUNOS POR TURMA[\s\S]*aulas_emusys/i,
    'motor nao deve executar o calculo antigo antes de descartar o resultado',
  );
});

test('read models expõem parcial mas habilitam ranking somente no oficial', () => {
  assert.equal(fs.existsSync(readModelMigration), true, 'migration de read model ainda nao existe');
  const sql = read(readModelMigration);

  assert.match(sql, /get_health_score_professor_v3_performance\([\s\S]*p_periodicidade text/i);
  assert.match(sql, /get_health_score_professor_v3_snapshot_modal\([\s\S]*p_periodicidade text/i);
  assert.match(sql, /fechar_health_score_professor_v3_ciclo/i);
  assert.match(sql, /estado_publicacao = 'oficial'/i);
  assert.match(sql, /ranking_habilitado = true/i);
  assert.match(sql, /revoke all[\s\S]*from public, anon/i);
  assert.match(sql, /get_health_score_professor_v3_consumidor_pedagogico/i);
  assert.doesNotMatch(sql, /ticket|mrr|valor_parcela/i);
});

test('frontend envia periodicidade e distingue score parcial de ranking oficial', () => {
  const performance = read(performanceHook);
  const modal = read(modalHook);
  const helper = read(performanceHelper);
  const tab = read(performanceTab);

  assert.match(performance, /periodicidade/i);
  assert.match(performance, /p_periodicidade:\s*periodicidade/i);
  assert.match(modal, /periodicidade/i);
  assert.match(modal, /p_periodicidade:\s*periodicidade/i);
  assert.match(helper, /estadoPublicacao/i);
  assert.match(helper, /rankingHabilitado/i);
  assert.match(helper, /scoreExibivel/i);
  assert.match(helper, /rankingHabilitado\s*&&/i);
  assert.match(tab, /Health Score parcial/i);
  assert.match(tab, /ranking[s]?[^\n]*oficial/i);
  assert.match(tab, /getHealthScoreV3Period/i);
  assert.doesNotMatch(tab, /Per[iÃ­]odo N[aÃ£]o Considerado/i);
});

test('gauge e alertas usam score parcial visivel sem liberar ranking oficial', () => {
  const tab = read(performanceTab);
  const alertasBlock = tab.slice(
    tab.indexOf('const alertas = useMemo'),
    tab.indexOf('const rankings = useMemo'),
  );
  const equipeBlock = tab.slice(
    tab.indexOf('const healthScoreEquipe = useMemo'),
    tab.indexOf('const getStatusColor'),
  );

  assert.match(alertasBlock, /filter\(isHealthScoreV3SnapshotVisible\)/);
  assert.doesNotMatch(alertasBlock, /filter\(isHealthScoreV3SnapshotRankable\)/);
  assert.match(equipeBlock, /filter\(isHealthScoreV3SnapshotVisible\)/);
  assert.doesNotMatch(equipeBlock, /filter\(isHealthScoreV3SnapshotRankable\)/);
  assert.match(tab, /ranking[s]?[^\n]*oficial/i);
});

test('resumo V3 exclui snapshots historicos da equipe ativa', () => {
  const tab = read(performanceTab);

  assert.match(tab, /return p\.unidades\.length > 0/);
  assert.match(tab, /const healthV3SnapshotsAtivos = useMemo/i);
  assert.match(tab, /new Set\(professores\.map\(\(professor\) => professor\.id\)\)/i);
  assert.match(tab, /healthV3Snapshots\.filter\(\(snapshot\) => professoresAtivos\.has\(snapshot\.professorId\)\)/i);

  const alertasBlock = tab.slice(
    tab.indexOf('const alertas = useMemo'),
    tab.indexOf('const rankings = useMemo'),
  );
  const equipeBlock = tab.slice(
    tab.indexOf('const healthScoreEquipe = useMemo'),
    tab.indexOf('const getStatusColor'),
  );
  assert.match(alertasBlock, /healthV3SnapshotsAtivos/);
  assert.match(equipeBlock, /healthV3SnapshotsAtivos/);
});

test('read model calcula parcial observado sem alterar o gate oficial', () => {
  assert.equal(
    fs.existsSync(partialObservedReadModelMigration),
    true,
    'migration do parcial observado ainda nao existe',
  );
  const sql = read(partialObservedReadModelMigration);

  assert.match(sql, /nota_parcial_observada/i);
  assert.match(sql, /cobertura_parcial_observada/i);
  assert.match(sql, /score_parcial_observado/i);
  assert.match(sql, /estado_publicacao\s*=\s*'oficial'/i);
  assert.match(sql, /observacao_publicacao[\s\S]*em_auditoria/i);
  assert.match(sql, /m\.valor_bruto\s+is\s+not\s+null/i);
  assert.match(sql, /m\.meta_aplicada\s*>\s*0/i);
  assert.match(sql, /ranking_habilitado/i);
  assert.doesNotMatch(sql, /update\s+public\.health_score_professor_v3_snapshots/i);
});

test('presenca parcial reutiliza a camada semantica quando o roster historico nao existe', () => {
  assert.equal(
    fs.existsSync(partialPresenceFallbackMigration),
    true,
    'migration do fallback canonico de presenca ainda nao existe',
  );
  const sql = read(partialPresenceFallbackMigration);

  assert.match(sql, /get_frequencia_professor_periodo_canonica_v1/i);
  assert.match(sql, /presenca_politicas_confiabilidade/i);
  assert.match(sql, /exige_revisao_operacional\s*=\s*false/i);
  assert.match(sql, /vw_health_score_professor_v3_parcial_operacional/i);
  assert.match(sql, /presenca-sem-roster-historico-v1/i);
  assert.match(sql, /get_health_score_professor_v3_performance/i);
  assert.match(sql, /get_health_score_professor_v3_snapshot_modal/i);
  assert.doesNotMatch(sql, /update\s+public\.health_score_professor_v3_snapshot_metricas/i);
  assert.doesNotMatch(sql, /update\s+public\.health_score_professor_v3_snapshots/i);
});

test('publicacao da presenca respeita a politica versionada da unidade', () => {
  assert.equal(
    fs.existsSync(presencePublicationPolicyMigration),
    true,
    'migration da politica de publicacao da presenca ainda nao existe',
  );
  const sql = read(presencePublicationPolicyMigration);

  assert.match(sql, /get_frequencia_professor_periodo_publicavel_v1/i);
  assert.match(sql, /presenca_politicas_confiabilidade/i);
  assert.match(sql, /p\.exige_revisao_operacional\s*=\s*false/i);
  assert.match(sql, /p\.data_inicio\s*<=\s*r\.data_fim/i);
  assert.match(sql, /p\.data_fim\s*>=\s*r\.data_inicio/i);
  assert.match(sql, /f\.confianca_presenca\s*=\s*'alta'\s+and\s+f\.politica_publicavel/i);
});

test('relatorio da coordenacao recebe snapshot V3 e nao recalcula Health Score', () => {
  const source = read(coordinationReport);

  assert.match(source, /healthV3/i);
  assert.match(source, /estadoPublicacao/i);
  assert.match(source, /rankingHabilitado/i);
  assert.match(source, /parcial/i);
  assert.doesNotMatch(source, /calcularHealthScore\s*\(/i);
});

test('relatorio instantaneo aceita o payload snake_case produzido pelo modal', () => {
  const source = read(coordinationReport);

  assert.match(source, /item\.health_score_v3\s*\?\?\s*item\.healthV3/i);
  assert.match(source, /score_exibivel\s*\?\?\s*healthV3Raw\.scoreExibivel/i);
  assert.match(source, /estado_publicacao\s*\?\?\s*healthV3Raw\.estadoPublicacao/i);
  assert.match(source, /ranking_habilitado\s*\?\?\s*healthV3Raw\.rankingHabilitado/i);
});
