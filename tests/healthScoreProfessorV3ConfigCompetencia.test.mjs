import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  repoRoot,
  'supabase/migrations/20260728226000_health_score_v3_config_competencia_jeyson.sql',
);
const hookPath = path.join(repoRoot, 'src/hooks/useHealthScoreProfessorV3Config.ts');
const configComponentPath = path.join(
  repoRoot,
  'src/components/App/Professores/HealthScoreV3Config.tsx',
);
const segmentedGoalsComponentPath = path.join(
  repoRoot,
  'src/components/App/Professores/HealthScoreV3MetasSegmentadas.tsx',
);
const reconciliationComponentPath = path.join(
  repoRoot,
  'src/components/App/Professores/ProfessorCursoModalidadeReconciliacao.tsx',
);
const professorsPagePath = path.join(
  repoRoot,
  'src/components/App/Professores/ProfessoresPage.tsx',
);

const read = (filePath) => fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

test('migration resolve configuracao ativa pela competencia selecionada', () => {
  assert.equal(
    fs.existsSync(migrationPath),
    true,
    'deve existir migration aditiva para corrigir a resolucao por competencia',
  );
  const sql = read(migrationPath);

  assert.match(
    sql,
    /get_health_score_professor_v3_config_ui\s*\(\s*p_competencia\s+date/i,
  );
  assert.match(sql, /c\.status\s*=\s*'ativa'/i);
  assert.match(sql, /c\.vigencia_inicio\s*<=\s*v_competencia/i);
  assert.match(
    sql,
    /c\.vigencia_fim\s+is\s+null\s+or\s+c\.vigencia_fim\s*>=\s*v_competencia/i,
  );
  assert.match(sql, /'competencia_referencia'\s*,\s*v_competencia/i);
});

test('rascunho clona explicitamente a configuracao vigente exibida', () => {
  const sql = read(migrationPath);

  assert.match(
    sql,
    /criar_health_score_professor_v3_config_rascunho\s*\([\s\S]*p_config_origem_id\s+uuid/i,
  );
  assert.match(sql, /where\s+c\.id\s*=\s*p_config_origem_id/i);
  assert.match(sql, /v_origem\.status\s*<>\s*'ativa'/i);
  assert.match(sql, /'clonado_da_config_id'\s*,\s*v_origem\.id/i);
});

test('frontend envia competencia e origem sem misturar versoes', () => {
  const hook = read(hookPath);
  const page = read(professorsPagePath);

  assert.match(
    hook,
    /useHealthScoreProfessorV3Config\s*\(\s*competencia\s*:\s*string\s*,?\s*\)/,
  );
  assert.match(
    hook,
    /get_health_score_professor_v3_config_ui'[\s\S]{0,180}p_competencia:\s*competencia/,
  );
  assert.match(
    hook,
    /p_config_origem_id:\s*config\.ativa\.id/,
  );
  assert.match(page, /<HealthScoreV3Config\s+competencia=\{[\s\S]{0,100}startDate/);
});

test('configuracao vigente fica explicitamente somente leitura e destaca novo rascunho', () => {
  const source = read(configComponentPath);
  const createDraftPosition = source.indexOf('Criar rascunho');
  const weightsPosition = source.indexOf('Pesos dos pilares');

  assert.match(source, /Somente leitura/i);
  assert.match(source, /Compet.ncia selecionada/i);
  assert.ok(createDraftPosition >= 0, 'deve existir acao Criar rascunho');
  assert.ok(
    createDraftPosition < weightsPosition,
    'acao Criar rascunho deve aparecer antes da grade extensa de pesos e metas',
  );
});

test('nova vigencia sugerida parte da competencia quando a versao nao tem fim', () => {
  const source = read(configComponentPath);

  assert.match(
    source,
    /function nextValidityStart\(\s*config:\s*HealthScoreV3Config \| null,\s*competencia:\s*string/,
  );
  assert.match(
    source,
    /startOfMonth\(addMonths\(selectedCompetence,\s*1\)\)/,
  );
  assert.match(
    source,
    /nextValidityStart\(config\?\.ativa \|\| null,\s*competencia\)/,
  );
});

test('fila de excecoes mostra nome do payload Emusys junto do ID', () => {
  const sql = read(migrationPath);
  const component = read(reconciliationComponentPath);

  assert.match(sql, /payload_snapshot\s*->>\s*'nome'/i);
  assert.match(sql, /emusys_professor_nome/i);
  assert.match(
    component,
    /row\.professorNome[\s\S]{0,180}Professor Emusys #\$\{row\.emusysProfessorId\}/,
  );
});

test('resumo separa metas registradas na versao das regras aplicaveis do catalogo', () => {
  const configComponent = read(configComponentPath);
  const segmentedGoalsComponent = read(segmentedGoalsComponentPath);

  assert.match(
    configComponent,
    /metasVersionadas=\{workingConfig\.metasSegmentadas\}/,
  );
  assert.match(
    configComponent,
    /versao=\{workingConfig\.versao\}/,
  );
  assert.match(segmentedGoalsComponent, /Metas registradas na vers.o/);
  assert.match(segmentedGoalsComponent, /Regras aplic.veis do cat.logo/);
  assert.match(
    segmentedGoalsComponent,
    /metasVersionadas\.filter\(\(goal\) => goal\.estado === 'configurada'\)/,
  );
});
