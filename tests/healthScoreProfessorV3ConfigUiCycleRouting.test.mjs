import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const hookPath = 'src/hooks/useHealthScoreProfessorV3Config.ts';
const carteiraPath = 'src/components/App/Professores/TabCarteiraProfessores.tsx';
const read = (path) => fs.readFileSync(path, 'utf8');

test('hook roteia a revisao Jun-Ago pelas RPCs governadas do ciclo aberto', () => {
  const source = read(hookPath);

  assert.match(source, /criar_health_score_professor_v3_config_revisao_ciclo_aberto/i);
  assert.match(source, /ativar_health_score_professor_v3_config_revisao_ciclo_aberto/i);
  assert.match(source, /2026-06-01/);
  assert.match(source, /2026-08-31/);
  assert.match(source, /criar_health_score_professor_v3_config_rascunho/i);
  assert.match(source, /ativar_health_score_professor_v3_config/i);
});

test('carteira declara o grao professor-aluno sem chamar vinculo de pessoa unica', () => {
  const source = read(carteiraPath);

  assert.match(source, /Vínculos em Carteira/i);
  assert.match(source, /professor-aluno canônicos/i);
  assert.doesNotMatch(source, /Alunos na Carteira/i);
  assert.doesNotMatch(source, /pessoas canônicas/i);
});
