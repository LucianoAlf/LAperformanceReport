import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const migrationPath = path.join(
  root,
  'supabase/migrations/20260804223000_health_score_v3_performance_aberta_otimizada.sql',
);

test('performance aberta compoe cada produtor canonico uma unica vez', () => {
  assert.equal(fs.existsSync(migrationPath), true, 'migration de performance ainda nao existe');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /get_health_score_professor_v3_metricas_segmentadas_agregadas_v1/i);
  assert.match(sql, /get_professor_retencao_v3_governada/i);
  assert.match(sql, /get_health_score_professor_v3_permanencia_periodo_v2/i);
  assert.match(sql, /get_health_score_professor_v3_conversao_mensal/i);
  assert.match(sql, /get_health_score_professor_v3_conversao_ciclo/i);
  assert.match(sql, /get_health_score_professor_v3_presenca_periodo_v2/i);

  assert.doesNotMatch(sql, /get_hs_prof_v3_metricas_periodo_before_temporal_fix_20260804/i);
  assert.doesNotMatch(sql, /get_health_score_prof_v3_metricas_base_20260728_c95/i);
});

test('read model limita as linhas ao escopo da unidade solicitada', () => {
  assert.equal(fs.existsSync(migrationPath), true, 'migration de performance ainda nao existe');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(
    sql,
    /where\s*\(\s*p_unidade_id\s+is\s+null\s+or\s+b\.unidade_id\s+is\s+not\s+distinct\s+from\s+p_unidade_id\s*\)/i,
  );
});

test('read model de performance tem margem de timeout somente na RPC critica', () => {
  const timeoutMigration = path.join(
    root,
    'supabase/migrations/20260804224000_health_score_v3_performance_timeout_local.sql',
  );

  assert.equal(
    fs.existsSync(timeoutMigration),
    true,
    'migration de margem local para a RPC de performance ainda nao existe',
  );

  const sql = fs.readFileSync(timeoutMigration, 'utf8');
  assert.match(
    sql,
    /alter\s+function\s+public\.get_health_score_professor_v3_performance\s*\(\s*date\s*,\s*uuid\s*,\s*text\s*\)\s+set\s+statement_timeout\s*=\s*'15s'/i,
  );
});

test('consultas consolidadas repartem a leitura canonica por unidade de forma controlada, sem concorrencia que estoure o timeout', () => {
  const performanceHook = fs.readFileSync(
    path.join(root, 'src/hooks/useHealthScoreProfessorV3Performance.ts'),
    'utf8',
  );
  const kpisVivos = fs.readFileSync(
    path.join(root, 'src/lib/kpisAlunosVivosCanonicos.ts'),
    'utf8',
  );

  assert.match(performanceHook, /from\('unidades'\)[\s\S]{0,240}eq\('ativo',\s*true\)/i);
  assert.match(performanceHook, /for\s*\(const\s+unidade\s+of\s+unidades\s*\|\|\s*\[\]\)/i);
  assert.doesNotMatch(performanceHook, /Promise\.all[\s\S]{0,320}consultarUnidade\(String\(unidade\.id\)\)/i);
  assert.match(kpisVivos, /from\('unidades'\)[\s\S]{0,240}eq\('ativo',\s*true\)/i);
  assert.match(kpisVivos, /for\s*\(const\s+unidade\s+of\s+unidades\s*\|\|\s*\[\]\)/i);
  assert.doesNotMatch(kpisVivos, /Promise\.all[\s\S]{0,320}consultarUnidade\(String\(unidade\.id\)\)/i);
});

test('Carteira usa a mesma leitura controlada de Performance e nunca dispara a RPC consolidada diretamente', () => {
  const carteira = fs.readFileSync(
    path.join(root, 'src/components/App/Professores/TabCarteiraProfessores.tsx'),
    'utf8',
  );

  assert.match(carteira, /fetchHealthScoreProfessorV3Performance/i);
  assert.doesNotMatch(
    carteira,
    /supabase\.rpc\(\s*['\"]get_health_score_professor_v3_performance['\"]/i,
  );
});

test('KPIs canônicos de alunos têm margem local contra timeout sem alterar a fonte dos dados', () => {
  const timeoutMigration = path.join(
    root,
    'supabase/migrations/20260804225000_kpis_alunos_canonicos_timeout_local.sql',
  );

  assert.equal(
    fs.existsSync(timeoutMigration),
    true,
    'migration de margem local para KPIs canônicos ainda não existe',
  );

  const sql = fs.readFileSync(timeoutMigration, 'utf8');
  assert.match(
    sql,
    /alter\s+function\s+public\.get_kpis_alunos_canonicos\s*\(\s*uuid\s*,\s*integer\s*,\s*integer\s*\)\s+set\s+statement_timeout\s*=\s*'15s'/i,
  );
});
