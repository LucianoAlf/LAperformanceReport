import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260802190000_health_score_v3_nota_diagnostica.sql';
const performanceParserPath = 'src/lib/healthScoreProfessorV3Performance.ts';
const sharedEdgePath = 'supabase/functions/_shared/health-score-v3.ts';

function source() {
  assert.equal(existsSync(migrationPath), true, `${migrationPath} deve existir`);
  return readFileSync(migrationPath, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\r\n]*/g, '');
}

test('carteira permanece diagnostico e nunca participa da nota', () => {
  const sql = source();

  assert.match(sql, /when\s+.*metrica\s*=\s*'numero_alunos'[\s\S]*then\s*'diagnostico'/i);
  assert.match(sql, /when\s+.*metrica\s*=\s*'numero_alunos'[\s\S]*then\s+false/i);
  assert.match(
    sql,
    /item\s*->>\s*'papel'\s*=\s*'nota'[\s\S]*item\s*->>\s*'peso_disponivel'[\s\S]*item\s*->>\s*'nota'/i,
  );
  assert.doesNotMatch(
    sql,
    /metrica\s*=\s*'numero_alunos'[\s\S]{0,350}contribuicao\s*=\s*.*peso/i,
  );
});

test('pilares aplicaveis recebem peso efetivo normalizado para cem', () => {
  const sql = source();

  assert.match(sql, /peso_efetivo\s+numeric/i);
  assert.match(
    sql,
    /100::numeric\s*\*\s*\([^)]*->>\s*'peso'[^)]*\)::numeric[\s\S]*nullif\s*\(v_peso_disponivel,\s*0\)/i,
  );
  assert.match(sql, /sum\s*\([^)]*peso_efetivo[^)]*\)[\s\S]*100/i);
});

test('conversao so pontua depois da amostra configurada', () => {
  const sql = source();

  assert.match(
    sql,
    /metrica\s*=\s*'conversao'[\s\S]*amostra[\s\S]*amostra_minima/i,
  );
  assert.match(sql, /sem_experimental_periodo/i);
  assert.match(sql, /amostra_insuficiente/i);
});

test('score parcial e ranking oficial sao decisoes separadas', () => {
  const sql = source();

  assert.match(sql, /score_exibivel[\s\S]*v_score\s+is\s+not\s+null/i);
  assert.match(
    sql,
    /'ranking_elegivel'[\s\S]*p_cobertura_minima[\s\S]*p_exige_pilar_fidelizacao/i,
  );
  assert.match(sql, /ranking_habilitado[\s\S]*false/i);
  assert.match(sql, /estado_publicacao[\s\S]*'parcial'/i);
});

test('ausencia de evidencia usa causas operacionais e nunca zero silencioso', () => {
  const sql = source();
  const expectedCodes = [
    'professor_em_maturacao',
    'amostra_insuficiente',
    'sem_experimental_periodo',
    'cobertura_presenca_insuficiente',
    'calendario_sem_aulas_elegiveis',
    'segmentacao_incompleta',
    'fonte_canonica_indisponivel',
    'metrica_nao_aplicavel',
  ];

  for (const code of expectedCodes) {
    assert.match(sql, new RegExp(code, 'i'), `codigo ${code} deve existir`);
  }

  assert.doesNotMatch(sql, /coalesce\s*\(\s*.*nota\s*,\s*0\s*\)/i);
});

test('materializacao continua append-only e nao reescreve snapshot fechado', () => {
  const sql = source();

  assert.match(sql, /insert\s+into\s+public\.health_score_professor_v3_snapshots/i);
  assert.match(sql, /snapshot_anterior_id/i);
  assert.match(sql, /estado\s*=\s*'fechado'[\s\S]*continue/i);
  assert.doesNotMatch(sql, /update\s+public\.health_score_professor_v3_snapshot_metricas/i);
});

test('read models e consumidores carregam o contrato de nota e diagnostico', () => {
  const sql = source();
  const performance = readFileSync(performanceParserPath, 'utf8');
  const sharedEdge = readFileSync(sharedEdgePath, 'utf8');

  for (const field of ['peso_efetivo', 'codigo_evidencia', 'papel']) {
    assert.match(
      sql,
      new RegExp(`returns\\s+table\\s*\\([\\s\\S]*${field}`, 'i'),
      `RPCs governadas devem devolver ${field}`,
    );
    assert.match(performance, new RegExp(field, 'i'));
    assert.match(sharedEdge, new RegExp(field, 'i'));
  }

  assert.match(performance, /pesoEfetivo/);
  assert.match(performance, /codigoEvidencia/);
  assert.match(performance, /papel/);
});
