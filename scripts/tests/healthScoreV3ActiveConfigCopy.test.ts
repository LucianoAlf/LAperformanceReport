import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const configPath =
  'src/components/App/Professores/HealthScoreV3Config.tsx';
const goalsPath =
  'src/components/App/Professores/HealthScoreV3MetasSegmentadas.tsx';

test('configuracao ativa nao conserva rotulos de rascunho', () => {
  const config = readFileSync(configPath, 'utf8');
  const goals = readFileSync(goalsPath, 'utf8');

  assert.match(config, /versionState=\{editable \? 'draft' : 'active'\}/);
  assert.match(config, /editable \? 'Rascunho' : 'Configuração ativa'/);
  assert.match(goals, /versionState:\s*'draft'\s*\|\s*'active'/);
  assert.match(goals, /versionState === 'active'\s*\? 'Metas ativas'/);
  assert.match(goals, /versionState === 'active'\s*\? 'Validada na ativação'/);
  assert.match(goals, /versionState === 'active'\s*\? 'Configuração ativa'/);
});
