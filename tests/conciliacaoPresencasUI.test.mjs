import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const componentPath = 'src/components/App/Alunos/ConciliacaoPresencas.tsx';
const parentPath = 'src/components/App/Alunos/ConciliacaoMatriculas.tsx';
const readOptional = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';

test('fila de presencas possui contador visivel e agrupamento por aula', () => {
  const component = readOptional(componentPath);

  assert.ok(component, 'componente de conciliacao de presencas ainda nao existe');
  assert.match(component, /Presen[cç]as a confirmar/i);
  assert.match(component, /total_alunos_pendentes/i);
  assert.match(component, /total_aulas_pendentes/i);
  assert.match(component, /ClipboardCheck/);
  assert.match(component, /Confirmar chamada/i);
});

test('fila usa RPCs auditadas para leitura, confirmacao e correcao', () => {
  const component = readOptional(componentPath);

  assert.match(component, /get_conciliacao_presencas/);
  assert.match(component, /admin_confirmar_presencas_aula/);
  assert.match(component, /admin_revisar_presenca_conciliacao/);
  assert.match(component, /Corrigir para presente/i);
  assert.match(component, /motivo/i);
});

test('conciliacao de matriculas monta a secao sem misturar atributos', () => {
  const parent = readOptional(parentPath);

  assert.match(parent, /import\s+\{\s*ConciliacaoPresencas\s*\}/);
  assert.match(parent, /<ConciliacaoPresencas\s+unidadeId=\{unidadeId\}\s*\/>/);
});
