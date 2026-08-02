import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const configPath = 'src/components/App/Professores/HealthScoreV3Config.tsx';
const modalPath = 'src/components/App/Professores/ModalDetalhesProfessorPerformance.tsx';
const performancePath = 'src/components/App/Professores/TabPerformanceProfessores.tsx';
const hookPath = 'src/hooks/useProfessorCursoModalidadeReconciliacao.ts';
const reconciliationMigrationPath =
  'supabase/migrations/20260802220000_professor_curso_modalidade_excecoes_ativos_v3.sql';
const read = (path) => fs.readFileSync(path, 'utf8');

test('configuracao permite ajuste direto sem expor rascunho ou etapa de desbloqueio', () => {
  const source = read(configPath);

  assert.doesNotMatch(source, /Configura[cç][aã]o vigente protegida/i);
  assert.doesNotMatch(source, /Editar configura[cç][aã]o/i);
  assert.doesNotMatch(source, /laborat[oó]rio/i);
  assert.match(source, /const editable = Boolean\(workingConfig\)/);
  assert.match(source, /ensureEditableConfig/);
});

test('modal usa formatador seguro compartilhado para dados incompletos', () => {
  const source = read(modalPath);

  assert.match(source, /formatHealthScoreV3BaseNumber/);
  assert.doesNotMatch(source, /function formatV3BaseNumber/);
});

test('badge principal preserva o score compacto e informa o estado da competência fora dele', () => {
  const source = read(performancePath);

  assert.match(source, /Health Score em andamento usa os dados já disponíveis da competência/);
  assert.match(source, /resolveHealthScoreV3PublicationLabel/);
  assert.doesNotMatch(
    source,
    /professor\.healthV3\?\.estadoPublicacao === 'parcial'[\s\S]{0,250}>parcial<\/span>/,
  );
});

test('fila de conciliacao descarta professor globalmente inativo sem hardcode de pessoa', () => {
  assert.equal(fs.existsSync(reconciliationMigrationPath), true);
  const migration = read(reconciliationMigrationPath);
  const hook = read(hookPath);

  assert.match(migration, /get_professor_curso_modalidade_excecoes_v3/);
  assert.match(migration, /left join public\.professores professor/);
  assert.match(migration, /excecao\.professor_id is null[\s\S]*professor\.ativo is true/i);
  assert.match(migration, /security\s+definer/i);
  assert.match(migration, /revoke\s+all[\s\S]*from\s+public\s*,\s*anon/i);
  assert.match(hook, /get_professor_curso_modalidade_excecoes_v3/);
  assert.doesNotMatch(hook, /\.from\s*\(/);
  assert.doesNotMatch(`${migration}\n${hook}`, /Juliana|professor_id\s*=\s*44/i);
});
