import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

test('saude operacional expoe cobertura real por unidade sem dados pessoais', () => {
  const nomes = readdirSync(join(root, 'supabase', 'migrations'))
    .filter((nome) => /^\d+_presenca_sync_saude_operacional\.sql$/u.test(nome));
  assert.equal(nomes.length, 1);
  const sql = readFileSync(join(root, 'supabase', 'migrations', nomes[0]), 'utf8');
  const hook = readFileSync(join(root, 'src', 'hooks', 'useSaudeCrons.ts'), 'utf8');
  const tab = readFileSync(join(root, 'src', 'components', 'App', 'Automacoes', 'TabSaudeCrons.tsx'), 'utf8');

  assert.match(sql, /get_saude_cobertura_presenca_v1/u);
  assert.match(sql, /lease_expirada/u);
  assert.match(sql, /tentativas_deduplicadas/u);
  assert.match(sql, /relatorio_bloqueado/u);
  assert.doesNotMatch(sql, /aluno_nome|telefone|email/u);
  assert.match(sql, /grant execute[\s\S]*authenticated/u);

  assert.match(hook, /get_saude_cobertura_presenca_v1/u);
  assert.match(hook, /coberturaPresenca/u);
  assert.match(tab, /Cobertura canônica de presença/u);
  assert.match(tab, /Relatório bloqueado/u);
  assert.match(tab, /Lease expirado/u);
  assert.match(tab, /deduplicada/u);
});
