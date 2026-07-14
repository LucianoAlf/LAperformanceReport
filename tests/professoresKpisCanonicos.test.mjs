import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const migrationPath = 'supabase/migrations/20260711194341_kpis_professores_canonicos.sql';
const conversionMigrationPath = 'supabase/migrations/20260711195600_kpis_professores_conversao_canonica.sql';
const totalsMigrationPath = 'supabase/migrations/20260711213000_totais_professores_canonicos.sql';
const carteiraHistoricaMigrationPath = 'supabase/migrations/20260713232404_kpis_professores_carteira_historica_canonica.sql';
const carteiraSeguraMigrationPath = 'supabase/migrations/20260713233627_kpis_professores_carteira_rpc_segura.sql';
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

  assert.match(performance, /buscarKpisProfessoresCanonicos/);
  assert.match(performance, /turmas_elegiveis_media/);
  assert.match(modal, /turmas_elegiveis_media/);
  assert.match(modal, /\[competenciaInicial,\s*open,\s*professor\?\.id\]/);
  assert.match(modal, /formatCompetencia/);
  assert.doesNotMatch(modal, /new Date\(competencia\s*\+\s*['"]-01['"]\)/);
});

test('carteira historica usa grade Emusys e jornada ativa sem vinculo legado', () => {
  const migration = readOptional(carteiraHistoricaMigrationPath);

  assert.match(migration, /aula_alunos_emusys/i);
  assert.match(migration, /aluno_presenca/i);
  assert.match(migration, /aluno_jornada_matricula_disciplina/i);
  assert.match(migration, /status_matricula\s*=\s*'ativa'/i);
  assert.match(migration, /pessoa_chave/i);
  assert.match(migration, /turma_chave/i);
  assert.match(migration, /count\s*\(\s*distinct\s+b\.pessoa_chave\s*\)/i);
  assert.doesNotMatch(migration, /count\s*\(\s*\*\s*\)::integer\s+as\s+carteira_alunos/i);
});

test('rpc publica encapsula a carteira sem expor tabelas canonicas ao navegador', () => {
  const migration = readOptional(carteiraSeguraMigrationPath);

  assert.match(migration, /get_kpis_professor_periodo_canonico[\s\S]*security definer/i);
  assert.match(migration, /set search_path\s*=\s*public/i);
  assert.match(migration, /revoke[\s\S]*get_carteira_professor_periodo_canonica[\s\S]*authenticated/i);
  assert.match(migration, /revoke[\s\S]*get_kpis_professor_periodo_canonico_base_20260711[\s\S]*authenticated/i);
  assert.doesNotMatch(migration, /grant\s+select\s+on\s+(table\s+)?public\.aula_alunos_emusys/i);
});

test('relatorio com IA prioriza health score canonico', () => {
  const edge = readOptional(edgePath);

  assert.match(edge, /health_score/);
  assert.match(edge, /health_status/);
  assert.match(edge, /Number\.isFinite/);
});

test('totais do relatorio recomputam taxas pelos numeradores canonicos', () => {
  const migration = readOptional(totalsMigrationPath);
  assert.match(migration, /sum\s*\(\s*r\.alunos_via_turmas\s*\)/i);
  assert.match(migration, /sum\s*\(\s*r\.turmas_elegiveis_media\s*\)/i);
  assert.match(migration, /sum\s*\(\s*r\.matriculas_pos_exp\s*\)/i);
  assert.match(migration, /sum\s*\(\s*r\.experimentais\s*\)/i);
  assert.match(migration, /sum\s*\(\s*r\.renovacoes\s*\)/i);
  assert.match(migration, /sum\s*\(\s*r\.nao_renovacoes\s*\)/i);
});
