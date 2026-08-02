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
const draftValidityMigrationPath = path.join(
  repoRoot,
  'supabase/migrations/20260728227000_health_score_v3_rascunho_vigencia_colisao.sql',
);
const hookPath = path.join(repoRoot, 'src/hooks/useHealthScoreProfessorV3Config.ts');
const parserPath = path.join(repoRoot, 'src/lib/healthScoreProfessorV3.ts');
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

test('configuracao vigente fica protegida e libera o laboratorio em uma acao', () => {
  const source = read(configComponentPath);
  const editPosition = source.indexOf('Editar configuração');
  const weightsPosition = source.indexOf('Pesos dos pilares');

  assert.match(source, /Configuração vigente protegida/i);
  assert.match(source, /Compet.ncia selecionada/i);
  assert.doesNotMatch(source, />\s*Criar rascunho\s*</i);
  assert.ok(editPosition >= 0, 'deve existir acao Editar configuração');
  assert.ok(
    editPosition < weightsPosition,
    'acao Editar configuração deve aparecer antes da grade extensa de pesos e metas',
  );
});

test('nova vigencia sugerida herda o inicio da versao exibida', () => {
  const source = read(configComponentPath);

  assert.match(
    source,
    /function draftValidityStart\(\s*config:\s*HealthScoreV3Config \| null/,
  );
  assert.match(
    source,
    /return config\?\.vigenciaInicio \|\| currentMonthStart\(\)/,
  );
  assert.match(
    source,
    /draftValidityStart\(config\?\.ativa \|\| null\)/,
  );
});

test('backend preserva a guarda de vigencia sem expor burocracia no laboratorio', () => {
  assert.equal(
    fs.existsSync(draftValidityMigrationPath),
    true,
    'deve existir migration aditiva que exponha as vigencias ativas',
  );
  const sql = read(draftValidityMigrationPath);
  const parser = read(parserPath);
  const hook = read(hookPath);
  const component = read(configComponentPath);

  assert.match(sql, /'versoes_ativas'/i);
  assert.match(sql, /where\s+c\.status\s*=\s*'ativa'/i);
  assert.match(sql, /'vigencia_inicio'\s*,\s*c\.vigencia_inicio/i);
  assert.match(sql, /'vigencia_fim'\s*,\s*c\.vigencia_fim/i);
  assert.match(parser, /versoesAtivas:\s*parseHealthScoreV3ActiveVersions/);
  assert.match(hook, /startEditing\s*=\s*useCallback/);
  assert.match(hook, /createDraft\(/);
  assert.match(component, /Editar configuração/);
  assert.doesNotMatch(component, /const validityCollision = useMemo/);
  assert.doesNotMatch(component, /A data escolhida pertence à versão/);
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
