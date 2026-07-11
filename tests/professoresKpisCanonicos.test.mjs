import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const migrationPath = 'supabase/migrations/20260711194341_kpis_professores_canonicos.sql';
const conversionMigrationPath = 'supabase/migrations/20260711195600_kpis_professores_conversao_canonica.sql';
const performancePath = 'src/components/App/Professores/TabPerformanceProfessores.tsx';
const modalPath = 'src/components/App/Professores/ModalDetalhesProfessorPerformance.tsx';
const edgePath = 'supabase/functions/gemini-relatorio-coordenacao/index.ts';

const readOptional = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';

test('migration define uma unica fonte canonica por competencia', () => {
  const migration = readOptional(migrationPath);

  assert.match(migration, /get_kpis_professor_periodo_canonico/i);
  assert.match(migration, /turmas_elegiveis_media/i);
  assert.match(migration, /is_projeto_banda/i);
  assert.match(migration, /coalesce\s*\(\s*a\.data_matricula[\s\S]*?\)\s*<=\s*v_fim/i);
  assert.match(migration, /data_saida\s+is\s+null\s+or\s+.*data_saida\s*>\s*v_fim/i);
  assert.match(migration, /get_dados_relatorio_coordenacao_legado/i);
  assert.match(migration, /get_kpis_professor_periodo_canonico/i);
});

test('ocupacao deduplica aluno dentro da turma sem perder segunda turma regular', () => {
  const migration = readOptional(migrationPath);

  assert.match(migration, /pessoa_chave/i);
  assert.match(migration, /turma_chave/i);
  assert.match(migration, /ocupacao_chave/i);
  assert.match(migration, /count\s*\(\s*distinct\s+.*ocupacao_chave/i);
});

test('conversao do professor usa a conciliacao canonica do Emusys', () => {
  const migration = readOptional(conversionMigrationPath);

  assert.match(migration, /get_experimentais_professor_canonicos_v1/i);
  assert.match(migration, /realizadas_emusys/i);
  assert.match(migration, /matriculas_pos_exp/i);
});

test('tela e modal consomem competencia e denominador canonicos', () => {
  const performance = readOptional(performancePath);
  const modal = readOptional(modalPath);

  assert.match(performance, /get_kpis_professor_periodo_canonico/);
  assert.match(performance, /turmas_elegiveis_media/);
  assert.match(modal, /turmas_elegiveis_media/);
  assert.match(modal, /\[competenciaInicial,\s*open,\s*professor\?\.id\]/);
});

test('relatorio com IA prioriza health score canonico', () => {
  const edge = readOptional(edgePath);

  assert.match(edge, /health_score/);
  assert.match(edge, /health_status/);
  assert.match(edge, /Number\.isFinite/);
});
