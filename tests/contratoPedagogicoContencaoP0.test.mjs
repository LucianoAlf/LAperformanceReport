import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const migrationPath = 'supabase/migrations/20260715120000_contrato_pedagogico_contencao_p0.sql';
const sucessoAlunoPath = 'src/components/App/SucessoCliente/TabSucessoAluno.tsx';

const readOptional = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';

test('pente fino fica bloqueado para Fabio e disponivel para diagnostico interno', () => {
  const migration = readOptional(migrationPath);

  assert.match(migration, /revoke\s+execute[\s\S]*fabio_pente_fino_unidade[\s\S]*fabio_agent/i);
  assert.match(migration, /grant\s+execute[\s\S]*fabio_pente_fino_unidade[\s\S]*service_role/i);
  assert.doesNotMatch(migration, /grant\s+execute[\s\S]*fabio_pente_fino_unidade[\s\S]*authenticated/i);
});

test('risco atual preserva score mas declara baixa confianca', () => {
  const migration = readOptional(migrationPath);

  assert.match(migration, /create\s+or\s+replace\s+view\s+public\.vw_risco_evasao_atual/i);
  assert.match(migration, /security_invoker\s*=\s*true/i);
  assert.match(migration, /'baixa'::text\s+as\s+confianca_dado/i);
  assert.match(migration, /motivo_confianca/i);
  assert.doesNotMatch(migration, /\b(delete|truncate|update)\s+(from\s+)?public\.risco_evasao/i);
});

test('Sucesso do Aluno nao publica previsao de baixa confianca como fato', () => {
  const component = readOptional(sucessoAlunoPath);

  assert.match(component, /confianca_dado/);
  assert.match(component, /motivo_confianca/);
  assert.match(component, /Em auditoria/);
  assert.match(component, /risco_confianca\s*===\s*['"]baixa['"]/);
});
