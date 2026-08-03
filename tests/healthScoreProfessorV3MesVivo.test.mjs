import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migrationPath = 'supabase/migrations/20260802235000_health_score_v3_nota_viva_coerente.sql';
const helperPath = 'src/lib/healthScoreProfessorV3Performance.ts';
const tabPath = 'src/components/App/Professores/TabPerformanceProfessores.tsx';
const modalPath = 'src/components/App/Professores/ModalDetalhesProfessorPerformance.tsx';

const read = (path) => fs.readFileSync(path, 'utf8');

test('mês corrente usa projeção canônica sem tocar snapshots fechados', () => {
  assert.equal(fs.existsSync(migrationPath), true, 'migration do mês vivo ainda não existe');
  const sql = read(migrationPath);

  assert.match(sql, /create or replace function public\.get_health_score_professor_v3_projecao_viva/i);
  assert.match(sql, /get_health_score_professor_v3_projecao_viva\s*\(/i);
  assert.match(sql, /get_health_score_professor_v3_projecao_viva_coerente\s*\(/i);
  assert.match(sql, /calcular_health_score_professor_v3_nota_diagnostica\s*\(/i);
  assert.match(sql, /timezone\s*\(\s*'America\/Sao_Paulo'/i);
  assert.match(sql, /estado_publicacao[\s\S]*'em_andamento'/i);
  assert.match(sql, /ranking_habilitado[\s\S]*false/i);
  assert.match(sql, /estado_publicacao\s*=\s*'oficial'[\s\S]*projecao_viva/i);
  assert.doesNotMatch(sql, /update\s+public\.health_score_professor_v3_snapshots/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.health_score_professor_v3_snapshots/i);
});

test('projecao viva reutiliza a nota segmentada e as regras do motor oficial', () => {
  const sql = read(migrationPath);

  assert.match(sql, /normalizar_health_score_professor_v3_meta_viva/i);
  assert.match(
    sql,
    /p_metrica in \('retencao', 'permanencia', 'conversao', 'presenca'\)[\s\S]*p_valor_bruto \/ nullif\(p_meta, 0\) \* 100/i,
  );
  assert.match(
    sql,
    /p_metrica = 'media_turma'[\s\S]*p_nota_segmentada/i,
  );
  assert.doesNotMatch(
    sql,
    /p_metrica = 'media_turma'[\s\S]{0,180}100::numeric \* p_valor_bruto \/ nullif\(p_meta/i,
  );
});

test('referência do mês anterior é explícita, temporária e nunca pontua', () => {
  const sql = read(migrationPath);

  assert.match(sql, /score_competencia_referencia/i);
  assert.match(sql, /score_referencia/i);
  assert.match(sql, /score_referencia_origem'[\s\S]*'competencia_anterior'/i);
  assert.match(sql, /score_operacional_origem'[\s\S]*'competencia_atual'/i);
  assert.doesNotMatch(sql, /score_referencia\s+as\s+score/i);
});

test('ACL do contrato vivo continua restrita aos papéis autenticados', () => {
  const sql = read(migrationPath);

  assert.match(sql, /revoke all on function public\.get_health_score_professor_v3_projecao_viva_coerente[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.get_health_score_professor_v3_performance[\s\S]*to authenticated, service_role/i);
  assert.match(sql, /grant execute on function public\.get_health_score_professor_v3_projecao_viva_coerente[\s\S]*to service_role/i);
});

test('frontend separa classificação do estado de publicação e explica a referência', async () => {
  const {
    normalizeHealthScoreV3PerformanceRows,
    resolveHealthScoreV3MetricDisplay,
    resolveHealthScoreV3PublicationLabel,
    resolveHealthScoreV3ScoreStatus,
  } = await import(`../${helperPath}`);

  const [snapshot] = normalizeHealthScoreV3PerformanceRows([{
    professor_id: 43,
    unidade_id: 'recreio',
    escopo: 'unidade',
    competencia: '2026-08-01',
    trimestre_inicio: '2026-06-01',
    periodicidade: 'mensal',
    periodo_inicio: '2026-08-01',
    periodo_fim: '2026-08-31',
    ciclo_codigo: 'mensal',
    estado_publicacao: 'em_andamento',
    score_exibivel: true,
    ranking_habilitado: false,
    config_versao: 4,
    revisao: 0,
    score: 84,
    cobertura: 65,
    classificacao: 'saudavel',
    estado: 'em_andamento',
    snapshot_publicavel: false,
    publicado: false,
    motivo_bloqueio: 'competencia_em_andamento',
    regra_versao_snapshot: 'health-score-professor-v3-mes-vivo-1',
    metrica: 'presenca',
    valor_bruto: 60,
    numerador: null,
    denominador: null,
    nota: null,
    peso: 10,
    peso_disponivel: false,
    peso_efetivo: 0,
    contribuicao: null,
    meta: 80,
    amostra: 0,
    estado_base: 'referencia_periodo_anterior',
    metrica_publicavel: false,
    confianca: 'referencia_historica',
    fonte: 'dados_oficiais_periodo',
    regra_versao_metrica: 'health-score-professor-v3-mes-vivo-1',
    motivo_sem_base: 'Aguardando as primeiras aulas de agosto',
    codigo_evidencia: 'referencia_periodo_anterior',
    papel: 'nota',
    detalhes: {
      referencia_temporaria: true,
      competencia_referencia: '2026-07-01',
      valor_referencia: 60,
    },
  }]);

  assert.equal(resolveHealthScoreV3ScoreStatus(snapshot), 'saudavel');
  assert.equal(resolveHealthScoreV3PublicationLabel(snapshot), 'Em andamento');
  const presence = resolveHealthScoreV3MetricDisplay(snapshot, 'presenca');
  assert.equal(presence.value, 60);
  assert.equal(presence.state, 'referencia_anterior');
  assert.equal(presence.referenceCompetence, '2026-07-01');
  assert.equal(presence.rankable, false);
});

test('tabela e modal não usam o rótulo genérico provisório', () => {
  const tab = read(tabPath);
  const modal = read(modalPath);

  assert.match(tab, /Em andamento/);
  assert.match(tab, /Base de/);
  assert.doesNotMatch(tab, />\s*provisorio\s*</i);
  assert.match(modal, /Aguardando eventos/);
  assert.match(modal, /não compõe a nota/i);
});
