import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const componentPath = 'src/components/App/Professores/HealthScoreV3Config.tsx';
const goalsPath = 'src/components/App/Professores/HealthScoreV3MetasSegmentadas.tsx';
const hookPath = 'src/hooks/useHealthScoreProfessorV3Config.ts';
const libPath = 'src/lib/healthScoreProfessorV3.ts';
const read = (filePath) => fs.readFileSync(filePath, 'utf8');

test('laboratorio esconde a burocracia de rascunho e oferece fluxo direto', () => {
  const source = read(componentPath);

  assert.doesNotMatch(source, />\s*Criar rascunho\s*</i);
  assert.doesNotMatch(source, />\s*Somente leitura\s*</i);
  for (const label of [
    'Editar configuração',
    'Desfazer',
    'Restaurar vigente',
    'Simular',
    'Aplicar configuração',
  ]) {
    assert.match(source, new RegExp(label, 'i'));
  }
  assert.match(source, /Simulação parcial - não oficial/i);
});

test('hook encapsula a revisão interna em ações de laboratório', () => {
  const source = read(hookPath);

  assert.match(source, /startEditing:\s*\(\)\s*=>\s*Promise<void>/i);
  assert.match(source, /restore:\s*\(\)\s*=>\s*Promise<void>/i);
  assert.match(source, /apply:\s*\(configId:\s*string,\s*justificativa:\s*string\)/i);
  assert.match(source, /criar_health_score_professor_v3_config_rascunho/i);
  assert.match(source, /salvar_health_score_professor_v3_config_rascunho/i);
  assert.match(source, /simular_health_score_professor_v3_config/i);
  assert.match(source, /ativar_health_score_professor_v3_config/i);
  assert.doesNotMatch(source, /\.from\(['"]health_score_professor_v3_/i);
});

test('carteira fica em diagnosticos e fora dos sliders de nota', () => {
  const component = read(componentPath);
  const lib = read(libPath);

  assert.match(lib, /HEALTH_SCORE_V3_SCORING_METRICS[\s\S]*'presenca'/i);
  assert.doesNotMatch(
    lib.match(/HEALTH_SCORE_V3_SCORING_METRICS\s*=\s*\[[\s\S]*?\]/i)?.[0] || '',
    /'numero_alunos'/i,
  );
  assert.match(lib, /HEALTH_SCORE_V3_DIAGNOSTICS[\s\S]*'numero_alunos'/i);
  assert.match(component, /Diagnósticos/i);
  assert.match(component, /Carteira/i);
  assert.match(component, /Não altera a nota/i);
  assert.match(
    component,
    /HEALTH_SCORE_V3_SCORING_METRICS\.includes\([\s\S]{0,120}metric\.metrica/i,
  );
});

test('granularidade preserva unidade curso modalidade e cópia explícita', () => {
  const source = read(goalsPath);

  assert.match(source, /Meta média\/turma \(nota\)/i);
  assert.match(source, /Referência de carteira \(diagnóstico\)/i);
  assert.match(source, /Capacidade estimada \(fallback\)/i);
  assert.match(source, /Copiar para outra unidade/i);
  assert.match(source, /copyTargetUnitId/i);
  assert.match(source, /goal\.cursoId/i);
  assert.match(source, /goal\.modalidade/i);
});
