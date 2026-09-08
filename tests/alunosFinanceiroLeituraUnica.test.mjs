import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const alunosPage = readFileSync(
  new URL('../src/components/App/Alunos/AlunosPage.tsx', import.meta.url),
  'utf8',
);
const adapter = readFileSync(
  new URL('../src/lib/faturasAlunosFinanceiras.ts', import.meta.url),
  'utf8',
);
const migration = readFileSync(
  new URL(
    '../supabase/migrations/20260908173000_alunos_financeiro_leitura_unica.sql',
    import.meta.url,
  ),
  'utf8',
);

test('lista de alunos reutiliza a inadimplencia calculada pela leitura de faturas', () => {
  assert.doesNotMatch(
    alunosPage,
    /supabase\.rpc\(\s*['"]get_inadimplencia_canonica['"]/,
  );
  assert.match(
    alunosPage,
    /faturasFinanceirasR\.inadimplenciaCanonica/,
  );
  assert.match(adapter, /inadimplenciaCanonica:\s*InadimplenciaCanonicaState/);
  assert.match(adapter, /normalizarInadimplenciaCanonica\(root\.inadimplencia_canonica\)/);
});

test('RPC de faturas publica a leitura canonica ja calculada internamente', () => {
  assert.match(migration, /get_faturas_alunos_financeiro_v1_canonica_20260817/);
  assert.match(migration, /''inadimplencia_canonica'',\s*v_canonical/);
  assert.match(migration, /return v_result \|\| jsonb_build_object/);
  assert.match(migration, /esperava exatamente um retorno v_result/);
});
