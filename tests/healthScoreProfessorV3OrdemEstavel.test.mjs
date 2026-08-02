import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260802234000_health_score_v3_ordem_estavel.sql';
const helperPath = 'src/lib/healthScoreProfessorV3Performance.ts';
const tabPath = 'src/components/App/Professores/TabPerformanceProfessores.tsx';

const read = (path) => fs.readFileSync(path, 'utf8');

function snapshot({ score, scoreExibivel = score !== null, classificacao = 'saudavel' }) {
  return {
    score,
    scoreExibivel,
    classificacao,
    estadoPublicacao: 'em_andamento',
  };
}

test('tabela operacional ordena todo score visivel do maior para o menor', async () => {
  const { compareHealthScoreV3OperationalRows } = await import(`../${helperPath}`);
  const professores = [
    { nome: 'Alexandre', healthV3: snapshot({ score: 86 }) },
    { nome: 'Ana Beatriz', healthV3: snapshot({ score: 47, classificacao: 'critico' }) },
    { nome: 'Joel', healthV3: snapshot({ score: 90 }) },
    { nome: 'Caio sem base', healthV3: snapshot({ score: null, scoreExibivel: false, classificacao: null }) },
  ];

  professores.sort(compareHealthScoreV3OperationalRows);

  assert.deepEqual(
    professores.map((professor) => professor.nome),
    ['Joel', 'Alexandre', 'Ana Beatriz', 'Caio sem base'],
  );
});

test('competencia viva preserva a ultima nota valida abaixo da cobertura minima', () => {
  assert.equal(fs.existsSync(migrationPath), true, 'migration de estabilidade ainda nao existe');
  const sql = read(migrationPath);

  assert.match(sql, /create or replace function public\.get_health_score_professor_v3_performance/i);
  assert.match(sql, /referencia_score/i);
  assert.match(sql, /cobertura_minima/i);
  assert.match(sql, /p\.cobertura\s*<\s*p\.cobertura_minima/i);
  assert.match(sql, /r\.score_referencia/i);
  assert.match(sql, /estado_publicacao[\s\S]*'em_andamento'/i);
  assert.match(sql, /ranking_habilitado[\s\S]*false/i);
  assert.doesNotMatch(sql, /update\s+public\.health_score_professor_v3_snapshots/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.health_score_professor_v3_snapshots/i);
});

test('tabela nao repete estado tecnico embaixo de cada metrica', () => {
  const tab = read(tabPath);

  assert.doesNotMatch(tab, /\{stateLabel\s*&&[\s\S]{0,220}<span[^>]*>\{stateLabel\}<\/span>/i);
  assert.match(tab, /Estado:\s*<strong>\{stateLabel/i, 'estado continua disponivel no tooltip');
});
